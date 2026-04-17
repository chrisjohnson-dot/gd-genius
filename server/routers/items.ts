/**
 * Items router — exposes SKU dimensions/weights from the Extensiv item master.
 * All procedures are secured by x-api-key header authentication and are
 * intended for consumption by GD Robotics.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getExtensivConfigs, getExtensivConfigById, getLastSyncTimeByConfig } from "../db";
import {
  fetchCustomers,
  fetchAllFacilities,
  fetchCustomersForFacility,
  fetchItemDimsBySkus,
  clearItemDimsCache,
} from "../extensiv/api";
import type { ExtensivConfig } from "../../drizzle/schema";

// ── Shared enrichment ─────────────────────────────────────────────────────────

/**
 * Enriches a raw Extensiv config row with customers, facilities, and the
 * customerFacilities cross-reference map. Used by both listConfigs and getConfig
 * so the response shape is always identical.
 */
async function enrichConfig(config: ExtensivConfig) {
  let customers: Array<{ customerId: number; customerName: string }> = [];
  let facilities: Array<{ facilityId: number; facilityName: string }> = [];

  // Fetch customers and facilities in parallel; degrade gracefully on failure
  await Promise.all([
    fetchCustomers(config)
      .then((raw) => {
        customers = raw.map((c) => ({ customerId: c.id, customerName: c.name }));
      })
      .catch((err) => {
        console.warn(`[items] Failed to fetch customers for config ${config.id}:`, err);
      }),
    fetchAllFacilities(config)
      .then((raw) => {
        facilities = raw.map((f) => ({ facilityId: f.id, facilityName: f.name }));
      })
      .catch((err) => {
        console.warn(`[items] Failed to fetch facilities for config ${config.id}:`, err);
      }),
  ]);

  // Build customerFacilities map: for each facility, fetch which customers belong
  // to it, then invert into a per-customer list of facilityIds.
  const customerFacilityMap = new Map<number, Set<number>>();

  // Pre-seed every known customer so the map is always complete
  for (const c of customers) {
    customerFacilityMap.set(c.customerId, new Set());
  }

  if (facilities.length > 0) {
    await Promise.all(
      facilities.map(async ({ facilityId }) => {
        try {
          const facilityCustomers = await fetchCustomersForFacility(config, facilityId);
          for (const fc of facilityCustomers) {
            if (!customerFacilityMap.has(fc.id)) {
              customerFacilityMap.set(fc.id, new Set());
            }
            customerFacilityMap.get(fc.id)!.add(facilityId);
          }
        } catch (err) {
          console.warn(
            `[items] Failed to fetch customers for facility ${facilityId} in config ${config.id}:`,
            err
          );
        }
      })
    );
  }

  const customerFacilities = Array.from(customerFacilityMap.entries()).map(
    ([customerId, facilityIds]) => ({
      customerId,
      facilityIds: Array.from(facilityIds).sort((a, b) => a - b),
    })
  );

  // Fetch the most recent order sync timestamp for this config in parallel with the above
  const lastSyncedAt = await getLastSyncTimeByConfig(config.id);

  return {
    configId: config.id,
    configName: config.name,
    customers,
    facilities,
    customerFacilities,
    lastSyncedAt,   // ISO Date (or null if no orders have been synced yet)
  };
}

// ── API key middleware ─────────────────────────────────────────────────────────

/**
 * apiKeyProcedure — a publicProcedure middleware that validates the
 * x-api-key request header against the GD_ROBOTICS_API_KEY env var.
 * Returns UNAUTHORIZED if the key is missing or incorrect.
 */
const apiKeyProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const apiKey = ctx.req.headers["x-api-key"];
  const expectedKey = ENV.gdRoboticsApiKey;

  if (!expectedKey) {
    // Fail closed: if no key is configured, deny all requests
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "API key not configured on server",
    });
  }

  if (!apiKey || apiKey !== expectedKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing x-api-key header",
    });
  }

  return next({ ctx });
});

// ── Router ────────────────────────────────────────────────────────────────────

