import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getExtensivConfigs,
  getExtensivConfigById,
  upsertExtensivConfig,
  deleteExtensivConfig,
  getLocationConfigs,
  getLocationConfigsByCustomer,
  upsertLocationConfig,
  deleteLocationConfig,
  deleteLocationConfigsByConfigAndCustomer,
  createAllocationRun,
  updateAllocationRun,
  getAllocationRuns,
  getAllocationRunById,
  createAllocationRunOrders,
  getAllocationRunOrders,
  updateAllocationRunOrder,
  getAllocationRunOrderById,
  deleteAllocationRun,
  createAuditLog,
  getAuditLogs,
  getCustomerRules,
  getCustomerRule,
  upsertCustomerRule,
  getScheduleConfig,
  upsertScheduleConfig,
  getAutoRunCustomers,
} from "./db";
import { startSchedule, stopSchedule, triggerManualRun } from "./scheduler/autoRun";
import { fetchCustomers, fetchOpenOrders, fetchInventory, fetchItemDescriptions, fetchOrderWithDetail, moveInventory, allocateOrder, deallocateOrder, updateOrderProposedAllocations, fetchAllFacilities, fetchCustomersForFacility, fetchExtensivLocations } from "./extensiv/api";
import { getExtensivToken, invalidateToken } from "./extensiv/client";
import { runAllocationEngine, LocationTypeMap } from "./allocation/engine";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Extensiv Config ───────────────────────────────────────────────────────
  config: router({
    list: protectedProcedure.query(async () => {
      return getExtensivConfigs();
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const config = await getExtensivConfigById(input.id);
      if (!config) throw new TRPCError({ code: "NOT_FOUND" });
      // Mask secret for frontend
      return { ...config, clientSecret: "••••••••" };
    }),

    save: protectedProcedure
      .input(
        z.object({
          id: z.number().optional(),
          name: z.string().min(1),
          clientId: z.string().min(1),
          clientSecret: z.string().min(1),
          tplGuid: z.string().min(1),
          userLoginId: z.number(),
          baseUrl: z.string().default("https://secure-wms.com"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const id = await upsertExtensivConfig(input);
        if (input.id) invalidateToken(input.clientId);
        await createAuditLog({
          userId: ctx.user.id,
          action: input.id ? "config.update" : "config.create",
          entityType: "extensiv_config",
          entityId: String(id),
          details: { name: input.name },
        });
        return { id };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteExtensivConfig(input.id);
        await createAuditLog({
          userId: ctx.user.id,
          action: "config.delete",
          entityType: "extensiv_config",
          entityId: String(input.id),
          details: {},
        });
        return { success: true };
      }),

    testConnection: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const config = await getExtensivConfigById(input.id);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        try {
          const token = await getExtensivToken(config);
          return { success: true, tokenPreview: token.substring(0, 20) + "..." };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      }),
  }),

  // ─── Location Config ───────────────────────────────────────────────────────
  locations: router({
    list: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        return getLocationConfigs(input.configId);
      }),

    listByCustomer: protectedProcedure
      .input(z.object({ configId: z.number(), customerId: z.number() }))
      .query(async ({ input }) => {
        return getLocationConfigsByCustomer(input.configId, input.customerId);
      }),

    save: protectedProcedure
      .input(
        z.object({
          id: z.number().optional(),
          configId: z.number(),
          customerId: z.number(),
          customerName: z.string().optional(),
          facilityId: z.number(),
          facilityName: z.string().optional(),
          locationId: z.number(),
          locationName: z.string(),
          locationType: z.enum(["staging", "pick_face", "warehouse"]),
        })
      )
      .mutation(async ({ input }) => {
        await upsertLocationConfig(input);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLocationConfig(input.id);
        return { success: true };
      }),

    bulkSave: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          customerId: z.number(),
          customerName: z.string().optional(),
          facilityId: z.number(),
          facilityName: z.string().optional(),
          locations: z.array(
            z.object({
              locationId: z.number(),
              locationName: z.string(),
              locationType: z.enum(["staging", "pick_face", "warehouse"]),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        await deleteLocationConfigsByConfigAndCustomer(input.configId, input.customerId);
        for (const loc of input.locations) {
          await upsertLocationConfig({
            configId: input.configId,
            customerId: input.customerId,
            customerName: input.customerName,
            facilityId: input.facilityId,
            facilityName: input.facilityName,
            locationId: loc.locationId,
            locationName: loc.locationName,
            locationType: loc.locationType,
          });
        }
        return { success: true };
      }),

    // Auto-seed location config from Extensiv locations API using pick-face prefix rules
    seedFromExtensiv: protectedProcedure
      .input(z.object({
        configId: z.number(),
        facilityId: z.number(),
        facilityName: z.string().optional(),
        // Array of customer-to-staging-prefix mappings
        // Each customer has one staging location identified by its name ending in -Stage
        customerMappings: z.array(z.object({
          customerId: z.number(),
          customerName: z.string(),
          stagingPrefixes: z.array(z.string()), // e.g. ["HR"] matches "HR-Stage", "HR001-Stage", etc.
        })),
        dryRun: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });

        // Fetch all locations from Extensiv for this facility
        const allLocations = await fetchExtensivLocations(config, input.facilityId);
        console.log(`[seedFromExtensiv] Fetched ${allLocations.length} locations from Extensiv for facility ${input.facilityId}`);

        const seeded: Array<{ customerId: number; customerName: string; locationId: number; locationName: string; locationType: string }> = [];
        const skipped: string[] = [];

        for (const loc of allLocations) {
          const locName = loc.name.trim();
          const locNameUpper = locName.toUpperCase();

          // Only process staging locations (name ends with -Stage or -Staging, case-insensitive)
          const isStagingLocation = locNameUpper.endsWith("-STAGE") || locNameUpper.endsWith("-STAGING");
          if (!isStagingLocation) {
            skipped.push(locName);
            continue;
          }

          // Match staging location to a customer by prefix
          // e.g. "HR-Stage" or "HR001-Stage" matches prefix "HR"
          let matchedCustomer: typeof input.customerMappings[0] | null = null;
          for (const mapping of input.customerMappings) {
            const matches = mapping.stagingPrefixes.some((prefix) =>
              locNameUpper.startsWith(prefix.toUpperCase())
            );
            if (matches) {
              matchedCustomer = mapping;
              break;
            }
          }

          if (matchedCustomer) {
            seeded.push({
              customerId: matchedCustomer.customerId,
              customerName: matchedCustomer.customerName,
              locationId: loc.locationId,
              locationName: locName,
              locationType: "staging",
            });
          } else {
            // No customer match — skip
            skipped.push(locName);
          }
        }

        console.log(`[seedFromExtensiv] ${seeded.length} locations to seed, ${skipped.length} skipped`);

        if (!input.dryRun) {
          for (const entry of seeded) {
            await upsertLocationConfig({
              configId: input.configId,
              customerId: entry.customerId,
              customerName: entry.customerName,
              facilityId: input.facilityId,
              facilityName: input.facilityName,
              locationId: entry.locationId,
              locationName: entry.locationName,
              locationType: entry.locationType as "pick_face" | "warehouse" | "staging",
            });
          }
        }

        return {
          success: true,
          totalLocations: allLocations.length,
          seeded: seeded.length,
          skipped: skipped.length,
          preview: seeded.slice(0, 20),
          dryRun: input.dryRun ?? false,
        };
      }),
  }),

  // ─── Extensiv Data (live from API) ─────────────────────────────────────────
  extensiv: router({
    facilities: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const facilities = await fetchAllFacilities(config);
        console.log(`[Extensiv] fetchAllFacilities returned ${facilities.length} facilities:`, JSON.stringify(facilities));
        return facilities;
      }),

    // Debug endpoint: returns raw API responses for troubleshooting
    debugRaw: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const { createExtensivClient } = await import("./extensiv/client");
        const client = createExtensivClient(config);
        const results: Record<string, unknown> = {};

        // Test 1: /properties/facilities
        try {
          results.facilities = await client.get("/properties/facilities", { pgsiz: 500 });
        } catch (err: unknown) {
          results.facilitiesError = err instanceof Error ? err.message : String(err);
        }

        // Test 2: /customers (no filter)
        try {
          results.customers = await client.get("/customers", { pgsiz: 50, pgnum: 1 });
        } catch (err: unknown) {
          results.customersError = err instanceof Error ? err.message : String(err);
        }

        // Test 3: /customers with facilityid=1 (first facility id if available)
        try {
          const facilityId = (results.facilities as { _embedded?: { "http://api.3plCentral.com/rels/properties/facility"?: Array<{id:number}> } })?._embedded?.["http://api.3plCentral.com/rels/properties/facility"]?.[0]?.id ?? 1;
          results.customersForFacility = await client.get("/customers", { pgsiz: 50, pgnum: 1, facilityid: facilityId });
          results.testedFacilityId = facilityId;
        } catch (err: unknown) {
          results.customersForFacilityError = err instanceof Error ? err.message : String(err);
        }

        return results;
      }),

    // Compact debug summary: shows processed results (not raw JSON) to diagnose filtering issues
    debugSummary: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const { createExtensivClient } = await import("./extensiv/client");
        const client = createExtensivClient(config);

        // Step 1: Raw /properties/facilities response
        let facilitiesRaw: unknown = null;
        let facilitiesError: string | null = null;
        try {
          facilitiesRaw = await client.get("/properties/facilities", { pgsiz: 500 });
        } catch (err: unknown) {
          facilitiesError = err instanceof Error ? err.message : String(err);
        }

        // Step 2: What fetchAllFacilities() returns (processed)
        let processedFacilities: Array<{id: number; name: string}> = [];
        let processedFacilitiesError: string | null = null;
        try {
          processedFacilities = await fetchAllFacilities(config);
        } catch (err: unknown) {
          processedFacilitiesError = err instanceof Error ? err.message : String(err);
        }

        // Step 3: For each processed facility, what does fetchCustomersForFacility() return?
        const customersByFacility: Record<string, Array<{id: number; name: string}>> = {};
        for (const fac of processedFacilities) {
          try {
            const custs = await fetchCustomersForFacility(config, fac.id);
            customersByFacility[`${fac.id}:${fac.name}`] = custs;
          } catch (err: unknown) {
            customersByFacility[`${fac.id}:${fac.name}`] = [];
          }
        }

        // Step 4: Raw facilities response structure summary
        const rawFacilitiesStructure = (() => {
          if (!facilitiesRaw || typeof facilitiesRaw !== 'object') return 'null or non-object';
          const r = facilitiesRaw as Record<string, unknown>;
          const keys = Object.keys(r);
          const embeddedKeys = r._embedded ? Object.keys(r._embedded as object) : [];
          const isArray = Array.isArray(r);
          // Try to extract first item
          let firstItem: unknown = null;
          const embedded = r._embedded as Record<string, unknown> | undefined;
          if (embedded) {
            for (const k of embeddedKeys) {
              const arr = embedded[k];
              if (Array.isArray(arr) && arr.length > 0) { firstItem = arr[0]; break; }
            }
          }
          if (isArray && (r as unknown as unknown[]).length > 0) firstItem = (r as unknown as unknown[])[0];
          return { topLevelKeys: keys, embeddedKeys, isArray, firstItem };
        })();

        return {
          step1_rawFacilitiesStructure: rawFacilitiesStructure,
          step1_facilitiesError: facilitiesError,
          step2_processedFacilities: processedFacilities,
          step2_processedFacilitiesError: processedFacilitiesError,
          step3_customersByFacility: customersByFacility,
        };
      }),

    // Legacy debug endpoint kept for compatibility
    facilitiesRaw: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const { createExtensivClient } = await import("./extensiv/client");
        const client = createExtensivClient(config);
        try {
          const data = await client.get("/properties/facilities", { pgsiz: 500 });
          return { ok: true, data };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, error: msg, data: null };
        }
      }),

    customersForFacility: protectedProcedure
      .input(z.object({ configId: z.number(), facilityId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        return fetchCustomersForFacility(config, input.facilityId);
      }),

    customers: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        return fetchCustomers(config);
      }),

    openOrders: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          customerId: z.number(),
          facilityId: z.number(),
        })
      )
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        return fetchOpenOrders(config, input.customerId, input.facilityId);
      }),

    // Debug: returns raw order data for a customer/facility so we can see what status/flags each order has
    debugOrders: protectedProcedure
      .input(z.object({ configId: z.number(), customerId: z.number(), facilityId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const { createExtensivClient } = await import("./extensiv/client");
        const client = createExtensivClient(config);

        type RawOrder = {
          readOnly?: { orderId?: number; status?: number; isClosed?: boolean; fullyAllocated?: boolean; creationDate?: string; facilityIdentifier?: { id?: number; name?: string } };
          referenceNum?: string;
          poNum?: string;
        };

        // Query 1: Using RQL to filter by customer — this is the correct Extensiv approach
        // rql=readonly.customerIdentifier.id==X
        let rawOrdersAll: RawOrder[] = [];
        let totalResultsAll = 0;
        let fetchErrorAll: string | null = null;
        const rql = `readonly.customerIdentifier.id==${input.customerId}`;
        try {
          const data = (await client.get("/orders", {
            pgsiz: 100,
            pgnum: 1,
            rql,
          })) as { totalResults?: number; _embedded?: { "http://api.3plCentral.com/rels/orders/order"?: RawOrder[] } };
          totalResultsAll = data?.totalResults ?? 0;
          rawOrdersAll = data?._embedded?.["http://api.3plCentral.com/rels/orders/order"] ?? [];
        } catch (err: unknown) {
          fetchErrorAll = err instanceof Error ? err.message : String(err);
        }

        // Query 2: Old approach (customerid param, /orders/summaries) — to show the difference
        let rawOrdersFiltered: RawOrder[] = [];
        let totalResultsFiltered = 0;
        let fetchErrorFiltered: string | null = null;
        try {
          const data = (await client.get("/orders/summaries", {
            pgsiz: 100,
            pgnum: 1,
            customerid: input.customerId,
          })) as { totalResults?: number; _embedded?: { "http://api.3plCentral.com/rels/orders/order"?: RawOrder[] } };
          totalResultsFiltered = data?.totalResults ?? 0;
          rawOrdersFiltered = data?._embedded?.["http://api.3plCentral.com/rels/orders/order"] ?? [];
        } catch (err: unknown) {
          fetchErrorFiltered = err instanceof Error ? err.message : String(err);
        }

        // Summarize each order's key fields (from the unfiltered query)
        const orderSummaries = rawOrdersAll.map(o => ({
          orderId: o.readOnly?.orderId,
          referenceNum: o.referenceNum,
          poNum: o.poNum,
          status: o.readOnly?.status,
          isClosed: o.readOnly?.isClosed,
          fullyAllocated: o.readOnly?.fullyAllocated,
          creationDate: o.readOnly?.creationDate,
          orderFacilityId: o.readOnly?.facilityIdentifier?.id,
          orderFacilityName: o.readOnly?.facilityIdentifier?.name,
          matchesFacility: o.readOnly?.facilityIdentifier?.id === input.facilityId,
          passesFilter: !o.readOnly?.isClosed && !o.readOnly?.fullyAllocated && (o.readOnly?.status ?? 99) <= 2,
        }));

        // Unique facility IDs seen on these orders
        const uniqueFacilityIds = Array.from(new Set(rawOrdersAll.map(o => o.readOnly?.facilityIdentifier?.id).filter(Boolean)));

        return {
          sentFacilityId: input.facilityId,
          // Without facilityid param
          totalResultsAll,
          fetchedCountAll: rawOrdersAll.length,
          fetchErrorAll,
          // With facilityid param (old approach)
          totalResultsFiltered,
          fetchedCountFiltered: rawOrdersFiltered.length,
          fetchErrorFiltered,
          // Order details
          orderSummaries,
          uniqueFacilityIds,
          passCount: orderSummaries.filter(o => o.passesFilter).length,
          failCount: orderSummaries.filter(o => !o.passesFilter).length,
          facilityMatchCount: orderSummaries.filter(o => o.matchesFacility).length,
        };
      }),

    inventory: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          customerId: z.number(),
          facilityId: z.number(),
        })
      )
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        return fetchInventory(config, input.customerId, input.facilityId);
      }),

    debugInventory: protectedProcedure
      .input(z.object({ configId: z.number(), customerId: z.number(), facilityId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const { createExtensivClient } = await import("./extensiv/client");
        const client = createExtensivClient(config);

        const endpoints = [
          { label: "itemsummaries (with facility RQL)", path: `/customers/${input.customerId}/itemsummaries`, params: { rql: `facilityIdentifier.id==${input.facilityId}`, pgsiz: 10, pgnum: 1 } },
          { label: "itemsummaries (no filter)", path: `/customers/${input.customerId}/itemsummaries`, params: { pgsiz: 10, pgnum: 1 } },
          { label: "stockdetails (RQL)", path: "/inventory/stockdetails", params: { rql: `customerIdentifier.id==${input.customerId};facilityIdentifier.id==${input.facilityId}`, pgsiz: 10, pgnum: 1 } },
          { label: "stockdetails (query params)", path: "/inventory/stockdetails", params: { customerid: input.customerId, facilityid: input.facilityId, pgsiz: 10, pgnum: 1 } },
        ];

        const results = [];
        for (const ep of endpoints) {
          try {
            const data = await client.get(ep.path, ep.params) as { totalResults?: number; _embedded?: Record<string, unknown> };
            const embedded = data?._embedded ?? {};
            const keys = Object.keys(embedded);
            const firstKey = keys[0];
            const firstArr = firstKey ? (embedded[firstKey] as unknown[]) : [];
            results.push({
              label: ep.label,
              status: "success",
              totalResults: data?.totalResults ?? 0,
              embeddedKeys: keys,
              sampleCount: Array.isArray(firstArr) ? firstArr.length : 0,
              sampleRecord: Array.isArray(firstArr) && firstArr.length > 0 ? JSON.stringify(firstArr[0]).slice(0, 400) : null,
              error: null,
            });
          } catch (err: unknown) {
            const e = err as { status?: number; message?: string; responseData?: unknown };
            results.push({
              label: ep.label,
              status: "error",
              totalResults: 0,
              embeddedKeys: [],
              sampleCount: 0,
              sampleRecord: null,
              error: `${e.status ?? "?"}: ${e.message ?? String(err)} | response: ${JSON.stringify(e.responseData ?? "").slice(0, 200)}`,
            });
          }
        }

        return results;
      }),
    debugOrderDetail: protectedProcedure
      .input(z.object({ configId: z.number(), orderId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const { getExtensivToken } = await import("./extensiv/client");
        const axios = (await import("axios")).default;
        const token = await getExtensivToken(config);
        const baseUrl = (config as { baseUrl?: string }).baseUrl || "https://secure-wms.com";
        // Fetch with all detail params
        const response = await axios.get(`${baseUrl}/orders/${input.orderId}`, {
          params: { detail: "all", itemdetail: "all" },
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/hal+json",
            "Accept-Language": "en-US,en;q=0.8",
          },
          validateStatus: () => true,
        });
        const raw = response.data as Record<string, unknown>;
        const embedded = (raw._embedded ?? {}) as Record<string, unknown>;
        const embeddedKeys = Object.keys(embedded);
        // Check all possible orderItems locations
        const directItems = Array.isArray(raw.orderItems) ? (raw.orderItems as unknown[]) : [];
        const embeddedItemKey = embeddedKeys.find(k => k.toLowerCase().includes("orderitem") || k.toLowerCase().includes("item"));
        const embeddedItems = embeddedItemKey ? (embedded[embeddedItemKey] as unknown[]) : [];
        return {
          httpStatus: response.status,
          etag: response.headers["etag"] ?? null,
          topLevelKeys: Object.keys(raw),
          embeddedKeys,
          directItemsCount: directItems.length,
          embeddedItemKey: embeddedItemKey ?? null,
          embeddedItemsCount: embeddedItems.length,
          sampleDirectItem: directItems.length > 0 ? JSON.stringify(directItems[0]).slice(0, 500) : null,
          sampleEmbeddedItem: embeddedItems.length > 0 ? JSON.stringify(embeddedItems[0]).slice(0, 500) : null,
          rawSnippet: JSON.stringify(raw).slice(0, 1000),
        };
      }),
  }),
  // ─── Allocation ───────────────────────────────────────────────────────────────────────────
  allocation: router({
    propose: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          facilityId: z.number(),
          facilityName: z.string(),
          // Multi-customer: one entry per customer
          customers: z.array(
            z.object({
              customerId: z.number(),
              customerName: z.string(),
              orderIds: z.array(z.number()),
              stagingLocationId: z.number(),
              stagingLocationName: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });

        // Run allocation engine per customer, merge all results
        const allAllocated: ReturnType<typeof runAllocationEngine>["allocatedOrders"] = [];
        const allSkipped: ReturnType<typeof runAllocationEngine>["skippedOrders"] = [];
        const allPullListItems: ReturnType<typeof runAllocationEngine>["pullList"] = [];
        const allPackListItems: ReturnType<typeof runAllocationEngine>["packList"] = [];
        const allSummaryItems: ReturnType<typeof runAllocationEngine>["allocationSummary"] = [];

        for (const customer of input.customers) {
          if (customer.orderIds.length === 0) continue;

          // Fetch orders with full detail for this customer
          const ordersWithDetail = await Promise.all(
            customer.orderIds.map((id) => fetchOrderWithDetail(config, id))
          );
          const orders = ordersWithDetail.map((o) => o.order);

          // Fetch inventory for this customer
          const inventory = await fetchInventory(config, customer.customerId, input.facilityId);

          // Fetch item descriptions for this customer
          const descMap = await fetchItemDescriptions(config, customer.customerId);

          // Build location type map from DB for this customer
          const locationConfigsData = await getLocationConfigsByCustomer(
            input.configId,
            customer.customerId
          );
          const locationTypeMap: LocationTypeMap = {};
          for (const lc of locationConfigsData) {
            locationTypeMap[lc.locationId] = lc.locationType;
          }

          // Look up per-customer rules (e.g. noLotMixing, locationPriorityPatterns)
          const customerRule = await getCustomerRule(input.configId, customer.customerId);
          const noLotMixing = customerRule?.noLotMixing ?? false;
          const locationPriorityPatterns = (customerRule?.locationPriorityPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
          // Run allocation engine for this customer
          const result = runAllocationEngine(
            orders,
            inventory,
            locationTypeMap,
            customer.stagingLocationId,
            customer.stagingLocationName,
            descMap,
            noLotMixing,
            undefined,
            undefined,
            locationPriorityPatterns
          );

          allAllocated.push(...result.allocatedOrders);
          allSkipped.push(...result.skippedOrders);
          allPullListItems.push(...result.pullList);
          allPackListItems.push(...result.packList);
          allSummaryItems.push(...result.allocationSummary);
        }

        const mergedResult = {
          allocatedOrders: allAllocated,
          skippedOrders: allSkipped,
          pullList: allPullListItems,
          packList: allPackListItems,
          allocationSummary: allSummaryItems,
        };

        const customerNames = input.customers.map((c) => c.customerName);
        const totalOrderIds = input.customers.flatMap((c) => c.orderIds);

        // Save run to DB
        const runId = await createAllocationRun({
          configId: input.configId,
          customerId: input.customers.length === 1 ? input.customers[0]!.customerId : null,
          customerName: input.customers.length === 1 ? input.customers[0]!.customerName : null,
          customerNames: JSON.stringify(customerNames),
          facilityId: input.facilityId,
          facilityName: input.facilityName,
          status: "proposed",
          orderCount: totalOrderIds.length,
          allocatedCount: allAllocated.length,
          skippedCount: allSkipped.length,
          pullList: allPullListItems as unknown as Record<string, unknown>[],
          createdBy: ctx.user.id,
        });

        // Save per-order results
        const runOrderItems = [
          ...allAllocated.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            poNum: o.poNum,
            status: "allocated" as const,
            allocationDetail: o as unknown as Record<string, unknown>,
          })),
          ...allSkipped.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            poNum: o.poNum,
            status: "skipped" as const,
            skipReason: o.skipReason,
            allocationDetail: {} as Record<string, unknown>,
          })),
        ];
         console.log(`[propose] Inserting ${runOrderItems.length} run order items (allocated: ${allAllocated.length}, skipped: ${allSkipped.length})`);
        try {
          await createAllocationRunOrders(runOrderItems);
          console.log(`[propose] Run order items inserted successfully`);
        } catch (insertErr) {
          console.error(`[propose] FAILED to insert run order items:`, insertErr);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to save order results: ${insertErr instanceof Error ? insertErr.message : String(insertErr)}` });
        }
        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.propose",
          entityType: "allocation_run",
          entityId: String(runId),
          details: {
            customers: customerNames,
            orderCount: totalOrderIds.length,
            allocated: allAllocated.length,
            skipped: allSkipped.length,
          },
        });

        return { runId, result: mergedResult };
      }),

    quickPropose: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          facilityId: z.number(),
          facilityName: z.string(),
          // Customer IDs to include — if empty, all customers with staging configs are used
          customerIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });

        // Get all location configs for this facility to find customers with staging locations
        const allLocationConfigs = await getLocationConfigs(input.configId);
        const facilityConfigs = allLocationConfigs.filter(
          (lc) => lc.facilityId === input.facilityId
        );

        // Find all customers that have a staging location configured
        const stagingByCustomer = new Map<number, { id: number; name: string; stagingLocationId: number; stagingLocationName: string }>();
        for (const lc of facilityConfigs) {
          if (lc.locationType === "staging" && !stagingByCustomer.has(lc.customerId)) {
            stagingByCustomer.set(lc.customerId, {
              id: lc.customerId,
              name: lc.customerName ?? `Customer ${lc.customerId}`,
              stagingLocationId: lc.locationId,
              stagingLocationName: lc.locationName,
            });
          }
        }

        // Filter to requested customer IDs if provided
        const targetCustomers = input.customerIds && input.customerIds.length > 0
          ? Array.from(stagingByCustomer.values()).filter((c) => input.customerIds!.includes(c.id))
          : Array.from(stagingByCustomer.values());

        if (targetCustomers.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No customers with staging locations configured for this facility. Set up Location Config first.",
          });
        }

        // Run allocation engine per customer
        const allAllocated: ReturnType<typeof runAllocationEngine>["allocatedOrders"] = [];
        const allSkipped: ReturnType<typeof runAllocationEngine>["skippedOrders"] = [];
        const allPullListItems: ReturnType<typeof runAllocationEngine>["pullList"] = [];
        const allPackListItems: ReturnType<typeof runAllocationEngine>["packList"] = [];
        const allSummaryItems: ReturnType<typeof runAllocationEngine>["allocationSummary"] = [];
        const customerNames: string[] = [];
        const totalOrderIds: number[] = [];
        const customersPayload: Array<{ customerId: number; customerName: string; orderIds: number[]; stagingLocationId: number; stagingLocationName: string }> = [];

        for (const customer of targetCustomers) {
          // Fetch all open orders for this customer
          const openOrders = await fetchOpenOrders(config, customer.id, input.facilityId);
          if (openOrders.length === 0) continue;

          // In Extensiv API: readOnly.orderId = Extensiv Transaction ID (used for API calls)
          //                   referenceNum = client's internal order number (display only)
          const orderIds = openOrders.map((o) => o.readOnly.orderId);
          customersPayload.push({ customerId: customer.id, customerName: customer.name, orderIds, stagingLocationId: customer.stagingLocationId, stagingLocationName: customer.stagingLocationName });
          customerNames.push(customer.name);
          totalOrderIds.push(...orderIds);
          // Fetch orders with full detail using Extensiv's internal order ID
          const ordersWithDetail = await Promise.all(
            orderIds.map((id) => fetchOrderWithDetail(config, id))
          );
          const orders = ordersWithDetail.map((o) => o.order);

          // Fetch inventory
          const inventory = await fetchInventory(config, customer.id, input.facilityId);

          // Fetch item descriptions
          const descMap = await fetchItemDescriptions(config, customer.id);

          // Build location type map
          const locationConfigsData = await getLocationConfigsByCustomer(input.configId, customer.id);
          const locationTypeMap: LocationTypeMap = {};
          for (const lc of locationConfigsData) {
            locationTypeMap[lc.locationId] = lc.locationType;
          }

          // Customer rules
          const customerRule = await getCustomerRule(input.configId, customer.id);
          const noLotMixing = customerRule?.noLotMixing ?? false;
          const locationPriorityPatterns = (customerRule?.locationPriorityPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
          const result = runAllocationEngine(
            orders,
            inventory,
            locationTypeMap,
            customer.stagingLocationId,
            customer.stagingLocationName,
            descMap,
            noLotMixing,
            undefined,
            undefined,
            locationPriorityPatterns
          );

          allAllocated.push(...result.allocatedOrders);
          allSkipped.push(...result.skippedOrders);
          allPullListItems.push(...result.pullList);
          allPackListItems.push(...result.packList);
          allSummaryItems.push(...result.allocationSummary);
        }

        if (totalOrderIds.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No open orders found for any of the selected customers at this facility.",
          });
        }

        const mergedResult = {
          allocatedOrders: allAllocated,
          skippedOrders: allSkipped,
          pullList: allPullListItems,
          packList: allPackListItems,
          allocationSummary: allSummaryItems,
        };

        // Save run to DB
        const runId = await createAllocationRun({
          configId: input.configId,
          customerId: customersPayload.length === 1 ? customersPayload[0]!.customerId : null,
          customerName: customersPayload.length === 1 ? customersPayload[0]!.customerName : null,
          customerNames: JSON.stringify(customerNames),
          facilityId: input.facilityId,
          facilityName: input.facilityName,
          status: "proposed",
          orderCount: totalOrderIds.length,
          allocatedCount: allAllocated.length,
          skippedCount: allSkipped.length,
          pullList: allPullListItems as unknown as Record<string, unknown>[],
          createdBy: ctx.user.id,
        });

        const runOrderItems = [
          ...allAllocated.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            poNum: o.poNum,
            status: "allocated" as const,
            allocationDetail: o as unknown as Record<string, unknown>,
          })),
          ...allSkipped.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            poNum: o.poNum,
            status: "skipped" as const,
            skipReason: o.skipReason,
            allocationDetail: {} as Record<string, unknown>,
          })),
        ];
        await createAllocationRunOrders(runOrderItems);

        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.quickPropose",
          entityType: "allocation_run",
          entityId: String(runId),
          details: {
            customers: customerNames,
            orderCount: totalOrderIds.length,
            allocated: allAllocated.length,
            skipped: allSkipped.length,
            mode: "quick",
          },
        });

        return { runId, result: mergedResult };
      }),

    confirm: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        if (run.status !== "proposed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Run is not in proposed state" });
        }

        const config = await getExtensivConfigById(run.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });

        const runOrders = await getAllocationRunOrders(input.runId);
        const allocatedOrders = runOrders.filter((o) => o.status === "allocated");

        const errors: string[] = [];
        let successCount = 0;

        // Step 1: Execute the global pull list moves (SKU-level, not per-order).
        // The pull list is stored at the run level; per-order pullListItems is always empty.
        type PullListEntry = { receiveItemId: number; qty: number; toLocationId: number; toLocationName?: string; fromLocationType?: string };
        const globalPullList = (run.pullList ?? []) as PullListEntry[];
        // Group moves by destination (staging) location and only move non-staging items
        const stagingMoves = globalPullList.filter((p) => p.fromLocationType !== "staging");
        if (stagingMoves.length > 0) {
          // Group by toLocationId (there may be multiple staging locations in multi-customer runs)
          const movesByDest = new Map<number, { name: string; items: Array<{ receiveItemId: number; quantity: number }> }>();
          for (const p of stagingMoves) {
            if (!movesByDest.has(p.toLocationId)) movesByDest.set(p.toLocationId, { name: p.toLocationName ?? "", items: [] });
            movesByDest.get(p.toLocationId)!.items.push({ receiveItemId: p.receiveItemId, quantity: p.qty });
          }
          for (const [destId, { name: destName, items }] of Array.from(movesByDest.entries())) {
            console.log(`[confirm] Moving ${items.length} items to staging location ${destId} (${destName})`);
            const moveResult = await moveInventory(config, destId, destName, items);
            if (!moveResult.success) {
              // Log but don't abort — allocator may still work if inventory is already in staging
              console.error(`[confirm] Move to staging ${destId} failed: ${moveResult.error}`);
              errors.push(`Move to staging failed: ${moveResult.error}`);
            } else {
              console.log(`[confirm] Move to staging ${destId} succeeded`);
            }
          }
        } else {
          console.log(`[confirm] No staging moves needed (${globalPullList.length} pull list items, all already in staging)`);
        }

        for (const runOrder of allocatedOrders) {
          const detail = runOrder.allocationDetail as {
            lineItems: Array<{
              sku: string;
              allocations: Array<{ receiveItemId: number; qty: number; locationType: string }>;
            }>;
          } | null;

          if (!detail) continue;

          try {
            // Step 2: Get fresh ETag for the order
            console.log(`[confirm] Fetching ETag for order ${runOrder.orderId}`);
            const { etag } = await fetchOrderWithDetail(config, runOrder.orderId);
            console.log(`[confirm] Got ETag for order ${runOrder.orderId}: ${etag}`);

            // Step 3: Call allocator — Extensiv auto-allocates from staged inventory
            console.log(`[confirm] Calling allocator for order ${runOrder.orderId}`);
            const allocResult = await allocateOrder(
              config,
              runOrder.orderId,
              etag
            );
            console.log(`[confirm] Allocator result for order ${runOrder.orderId}: success=${allocResult.success} error=${allocResult.error ?? 'none'}`);

            if (allocResult.success) {
              successCount++;
            } else {
              errors.push(
                `Order ${runOrder.referenceNum}: allocate failed - ${allocResult.error}`
              );
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`Order ${runOrder.referenceNum}: ${message}`);
          }
        }

        const finalStatus = errors.length === 0 ? "confirmed" : "failed";
        await updateAllocationRun(input.runId, {
          status: finalStatus,
          confirmedAt: new Date(),
          notes: errors.length > 0 ? errors.join("; ") : undefined,
        });

        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.confirm",
          entityType: "allocation_run",
          entityId: String(input.runId),
          details: { successCount, errors },
        });

        return { success: errors.length === 0, successCount, errors };
      }),

    cancel: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        await updateAllocationRun(input.runId, { status: "cancelled" });
        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.cancel",
          entityType: "allocation_run",
          entityId: String(input.runId),
          details: {},
        });
        return { success: true };
      }),

    unallocateOrder: protectedProcedure
      .input(z.object({ runOrderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Load the run order record
        const runOrder = await getAllocationRunOrderById(input.runOrderId);
        if (!runOrder) throw new TRPCError({ code: "NOT_FOUND", message: "Run order not found" });
        if (runOrder.status !== "allocated") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Order status is '${runOrder.status}' — only allocated orders can be unallocated` });
        }

        // Load the run to get Extensiv config
        const run = await getAllocationRunById(runOrder.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Allocation run not found" });
        const config = await getExtensivConfigById(run.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });

        // Fetch fresh ETag for the order (config is the raw DB object, compatible with ExtensivClientConfig)
        const { etag } = await fetchOrderWithDetail(config, runOrder.orderId);
        if (!etag) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not fetch ETag for order" });

         // Call Extensiv deallocator
        const result = await deallocateOrder(config, runOrder.orderId, etag);
        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Extensiv deallocate failed: ${result.error}`,
          });
        }
        // Reverse inventory moves: move products back from staging to their original source locations
        // The pull list stored on the run records every staging move (fromLocation → staging).
        // To reverse, we group items by their original fromLocation and call moveInventory for each group.
        try {
          const runForPullList = await getAllocationRunById(runOrder.runId);
          const runPullList = runForPullList?.pullList as Array<{
            sku: string;
            receiveItemId: number;
            qty: number;
            fromLocationId: number;
            fromLocationName: string;
            toLocationId: number;
            toLocationName: string;
            movement: string;
          }> | null | undefined;
          // Also check per-order pull list items for backward compatibility
          const orderDetail = runOrder.allocationDetail as { pullListItems?: Array<{
            sku: string;
            receiveItemId: number;
            qty: number;
            fromLocationId: number;
            fromLocationName: string;
            toLocationId: number;
            toLocationName: string;
            movement: string;
          }> } | null | undefined;
          // Collect all pull list entries that belong to this order
          // Global pull list doesn't track per-order, so we use the order's own pullListItems
          const itemsToReverse = orderDetail?.pullListItems ?? [];
          // If no per-order items, fall back to filtering global pull list by this order's SKUs
          // (best-effort: may over-reverse if same SKU appears in multiple orders)
          const effectiveItems = itemsToReverse.length > 0
            ? itemsToReverse
            : (Array.isArray(runPullList) ? runPullList : []).filter((p) => p.movement === "to_staging" || !p.movement);
          if (effectiveItems.length > 0) {
            // Group by original source location (fromLocation)
            const bySource = new Map<number, { locationId: number; locationName: string; items: Array<{ receiveItemId: number; quantity: number }> }>();
            for (const entry of effectiveItems) {
              if (!bySource.has(entry.fromLocationId)) {
                bySource.set(entry.fromLocationId, { locationId: entry.fromLocationId, locationName: entry.fromLocationName, items: [] });
              }
              bySource.get(entry.fromLocationId)!.items.push({ receiveItemId: entry.receiveItemId, quantity: entry.qty });
            }
            // Move each group back to its source location
            for (const { locationId, locationName, items } of Array.from(bySource.values())) {
              const moveResult = await moveInventory(config, locationId, locationName, items);
              if (!moveResult.success) {
                console.warn(`[unallocate] Reverse move to ${locationName} (${locationId}) failed: ${moveResult.error}`);
              } else {
                console.log(`[unallocate] Reversed ${items.length} item(s) back to ${locationName}`);
              }
            }
          }
        } catch (reverseErr) {
          // Log but don't fail the unallocation — the Extensiv deallocate already succeeded
          console.error("[unallocate] Error during reverse inventory move:", reverseErr);
        }
        // Update run order status to unallocated
        await updateAllocationRunOrder(input.runOrderId, { status: "unallocated" });

        // Decrement the run's allocatedCount
        const allOrders = await getAllocationRunOrders(runOrder.runId);
        const allocatedCount = allOrders.filter((o) => o.status === "allocated").length;
        await updateAllocationRun(runOrder.runId, { allocatedCount });

        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.unallocate",
          entityType: "allocation_run_order",
          entityId: String(input.runOrderId),
          details: { orderId: runOrder.orderId, referenceNum: runOrder.referenceNum },
        });

        return { success: true };
      }),
    history: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input }) => {
        return getAllocationRuns(input.limit);
      }),

    runDetail: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .query(async ({ input }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        const orders = await getAllocationRunOrders(input.runId);
        return { run, orders };
      }),

    deleteRun: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Allocation run not found" });

        await deleteAllocationRun(input.runId);

        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.deleteRun",
          entityType: "allocation_run",
          entityId: String(input.runId),
          details: {
            customerName: run.customerName,
            status: run.status,
            orderCount: run.orderCount,
            createdAt: run.createdAt,
          },
        });

        return { success: true };
      }),
  }),

  // ─── Audit Logs ────────────────────────────────────────────────────────────
  audit: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async ({ input }) => {
        return getAuditLogs(input.limit);
      }),
  }),

  // ─── Customer Rules ────────────────────────────────────────────────────────
  customerRules: router({
    list: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        return getCustomerRules(input.configId);
      }),

    get: protectedProcedure
      .input(z.object({ configId: z.number(), customerId: z.number() }))
      .query(async ({ input }) => {
        return getCustomerRule(input.configId, input.customerId) ?? null;
      }),

    save: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          customerId: z.number(),
          customerName: z.string().optional(),
          facilityId: z.number().optional(),
          facilityName: z.string().optional(),
          noLotMixing: z.boolean(),
          autoRun: z.boolean(),
          locationPriorityPatterns: z
            .array(z.object({ pattern: z.string(), label: z.string() }))
            .optional()
            .default([]),
          notes: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await upsertCustomerRule(input);
        await createAuditLog({
          userId: ctx.user.id,
          action: "customerRules.save",
          entityType: "customer_rules",
          entityId: String(input.customerId),
          details: {
            noLotMixing: input.noLotMixing,
            autoRun: input.autoRun,
            locationPriorityPatterns: input.locationPriorityPatterns,
            notes: input.notes,
          },
        });
        return { success: true };
      }),

    /**
     * Copy the full rule set from one customer to one or more target customers.
     * The source customer's noLotMixing, autoRun, locationPriorityPatterns, and
     * notes are written to every target customer. facilityId/facilityName are
     * taken from each target's own existing rule (if any) so the staging location
     * is not accidentally overwritten.
     */
    copyRules: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          sourceCustomerId: z.number(),
          targetCustomers: z.array(
            z.object({
              customerId: z.number(),
              customerName: z.string(),
              facilityId: z.number().optional(),
              facilityName: z.string().optional(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const source = await getCustomerRule(input.configId, input.sourceCustomerId);
        if (!source) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Source customer has no saved rules to copy from.",
          });
        }

        const results: Array<{ customerId: number; customerName: string; success: boolean }> = [];

        for (const target of input.targetCustomers) {
          // Preserve the target's own facility if it already has one; otherwise inherit from source
          const existingTarget = await getCustomerRule(input.configId, target.customerId);
          const facilityId = existingTarget?.facilityId ?? source.facilityId ?? target.facilityId;
          const facilityName = existingTarget?.facilityName ?? source.facilityName ?? target.facilityName;

          await upsertCustomerRule({
            configId: input.configId,
            customerId: target.customerId,
            customerName: target.customerName,
            facilityId,
            facilityName,
            noLotMixing: source.noLotMixing,
            autoRun: source.autoRun,
            locationPriorityPatterns: source.locationPriorityPatterns as Array<{ pattern: string; label: string }> ?? [],
            notes: source.notes,
          });

          await createAuditLog({
            userId: ctx.user.id,
            action: "customerRules.copyRules",
            entityType: "customer_rules",
            entityId: String(target.customerId),
            details: {
              sourceCustomerId: input.sourceCustomerId,
              copiedFields: ["noLotMixing", "autoRun", "locationPriorityPatterns", "notes"],
            },
          });

          results.push({ customerId: target.customerId, customerName: target.customerName, success: true });
        }

        return { copied: results.length, results };
      }),
  }),

  // ─── Schedule Config ────────────────────────────────────────────────────
  schedule: router({
    get: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        return (await getScheduleConfig(input.configId)) ?? null;
      }),

    save: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          isEnabled: z.boolean(),
          cronExpression: z.string().min(1),
          timezone: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await upsertScheduleConfig(input);
        // Restart or stop the cron job
        if (input.isEnabled) {
          startSchedule(input.configId, input.cronExpression);
        } else {
          stopSchedule(input.configId);
        }
        await createAuditLog({
          userId: ctx.user.id,
          action: "schedule.save",
          entityType: "schedule_config",
          entityId: String(input.configId),
          details: { isEnabled: input.isEnabled, cronExpression: input.cronExpression },
        });
        return { success: true };
      }),

    triggerNow: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await createAuditLog({
          userId: ctx.user.id,
          action: "schedule.triggerNow",
          entityType: "schedule_config",
          entityId: String(input.configId),
          details: {},
        });
        // Run async, don't await so the UI gets an immediate response
        triggerManualRun(input.configId).catch((err) =>
          console.error("[Schedule] Manual trigger failed:", err)
        );
        return { success: true, message: "Auto-run triggered. Check Run History for results." };
      }),

    autoRunCustomers: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        return getAutoRunCustomers(input.configId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
