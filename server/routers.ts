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
  getUnresolvedVerificationCount,
  createAuditLog,
  getAuditLogs,
  getDistinctAuditActions,
  getAuditLogUsers,
  getCustomerRules,
  getCustomerRule,
  upsertCustomerRule,
  getScheduleConfig,
  upsertScheduleConfig,
  getAutoRunCustomers,
  getTrackedOrders,
  updateOrderLifecycleStatus,
  getLastSyncTime,
  getShipwellConfig,
  upsertShipwellConfig,
  markOrderSentToShipwell,
  getSlaRequirements,
  getSlaRequirementByClient,
  upsertSlaRequirement,
  deleteSlaRequirement,
  getOrderSlaStatuses,
  getClientSlaBreachSummary,
  getAllClientsWithSlaRequirements,
  getLaneThresholds,
  getLaneThresholdById,
  createLaneThreshold,
  updateLaneThreshold,
  deleteLaneThreshold,
  getAttentionCount,
  getAlertTime,
  setAlertTime,
  getClientVisibility,
  upsertClientVisibility,
  lockAllHiddenClients,
  setClientLock,
  syncClientVisibilityFromOrders,
  getHiddenClientIds,
  dismissZeroBidWarning,
  getAllSlaRules,
  getSlaRulesForClient,
  upsertSlaRule,
  deleteSlaRule,
  setSlaExtension,
  clearSlaExtension,
  createReturnsSession,
  getReturnsSessions,
  getReturnsSession,
  updateReturnsSession,
  addReturnsItem,
  getReturnsItems,
  updateReturnsItem,
  deleteReturnsItem,
  getReturnsDashboardStats,
  getFailedReturnSessions,
  getAllCortexConnections,
  getCortexConnection,
  upsertCortexConnection,
  updateCortexHealthStatus,
  getProcessedCortexReturns,
  getCortexReturn,
  updateCortexReturn,
  createQcSession,
  getQcSessionById,
  getQcSessionByRef,
  updateQcSession,
  listQcSessions,
  getQcScanItems,
  upsertQcScanItem,
  incrementQcScanItem,
  createQcPallet,
  getQcPallets,
  updateQcPallet,
  createQcFlaggedScan,
  listQcFlaggedScans,
  resolveQcFlaggedScan,
  getRecentCompletedQcSessions,
  createPalletScan,
  listPalletScans,
  updatePalletScanStatus,
  getSlaFacilityThresholds,
  getSlaFacilityThreshold,
  upsertSlaFacilityThreshold,
  getSlaDailyHistory,
  upsertSlaDailySnapshot,
  updateRunVerification,
  updateRunOrderVerification,
  createPutAwayScan,
  listPutAwayScans,
  listPutAwayScansByConfig,
  clearPutAwaySession,
  type VerificationStatus,
  type OrderVerificationResult,
} from "./db";
import { fireCortexWebhook } from "./cortex/webhook";
import { startSchedule, stopSchedule, triggerManualRun } from "./scheduler/autoRun";
import { sendOverdueAlertNow, rescheduleOverdueAlert } from "./scheduler/overdueAlert";
import { syncOrdersNow, getLastSyncInfo } from "./scheduler/orderSync";
import { recordSlaNightlySnapshot } from "./scheduler/slaNightlySnapshot";
import { fetchCustomers, fetchOpenOrders, fetchInventory, fetchItemDescriptions, fetchOrderWithDetail, moveInventory, allocateOrder, deallocateOrder, updateOrderProposedAllocations, fetchAllFacilities, fetchCustomersForFacility, fetchExtensivLocations, fetchOrdersByReferenceNum, fetchReceivers, fetchReceiverDetail, startReceipt } from "./extensiv/api";
import { getExtensivToken, invalidateToken } from "./extensiv/client";
import { runAllocationEngine, LocationTypeMap } from "./allocation/engine";
import { createShipwellClient } from "./shipwell/api";