export const itemsRouter = router({
  /**
   * GET /api/trpc/items.listConfigs
   *
   * Returns all active Extensiv configs stored in GD Genius, each enriched
   * with customers, facilities, and the customerFacilities cross-reference map.
   * Use this to discover valid configId / customerId pairs before calling
   * getBySkuList or clearDimsCache.
   *
   * Authentication: x-api-key header (GD_ROBOTICS_API_KEY)
   *
   * Input:  none
   * Output: { configs: Array<EnrichedConfig> }
   *   EnrichedConfig = {
   *     configId:           number,
   *     configName:         string,
   *     customers:          Array<{ customerId: number, customerName: string }>,
   *     facilities:         Array<{ facilityId: number, facilityName: string }>,
   *     customerFacilities: Array<{ customerId: number, facilityIds: number[] }>
   *   }
   */
  listConfigs: apiKeyProcedure.query(async () => {
    const configs = await getExtensivConfigs();
    const activeConfigs = configs.filter((c) => c.isActive);
    const results = await Promise.all(activeConfigs.map(enrichConfig));
    return { configs: results };
  }),

  /**
   * GET /api/trpc/items.getConfig
   *
   * Returns a single active Extensiv config by its configId, enriched with
   * customers, facilities, and the customerFacilities cross-reference map.
   * Throws NOT_FOUND if the configId does not exist or is inactive.
   *
   * Authentication: x-api-key header (GD_ROBOTICS_API_KEY)
   *
   * Input:  { configId: number }
   * Output: EnrichedConfig (same shape as a single entry from listConfigs)
   *   {
   *     configId:           number,
   *     configName:         string,
   *     customers:          Array<{ customerId: number, customerName: string }>,
   *     facilities:         Array<{ facilityId: number, facilityName: string }>,
   *     customerFacilities: Array<{ customerId: number, facilityIds: number[] }>
   *   }
   */
  getConfig: apiKeyProcedure
    .input(z.object({ configId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config || !config.isActive) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Extensiv config ${input.configId} not found or inactive`,
        });
      }
      return enrichConfig(config);
    }),

  /**
   * POST /api/trpc/items.getBySkuList
   *
   * Returns dimensions and weight for a list of SKUs, sourced live from the
   * Extensiv item master (options.imperial fields). Results are cached per
   * Extensiv config + customer for 1 hour to avoid hammering the WMS.
   *
   * Authentication: x-api-key header (GD_ROBOTICS_API_KEY)
   *
   * Input:  { configId: number, customerId: number, skus: string[] }
   * Output: { items: Array<{ sku, lengthIn, widthIn, heightIn, weightLb }> }
   *         — null values indicate the SKU was not found in Extensiv
   */
  getBySkuList: apiKeyProcedure
    .input(
      z.object({
        configId: z.number().int().positive(),
        customerId: z.number().int().positive(),
        skus: z.array(z.string().min(1)).min(1).max(500),
      })
    )
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Extensiv config ${input.configId} not found`,
        });
      }

      const dims = await fetchItemDimsBySkus(config, input.customerId, input.skus);
      return { items: dims };
    }),

  /**
   * POST /api/trpc/items.clearDimsCache
   *
   * Evicts the in-memory dims cache so the next getBySkuList call re-fetches
   * fresh data from Extensiv. Use this after updating item dimensions in the
   * WMS without waiting for the 1-hour TTL to expire.
   *
   * Authentication: x-api-key header (GD_ROBOTICS_API_KEY)
   *
   * Input:  { configId?: number, customerId?: number }
   *         — both must be provided together to clear a specific customer's cache;
   *           omit both to flush the entire cache across all customers.
   * Output: { cleared: true, scope: "customer" | "all" }
   */
  clearDimsCache: apiKeyProcedure
    .input(
      z.object({
        configId: z.number().int().positive().optional(),
        customerId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.configId !== undefined && input.customerId !== undefined) {
        // Targeted clear: look up tplGuid for this config so the cache key matches
        const config = await getExtensivConfigById(input.configId);
        if (!config) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Extensiv config ${input.configId} not found`,
          });
        }
        clearItemDimsCache(config.tplGuid, input.customerId);
        return { cleared: true, scope: "customer" as const };
      }

      // Global clear
      clearItemDimsCache();
      return { cleared: true, scope: "all" as const };
    }),
});