const _appRouter = router({
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

    // Returns open order counts for all customers at a facility in one batched call
    openOrderCounts: protectedProcedure
      .input(
        z.object({
          configId: z.number(),
          customerIds: z.array(z.number()),
          facilityId: z.number(),
        })
      )
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        // Fetch counts in parallel, one per customer
        const results = await Promise.all(
          input.customerIds.map(async (customerId) => {
            try {
              const orders = await fetchOpenOrders(config, customerId, input.facilityId);
              return { customerId, count: orders.length };
            } catch {
              return { customerId, count: 0 };
            }
          })
        );
        return results;
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
        // Map of Extensiv orderId → ship-to company name (for PDF pack sheet)
        const shipToNameMap = new Map<number, string>();

        for (const customer of input.customers) {
          if (customer.orderIds.length === 0) continue;

          // Fetch orders with full detail for this customer
          const ordersWithDetail = await Promise.all(
            customer.orderIds.map((id) => fetchOrderWithDetail(config, id))
          );
          const orders = ordersWithDetail.map((o) => o.order);
          // Build a map of orderId → shipToName for PDF generation
          for (const { order } of ordersWithDetail) {
            const name = order.shipTo?.companyName ?? order.shipTo?.name ?? null;
            if (name) shipToNameMap.set(order.readOnly.orderId, name);
          }

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
          const locationExclusionPatterns = (customerRule?.locationExclusionPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
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
            locationPriorityPatterns,
            locationExclusionPatterns
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
            shipToName: shipToNameMap.get(o.orderId) ?? null,
            status: "allocated" as const,
            allocationDetail: o as unknown as Record<string, unknown>,
          })),
          ...allSkipped.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            poNum: o.poNum,
            shipToName: shipToNameMap.get(o.orderId) ?? null,
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
        const shipToNameMapQ = new Map<number, string>();

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
          // Capture ship-to names for PDF
          for (const { order } of ordersWithDetail) {
            const name = order.shipTo?.companyName ?? order.shipTo?.name ?? null;
            if (name) shipToNameMapQ.set(order.readOnly.orderId, name);
          }

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
          const locationExclusionPatterns = (customerRule?.locationExclusionPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
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
            locationPriorityPatterns,
            locationExclusionPatterns
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
            shipToName: shipToNameMapQ.get(o.orderId) ?? null,
            status: "allocated" as const,
            allocationDetail: o as unknown as Record<string, unknown>,
          })),
          ...allSkipped.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            poNum: o.poNum,
            shipToName: shipToNameMapQ.get(o.orderId) ?? null,
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
            const moveResult = await moveInventory(config, destId, destName, items, run.facilityId);
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
          // Mark as pending verification so the UI shows the badge immediately
          verificationStatus: finalStatus === "confirmed" ? "pending" : undefined,
        });

        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.confirm",
          entityType: "allocation_run",
          entityId: String(input.runId),
          details: { successCount, errors },
        });

        // Auto-trigger verification after a short delay to allow Extensiv to process
        if (finalStatus === "confirmed") {
          setTimeout(async () => {
            try {
              console.log(`[confirm] Auto-triggering verification for run ${input.runId}`);
              const verifyConfig = await getExtensivConfigById(run.configId);
              if (!verifyConfig) return;
              const verifyOrders = await getAllocationRunOrders(input.runId);
              const verifyAllocated = verifyOrders.filter((o) => o.status === "allocated" || o.status === "unallocated");
              const verifyResults: OrderVerificationResult[] = [];
              for (const runOrder of verifyAllocated) {
                const approvedDetail = runOrder.allocationDetail as {
                  lineItems: Array<{ sku: string; allocations: Array<{ qty: number }> }>;
                } | null;
                try {
                  const { order } = await fetchOrderWithDetail(verifyConfig, runOrder.orderId);
                  const fullyAllocated = order.readOnly.fullyAllocated ?? false;
                  const approvedQtyBySku = new Map<string, number>();
                  if (approvedDetail?.lineItems) {
                    for (const li of approvedDetail.lineItems) {
                      const total = li.allocations.reduce((s, a) => s + a.qty, 0);
                      approvedQtyBySku.set(li.sku, (approvedQtyBySku.get(li.sku) ?? 0) + total);
                    }
                  }
                  const extensivQtyBySku = new Map<string, number>();
                  if (order.orderItems) {
                    for (const item of order.orderItems) {
                      const sku = item.itemIdentifier.sku;
                      const allocQty = (item.proposedAllocations ?? []).reduce((s, a) => s + a.qty, 0);
                      extensivQtyBySku.set(sku, (extensivQtyBySku.get(sku) ?? 0) + allocQty);
                    }
                  }
                  const skuResults: OrderVerificationResult["skuResults"] = [];
                  for (const [sku, approvedQty] of Array.from(approvedQtyBySku.entries())) {
                    const extensivQty = extensivQtyBySku.get(sku) ?? 0;
                    skuResults.push({ sku, approvedQty, extensivQty, match: extensivQty >= approvedQty });
                  }
                  const allMatch = skuResults.every((r) => r.match);
                  let orderStatus: VerificationStatus;
                  if (fullyAllocated && allMatch) orderStatus = "verified";
                  else if (fullyAllocated && !allMatch) orderStatus = "mismatch";
                  else if (!fullyAllocated && skuResults.some((r) => r.extensivQty > 0)) orderStatus = "partial";
                  else orderStatus = "mismatch";
                  verifyResults.push({ orderId: runOrder.orderId, referenceNum: runOrder.referenceNum ?? String(runOrder.orderId), status: orderStatus, fullyAllocated, skuResults });
                  await updateRunOrderVerification(runOrder.id, orderStatus, skuResults);
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : String(err);
                  verifyResults.push({ orderId: runOrder.orderId, referenceNum: runOrder.referenceNum ?? String(runOrder.orderId), status: "failed", fullyAllocated: null, skuResults: [], error: message });
                  await updateRunOrderVerification(runOrder.id, "failed", []);
                }
              }
              const statusPriority: Record<VerificationStatus, number> = { verified: 0, partial: 1, mismatch: 2, failed: 3, pending: 4 };
              const worstStatus = verifyResults.reduce<VerificationStatus>(
                (worst, r) => statusPriority[r.status] > statusPriority[worst] ? r.status : worst,
                "verified"
              );
              const runVerifStatus: VerificationStatus = verifyResults.length === 0 ? "pending" : worstStatus;
              await updateRunVerification(input.runId, runVerifStatus, verifyResults, new Date());
              console.log(`[confirm] Auto-verification complete for run ${input.runId}: ${runVerifStatus}`);
            } catch (err) {
              console.error(`[confirm] Auto-verification failed for run ${input.runId}:`, err);
            }
          }, 5000); // 5 second delay for Extensiv to process
        }

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

    verifyRun: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        if (run.status !== "confirmed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only confirmed runs can be verified" });
        }
        const config = await getExtensivConfigById(run.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });

        const runOrders = await getAllocationRunOrders(input.runId);
        const allocatedOrders = runOrders.filter((o) => o.status === "allocated" || o.status === "unallocated");

        const results: OrderVerificationResult[] = [];

        for (const runOrder of allocatedOrders) {
          const approvedDetail = runOrder.allocationDetail as {
            lineItems: Array<{ sku: string; allocations: Array<{ qty: number }> }>;
          } | null;

          try {
            const { order } = await fetchOrderWithDetail(config, runOrder.orderId);
            const fullyAllocated = order.readOnly.fullyAllocated ?? false;

            // Build approved qty map from stored allocation detail
            const approvedQtyBySku = new Map<string, number>();
            if (approvedDetail?.lineItems) {
              for (const li of approvedDetail.lineItems) {
                const total = li.allocations.reduce((s, a) => s + a.qty, 0);
                approvedQtyBySku.set(li.sku, (approvedQtyBySku.get(li.sku) ?? 0) + total);
              }
            }

            // Build Extensiv allocated qty map from proposedAllocations on order items
            const extensivQtyBySku = new Map<string, number>();
            if (order.orderItems) {
              for (const item of order.orderItems) {
                const sku = item.itemIdentifier.sku;
                const allocQty = (item.proposedAllocations ?? []).reduce((s, a) => s + a.qty, 0);
                extensivQtyBySku.set(sku, (extensivQtyBySku.get(sku) ?? 0) + allocQty);
              }
            }

            // Compare per SKU
            const skuResults: OrderVerificationResult["skuResults"] = [];
            for (const [sku, approvedQty] of Array.from(approvedQtyBySku.entries())) {
              const extensivQty = extensivQtyBySku.get(sku) ?? 0;
              skuResults.push({ sku, approvedQty, extensivQty, match: extensivQty >= approvedQty });
            }

            const allMatch = skuResults.every((r) => r.match);
            let orderStatus: VerificationStatus;
            if (fullyAllocated && allMatch) {
              orderStatus = "verified";
            } else if (fullyAllocated && !allMatch) {
              orderStatus = "mismatch";
            } else if (!fullyAllocated && skuResults.some((r) => r.extensivQty > 0)) {
              orderStatus = "partial";
            } else {
              orderStatus = "mismatch";
            }

            results.push({
              orderId: runOrder.orderId,
              referenceNum: runOrder.referenceNum ?? String(runOrder.orderId),
              status: orderStatus,
              fullyAllocated,
              skuResults,
            });

            await updateRunOrderVerification(runOrder.id, orderStatus, skuResults);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            results.push({
              orderId: runOrder.orderId,
              referenceNum: runOrder.referenceNum ?? String(runOrder.orderId),
              status: "failed",
              fullyAllocated: null,
              skuResults: [],
              error: message,
            });
            await updateRunOrderVerification(runOrder.id, "failed", []);
          }
        }

        // Roll up to run-level status: worst status wins
        const statusPriority: Record<VerificationStatus, number> = {
          verified: 0, partial: 1, mismatch: 2, failed: 3, pending: 4,
        };
        const worstStatus = results.reduce<VerificationStatus>(
          (worst, r) => statusPriority[r.status] > statusPriority[worst] ? r.status : worst,
          "verified"
        );
        const runStatus: VerificationStatus = results.length === 0 ? "pending" : worstStatus;

        await updateRunVerification(input.runId, runStatus, results, new Date());
        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.verify",
          entityType: "allocation_run",
          entityId: String(input.runId),
          details: { runStatus, orderCount: results.length },
        });

        return { runStatus, results };
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
              const moveResult = await moveInventory(config, locationId, locationName, items, runForPullList?.facilityId ?? undefined);
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

        // Decrement the run's allocatedCount; if all orders are now unallocated, update run status too
        const allOrders = await getAllocationRunOrders(runOrder.runId);
        const allocatedCount = allOrders.filter((o) => o.status === "allocated").length;
        const runStatusUpdate: { allocatedCount: number; status?: "proposed" | "confirmed" | "cancelled" | "failed" | "unallocated" } = { allocatedCount };
        if (allocatedCount === 0) {
          // Every order in this run has been unallocated — reflect that on the run itself
          runStatusUpdate.status = "unallocated";
        }
        await updateAllocationRun(runOrder.runId, runStatusUpdate);

        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.unallocate",
          entityType: "allocation_run_order",
          entityId: String(input.runOrderId),
          details: { orderId: runOrder.orderId, referenceNum: runOrder.referenceNum },
        });

        return { success: true };
      }),

    retryMove: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        if (run.status !== "confirmed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Can only retry moves on confirmed runs" });
        }

        const config = await getExtensivConfigById(run.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });

        type PullListEntry = { receiveItemId: number; qty: number; toLocationId: number; toLocationName?: string; fromLocationType?: string };
        const globalPullList = (run.pullList ?? []) as PullListEntry[];
        const stagingMoves = globalPullList.filter((p) => p.fromLocationType !== "staging");

        if (stagingMoves.length === 0) {
          return { success: true, moved: 0, errors: [] };
        }

        const movesByDest = new Map<number, { name: string; items: Array<{ receiveItemId: number; quantity: number }> }>();
        for (const p of stagingMoves) {
          if (!movesByDest.has(p.toLocationId)) movesByDest.set(p.toLocationId, { name: p.toLocationName ?? "", items: [] });
          movesByDest.get(p.toLocationId)!.items.push({ receiveItemId: p.receiveItemId, quantity: p.qty });
        }

        const errors: string[] = [];
        let moved = 0;
        for (const [destId, { name: destName, items }] of Array.from(movesByDest.entries())) {
          const moveResult = await moveInventory(config, destId, destName, items, run.facilityId);
          if (!moveResult.success) {
            errors.push(`Move to staging ${destName || destId} failed: ${moveResult.error}`);
          } else {
            moved += items.length;
          }
        }

        // Clear the notes field if all moves succeeded, otherwise update with latest error
        const newNotes = errors.length > 0 ? errors.join("; ") : null;
        await updateAllocationRun(input.runId, { notes: newNotes ?? undefined });

        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.retryMove",
          entityType: "allocation_run",
          entityId: String(input.runId),
          details: { moved, errors },
        });

        return { success: errors.length === 0, moved, errors };
      }),

    history: protectedProcedure
      .input(z.object({ limit: z.number().default(200), days: z.number().optional() }))
      .query(async ({ input }) => {
        const sinceDate = input.days
          ? new Date(Date.now() - input.days * 24 * 60 * 60 * 1000)
          : undefined;
        const runs = await getAllocationRuns(input.limit, sinceDate);
        // Attach allocated orderIds to each run for display in the history table
        const runsWithOrders = await Promise.all(
          runs.map(async (run) => {
            const orders = await getAllocationRunOrders(run.id);
            const orderIds = orders
              .filter((o) => o.status === "allocated" || o.status === "unallocated")
              .map((o) => o.orderId);
            return { ...run, orderIds };
          })
        );
        return runsWithOrders;
      }),

    unresolvedVerificationCount: protectedProcedure
      .query(async () => {
        const count = await getUnresolvedVerificationCount();
        return { count };
      }),

    runDetail: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .query(async ({ input }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        const orders = await getAllocationRunOrders(input.runId);
        return { run, orders };
      }),

    markDocumentsPrinted: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .mutation(async ({ input }) => {
        await updateAllocationRun(input.runId, { documentsPrintedAt: new Date() });
        return { success: true };
      }),

    // ─── Open Orders Dashboard ──────────────────────────────────────────────
    openOrders: protectedProcedure
      .input(
        z.object({
          configId: z.number().optional(),
          facilityId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        // Get all Extensiv configs (or just the one requested)
        const configs = input.configId
          ? [await getExtensivConfigById(input.configId)].filter(Boolean)
          : await getExtensivConfigs();

        if (configs.length === 0) return { orders: [], summary: { total: 0, urgent: 0, high: 0, normal: 0, byClient: [] } };

        const now = Date.now();
        const allOrders: Array<{
          orderId: number;
          referenceNum: string;
          poNum: string | null;
          clientId: number;
          clientName: string;
          facilityId: number;
          facilityName: string;
          creationDate: string;
          ageDays: number;
          priority: "urgent" | "high" | "normal";
          lineCount: number;
          totalPieces: number;
          skuCount: number;
          shipToName: string | null;
          shipToCity: string | null;
          notes: string | null;
          configId: number;
          orderStatus: number;
        }> = [];

        for (const config of configs) {
          if (!config) continue;
          try {
            // Get all customers for this config
            const customers = await fetchCustomers(config);
            const facilityId = input.facilityId ?? 0;

            await Promise.all(
              customers.map(async (customer) => {
                try {
                  const orders = await fetchOpenOrders(config, customer.id, facilityId);
                  for (const o of orders) {
                    const creationDate = o.readOnly.creationDate ?? "";
                    const created = creationDate ? new Date(creationDate).getTime() : now;
                    const ageDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
                    const priority: "urgent" | "high" | "normal" =
                      ageDays >= 7 ? "urgent" : ageDays >= 3 ? "high" : "normal";
                    const oRaw = o as unknown as Record<string, unknown>;
                    const totalPieces = (o.orderItems ?? []).reduce((sum, item) => sum + (item.qty ?? 0), 0);
                    const skuCount = new Set((o.orderItems ?? []).map(item => item.itemIdentifier?.sku).filter(Boolean)).size;
                    allOrders.push({
                      orderId: o.readOnly.orderId,
                      referenceNum: o.referenceNum ?? "",
                      poNum: oRaw.poNum as string | null ?? null,
                      clientId: customer.id,
                      clientName: customer.name,
                      facilityId: o.readOnly.facilityIdentifier?.id ?? 0,
                      facilityName: o.readOnly.facilityIdentifier?.name ?? "",
                      creationDate,
                      ageDays,
                      priority,
                      lineCount: o.orderItems?.length ?? 0,
                      totalPieces,
                      skuCount,
                      shipToName: o.shipTo?.companyName ?? o.shipTo?.name ?? null,
                      shipToCity: o.shipTo?.city ?? null,
                      notes: (oRaw.notes as string | null) ?? null,
                      configId: config.id,
                      orderStatus: o.readOnly.status ?? 0,
                    });
                  }
                } catch (err) {
                  console.warn(`[openOrders] Failed to fetch orders for customer ${customer.id}:`, err);
                }
              })
            );
          } catch (err) {
            console.warn(`[openOrders] Failed to fetch customers for config ${config.id}:`, err);
          }
        }

        // Sort by ageDays descending (oldest first)
        allOrders.sort((a, b) => b.ageDays - a.ageDays);

        // Helper: classify order into one of the four business categories
        // Out of SLA = any order >= 7 days old (regardless of status)
        // Unallocated = status 0
        // In Production = status 1
        // Ship Ready = status 2+
        const classifyOrder = (o: typeof allOrders[0]) => {
          if (o.ageDays >= 7) return "outOfSla" as const;
          if (o.orderStatus === 1) return "inProduction" as const;
          if (o.orderStatus >= 2) return "shipReady" as const;
          return "unallocated" as const;
        };

        // Build global summary
        let unallocated = 0, inProduction = 0, shipReady = 0, outOfSla = 0;
        for (const o of allOrders) {
          const cat = classifyOrder(o);
          if (cat === "outOfSla") outOfSla++;
          else if (cat === "inProduction") inProduction++;
          else if (cat === "shipReady") shipReady++;
          else unallocated++;
        }

        const clientMap = new Map<number, { clientId: number; clientName: string; count: number; urgent: number }>();
        for (const o of allOrders) {
          const entry = clientMap.get(o.clientId) ?? { clientId: o.clientId, clientName: o.clientName, count: 0, urgent: 0 };
          entry.count++;
          if (o.priority === "urgent") entry.urgent++;
          clientMap.set(o.clientId, entry);
        }
        const byClient = Array.from(clientMap.values()).sort((a, b) => b.count - a.count);

        // Group by facility
        const facilityMap = new Map<number, {
          facilityId: number;
          facilityName: string;
          orders: typeof allOrders;
          total: number;
          urgent: number;
          high: number;
          normal: number;
          unallocated: number;
          inProduction: number;
          shipReady: number;
          outOfSla: number;
          byClient: Array<{ clientId: number; clientName: string; count: number; urgent: number }>;
        }>();

        for (const o of allOrders) {
          const fid = o.facilityId;
          if (!facilityMap.has(fid)) {
            facilityMap.set(fid, {
              facilityId: fid,
              facilityName: o.facilityName || `Warehouse ${fid}`,
              orders: [],
              total: 0,
              urgent: 0,
              high: 0,
              normal: 0,
              unallocated: 0,
              inProduction: 0,
              shipReady: 0,
              outOfSla: 0,
              byClient: [],
            });
          }
          const f = facilityMap.get(fid)!;
          f.orders.push(o);
          f.total++;
          if (o.priority === "urgent") f.urgent++;
          else if (o.priority === "high") f.high++;
          else f.normal++;
          const cat = classifyOrder(o);
          if (cat === "outOfSla") f.outOfSla++;
          else if (cat === "inProduction") f.inProduction++;
          else if (cat === "shipReady") f.shipReady++;
          else f.unallocated++;
        }

        // Build per-facility byClient
        for (const f of Array.from(facilityMap.values())) {
          const cm = new Map<number, { clientId: number; clientName: string; count: number; urgent: number }>();
          for (const o of f.orders) {
            const e = cm.get(o.clientId) ?? { clientId: o.clientId, clientName: o.clientName, count: 0, urgent: 0 };
            e.count++;
            if (o.priority === "urgent") e.urgent++;
            cm.set(o.clientId, e);
          }
          f.byClient = Array.from(cm.values()).sort((a, b) => b.count - a.count);
        }

        const facilities = Array.from(facilityMap.values() as Iterable<{
          facilityId: number;
          facilityName: string;
          orders: typeof allOrders;
          total: number;
          urgent: number;
          high: number;
          normal: number;
          unallocated: number;
          inProduction: number;
          shipReady: number;
          outOfSla: number;
          byClient: Array<{ clientId: number; clientName: string; count: number; urgent: number }>;
        }>).sort((a, b) => a.facilityName.localeCompare(b.facilityName));

        return {
          orders: allOrders,
          summary: { total: allOrders.length, unallocated, inProduction, shipReady, outOfSla, byClient },
          facilities,
        };
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
      .input(z.object({
        limit: z.number().default(200),
        action: z.string().optional(),
        userId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return getAuditLogs(input.limit, input.action, input.userId);
      }),

    distinctActions: protectedProcedure.query(async () => {
      return getDistinctAuditActions();
    }),

    users: protectedProcedure.query(async () => {
      return getAuditLogUsers();
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

  // ─── Order Lifecycle Tracking (Pick Schedule) ────────────────────────────────
  pickSchedule: router({
    /** Return all tracked orders, optionally filtered by facilityId, with hidden clients excluded */
    list: protectedProcedure
      .input(z.object({ facilityId: z.number().optional() }))
      .query(async ({ input }) => {
        const allOrders = await getTrackedOrders(input.facilityId);
        const lastSync = await getLastSyncTime();
        const syncInfo = getLastSyncInfo();
        const thresholds = await getLaneThresholds();

        // Build a map of hidden clientIds per configId from client_visibility settings
        const configIds = Array.from(new Set(allOrders.map((o) => o.configId)));
        const hiddenByConfig = new Map<number, Set<number>>();
        await Promise.all(
          configIds.map(async (cid) => {
            hiddenByConfig.set(cid, await getHiddenClientIds(cid));
          })
        );

        // Filter out orders whose client is hidden in their config's visibility settings
        const orders = allOrders.filter((o) => {
          const hidden = hiddenByConfig.get(o.configId);
          return !hidden || !hidden.has(o.clientId);
        });

        return {
          orders,
          lastSyncAt: lastSync,
          syncRunning: syncInfo.syncRunning,
          laneThresholds: thresholds,
        };
      }),

    /** Advance an order to the next lifecycle stage */
    updateStatus: protectedProcedure
      .input(
        z.object({
          extensivOrderId: z.number(),
          status: z.enum(["unallocated", "allocated", "picking", "qc", "qc_complete", "ship_ready"]),
          assignedAssociate: z.string().max(256).nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updated = await updateOrderLifecycleStatus(
          input.extensivOrderId,
          input.status,
          input.assignedAssociate
        );
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found in tracking table" });
        await createAuditLog({
          userId: ctx.user.id,
          action: "pickSchedule.updateStatus",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { newStatus: input.status, assignedAssociate: input.assignedAssociate ?? null },
        });
        return updated;
      }),

    /** Step an order back one lifecycle stage */
    undoStatus: protectedProcedure
      .input(z.object({ extensivOrderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const PREV_STATUS: Record<string, string> = {
          allocated: "unallocated",
          picking: "allocated",
          qc: "picking",
          qc_complete: "qc",
          ship_ready: "qc_complete",
        };
        const orders = await getTrackedOrders();
        const order = orders.find((o) => o.extensivOrderId === input.extensivOrderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        const prevStatus = PREV_STATUS[order.lifecycleStatus];
        if (!prevStatus) throw new TRPCError({ code: "BAD_REQUEST", message: "Order is already at the first stage" });
        const updated = await updateOrderLifecycleStatus(
          input.extensivOrderId,
          prevStatus as "unallocated" | "allocated" | "picking" | "qc" | "qc_complete" | "ship_ready",
          null
        );
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found in tracking table" });
        await createAuditLog({
          userId: ctx.user.id,
          action: "pickSchedule.undoStatus",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { prevStatus: order.lifecycleStatus, newStatus: prevStatus },
        });
        return updated;
      }),

    /** Manually trigger an immediate sync from Extensiv */
    /** Returns the sidebar badge count: overdue unallocated + zero-bid orders. */
    attentionCount: publicProcedure.query(async () => {
      return getAttentionCount();
    }),

    /** Reset the zero-bid notification clock for an order after manual outreach. */
    dismissZeroBidWarning: protectedProcedure
      .input(z.object({ extensivOrderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await dismissZeroBidWarning(input.extensivOrderId);
        await createAuditLog({
          userId: ctx.user.id,
          action: "pickSchedule.dismissZeroBidWarning",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { extensivOrderId: input.extensivOrderId },
        });
        return { success: true };
      }),

    syncNow: protectedProcedure.mutation(async ({ ctx }) => {
      await createAuditLog({
        userId: ctx.user.id,
        action: "pickSchedule.syncNow",
        entityType: "order_tracking",
        entityId: null,
        details: {},
      });
      // Run async so UI gets immediate response
      syncOrdersNow().catch((err) => console.error("[PickSchedule] Manual sync failed:", err));
      return { success: true, message: "Sync started. Refresh in a moment to see updated orders." };
    }),
  }),

  // ─── Shipwell TMS Integration ──────────────────────────────────────────────
  shipwell: router({
    /** Get the current Shipwell config (password masked). */
    getConfig: protectedProcedure.query(async () => {
      const config = await getShipwellConfig();
      if (!config) return null;
      return {
        id: config.id,
        name: config.name,
        email: config.email,
        environment: config.environment,
        isActive: config.isActive,
        hasPassword: !!config.password,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      };
    }),

    /** Save or update Shipwell credentials. */
    saveConfig: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128).optional().default("Default"),
        email: z.string().email(),
        password: z.string().min(1),
        environment: z.enum(["sandbox", "production"]),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertShipwellConfig({
          name: input.name,
          email: input.email,
          password: input.password,
          environment: input.environment,
          isActive: true,
        });
        await createAuditLog({
          userId: ctx.user.id,
          action: "shipwell.saveConfig",
          entityType: "shipwell_configs",
          entityId: null,
          details: { email: input.email, environment: input.environment },
        });
        return { success: true };
      }),

    /** Test the Shipwell credentials by authenticating. */
    testConnection: protectedProcedure.mutation(async () => {
      const config = await getShipwellConfig();
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "No Shipwell config found. Please save credentials first." });
      const client = createShipwellClient({
        email: config.email,
        password: config.password,
        environment: config.environment as "sandbox" | "production",
      });
      const result = await client.verifyCredentials();
      if (!result.valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Shipwell authentication failed. Check your email and password." });
      return { success: true, user: result.user };
    }),

    /** Send a Ship Ready order to Shipwell as a purchase order. */
    sendOrder: protectedProcedure
      .input(z.object({
        extensivOrderId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "No Shipwell config found. Please configure Shipwell credentials first." });

        // Fetch the tracked order
        const orders = await getTrackedOrders();
        const order = orders.find((o) => o.extensivOrderId === input.extensivOrderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found in tracking table." });
        if (order.lifecycleStatus !== "ship_ready") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only Ship Ready orders can be sent to Shipwell." });
        }
        if (order.shipwellOrderId) {
          throw new TRPCError({ code: "CONFLICT", message: `Order already sent to Shipwell (PO ID: ${order.shipwellOrderId}).` });
        }

        const client = createShipwellClient({
          email: config.email,
          password: config.password,
          environment: config.environment as "sandbox" | "production",
        });

        // Build the purchase order payload
        // Origin address: Go Direct warehouse (facility name used as placeholder)
        const originAddress = {
          address_1: order.facilityName ?? "Go Direct Warehouse",
          city: "Warehouse",
          country: "CA",
        };

        // Destination: ship-to customer address (city from Extensiv)
        const destinationAddress = {
          address_1: order.shipToName ?? "Unknown",
          city: order.shipToCity ?? "Unknown",
          country: "CA",
        };

        const po = await client.createPurchaseOrder({
          order_number: String(order.extensivOrderId),
          purchase_order_number: order.poNum ?? undefined,
          origin_address: originAddress,
          destination_address: destinationAddress,
          customer_name: order.clientName ?? undefined,
          description: order.notes ?? undefined,
          source: "SHIPWELL_WEB",
          custom_data: {
            gd_reference_num: order.referenceNum,
            gd_client_id: order.clientId,
            gd_facility: order.facilityName,
          },
        });

        const poUrl = client.getPoUrl(po.id);
        await markOrderSentToShipwell(input.extensivOrderId, po.id, poUrl);

        await createAuditLog({
          userId: ctx.user.id,
          action: "shipwell.sendOrder",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { shipwellOrderId: po.id, poUrl, environment: config.environment },
        });

        return { success: true, shipwellOrderId: po.id, poUrl };
      }),
  }),

  // ─── SLA Tracker ──────────────────────────────────────────────────────────────
  sla: router({
    /** List all per-customer SLA requirement overrides. */
    listRequirements: protectedProcedure.query(async () => {
      return getSlaRequirements();
    }),

    /** Get the SLA requirement for a single client. */
    getRequirement: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        return getSlaRequirementByClient(input.clientId);
      }),

    /** Create or update an SLA requirement for a client. */
    upsertRequirement: protectedProcedure
      .input(z.object({
        clientId: z.number(),
        clientName: z.string().min(1).max(256),
        slaDays: z.number().int().min(1).max(365),
        notes: z.string().max(512).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertSlaRequirement({
          clientId: input.clientId,
          clientName: input.clientName,
          slaDays: input.slaDays,
          notes: input.notes,
        });
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.upsertRequirement",
          entityType: "sla_requirements",
          entityId: String(input.clientId),
          details: { slaDays: input.slaDays, clientName: input.clientName },
        });
        return { success: true };
      }),

    /** Delete an SLA requirement override (reverts client to default 2-day SLA). */
    deleteRequirement: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteSlaRequirement(input.id);
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.deleteRequirement",
          entityType: "sla_requirements",
          entityId: String(input.id),
          details: {},
        });
        return { success: true };
      }),

    /**
     * Get SLA status for all tracked orders.
     * Returns orders annotated with slaDays, ageCalendarDays, slaStatus, daysRemaining.
     * Excludes orders that have already shipped (lifecycle_status = 'shipped').
     */
    getStatus: protectedProcedure.query(async () => {
      const orders = await getOrderSlaStatuses();
      return orders;
    }),

    /**
     * Returns a per-client summary of orders currently out of SLA,
     * sorted by worst breach first. Used on the Open Orders dashboard.
     */
    clientBreachSummary: protectedProcedure.query(async () => {
      return getClientSlaBreachSummary();
    }),

    /**
     * Returns every known client merged with their SLA requirement.
     * Clients without an override show slaDays=2 and isDefault=true.
     * Used by the SLA requirements table to show all clients pre-populated.
     */
    allClientsWithRequirements: protectedProcedure.query(async () => {
      return getAllClientsWithSlaRequirements();
    }),

    /** Return all named sub-rules across all clients (bulk fetch). */
    listRules: protectedProcedure.query(async () => {
      return getAllSlaRules();
    }),

    /** Return named sub-rules for a single client. */
    getRulesForClient: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        return getSlaRulesForClient(input.clientId);
      }),

    /** Create or update a named SLA sub-rule for a client. */
    upsertRule: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        requirementId: z.number(),
        clientId: z.number(),
        clientName: z.string().min(1).max(256),
        ruleName: z.string().min(1).max(128),
        slaDays: z.number().int().min(1).max(365),
        notes: z.string().max(512).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertSlaRule({
          id: input.id,
          requirementId: input.requirementId,
          clientId: input.clientId,
          clientName: input.clientName,
          ruleName: input.ruleName,
          slaDays: input.slaDays,
          notes: input.notes,
        });
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.upsertRule",
          entityType: "sla_rules",
          entityId: String(input.clientId),
          details: { ruleName: input.ruleName, slaDays: input.slaDays, clientName: input.clientName },
        });
        return { success: true };
      }),

    /** Delete a named SLA sub-rule by id. */
    deleteRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteSlaRule(input.id);
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.deleteRule",
          entityType: "sla_rules",
          entityId: String(input.id),
          details: {},
        });
        return { success: true };
      }),

    setExtension: protectedProcedure
      .input(
        z.object({
          extensivOrderId: z.number().int(),
          extensionDays: z.number().int().min(1).max(365),
          note: z.string().max(512).nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await setSlaExtension(input.extensivOrderId, input.extensionDays, input.note ?? null);
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.setExtension",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { extensionDays: input.extensionDays, note: input.note },
        });
        return { success: true };
      }),

    clearExtension: protectedProcedure
      .input(z.object({ extensivOrderId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        await clearSlaExtension(input.extensivOrderId);
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.clearExtension",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: {},
        });
        return { success: true };
      }),

    // ── Per-warehouse health thresholds ──────────────────────────────────────
    listFacilityThresholds: protectedProcedure.query(async () => {
      return getSlaFacilityThresholds();
    }),

    getFacilityThreshold: protectedProcedure
      .input(z.object({ facilityId: z.number().int() }))
      .query(async ({ input }) => {
        return getSlaFacilityThreshold(input.facilityId);
      }),

    upsertFacilityThreshold: protectedProcedure
      .input(
        z.object({
          facilityId: z.number().int(),
          facilityName: z.string().min(1).max(256),
          greenThreshold: z.number().int().min(0).max(100).default(98),
          yellowThreshold: z.number().int().min(0).max(100).default(95),
          notes: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const row = await upsertSlaFacilityThreshold({
          facilityId: input.facilityId,
          facilityName: input.facilityName,
          greenThreshold: input.greenThreshold,
          yellowThreshold: input.yellowThreshold,
          notes: input.notes ?? null,
        });
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.upsertFacilityThreshold",
          entityType: "sla_facility_thresholds",
          entityId: String(input.facilityId),
          details: { greenThreshold: input.greenThreshold, yellowThreshold: input.yellowThreshold },
        });
        return row;
      }),

    // ── 7-day sparkline history ──────────────────────────────────────────────
    facilityHistory: protectedProcedure
      .input(z.object({ facilityId: z.number(), days: z.number().int().min(1).max(90).default(7) }))
      .query(async ({ input }) => {
        return getSlaDailyHistory(input.facilityId, input.days);
      }),

    recordSnapshot: protectedProcedure
      .input(
        z.object({
          facilityId: z.number(),
          facilityName: z.string(),
          snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          inSlaCount: z.number().int().min(0),
          totalCount: z.number().int().min(0),
          slaRate: z.number().int().min(0).max(100),
        })
      )
      .mutation(async ({ input }) => {
        await upsertSlaDailySnapshot(input);
        return { ok: true };
      }),

    // Manual trigger — runs the same logic as the nightly cron job immediately.
    // Useful for testing or backfilling snapshots after initial setup.
    runNightlySnapshot: protectedProcedure.mutation(async () => {
      const results = await recordSlaNightlySnapshot();
      return { recorded: results.length, facilities: results };
    }),
  }),
});
// ─── Lane Threshold router ───────────────────────────────────────────────────
export const laneThresholdRouter = router({
  list: protectedProcedure.query(async () => {
    return getLaneThresholds();
  }),
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const threshold = await getLaneThresholdById(input.id);
      if (!threshold) throw new TRPCError({ code: "NOT_FOUND", message: "Lane threshold not found" });
      return threshold;
    }),
  create: protectedProcedure
    .input(
      z.object({
        laneName: z.string().min(1).max(256),
        facilityCode: z.string().max(64).nullable().optional(),
        destinationRegion: z.string().max(128).nullable().optional(),
        thresholdHours: z.number().int().min(1).max(168).default(2),
        isActive: z.boolean().default(true),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await createLaneThreshold({
        laneName: input.laneName,
        facilityCode: input.facilityCode ?? null,
        destinationRegion: input.destinationRegion ?? null,
        thresholdHours: input.thresholdHours,
        isActive: input.isActive,
        notes: input.notes ?? null,
      });
      return { id };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        laneName: z.string().min(1).max(256).optional(),
        facilityCode: z.string().max(64).nullable().optional(),
        destinationRegion: z.string().max(128).nullable().optional(),
        thresholdHours: z.number().int().min(1).max(168).optional(),
        isActive: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateLaneThreshold(id, data);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteLaneThreshold(input.id);
      return { success: true };
    }),
});

// ─── Overdue Alert router ────────────────────────────────────────────────────
export const overdueAlertRouter = router({
  /** Manually trigger the overdue order morning alert (for testing). */
  triggerNow: protectedProcedure.mutation(async () => {
    const result = await sendOverdueAlertNow();
    return result;
  }),

  /** Get the currently configured alert time. */
  getAlertTime: protectedProcedure.query(async () => {
    return getAlertTime();
  }),

  /** Save a new alert time and reschedule the cron job immediately. */
  setAlertTime: protectedProcedure
    .input(
      z.object({
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
    )
    .mutation(async ({ input }) => {
      await setAlertTime(input.hour, input.minute);
      await rescheduleOverdueAlert();
      const pad = (n: number) => String(n).padStart(2, "0");
      return { success: true, time: `${pad(input.hour)}:${pad(input.minute)}` };
    }),
});

/// ─── Client Visibility Router ────────────────────────────────────────────────
const clientVisibilityRouter = router({
  /** List all clients for a configId, syncing from orders first */
  list: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => {
      // Sync new clients from order_tracking into client_visibility
      await syncClientVisibilityFromOrders(input.configId);
      return getClientVisibility(input.configId);
    }),

  /** Lock all currently hidden clients for a configId (bulk action) */
  lockAllHidden: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const count = await lockAllHiddenClients(input.configId);
      await createAuditLog({
        userId: ctx.user.id,
        action: "settings.clientVisibility.lockAllHidden",
        entityType: "client_visibility",
        entityId: null,
        details: { configId: input.configId, lockedCount: count },
      });
      return { lockedCount: count };
    }),

  /** Toggle the lock state for a single client row */
  setLock: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        clientId: z.number(),
        isLocked: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await setClientLock(input.configId, input.clientId, input.isLocked);
      await createAuditLog({
        userId: ctx.user.id,
        action: input.isLocked
          ? "settings.clientVisibility.lock"
          : "settings.clientVisibility.unlock",
        entityType: "client_visibility",
        entityId: String(input.clientId),
        details: { configId: input.configId, clientId: input.clientId, isLocked: input.isLocked },
      });
      return { success: true };
    }),
  /** Save visibility toggles for a batch of clients */
  save: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            configId: z.number(),
            clientId: z.number(),
            clientName: z.string(),
            isVisible: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await upsertClientVisibility(input.rows);
      await createAuditLog({
        userId: ctx.user.id,
        action: "settings.clientVisibility.save",
        entityType: "client_visibility",
        entityId: null,
        details: { count: input.rows.length },
      });
      return { success: true };
    }),
});

// ─── Returns router ──────────────────────────────────────────────────────────
const returnsRouter = router({
  // Get dashboard stats
  dashboardStats: protectedProcedure.query(async () => {
    return getReturnsDashboardStats();
  }),

  // List sessions with optional filters
  listSessions: protectedProcedure
    .input(z.object({
      configId: z.number().optional(),
      clientId: z.number().optional(),
      status: z.enum(["open", "closed", "cancelled"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getReturnsSessions(input ?? {});
    }),

  // Get a single session with its items
  getSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const session = await getReturnsSession(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const items = await getReturnsItems(input.id);
      return { session, items };
    }),

  // Create a new returns session
  createSession: protectedProcedure
    .input(z.object({
      configId: z.number(),
      warehouseName: z.string(),
      clientId: z.number(),
      clientName: z.string(),
      referenceNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createReturnsSession({
        ...input,
        createdByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        status: "open",
      });
      await createAuditLog({
        userId: ctx.user.id,
        action: "returns.session.create",
        entityType: "returns_session",
        entityId: String(id),
        details: { configId: input.configId, clientId: input.clientId, clientName: input.clientName },
      });
      return { id };
    }),

  // Close a session
  closeSession: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await updateReturnsSession(input.id, {
        status: "closed",
        closedAt: new Date(),
        ...(input.notes ? { notes: input.notes } : {}),
      });
      await createAuditLog({
        userId: ctx.user.id,
        action: "returns.session.close",
        entityType: "returns_session",
        entityId: String(input.id),
        details: {},
      });
      return { success: true };
    }),

  // Cancel a session
  cancelSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await updateReturnsSession(input.id, { status: "cancelled" });
      await createAuditLog({
        userId: ctx.user.id,
        action: "returns.session.cancel",
        entityType: "returns_session",
        entityId: String(input.id),
        details: {},
      });
      return { success: true };
    }),

  // Add an item to a session
  addItem: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      sku: z.string().min(1),
      description: z.string().optional(),
      quantity: z.number().int().min(1).default(1),
      condition: z.enum(["new", "good", "damaged", "unsellable"]).default("good"),
      disposition: z.enum(["restock", "quarantine", "destroy", "return_to_vendor"]).default("restock"),
      lotNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await addReturnsItem({
        ...input,
        scannedByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
      });
      return { id };
    }),

  // Update an item
  updateItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      sku: z.string().min(1).optional(),
      description: z.string().optional(),
      quantity: z.number().int().min(1).optional(),
      condition: z.enum(["new", "good", "damaged", "unsellable"]).optional(),
      disposition: z.enum(["restock", "quarantine", "destroy", "return_to_vendor"]).optional(),
      lotNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateReturnsItem(id, data);
      return { success: true };
    }),

  // Remove an item
  removeItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteReturnsItem(input.id);
      return { success: true };
    }),

  // ── Push a closed returns_session to ClearSight via outbound webhook ──────
  pushSessionToClearSight: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getReturnsSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status !== "closed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only closed sessions can be pushed to ClearSight" });
      }
      const items = await getReturnsItems(input.sessionId);
      const payload = {
        geniusSessionId: `genius-session-${session.id}`,
        referenceNumber: session.referenceNumber ?? null,
        warehouseName: session.warehouseName,
        clientName: session.clientName,
        closedAt: session.closedAt ? session.closedAt.toISOString() : null,
        closedBy: session.createdByName ?? null,
        notes: session.notes ?? null,
        items: items.map((item) => ({
          sku: item.sku,
          description: item.description ?? null,
          quantity: item.quantity,
          condition: item.condition,
          disposition: item.disposition,
          lotNumber: item.lotNumber ?? null,
          notes: item.notes ?? null,
        })),
        totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
        totalSkus: items.length,
      };
      const newAttempts = (session.pushAttempts ?? 0) + 1;
      let sent = false;
      let pushError: string | null = null;
      try {
        sent = await fireCortexWebhook("clearsight", "return.session.closed", payload);
        if (!sent) pushError = "Webhook returned failure (no active ClearSight connection or non-2xx response)";
      } catch (err: unknown) {
        pushError = err instanceof Error ? err.message : String(err);
      }
      const newStatus = sent ? "sent" : "failed";
      await updateReturnsSession(input.sessionId, {
        pushStatus: newStatus,
        pushAttempts: newAttempts,
        pushError: sent ? null : pushError,
        lastPushedAt: new Date(),
      });
      await createAuditLog({
        userId: ctx.user.id,
        action: "returns.pushToClearSight",
        entityType: "returns_session",
        entityId: String(session.id),
        details: { sessionId: session.id, sent, itemCount: items.length, attempt: newAttempts, error: pushError },
      });
      if (!sent) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: pushError ?? "Push to ClearSight failed",
        });
      }
      return { success: true, sent, itemCount: items.length, pushAttempts: newAttempts };
    }),
});
// ─── Cortex Integration Router ────────────────────────────────────────────────
const cortexRouter = router({
  // List all configured connections
  listConnections: protectedProcedure.query(async () => {
    return getAllCortexConnections();
  }),
  // Get a single connection
  getConnection: protectedProcedure
    .input(z.object({ platform: z.string() }))
    .query(async ({ input }) => {
      return getCortexConnection(input.platform);
    }),
  // Save / update a connection config
  saveConnection: protectedProcedure
    .input(z.object({
      platform: z.string(),
      displayName: z.string().optional(),
      baseUrl: z.string().optional(),
      outboundApiKey: z.string().optional(),
      inboundApiKey: z.string().optional(),
      webhookUrl: z.string().optional(),
      syncIntervalSeconds: z.number().int().min(60).optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { platform, ...data } = input;
      await upsertCortexConnection(platform, data);
      return { success: true };
    }),
  // Test connection — hit the remote health endpoint
  testConnection: protectedProcedure
    .input(z.object({ platform: z.string() }))
    .mutation(async ({ input }) => {
      const conn = await getCortexConnection(input.platform);
      if (!conn || !conn.baseUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Connection not configured" });
      }
      try {
        const url = conn.baseUrl.replace(/\/$/, "") + "/api/health";
        const res = await fetch(url, {
          headers: { "X-API-Key": conn.outboundApiKey },
          signal: AbortSignal.timeout(8_000),
        });
        const status = res.ok ? "ok" : `error_${res.status}`;
        await updateCortexHealthStatus(input.platform, status);
        if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `Health check returned HTTP ${res.status}` });
        const body = await res.json() as Record<string, unknown>;
        return { success: true, status, body };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateCortexHealthStatus(input.platform, "error");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),
  // List inbound returns from ClearSight
  listInboundReturns: protectedProcedure
    .input(z.object({
      since: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }))
    .query(async ({ input }) => {
      const since = input.since ? new Date(input.since) : undefined;
      const rows = await getProcessedCortexReturns(since, input.limit ?? 100);
      return rows;
    }),
  // Get a single inbound return
  getInboundReturn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getCortexReturn(input.id);
    }),
  // Update return status (from Process Returns UI)
  updateReturnStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["Received", "Inspecting", "Processed", "Refunded", "Rejected", "Restocked"]),
      inspectionResult: z.string().optional(),
      disposition: z.string().optional(),
      refundAmount: z.number().optional(),
      refundApproved: z.boolean().optional(),
      processedBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, status, ...rest } = input;
      await updateCortexReturn(id, {
        status,
        ...rest,
        refundAmount: rest.refundAmount != null ? String(rest.refundAmount) : undefined,
        processedBy: rest.processedBy ?? ctx.user.name ?? ctx.user.email,
        processedAt: new Date(),
        webhookSent: false,
      });
      // Fire webhook
      const eventMap: Record<string, string> = {
        Processed: "return.processed",
        Refunded: "return.refunded",
        Rejected: "return.rejected",
        Restocked: "return.processed",
        Inspecting: "return.inspecting",
      };
      await fireCortexWebhook("clearsight", eventMap[status] ?? "return.processed", {
        geniusReturnId: `genius-${id}`,
        status,
        disposition: rest.disposition ?? null,
        refundAmount: rest.refundAmount ?? null,
        refundApproved: rest.refundApproved ?? null,
        processedAt: new Date().toISOString(),
      });
       await updateCortexReturn(id, { webhookSent: true });
      return { success: true };
    }),

});
// ─── QC Scanner Router ───────────────────────────────────────────────────────
const qcScannerRouter = router({
  // Look up an order by reference number from Extensiv and create/resume a session
  startSession: protectedProcedure
    .input(z.object({
      referenceNumber: z.string().min(1),
      warehouseId: z.number().optional(),
      warehouseName: z.string().optional(),
      batchMode: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Try to find an existing open session for this reference number
      const existing = await getQcSessionByRef(input.referenceNumber);
      if (existing && existing.status === "scanning") {
        const items = await getQcScanItems(existing.id);
        const pallets = await getQcPallets(existing.id);
        return { session: existing, items, pallets, resumed: true };
      }
      // Create a new session
      const sessionId = await createQcSession({
        referenceNumber: input.referenceNumber,
        warehouseId: input.warehouseId,
        warehouseName: input.warehouseName,
        batchIdentifiers: input.batchMode ? input.referenceNumber : null,
        status: "scanning",
        createdBy: ctx.user.name,
      });
      const session = await getQcSessionById(sessionId);
      // Create first pallet automatically
      await createQcPallet({ sessionId, palletNumber: 1, items: [] });
      const pallets = await getQcPallets(sessionId);
      return { session, items: [], pallets, resumed: false };
    }),

  // Load a session with all items and pallets
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await getQcScanItems(input.sessionId);
      const pallets = await getQcPallets(input.sessionId);
      return { session, items, pallets };
    }),

  // List recent sessions
  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ input }) => listQcSessions(input.limit ?? 50)),

  // Seed expected items from Extensiv order data (called after fetching order)
  seedItems: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      items: z.array(z.object({
        sku: z.string(),
        upc: z.string().optional(),
        description: z.string().optional(),
        lotNumber: z.string().optional(),
        expectedQty: z.number(),
        caseAmount: z.number().optional(),
      })),
      orderMeta: z.object({
        customerName: z.string().optional(),
        destinationAddress: z.string().optional(),
        distributionCenter: z.string().optional(),
        poNumber: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      for (const item of input.items) {
        await upsertQcScanItem(input.sessionId, item.sku, item.upc ?? null, {
          description: item.description,
          lotNumber: item.lotNumber ?? null,
          expectedQty: item.expectedQty,
          caseAmount: item.caseAmount ?? 1,
          scannedQty: 0,
          scanTimestamps: [],
        });
      }
      if (input.orderMeta) {
        await updateQcSession(input.sessionId, input.orderMeta as any);
      }
      return { success: true };
    }),

  // Fetch order items from Extensiv by reference number and seed the session
  // This auto-populates SKU, description, expected qty, and lot number from Extensiv
  fetchFromExtensiv: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      referenceNumber: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      // Get the first active Extensiv config
      const configs = await getExtensivConfigs();
      const config = configs.find((c) => c.isActive) ?? configs[0];
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No Extensiv configuration found. Please set up an Extensiv API config first." });

      // Search Extensiv for orders matching this reference number
      const orders = await fetchOrdersByReferenceNum(config, input.referenceNumber);
      if (orders.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No orders found in Extensiv for reference number "${input.referenceNumber}". Check the reference number and try again.` });
      }

      // Use the first matching order (most recent if multiple)
      const order = orders[0]!;
      const orderItems = order.orderItems ?? [];

      if (orderItems.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Order found in Extensiv but it has no line items. The order may not have items loaded yet.` });
      }

      // Fetch item descriptions for the customer (to fill in description field)
      let descMap = new Map<string, string>();
      try {
        const customerId = order.readOnly?.customerIdentifier?.id;
        if (customerId) {
          descMap = await fetchItemDescriptions(config, customerId);
        }
      } catch (err) {
        console.warn(`[qcScanner.fetchFromExtensiv] Could not fetch item descriptions:`, err);
      }

      // Seed each order item into the session
      let seededCount = 0;
      for (const item of orderItems) {
        const sku = item.itemIdentifier?.sku;
        if (!sku) continue;
        const description = descMap.get(sku) ?? undefined;
        await upsertQcScanItem(input.sessionId, sku, null, {
          description,
          lotNumber: item.lotNumber ?? null,
          expectedQty: item.qty ?? 0,
          caseAmount: 1,
          scannedQty: 0,
          scanTimestamps: [],
        });
        seededCount++;
      }

      // Update session metadata from the order
      const customerName = order.readOnly?.customerIdentifier?.name ?? undefined;
      const poNumber = (order as unknown as Record<string, unknown>).poNum as string | undefined;
      await updateQcSession(input.sessionId, {
        customerName: customerName ?? undefined,
        poNumber: poNumber ?? undefined,
      } as any);

      // Return the freshly seeded items
      const items = await getQcScanItems(input.sessionId);
      return { success: true, seededCount, items, customerName: customerName ?? null, poNumber: poNumber ?? null };
    }),

  // Record a barcode scan — increments scannedQty for the matching SKU/UPC
  scanBarcode: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      barcode: z.string().min(1),
      scanAsCase: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const items = await getQcScanItems(input.sessionId);
      const match = items.find(
        (i) => i.sku.toUpperCase() === input.barcode.toUpperCase() ||
               (i.upc && i.upc.toUpperCase() === input.barcode.toUpperCase())
      );
      if (!match) {
        return { found: false, item: null, sessionComplete: false };
      }
      const amount = input.scanAsCase ? (match.caseAmount ?? 1) : 1;
      const updated = await incrementQcScanItem(input.sessionId, match.sku, amount);
      // Check if all items are complete
      const allItems = await getQcScanItems(input.sessionId);
      const sessionComplete = allItems.every((i) => i.scannedQty >= i.expectedQty);
      return { found: true, item: updated, sessionComplete };
    }),

  // Manual quantity adjustment
  adjustQty: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      sku: z.string(),
      delta: z.number(), // +1 or -1
    }))
    .mutation(async ({ input }) => {
      const updated = await incrementQcScanItem(input.sessionId, input.sku, input.delta);
      const allItems = await getQcScanItems(input.sessionId);
      const sessionComplete = allItems.every((i) => i.scannedQty >= i.expectedQty);
      return { item: updated, sessionComplete };
    }),

  // Complete the order
  completeSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await updateQcSession(input.sessionId, { status: "complete", completedAt: new Date() });
      await createAuditLog({
        action: "qc.completeSession",
        entityType: "qc_scan_session",
        entityId: String(input.sessionId),
        userId: ctx.user.id,
        details: JSON.stringify({ sessionId: input.sessionId, completedBy: ctx.user.name }),
      });
      return { success: true };
    }),

  // Add a new pallet to the session
  addPallet: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const existing = await getQcPallets(input.sessionId);
      const palletNumber = existing.length + 1;
      const id = await createQcPallet({ sessionId: input.sessionId, palletNumber, items: [] });
      return { id, palletNumber };
    }),

  // Assign a scan to a pallet
  assignToPallet: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      sku: z.string(),
      upc: z.string().optional(),
      qty: z.number(),
    }))
    .mutation(async ({ input }) => {
      // Fetch the pallet and append the item to its items JSON array
      const pallets = await getQcPallets(input.palletId);
      const pallet = pallets[0] ?? null;
      if (pallet) {
        const items = (pallet.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
        const existing = items.find((i) => i.sku === input.sku);
        if (existing) {
          existing.qty += input.qty;
        } else {
          items.push({ sku: input.sku, upc: input.upc, qty: input.qty });
        }
        await updateQcPallet(pallet.id, { items });
      }
      return { success: true };
    }),

  // Flag an unrecognised scan
  flagScan: protectedProcedure
    .input(z.object({
      sessionId: z.number().optional(),
      referenceNumber: z.string().optional(),
      upc: z.string().optional(),
      sku: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createQcFlaggedScan({
        sessionId: input.sessionId ?? null,
        referenceNumber: input.referenceNumber ?? null,
        upc: input.upc ?? null,
        sku: input.sku ?? null,
        description: input.description ?? null,
        flaggedBy: ctx.user.name,
        status: "open",
      });
      return { id };
    }),

  // List flagged scans
  listFlaggedScans: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => listQcFlaggedScans(input.status ?? undefined)),

  // Resolve a flagged scan
  resolveFlaggedScan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await resolveQcFlaggedScan(input.id, ctx.user.name ?? "unknown");
      return { success: true };
    }),

  // Last N completed sessions for the start-screen panel
  recentSessions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ input }) => {
      const sessions = await getRecentCompletedQcSessions(input.limit);
      return { sessions };
    }),

  // Read-only summary of a single session (header + full item list)
  sessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const items = await getQcScanItems(input.sessionId);
      return { session, items };
    }),
});

// Pallet Scanner router (Shipping section)
const palletScannerRouter = router({
  // Log a new pallet scan
  logScan: protectedProcedure
    .input(z.object({
      trackingNumber: z.string().min(1),
      doorNumber: z.string().optional(),
      warehouseName: z.string().optional(),
      carrierName: z.string().optional(),
      referenceNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const scan = await createPalletScan({
        trackingNumber: input.trackingNumber,
        doorNumber: input.doorNumber ?? null,
        warehouseName: input.warehouseName ?? null,
        carrierName: input.carrierName ?? null,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        scannedBy: ctx.user.name ?? ctx.user.email ?? "unknown",
        status: "loaded",
      });
      return scan;
    }),

  // List recent pallet scans
  list: protectedProcedure
    .input(z.object({
      warehouseName: z.string().optional(),
      doorNumber: z.string().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => listPalletScans(input)),

  // Update status (loaded → departed)
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["loaded", "departed", "pending"]) }))
    .mutation(async ({ input }) => {
      await updatePalletScanStatus(input.id, input.status);
      return { success: true };
    }),
});

// ─── Receiving Router ───────────────────────────────────────────────────────
const receivingRouter = router({
  /**
   * List inbound receivers (ASN/PO receipts) from Extensiv.
   * Supports filtering by warehouse, customer, status, and date range.
   */
  list: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        facilityId: z.number().optional(),
        customerId: z.number().optional(),
        createdAfter: z.string().optional(), // ISO date string
        pgsiz: z.number().min(1).max(500).default(100),
        pgnum: z.number().min(1).default(1),
        includeItems: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });
      const result = await fetchReceivers(config, {
        facilityId: input.facilityId,
        customerId: input.customerId,
        createdAfter: input.createdAfter,
        pgsiz: input.pgsiz,
        pgnum: input.pgnum,
        includeItems: input.includeItems,
      });
      return result;
    }),

  /**
   * Get a single receiver with full line item detail.
   */
  detail: protectedProcedure
    .input(z.object({ configId: z.number(), transactionId: z.number() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });
      const receiver = await fetchReceiverDetail(config, input.transactionId);
      if (!receiver) throw new TRPCError({ code: "NOT_FOUND", message: "Receiver not found" });
      return receiver;
    }),

  /**
   * KPI summary: counts by status across all recent receivers.
   * Returns: expected (status=0), inProgress (status=1), completed (status=2), discrepancies.
   */
  kpis: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        facilityId: z.number().optional(),
        createdAfter: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });
      // Fetch up to 500 receivers with item detail for discrepancy calculation
      const { receivers } = await fetchReceivers(config, {
        facilityId: input.facilityId,
        createdAfter: input.createdAfter,
        pgsiz: 500,
        includeItems: true,
      });
      let expected = 0;
      let inProgress = 0;
      let completed = 0;
      let discrepancies = 0;
      for (const r of receivers) {
        const status = r.readOnly.status;
        if (status === 0) expected++;
        else if (status === 1) inProgress++;
        else if (status === 2) completed++;
        // Discrepancy: any item where receivedQty !== expectedQty
        const items = r.receiveItems ?? [];
        const hasDiscrepancy = items.some(
          (item) => item.expectedQty > 0 && item.receivedQty !== item.expectedQty
        );
        if (hasDiscrepancy) discrepancies++;
      }
      return { expected, inProgress, completed, discrepancies, total: receivers.length };
    }),

  /**
   * Start a receiver — updates its status to 1 (In Progress) in Extensiv.
   */
  startReceipt: protectedProcedure
    .input(z.object({ configId: z.number(), transactionId: z.number() }))
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });
      const result = await startReceipt(config, input.transactionId);
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to start receipt in Extensiv",
        });
      }
      return { success: true };
    }),
});

// ─── Put Away Assistant ───────────────────────────────────────────────────────
const putAwayRouter = router({
  /**
   * Suggest optimal put-away location(s) for a scanned SKU.
   *
   * Logic:
   *  1. Fetch all inventory records for the customer/facility.
   *  2. Find existing stock for this SKU grouped by location.
   *  3. Classify each location using the location_configs table:
   *     - "pick_face" if locationType === 'pick_face'
   *     - "warehouse" otherwise
   *  4. Rank suggestions:
   *     a. CONSOLIDATE: pick_face locations that already hold this SKU
   *        (sorted by FEFO: earliest expiry / lowest receiveItemId first).
   *     b. CONSOLIDATE: warehouse locations that already hold this SKU.
   *     c. EMPTY pick_face: locations with no stock for this SKU.
   *     d. EMPTY warehouse: locations with no stock for this SKU.
   */
  suggest: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        facilityId: z.number(),
        customerId: z.number(),
        sku: z.string().min(1),
        lotNumber: z.string().optional(),
        expirationDate: z.string().optional(),
        qty: z.number().min(1).default(1),
      })
    )
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });

      // Fetch inventory and location configs in parallel
      const [inventory, locationCfgs, extensivLocations] = await Promise.all([
        fetchInventory(config, input.customerId, input.facilityId),
        getLocationConfigsByCustomer(input.configId, input.customerId),
        fetchExtensivLocations(config, input.facilityId),
      ]);

      // Build location type map: locationId -> locationType
      const locationTypeMap = new Map<number, "pick_face" | "warehouse" | "staging">();
      for (const lc of locationCfgs) {
        locationTypeMap.set(lc.locationId, lc.locationType);
      }

      // Build a map of locationName -> locationType from Extensiv locations
      // Locations named 'Pick face' are pick_face; all others are warehouse
      const locationNameTypeMap = new Map<string, "pick_face" | "warehouse">();
      for (const loc of extensivLocations) {
        const isPickFace = loc.name.toLowerCase().includes("pick face") ||
          locationTypeMap.get(loc.locationId) === "pick_face";
        locationNameTypeMap.set(loc.name, isPickFace ? "pick_face" : "warehouse");
      }

      // Group inventory by location for this SKU
      const skuInventory = inventory.filter(
        (rec) => rec.itemIdentifier.sku.toLowerCase() === input.sku.toLowerCase()
      );

      // Group all inventory by location name to know which locations have stock
      const locationStockMap = new Map<string, typeof inventory>();
      for (const rec of inventory) {
        const locName = rec.locationIdentifier?.nameKey?.name ?? "Unknown";
        if (!locationStockMap.has(locName)) locationStockMap.set(locName, []);
        locationStockMap.get(locName)!.push(rec);
      }

      // Locations that already have this SKU (consolidation candidates)
      const skuLocationMap = new Map<string, typeof skuInventory>();
      for (const rec of skuInventory) {
        const locName = rec.locationIdentifier?.nameKey?.name ?? "Unknown";
        if (!skuLocationMap.has(locName)) skuLocationMap.set(locName, []);
        skuLocationMap.get(locName)!.push(rec);
      }

      type Suggestion = {
        locationName: string;
        locationType: "pick_face" | "warehouse";
        reason: "consolidate" | "empty_pick_face" | "empty_warehouse";
        currentQty: number;
        expirationDate?: string;
        lotNumber?: string;
        priority: number; // lower = better
      };

      const suggestions: Suggestion[] = [];

      // 1. Consolidation candidates (locations already holding this SKU)
      for (const [locName, recs] of Array.from(skuLocationMap.entries())) {
        const locType = locationNameTypeMap.get(locName) ?? "warehouse";
        // FEFO: sort by expiry date then receiveItemId
        const sorted = [...recs].sort((a, b) => {
          if (a.expirationDate && b.expirationDate) {
            return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
          }
          if (a.expirationDate) return -1;
          if (b.expirationDate) return 1;
          return a.receiveItemId - b.receiveItemId;
        });
        const totalQty = recs.reduce((s: number, r: { available: number }) => s + r.available, 0);
        suggestions.push({
          locationName: locName,
          locationType: locType,
          reason: "consolidate",
          currentQty: totalQty,
          expirationDate: sorted[0]?.expirationDate,
          lotNumber: sorted[0]?.lotNumber,
          priority: locType === "pick_face" ? 1 : 2,
        });
      }

      // 2. Empty pick_face locations (no stock at all)
      for (const loc of extensivLocations) {
        if (locationStockMap.has(loc.name)) continue; // has stock
        const locType = locationNameTypeMap.get(loc.name) ?? "warehouse";
        if (locType !== "pick_face") continue;
        suggestions.push({
          locationName: loc.name,
          locationType: "pick_face",
          reason: "empty_pick_face",
          currentQty: 0,
          priority: 3,
        });
      }

      // 3. Empty warehouse locations (no stock at all)
      for (const loc of extensivLocations) {
        if (locationStockMap.has(loc.name)) continue;
        const locType = locationNameTypeMap.get(loc.name) ?? "warehouse";
        if (locType !== "warehouse") continue;
        suggestions.push({
          locationName: loc.name,
          locationType: "warehouse",
          reason: "empty_warehouse",
          currentQty: 0,
          priority: 4,
        });
      }

      // Sort by priority, then alphabetically within same priority
      suggestions.sort((a, b) => a.priority - b.priority || a.locationName.localeCompare(b.locationName));

      return {
        sku: input.sku,
        facilityId: input.facilityId,
        customerId: input.customerId,
        suggestions: suggestions.slice(0, 20), // top 20 suggestions
        totalInventoryLocations: locationStockMap.size,
        skuLocations: skuLocationMap.size,
      };
    }),

  /**
   * Log a completed put-away scan to the session history.
   */
  logScan: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        facilityId: z.number(),
        customerId: z.number(),
        customerName: z.string().optional(),
        sku: z.string().min(1),
        description: z.string().optional(),
        lotNumber: z.string().optional(),
        expirationDate: z.string().optional(),
        confirmedLocation: z.string().optional(),
        confirmedLocationType: z.enum(["pick_face", "warehouse", "staging"]).optional(),
        suggestedLocation: z.string().optional(),
        suggestedLocationType: z.enum(["pick_face", "warehouse", "staging"]).optional(),
        qty: z.number().min(1).default(1),
        sessionId: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      await createPutAwayScan(input);
      return { success: true };
    }),

  /**
   * List all scans for a session.
   */
  sessionScans: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ input }) => {
      return listPutAwayScans(input.sessionId);
    }),

  /**
   * List recent scans for a config (across all sessions).
   */
  recentScans: protectedProcedure
    .input(z.object({ configId: z.number(), limit: z.number().min(1).max(500).default(200) }))
    .query(async ({ input }) => {
      return listPutAwayScansByConfig(input.configId, input.limit);
    }),

  /**
   * Clear all scans for a session.
   */
  clearSession: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await clearPutAwaySession(input.sessionId);
      return { success: true };
    }),
});

// Extend _appRouter with laneThresholds, overdueAlert, clientVisibility, returns, cortex, qcScanner, and palletScanner
export const appRouter = router({
  ..._appRouter._def.record,
  laneThresholds: laneThresholdRouter,
  overdueAlert: overdueAlertRouter,
  clientVisibility: clientVisibilityRouter,
  returns: returnsRouter,
  cortex: cortexRouter,
  qcScanner: qcScannerRouter,
  palletScanner: palletScannerRouter,
  receiving: receivingRouter,
  putAway: putAwayRouter,
});
export type AppRouter = typeof appRouter;
