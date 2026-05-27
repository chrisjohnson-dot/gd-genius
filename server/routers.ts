import { z } from "zod";
import { sql } from "drizzle-orm";
import { directlyRouter } from "./routers/directly";
import { getDb } from "./db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { storagePut } from "./storage";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  upsertUser,
  getExtensivConfigs,
  getExtensivConfigById,
  upsertExtensivConfig,
  deleteExtensivConfig,
  getLocationConfigs,
  getLocationConfigsByCustomer,
  upsertLocationConfig,
  toggleLocationConfigActive,
  deleteLocationConfig,
  deleteLocationConfigsByIds,
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
  getClientChannelMap,
  dismissZeroBidWarning,
  getAllSlaRules,
  getSlaRulesForClient,
  upsertSlaRule,
  deleteSlaRule,
  getShipToRulesForClient,
  listAllShipToRules,
  upsertShipToRule,
  deleteShipToRule,
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
  getReturnClientInstructions,
  countUnreadReturnClientInstructions,
  markReturnClientInstructionsRead,
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
  getQcSessionByTransactionId,
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
  resolveRunVerification,
  createPutAwayScan,
  listPutAwayScans,
  listPutAwayScansByConfig,
  listPutAwayList,
  clearPutAwaySession,
  upsertReceiptItemConfirmation,
  getReceiptItemConfirmations,
  deleteReceiptItemConfirmations,
  createMuLabels,
  getMuLabelsForTransaction,
  deleteMuLabelsForTransaction,
  getPutAwayPriorities,
  savePutAwayPriorities,
  deletePutAwayPriorities,
  getWhLocationConfig,
  listWhLocationConfigs,
  upsertWhLocationConfig,
  deleteWhLocationConfig,
  type AisleRule,
  getLabelScanSettings,
  upsertLabelScanSettings,
  createLabelFile,
  getLabelFileByBarcode,
  getLabelFileById,
  listLabelFiles,
  deleteLabelFile,
  createLabelScanSession,
  getLabelScanSessionById,
  listLabelScanSessions,
  updateLabelScanSession,
  createLabelScanCarton,
  getLabelScanCartonsBySession,
  getLabelScanCartonById,
  updateLabelScanCarton,
  getOrderById,
  getLatestSlaSnapshotForOrder,
  getOrderAuditHistory,
  listQcAuditLog,
  type QcAuditEvent,
  type VerificationStatus,
  type OrderVerificationResult,
  listPackageSizesForClient,
  listAllPackageSizes,
  createPackageSize,
  deletePackageSize,
  updatePackageSize,
  logSmallParcelAuditEvent,
  getSmallParcelAuditLog,
  countSmallParcelAuditLog,
  listSupervisorPins,
  createSupervisorPin,
  updateSupervisorPin,
  deleteSupervisorPin,
  verifySupervisorPin,
  listHighValueSkus,
  addHighValueSku,
  removeHighValueSku,
  isHighValueSku,
  listTechshipConfigs,
  getTechshipConfig,
  upsertTechshipConfig,
  deleteTechshipConfig,
  getActiveShippingIntegration,
  setActiveShippingIntegration,
  getSmallParcelSetting,
  setSmallParcelSetting,
  getClientPackagingEnabled,
  upsertClientPackagingEnabled,
  getLastOrderDatePerClient,
  getCustomerPalletDefaultFromDb,
  listCarrierAccounts,
  getCarrierAccount,
  upsertCarrierAccount,
  deleteCarrierAccount,
  listCustomerShippingRules,
  getCustomerShippingRule,
  getCustomerShippingRuleByCustomerId,
  upsertCustomerShippingRule,
  deleteCustomerShippingRule,
  listRateWizardShipments,
  createRateWizardShipment,
  updateRateWizardShipment,
  getLatestRatedShipmentForOrder,
  getLatestRatedShipmentBySessionId,
  createShipment,
  updateShipment,
  listShipmentsUnified,
  countShipmentsUnified,
  getShipmentById,
  updateShipwellStatus,
  updateShipwellBidCount,
  findShipmentByShipwellId,
} from "./db";
import { createVeeqoClient, lbsToOz, type VeeqoAddress } from "./veeqo";
import { fireCortexWebhook, pushShipmentToClearSight } from "./cortex/webhook";
import { pushPurchaseOrderToOpFi, flushPendingPurchaseOrderPushes } from "./purchaseOrderPush";
import { purchaseOrders, carrierRoutingTable, receivePalletSessions, pickupSessions, pickupScans, carrierAppointments, qcScanSessions } from "../drizzle/schema";
import { fetchAllCarrierRates, getCarrierConnectionStatus, hasAnyCarrierCredentials, buyCarrierLabel, voidFedExLabel, type CarrierRateInput, type CarrierLabelInput } from "./carriers";
import { evaluateVerdict, generateQcPassZpl } from "./productionLine";
import {
  createProductionRun,
  getActiveProductionRun,
  getProductionRunByRunId,
  updateProductionRun,
  listProductionRuns,
  createProductionScan,
  listProductionScans,
  getProductionSkuConfig,
  upsertProductionSkuConfig,
  listProductionSkuConfigs,
  deleteProductionSkuConfig,
  getEdiRetailers,
  getEdiRetailerById,
  createEdiRetailer,
  updateEdiRetailer,
  deleteEdiRetailer,
  createEdiEscalation,
  getEdiEscalations,
  resolveEdiEscalation,
  dismissEdiEscalation,
  getSkuWeightOverrides,
  listAllSkuWeightOverrides,
  getSkuWeightOverrideMap,
  upsertSkuWeightOverride,
  deleteSkuWeightOverride,
} from "./db";
import { startSchedule, stopSchedule, triggerManualRun } from "./scheduler/autoRun";
import { dockManagerRouter } from "./routers/dockManager";
import { getCarrierMarkups, getMarkupPct, applyMarkup, testOpFiConnection } from "./opfiRateSheets";
import { sendOverdueAlertNow, rescheduleOverdueAlert } from "./scheduler/overdueAlert";
import { syncOrdersNow, getLastSyncInfo } from "./scheduler/orderSync";
import { recordSlaNightlySnapshot } from "./scheduler/slaNightlySnapshot";
import { fetchCustomers, fetchOpenOrders, fetchInventory, fetchItemDescriptions, fetchItemUpcMap,
  fetchItemCaseAmountMap, fetchItemCartonWeightMap, fetchItemUnitWeightMap, fetchInventoryByMuLabel, fetchOrderWithDetail, moveInventory, allocateOrder, deallocateOrder, updateOrderProposedAllocations, fetchAllFacilities, fetchCustomersForFacility, fetchExtensivLocations, fetchOrdersByReferenceNum, fetchReceivers, fetchReceiverDetail, startReceipt,
  completeReceipt, updateReceiverItemQty, assignMULabelsToReceiver, markOrderShipped, markOrderPacked, fetchShippedOrders, fetchAllCustomersRaw, fetchItemDimsBySkus, clearItemDimsCache, updateItemPackageUnitWeight } from "./extensiv/api";
import { getExtensivToken, invalidateToken } from "./extensiv/client";
import { runAllocationEngine, LocationTypeMap } from "./allocation/engine";
import { createShipwellClient, normalizeShipwellStatus } from "./shipwell/api";

// 10-minute in-memory cache for pallet weight calculation (carton weights + case amounts)
const _palletWeightCache = new Map<string, {
  cartonWeightMap: Map<string, number>;
  caseAmountMap: Map<string, number>;
  unitWeightMap: Map<string, number>;
  expiresAt: number;
}>();

// 30-minute in-memory cache for UPC→SKU map per customer (keyed by "configId:customerId")
// Eliminates repeated Extensiv API calls on every scan when a UPC isn't yet stored in the DB.
const _upcMapCache = new Map<string, {
  upcToSku: Map<string, string>;
  expiresAt: number;
}>();
const UPC_MAP_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const _appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    sharedLogin: publicProcedure
      .input(z.object({ username: z.string(), password: z.string(), rememberMe: z.boolean().default(true) }))
      .mutation(async ({ input, ctx }) => {
        const { sharedLoginUsername, sharedLoginPassword } = ENV;
        if (
          !sharedLoginUsername ||
          !sharedLoginPassword ||
          input.username !== sharedLoginUsername ||
          input.password !== sharedLoginPassword
        ) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
        }
        // Use a fixed shared openId so the user record is stable
        const sharedOpenId = "shared-team-user";
        await upsertUser({
          openId: sharedOpenId,
          name: "GD Team",
          email: null,
          loginMethod: "shared",
          lastSignedIn: new Date(),
        });
        // Remember me: 1 year; otherwise 8 hours (session cookie with no maxAge)
        const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
        const expiresInMs = input.rememberMe ? ONE_YEAR_MS : EIGHT_HOURS_MS;
        const sessionToken = await sdk.signSession(
          { openId: sharedOpenId, appId: ENV.appId || "gd-agent", name: "GD Team" },
          { expiresInMs }
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        // Only set maxAge (persistent cookie) when rememberMe is true
        if (input.rememberMe) {
          ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        } else {
          // Session cookie: no maxAge — expires when browser closes
          ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        }
        return { success: true } as const;
      }),
    // Login for restricted team accounts (qc_operator role)
    teamLogin: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const bcrypt = await import("bcryptjs");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { teamAccounts } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        const [account] = await db.select().from(teamAccounts)
          .where(eq(teamAccounts.username, input.username.trim()));
        if (!account || !account.active) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
        }
        const valid = await bcrypt.compare(input.password, account.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
        }
        // Use a stable openId derived from the team account id
        const openId = `team-account-${account.id}`;
        await upsertUser({
          openId,
          name: account.name,
          email: null,
          loginMethod: "team",
          role: "user",
          lastSignedIn: new Date(),
        });
        const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
        // Note: SessionPayload does not support a 'role' field — role is identified
        // via loginMethod='team' on the users table, which is set above in upsertUser.
        const sessionToken = await sdk.signSession(
          { openId, appId: ENV.appId || "gd-agent", name: account.name },
          { expiresInMs: EIGHT_HOURS_MS }
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        return { success: true, role: account.role, name: account.name } as const;
      }),
  }),
  // ─── Team Account Management (admin only) ─────────────────────────────────
  teamAccounts: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { teamAccounts } = await import("../drizzle/schema.js");
      const rows = await db.select({
        id: teamAccounts.id,
        username: teamAccounts.username,
        name: teamAccounts.name,
        role: teamAccounts.role,
        active: teamAccounts.active,
        createdAt: teamAccounts.createdAt,
      }).from(teamAccounts);
      return rows;
    }),
    create: protectedProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1), name: z.string().min(1), role: z.string().default("qc_operator") }))
      .mutation(async ({ input }) => {
        const bcrypt = await import("bcryptjs");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { teamAccounts } = await import("../drizzle/schema.js");
        const passwordHash = await bcrypt.hash(input.password, 10);
        await db.insert(teamAccounts).values({
          username: input.username.trim(),
          passwordHash,
          name: input.name.trim(),
          role: input.role,
          active: true,
        });
        return { success: true };
      }),
    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { teamAccounts } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        await db.update(teamAccounts).set({ active: false }).where(eq(teamAccounts.id, input.id));
        return { success: true };
      }),
    resetPassword: protectedProcedure
      .input(z.object({ id: z.number(), newPassword: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const bcrypt = await import("bcryptjs");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { teamAccounts } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        const passwordHash = await bcrypt.hash(input.newPassword, 10);
        await db.update(teamAccounts).set({ passwordHash }).where(eq(teamAccounts.id, input.id));
        return { success: true };
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

    /**
     * Diagnostic: fetch all customers from Extensiv and classify each one as
     * syncing or not-syncing (with the reason why it was filtered out).
     */
    diagnosticClients: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.id);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const clientConfig = {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          tplGuid: config.tplGuid,
          userLoginId: config.userLoginId,
          baseUrl: config.baseUrl,
        };

        // Fetch all facilities for this config
        const facilities = await fetchAllFacilities(clientConfig);

        // Fetch all raw customers (paginated) with their embedded facilities + deactivated flag
        const allRaw = await fetchAllCustomersRaw(clientConfig);

        // Build set of facility IDs we actually sync
        const syncedFacilityIds = new Set(facilities.map((f) => f.id));

        const results = allRaw.map((c) => {
          const syncingFacilityNames = c.facilityNames.filter((_, i) => syncedFacilityIds.has(c.facilityIds[i]));

          if (c.deactivated) {
            return { id: c.id, name: c.name, status: "not_syncing" as const, reason: "Deactivated in Extensiv", facilityNames: c.facilityNames, syncingFacilityNames: [] };
          }
          if (c.facilityIds.length === 0) {
            return { id: c.id, name: c.name, status: "not_syncing" as const, reason: "No facility assigned in Extensiv", facilityNames: [], syncingFacilityNames: [] };
          }
          if (syncingFacilityNames.length === 0) {
            return {
              id: c.id, name: c.name, status: "not_syncing" as const,
              reason: `Assigned to facilit${c.facilityNames.length === 1 ? "y" : "ies"} not in sync scope: ${c.facilityNames.join(", ")}`,
              facilityNames: c.facilityNames,
              syncingFacilityNames: [],
            };
          }
          return { id: c.id, name: c.name, status: "syncing" as const, reason: null, facilityNames: c.facilityNames, syncingFacilityNames };
        }).sort((a, b) => a.name.localeCompare(b.name));

        return {
          totalCustomers: results.length,
          syncing: results.filter((c) => c.status === "syncing").length,
          notSyncing: results.filter((c) => c.status === "not_syncing").length,
          facilities: facilities.map((f) => ({ id: f.id, name: f.name })),
          customers: results,
        };
      }),
  }),

  // ─── Location Config ───────────────────────────────────────────────────────
  locations: router({
    list: protectedProcedure
      .input(z.object({ configId: z.number(), facilityId: z.number().optional() }))
      .query(async ({ input }) => {
        return getLocationConfigs(input.configId, input.facilityId);
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
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await upsertLocationConfig(input);
        return { success: true };
      }),
    toggleActive: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await toggleLocationConfigActive(input.id, input.isActive);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLocationConfig(input.id);
        return { success: true };
      }),
    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input }) => {
        await deleteLocationConfigsByIds(input.ids);
        return { success: true, deleted: input.ids.length };
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

    // Bulk-seed pick face locations from Extensiv using a name prefix pattern
    seedPickFaceFromExtensiv: protectedProcedure
      .input(z.object({
        configId: z.number(),
        facilityId: z.number(),
        facilityName: z.string().optional(),
        // Name prefix to match pick face locations (e.g. "HR" matches HR001, HR002, ...)
        locationPrefix: z.string(),
        // Customers to assign these pick face locations to
        customers: z.array(z.object({
          customerId: z.number(),
          customerName: z.string(),
        })),
        dryRun: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });

        // Fetch all locations from Extensiv for this facility
        const allLocations = await fetchExtensivLocations(config, input.facilityId);
        console.log(`[seedPickFaceFromExtensiv] Fetched ${allLocations.length} locations for facility ${input.facilityId}`);

        const prefix = input.locationPrefix.trim().toUpperCase();

        // Filter to locations whose name starts with the given prefix
        // Exclude staging locations (they end in -Stage or -Staging)
        const matchedLocations = allLocations.filter((l) => {
          const name = l.name.trim().toUpperCase();
          const isStaging = name.endsWith("-STAGE") || name.endsWith("-STAGING") || name.includes("STAGING");
          return name.startsWith(prefix) && !isStaging;
        });

        console.log(`[seedPickFaceFromExtensiv] ${matchedLocations.length} locations match prefix "${prefix}"`);

        // Build the full set of entries: each matched location × each customer
        const entries: Array<{ customerId: number; customerName: string; locationId: number; locationName: string }> = [];
        for (const customer of input.customers) {
          for (const loc of matchedLocations) {
            entries.push({
              customerId: customer.customerId,
              customerName: customer.customerName,
              locationId: loc.locationId,
              locationName: loc.name.trim(),
            });
          }
        }

        if (!input.dryRun) {
          for (const entry of entries) {
            await upsertLocationConfig({
              configId: input.configId,
              customerId: entry.customerId,
              customerName: entry.customerName,
              facilityId: input.facilityId,
              facilityName: input.facilityName,
              locationId: entry.locationId,
              locationName: entry.locationName,
              locationType: "pick_face",
            });
          }
        }

        return {
          success: true,
          totalLocations: allLocations.length,
          matchedLocations: matchedLocations.length,
          seeded: entries.length,
          customers: input.customers.length,
          preview: entries,
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
        const apiFacilities = await fetchAllFacilities(config);
        console.log(`[Extensiv] fetchAllFacilities returned ${apiFacilities.length} facilities:`, JSON.stringify(apiFacilities));

        // Merge with facilities known from the order_tracking table so warehouses that
        // Extensiv's /properties/facilities API returns with id=0 (or omits entirely)
        // still appear in the UI. The DB is the authoritative source of facility names
        // because it is populated by the order sync which reads facilityIdentifier from
        // individual order records.
        try {
          const db = await (await import("./db.js")).getDb();
          if (db) {
            const { orderTracking } = await import("../drizzle/schema.js");
            const { sql: drizzleSql } = await import("drizzle-orm");
            const dbFacilities = await db
              .selectDistinct({ facilityId: orderTracking.facilityId, facilityName: orderTracking.facilityName })
              .from(orderTracking)
              .where(drizzleSql`${orderTracking.facilityId} IS NOT NULL AND ${orderTracking.facilityName} IS NOT NULL`);
            const merged = new Map<number, { id: number; name: string }>();
            // DB rows first (most reliable)
            for (const r of dbFacilities) {
              if (r.facilityId && r.facilityName) merged.set(r.facilityId, { id: r.facilityId, name: r.facilityName });
            }
            // API results can override name if present
            for (const f of apiFacilities) {
              if (f.id > 0) merged.set(f.id, { id: f.id, name: f.name });
            }
            const result = Array.from(merged.values()).sort((a, b) => a.id - b.id);
            console.log(`[Extensiv] facilities merged (api=${apiFacilities.length}, db=${dbFacilities.length}, total=${result.length}):`, JSON.stringify(result));
            return result;
          }
        } catch (err) {
          console.warn("[Extensiv] facilities DB merge failed, using API result only:", err);
        }
        return apiFacilities;
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

    /**
     * Returns all locations for a facility from Extensiv.
     * Used by the Put Away Priority Config screen.
     */
    locations: protectedProcedure
      .input(z.object({ configId: z.number(), facilityId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        return fetchExtensivLocations(config, input.facilityId);
      }),

    customers: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        return fetchCustomers(config);
      }),

    /**
     * Looks up a location by name in Extensiv for a given facility.
     * Returns the matching location's id and the customer's id, or null if not found.
     * Used by the Add Location dialog to auto-fill IDs from a location name.
     */
    lookupLocation: protectedProcedure
      .input(z.object({ configId: z.number(), facilityId: z.number(), locationName: z.string() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const locations = await fetchExtensivLocations(config, input.facilityId);
        const needle = input.locationName.trim().toLowerCase();
        // Return all locations whose name contains the search string (prefix or substring match)
        const matches = locations.filter((l) => l.name.trim().toLowerCase().includes(needle));
        return matches.map((l) => ({ locationId: l.locationId, locationName: l.name }));
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
              const unallocated = orders.filter((o) => !o.readOnly.fullyAllocated);
              return { customerId, count: unallocated.length };
            } catch {
              return { customerId, count: 0 };
            }
          })
        );
        return results;
      }),

    // ── DB-backed order queries (fast — reads from local order_tracking cache) ──────────────────
    /**
     * Returns open, unallocated orders for a customer+facility from the local DB cache.
     * Instant response — no Extensiv API call. Data is at most ~1 hour stale (hourly sync).
     */
    openOrdersFromDb: protectedProcedure
      .input(z.object({ customerId: z.number(), facilityId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { orderTracking } = await import("../drizzle/schema.js");
        const { and, eq, or, isNull } = await import("drizzle-orm");
        const rows = await db
          .select()
          .from(orderTracking)
          .where(
            and(
              eq(orderTracking.clientId, input.customerId),
              eq(orderTracking.facilityId, input.facilityId),
              or(
                eq(orderTracking.lifecycleStatus, "unallocated"),
                isNull(orderTracking.lifecycleStatus)
              )
            )
          )
          .orderBy(orderTracking.creationDate);
        return rows
          .filter((r) => (r.extensivStatus ?? 0) <= 2)
          .map((r) => ({
            readOnly: {
              orderId: r.extensivOrderId,
              status: r.extensivStatus ?? 0,
              isClosed: false,
              fullyAllocated: false,
              creationDate: r.creationDate ?? null,
              facilityIdentifier: { id: r.facilityId, name: r.facilityName ?? "" },
            },
            referenceNum: r.referenceNum ?? "",
            poNum: r.poNum ?? null,
            shipTo: {
              companyName: r.shipToName ?? "",
              city: r.shipToCity ?? "",
              state: "",
            },
            // Use skuCount as line count proxy; totalPieces for piece count
            orderItems: Array.from({ length: r.skuCount ?? 0 }, () => ({ qty: 0 })),
            _fromDb: true as const,
            _dbTotalPieces: r.totalPieces ?? 0,
            _dbSkuCount: r.skuCount ?? 0,
          }));
      }),
    /**
     * Returns unallocated order counts per customer for a facility from the local DB cache.
     * Instant response — no Extensiv API call.
     */
    openOrderCountsFromDb: protectedProcedure
      .input(z.object({ customerIds: z.array(z.number()), facilityId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return input.customerIds.map((id) => ({ customerId: id, count: 0 }));
        if (input.customerIds.length === 0) return [];
        const { orderTracking } = await import("../drizzle/schema.js");
        const { and, eq, inArray, or, isNull, sql: drizzleSql } = await import("drizzle-orm");
        const rows = await db
          .select({
            clientId: orderTracking.clientId,
            count: drizzleSql<number>`COUNT(*)`
          })
          .from(orderTracking)
          .where(
            and(
              inArray(orderTracking.clientId, input.customerIds),
              eq(orderTracking.facilityId, input.facilityId),
              or(
                eq(orderTracking.lifecycleStatus, "unallocated"),
                isNull(orderTracking.lifecycleStatus)
              )
            )
          )
          .groupBy(orderTracking.clientId);
        const countMap = new Map(rows.map((r) => [r.clientId, Number(r.count)]));
        return input.customerIds.map((id) => ({ customerId: id, count: countMap.get(id) ?? 0 }));
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

        // ── Pre-flight: validate location config completeness for every customer ──
        const preflightErrors: string[] = [];
        for (const customer of input.customers) {
          if (customer.orderIds.length === 0) continue;
          const lcData = await getLocationConfigsByCustomer(input.configId, customer.customerId);
          const hasStaging = lcData.some((lc) => lc.locationType === "staging");
          if (!hasStaging) {
            preflightErrors.push(`${customer.customerName}: no staging location configured`);
          }
        }
        if (preflightErrors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Location config incomplete — fix these before running:\n• ${preflightErrors.join("\n• ")}`,
          });
        }

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
          const stagingRecs = inventory.filter(r => (r.locationIdentifier?.nameKey?.name ?? "").toLowerCase().includes("staging"));

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

          // Resolve configured pick face location (if any) so the engine never falls back to the literal "Pick Face" string
          const pfConfig = locationConfigsData.find((lc) => lc.locationType === "pick_face");
          const configuredPfId = pfConfig?.locationId;
          const configuredPfName = pfConfig?.locationName;
          // All pick face locations for smart per-SKU routing
          const allPickFaceLocations = locationConfigsData
            .filter((lc) => lc.locationType === "pick_face")
            .map((lc) => ({ locationId: lc.locationId, locationName: lc.locationName }));

          // Look up per-customer rules (e.g. noLotMixing, locationPriorityPatterns)
          const customerRule = await getCustomerRule(input.configId, customer.customerId);
          const noLotMixing = customerRule?.noLotMixing ?? false;
          const locationPriorityPatterns = (customerRule?.locationPriorityPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
          const locationExclusionPatterns = (customerRule?.locationExclusionPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
          const customerMinShelfLifeDays = customerRule?.minShelfLifeDays ?? null;
          const preferredBuildingMinPrefix = customerRule?.preferredBuildingMinPrefix ?? null;
          const preferredBuildingPrefixes = customerRule?.preferredBuildingPrefixes ?? null;
          // Run allocation engine for this customer
          const result = runAllocationEngine(
            orders,
            inventory,
            locationTypeMap,
            customer.stagingLocationId,
            customer.stagingLocationName,
            descMap,
            noLotMixing,
            configuredPfId,
            configuredPfName,
            locationPriorityPatterns,
            locationExclusionPatterns,
            customerMinShelfLifeDays,
            allPickFaceLocations,
            preferredBuildingMinPrefix,
            preferredBuildingPrefixes,
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

          // Resolve configured pick face location (if any) so the engine never falls back to the literal "Pick Face" string
          const pfConfigQ = locationConfigsData.find((lc) => lc.locationType === "pick_face");
          const configuredPfIdQ = pfConfigQ?.locationId;
          const configuredPfNameQ = pfConfigQ?.locationName;
          // All pick face locations for smart per-SKU routing
          const allPickFaceLocationsQ = locationConfigsData
            .filter((lc) => lc.locationType === "pick_face")
            .map((lc) => ({ locationId: lc.locationId, locationName: lc.locationName }));

          // Customer rules
          const customerRule = await getCustomerRule(input.configId, customer.id);
          const noLotMixing = customerRule?.noLotMixing ?? false;
          const locationPriorityPatterns = (customerRule?.locationPriorityPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
          const locationExclusionPatterns = (customerRule?.locationExclusionPatterns as Array<{ pattern: string; label: string }> | null) ?? [];
          const customerMinShelfLifeDaysQ = customerRule?.minShelfLifeDays ?? null;
          const preferredBuildingMinPrefixQ = customerRule?.preferredBuildingMinPrefix ?? null;
          const preferredBuildingPrefixesQ = customerRule?.preferredBuildingPrefixes ?? null;
          const result = runAllocationEngine(
            orders,
            inventory,
            locationTypeMap,
            customer.stagingLocationId,
            customer.stagingLocationName,
            descMap,
            noLotMixing,
            configuredPfIdQ,
            configuredPfNameQ,
            locationPriorityPatterns,
            locationExclusionPatterns,
            customerMinShelfLifeDaysQ,
            allPickFaceLocationsQ,
            preferredBuildingMinPrefixQ,
            preferredBuildingPrefixesQ,
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
        type PullListEntry = { receiveItemId: number; qty: number; toLocationId: number; toLocationName?: string; fromLocationId?: number; fromLocationName?: string; fromLocationType?: string; movement?: string };
        const globalPullList = (run.pullList ?? []) as PullListEntry[];
        // Only send warehouse→staging moves to Extensiv here.
        // Exclude items already in staging (fromLocationType === "staging") AND
        // exclude pick-face replenishment moves (movement === "to_pick_face") — those
        // have a pick face location as destination and must NOT be sent as staging moves.
        const stagingMoves = globalPullList.filter(
          (p) => p.fromLocationType !== "staging" && p.movement !== "to_pick_face"
        );
        // Track which destination groups succeeded so we can roll back on partial failure
        const completedStagingMoves: Array<{ destId: number; destName: string; items: Array<{ receiveItemId: number; quantity: number }>; sourceId: number; sourceName: string }> = [];
        if (stagingMoves.length > 0) {
          // Group by toLocationId (there may be multiple staging locations in multi-customer runs)
          const movesByDest = new Map<number, { name: string; sourceId: number; sourceName: string; items: Array<{ receiveItemId: number; quantity: number }> }>();
          for (const p of stagingMoves) {
            if (!movesByDest.has(p.toLocationId)) movesByDest.set(p.toLocationId, { name: p.toLocationName ?? "", sourceId: p.fromLocationId ?? 0, sourceName: p.fromLocationName ?? "", items: [] });
            movesByDest.get(p.toLocationId)!.items.push({ receiveItemId: p.receiveItemId, quantity: p.qty });
          }
          for (const [destId, { name: destName, sourceId, sourceName, items }] of Array.from(movesByDest.entries())) {
            console.log(`[confirm] Moving ${items.length} items to staging location ${destId} (${destName})`);
            const moveResult = await moveInventory(config, destId, destName, items, run.facilityId);
            if (!moveResult.success) {
              console.error(`[confirm] Move to staging ${destId} failed: ${moveResult.error}`);
              errors.push(`Move to staging failed: ${moveResult.error}`);
            } else {
              console.log(`[confirm] Move to staging ${destId} succeeded`);
              completedStagingMoves.push({ destId, destName, items, sourceId, sourceName });
            }
          }
        } else {
          console.log(`[confirm] No staging moves needed (${globalPullList.length} pull list items, all already in staging)`);
        }
        // ABORT if any staging move failed — do NOT call the allocator.
        // Calling the allocator without inventory in staging would allocate orders
        // against inventory still in the warehouse, leaving an inconsistent state.
        // Attempt to roll back any moves that already succeeded to restore inventory to source locations.
        if (errors.length > 0) {
          const rollbackErrors: string[] = [];
          for (const completed of completedStagingMoves) {
            if (completed.sourceId > 0) {
              console.log(`[confirm] Rolling back ${completed.items.length} items from staging ${completed.destId} back to source ${completed.sourceId} (${completed.sourceName})`);
              const rollbackResult = await moveInventory(config, completed.sourceId, completed.sourceName, completed.items, run.facilityId);
              if (!rollbackResult.success) {
                rollbackErrors.push(`Rollback from staging ${completed.destId} to ${completed.sourceName} failed: ${rollbackResult.error}`);
                console.error(`[confirm] Rollback failed: ${rollbackResult.error}`);
              } else {
                console.log(`[confirm] Rollback succeeded for staging ${completed.destId}`);
              }
            }
          }
          const allErrors = [...errors, ...(rollbackErrors.length > 0 ? [`ROLLBACK ERRORS: ${rollbackErrors.join("; ")}`] : [])];
          await updateAllocationRun(input.runId, {
            status: "failed",
            confirmedAt: new Date(),
            notes: allErrors.join("; "),
          });
          await createAuditLog({
            userId: ctx.user.id,
            action: "allocation.confirm",
            entityType: "allocation_run",
            entityId: String(input.runId),
            details: { successCount: 0, errors: allErrors, abortedReason: "staging_move_failed", rolledBack: completedStagingMoves.length, rollbackErrors },
          });
          return { success: false, successCount: 0, errors: allErrors };
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
              // Advance the order_tracking lifecycle to 'allocated' so it appears
              // correctly in the Open Orders sheet immediately after confirmation.
              try {
                await updateOrderLifecycleStatus(runOrder.orderId, "allocated");
                console.log(`[confirm] Lifecycle advanced to 'allocated' for order ${runOrder.orderId}`);
              } catch (lcErr) {
                console.error(`[confirm] Failed to advance lifecycle for order ${runOrder.orderId}:`, lcErr);
              }
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

                  // Build planned qty from our allocationDetail (what we submitted to Extensiv)
                  const plannedQtyBySku = new Map<string, number>();
                  if (approvedDetail?.lineItems) {
                    for (const li of approvedDetail.lineItems) {
                      const total = li.allocations.reduce((s, a) => s + a.qty, 0);
                      plannedQtyBySku.set(li.sku, (plannedQtyBySku.get(li.sku) ?? 0) + total);
                    }
                  }

                  // Build Extensiv qty: prefer proposedAllocations (pre-confirm), fall back to item.qty
                  // After confirmation, proposedAllocations is cleared; fullyAllocated is the reliable signal.
                  const extensivQtyBySku = new Map<string, number>();
                  if (order.orderItems) {
                    for (const item of order.orderItems) {
                      const sku = item.itemIdentifier.sku;
                      const proposed = (item.proposedAllocations ?? []).reduce((s, a) => s + a.qty, 0);
                      // If proposedAllocations has data, use it; otherwise fall back to item.qty
                      // (item.qty is the ordered qty, not the allocated qty, but it's the best
                      // available signal when the order is already confirmed/closed)
                      const allocQty = proposed > 0 ? proposed : (fullyAllocated ? item.qty : 0);
                      extensivQtyBySku.set(sku, (extensivQtyBySku.get(sku) ?? 0) + allocQty);
                    }
                  }

                  const skuResults: OrderVerificationResult["skuResults"] = [];
                  for (const [sku, approvedQty] of Array.from(plannedQtyBySku.entries())) {
                    const extensivQty = extensivQtyBySku.get(sku) ?? 0;
                    skuResults.push({ sku, approvedQty, extensivQty, match: extensivQty >= approvedQty });
                  }

                  // Primary signal: Extensiv's fullyAllocated flag
                  let orderStatus: VerificationStatus;
                  if (fullyAllocated) {
                    orderStatus = "verified";
                  } else if (skuResults.some((r) => r.extensivQty > 0)) {
                    orderStatus = "partial";
                  } else {
                    orderStatus = "mismatch";
                  }
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

         type PullListEntry = { receiveItemId: number; qty: number; toLocationId: number; toLocationName?: string; fromLocationType?: string; movement?: string };
        const globalPullList = (run.pullList ?? []) as PullListEntry[];
        // Only retry warehouse→staging moves; skip pick-face replenishment moves.
        const stagingMoves = globalPullList.filter(
          (p) => p.fromLocationType !== "staging" && p.movement !== "to_pick_face"
        );
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
    resolveVerification: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
        await resolveRunVerification(input.runId);
        await createAuditLog({
          userId: ctx.user.id,
          action: "allocation.resolveVerification",
          entityType: "allocation_run",
          entityId: String(input.runId),
          details: { previousStatus: run.verificationStatus },
        });
        return { success: true };
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

    mismatchDetail: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .query(async ({ input }) => {
        const run = await getAllocationRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        // verificationDetail is stored as OrderVerificationResult[] on the run
        const detail = (run.verificationDetail ?? []) as Array<{
          orderId: number;
          referenceNum: string;
          status: string;
          fullyAllocated: boolean | null;
          skuResults: Array<{ sku: string; approvedQty: number; extensivQty: number; match: boolean }>;
          error?: string;
        }>;
        return {
          runId: run.id,
          verificationStatus: run.verificationStatus,
          verifiedAt: run.verifiedAt,
          orders: detail,
        };
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
          locationExclusionPatterns: z
            .array(z.object({ pattern: z.string(), label: z.string() }))
            .optional()
            .default([]),
          minShelfLifeDays: z.number().int().positive().optional().nullable(),
          notes: z.string().optional().nullable(),
          /** Minimum numeric aisle prefix for the preferred building (e.g. 12 means prefer 12xxx, 13xxx over 04xxx) */
          preferredBuildingMinPrefix: z.number().int().min(1).optional().nullable(),
          /** Comma-separated non-numeric location prefixes that also count as preferred building (e.g. "CV") */
          preferredBuildingPrefixes: z.string().optional().nullable(),
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
            locationExclusionPatterns: input.locationExclusionPatterns,
            minShelfLifeDays: input.minShelfLifeDays,
            notes: input.notes,
            preferredBuildingMinPrefix: input.preferredBuildingMinPrefix,
            preferredBuildingPrefixes: input.preferredBuildingPrefixes,
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
    /** Return distinct facilities that have at least one order in order_tracking */
    listKnownFacilities: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { orderTracking } = await import("../drizzle/schema.js");
      // Count orders per (facilityId, facilityName) pair so we can pick the dominant ID per name
      const rows = await db
        .select({
          facilityId: orderTracking.facilityId,
          facilityName: orderTracking.facilityName,
          cnt: sql<number>`COUNT(*)`,
        })
        .from(orderTracking)
        .where(sql`${orderTracking.facilityId} IS NOT NULL AND ${orderTracking.facilityName} IS NOT NULL`)
        .groupBy(orderTracking.facilityId, orderTracking.facilityName);
      // Deduplicate by facilityId — keep the row with the highest order count as the canonical name for that ID.
      // This prevents the same facilityId from appearing twice (e.g. stale rows with a mismatched facilityName).
      const byId = new Map<number, { facilityId: number; facilityName: string; cnt: number }>();
      for (const r of rows) {
        if (r.facilityId == null || r.facilityName == null) continue;
        const existing = byId.get(r.facilityId);
        if (!existing || (r.cnt ?? 0) > existing.cnt) {
          byId.set(r.facilityId, { facilityId: r.facilityId, facilityName: r.facilityName, cnt: r.cnt ?? 0 });
        }
      }
      return Array.from(byId.values())
        .map(({ facilityId, facilityName }) => ({ facilityId, facilityName }))
        .sort((a, b) => a.facilityName.localeCompare(b.facilityName));
    }),
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

    /** Return orders filtered by channel (b2b or d2c) */
    listByChannel: protectedProcedure
      .input(z.object({ channel: z.enum(["b2b", "d2c"]), facilityId: z.number().optional() }))
      .query(async ({ input }) => {
        const allOrders = await getTrackedOrders(input.facilityId);
        const lastSync = await getLastSyncTime();
        const syncInfo = getLastSyncInfo();
        const thresholds = await getLaneThresholds();
        const configIds = Array.from(new Set(allOrders.map((o) => o.configId)));
        const hiddenByConfig = new Map<number, Set<number>>();
        const channelByConfig = new Map<number, Map<number, "b2b" | "d2c" | "both">>();
        await Promise.all(
          configIds.map(async (cid) => {
            hiddenByConfig.set(cid, await getHiddenClientIds(cid));
            channelByConfig.set(cid, await getClientChannelMap(cid));
          })
        );
        const orders = allOrders.filter((o) => {
          const hidden = hiddenByConfig.get(o.configId);
          if (hidden?.has(o.clientId)) return false;
          const chMap = channelByConfig.get(o.configId);
          const ch = chMap?.get(o.clientId) ?? "both";
          return ch === input.channel || ch === "both";
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
        // ── Auto dock recommendation when order reaches ship_ready ──────────
        if (input.status === "ship_ready" && updated && !updated.outboundLocation) {
          try {
            const LANES = Array.from({ length: 26 }, (_, i) => i + 1);
            const POSITIONS = ["A", "B", "C", "D", "E"];
            const allOrders = await getShipReadyOrders();
            const facilityOrders = updated.facilityId
              ? allOrders.filter((o) => o.facilityId === updated.facilityId)
              : allOrders;
            const occupied = new Set<string>();
            for (const o of facilityOrders) {
              const raw = o.outboundLocation;
              if (!raw) continue;
              const cleaned = raw.trim().toUpperCase().replace(/^(OB[-\s]?|DOCK[-\s]?)/i, "");
              let m = cleaned.match(/^([A-E])[-\s]?(\d{1,2})$/);
              if (m) { const lane = parseInt(m[2], 10); if (lane >= 1 && lane <= 26) occupied.add(`${lane}-${m[1]}`); continue; }
              m = cleaned.match(/^(\d{1,2})[-\s]?([A-E])$/);
              if (m) { const lane = parseInt(m[1], 10); if (lane >= 1 && lane <= 26) occupied.add(`${lane}-${m[2]}`); }
            }
            const palletCount = Math.max(1, updated.palletCount ?? 1);
            let recommendedLabel: string | null = null;
            outer: for (const lane of LANES) {
              let runStart = -1; let runLen = 0;
              for (let i = 0; i < POSITIONS.length; i++) {
                const pos = POSITIONS[i];
                if (!occupied.has(`${lane}-${pos}`)) {
                  if (runStart === -1) runStart = i;
                  runLen++;
                  if (runLen >= palletCount) {
                    const block = POSITIONS.slice(runStart, runStart + palletCount);
                    recommendedLabel = block.length === 1 ? `${block[0]}${lane}` : `${block[0]}${lane}`;
                    break outer;
                  }
                } else { runStart = -1; runLen = 0; }
              }
            }
            if (!recommendedLabel) recommendedLabel = "OVERFLOW";
            await updateOutboundDetails(updated.id, { outboundLocation: recommendedLabel });
            updated.outboundLocation = recommendedLabel;
          } catch (_e) {
            // Non-fatal: dock recommendation failed, order still moves to ship_ready
          }
        }
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

    /** Return full detail for a single tracked order by its DB id */
    getOrderDetail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const order = await getOrderById(input.id);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

        // Fetch live line items from Extensiv (best-effort; return empty array on failure)
        let lineItems: Array<{
          sku: string;
          qty: number;
          lotNumber?: string | null;
          expirationDate?: string | null;
        }> = [];
        let shipTo: Record<string, string | null | undefined> | null = null;
        let shipFrom: Record<string, string | null | undefined> | null = null;
        let trackingNumber: string | null = null;
        let bolNumber: string | null = null;
        let carrierName: string | null = null;
        let shipVia: string | null = null;
        let totalWeight: number | null = null;
        try {
          const config = await getExtensivConfigById(order.configId);
          if (config) {
            const { order: ext } = await fetchOrderWithDetail(config, order.extensivOrderId);
            lineItems = (ext.orderItems ?? []).map((item) => ({
              sku: item.itemIdentifier?.sku ?? "?",
              qty: item.qty ?? 0,
              lotNumber: item.lotNumber ?? null,
              expirationDate: item.expirationDate ?? null,
            }));
            if (ext.shipTo) shipTo = ext.shipTo as Record<string, string | null | undefined>;
            if (ext.shipFrom) shipFrom = ext.shipFrom as Record<string, string | null | undefined>;
            trackingNumber = ext.readOnly?.trackingNumber ?? null;
            bolNumber = ext.readOnly?.bolNumber ?? null;
            carrierName = ext.readOnly?.carrierName ?? null;
            shipVia = ext.readOnly?.shipVia ?? null;
            totalWeight = ext.readOnly?.totalWeight ?? null;
          }
        } catch (err) {
          console.warn("[getOrderDetail] Extensiv fetch failed:", err);
        }

        // Parse savedElements JSON
        let savedElements: Array<{ name: string; value: string }> = [];
        if (order.savedElements) {
          try { savedElements = JSON.parse(order.savedElements); } catch { /* ignore */ }
        }
        // Fetch SLA snapshot and audit history in parallel
        const [slaSnapshot, auditHistory] = await Promise.all([
          getLatestSlaSnapshotForOrder(order.extensivOrderId),
          getOrderAuditHistory(order.extensivOrderId, 50),
        ]);
        return {
          order,
          lineItems,
          shipTo,
          shipFrom,
          savedElements,
          trackingNumber,
          bolNumber,
          carrierName,
          shipVia,
          totalWeight,
          slaSnapshot,
          auditHistory,
        };
      }),

    syncNow: protectedProcedure.mutation(async ({ ctx }) => {
      await createAuditLog({
        userId: ctx.user.id,
        action: "pickSchedule.syncNow",
        entityType: "order_tracking",
        entityId: null,
        details: {},
      });
      // Await the sync so the UI gets real results and the user knows when it's done
      try {
        const result = await syncOrdersNow();
        return {
          success: true,
          message: `Sync complete: ${result.message}`,
          inserted: result.inserted,
          updated: result.updated,
          removed: result.removed,
        };
      } catch (err) {
        console.error("[PickSchedule] Manual sync failed:", err);
        return { success: false, message: "Sync failed — check server logs for details.", inserted: 0, updated: 0, removed: 0 };
      }
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
          customer_reference_number: order.referenceNum ?? String(order.extensivOrderId),
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

        // Write a pending unified shipment record for Shipwell LTL
        try {
          const ltlShipmentId = await createShipment({
            platform: "shipwell",
            mode: "ltl",
            extensivOrderId: input.extensivOrderId,
            orderNumber: order.referenceNum ?? undefined,
            customerId: order.clientId ?? undefined,
            customerName: order.clientName ?? undefined,
            facilityName: order.facilityName ?? undefined,
            shipToName: order.shipToName ?? undefined,
            shipToCity: order.shipToCity ?? undefined,
            shipwellOrderId: po.id,
            status: "booked",
            bookedByUserId: String(ctx.user.id),
            bookedByName: ctx.user.name ?? undefined,
          });
          // Push immediately to ClearSight (non-blocking)
          void pushShipmentToClearSight(ltlShipmentId, "shipment.created");
        } catch (err) {
          console.error("[Shipwell] Failed to write unified shipment record:", err);
        }

        await createAuditLog({
          userId: ctx.user.id,
          action: "shipwell.sendOrder",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { shipwellOrderId: po.id, poUrl, environment: config.environment },
        });

        return { success: true, shipwellOrderId: po.id, poUrl };
      }),
    /** List all ship_ready orders that are not yet carrier_confirmed in Shipwell. */
    listUnconfirmed: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { orderTracking } = await import('../drizzle/schema.js');
      const { and, eq, or, isNull, inArray } = await import('drizzle-orm');
      const rows = await db
        .select()
        .from(orderTracking)
        .where(
          and(
            eq(orderTracking.lifecycleStatus, 'ship_ready'),
            or(
              isNull(orderTracking.shipwellStatus),
              inArray(orderTracking.shipwellStatus, ['quoting', 'tendered'])
            )
          )
        )
        .orderBy(orderTracking.shipReadyAt);
      return rows.map((r) => ({
        id: r.id,
        extensivOrderId: r.extensivOrderId,
        referenceNum: r.referenceNum,
        clientName: r.clientName,
        shipToName: r.shipToName,
        shipToCity: r.shipToCity,
        requiredShipDate: r.requiredShipDate,
        shipReadyAt: r.shipReadyAt,
        shipwellStatus: r.shipwellStatus,
        shipwellBidCount: r.shipwellBidCount,
        shipwellOrderId: r.shipwellOrderId,
        shipwellPoUrl: r.shipwellPoUrl,
        palletCount: r.palletCount,
        outboundLocation: r.outboundLocation,
        facilityId: r.facilityId,
        facilityName: r.facilityName,
        shipwellStatusUpdatedAt: r.shipwellStatusUpdatedAt,
        shipwellQuotingStartedAt: r.shipwellQuotingStartedAt,
        shipwellLastBidAt: r.shipwellLastBidAt,
      }));
    }),
    /**
     * Refresh the Shipwell status and bid count for a single order by polling the Shipwell API.
     * Uses the order's shipwellShipmentId (if available) for live status.
     */
    refreshOrderStatus: protectedProcedure
      .input(z.object({ extensivOrderId: z.number() }))
      .mutation(async ({ input }) => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "No Shipwell config found." });
        const orders = await getTrackedOrders();
        const order = orders.find((o) => o.extensivOrderId === input.extensivOrderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (!order.shipwellShipmentId && !order.shipwellOrderId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Order has not been sent to Shipwell yet." });
        }
        const client = createShipwellClient({
          email: config.email,
          password: config.password,
          environment: config.environment as "sandbox" | "production",
        });
        if (order.shipwellShipmentId) {
          const result = await client.getShipmentStatus(order.shipwellShipmentId);
          const newStatus = result.normalizedStatus !== "unknown" ? result.normalizedStatus : (order.shipwellStatus ?? null);
          if (newStatus) {
            await updateShipwellStatus(order.extensivOrderId, newStatus);
          }
          let bidCount: number | null = order.shipwellBidCount ?? null;
          if (newStatus === "quoting") {
            bidCount = await client.getBidCount(order.shipwellShipmentId);
            await updateShipwellBidCount(order.extensivOrderId, bidCount);
          }
          // Mirror to unified shipments table
          try {
            const mappedStatus: string | null =
              newStatus === "in_transit" ? "in_transit" :
              (newStatus === "carrier_confirmed" || newStatus === "tendered") ? "booked" :
              null;
            if (mappedStatus) {
              const transitRow = await findShipmentByShipwellId(order.shipwellShipmentId);
              if (transitRow && transitRow.status !== mappedStatus) {
                await updateShipment(transitRow.id, { status: mappedStatus });
                void pushShipmentToClearSight(transitRow.id, "shipment.updated");
              }
            }
          } catch (err) {
            console.warn("[refreshOrderStatus] Failed to mirror status:", err);
          }
          return { extensivOrderId: order.extensivOrderId, shipwellStatus: newStatus, shipwellBidCount: bidCount };
        } else {
          // PO stage only — no shipment to poll yet
          return { extensivOrderId: order.extensivOrderId, shipwellStatus: order.shipwellStatus, shipwellBidCount: order.shipwellBidCount };
        }
      }),

    /**
     * Return all carrier rates for a given order, sorted cheapest first.
     */
    getRates: protectedProcedure
      .input(z.object({ extensivOrderId: z.number() }))
      .query(async ({ input }) => {
        const { getShipwellRates } = await import('./db');
        const rates = await getShipwellRates(input.extensivOrderId);
        return rates.map((r) => ({
          id: r.id,
          extensivOrderId: r.extensivOrderId,
          carrierName: r.carrierName,
          carrierScac: r.carrierScac,
          serviceLevel: r.serviceLevel,
          transitDays: r.transitDays,
          totalRateCents: r.totalRateCents,
          currency: r.currency,
          estimatedDelivery: r.estimatedDelivery,
          isSelected: r.isSelected,
          selectedAt: r.selectedAt,
          selectedBy: r.selectedBy,
          isMock: r.isMock,
        }));
      }),

    /**
     * Select a carrier rate for an order. Clears any previous selection for the same order.
     */
    selectRate: protectedProcedure
      .input(z.object({
        extensivOrderId: z.number(),
        rateId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { selectShipwellRate } = await import('./db');
        await selectShipwellRate(
          input.extensivOrderId,
          input.rateId,
          ctx.user.name ?? ctx.user.openId,
        );
        return { success: true };
      }),
    /**
     * Refresh Shipwell status + bid count for ALL orders that are in quoting/tendered
     * and have not been refreshed in the last 2 hours (stale).
     */
    refreshAllStale: protectedProcedure
      .mutation(async () => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "No Shipwell config found." });
        const client = createShipwellClient({
          email: config.email,
          password: config.password,
          environment: config.environment as "sandbox" | "production",
        });
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const allOrders = await getTrackedOrders();
        const staleOrders = allOrders.filter((o) => {
          if (!o.shipwellShipmentId) return false;
          const status = o.shipwellStatus;
          if (status !== "quoting" && status !== "tendered" && status !== null) return false;
          const lastRefresh = o.shipwellStatusUpdatedAt ? new Date(o.shipwellStatusUpdatedAt).getTime() : 0;
          return lastRefresh < twoHoursAgo;
        });
        let refreshed = 0;
        let failed = 0;
        for (const order of staleOrders) {
          try {
            const result = await client.getShipmentStatus(order.shipwellShipmentId!);
            const newStatus = result.normalizedStatus !== "unknown" ? result.normalizedStatus : (order.shipwellStatus ?? null);
            if (newStatus) await updateShipwellStatus(order.extensivOrderId, newStatus);
            if (newStatus === "quoting") {
              const bidCount = await client.getBidCount(order.shipwellShipmentId!);
              await updateShipwellBidCount(order.extensivOrderId, bidCount);
            }
            refreshed++;
          } catch {
            failed++;
          }
        }
        return { total: staleOrders.length, refreshed, failed };
      }),
    /**
     * Tender a shipment to the selected carrier in Shipwell.
     */
    tenderShipment: protectedProcedure
      .input(z.object({
        extensivOrderId: z.number(),
        rateId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "No Shipwell config found." });
        const orders = await getTrackedOrders();
        const order = orders.find((o) => o.extensivOrderId === input.extensivOrderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        const { selectShipwellRate, getShipwellRates } = await import('./db');
        await selectShipwellRate(input.extensivOrderId, input.rateId, ctx.user.name ?? ctx.user.openId);
        if (order.shipwellShipmentId) {
          const client = createShipwellClient({
            email: config.email,
            password: config.password,
            environment: config.environment as "sandbox" | "production",
          });
          const rates = await getShipwellRates(input.extensivOrderId);
          const selectedRate = rates.find((r) => r.id === input.rateId);
          if (selectedRate?.shipwellBidId) {
            try {
              await client.tenderShipment(order.shipwellShipmentId, selectedRate.shipwellBidId);
              await updateShipwellStatus(order.extensivOrderId, "tendered");
            } catch (err) {
              console.warn("[tenderShipment] Shipwell tender call failed, marking locally:", err);
              await updateShipwellStatus(order.extensivOrderId, "tendered");
            }
          } else {
            await updateShipwellStatus(order.extensivOrderId, "tendered");
          }          } else {
          await updateShipwellStatus(order.extensivOrderId, "tendered");
        }
        return { success: true };
      }),
    /**
     * List all carrier bids for a Shipwell shipment.
     * Uses GET /quoting/carrier-bids/?shipment={shipmentId}
     */
    listCarrierBids: protectedProcedure
      .input(z.object({ shipmentId: z.string().min(1) }))
      .query(async ({ input }) => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Shipwell not configured" });
        const client = createShipwellClient({
          email: config.email,
          password: config.password,
          environment: config.environment as "sandbox" | "production",
        });
        try {
          const result = await client.getCarrierBids(input.shipmentId);
          return {
            bids: result.results.map((b) => ({
              id: b.id,
              contactName: [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || null,
              contactEmail: b.contact_email ?? null,
              contactPhone: b.contact_phone_number ?? null,
              mcNumber: b.mc_number ?? null,
              usdotNumber: b.usdot_number ?? null,
              bidAmount: b.bid_amount ?? null,
              availableDate: b.available_date ?? null,
              distanceMiles: b.distance_from_pickup_miles ?? null,
              notes: b.notes ?? null,
              createdAt: b.created_at ?? null,
              createdByUser: b.created_by_user_full_name ?? null,
              shipmentId: b.shipment ?? null,
            })),
            totalCount: result.total_count,
          };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Failed to fetch carrier bids",
          });
        }
      }),
    /**
     * Retrieve a single carrier bid by ID.
     * Uses GET /v2/carrier-bids/{bidId}
     */
    getCarrierBid: protectedProcedure
      .input(z.object({ bidId: z.string().min(1) }))
      .query(async ({ input }) => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Shipwell not configured" });
        const client = createShipwellClient({
          email: config.email,
          password: config.password,
          environment: config.environment as "sandbox" | "production",
        });
        try {
          const b = await client.getCarrierBid(input.bidId);
          return {
            id: b.id,
            contactName: [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || null,
            contactEmail: b.contact_email ?? null,
            contactPhone: b.contact_phone_number ?? null,
            mcNumber: b.mc_number ?? null,
            usdotNumber: b.usdot_number ?? null,
            bidAmount: b.bid_amount ?? null,
            availableDate: b.available_date ?? null,
            distanceMiles: b.distance_from_pickup_miles ?? null,
            notes: b.notes ?? null,
            createdAt: b.created_at ?? null,
            createdByUser: b.created_by_user_full_name ?? null,
            shipmentId: b.shipment ?? null,
          };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Failed to fetch carrier bid",
          });
        }
      }),
    /**
     * Tender a shipment directly by Shipwell bid ID (UUID from the carrier bids API).
     * Looks up or creates the matching shipwell_rates row, then calls tenderShipment.
     */
    tenderByBidId: protectedProcedure
      .input(z.object({
        extensivOrderId: z.number(),
        shipwellBidId: z.string().min(1),
        carrierName: z.string().optional(),
        totalCharge: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Shipwell not configured" });
        const orders = await getTrackedOrders();
        const order = orders.find((o) => o.extensivOrderId === input.extensivOrderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        if (!order.shipwellShipmentId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order has no Shipwell shipment" });
        const { getShipwellRates, selectShipwellRate } = await import('./db');
        const { shipwellRates } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
        let rates = await getShipwellRates(input.extensivOrderId);
        let matchedRate = rates.find((r) => r.shipwellBidId === input.shipwellBidId);
        if (!matchedRate) {
          await db.insert(shipwellRates).values({
            extensivOrderId: input.extensivOrderId,
            shipwellShipmentId: order.shipwellShipmentId,
            carrierName: input.carrierName ?? "Unknown",
            totalRateCents: input.totalCharge ? Math.round(input.totalCharge * 100) : 0,
            shipwellBidId: input.shipwellBidId,
            isMock: false,
          });
          rates = await getShipwellRates(input.extensivOrderId);
          matchedRate = rates.find((r) => r.shipwellBidId === input.shipwellBidId);
        }
        if (!matchedRate) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not resolve rate row for bid" });
        await selectShipwellRate(input.extensivOrderId, matchedRate.id, ctx.user.name ?? ctx.user.openId);
        const client = createShipwellClient({
          email: config.email,
          password: config.password,
          environment: config.environment as "sandbox" | "production",
        });
        try {
          await client.tenderShipment(order.shipwellShipmentId, input.shipwellBidId);
        } catch (err) {
          console.warn("[tenderByBidId] Shipwell tender call failed, marking locally:", err);
        }
        await updateShipwellStatus(order.extensivOrderId, "tendered");
        await createAuditLog({
          userId: ctx.user.id,
          action: "shipwell_tender",
          entityType: "order",
          entityId: String(input.extensivOrderId),
          details: {
            shipwellBidId: input.shipwellBidId,
            carrierName: input.carrierName ?? null,
            totalCharge: input.totalCharge ?? null,
            shipwellShipmentId: order.shipwellShipmentId,
            referenceNum: order.referenceNum ?? null,
            tenderedBy: ctx.user.name ?? ctx.user.openId,
          },
        });
        return { success: true };
      }),
    /**
     * Fetch all outstanding shipping quotes directly from the Shipwell API.
     * Returns all shipments currently in "quoting" status with their live carrier bids.
     * Results are cached server-side for 2 minutes to avoid hammering the API on every
     * client refresh and to survive transient TLS socket disconnects.
     */
    listOutstandingQuotes: protectedProcedure.query(async () => {
      // ── 2-minute server-side cache ──────────────────────────────────────────
      type CacheEntry = { data: { shipments: unknown[]; error: string | null }; expiresAt: number };
      const CACHE_KEY = 'listOutstandingQuotes';
      const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
      if (!(globalThis as Record<string, unknown>).__shipwellQuoteCache) {
        (globalThis as Record<string, unknown>).__shipwellQuoteCache = new Map<string, CacheEntry>();
      }
      const cache = (globalThis as Record<string, unknown>).__shipwellQuoteCache as Map<string, CacheEntry>;
      const cached = cache.get(CACHE_KEY);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
      // ── End cache check ─────────────────────────────────────────────────────
      const config = await getShipwellConfig();
      if (!config) return { shipments: [], error: 'No Shipwell configuration found.' as string | null };
      const client = createShipwellClient({
        email: config.email,
        password: config.password,
        environment: config.environment as 'production' | 'sandbox',
      });
      try {
        // Fetch ALL active shipments across all pages (auto-paginated, 200/page).
        // Exclude only delivered and cancelled — everything else (quoting, tendered, carrier_confirmed,
        // in_transit, pending, new, etc.) should be visible so dispatchers can track the full pipeline.
        const allShipments = await client.listAllShipments();
        const shipments = allShipments.filter((s) => {
          const norm = normalizeShipwellStatus(s.status);
          return norm !== 'delivered' && norm !== 'cancelled';
        });
        if (shipments.length === 0) return { shipments: [], error: null };

        // Build a lookup map from Shipwell PO ID → local order tracking row
        // so we can resolve the GoDirect customer name and sent-at timestamp.
        const allTrackedOrders = await getTrackedOrders();
        const byShipwellId = new Map<string, typeof allTrackedOrders[0]>();
        const byRefNum = new Map<string, typeof allTrackedOrders[0]>();
        for (const o of allTrackedOrders) {
          if (o.shipwellOrderId) byShipwellId.set(o.shipwellOrderId, o);
          if (o.shipwellShipmentId) byShipwellId.set(o.shipwellShipmentId, o);
          if (o.referenceNum) byRefNum.set(o.referenceNum, o);
          if (o.extensivOrderId) byRefNum.set(String(o.extensivOrderId), o);
        }

        // For each shipment, fetch its carrier bids in parallel
        const enriched = await Promise.all(
          shipments.map(async (shipment) => {
            let bids: { id: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; mcNumber: string | null; usdotNumber: string | null; bidAmount: number | null; availableDate: string | null; distanceMiles: number | null; notes: string | null; createdAt: string | null; createdByUser: string | null }[] = [];
            try {
              const rawBids = await client.getCarrierBids(shipment.id);
              bids = rawBids.results.map((b) => ({
                id: b.id,
                contactName: [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || null,
                contactEmail: b.contact_email ?? null,
                contactPhone: b.contact_phone_number ?? null,
                mcNumber: b.mc_number ?? null,
                usdotNumber: b.usdot_number ?? null,
                bidAmount: b.bid_amount ?? null,
                availableDate: b.available_date ?? null,
                distanceMiles: b.distance_from_pickup_miles ?? null,
                notes: b.notes ?? null,
                createdAt: b.created_at ?? null,
                createdByUser: b.created_by_user_full_name ?? null,
              }));
            } catch {
              // bid fetch failure for one shipment should not block the rest
            }
            const charges = bids.map((b) => b.bidAmount).filter((v): v is number => v !== null);
            // Derive origin/destination from stops array or direct fields
            const stops = shipment.stops ?? [];
            const originStop = shipment.origin_stop ?? stops.find((s) => s.stop_type === 'pickup') ?? stops[0] ?? null;
            const destStop = shipment.destination_stop ?? stops.find((s) => s.stop_type === 'delivery') ?? stops[stops.length - 1] ?? null;
            const pickupDate = originStop?.planned_date ?? originStop?.planned_time_window_start ?? null;
            // Resolve local GoDirect order: try by Shipwell PO/shipment ID first, then by reference number
            const localOrder =
              byShipwellId.get(shipment.id) ??
              (shipment.reference_id ? byRefNum.get(shipment.reference_id) : undefined) ??
              (shipment.customer_reference_number ? byRefNum.get(shipment.customer_reference_number) : undefined) ??
              null;
            return {
              shipmentId: shipment.id,
              status: shipment.status ?? 'unknown',
              referenceId: shipment.reference_id ?? null,
              customerReferenceNumber: shipment.customer_reference_number ?? null,
              customerName: shipment.customer_name ?? null,
              // GoDirect customer name resolved from local order tracking
              gdClientName: localOrder?.clientName ?? null,
              // GoDirect facility resolved from local order tracking
              gdFacilityId: localOrder?.facilityId ?? null,
              gdFacilityName: localOrder?.facilityName ?? null,
              // When this order was sent to Shipwell (from local DB)
              sentToShipwellAt: localOrder?.shipwellSentAt?.toISOString() ?? shipment.created_at ?? null,
              createdAt: shipment.created_at ?? null,
              updatedAt: shipment.updated_at ?? null,
              originCity: originStop?.location?.address?.city ?? null,
              originState: originStop?.location?.address?.state_province ?? null,
              destCity: destStop?.location?.address?.city ?? null,
              destState: destStop?.location?.address?.state_province ?? null,
              pickupDate: pickupDate ?? null,
              bidCount: bids.length,
              lowestBidAmount: charges.length > 0 ? Math.min(...charges) : null,
              bids,
            };
          })
        );

        // Sort: quoting first (most actionable), then by bid count desc, then newest first
        const statusOrder: Record<string, number> = { quoting: 0, tendered: 1, carrier_confirmed: 2, in_transit: 3, unknown: 4 };
        enriched.sort((a, b) => {
          const aNorm = normalizeShipwellStatus(a.status);
          const bNorm = normalizeShipwellStatus(b.status);
          const aOrd = statusOrder[aNorm] ?? 5;
          const bOrd = statusOrder[bNorm] ?? 5;
          if (aOrd !== bOrd) return aOrd - bOrd;
          if (b.bidCount !== a.bidCount) return b.bidCount - a.bidCount;
          return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        });
        const result = { shipments: enriched, error: null };
        // Store in cache for 2 minutes
        cache.set(CACHE_KEY, { data: result as { shipments: unknown[]; error: string | null }, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // On error, return stale cache if available (better than a blank screen)
        const stale = cache.get(CACHE_KEY);
        if (stale) {
          return { ...stale.data, error: `Shipwell API error (showing cached data): ${msg}` };
        }
        return { shipments: [], error: `Shipwell API error: ${msg}` };
      }
    }),
    /**
     * Tender a carrier bid from the Live Quotes tab.
     * Accepts Shipwell shipment ID + bid ID directly (no extensivOrderId needed).
     */
    tenderLiveBid: protectedProcedure
      .input(z.object({
        shipwellShipmentId: z.string().min(1),
        bidId: z.string().min(1),
        carrierName: z.string().optional(),
        totalCharge: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const config = await getShipwellConfig();
        if (!config) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Shipwell not configured' });
        const client = createShipwellClient({
          email: config.email,
          password: config.password,
          environment: config.environment as 'production' | 'sandbox',
        });
        // Call Shipwell tender API
        try {
          await client.tenderShipment(input.shipwellShipmentId, input.bidId);
        } catch (err: unknown) {
          console.warn('[tenderLiveBid] Shipwell tender call failed:', err);
        }
        // Look up the order by shipwellShipmentId to update local DB
        const orders = await getTrackedOrders();
        const order = orders.find((o) => o.shipwellShipmentId === input.shipwellShipmentId);
        if (order) {
          const db = await getDb();
          if (db) {
            const { orderTracking } = await import('../drizzle/schema');
            const { eq } = await import('drizzle-orm');
            await db.update(orderTracking)
              .set({ shipwellStatus: 'tendered', updatedAt: new Date() })
              .where(eq(orderTracking.id, order.id));
          }
          await createAuditLog({
            action: 'shipwell_tender',
            entityType: 'order',
            entityId: String(order.id),
            userId: ctx.user.id,
            details: JSON.stringify({
              carrierName: input.carrierName ?? 'Unknown',
              rate: input.totalCharge ?? null,
              shipwellBidId: input.bidId,
              shipwellShipmentId: input.shipwellShipmentId,
              referenceNum: order.referenceNum ?? '',
            }),
          });
        }
        return { success: true };
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
    clientBreachSummary: protectedProcedure
      .input(z.object({ facilityId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return getClientSlaBreachSummary(input?.facilityId);
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
    /**
     * Waive an out-of-SLA order: marks it as waived in the audit trail.
     * The order remains visible but is flagged as waived (not counted against compliance).
     */
    waiveOrder: protectedProcedure
      .input(z.object({
        extensivOrderId: z.number().int(),
        referenceNum: z.string().nullable().optional(),
        clientId: z.number().int(),
        clientName: z.string(),
        facilityId: z.number().int(),
        facilityName: z.string().nullable().optional(),
        reason: z.string().min(1, "Reason is required").max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        await createSlaOrderAction({
          extensivOrderId: input.extensivOrderId,
          referenceNum: input.referenceNum ?? null,
          clientId: input.clientId,
          clientName: input.clientName,
          facilityId: input.facilityId,
          facilityName: input.facilityName ?? null,
          action: "waive",
          reason: input.reason,
          performedByUserId: String(ctx.user.id),
          performedByName: ctx.user.name ?? ctx.user.email ?? String(ctx.user.id),
        });
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.waiveOrder",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { reason: input.reason, clientName: input.clientName },
        });
        return { success: true };
      }),
    /**
     * Remove an out-of-SLA order from the SLA dashboard entirely.
     * The order is hidden from the SLA tracker and not counted in compliance.
     */
    removeOrder: protectedProcedure
      .input(z.object({
        extensivOrderId: z.number().int(),
        referenceNum: z.string().nullable().optional(),
        clientId: z.number().int(),
        clientName: z.string(),
        facilityId: z.number().int(),
        facilityName: z.string().nullable().optional(),
        reason: z.string().min(1, "Reason is required").max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        await createSlaOrderAction({
          extensivOrderId: input.extensivOrderId,
          referenceNum: input.referenceNum ?? null,
          clientId: input.clientId,
          clientName: input.clientName,
          facilityId: input.facilityId,
          facilityName: input.facilityName ?? null,
          action: "remove",
          reason: input.reason,
          performedByUserId: String(ctx.user.id),
          performedByName: ctx.user.name ?? ctx.user.email ?? String(ctx.user.id),
        });
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.removeOrder",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: { reason: input.reason, clientName: input.clientName },
        });
        return { success: true };
      }),
    /** Restore an order to active SLA tracking (undo a waive or remove). */
    restoreOrder: protectedProcedure
      .input(z.object({ extensivOrderId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        await clearSlaOrderAction(input.extensivOrderId);
        await createAuditLog({
          userId: ctx.user.id,
          action: "sla.restoreOrder",
          entityType: "order_tracking",
          entityId: String(input.extensivOrderId),
          details: {},
        });
        return { success: true };
      }),
    /** List all SLA order actions (audit trail), newest first. */
    listOrderActions: protectedProcedure
      .input(z.object({ extensivOrderId: z.number().int().optional() }))
      .query(async ({ input }) => {
        return listSlaOrderActions(input.extensivOrderId);
      }),

    // ── Ship-to SLA rules ──────────────────────────────────────────────────
    listShipToRules: protectedProcedure
      .input(z.object({ clientId: z.number().int() }))
      .query(async ({ input }) => {
        return getShipToRulesForClient(input.clientId);
      }),

    listAllShipToRules: protectedProcedure.query(async () => {
      return listAllShipToRules();
    }),

    upsertShipToRule: protectedProcedure
      .input(
        z.object({
          id: z.number().int().optional(),
          clientId: z.number().int(),
          clientName: z.string().min(1).max(256),
          shipToName: z.string().min(1).max(256),
          matchType: z.enum(["exact", "contains", "starts_with"]).default("exact"),
          slaDays: z.number().int().min(1).max(365),
          notes: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = await upsertShipToRule(input);
        return { id };
      }),

    deleteShipToRule: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteShipToRule(input.id);
        return { success: true };
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
  /** Save visibility toggles and channel for a batch of clients */
  save: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            configId: z.number(),
            clientId: z.number(),
            clientName: z.string(),
            isVisible: z.boolean(),
            orderChannel: z.enum(["b2b", "d2c", "both"]).optional(),
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
      facilityId: z.number().optional(),
      facilityName: z.string().optional(),
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
      upcCode: z.string().optional(),
      photos: z.string().optional(), // JSON-serialized string[]
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
      upcCode: z.string().optional(),
      photos: z.string().optional(), // JSON-serialized string[]
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
  // List facilities for a given config (used in Process Returns step 1)
  listFacilities: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND" });
      return fetchAllFacilities(config);
    }),

  // Look up a SKU in Extensiv to auto-fill description
  lookupSku: protectedProcedure
    .input(z.object({ configId: z.number(), clientId: z.number(), sku: z.string().min(1) }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND" });
      const descMap = await fetchItemDescriptions(config, input.clientId);
      const description = descMap.get(input.sku) ?? null;
      return { sku: input.sku, description };
    }),
  // Client instructions for a session (from ClearSight approval responses)
  getClientInstructions: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      return getReturnClientInstructions(input.sessionId);
    }),
  // Unread instruction count for the badge
  countUnreadInstructions: protectedProcedure.query(async () => {
    const count = await countUnreadReturnClientInstructions();
    return { count };
  }),
  // Mark instructions as read
  markInstructionsRead: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), readByName: z.string() }))
    .mutation(async ({ input }) => {
      await markReturnClientInstructionsRead(input.ids, input.readByName);
      return { success: true };
    }),
  // Upload a scan station photo (base64 data URL → S3), returns the public URL
  uploadScanPhoto: protectedProcedure
    .input(z.object({
      filename: z.string().min(1),
      dataUrl: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const base64 = input.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const key = `scan-station/${input.filename}`;
      const { url } = await storagePut(key, buffer, "image/png");
      return { url };
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
      // OpFi uses its own dedicated test function (rate-sheets probe)
      if (input.platform === "opfi") {
        try {
          const result = await testOpFiConnection();
          await updateCortexHealthStatus("opfi", "ok");
          return {
            success: true,
            status: "ok",
            body: {
              platform: "opfi",
              baseUrl: result.baseUrl,
              httpStatus: result.httpStatus,
              hasRateSheets: result.hasRateSheets,
              durationMs: result.durationMs,
            } as Record<string, unknown>,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await updateCortexHealthStatus("opfi", "error");
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }
      // All other platforms: hit their /api/health endpoint
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
  // Look up an order by Transaction ID from Extensiv and create/resume a session
  startSession: protectedProcedure
    .input(z.object({
      transactionId: z.number().int().positive(),
      warehouseId: z.number().optional(),
      warehouseName: z.string().optional(),
      batchMode: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Try to find an existing session for this transaction ID (scanning OR complete).
      // Always resume — never create a duplicate session for the same transaction.
      const existing = await getQcSessionByTransactionId(input.transactionId);
      if (existing) {
        const items = await getQcScanItems(existing.id);
        const pallets = await getQcPallets(existing.id);
        return { session: existing, items, pallets, resumed: true };
      }
      // Create a new session — referenceNumber will be populated after Extensiv lookup
      const sessionId = await createQcSession({
        referenceNumber: String(input.transactionId),
        transactionId: input.transactionId,
        warehouseId: input.warehouseId,
        warehouseName: input.warehouseName,
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

  // Fetch order items from Extensiv by Transaction ID and seed the session
  // This auto-populates SKU, description, expected qty, and lot number from Extensiv
  fetchFromExtensiv: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      transactionId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      // Get the first active Extensiv config
      const configs = await getExtensivConfigs();
      const config = configs.find((c) => c.isActive) ?? configs[0];
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No Extensiv configuration found. Please set up an Extensiv API config first." });

      // Fetch order directly by Transaction ID (orderId)
      let order;
      try {
        const result = await fetchOrderWithDetail(config, input.transactionId);
        order = result.order;
      } catch (err) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No order found in Extensiv for Transaction ID ${input.transactionId}. Check the Transaction ID and try again.` });
      }

      const orderItems = order.orderItems ?? [];

      if (orderItems.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Order found in Extensiv but it has no line items. The order may not have items loaded yet.` });
      }

      // Fetch item descriptions, UPCs, case amounts, and carton weights for the customer
      let descMap = new Map<string, string>();
      let upcMap = new Map<string, string>();
      let caseAmountMap = new Map<string, number>();
      let cartonWeightMap = new Map<string, number>();
      try {
        const customerId = order.readOnly?.customerIdentifier?.id;
        if (customerId) {
          [descMap, upcMap, caseAmountMap, cartonWeightMap] = await Promise.all([
            fetchItemDescriptions(config, customerId),
            fetchItemUpcMap(config, customerId),
            fetchItemCaseAmountMap(config, customerId),
            fetchItemCartonWeightMap(config, customerId),
          ]);
        }
      } catch (err) {
        console.warn(`[qcScanner.fetchFromExtensiv] Could not fetch item descriptions/UPCs:`, err);
      }

      // Seed each order item into the session
      let seededCount = 0;
      for (const item of orderItems) {
        const sku = item.itemIdentifier?.sku;
        if (!sku) continue;
        const description = descMap.get(sku) ?? undefined;
        const upc = upcMap.get(sku) ?? null;
        const caseAmount = caseAmountMap.get(sku) ?? 1;
        const cartonWeightLb = cartonWeightMap.get(sku) ?? null;
        await upsertQcScanItem(input.sessionId, sku, upc, {
          description,
          lotNumber: item.lotNumber ?? null,
          expectedQty: item.qty ?? 0,
          caseAmount,
          cartonWeightLb: cartonWeightLb !== null ? String(cartonWeightLb) : undefined,
          scannedQty: 0,
          scanTimestamps: [],
        } as any);
        seededCount++;
      }

      // Update session metadata from the order — including the referenceNum from Extensiv
      const customerName = order.readOnly?.customerIdentifier?.name ?? undefined;
      const customerId = order.readOnly?.customerIdentifier?.id ?? undefined;
      const poNumber = (order as unknown as Record<string, unknown>).poNum as string | undefined;
      const referenceNum = (order as unknown as Record<string, unknown>).referenceNum as string | undefined;
      // Capture the Extensiv facility (physical warehouse location) from the order
      const facilityId = order.readOnly?.facilityIdentifier?.id ?? undefined;
      const facilityName = order.readOnly?.facilityIdentifier?.name ?? undefined;
      // Capture ship-to address from Extensiv order (retailer / sub-client destination)
      const shipTo = order.shipTo;
      const destinationAddress = shipTo ? JSON.stringify({
        companyName: shipTo.companyName ?? null,
        name: shipTo.companyName ?? null,
        address1: shipTo.address1 ?? null,
        city: shipTo.city ?? null,
        state: shipTo.state ?? null,
        zip: shipTo.zip ?? null,
      }) : undefined;
      await updateQcSession(input.sessionId, {
        referenceNumber: referenceNum ?? String(input.transactionId),
        customerName: customerName ?? undefined,
        customerId: customerId ?? undefined,
        warehouseId: config.id,
        facilityId: facilityId ?? undefined,
        facilityName: facilityName ?? undefined,
        poNumber: poNumber ?? undefined,
        ...(destinationAddress ? { destinationAddress } : {}),
      } as any);

      // Return the freshly seeded items
      const items = await getQcScanItems(input.sessionId);
      return { success: true, seededCount, items, customerName: customerName ?? null, poNumber: poNumber ?? null, referenceNumber: referenceNum ?? String(input.transactionId) };
    }),

  // Refresh caseAmount for all items in an existing session from Extensiv
  // Use this for sessions seeded before the caseAmount fix
  refreshCaseAmounts: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const configs = await getExtensivConfigs();
      let config = session.warehouseId ? await getExtensivConfigById(session.warehouseId) : null;
      if (!config) config = configs.find((c) => c.isActive) ?? configs[0] ?? null;
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No Extensiv configuration found" });
      let customerId = session.customerId ?? null;
      if (!customerId && session.transactionId) {
        try {
          const { order } = await fetchOrderWithDetail(config, session.transactionId);
          customerId = order.readOnly?.customerIdentifier?.id ?? null;
          if (customerId) await updateQcSession(input.sessionId, { customerId, warehouseId: config.id } as any);
        } catch { /* ignore */ }
      }
      if (!customerId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Could not determine customer ID for this session" });
      const caseAmountMap = await fetchItemCaseAmountMap(config, customerId);
      const items = await getQcScanItems(input.sessionId);
      let updatedCount = 0;
      for (const item of items) {
        const newCaseAmount = caseAmountMap.get(item.sku) ?? 1;
        if (newCaseAmount !== (item.caseAmount ?? 1)) {
          await upsertQcScanItem(input.sessionId, item.sku, item.upc ?? null, { caseAmount: newCaseAmount });
          updatedCount++;
        }
      }
      const updatedItems = await getQcScanItems(input.sessionId);
      return { success: true, updatedCount, items: updatedItems };
    }),

  // Refresh cartonWeightLb for all items in an existing session from Extensiv
  // Use this for sessions seeded before the cartonWeightLb fix
  refreshCartonWeights: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const configs = await getExtensivConfigs();
      let config = session.warehouseId ? await getExtensivConfigById(session.warehouseId) : null;
      if (!config) config = configs.find((c) => c.isActive) ?? configs[0] ?? null;
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No Extensiv configuration found" });
      let customerId = session.customerId ?? null;
      if (!customerId && session.transactionId) {
        try {
          const { order } = await fetchOrderWithDetail(config, session.transactionId);
          customerId = order.readOnly?.customerIdentifier?.id ?? null;
          if (customerId) await updateQcSession(input.sessionId, { customerId, warehouseId: config.id } as any);
        } catch { /* ignore */ }
      }
      if (!customerId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Could not determine customer ID for this session" });
      const cartonWeightMap = await fetchItemCartonWeightMap(config, customerId);
      const items = await getQcScanItems(input.sessionId);
      let updatedCount = 0;
      for (const item of items) {
        const newWeight = cartonWeightMap.get(item.sku) ?? null;
        const currentWeight = item.cartonWeightLb != null ? parseFloat(String(item.cartonWeightLb)) : null;
        if (newWeight !== currentWeight) {
          await upsertQcScanItem(input.sessionId, item.sku, item.upc ?? null, {
            cartonWeightLb: newWeight !== null ? String(newWeight) : null,
          } as any);
          updatedCount++;
        }
      }
      const updatedItems = await getQcScanItems(input.sessionId);
      return { success: true, updatedCount, items: updatedItems };
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
      let match: typeof items[0] | null | undefined = items.find(
        (i) => i.sku.toUpperCase() === input.barcode.toUpperCase() ||
               (i.upc && i.upc.toUpperCase() === input.barcode.toUpperCase())
      );
      // --- Live Extensiv UPC fallback ---
      // If not found by stored SKU/UPC, try resolving the barcode via Extensiv item master.
      // This handles cases where the UPC was not stored during seeding (e.g. item-level UPC
      // vs package-level UPC mismatch) or the session was seeded before the UPC fix.
      if (!match) {
        try {
          const session = await getQcSessionById(input.sessionId);
          let warehouseId = session?.warehouseId ?? null;
          let customerId = session?.customerId ?? null;
          // Fallback: if session is missing warehouseId/customerId (seeded before the fix),
          // use the first active Extensiv config and resolve customerId from the order.
          let config = warehouseId ? await getExtensivConfigById(warehouseId) : null;
          if (!config) {
            const configs = await getExtensivConfigs();
            config = configs.find((c) => c.isActive) ?? configs[0] ?? null;
            if (config) warehouseId = config.id;
          }
          if (!customerId && session?.transactionId && config) {
            try {
              const { order } = await fetchOrderWithDetail(config, session.transactionId);
              customerId = order.readOnly?.customerIdentifier?.id ?? null;
              if (customerId) {
                // Persist so future scans skip this lookup
                await updateQcSession(input.sessionId, { customerId, warehouseId: config.id } as any);
              }
            } catch { /* order lookup failed, continue without customerId */ }
          }
          if (config && customerId) {
            // Use cached UPC→SKU map to avoid repeated Extensiv API calls on every scan.
            // Cache is keyed by "configId:customerId" and expires after 30 minutes.
            const cacheKey = `${config.id}:${customerId}`;
            const now = Date.now();
            let cached = _upcMapCache.get(cacheKey);
            if (!cached || cached.expiresAt < now) {
              // Cache miss or expired — fetch from Extensiv and populate cache
              console.log(`[scanBarcode] Fetching UPC map from Extensiv for customer ${customerId} (cache miss)`);
              const freshMap = await fetchItemUpcMap(config, customerId);
              cached = { upcToSku: freshMap, expiresAt: now + UPC_MAP_CACHE_TTL_MS };
              _upcMapCache.set(cacheKey, cached);
            }
            const upcToSku = cached.upcToSku;
            const normalised = input.barcode.trim().toUpperCase();
            const resolvedSku = upcToSku.get(normalised);
            if (resolvedSku) {
              match = items.find((i) => i.sku.toUpperCase() === resolvedSku.toUpperCase()) ?? null;
              if (match) {
                // Persist the resolved UPC so future scans are instant even after cache expiry
                await upsertQcScanItem(input.sessionId, match.sku, input.barcode.trim(), {});
              }
            }
          }
        } catch (err) {
          console.warn(`[scanBarcode] Live UPC fallback failed for barcode ${input.barcode}:`, err);
        }
      }
      if (!match) {
        return { found: false, item: null, sessionComplete: false, overScan: false };
      }
      const amount = input.scanAsCase ? (match.caseAmount ?? 1) : 1;
      // Block over-scanning: do not allow scannedQty to exceed expectedQty
      const remaining = Math.max(0, (match.expectedQty ?? 0) - (match.scannedQty ?? 0));
      if (remaining === 0) {
        return { found: true, item: match, sessionComplete: false, overScan: true };
      }
      const safeAmount = Math.min(amount, remaining);
      const qtyBefore = match.scannedQty ?? 0;
      const updated = await incrementQcScanItem(input.sessionId, match.sku, safeAmount);
      const qtyAfter = updated?.scannedQty ?? qtyBefore;
      // If the atomic SQL capped the increment to zero (race condition), treat as over-scan
      if (qtyAfter <= qtyBefore) {
        return { found: true, item: updated ?? match, sessionComplete: false, overScan: true };
      }
      // Check if all items are complete
      const allItems = await getQcScanItems(input.sessionId);
      const sessionComplete = allItems.every((i) => i.scannedQty >= i.expectedQty);
      return { found: true, item: updated, sessionComplete, overScan: false };
    }),

  // Manual quantity adjustment
  adjustQty: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      sku: z.string(),
      delta: z.number(), // +1 or -1
    }))
    .mutation(async ({ input }) => {
      // Block over-scanning when adding (+1): do not allow scannedQty to exceed expectedQty
      if (input.delta > 0) {
        const currentItems = await getQcScanItems(input.sessionId);
        const match = currentItems.find((i) => i.sku === input.sku);
        if (match && (match.scannedQty ?? 0) >= (match.expectedQty ?? 0)) {
          return { item: match, sessionComplete: false, overScan: true };
        }
      }
      const updated = await incrementQcScanItem(input.sessionId, input.sku, input.delta);
      const allItems = await getQcScanItems(input.sessionId);
      const sessionComplete = allItems.every((i) => i.scannedQty >= i.expectedQty);
      return { item: updated, sessionComplete, overScan: false };
    }),

  // Admin-only: set scannedQty to an exact value for a SKU (bypasses scan requirement)
  manualSetQty: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      sku: z.string(),
      qty: z.number().int().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required for manual quantity entry" });
      }
      const items = await getQcScanItems(input.sessionId);
      const match = items.find((i) => i.sku.toUpperCase() === input.sku.toUpperCase());
      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: `SKU ${input.sku} not found in this session` });
      // Set scannedQty directly (capped at expectedQty)
      const safeQty = Math.min(input.qty, match.expectedQty ?? input.qty);
      const delta = safeQty - (match.scannedQty ?? 0);
      if (delta !== 0) {
        await incrementQcScanItem(input.sessionId, match.sku, delta);
      }
      const allItems = await getQcScanItems(input.sessionId);
      const sessionComplete = allItems.every((i) => i.scannedQty >= i.expectedQty);
      const updated = allItems.find((i) => i.sku === match.sku) ?? match;
      // Write audit log entry
      await createAuditLog({
        action: "qc.manualSetQty",
        entityType: "qc_scan_session",
        entityId: String(input.sessionId),
        userId: ctx.user.id,
        details: JSON.stringify({
          sessionId: input.sessionId,
          sku: match.sku,
          prevQty: match.scannedQty ?? 0,
          newQty: updated.scannedQty ?? safeQty,
          expectedQty: match.expectedQty ?? null,
          adminName: ctx.user.name,
          adminId: ctx.user.id,
        }),
      });
      return { item: updated, sessionComplete };
    }),
  // Complete the order
  completeSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch session before clearing so we can return metadata to the frontend
      const sessionBeforeComplete = await getQcSessionById(input.sessionId);
      await updateQcSession(input.sessionId, { status: "complete", completedAt: new Date() });
      await createAuditLog({
        action: "qc.completeSession",
        entityType: "qc_scan_session",
        entityId: String(input.sessionId),
        userId: ctx.user.id,
        details: JSON.stringify({ sessionId: input.sessionId, completedBy: ctx.user.name }),
      });
      // --- Non-fatal: mark the order as Packed (status=2) in Extensiv ---
      // Fire-and-forget: do NOT await — Extensiv can be slow and we must not block the HTTP response
      // (Cloud Run has a 180s hard limit; the pack retry scheduler handles any failures automatically)
      const packedInExtensiv = false;
      const packError: string | undefined = undefined;
      void (async () => {
        try {
          const session = await getQcSessionById(input.sessionId);
          const orderId = session?.transactionId ?? null;
          const warehouseId = session?.warehouseId ?? null;
          const foundInExtensiv = session?.foundInExtensiv ?? true;
          if (orderId && warehouseId && foundInExtensiv) {
            const config = await getExtensivConfigById(warehouseId);
            if (config) {
              const packResult = await markOrderPacked(config, orderId);
              if (!packResult.success) {
                console.warn(`[QcScanner] markOrderPacked failed for order ${orderId}: ${packResult.error}`);
              } else {
                console.log(`[QcScanner] Order ${orderId} marked as Packed in Extensiv by ${ctx.user.name}`);
                await updateQcSession(input.sessionId, { packedInExtensiv: true });
              }
            } else {
              console.warn(`[QcScanner] No Extensiv config found for warehouseId ${warehouseId}`);
            }
          }
        } catch (err) {
          console.error(`[QcScanner] markOrderPacked threw unexpectedly:`, err);
        }
      })();
      // --- Non-fatal: promote order to ship_ready so it appears in the dock recommendation dialog ---
      try {
        const sessionForStatus = await getQcSessionById(input.sessionId);
        const orderId = sessionForStatus?.transactionId ?? null;
        if (orderId) {
          // Look up the single order directly by extensivOrderId — avoids fetching all tracked orders
          const db2 = await getDb();
          const { eq: eqSr } = await import("drizzle-orm");
          const { orderTracking: otSr } = await import("../drizzle/schema.js");
          const [currentOrder] = db2
            ? await db2.select().from(otSr).where(eqSr(otSr.extensivOrderId, orderId)).limit(1)
            : [];
          // Advance to ship_ready from any pre-ship stage — never go backwards from ship_ready/shipped
          const preShipStages = ["unallocated", "allocated", "picking", "qc", "qc_complete"];
          if (currentOrder && preShipStages.includes(currentOrder.lifecycleStatus)) {
            await updateOrderLifecycleStatus(orderId, "ship_ready");
            console.log(`[QcScanner] Auto-promoted order ${orderId} from ${currentOrder.lifecycleStatus} to ship_ready on session complete`);
          }
        }
      } catch (err) {
        // Non-fatal: dock recommendation will still show but order may not be found
        console.warn(`[QcScanner] Auto ship_ready promotion failed:`, err);
      }
      // Return session metadata so the frontend can use it directly (avoids stale closure bug)
      const pallets = await getQcPallets(input.sessionId);
      const activePalletCount = pallets.filter((p) => !p.deletedAt).length;

      // Persist pallet count to orderTracking so Shipping Dashboard and Dock Manager show it
      try {
        const orderId = sessionBeforeComplete?.transactionId ?? null;
        if (orderId && activePalletCount > 0) {
          const { eq: eqPc } = await import("drizzle-orm");
          const dbPc = await getDb();
          if (dbPc) {
            const { orderTracking: otPc } = await import("../drizzle/schema.js");
            await dbPc.update(otPc)
              .set({ palletCount: activePalletCount })
              .where(eqPc(otPc.extensivOrderId, orderId));
            console.log(`[QcScanner] Wrote palletCount=${activePalletCount} to orderTracking for order ${orderId}`);
          }
        }
      } catch (err) {
        console.warn(`[QcScanner] Failed to persist palletCount to orderTracking:`, err);
      }

      return {
        success: true,
        packedInExtensiv,
        packError,
        sessionMeta: {
          sessionId: input.sessionId,
          customerName: sessionBeforeComplete?.customerName ?? null,
          transactionId: sessionBeforeComplete?.transactionId ?? null,
          customerId: sessionBeforeComplete?.customerId ?? null,
          configId: sessionBeforeComplete?.warehouseId ?? null,
          palletCount: activePalletCount,
        },
      };
    }),
  // Manually retry marking an order as Packed in Extensiv for a completed session
  retryPackInExtensiv: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status !== "complete") throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not complete" });
      if (!session.foundInExtensiv) throw new TRPCError({ code: "BAD_REQUEST", message: "Manual label session — no Extensiv order to sync" });
      const orderId = session.transactionId ?? null;
      const warehouseId = session.warehouseId ?? null;
      if (!orderId || !warehouseId) throw new TRPCError({ code: "BAD_REQUEST", message: "Session is missing transactionId or warehouseId" });
      const config = await getExtensivConfigById(warehouseId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: `No Extensiv config found for warehouseId ${warehouseId}` });
      const packResult = await markOrderPacked(config, orderId);
      if (packResult.success) {
        await updateQcSession(input.sessionId, { packedInExtensiv: true });
        await createAuditLog({
          action: "qc.retryPackInExtensiv",
          entityType: "qc_scan_session",
          entityId: String(input.sessionId),
          userId: ctx.user.id,
          details: JSON.stringify({ sessionId: input.sessionId, orderId, retriedBy: ctx.user.name }),
        });
        console.log(`[QcScanner] Retry: Order ${orderId} marked as Packed in Extensiv by ${ctx.user.name}`);
        return { success: true };
      } else {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: packResult.error ?? "Extensiv pack API returned an error" });
      }
    }),
  // Add a new pallet to the session
    addPallet: protectedProcedure
    .input(z.object({ sessionId: z.number(), palletType: z.string().optional() }))
    .mutation(async ({ input }) => {
      const existing = await getQcPallets(input.sessionId);
      const palletNumber = existing.length + 1;
      const id = await createQcPallet({ sessionId: input.sessionId, palletNumber, palletType: input.palletType ?? null, items: [] });
      return { id, palletNumber, palletType: input.palletType ?? null };
    }),
  // Remove the last created pallet (soft-delete) and restore its scanned quantities to the session
  removeLastPallet: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const pallets = await getQcPallets(input.sessionId);
      if (pallets.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No pallets to remove" });
      // Sort by createdAt descending to get the last created pallet
      const sorted = [...pallets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const lastPallet = sorted[0];
      const items = (lastPallet.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
      // Restore scanned quantities back to the session for each item on this pallet
      for (const item of items) {
        const sessionItems = await getQcScanItems(input.sessionId);
        const sessionItem = sessionItems.find((i) => i.sku === item.sku);
        if (sessionItem) {
          const newQty = Math.max(0, (sessionItem.scannedQty ?? 0) - item.qty);
          await upsertQcScanItem(input.sessionId, item.sku, sessionItem.upc ?? null, { scannedQty: newQty });
        }
      }
      // Soft-delete the pallet
      await updateQcPallet(lastPallet.id, { deletedAt: new Date() });
      return { removedPalletId: lastPallet.id, removedPalletNumber: lastPallet.palletNumber, itemCount: items.length };
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

  // Remove a SKU entirely from a pallet and decrement the session-level scannedQty
  removeFromPallet: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      palletId: z.number(),
      sku: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Look up the pallet directly by its own ID (not by sessionId)
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq: eqOp } = await import("drizzle-orm");
      const { qcPallets: qcPalletsTable } = await import("../drizzle/schema.js");
      const [pallet] = await db.select().from(qcPalletsTable).where(eqOp(qcPalletsTable.id, input.palletId));
      if (!pallet) throw new TRPCError({ code: "NOT_FOUND", message: "Pallet not found" });
      const items = (pallet.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
      const removed = items.find((i) => i.sku === input.sku);
      if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found on pallet" });
      const newItems = items.filter((i) => i.sku !== input.sku);
      await updateQcPallet(pallet.id, { items: newItems as unknown as null });
      // Decrement session-level scannedQty
      const sessionItems = await getQcScanItems(input.sessionId);
      const sessionItem = sessionItems.find((i) => i.sku === input.sku);
      if (sessionItem) {
        const newQty = Math.max(0, (sessionItem.scannedQty ?? 0) - removed.qty);
        await upsertQcScanItem(input.sessionId, input.sku, sessionItem.upc ?? null, { scannedQty: newQty });
      }
      return { success: true, removedQty: removed.qty };
    }),
  // Adjust the quantity of a SKU on a pallet (set to a specific value)
  adjustPalletItemQty: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      palletId: z.number(),
      sku: z.string(),
      newQty: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      // Look up the pallet directly by its own ID (not by sessionId)
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq: eqOp2 } = await import("drizzle-orm");
      const { qcPallets: qcPalletsTable2 } = await import("../drizzle/schema.js");
      const [pallet] = await db.select().from(qcPalletsTable2).where(eqOp2(qcPalletsTable2.id, input.palletId));
      if (!pallet) throw new TRPCError({ code: "NOT_FOUND", message: "Pallet not found" });
      const items = (pallet.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
      const existing = items.find((i) => i.sku === input.sku);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found on pallet" });
      const oldQty = existing.qty;
      const delta = input.newQty - oldQty;
      if (input.newQty === 0) {
        // Remove entirely
        const newItems = items.filter((i) => i.sku !== input.sku);
        await updateQcPallet(pallet.id, { items: newItems as unknown as null });
      } else {
        existing.qty = input.newQty;
        await updateQcPallet(pallet.id, { items: items as unknown as null });
      }
      // Update session-level scannedQty by delta
      if (delta !== 0) {
        const sessionItems = await getQcScanItems(input.sessionId);
        const sessionItem = sessionItems.find((i) => i.sku === input.sku);
        if (sessionItem) {
          const newSessionQty = Math.max(0, (sessionItem.scannedQty ?? 0) + delta);
          await upsertQcScanItem(input.sessionId, input.sku, sessionItem.upc ?? null, { scannedQty: newSessionQty });
        }
      }
      return { success: true, oldQty, newQty: input.newQty };
    }),
  // Move qty of a SKU from one pallet to another (partial or full), optionally creating a new pallet
  movePalletItem: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      fromPalletId: z.number(),
      toPalletId: z.number().optional(),   // omit when createNewPallet=true
      sku: z.string(),
      qty: z.number().int().min(1),
      createNewPallet: z.boolean().optional(),
      newPalletType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Resolve destination pallet — create one if requested
      let resolvedToPalletId: number;
      let newPalletNumber: number | undefined;
      if (input.createNewPallet) {
        const existing = await getQcPallets(input.sessionId);
        newPalletNumber = existing.length + 1;
        resolvedToPalletId = await createQcPallet({
          sessionId: input.sessionId,
          palletNumber: newPalletNumber,
          palletType: input.newPalletType ?? null,
          items: [],
        });
      } else {
        if (!input.toPalletId) throw new TRPCError({ code: "BAD_REQUEST", message: "toPalletId required when createNewPallet is false" });
        resolvedToPalletId = input.toPalletId;
      }
      if (resolvedToPalletId === input.fromPalletId) throw new TRPCError({ code: "BAD_REQUEST", message: "Source and destination pallets must be different" });
      // Load both pallets
      const [fromPallets, toPallets] = await Promise.all([
        getQcPallets(input.fromPalletId),
        getQcPallets(resolvedToPalletId),
      ]);
      const fromPallet = fromPallets[0] ?? null;
      const toPallet = toPallets[0] ?? null;
      if (!fromPallet) throw new TRPCError({ code: "NOT_FOUND", message: "Source pallet not found" });
      if (!toPallet) throw new TRPCError({ code: "NOT_FOUND", message: "Destination pallet not found" });
      // Validate source has the SKU with enough qty
      const fromItems = (fromPallet.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
      const fromItem = fromItems.find((i) => i.sku === input.sku);
      if (!fromItem) throw new TRPCError({ code: "NOT_FOUND", message: `SKU ${input.sku} not found on source pallet` });
      if (fromItem.qty < input.qty) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${fromItem.qty} units available on source pallet` });
      // Update source pallet: reduce or remove
      let newFromItems: Array<{ sku: string; upc?: string; qty: number }>;
      if (fromItem.qty === input.qty) {
        newFromItems = fromItems.filter((i) => i.sku !== input.sku);
      } else {
        newFromItems = fromItems.map((i) => i.sku === input.sku ? { ...i, qty: i.qty - input.qty } : i);
      }
      await updateQcPallet(fromPallet.id, { items: newFromItems as unknown as null });
      // Update destination pallet: add or merge
      const toItems = (toPallet.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
      const toExisting = toItems.find((i) => i.sku === input.sku);
      let newToItems: Array<{ sku: string; upc?: string; qty: number }>;
      if (toExisting) {
        newToItems = toItems.map((i) => i.sku === input.sku ? { ...i, qty: i.qty + input.qty } : i);
      } else {
        newToItems = [...toItems, { sku: input.sku, upc: fromItem.upc, qty: input.qty }];
      }
      await updateQcPallet(toPallet.id, { items: newToItems as unknown as null });
      // Session-level scannedQty is unchanged — the total scanned count doesn't change when moving between pallets
      return { success: true, movedQty: input.qty, newPalletId: input.createNewPallet ? resolvedToPalletId : undefined, newPalletNumber };
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

  // List flagged scans (global)
  listFlaggedScans: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => listQcFlaggedScans(input.status ?? undefined)),
  // List flagged scans for a specific session
  listFlaggedBySession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const all = await listQcFlaggedScans();
      return { flags: all.filter((f) => f.sessionId === input.sessionId) };
    }),

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
  // Assign or update a UPC barcode on a pallet
  assignPalletUpc: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      sessionId: z.number(),
      upc: z.string().min(1).max(128),
    }))
    .mutation(async ({ input }) => {
      // Check for duplicate UPC across all pallets in this session
      const pallets = await getQcPallets(input.sessionId);
      const duplicate = pallets.find(
        (p) => p.id !== input.palletId && p.palletUpc?.trim().toLowerCase() === input.upc.trim().toLowerCase()
      );
      if (duplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `UPC "${input.upc}" is already assigned to Pallet ${duplicate.palletNumber} in this session.`,
        });
      }
      await updateQcPallet(input.palletId, { palletUpc: input.upc.trim() });
      return { success: true, palletId: input.palletId, upc: input.upc.trim() };
    }),
  // Auto-generate a UPC for a pallet (GD-{sessionId}-P{palletNumber})
  generatePalletUpc: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      sessionId: z.number(),
      palletNumber: z.number(),
    }))
    .mutation(async ({ input }) => {
      const upc = `GD-${input.sessionId}-P${input.palletNumber}`;
      await updateQcPallet(input.palletId, { palletUpc: upc });
      return { success: true, palletId: input.palletId, upc };
    }),

  // Bulk-assign UPCs to all pallets in a session that don't already have one
  bulkGeneratePalletUpcs: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const pallets = await getQcPallets(input.sessionId);
      const unassigned = pallets.filter((p) => !p.palletUpc?.trim());
      const results: Array<{ palletId: number; palletNumber: number; upc: string }> = [];
      for (const pallet of unassigned) {
        const upc = `GD-${input.sessionId}-P${pallet.palletNumber}`;
        await updateQcPallet(pallet.id, { palletUpc: upc });
        results.push({ palletId: pallet.id, palletNumber: pallet.palletNumber, upc });
      }
      return { assigned: results, skipped: pallets.length - unassigned.length };
    }),

  // Update pallet type (customer_owned | gd_owned | chep)
  updatePalletType: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      palletType: z.string().min(1).max(32),
    }))
    .mutation(async ({ input }) => {
      await updateQcPallet(input.palletId, { palletType: input.palletType });
      return { success: true, palletId: input.palletId, palletType: input.palletType };
    }),

  // Learn the most-used pallet type for a customer from recent completed sessions
  getCustomerPalletDefault: protectedProcedure
    .input(z.object({
      customerName: z.string().min(1),
      lookbackSessions: z.number().min(1).max(50).optional(),
    }))
    .query(async ({ input }) => {
      return getCustomerPalletDefaultFromDb(input.customerName);
    }),

  // Unified QC Audit Log — merges QC Scanner and Label Scanner events
  listAuditLog: protectedProcedure
    .input(z.object({
      fromDate: z.date().optional(),
      toDate: z.date().optional(),
      user: z.string().optional(),
      item: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      return listQcAuditLog({
        fromDate: input.fromDate,
        toDate: input.toDate,
        user: input.user,
        item: input.item,
        limit: input.limit ?? 100,
        offset: input.offset ?? 0,
      });
    }),
  // Update pallet height (operator-entered) and recalculate weight from item dims
  updatePalletHeight: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      heightIn: z.number().min(0).max(120),
    }))
    .mutation(async ({ input }) => {
      await updateQcPallet(input.palletId, { palletHeightIn: String(input.heightIn) });
      return { success: true };
    }),
  // Update the tare weight of the pallet (default 30 lbs, editable by operator)
  updatePalletTareWeight: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      tareLb: z.number().min(0).max(500),
    }))
    .mutation(async ({ input }) => {
      await updateQcPallet(input.palletId, { palletTareWeightLb: String(input.tareLb) });
      return { success: true };
    }),
  // Calculate pallet weight from scanned items and Extensiv item dims
  calculatePalletWeight: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      palletId: z.number(),
    }))
    .mutation(async ({ input }) => {
      // Get the pallet's items JSON
      const pallets = await getQcPallets(input.sessionId);
      const pallet = pallets.find(p => p.id === input.palletId);
      if (!pallet || !pallet.items) return { weightLb: null };
      const items = pallet.items as Array<{ sku: string; qty: number }>;
      if (!items.length) return { weightLb: null };

      // Get the session to find the config
      const session = await getQcSessionById(input.sessionId);
      if (!session?.warehouseId) return { weightLb: null };

      // Fetch carton weight and case amount maps directly from Extensiv item master
      const config = await getExtensivConfigById(session.warehouseId);
      if (!config) return { weightLb: null };
      const customerId = session.customerId ?? 0;
      // ── 1. Try 10-minute in-memory cache ──────────────────────────────────
      const cacheKey = `dims:${config.id}:${customerId}`;
      const now = Date.now();
      const cached = _palletWeightCache.get(cacheKey);
      let cartonWeightMap: Map<string, number> = new Map();
      let caseAmountMap: Map<string, number> = new Map();
      let unitWeightMap: Map<string, number> = new Map();
      if (cached && cached.expiresAt > now) {
        cartonWeightMap = cached.cartonWeightMap;
        caseAmountMap = cached.caseAmountMap;
        unitWeightMap = cached.unitWeightMap ?? new Map();
      } else {
        // ── 2. Try DB item_dims table (populated by nightly sync) ──────────
        const db = await getDb();
        let loadedFromDb = false;
        if (db) {
          try {
            const rows = await db.execute(
              sql`SELECT sku, carton_weight_lb, units_per_carton, unit_weight_lb FROM item_dims WHERE config_id = ${config.id} AND customer_id = ${customerId}`
            ) as any;
            const rowArr: Array<{ sku: string; carton_weight_lb: number | null; units_per_carton: number | null; unit_weight_lb: number | null }> =
              Array.isArray(rows) ? rows : (rows?.rows ?? []);
            if (rowArr.length > 0) {
              cartonWeightMap = new Map();
              caseAmountMap = new Map();
              unitWeightMap = new Map();
              for (const row of rowArr) {
                if (row.sku && row.carton_weight_lb != null) cartonWeightMap.set(row.sku, row.carton_weight_lb);
                if (row.sku && row.units_per_carton != null) caseAmountMap.set(row.sku, row.units_per_carton);
                if (row.sku && row.unit_weight_lb != null) unitWeightMap.set(row.sku, row.unit_weight_lb);
              }
              loadedFromDb = true;
              console.log(`[calculatePalletWeight] Loaded ${rowArr.length} SKU dims from DB cache`);
            }
          } catch (e) {
            console.warn("[calculatePalletWeight] DB dims lookup failed, falling back to Extensiv:", e);
          }
        }
        if (!loadedFromDb) {
          // ── 3. Fall back to live Extensiv API calls ─────────────────────
          console.log(`[calculatePalletWeight] Fetching dims from Extensiv for config ${config.id} / customer ${customerId}`);
          [cartonWeightMap, caseAmountMap, unitWeightMap] = await Promise.all([
            fetchItemCartonWeightMap(config, customerId),
            fetchItemCaseAmountMap(config, customerId),
            fetchItemUnitWeightMap(config, customerId),
          ]);
        }
        // ── 4. Apply manual SKU weight overrides BEFORE caching — overrides always win ──
        // Must be applied here (before cache storage) so the cache contains corrected values.
        // Overrides take priority over both Extensiv API data and the item_dims DB cache.
        try {
          const overrideRows = await getSkuWeightOverrides(config.id, customerId);
          for (const row of overrideRows) {
            const overrideCartonW = Number(row.cartonWeightLb);
            if (overrideCartonW > 0) {
              cartonWeightMap.set(row.sku, overrideCartonW);
              if (row.unitsPerCarton && row.unitsPerCarton > 0) {
                caseAmountMap.set(row.sku, row.unitsPerCarton);
              }
            }
          }
        } catch (e) {
          console.warn('[calculatePalletWeight] Failed to load SKU weight overrides before caching:', e);
        }
        // Store in 10-minute in-memory cache (now includes override-corrected values)
        _palletWeightCache.set(cacheKey, {
          cartonWeightMap: cartonWeightMap!,
          caseAmountMap: caseAmountMap!,
          unitWeightMap: unitWeightMap!,
          expiresAt: now + 10 * 60 * 1000,
        });
      }

      // (Overrides already applied above before caching — no second pass needed)

      // Calculate total weight: sum(perUnitWeightLb * qty) per SKU
      // Priority: override/carton → (cartonWeightLb / unitsPerCarton) → unit_weight_lb (imperial.weight) → skip
      let totalLb = 0;
      type SkuWeightBreakdown = {
        sku: string;
        qty: number;
        perUnitWeightLb: number | null;
        totalWeightLb: number | null;
        source: 'carton' | 'imperial' | 'none';
      };
      const skuBreakdown: SkuWeightBreakdown[] = [];
      const zeroWeightSkus: string[] = [];
      for (const item of items) {
        const cartonW = cartonWeightMap.get(item.sku);
        if (cartonW) {
          const unitsPerCarton = caseAmountMap.get(item.sku) ?? 1;
          const perUnitW = Math.round((cartonW / unitsPerCarton) * 10000) / 10000;
          const contrib = perUnitW * item.qty;
          totalLb += contrib;
          skuBreakdown.push({ sku: item.sku, qty: item.qty, perUnitWeightLb: perUnitW, totalWeightLb: Math.round(contrib * 100) / 100, source: 'carton' });
        } else {
          // Fallback: use item-level imperial.weight directly
          const unitW = unitWeightMap.get(item.sku);
          if (unitW) {
            const contrib = unitW * item.qty;
            totalLb += contrib;
            skuBreakdown.push({ sku: item.sku, qty: item.qty, perUnitWeightLb: unitW, totalWeightLb: Math.round(contrib * 100) / 100, source: 'imperial' });
          } else {
            skuBreakdown.push({ sku: item.sku, qty: item.qty, perUnitWeightLb: null, totalWeightLb: null, source: 'none' });
            zeroWeightSkus.push(item.sku);
          }
        }
      }
      // Add pallet tare weight (default 30 lbs if not set)
      const tareLb = pallet.palletTareWeightLb ? parseFloat(String(pallet.palletTareWeightLb)) : 30;
      const weightLb = Math.round((totalLb + tareLb) * 100) / 100;
      await updateQcPallet(input.palletId, { calculatedWeightLb: String(weightLb) });
      return { weightLb, skuBreakdown, zeroWeightSkus };
    }),
  // Set or clear operator weight override (takes precedence over calculated weight on labels)
  updatePalletWeightOverride: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      weightLb: z.number().min(0).max(9999).nullable(),
    }))
    .mutation(async ({ input }) => {
      await updateQcPallet(input.palletId, {
        weightOverrideLb: input.weightLb !== null ? String(input.weightLb) : null,
      });
      return { success: true };
    }),

  // Persist pallet item assignments (called after every scan to survive page refresh)
  updatePalletItems: protectedProcedure
    .input(z.object({
      palletId: z.number(),
      items: z.array(z.object({
        sku: z.string(),
        upc: z.string().optional(),
        qty: z.number().int().min(0),
      })),
    }))
    .mutation(async ({ input }) => {
      await updateQcPallet(input.palletId, {
        items: input.items as unknown as null,
      });
      return { success: true };
    }),

  // Create a demo QC session with realistic replicated data (no Extensiv connection needed)
  createDemoSession: protectedProcedure
    .input(z.object({
      scenario: z.enum(["apparel", "electronics", "mixed"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const scenario = input.scenario ?? "mixed";

      // ── Demo order catalogue ────────────────────────────────────────────────
      type DemoItem = { sku: string; upc: string; description: string; expectedQty: number; caseAmount: number; weightLbPerCase: number };
      const SCENARIOS: Record<string, { customerName: string; warehouseName: string; poNumber: string; destination: string; items: DemoItem[] }> = {
        apparel: {
          customerName: "DEMO — Lakeview Apparel Co.",
          warehouseName: "Columbus, OH",
          poNumber: "PO-DEMO-2026-APP",
          destination: "Target DC #0719 — 1000 Nicollet Mall, Minneapolis, MN 55403",
          items: [
            { sku: "APP-TEE-SM-BLK",   upc: "012345678901", description: "Classic Tee — Small Black",   expectedQty: 3, caseAmount: 3, weightLbPerCase: 8.5 },
            { sku: "APP-TEE-MD-BLK",   upc: "012345678902", description: "Classic Tee — Medium Black",  expectedQty: 3, caseAmount: 3, weightLbPerCase: 8.5 },
            { sku: "APP-TEE-LG-BLK",   upc: "012345678903", description: "Classic Tee — Large Black",   expectedQty: 3, caseAmount: 3, weightLbPerCase: 8.5 },
            { sku: "APP-HOODIE-SM-NVY",upc: "012345678904", description: "Pullover Hoodie — Small Navy", expectedQty: 2, caseAmount: 2,  weightLbPerCase: 14.0 },
            { sku: "APP-HOODIE-MD-NVY",upc: "012345678905", description: "Pullover Hoodie — Medium Navy",expectedQty: 2, caseAmount: 2,  weightLbPerCase: 14.0 },
            { sku: "APP-HOODIE-LG-NVY",upc: "012345678906", description: "Pullover Hoodie — Large Navy", expectedQty: 2, caseAmount: 2,  weightLbPerCase: 14.0 },
          ],
        },
        electronics: {
          customerName: "DEMO — TechBridge Distribution",
          warehouseName: "Columbus, OH",
          poNumber: "PO-DEMO-2026-ELEC",
          destination: "Best Buy DC #0042 — 7601 Penn Ave S, Richfield, MN 55423",
          items: [
            { sku: "ELEC-HDMI-4K-6FT",  upc: "023456789001", description: "4K HDMI Cable 6ft",           expectedQty: 4, caseAmount: 4, weightLbPerCase: 6.0 },
            { sku: "ELEC-USB-C-HUB-7P", upc: "023456789002", description: "USB-C 7-Port Hub",            expectedQty: 3, caseAmount: 3, weightLbPerCase: 9.0 },
            { sku: "ELEC-WLESS-CHG-15W",upc: "023456789003", description: "Wireless Charger 15W Pad",    expectedQty: 3, caseAmount: 3, weightLbPerCase: 11.0 },
            { sku: "ELEC-BT-SPKR-MINI", upc: "023456789004", description: "Bluetooth Mini Speaker",      expectedQty: 2, caseAmount: 2,  weightLbPerCase: 18.0 },
          ],
        },
        mixed: {
          customerName: "DEMO — Meridian Retail Group",
          warehouseName: "Columbus, OH",
          poNumber: "PO-DEMO-2026-MIX",
          destination: "Walmart DC #6097 — 601 S Walton Blvd, Bentonville, AR 72712",
          items: [
            { sku: "MIX-CANDLE-VAN-12OZ", upc: "034567890101", description: "Vanilla Soy Candle 12oz",     expectedQty: 3, caseAmount: 3, weightLbPerCase: 16.0 },
            { sku: "MIX-CANDLE-LAV-12OZ", upc: "034567890102", description: "Lavender Soy Candle 12oz",   expectedQty: 3, caseAmount: 3, weightLbPerCase: 16.0 },
            { sku: "MIX-SOAP-SHEA-BAR",   upc: "034567890103", description: "Shea Butter Bar Soap 4pk",   expectedQty: 3, caseAmount: 3, weightLbPerCase: 12.0 },
            { sku: "MIX-LOTION-ROSE-8OZ", upc: "034567890104", description: "Rose Body Lotion 8oz",       expectedQty: 3, caseAmount: 3, weightLbPerCase: 18.0 },
            { sku: "MIX-DIFFUSER-EUCAL",  upc: "034567890105", description: "Eucalyptus Reed Diffuser",   expectedQty: 2, caseAmount: 2, weightLbPerCase: 14.0 },
            { sku: "MIX-GIFT-SET-SPA",    upc: "034567890106", description: "Spa Gift Set — 3pc",         expectedQty: 2, caseAmount: 2,  weightLbPerCase: 22.0 },
          ],
        },
      };

      const order = SCENARIOS[scenario];
      // Use a negative TX ID range so demo sessions never collide with real Extensiv IDs
      const demoTxId = -(Date.now() % 1_000_000); // e.g. -847291

      // Create the session
      const sessionId = await createQcSession({
        referenceNumber: `DEMO-${scenario.toUpperCase()}-${Math.abs(demoTxId)}`,
        transactionId: demoTxId,
        warehouseName: order.warehouseName,
        customerName: order.customerName,
        poNumber: order.poNumber,
        destinationAddress: order.destination,
        status: "scanning",
        createdBy: ctx.user.name ?? "Demo",
        foundInExtensiv: false,
      });

      // Seed expected items
      for (const item of order.items) {
        await upsertQcScanItem(sessionId, item.sku, item.upc, {
          description: item.description,
          expectedQty: item.expectedQty,
          caseAmount: item.caseAmount,
          scannedQty: 0,
          scanTimestamps: [],
        });
      }

      // Create first pallet
      await createQcPallet({ sessionId, palletNumber: 1, items: [] });

      const session = await getQcSessionById(sessionId);
      const items = await getQcScanItems(sessionId);
      const pallets = await getQcPallets(sessionId);

      return {
        session,
        items,
        pallets,
        resumed: false,
        isDemo: true,
        demoScenario: scenario,
        // Return the UPC→SKU map so the frontend can simulate barcode scanning
        demoUpcMap: order.items.map((i) => ({ sku: i.sku, upc: i.upc, description: i.description, weightLbPerCase: i.weightLbPerCase, caseAmount: i.caseAmount })),
      };
    }),

  // Supervisor history: list all sessions (all statuses) with pallets + scan item summary
  getSessionHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).optional(),
      offset: z.number().min(0).optional(),
      status: z.enum(["scanning", "complete", "shipped"]).optional(),
      customerName: z.string().optional(),
      search: z.string().optional(), // searches referenceNumber, transactionId, customerName
    }))
    .query(async ({ input }) => {
      const sessions = await listQcSessions(input.limit ?? 100);

      // Filter by status if provided
      let filtered = sessions;
      if (input.status) {
        filtered = filtered.filter((s) => s.status === input.status);
      }
      if (input.customerName) {
        filtered = filtered.filter((s) => s.customerName === input.customerName);
      }
      if (input.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter((s) =>
          s.referenceNumber?.toLowerCase().includes(q) ||
          String(s.transactionId ?? "").includes(q) ||
          s.customerName?.toLowerCase().includes(q) ||
          s.poNumber?.toLowerCase().includes(q)
        );
      }

      // Apply offset
      const offset = input.offset ?? 0;
      const page = filtered.slice(offset, offset + (input.limit ?? 100));

      // Enrich each session with pallets + scan item summary
      const enriched = await Promise.all(
        page.map(async (s) => {
          const [pallets, scanItems] = await Promise.all([
            getQcPallets(s.id),
            getQcScanItems(s.id),
          ]);
          const totalExpected = scanItems.reduce((acc, i) => acc + (i.expectedQty ?? 0), 0);
          const totalScanned = scanItems.reduce((acc, i) => acc + (i.scannedQty ?? 0), 0);
          const skuCount = scanItems.length;
          const totalCases = scanItems.reduce((acc, i) => {
            const ca = i.caseAmount && i.caseAmount > 1 ? i.caseAmount : 1;
            return acc + (ca > 1 ? Math.floor((i.scannedQty ?? 0) / ca) : (i.scannedQty ?? 0));
          }, 0);
          return {
            ...s,
            pallets: pallets.map((p) => ({
              id: p.id,
              palletNumber: p.palletNumber,
              palletUpc: p.palletUpc,
              palletType: p.palletType,
              items: p.items,
              palletHeightIn: p.palletHeightIn,
              calculatedWeightLb: p.calculatedWeightLb,
              weightOverrideLb: p.weightOverrideLb,
              builtAt: p.builtAt,
              photoUrl: p.photoUrl,
            })),
            skuCount,
            totalExpected,
            totalScanned,
            totalCases,
          };
        })
      );

      return {
        sessions: enriched,
        total: filtered.length,
      };
    }),

  /** Persist the outbound staging lane chosen in the dock recommendation dialog */
  setStagingLane: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      stagingLane: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq } = await import("drizzle-orm");
      await db.update(qcScanSessions)
        .set({ stagingLane: input.stagingLane ?? null })
        .where(eq(qcScanSessions.id, input.sessionId));
      return { ok: true };
    }),

  /**
   * Scan an MU (Movable Unit / license plate) barcode.
   * Looks up the MU in Extensiv, imports all its inventory records as a complete pallet
   * on the current session, updates scannedQty for each SKU, then creates the next pallet.
   *
   * Returns:
   *   - palletId: the ID of the newly completed MU pallet
   *   - palletNumber: its number
   *   - muItems: array of { sku, qty } imported
   *   - nextPalletId / nextPalletNumber: the new empty pallet ready for scanning
   *   - notFound: true if the MU was not found in Extensiv
   */
  scanMu: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      muLabel: z.string().min(1),
      palletId: z.number(), // the current active pallet to fill with MU contents
      palletType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // 1. Get the session config
      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const configs = await getExtensivConfigs();
      let config = session.warehouseId ? await getExtensivConfigById(session.warehouseId) : null;
      if (!config) config = configs.find((c) => c.isActive) ?? configs[0] ?? null;
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No Extensiv configuration found" });

      // 2. Look up the MU in Extensiv
      // Pass customerId and facilityId so the function can fall back to client-side filtering
      // if the Extensiv stockdetails endpoint doesn't support muLabel RQL filtering
      const muRecords = await fetchInventoryByMuLabel(config, input.muLabel, {
        customerId: session.customerId ?? undefined,
        facilityId: session.facilityId ?? undefined,
        configId: config.id,
      });
      if (!muRecords.length) {
        return { notFound: true, muLabel: input.muLabel, palletId: input.palletId, palletNumber: null, muItems: [], nextPalletId: null, nextPalletNumber: null };
      }

      // 3. Aggregate qty by SKU (an MU may have multiple records for the same SKU with different lots)
      const skuQtyMap = new Map<string, number>();
      for (const rec of muRecords) {
        const sku = rec.itemIdentifier?.sku;
        if (!sku) continue;
        skuQtyMap.set(sku, (skuQtyMap.get(sku) ?? 0) + (rec.onHand ?? rec.available ?? 0));
      }
      const muItems = Array.from(skuQtyMap.entries()).map(([sku, qty]) => ({ sku, qty }));

      // 4. Fetch the current pallet and overwrite its items with the MU contents
      const existingPallets = await getQcPallets(input.sessionId);
      const activePallet = existingPallets.find((p) => p.id === input.palletId);
      if (!activePallet) throw new TRPCError({ code: "NOT_FOUND", message: "Active pallet not found" });

      // Merge MU items into the pallet (in case the pallet already has some manually scanned items)
      const existingItems = (activePallet.items as Array<{ sku: string; qty: number }> | null) ?? [];
      const mergedItems = [...existingItems];
      for (const muItem of muItems) {
        const existing = mergedItems.find((i) => i.sku === muItem.sku);
        if (existing) {
          existing.qty += muItem.qty;
        } else {
          mergedItems.push({ sku: muItem.sku, qty: muItem.qty });
        }
      }
      await updateQcPallet(input.palletId, { items: mergedItems as unknown as null, muLabel: input.muLabel });

      // 5. Update scannedQty on each session item for the SKUs on this MU
      const sessionItems = await getQcScanItems(input.sessionId);
      for (const muItem of muItems) {
        const sessionItem = sessionItems.find((i) => i.sku === muItem.sku);
        if (sessionItem) {
          const newQty = Math.min((sessionItem.scannedQty ?? 0) + muItem.qty, sessionItem.expectedQty ?? Infinity);
          await upsertQcScanItem(input.sessionId, muItem.sku, sessionItem.upc ?? null, { scannedQty: newQty });
        }
      }

      // 6. Auto-calculate weight for the MU pallet
      const cartonWeightBySkuFromDB = new Map<string, number>();
      for (const si of sessionItems) {
        if (si.cartonWeightLb != null) cartonWeightBySkuFromDB.set(si.sku, parseFloat(String(si.cartonWeightLb)));
      }
      let totalItemLb = 0;
      for (const item of mergedItems) {
        const w = cartonWeightBySkuFromDB.get(item.sku);
        if (w) totalItemLb += w * item.qty;
      }
      const tareLb = activePallet.palletTareWeightLb ? parseFloat(String(activePallet.palletTareWeightLb)) : 30;
      const calculatedWeightLb = totalItemLb > 0 ? String(Math.round((totalItemLb + tareLb) * 100) / 100) : null;
      if (calculatedWeightLb) await updateQcPallet(input.palletId, { calculatedWeightLb });

      // 7. Check if the session is now complete
      const updatedItems = await getQcScanItems(input.sessionId);
      const sessionComplete = updatedItems.every((i) => (i.scannedQty ?? 0) >= (i.expectedQty ?? 0));

      // 8. Create the next pallet (unless session is complete)
      let nextPalletId: number | null = null;
      let nextPalletNumber: number | null = null;
      if (!sessionComplete) {
        const allPallets = await getQcPallets(input.sessionId);
        const nextNumber = allPallets.length + 1;
        nextPalletId = await createQcPallet({ sessionId: input.sessionId, palletNumber: nextNumber, palletType: input.palletType ?? null, items: [] });
        nextPalletNumber = nextNumber;
      } else {
        // Mark session complete
        await updateQcSession(input.sessionId, { status: "complete" } as any);
      }

      return {
        notFound: false,
        muLabel: input.muLabel,
        palletId: input.palletId,
        palletNumber: activePallet.palletNumber,
        muItems,
        nextPalletId,
        nextPalletNumber,
        sessionComplete,
        calculatedWeightLb: calculatedWeightLb ? parseFloat(calculatedWeightLb) : null,
      };
    }),
  /**
   * Debug: dump raw Extensiv /inventory/stockdetails response for a given muLabel.
   * Returns the first 5 raw records (before normalization) so we can inspect the actual field names.
   */
  debugMuLookup: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      muLabel: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const configs = await getExtensivConfigs();
      let config = session.warehouseId ? await getExtensivConfigById(session.warehouseId) : null;
      if (!config) config = configs.find((c) => c.isActive) ?? configs[0] ?? null;
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No Extensiv configuration found" });
      const { createExtensivClient } = await import("./extensiv/client");
      const client = createExtensivClient(config);
      const attempts: Array<{ label: string; params: Record<string, unknown>; rawRecords: unknown[]; keys: string[] }> = [];
      const tryFetch = async (label: string, params: Record<string, unknown>) => {
        try {
          const data = await client.get("/inventory/stockdetails", { ...params, pgsiz: 5, pgnum: 1 }) as Record<string, unknown>;
          const resourceList = data["ResourceList"] ?? data["resourceList"];
          const rawRecords = Array.isArray(resourceList) ? (resourceList as Record<string, unknown>[]).slice(0, 5) : [];
          const keys = rawRecords.length > 0 ? Object.keys(rawRecords[0] as Record<string, unknown>) : [];
          attempts.push({ label, params, rawRecords, keys });
        } catch (err: unknown) {
          attempts.push({ label, params, rawRecords: [], keys: [(err as Error).message ?? "error"] });
        }
      };
      await tryFetch("RQL muLabel encoded", { rql: `muLabel==${encodeURIComponent(input.muLabel)}` });
      await tryFetch("RQL muLabel raw", { rql: `muLabel==${input.muLabel}` });
      await tryFetch("RQL MuLabel PascalCase", { rql: `MuLabel==${input.muLabel}` });
      await tryFetch("RQL palletIdentifier.nameKey.name", { rql: `palletIdentifier.nameKey.name==${encodeURIComponent(input.muLabel)}` });
      if (session.customerId && session.facilityId) {
        await tryFetch("All inventory for customer (sample 5)", {
          rql: `customerIdentifier.id==${session.customerId};facilityIdentifier.id==${session.facilityId}`,
        });
      }
      // Also dump raw receiver items to identify the actual muLabel field name
      // Paginate up to 20 pages (2000 receivers) to find the specific MU label value
      let rawReceiverDump: unknown[] = [];
      let rawReceiverItemSample: unknown = null;
      let firstItemFieldNames: string[] = [];
      try {
        const receiversRql = session.customerId && session.facilityId
          ? `ReadOnly.CustomerIdentifier.id==${session.customerId};ReadOnly.FacilityIdentifier.id==${session.facilityId}`
          : session.customerId ? `ReadOnly.CustomerIdentifier.id==${session.customerId}` : "";
        let pgnum = 1;
        const pgsiz = 100;
        const MAX_PAGES = 20;
        let firstReceiverCaptured = false;
        while (pgnum <= MAX_PAGES && !rawReceiverItemSample) {
          const receiversData = await client.get("/inventory/receivers", {
            rql: receiversRql,
            detail: "ReceiveItems",
            pgsiz,
            pgnum,
          }) as Record<string, unknown>;
          const rl = receiversData["ResourceList"] ?? receiversData["resourceList"];
          const receiverList: Record<string, unknown>[] = Array.isArray(rl) ? rl as Record<string, unknown>[] : [];
          if (receiverList.length === 0) break;
          // Capture the first receiver's structure for diagnostics (once)
          if (!firstReceiverCaptured && receiverList.length > 0) {
            firstReceiverCaptured = true;
            const r = receiverList[0];
            const emb = (r["_embedded"] ?? {}) as Record<string, unknown>;
            let firstItem: Record<string, unknown> | null = null;
            for (const k of Object.keys(emb)) {
              const arr = emb[k];
              if (Array.isArray(arr) && arr.length > 0) { firstItem = arr[0] as Record<string, unknown>; break; }
            }
            if (!firstItem) {
              const topItems = r["receiveItems"] ?? r["ReceiveItems"];
              if (Array.isArray(topItems) && topItems.length > 0) firstItem = topItems[0] as Record<string, unknown>;
            }
            if (firstItem) firstItemFieldNames = Object.keys(firstItem);
            rawReceiverDump = [{
              topLevelKeys: Object.keys(r),
              embeddedKeys: Object.keys(emb),
              firstItemFieldNames,
              firstItemSample: firstItem,
            }];
          }
          // Search all items on this page for the muLabel value in any field
          for (const receiver of receiverList) {
            const allItems: Record<string, unknown>[] = [];
            const emb = (receiver["_embedded"] ?? {}) as Record<string, unknown>;
            for (const k of Object.keys(emb)) {
              const arr = emb[k];
              if (Array.isArray(arr)) allItems.push(...(arr as Record<string, unknown>[]));
            }
            const topItems = receiver["receiveItems"] ?? receiver["ReceiveItems"];
            if (Array.isArray(topItems)) allItems.push(...(topItems as Record<string, unknown>[]));
            for (const item of allItems) {
              // Check every field value — find which field holds the MU label
              for (const [k, v] of Object.entries(item)) {
                if (String(v) === input.muLabel) {
                  rawReceiverItemSample = { matchedFieldName: k, matchedValue: v, fullItem: item };
                  break;
                }
              }
              if (rawReceiverItemSample) break;
            }
            if (rawReceiverItemSample) break;
          }
          if (receiverList.length < pgsiz) break;
          pgnum++;
        }
      } catch (err: unknown) {
        rawReceiverDump = [{ error: (err as Error).message }];
      }
      return { muLabel: input.muLabel, customerId: session.customerId, facilityId: session.facilityId, attempts, rawReceiverDump, rawReceiverItemSample };
    }),
  /**
   * Send a completed QC session's order to Shipwell as a purchase order (LTL shipment).
   * Auto-populates from session + order_tracking data. Returns the Shipwell PO id and URL.
   */
  sendToShipwell: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      /** Optional operator overrides */
      palletCountOverride: z.number().int().min(1).optional(),
      totalWeightLbOverride: z.number().optional(),
      /** LTL freight class (e.g. '70', '92.5', '125') — auto-populated from customer shipping rules */
      freightClass: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const config = await getShipwellConfig();
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "No Shipwell config found. Please configure Shipwell credentials first." });

      const session = await getQcSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "QC session not found." });

      // Find the matching order_tracking row via transactionId
      let trackedOrder: Awaited<ReturnType<typeof getTrackedOrders>>[number] | undefined;
      if (session.transactionId) {
        const orders = await getTrackedOrders();
        trackedOrder = orders.find((o) => o.extensivOrderId === session.transactionId);
      }

      // Calculate total pallet weight from qcPallets
      const pallets = await getQcPallets(input.sessionId);
      const activePallets = pallets.filter((p) => !p.deletedAt);
      const palletCount = input.palletCountOverride ?? activePallets.length;
      let totalWeightLb = input.totalWeightLbOverride;
      if (!totalWeightLb) {
        totalWeightLb = activePallets.reduce((sum, p) => {
          const weight = p.weightOverrideLb ? parseFloat(String(p.weightOverrideLb)) :
            p.calculatedWeightLb ? parseFloat(String(p.calculatedWeightLb)) : 0;
          const tare = p.palletTareWeightLb ? parseFloat(String(p.palletTareWeightLb)) : 30;
          return sum + weight + tare;
        }, 0);
      }

      // Build Shipwell client
      const client = createShipwellClient({
        email: config.email,
        password: config.password,
        environment: config.environment as "sandbox" | "production",
      });

      // Origin: GD warehouse (facility name)
      const facilityName = session.facilityName ?? trackedOrder?.facilityName ?? "Go Direct Warehouse";
      const originAddress = {
        address_1: facilityName,
        city: "Warehouse",
        country: "CA",
      };

      // Destination: ship-to from session or order_tracking
      const shipToName = trackedOrder?.shipToName ?? session.destinationAddress ?? "Unknown";
      const shipToCity = trackedOrder?.shipToCity ?? "Unknown";
      const destinationAddress = {
        address_1: shipToName,
        city: shipToCity,
        country: "CA",
      };

      const orderNumber = session.referenceNumber ?? String(session.transactionId ?? session.id);
      const customerName = session.customerName ?? trackedOrder?.clientName ?? undefined;

      // Build line items — include freight class if provided
      const lineItems = palletCount > 0 ? [{
        description: `LTL Freight — ${palletCount} pallet${palletCount !== 1 ? "s" : ""}`,
        quantity: palletCount,
        unit_of_measure: "PLT",
        weight: totalWeightLb ? Math.round(totalWeightLb) : undefined,
        weight_unit: totalWeightLb ? "LB" : undefined,
        package_type: "PLT",
        total_packages: palletCount,
        freight_class: input.freightClass ?? null,
      }] : undefined;

      const po = await client.createPurchaseOrder({
        order_number: orderNumber,
        purchase_order_number: session.poNumber ?? trackedOrder?.poNum ?? undefined,
        customer_reference_number: session.referenceNumber ?? (trackedOrder?.extensivOrderId ? String(trackedOrder.extensivOrderId) : undefined),
        origin_address: originAddress,
        destination_address: destinationAddress,
        customer_name: customerName,
        source: "SHIPWELL_WEB",
        line_items: lineItems,
        custom_data: {
          gd_qc_session_id: session.id,
          gd_reference_num: session.referenceNumber,
          gd_pallet_count: palletCount,
          gd_total_weight_lb: totalWeightLb,
          gd_facility: facilityName,
          gd_freight_class: input.freightClass ?? null,
        },
      });

      const poUrl = client.getPoUrl(po.id);

      // Return immediately — all post-creation work runs in the background
      // so the Cloud Run 180s hard limit is never hit by slow downstream calls.
      void (async () => {
        try {
          // Mark order_tracking row as sent to Shipwell (if we have a tracked order)
          if (trackedOrder) {
            await markOrderSentToShipwell(trackedOrder.extensivOrderId, po.id, poUrl);
            // Write unified shipment record
            try {
              const ltlShipmentId = await createShipment({
                platform: "shipwell",
                mode: "ltl",
                extensivOrderId: trackedOrder.extensivOrderId,
                orderNumber: session.referenceNumber ?? undefined,
                customerId: trackedOrder.clientId ?? undefined,
                customerName: customerName,
                facilityName: facilityName,
                shipToName: trackedOrder.shipToName ?? undefined,
                shipToCity: trackedOrder.shipToCity ?? undefined,
                shipwellOrderId: po.id,
                status: "booked",
                bookedByUserId: String(ctx.user.id),
                bookedByName: ctx.user.name ?? undefined,
              });
              void pushShipmentToClearSight(ltlShipmentId, "shipment.created");
            } catch (err) {
              console.error("[QcShipwell] Failed to write unified shipment record:", err);
            }
          }
          await createAuditLog({
            userId: ctx.user.id,
            action: "qcScanner.sendToShipwell",
            entityType: "qc_scan_session",
            entityId: String(session.id),
            details: { shipwellOrderId: po.id, poUrl, palletCount, totalWeightLb, environment: config.environment },
          });
        } catch (err) {
          console.error("[QcShipwell] Background post-creation work failed:", err);
        }
      })();

      return { success: true, shipwellOrderId: po.id, poUrl };
    }),
});
// Pallet Scanner router (Shipping section))
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

  // ── Two-step pallet shipping workflow ──────────────────────────────────────

  /**
   * Step 1: load a QC session by reference number and return its pallets.
   * Used by the pallet scanner to pull up an order before scanning pallet UPCs.
   */
  loadOrder: protectedProcedure
    .input(z.object({ referenceNumber: z.string().min(1) }))
    .query(async ({ input }) => {
      const session = await getQcSessionByRef(input.referenceNumber.trim());
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No QC session found for reference number "${input.referenceNumber}".`,
        });
      }
      const pallets = await getQcPallets(session.id);
      return {
        session: {
          id: session.id,
          referenceNumber: session.referenceNumber,
          customerName: session.customerName,
          warehouseName: session.warehouseName,
          status: session.status,
        },
        pallets: pallets.map((p) => ({
          id: p.id,
          palletNumber: p.palletNumber,
          palletUpc: p.palletUpc,
          shippedAt: p.shippedAt,
          photoUrl: p.photoUrl,
        })),
      };
    }),

  /**
   * Step 2: scan a pallet UPC to stamp it as shipped.
   * Returns the full updated pallet list for the session.
   */
  scanPallet: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      palletUpc: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const pallets = await getQcPallets(input.sessionId);
      const pallet = pallets.find(
        (p) => p.palletUpc?.trim().toLowerCase() === input.palletUpc.trim().toLowerCase()
      );
      if (!pallet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Pallet UPC "${input.palletUpc}" not found on this order.`,
        });
      }
      if (!pallet.shippedAt) {
        await updateQcPallet(pallet.id, { shippedAt: new Date() });
      }
      const updated = await getQcPallets(input.sessionId);
      return updated.map((p) => ({
        id: p.id,
        palletNumber: p.palletNumber,
        palletUpc: p.palletUpc,
        shippedAt: p.shippedAt,
        photoUrl: p.photoUrl,
      }));
    }),

  /**
   * Upload a dock photo for a pallet (base64 data URL → S3).
   * Stores the resulting URL on the pallet record.
   */
  uploadPhoto: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      palletUpc: z.string(),
      dataUrl: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      // Strip the data URL prefix to get raw base64
      const base64 = input.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const suffix = Date.now();
      const key = `pallet-photos/${input.sessionId}/${input.palletUpc.replace(/[^a-zA-Z0-9]/g, "-")}-${suffix}.jpg`;
      const { url } = await storagePut(key, buffer, "image/jpeg");
      // Find the pallet and store the photo URL
      const pallets = await getQcPallets(input.sessionId);
      const pallet = pallets.find(
        (p) => p.palletUpc?.trim().toLowerCase() === input.palletUpc.trim().toLowerCase()
      );
      if (pallet) {
        await updateQcPallet(pallet.id, { photoUrl: url });
      }
       return { url };
    }),

 });
// ─── SKU Weight Override Router ───────────────────────────────────────────────
const skuWeightRouter = router({
  list: protectedProcedure
    .input(z.object({ configId: z.number(), customerId: z.number() }))
    .query(async ({ input }) => {
      return getSkuWeightOverrides(input.configId, input.customerId);
    }),

  /** List ALL weight overrides across all configs/customers — for the management table in Settings */
  listAll: protectedProcedure.query(async () => {
    return listAllSkuWeightOverrides();
  }),

  /** Update a single override row by id */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      cartonWeightLb: z.number().positive(),
      unitsPerCarton: z.number().int().positive().optional().nullable(),
      note: z.string().max(256).optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await (await import('./db')).getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { skuWeightOverrides: tbl } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      await db.update(tbl)
        .set({
          cartonWeightLb: String(input.cartonWeightLb),
          unitsPerCarton: input.unitsPerCarton ?? null,
          note: input.note ?? null,
        })
        .where(eq(tbl.id, input.id));
      return { success: true };
    }),
  upsert: protectedProcedure
    .input(z.object({
      configId: z.number(),
      customerId: z.number(),
      sku: z.string().min(1),
      cartonWeightLb: z.number().positive(),
      unitsPerCarton: z.number().int().positive().optional().nullable(),
      note: z.string().max(256).optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      await upsertSkuWeightOverride(
        input.configId,
        input.customerId,
        input.sku,
        input.cartonWeightLb,
        input.unitsPerCarton,
        input.note,
      );
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteSkuWeightOverride(input.id);
      return { success: true };
    }),

  /**
   * Push a carton weight to Extensiv (updates options.packageUnit.weightLbs on the item).
   * Also saves the override locally as a fallback.
   *
   * Returns { success, savedLocally, pushedToExtensiv, previousWeight, error? }
   */
  pushWeightToExtensiv: protectedProcedure
    .input(z.object({
      configId: z.number(),
      customerId: z.number(),
      sku: z.string().min(1),
      cartonWeightLb: z.number().positive(),
      note: z.string().max(256).optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });

      // Always save locally first as a fallback
      await upsertSkuWeightOverride(
        input.configId,
        input.customerId,
        input.sku,
        input.cartonWeightLb,
        null,
        input.note ?? null,
      );

      // Attempt to push to Extensiv
      const result = await updateItemPackageUnitWeight(
        config,
        input.customerId,
        input.sku,
        input.cartonWeightLb,
      );

      return {
        success: result.success,
        savedLocally: true,
        pushedToExtensiv: result.success,
        previousWeight: result.previousWeight ?? null,
        itemId: result.itemId ?? null,
        error: result.error ?? null,
      };
    }),
});
// ─── Receiving Router ────────────────────────────────────────────────────────
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

  completeReceipt: protectedProcedure
    .input(z.object({ configId: z.number(), transactionId: z.number() }))
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });
      const result = await completeReceipt(config, input.transactionId);
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to complete receipt in Extensiv",
        });
      }
      return { success: true };
    }),

  /**
   * Confirm or adjust a single line item's received quantity.
   * Saves the confirmation locally and updates Extensiv via PUT.
   */
  confirmItem: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        transactionId: z.number(),
        receiverItemId: z.number(),
        sku: z.string(),
        expectedQty: z.number(),
        confirmedQty: z.number(),
        /** "confirmed" | "adjusted" | "flagged" */
        status: z.enum(["confirmed", "adjusted", "flagged"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });
      // Save locally
      await upsertReceiptItemConfirmation({
        configId: input.configId,
        transactionId: input.transactionId,
        receiverItemId: input.receiverItemId,
        sku: input.sku,
        expectedQty: input.expectedQty,
        confirmedQty: input.confirmedQty,
        status: input.status,
        note: input.note ?? null,
        confirmedBy: ctx.user?.name ?? null,
        confirmedAt: Date.now(),
      });
      // Push adjusted qty to Extensiv (skip if qty unchanged)
      if (input.confirmedQty !== input.expectedQty) {
        const result = await updateReceiverItemQty(
          config,
          input.transactionId,
          input.receiverItemId,
          input.confirmedQty
        );
        if (!result.success) {
          // Non-fatal: log but don't throw — local record is saved
          console.warn(`[receiving.confirmItem] Extensiv update failed: ${result.error}`);
        }
      }
      return { success: true };
    }),

  /** Get all local confirmations for a receipt. */
  getConfirmations: protectedProcedure
    .input(z.object({ configId: z.number(), transactionId: z.number() }))
    .query(async ({ input }) => {
      return getReceiptItemConfirmations(input.configId, input.transactionId);
    }),

  /** Reset all confirmations for a receipt (e.g., start over). */
  resetConfirmations: protectedProcedure
    .input(z.object({ configId: z.number(), transactionId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteReceiptItemConfirmations(input.configId, input.transactionId);
      return { success: true };
    }),

  /**
   * Generate MU labels for each confirmed line item on a receipt.
   * Creates one MU label per line item (one pallet per SKU).
   * Embeds the labels in the Extensiv receiver via PUT.
   */
  generateMUs: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        transactionId: z.number(),
        facilityCode: z.string().optional(),
        /** Override MU type (default: Pallet) */
        muType: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });
      // Get confirmed items
      const confirmations = await getReceiptItemConfirmations(
        input.configId,
        input.transactionId
      );
      if (confirmations.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No confirmed items found. Confirm all line items before generating MUs.",
        });
      }
      // Delete any existing MU labels for this receipt
      await deleteMuLabelsForTransaction(input.configId, input.transactionId);
      // Generate a label per confirmed item
      const facilityCode = (input.facilityCode ?? "WH").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const muType = input.muType ?? "Pallet";
      const newLabels = confirmations.map((c, idx) => ({
        configId: input.configId,
        transactionId: input.transactionId,
        receiverItemId: c.receiverItemId,
        sku: c.sku,
        muLabel: `MU-${facilityCode}-${datePart}-${String(input.transactionId).slice(-4)}-${String(idx + 1).padStart(3, "0")}`,
        muType,
        qty: c.confirmedQty,
        syncedToExtensiv: false,
        createdAt: Date.now(),
      }));
      await createMuLabels(newLabels);
      // Embed labels in Extensiv receiver
      const assignments = newLabels.map((l) => ({
        receiverItemId: l.receiverItemId,
        muLabel: l.muLabel,
        muType: l.muType,
      }));
      const syncResult = await assignMULabelsToReceiver(
        config,
        input.transactionId,
        assignments
      );
      if (syncResult.success) {
        // Mark all as synced
        const saved = await getMuLabelsForTransaction(input.configId, input.transactionId);
        for (const label of saved) {
          await import("./db").then((m) => m.markMuLabelSynced(label.id));
        }
      } else {
        console.warn(`[receiving.generateMUs] Extensiv sync failed: ${syncResult.error}`);
      }
      return {
        success: true,
        labels: newLabels.map((l) => ({ sku: l.sku, muLabel: l.muLabel, qty: l.qty })),
        syncedToExtensiv: syncResult.success,
      };
    }),

  /** Get generated MU labels for a receipt. */
  getMuLabels: protectedProcedure
    .input(z.object({ configId: z.number(), transactionId: z.number() }))
    .query(async ({ input }) => {
      return getMuLabelsForTransaction(input.configId, input.transactionId);
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

      // Fetch inventory, location configs, Extensiv locations, and priority config in parallel
      const [inventory, locationCfgs, extensivLocations, priorityConfig] = await Promise.all([
        fetchInventory(config, input.customerId, input.facilityId),
        getLocationConfigsByCustomer(input.configId, input.customerId),
        fetchExtensivLocations(config, input.facilityId),
        getPutAwayPriorities(input.configId, input.facilityId, input.customerId),
      ]);

      // Build aisle priority map: aisle (uppercase) -> priorityOrder (1 = highest priority)
      // Priority config entries with level="*" apply to all locations in that aisle.
      // Entries with a specific level (e.g. "A") apply only to that aisle+level combination.
      //
      // Location name format: "AISLE-ROW-LEVEL" (e.g. "D-017-C") or "AISLE-ROW" (e.g. "D-017").
      // The level segment is the LAST dash-separated token.
      // The aisle segment is the FIRST dash-separated token.
      //
      // Priority lookup order (first match wins):
      //   1. Exact aisle+level match  (e.g. priority row { aisle: "D", level: "A" } matches "D-017-A")
      //   2. Wildcard aisle match     (e.g. priority row { aisle: "D", level: "*" } matches any "D-*")

      // Build two maps:
      //   exactPriorityMap: "AISLE|LEVEL" -> priorityOrder
      //   aislePriorityMap: "AISLE"       -> priorityOrder  (wildcard / level="*" entries)
      const exactPriorityMap = new Map<string, number>();
      const aislePriorityMap = new Map<string, number>();
      for (const p of priorityConfig) {
        const aisleKey = p.aisle.toUpperCase();
        if (!p.level || p.level === "*") {
          // Wildcard: applies to the whole aisle (only if no more-specific entry already set)
          if (!aislePriorityMap.has(aisleKey)) {
            aislePriorityMap.set(aisleKey, p.priorityOrder);
          }
        } else {
          // Exact aisle+level match
          const exactKey = `${aisleKey}|${p.level.toUpperCase()}`;
          if (!exactPriorityMap.has(exactKey)) {
            exactPriorityMap.set(exactKey, p.priorityOrder);
          }
        }
      }

      /**
       * Returns the best matching priority order for a location name, or null if none configured.
       * Also returns the matched level for display purposes.
       *
       * Location names follow the pattern "AISLE-ROW-LEVEL" (e.g. "D-017-C") or "AISLE-ROW".
       * Match priority: exact aisle+level > wildcard aisle.
       */
      function getLocationPriority(locationName: string): { order: number; level: string } | null {
        const parts = locationName.split("-");
        const aisle = (parts[0] ?? "").toUpperCase();
        const level = parts.length >= 3 ? (parts[parts.length - 1] ?? "").toUpperCase() : "";
        // 1. Exact match
        if (level) {
          const exactKey = `${aisle}|${level}`;
          if (exactPriorityMap.has(exactKey)) {
            return { order: exactPriorityMap.get(exactKey)!, level };
          }
        }
        // 2. Wildcard aisle match
        if (aislePriorityMap.has(aisle)) {
          return { order: aislePriorityMap.get(aisle)!, level: "*" };
        }
        return null;
      }

      // Keep backward-compatible helper used in sort comparator
      function getAislePriority(locationName: string): number | null {
        const match = getLocationPriority(locationName);
        return match ? match.order : null;
      }

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
        isPriorityAisle: boolean; // true when this location matches a user-configured priority entry
        aislePriorityOrder: number | null; // the configured priority order (1 = highest), null if not configured
        /** The level that was matched (e.g. "A", "B") or "*" for a wildcard aisle match */
        matchedLevel: string | null;
      };

      const suggestions: Suggestion[] = [];

      // Priority tiers (lower number = better):
      //   1  - consolidate in a prioritised aisle (pick_face)
      //   2  - consolidate in a prioritised aisle (warehouse)
      //   3  - consolidate in any aisle (pick_face)
      //   4  - consolidate in any aisle (warehouse)
      //   5  - empty pick_face in a prioritised aisle
      //   6  - empty warehouse in a prioritised aisle
      //   7  - empty pick_face (no priority config)
      //   8  - empty warehouse (no priority config)
      // Within the same tier, sort by aislePriority (ascending) then alphabetically.

      const hasPriorityConfig = aislePriorityMap.size > 0 || exactPriorityMap.size > 0;

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
        const locPri = getLocationPriority(locName);
        const isPrioritised = locPri !== null;
        let priority: number;
        if (hasPriorityConfig) {
          priority = locType === "pick_face"
            ? (isPrioritised ? 1 : 3)
            : (isPrioritised ? 2 : 4);
        } else {
          priority = locType === "pick_face" ? 1 : 2;
        }
        suggestions.push({
          locationName: locName,
          locationType: locType,
          reason: "consolidate",
          currentQty: totalQty,
          expirationDate: sorted[0]?.expirationDate,
          lotNumber: sorted[0]?.lotNumber,
          priority,
          isPriorityAisle: isPrioritised,
          aislePriorityOrder: locPri?.order ?? null,
          matchedLevel: locPri?.level ?? null,
        });
      }

      // 2. Empty pick_face locations (no stock at all)
      for (const loc of extensivLocations) {
        if (locationStockMap.has(loc.name)) continue; // has stock
        const locType = locationNameTypeMap.get(loc.name) ?? "warehouse";
        if (locType !== "pick_face") continue;
        const locPri = getLocationPriority(loc.name);
        const isPrioritised = locPri !== null;
        suggestions.push({
          locationName: loc.name,
          locationType: "pick_face",
          reason: "empty_pick_face",
          currentQty: 0,
          priority: hasPriorityConfig ? (isPrioritised ? 5 : 7) : 3,
          isPriorityAisle: isPrioritised,
          aislePriorityOrder: locPri?.order ?? null,
          matchedLevel: locPri?.level ?? null,
        });
      }

      // 3. Empty warehouse locations (no stock at all)
      for (const loc of extensivLocations) {
        if (locationStockMap.has(loc.name)) continue;
        const locType = locationNameTypeMap.get(loc.name) ?? "warehouse";
        if (locType !== "warehouse") continue;
        const locPri = getLocationPriority(loc.name);
        const isPrioritised = locPri !== null;
        suggestions.push({
          locationName: loc.name,
          locationType: "warehouse",
          reason: "empty_warehouse",
          currentQty: 0,
          priority: hasPriorityConfig ? (isPrioritised ? 6 : 8) : 4,
          isPriorityAisle: isPrioritised,
          aislePriorityOrder: locPri?.order ?? null,
          matchedLevel: locPri?.level ?? null,
        });
      }

      // Sort: primary by priority tier, secondary by aisle priority order (if configured),
      // tertiary alphabetically by location name.
      suggestions.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const aPri = getAislePriority(a.locationName) ?? 9999;
        const bPri = getAislePriority(b.locationName) ?? 9999;
        if (aPri !== bPri) return aPri - bPri;
        return a.locationName.localeCompare(b.locationName);
      });

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

  /**
   * Get put-away aisle/level priorities for a warehouse+customer.
   */
  getPriority: protectedProcedure
    .input(z.object({
      configId: z.number(),
      facilityId: z.number(),
      customerId: z.number(),
    }))
    .query(async ({ input }) => {
      return getPutAwayPriorities(input.configId, input.facilityId, input.customerId);
    }),

  /**
   * Save (replace) put-away aisle/level priorities for a warehouse+customer.
   */
  savePriority: protectedProcedure
    .input(z.object({
      configId: z.number(),
      facilityId: z.number(),
      customerId: z.number(),
      entries: z.array(z.object({
        aisle: z.string().min(1),
        level: z.string().min(1).default("*"),
        priorityOrder: z.number().int().min(1),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const updatedBy = ctx.user?.name ?? undefined;
      await savePutAwayPriorities(
        input.configId,
        input.facilityId,
        input.customerId,
        input.entries,
        updatedBy
      );
      return { success: true };
    }),

  /**
   * Clear all put-away priorities for a warehouse+customer.
   */
  clearPriority: protectedProcedure
    .input(z.object({
      configId: z.number(),
      facilityId: z.number(),
      customerId: z.number(),
    }))
    .mutation(async ({ input }) => {
      await deletePutAwayPriorities(input.configId, input.facilityId, input.customerId);
      return { success: true };
    }),

  /**
   * Generate a full recommended location list for every SKU in a receipt.
   * Fetches all receive items from Extensiv, runs the suggestion engine for
   * each SKU in parallel, and returns the top suggestion per SKU.
   */
  batchSuggest: protectedProcedure
    .input(z.object({
      configId: z.number(),
      facilityId: z.number(),
      customerId: z.number(),
      transactionId: z.number(),
    }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });

      // Fetch receipt items, inventory, location configs, extensiv locations, and priorities in parallel
      const [receiver, inventory, locationCfgs, extensivLocations, priorityConfig] = await Promise.all([
        fetchReceiverDetail(config, input.transactionId),
        fetchInventory(config, input.customerId, input.facilityId),
        getLocationConfigsByCustomer(input.configId, input.customerId),
        fetchExtensivLocations(config, input.facilityId),
        getPutAwayPriorities(input.configId, input.facilityId, input.customerId),
      ]);

      if (!receiver) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
      const receiveItems = receiver.receiveItems ?? [];

      // Build priority maps
      const exactPriorityMap = new Map<string, number>();
      const aislePriorityMap = new Map<string, number>();
      for (const p of priorityConfig) {
        const aisleKey = p.aisle.toUpperCase();
        if (!p.level || p.level === "*") {
          if (!aislePriorityMap.has(aisleKey)) aislePriorityMap.set(aisleKey, p.priorityOrder);
        } else {
          const exactKey = `${aisleKey}|${p.level.toUpperCase()}`;
          if (!exactPriorityMap.has(exactKey)) exactPriorityMap.set(exactKey, p.priorityOrder);
        }
      }
      const hasPriorityConfig = aislePriorityMap.size > 0 || exactPriorityMap.size > 0;

      function getLocPriority(locationName: string): { order: number; level: string } | null {
        const parts = locationName.split("-");
        const aisle = (parts[0] ?? "").toUpperCase();
        const level = parts.length >= 3 ? (parts[parts.length - 1] ?? "").toUpperCase() : "";
        if (level) {
          const exactKey = `${aisle}|${level}`;
          if (exactPriorityMap.has(exactKey)) return { order: exactPriorityMap.get(exactKey)!, level };
        }
        if (aislePriorityMap.has(aisle)) return { order: aislePriorityMap.get(aisle)!, level: "*" };
        return null;
      }

      // Build location type map
      const locationTypeMap = new Map<number, "pick_face" | "warehouse" | "staging">();
      for (const lc of locationCfgs) locationTypeMap.set(lc.locationId, lc.locationType);
      const locationNameTypeMap = new Map<string, "pick_face" | "warehouse">();
      for (const loc of extensivLocations) {
        const isPickFace = loc.name.toLowerCase().includes("pick face") || locationTypeMap.get(loc.locationId) === "pick_face";
        locationNameTypeMap.set(loc.name, isPickFace ? "pick_face" : "warehouse");
      }

      // Group all inventory by location
      const locationStockMap = new Map<string, typeof inventory>();
      for (const rec of inventory) {
        const locName = rec.locationIdentifier?.nameKey?.name ?? "Unknown";
        if (!locationStockMap.has(locName)) locationStockMap.set(locName, []);
        locationStockMap.get(locName)!.push(rec);
      }

      type BatchSuggestion = {
        locationName: string;
        locationType: "pick_face" | "warehouse";
        reason: "consolidate" | "empty_pick_face" | "empty_warehouse";
        currentQty: number;
        expirationDate?: string;
        lotNumber?: string;
        priority: number;
        isPriorityAisle: boolean;
        aislePriorityOrder: number | null;
        matchedLevel: string | null;
        locationId: number | null;
      };

      type BatchSuggestionWithId = BatchSuggestion;

      type SkuRow = {
        sku: string;
        description?: string;
        receivedQty: number;
        receiverItemId: number | null;
        /** Pallet-level IDs from inventory records for this SKU — used by moveInventory */
        receiveItemIds: number[];
        lotNumber?: string;
        expirationDate?: string;
        topSuggestion: BatchSuggestionWithId | null;
        allSuggestions: BatchSuggestionWithId[];
      };

      // Build a map of locationName -> locationId from extensivLocations
      const locationIdMap = new Map<string, number>();
      for (const loc of extensivLocations) locationIdMap.set(loc.name, loc.locationId);

      // Generate suggestions for each SKU
      const rows: SkuRow[] = receiveItems.map((item) => {
        const sku = item.itemIdentifier.sku;
        const skuInventory = inventory.filter(
          (rec) => rec.itemIdentifier.sku.toLowerCase() === sku.toLowerCase()
        );
        const skuLocationMap = new Map<string, typeof skuInventory>();
        for (const rec of skuInventory) {
          const locName = rec.locationIdentifier?.nameKey?.name ?? "Unknown";
          if (!skuLocationMap.has(locName)) skuLocationMap.set(locName, []);
          skuLocationMap.get(locName)!.push(rec);
        }

        const suggestions: BatchSuggestion[] = [];

        // Consolidation candidates
        for (const [locName, recs] of Array.from(skuLocationMap.entries())) {
          const locType = locationNameTypeMap.get(locName) ?? "warehouse";
          const sorted = [...recs].sort((a, b) => {
            if (a.expirationDate && b.expirationDate) return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
            if (a.expirationDate) return -1;
            if (b.expirationDate) return 1;
            return a.receiveItemId - b.receiveItemId;
          });
          const totalQty = recs.reduce((s: number, r: { available: number }) => s + r.available, 0);
          const locPri = getLocPriority(locName);
          const isPrioritised = locPri !== null;
          let priority: number;
          if (hasPriorityConfig) {
            priority = locType === "pick_face" ? (isPrioritised ? 1 : 3) : (isPrioritised ? 2 : 4);
          } else {
            priority = locType === "pick_face" ? 1 : 2;
          }
          suggestions.push({ locationName: locName, locationType: locType, reason: "consolidate", currentQty: totalQty, expirationDate: sorted[0]?.expirationDate, lotNumber: sorted[0]?.lotNumber, priority, isPriorityAisle: isPrioritised, aislePriorityOrder: locPri?.order ?? null, matchedLevel: locPri?.level ?? null, locationId: locationIdMap.get(locName) ?? null });
        }

        // Empty pick_face locations
        for (const loc of extensivLocations) {
          if (locationStockMap.has(loc.name)) continue;
          const locType = locationNameTypeMap.get(loc.name) ?? "warehouse";
          if (locType !== "pick_face") continue;
          const locPri = getLocPriority(loc.name);
          const isPrioritised = locPri !== null;
          suggestions.push({ locationName: loc.name, locationType: "pick_face", reason: "empty_pick_face", currentQty: 0, priority: hasPriorityConfig ? (isPrioritised ? 5 : 7) : 3, isPriorityAisle: isPrioritised, aislePriorityOrder: locPri?.order ?? null, matchedLevel: locPri?.level ?? null, locationId: loc.locationId });
        }

        // Empty warehouse locations
        for (const loc of extensivLocations) {
          if (locationStockMap.has(loc.name)) continue;
          const locType = locationNameTypeMap.get(loc.name) ?? "warehouse";
          if (locType !== "warehouse") continue;
          const locPri = getLocPriority(loc.name);
          const isPrioritised = locPri !== null;
          suggestions.push({ locationName: loc.name, locationType: "warehouse", reason: "empty_warehouse", currentQty: 0, priority: hasPriorityConfig ? (isPrioritised ? 6 : 8) : 4, isPriorityAisle: isPrioritised, aislePriorityOrder: locPri?.order ?? null, matchedLevel: locPri?.level ?? null, locationId: loc.locationId });
        }

        suggestions.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          const aPri = getLocPriority(a.locationName)?.order ?? 9999;
          const bPri = getLocPriority(b.locationName)?.order ?? 9999;
          if (aPri !== bPri) return aPri - bPri;
          return a.locationName.localeCompare(b.locationName);
        });

        // Collect all pallet-level receiveItemIds from inventory for this SKU (for moveInventory)
        const receiveItemIds = skuInventory.map((r) => r.receiveItemId).filter((id): id is number => typeof id === "number");

        return {
          sku,
          description: item.description,
          receivedQty: item.receivedQty,
          receiverItemId: item.receiverItemId ?? null,
          receiveItemIds,
          lotNumber: item.lotNumber,
          expirationDate: item.expirationDate,
          topSuggestion: suggestions[0] ?? null,
          allSuggestions: suggestions.slice(0, 10),
        };
      });

      return {
        transactionId: input.transactionId,
        referenceNum: receiver.referenceNum,
        facilityName: receiver.readOnly?.facilityIdentifier?.name ?? "",
        rows,
        hasPriorityConfig,
      };
    }),

  /**
   * Return the put-away list: all SKUs moved (via Genius or operator scan),
   * joined with their MU labels for display.
   */
  putAwayList: protectedProcedure
    .input(z.object({
      configId: z.number(),
      facilityId: z.number().optional(),
      customerId: z.number().optional(),
      dateFrom: z.string().optional(), // ISO date string
      dateTo: z.string().optional(),   // ISO date string
      commitMode: z.enum(["extensiv", "scan", "all"]).default("all"),
      limit: z.number().min(1).max(1000).default(500),
    }))
    .query(async ({ input }) => {
      return listPutAwayList({
        configId: input.configId,
        facilityId: input.facilityId,
        customerId: input.customerId,
        dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
        commitMode: input.commitMode,
        limit: input.limit,
      });
    }),

  /**
   * Commit accepted put-aways to Extensiv by calling moveInventory for each row.
   * Returns per-row results so the UI can show success/failure per SKU.
   */
  commitPutAways: protectedProcedure
    .input(z.object({
      configId: z.number(),
      facilityId: z.number(),
      /** Extensiv receiver transactionId — used to link to MU labels */
      transactionId: z.number().optional(),
      /** Human-readable warehouse name (cached for display) */
      facilityName: z.string().optional(),
      items: z.array(z.object({
        sku: z.string(),
        /** Pallet-level receiveItemIds from inventory — each gets its own move entry */
        receiveItemIds: z.array(z.number()),
        qty: z.number(),
        locationId: z.number().optional(),
        locationName: z.string(),
        description: z.string().optional(),
        lotNumber: z.string().optional(),
        expirationDate: z.string().optional(),
      })),
      customerId: z.number().optional(),
      customerName: z.string().optional(),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });

      // Build a lookup map from sku -> item metadata for scan logging
      const itemMeta = new Map<string, { description?: string; lotNumber?: string; expirationDate?: string; qty: number }>();
      for (const item of input.items) {
        itemMeta.set(item.sku, { description: item.description, lotNumber: item.lotNumber, expirationDate: item.expirationDate, qty: item.qty });
      }

      // Group items by destination locationId (skip items without a locationId — they can't be moved)
      const byDest = new Map<number, { locationName: string; items: Array<{ receiveItemId: number; quantity: number }>; skus: string[] }>();
      const skippedSkus: string[] = [];
      for (const item of input.items) {
        if (!item.locationId) { skippedSkus.push(item.sku); continue; }
        if (!byDest.has(item.locationId)) {
          byDest.set(item.locationId, { locationName: item.locationName, items: [], skus: [] });
        }
        // Each pallet gets its own move entry; split qty evenly across pallets
        const qtyPerPallet = item.receiveItemIds.length > 0 ? Math.ceil(item.qty / item.receiveItemIds.length) : item.qty;
        for (const rid of item.receiveItemIds) {
          byDest.get(item.locationId)!.items.push({ receiveItemId: rid, quantity: qtyPerPallet });
        }
        byDest.get(item.locationId)!.skus.push(item.sku);
      }

      const results: Array<{ sku: string; locationName: string; success: boolean; error?: string }> = [];
      for (const sku of skippedSkus) results.push({ sku, locationName: "", success: false, error: "No location ID — cannot move in Extensiv" });

      for (const [locationId, dest] of Array.from(byDest.entries())) {
        const moveResult = await moveInventory(config, locationId, dest.locationName, dest.items, input.facilityId);
        for (const sku of dest.skus) {
          results.push({ sku, locationName: dest.locationName, success: moveResult.success, error: moveResult.error });
          // Log successful moves to put_away_scans for the Put Away List
          if (moveResult.success && input.sessionId) {
            const meta = itemMeta.get(sku);
            await createPutAwayScan({
              configId: input.configId,
              facilityId: input.facilityId,
              facilityName: input.facilityName ?? undefined,
              customerId: input.customerId ?? 0,
              customerName: input.customerName ?? undefined,
              sku,
              description: meta?.description ?? undefined,
              lotNumber: meta?.lotNumber ?? undefined,
              expirationDate: meta?.expirationDate ?? undefined,
              confirmedLocation: dest.locationName,
              qty: meta?.qty ?? 1,
              sessionId: input.sessionId,
              transactionId: input.transactionId ?? undefined,
              commitMode: "extensiv",
            } as Parameters<typeof createPutAwayScan>[0]);
          }
        }
      }

      return { results };
    }),
});

// ─── Audit Documents Router ──────────────────────────────────────────────────
const auditDocumentsRouter = router({
  /**
   * Fetch order detail for one or more transaction IDs from Extensiv.
   * Returns structured pick ticket data for each order.
   */
  fetchPickTickets: protectedProcedure
    .input(z.object({
      configId: z.number(),
      transactionIds: z.array(z.number().int().positive()).min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Extensiv config not found" });

      const results = await Promise.allSettled(
        input.transactionIds.map((txId) => fetchOrderWithDetail(config, txId))
      );

      const tickets: Array<{
        transactionId: number;
        referenceNum: string;
        poNum: string;
        customerName: string;
        facilityName: string;
        status: number;
        creationDate: string;
        shipTo: {
          companyName: string;
          address1: string;
          city: string;
          state: string;
          zip: string;
        };
        items: Array<{
          sku: string;
          description: string;
          qty: number;
          lotNumber: string;
          expirationDate: string;
        }>;
      }> = [];

      const errors: Array<{ transactionId: number; error: string }> = [];

      for (let i = 0; i < results.length; i++) {
        const txId = input.transactionIds[i];
        const result = results[i];
        if (result.status === "fulfilled") {
          const { order } = result.value;
          tickets.push({
            transactionId: txId,
            referenceNum: order.referenceNum ?? "",
            poNum: order.poNum ?? "",
            customerName: order.readOnly?.customerIdentifier?.name ?? "",
            facilityName: order.readOnly?.facilityIdentifier?.name ?? "",
            status: order.readOnly?.status ?? 0,
            creationDate: order.readOnly?.creationDate ?? "",
            shipTo: {
              companyName: order.shipTo?.companyName ?? "",
              address1: order.shipTo?.address1 ?? "",
              city: order.shipTo?.city ?? "",
              state: order.shipTo?.state ?? "",
              zip: order.shipTo?.zip ?? "",
            },
            items: (order.orderItems ?? []).map((item) => ({
              sku: item.itemIdentifier?.sku ?? "",
              description: "",
              qty: item.qty ?? 0,
              lotNumber: item.lotNumber ?? "",
              expirationDate: item.expirationDate ?? "",
            })),
          });
        } else {
          const err = result.reason as Error & { status?: number };
          errors.push({
            transactionId: txId,
            error: err?.message ?? "Unknown error",
          });
        }
      }

      return { tickets, errors };
    }),
});

// ─── Label Scan Router ──────────────────────────────────────────────────────
const labelScanRouter = router({
  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: protectedProcedure.query(async () => {
    return getLabelScanSettings();
  }),

  updateSettings: protectedProcedure
    .input(z.object({
      printerIp: z.string().optional(),
      printerPort: z.number().int().min(1).max(65535).optional(),
      gs1Prefix: z.string().optional(),
      labelFolderPath: z.string().optional(),
      // PLC integration
      plcProtocol: z.enum(["modbus", "enip"]).optional(),
      plcIp: z.string().optional(),
      plcPort: z.number().int().min(1).max(65535).optional(),
      plcUnitId: z.number().int().min(0).max(255).optional(),
      plcStubMode: z.boolean().optional(),
      // EtherNet/IP
      enipSlot: z.number().int().min(0).max(15).optional(),
      enipPath: z.string().optional(),
      enipTagBeltStop: z.string().optional(),
      enipTagTampFire: z.string().optional(),
      enipTagDivertOn: z.string().optional(),
      // Modbus coil addresses — v3 full map
      // Output coils (App → PLC)
      modbusCoilDivert: z.number().int().min(0).optional(),
      modbusCoilBeltStop: z.number().int().min(0).optional(),
      modbusCoilTampFire: z.number().int().min(0).optional(),
      modbusCoilStopPlate: z.number().int().min(0).optional(),
      modbusCoilSquareExtend: z.number().int().min(0).optional(),
      modbusCoilSquareRetract: z.number().int().min(0).optional(),
      // Input coils (PLC → App)
      modbusCoilTampReady: z.number().int().min(0).optional(),
      modbusCoilBeltRunning: z.number().int().min(0).optional(),
      modbusCoilSquareConfirmed: z.number().int().min(0).optional(),
      modbusCoilSquareHome: z.number().int().min(0).optional(),
      // Data registers
      modbusRegTampX: z.number().int().min(0).optional(),
      modbusRegTampY: z.number().int().min(0).optional(),
      modbusRegEncoderPos: z.number().int().min(0).optional(),
      // Network topology
      qcAppIp: z.string().optional(),
      edgeComputeIp: z.string().optional(),
      zebraIp: z.string().optional(),
      lpaIp: z.string().optional(),
      lpaPort: z.number().int().min(1).max(65535).optional(),
      // Squaring station / tamp config
      tampXMmFixed: z.number().min(0).optional(),
      squaringTimeoutMs: z.number().int().min(100).optional(),
      tampReadyTimeoutMs: z.number().int().min(100).optional(),
      // Camera C — post-apply verification camera seat
      camCIp: z.string().optional(),
      camCPort: z.number().int().min(1).max(65535).optional(),
      // Scan image retention policy (days; 0 = never purge)
      scanImageRetentionDays: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { tampXMmFixed, ...rest } = input;
      await upsertLabelScanSettings({
        ...rest,
        ...(tampXMmFixed !== undefined ? { tampXMmFixed: String(tampXMmFixed) } : {}),
      });
      return { success: true };
    }),





  // ── Label Files ────────────────────────────────────────────────────────────
  listLabelFiles: protectedProcedure
    .input(z.object({ batchName: z.string().optional() }))
    .query(async ({ input }) => listLabelFiles(input.batchName)),

  uploadLabelFile: protectedProcedure
    .input(z.object({
      barcode: z.string().min(1),
      filename: z.string().min(1),
      fileBase64: z.string().min(1), // base64-encoded ZPL content
      batchName: z.string().optional(),
      clientName: z.string().optional(),
      labelType: z.enum(["ucc128", "fba", "other"]).optional(),
      extensivTransactionId: z.string().optional(),
      orderRef: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.fileBase64, "base64");
      const s3Key = `label-files/${Date.now()}-${input.barcode}-${input.filename}`;
      const { url } = await storagePut(s3Key, buffer, "application/octet-stream");
      const id = await createLabelFile({
        barcode: input.barcode.trim(),
        filename: input.filename,
        s3Key,
        s3Url: url,
        batchName: input.batchName ?? null,
        clientName: input.clientName ?? null,
        labelType: input.labelType ?? "ucc128",
        uploadedBy: ctx.user.name ?? null,
        extensivTransactionId: input.extensivTransactionId ?? null,
        orderRef: input.orderRef ?? null,
      });
      return { id, url };
    }),

  deleteLabelFile: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteLabelFile(input.id);
      return { success: true };
    }),

  // ── Order Lookup ───────────────────────────────────────────────────────────
  // Scan the pack sheet barcode (Extensiv transaction ID) to pre-fill session details
  lookupOrderByTransactionId: protectedProcedure
    .input(z.object({ transactionId: z.string().min(1) }))  
    .mutation(async ({ input }) => {
      const configs = await getExtensivConfigs();
      const config = configs.find((c) => c.isActive) ?? configs[0];
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No Extensiv configuration found. Please set up an Extensiv API config first." });

      const txId = parseInt(input.transactionId.trim(), 10);
      if (isNaN(txId)) throw new TRPCError({ code: "BAD_REQUEST", message: `"${input.transactionId}" is not a valid transaction ID.` });

      const { order } = await fetchOrderWithDetail(config, txId);
      const clientName = order.readOnly?.customerIdentifier?.name ?? "";
      const orderRef = order.referenceNum ?? String(txId);
      const expectedCartons = order.readOnly?.totalCartons ?? undefined;
      const poNum = order.poNum ?? undefined;
      const shipToName = order.shipTo?.companyName ?? order.shipTo?.name ?? "";

      return {
        transactionId: String(txId),
        orderRef,
        clientName,
        expectedCartons,
        poNum,
        shipToName,
      };
    }),

  // ── Sessions ───────────────────────────────────────────────────────────────
  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ input }) => listLabelScanSessions(input.limit ?? 50)),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const session = await getLabelScanSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const cartons = await getLabelScanCartonsBySession(input.sessionId);
      return { session, cartons };
    }),

  startSession: protectedProcedure
    .input(z.object({
      orderRef: z.string().min(1),
      clientName: z.string().optional(),
      expectedCartons: z.number().int().positive().optional(),
      printerIp: z.string().optional(),
      printerPort: z.number().int().optional(),
      extensivTransactionId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createLabelScanSession({
        orderRef: input.orderRef,
        clientName: input.clientName ?? null,
        expectedCartons: input.expectedCartons ?? null,
        status: "active",
        printerIp: input.printerIp ?? null,
        printerPort: input.printerPort ?? null,
        scannedCount: 0,
        dispatchedCount: 0,
        exceptionCount: 0,
        createdBy: ctx.user.name ?? null,
        extensivTransactionId: input.extensivTransactionId ?? null,
      });
      const session = await getLabelScanSessionById(id);
      return { session };
    }),

  completeSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      await updateLabelScanSession(input.sessionId, {
        status: "complete",
        completedAt: new Date(),
      });
      return { success: true };
    }),

  // ── Carton Scan ────────────────────────────────────────────────────────────
  // Core procedure: scan a carton barcode, look up label, dispatch ZPL to printer
  scanCarton: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      barcode: z.string().min(1),
      // QC fields
      qcItemCount: z.number().int().optional(),
      qcNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getLabelScanSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Session is ${session.status} — cannot scan` });
      }

      // Look up label file by barcode
      const labelFile = await getLabelFileByBarcode(input.barcode.trim());

      if (!labelFile) {
        // ── EXCEPTION: no matching label ──────────────────────────────────────
        // Stop the line: set session status to "stopped"
        await updateLabelScanSession(input.sessionId, {
          status: "stopped",
          scannedCount: (session.scannedCount ?? 0) + 1,
          exceptionCount: (session.exceptionCount ?? 0) + 1,
        });
        const cartonId = await createLabelScanCarton({
          sessionId: input.sessionId,
          barcode: input.barcode.trim(),
          labelFileId: null,
          dispatched: false,
          hasException: true,
          exceptionReason: "no_label",
          exceptionDetail: `No label file found for barcode "${input.barcode.trim()}". Upload a ZPL label file with this barcode before resuming.`,
          qcItemCount: input.qcItemCount ?? null,
          qcNotes: input.qcNotes ?? null,
        });
        return {
          success: false,
          lineStopped: true,
          cartonId,
          exception: {
            reason: "no_label" as const,
            barcode: input.barcode.trim(),
            detail: `No label file found for barcode "${input.barcode.trim()}". Upload a ZPL label file with this barcode before resuming.`,
          },
        };
      }

      // ── Dispatch ZPL to print-and-apply machine ───────────────────────────
      // Determine printer IP/port: session override > global settings
      const settings = await getLabelScanSettings();
      const printerIp = session.printerIp ?? settings?.printerIp ?? "";
      const printerPort = session.printerPort ?? settings?.printerPort ?? 9100;

      let dispatched = false;
      let dispatchError: string | null = null;

      if (printerIp) {
        try {
          // Fetch ZPL content from S3 URL (Node 18+ built-in fetch)
          const resp = await fetch(labelFile.s3Url);
          if (!resp.ok) throw new Error(`S3 fetch failed: ${resp.status}`);
          const zplArrayBuffer = await resp.arrayBuffer();
          const zplBuffer = Buffer.from(zplArrayBuffer);

          // Send ZPL over TCP to the print-and-apply machine
          await new Promise<void>((resolve, reject) => {
            const net = require("net");
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
              socket.destroy();
              reject(new Error("Printer connection timed out after 5s"));
            }, 5000);
            socket.connect(printerPort, printerIp, () => {
              socket.write(zplBuffer, () => {
                clearTimeout(timeout);
                socket.end();
                resolve();
              });
            });
            socket.on("error", (err: Error) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
          dispatched = true;
        } catch (err: any) {
          dispatchError = err?.message ?? "Unknown dispatch error";
        }
      } else {
        dispatchError = "No printer IP configured";
      }

      if (!dispatched) {
        // Dispatch failed — stop the line
        await updateLabelScanSession(input.sessionId, {
          status: "stopped",
          scannedCount: (session.scannedCount ?? 0) + 1,
          exceptionCount: (session.exceptionCount ?? 0) + 1,
        });
        const cartonId = await createLabelScanCarton({
          sessionId: input.sessionId,
          barcode: input.barcode.trim(),
          labelFileId: labelFile.id,
          dispatched: false,
          hasException: true,
          exceptionReason: "dispatch_failed",
          exceptionDetail: dispatchError ?? "Label dispatch failed",
          qcItemCount: input.qcItemCount ?? null,
          qcNotes: input.qcNotes ?? null,
        });
        return {
          success: false,
          lineStopped: true,
          cartonId,
          exception: {
            reason: "dispatch_failed" as const,
            barcode: input.barcode.trim(),
            detail: dispatchError ?? "Label dispatch failed",
          },
        };
      }

      // ── Success ───────────────────────────────────────────────────────────
      const cartonId = await createLabelScanCarton({
        sessionId: input.sessionId,
        barcode: input.barcode.trim(),
        labelFileId: labelFile.id,
        dispatched: true,
        dispatchedAt: new Date(),
        hasException: false,
        qcItemCount: input.qcItemCount ?? null,
        qcNotes: input.qcNotes ?? null,
      });
      await updateLabelScanSession(input.sessionId, {
        scannedCount: (session.scannedCount ?? 0) + 1,
        dispatchedCount: (session.dispatchedCount ?? 0) + 1,
      });
      return {
        success: true,
        lineStopped: false,
        cartonId,
        labelFile: { id: labelFile.id, filename: labelFile.filename, labelType: labelFile.labelType },
      };
    }),

  // Supervisor resolves a stop-line exception and resumes the session
  // If the carton has a label file associated, automatically retries ZPL dispatch before resuming.
  resolveException: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      cartonId: z.number(),
      resolvedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const session = await getLabelScanSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const carton = await getLabelScanCartonById(input.cartonId);

      let retryDispatched = false;
      let retryError: string | null = null;
      let retryAttempted = false;

      // ── Auto-retry ZPL dispatch if the carton has a label file ──────────────
      if (carton?.labelFileId) {
        retryAttempted = true;
        try {
          const labelFile = await getLabelFileById(carton.labelFileId);
          if (!labelFile) throw new Error("Label file record not found");

          const settings = await getLabelScanSettings();
          const printerIp = session.printerIp ?? settings?.printerIp ?? "";
          const printerPort = session.printerPort ?? settings?.printerPort ?? 9100;

          if (!printerIp) throw new Error("No printer IP configured");

          const resp = await fetch(labelFile.s3Url);
          if (!resp.ok) throw new Error(`S3 fetch failed: ${resp.status}`);
          const zplArrayBuffer = await resp.arrayBuffer();
          const zplBuffer = Buffer.from(zplArrayBuffer);

          await new Promise<void>((resolve, reject) => {
            const net = require("net");
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
              socket.destroy();
              reject(new Error("Printer connection timed out after 5s"));
            }, 5000);
            socket.connect(printerPort, printerIp, () => {
              socket.write(zplBuffer, () => {
                clearTimeout(timeout);
                socket.end();
                resolve();
              });
            });
            socket.on("error", (err: Error) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
          retryDispatched = true;
        } catch (err: any) {
          retryError = err?.message ?? "Retry dispatch failed";
        }
      }

      // Update carton record with resolution details and retry outcome
      await updateLabelScanCarton(input.cartonId, {
        exceptionResolvedBy: input.resolvedBy,
        exceptionResolvedAt: new Date(),
        ...(retryAttempted && retryDispatched ? { dispatched: true, dispatchedAt: new Date() } : {}),
      });

      // If retry succeeded, increment the session's dispatched count
      if (retryDispatched) {
        await updateLabelScanSession(input.sessionId, {
          status: "active",
          dispatchedCount: (session.dispatchedCount ?? 0) + 1,
        });
      } else {
        await updateLabelScanSession(input.sessionId, { status: "active" });
      }

      return {
        success: true,
        retryAttempted,
        retryDispatched,
        retryError,
      };
    }),

  // Update QC fields on a carton
  updateCartonQc: protectedProcedure
    .input(z.object({
      cartonId: z.number(),
      qcItemCount: z.number().int().optional(),
      qcPhotos: z.array(z.string()).optional(),
      qcNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await updateLabelScanCarton(input.cartonId, {
        qcItemCount: input.qcItemCount ?? undefined,
        qcPhotos: input.qcPhotos ?? undefined,
        qcNotes: input.qcNotes ?? undefined,
      });
      return { success: true };
    }),
});

// ─── WH Location Config Router ──────────────────────────────────────────────
const whLocationConfigRouter = router({
  /** Get the WH location config for a specific warehouse */
  get: protectedProcedure
    .input(z.object({ configId: z.number(), facilityId: z.number() }))
    .query(async ({ input }) => {
      const row = await getWhLocationConfig(input.configId, input.facilityId);
      if (!row) return null;
      return {
        ...row,
        aisleRules: JSON.parse(row.aisleRules || "[]") as AisleRule[],
      };
    }),

  /** List all WH location configs for a config (all warehouses) */
  list: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => {
      const rows = await listWhLocationConfigs(input.configId);
      return rows.map((r) => ({
        ...r,
        aisleRules: JSON.parse(r.aisleRules || "[]") as AisleRule[],
      }));
    }),

  /** Create or update the WH location config for a warehouse */
  upsert: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        facilityId: z.number(),
        facilityName: z.string(),
        aisleRules: z.array(
          z.object({
            aislePrefix: z.string().min(1),
            levels: z.array(z.string().min(1)),
            description: z.string().optional(),
          })
        ),
        notes: z.string().nullable().optional(),
        locationFormat: z.string().optional(),
        exampleLocation: z.string().nullable().optional(),
        segmentRoles: z.array(z.string()).nullable().optional(),
        segmentWidths: z.array(z.number()).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertWhLocationConfig(
        input.configId,
        input.facilityId,
        input.facilityName,
        input.aisleRules,
        input.notes ?? null,
        ctx.user.name ?? ctx.user.openId,
        input.locationFormat,
        input.exampleLocation ?? null,
        input.segmentRoles ?? null,
        input.segmentWidths ?? null
      );
      return { success: true };
    }),

  /** Delete the WH location config for a warehouse */
  delete: protectedProcedure
    .input(z.object({ configId: z.number(), facilityId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteWhLocationConfig(input.configId, input.facilityId);
      return { success: true };
    }),
});


// ─── Pallet Capture Router ──────────────────────────────────────────────────
import {
  createPalletSession,
  getPalletSession,
  getOpenPalletSession,
  listPalletSessions,
  addPalletToSession,
  removeLastPallet,
  listSessionPallets,
  completePalletSession,
  updatePalletSessionOpfiStatus,
} from "./db.js";

const palletCaptureRouter = router({
  /** Start a new pallet capture session for an Extensiv receiving transaction. */
  startSession: protectedProcedure
    .input(z.object({
      transactionId: z.number(),
      facilityId: z.number(),
      facilityName: z.string().default(""),
      customerId: z.number(),
      customerName: z.string().default(""),
      poNum: z.string().optional(),
      referenceNum: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getOpenPalletSession(input.transactionId);
      if (existing) return { sessionId: existing.id, resumed: true };
      const sessionId = await createPalletSession({
        ...input,
        startedBy: ctx.user.name ?? ctx.user.openId,
      });
      return { sessionId, resumed: false };
    }),

  /** Get a session with its pallet list. */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const session = await getPalletSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const pallets = await listSessionPallets(input.sessionId);
      return { session, pallets };
    }),

  /** List recent sessions for a facility. */
  listSessions: protectedProcedure
    .input(z.object({ facilityId: z.number(), limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return listPalletSessions(input.facilityId, input.limit);
    }),

  /** Add a pallet to an open session. */
  addPallet: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      palletType: z.enum(["standard", "oversize", "other"]),
      description: z.string().optional(),
      notes: z.string().optional(),
      weightLbs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const palletId = await addPalletToSession(input.sessionId, {
        palletType: input.palletType,
        description: input.description,
        notes: input.notes,
        weightLbs: input.weightLbs,
      });
      const session = await getPalletSession(input.sessionId);
      return { palletId, session };
    }),

  /** Undo the last pallet added to a session. */
  undoLastPallet: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const removed = await removeLastPallet(input.sessionId);
      const session = await getPalletSession(input.sessionId);
      return { removed, session };
    }),

  /** Batch-fetch pallet session counts for a list of transaction IDs. */
  batchSessionCounts: protectedProcedure
    .input(z.object({ transactionIds: z.array(z.number()).max(500) }))
    .query(async ({ input }) => {
      if (input.transactionIds.length === 0) return {};
      const db = await getDb();
      if (!db) return {};
      const { inArray } = await import("drizzle-orm");
      const rows = await db
        .select({
          transactionId: receivePalletSessions.transactionId,
          totalPallets: receivePalletSessions.totalPallets,
          status: receivePalletSessions.status,
        })
        .from(receivePalletSessions)
        .where(inArray(receivePalletSessions.transactionId, input.transactionIds));
      // Build a map: transactionId → { totalPallets, status }
      // If multiple sessions exist for one transaction, pick the most recent (highest id)
      const map: Record<number, { totalPallets: number; status: string }> = {};
      for (const row of rows) {
        const existing = map[row.transactionId];
        if (!existing || row.totalPallets > existing.totalPallets) {
          map[row.transactionId] = { totalPallets: row.totalPallets, status: row.status };
        }
      }
      return map;
    }),

  /** Complete a session and trigger OpFi push. */
  completeSession: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      nonConformingHours: z.number().min(0).max(24).optional().nullable(),
      nonConformingReason: z.string().max(512).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getPalletSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Session already completed" });

      await completePalletSession(input.sessionId, {
        completedBy: ctx.user.name ?? ctx.user.openId,
        nonConformingHours: input.nonConformingHours,
        nonConformingReason: input.nonConformingReason,
      });

      // OpFi push — fire and forget
      const opfiUrl = process.env.OPFI_WEBHOOK_URL;
      if (opfiUrl) {
        const pallets = await listSessionPallets(input.sessionId);
        const completedSession = await getPalletSession(input.sessionId);
        const payload = { event: "pallet_session_completed", session: completedSession, pallets };
        fetch(opfiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPFI_API_KEY ?? ""}`,
          },
          body: JSON.stringify(payload),
        })
          .then(async (res) => {
            if (res.ok) {
              await updatePalletSessionOpfiStatus(input.sessionId, "sent");
            } else {
              const err = await res.text().catch(() => res.statusText);
              await updatePalletSessionOpfiStatus(input.sessionId, "failed", err.slice(0, 512));
            }
          })
          .catch(async (err: Error) => {
            await updatePalletSessionOpfiStatus(input.sessionId, "failed", err.message.slice(0, 512));
          });
      } else {
        await updatePalletSessionOpfiStatus(input.sessionId, "skipped");
      }

      const finalSession = await getPalletSession(input.sessionId);
      return { success: true, session: finalSession };
    }),
});

// Extend _appRouter with laneThresholds, overdueAlert, clientVisibility, returns, cortex, qcScanner, and palletScanner

// ─── Purchase Order Router ────────────────────────────────────────────────────
const purchaseOrderRouter = router({
  // List all POs (most recent first)
  list: protectedProcedure
    .input(z.object({
      poType: z.enum(["kitting", "labor", "materials"]).optional(),
      billingPeriod: z.string().optional(),
      warehouse: z.enum(["Columbus", "Reno", "Toronto", "Calgary"]).optional(),
      status: z.enum(["pending", "sent", "failed", "skipped"]).optional(),
      limit: z.number().int().min(1).max(200).default(200),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { eq, desc, and } = await import("drizzle-orm");
      const conditions = [];
      if (input.poType) conditions.push(eq(purchaseOrders.poType, input.poType));
      if (input.billingPeriod) conditions.push(eq(purchaseOrders.billingPeriod, input.billingPeriod));
      if (input.warehouse) conditions.push(eq(purchaseOrders.warehouse, input.warehouse));
      if (input.status) conditions.push(eq(purchaseOrders.opfiPushStatus, input.status));
      const rows = await db
        .select()
        .from(purchaseOrders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // Get a single PO by ID
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "PO not found" });
      return row;
    }),

  // Create a new PO and immediately push to OpFi
  create: protectedProcedure
    .input(z.object({
      poType: z.enum(["kitting", "labor", "materials"]).default("kitting"),
      poStatus: z.enum(["pending", "approved", "invoiced", "rejected", "received", "ordered"]).default("pending"),
      customerId: z.string().min(1),
      customerName: z.string().min(1),
      warehouse: z.enum(["Columbus", "Reno", "Toronto", "Calgary"]),
      poDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      billingPeriod: z.string().regex(/^\d{4}-\d{2}$/),
      // Legacy combined charges
      kittingCharge: z.number().min(0).default(0),
      labourCharge: z.number().min(0).default(0),
      materialCharge: z.number().min(0).default(0),
      currency: z.enum(["USD", "CAD"]).default("CAD"),
      notes: z.string().optional(),
      // Kitting-specific
      sku: z.string().optional(),
      skuDescription: z.string().optional(),
      qty: z.number().int().min(0).optional(),
      unitCost: z.number().min(0).optional(),
      // Labor-specific
      employeeName: z.string().optional(),
      employeeRole: z.string().optional(),
      hoursWorked: z.number().min(0).optional(),
      hourlyRate: z.number().min(0).optional(),
      // Materials-specific
      itemName: z.string().optional(),
      vendorName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // Auto-generate PO number: GEN-YYYY-MM-NNNN
      const { sql: drizzleSql } = await import("drizzle-orm");
      const [countRow] = await db
        .select({ cnt: drizzleSql<number>`COUNT(*)` })
        .from(purchaseOrders)
        .where(drizzleSql`billing_period = ${input.billingPeriod}`);
      const seq = ((countRow?.cnt as number) ?? 0) + 1;
      const poNumber = `GEN-${input.billingPeriod}-${String(seq).padStart(4, "0")}`;
      // Compute total: for typed POs use qty*unitCost or hours*rate; fallback to legacy charges
      let total = input.kittingCharge + input.labourCharge + input.materialCharge;
      if (input.poType === "kitting" && input.qty != null && input.unitCost != null) {
        total = input.qty * input.unitCost;
      } else if (input.poType === "labor" && input.hoursWorked != null && input.hourlyRate != null) {
        total = input.hoursWorked * input.hourlyRate;
      } else if (input.poType === "materials" && input.qty != null && input.unitCost != null) {
        total = input.qty * input.unitCost;
      }
      const [result] = await db.insert(purchaseOrders).values({
        poNumber,
        poType: input.poType,
        poStatus: input.poStatus,
        customerId: input.customerId,
        customerName: input.customerName,
        warehouse: input.warehouse,
        poDate: input.poDate,
        billingPeriod: input.billingPeriod,
        kittingCharge: String(input.kittingCharge),
        labourCharge: String(input.labourCharge),
        materialCharge: String(input.materialCharge),
        totalCharge: String(total),
        currency: input.currency,
        notes: input.notes,
        sku: input.sku,
        skuDescription: input.skuDescription,
        qty: input.qty,
        unitCost: input.unitCost != null ? String(input.unitCost) : undefined,
        employeeName: input.employeeName,
        employeeRole: input.employeeRole,
        hoursWorked: input.hoursWorked != null ? String(input.hoursWorked) : undefined,
        hourlyRate: input.hourlyRate != null ? String(input.hourlyRate) : undefined,
        itemName: input.itemName,
        vendorName: input.vendorName,
        opfiPushStatus: "pending",
        opfiPushAttempts: 0,
        createdBy: ctx.user?.name ?? "unknown",
        createdAt: Date.now(),
      });

      const insertId = (result as { insertId?: number }).insertId ?? 0;

      // Immediately push to OpFi (fire-and-forget; status tracked in DB)
      void pushPurchaseOrderToOpFi(insertId, {
        poNumber,
        customerId: input.customerId,
        customerName: input.customerName,
        warehouse: input.warehouse,
        poDate: input.poDate,
        billingPeriod: input.billingPeriod,
        kittingCharge: input.kittingCharge,
        labourCharge: input.labourCharge,
        materialCharge: input.materialCharge,
        currency: input.currency,
      }).then(async (res) => {
        if (!res.success) {
          const dbInner = await getDb();
          if (dbInner) {
            const { eq: eqInner } = await import("drizzle-orm");
            await dbInner
              .update(purchaseOrders)
              .set({ opfiPushAttempts: 1 })
              .where(eqInner(purchaseOrders.id, insertId));
          }
        }
      });

      return { poNumber, id: insertId };
    }),

  // Manually retry an OpFi push for a failed/pending PO
  retryPush: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { eq } = await import("drizzle-orm");
      const [po] = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.id))
        .limit(1);
      if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "PO not found" });

      // Reset to pending so the push fires
      await db
        .update(purchaseOrders)
        .set({ opfiPushStatus: "pending", opfiPushError: null })
        .where(eq(purchaseOrders.id, input.id));

      const result = await pushPurchaseOrderToOpFi(po.id, {
        poNumber: po.poNumber,
        customerId: po.customerId,
        customerName: po.customerName,
        warehouse: po.warehouse as "Columbus" | "Reno" | "Toronto" | "Calgary",
        poDate: po.poDate,
        billingPeriod: po.billingPeriod,
        kittingCharge: parseFloat(po.kittingCharge ?? "0"),
        labourCharge: parseFloat(po.labourCharge ?? "0"),
        materialCharge: parseFloat(po.materialCharge ?? "0"),
        currency: (po.currency ?? "CAD") as "USD" | "CAD",
      });

      await db
        .update(purchaseOrders)
        .set({ opfiPushAttempts: (po.opfiPushAttempts ?? 0) + 1 })
        .where(eq(purchaseOrders.id, input.id));

      return result;
    }),

  // Return distinct active customer names from order tracking (for autocomplete)
  activeCustomers: protectedProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { orderTracking } = await import("../drizzle/schema");
      const { sql: drizzleSql, like } = await import("drizzle-orm");
      const rows = await db
        .selectDistinct({ clientName: orderTracking.clientName })
        .from(orderTracking)
        .where(input.search ? like(orderTracking.clientName, `%${input.search}%`) : undefined)
        .orderBy(orderTracking.clientName)
        .limit(20);
      return rows.map((r) => r.clientName).filter(Boolean) as string[];
    }),
});
export const appRouter = router({
  ..._appRouter._def.record,
  laneThresholds: laneThresholdRouter,
  overdueAlert: overdueAlertRouter,
  clientVisibility: clientVisibilityRouter,
  returns: returnsRouter,
  cortex: cortexRouter,
  qcScanner: qcScannerRouter,
  skuWeight: skuWeightRouter,
  palletScanner: palletScannerRouter,
  receiving: receivingRouter,
  palletCapture: palletCaptureRouter,
  putAway: putAwayRouter,
  auditDocuments: auditDocumentsRouter,
  labelScan: labelScanRouter,
  whLocationConfig: whLocationConfigRouter,
  purchaseOrder: purchaseOrderRouter,
});
export type AppRouter = typeof appRouter;

// ─── Production Line Router ───────────────────────────────────────────────────
const productionLineRouter = router({
  // Start a new production run
  startRun: protectedProcedure
    .input(z.object({
      lineId: z.string().default("LINE-1"),
      operatorId: z.string().min(1),
      expectedGtin: z.string().min(1),
      expectedLot: z.string().min(1),
      expectedExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD"),
      confidenceThreshold: z.number().min(0).max(1).default(0.85),
      shelfLifeDaysMin: z.number().int().min(0).optional(),
      holdConfidenceMin: z.number().min(0).max(1).optional(),
      tampDefaultX: z.number().optional(),
      tampDefaultY: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // Check for already-active run on this line
      const existing = await getActiveProductionRun(input.lineId);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Line ${input.lineId} already has an active run: ${existing.runId}. Close it first.`,
        });
      }
      const runId = crypto.randomUUID();
      await createProductionRun({
        runId,
        lineId: input.lineId,
        operatorId: input.operatorId,
        expectedGtin: input.expectedGtin,
        expectedLot: input.expectedLot,
        expectedExpiry: input.expectedExpiry,
        confidenceThreshold: String(input.confidenceThreshold) as any,
        shelfLifeDaysMin: input.shelfLifeDaysMin ?? null,
        holdConfidenceMin: input.holdConfidenceMin != null ? String(input.holdConfidenceMin) as any : null,
        tampDefaultX: input.tampDefaultX != null ? String(input.tampDefaultX) as any : null,
        tampDefaultY: input.tampDefaultY != null ? String(input.tampDefaultY) as any : null,
        status: "active",
      });
      return { runId };
    }),

  // Close the active production run
  closeRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input }) => {
      const run = await getProductionRunByRunId(input.runId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      if (run.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Run is not active" });
      }
      await updateProductionRun(input.runId, {
        status: "closed",
        closedAt: new Date(),
      });
      return {
        runId: input.runId,
        totalScanned: run.totalScanned,
        totalPass: run.totalPass,
        totalFail: run.totalFail,
        totalHold: run.totalHold,
      };
    }),

  // Abort the active production run
  abortRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input }) => {
      const run = await getProductionRunByRunId(input.runId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      await updateProductionRun(input.runId, { status: "aborted", closedAt: new Date() });
      return { success: true };
    }),

  // Get the active run for a line (used by dashboard polling)
  getActiveRun: protectedProcedure
    .input(z.object({ lineId: z.string().default("LINE-1") }))
    .query(async ({ input }) => {
      return getActiveProductionRun(input.lineId);
    }),

  // Get a specific run by runId
  getRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      const run = await getProductionRunByRunId(input.runId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      return run;
    }),

  // List all runs (history)
  listRuns: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return listProductionRuns(input.limit);
    }),

  // Get scans for a run (rolling feed)
  listScans: protectedProcedure
    .input(z.object({ runId: z.string(), limit: z.number().int().min(1).max(200).default(100) }))
    .query(async ({ input }) => {
      return listProductionScans(input.runId, input.limit);
    }),

  // Manual scan submission (for testing / fallback when vision system is offline)
  submitScan: protectedProcedure
    .input(z.object({
      runId: z.string(),
      cartonId: z.string().optional(),
      gtin: z.string().optional(),
      lot: z.string().optional(),
      expiry: z.string().optional(),
      serial: z.string().optional(),
      poNumber: z.string().optional(),
      skuBbox: z.object({ x_mm: z.number(), y_mm: z.number(), w_mm: z.number(), h_mm: z.number() }).optional(),
      camBClear: z.boolean().optional(),
      confidence: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const run = await getProductionRunByRunId(input.runId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      if (run.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Run is not active" });
      }

      const skuCfg = input.gtin ? await getProductionSkuConfig(input.gtin) : null;
      const result = evaluateVerdict(
        {
          cartonId: input.cartonId ?? crypto.randomUUID(),
          gtin: input.gtin,
          lot: input.lot,
          expiry: input.expiry,
          serial: input.serial,
          poNumber: input.poNumber,
          skuBbox: input.skuBbox,
          camBClear: input.camBClear,
          confidence: input.confidence,
        },
        {
          runId: run.runId,
          lineId: run.lineId,
          operatorId: run.operatorId,
          expectedGtin: run.expectedGtin,
          expectedLot: run.expectedLot,
          expectedExpiry: run.expectedExpiry,
          confidenceThreshold: Number(run.confidenceThreshold),
          shelfLifeDaysMin: run.shelfLifeDaysMin,
          holdConfidenceMin: run.holdConfidenceMin != null ? Number(run.holdConfidenceMin) : null,
          tampDefaultX: run.tampDefaultX != null ? Number(run.tampDefaultX) : null,
          tampDefaultY: run.tampDefaultY != null ? Number(run.tampDefaultY) : null,
        },
        skuCfg
          ? {
              shelfLifeDaysMin: skuCfg.shelfLifeDaysMin,
              holdConfidenceMin: skuCfg.holdConfidenceMin != null ? Number(skuCfg.holdConfidenceMin) : null,
              lotPattern: skuCfg.lotPattern,
            }
          : null
      );

      const scanId = crypto.randomUUID();
      await createProductionScan({
        scanId,
        runId: run.runId,
        cartonId: input.cartonId ?? scanId,
        scannedGtin: input.gtin ?? null,
        scannedLot: input.lot ?? null,
        scannedExpiry: input.expiry ?? null,
        scannedSerial: input.serial ?? null,
        poNumber: input.poNumber ?? null,
        skuBbox: input.skuBbox ?? null,
        camBClear: input.camBClear ?? null,
        confidence: input.confidence != null ? String(input.confidence) as any : null,
        verdict: result.verdict,
        failReason: result.failReason ?? null,
        placement: result.placement,
        tampXMm: String(result.tampXMm) as any,
        tampYMm: String(result.tampYMm) as any,
        zplSent: result.labelZpl ?? null,
        printedAt: result.verdict === "pass" ? new Date() : null,
      });

      // Update run counters
      const counterUpdate: Record<string, any> = {
        totalScanned: run.totalScanned + 1,
        totalPass: run.totalPass + (result.verdict === "pass" ? 1 : 0),
        totalFail: run.totalFail + (result.verdict === "fail" ? 1 : 0),
        totalHold: run.totalHold + (result.verdict === "hold" ? 1 : 0),
      };
      await updateProductionRun(run.runId, counterUpdate);

      return {
        scanId,
        verdict: result.verdict,
        failReason: result.failReason,
        placement: result.placement,
        tampXMm: result.tampXMm,
        tampYMm: result.tampYMm,
        labelZpl: result.labelZpl,
      };
    }),

  // SKU config CRUD
  listSkuConfigs: protectedProcedure.query(async () => {
    return listProductionSkuConfigs();
  }),

  upsertSkuConfig: protectedProcedure
    .input(z.object({
      gtin: z.string().min(1),
      skuDescription: z.string().optional(),
      shelfLifeDaysMin: z.number().int().min(0).default(30),
      holdConfidenceMin: z.number().min(0).max(1).optional(),
      lotPattern: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await upsertProductionSkuConfig({
        gtin: input.gtin,
        skuDescription: input.skuDescription ?? null,
        shelfLifeDaysMin: input.shelfLifeDaysMin,
        holdConfidenceMin: input.holdConfidenceMin != null ? String(input.holdConfidenceMin) as any : null,
        lotPattern: input.lotPattern ?? null,
      });
      return { success: true };
    }),

  deleteSkuConfig: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteProductionSkuConfig(input.id);
      return { success: true };
    }),
});

// Re-export appRouter augmented with the production line router (defined after appRouter to avoid hoisting issues)
export const appRouterWithProductionLine = router({
  ...appRouter._def.record,
  productionLine: productionLineRouter,
});

// ─── QR Scanning Router ───────────────────────────────────────────────────────
import {
  listCustomerAppConfigs,
  getCustomerAppConfig,
  upsertCustomerAppConfig,
  deleteCustomerAppConfig,
  createQrScanSession,
  getActiveQrScanSession,
  getQrScanSession,
  listQrScanSessions,
  updateQrScanSession,
  listQrScans,
  listQrScanSessionHistory,
} from "./qrScanning.db";

const qrScanningRouter = router({
  // ── Customer App Configs ──────────────────────────────────────────────────
  listCustomerApps: protectedProcedure.query(async () => {
    return listCustomerAppConfigs();
  }),

  upsertCustomerApp: protectedProcedure
    .input(z.object({
      customerId: z.string().min(1),
      customerName: z.string().min(1),
      appUrl: z.string().url("Must be a valid URL"),
      authHeader: z.string().optional(),
      enabled: z.boolean().default(true),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await upsertCustomerAppConfig({
        customerId: input.customerId,
        customerName: input.customerName,
        appUrl: input.appUrl,
        authHeader: input.authHeader ?? null,
        enabled: input.enabled,
        notes: input.notes ?? null,
      });
      return { success: true };
    }),

  deleteCustomerApp: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .mutation(async ({ input }) => {
      await deleteCustomerAppConfig(input.customerId);
      return { success: true };
    }),

  // ── QR Scan Sessions ──────────────────────────────────────────────────────
  /** Enable QR scanning for a production run — creates a session linked to the customer */
  enableQrScanning: protectedProcedure
    .input(z.object({
      runId: z.string().min(1),
      lineId: z.string().default("LINE-1"),
      customerId: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check there isn't already an active session for this run
      const existing = await getActiveQrScanSession(input.runId);
      if (existing) {
        return { sessionId: existing.sessionId, alreadyActive: true };
      }
      // Look up customer app config
      const cfg = await getCustomerAppConfig(input.customerId);
      if (!cfg) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No customer app configured for customer "${input.customerId}". Add it in Customer App Settings first.`,
        });
      }
      if (!cfg.enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Customer app for "${cfg.customerName}" is disabled. Enable it in Customer App Settings.`,
        });
      }
      const sessionId = crypto.randomUUID();
      await createQrScanSession({
        sessionId,
        runId: input.runId,
        lineId: input.lineId,
        customerId: cfg.customerId,
        customerName: cfg.customerName,
        customerAppUrl: cfg.appUrl,
        status: "active",
        startedBy: ctx.user?.name ?? ctx.user?.openId ?? "unknown",
      });
      return { sessionId, alreadyActive: false };
    }),

  /** Pause or close a QR scan session */
  updateQrSession: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      status: z.enum(["active", "paused", "closed"]),
    }))
    .mutation(async ({ input }) => {
      const session = await getQrScanSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "QR session not found" });
      await updateQrScanSession(input.sessionId, {
        status: input.status,
        ...(input.status === "closed" ? { closedAt: new Date() } : {}),
      });
      return { success: true };
    }),

  /** Get the active QR session for a run */
  getActiveSession: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      return getActiveQrScanSession(input.runId);
    }),

  /** List all QR sessions (optionally filtered by runId) */
  listSessions: protectedProcedure
    .input(z.object({ runId: z.string().optional() }))
    .query(async ({ input }) => {
      return listQrScanSessions(input.runId);
    }),

  /** List recent QR scans for a session */
  listScans: protectedProcedure
    .input(z.object({ sessionId: z.string(), limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return listQrScans(input.sessionId, input.limit);
    }),

  /** Full paginated session history with optional filters */
  listSessionHistory: protectedProcedure
    .input(z.object({
      customerId: z.string().optional(),
      status: z.enum(["active", "paused", "closed"]).optional(),
      dateFrom: z.string().optional(), // ISO date string
      dateTo: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return listQrScanSessionHistory(input);
    }),

  /** Get a single session with all its scans */
  getSessionDetail: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const session = await getQrScanSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const scans = await listQrScans(input.sessionId, 500);
      return { session, scans };
    }),

  /** Export all scans for a session as CSV string */
  exportSessionCsv: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const session = await getQrScanSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const scans = await listQrScans(input.sessionId, 10000);
      const header = ["qrScanId", "cartonId", "qrData", "camera", "forwarded", "forwardedAt", "forwardAttempts", "forwardError", "customerResponseStatus", "scannedAt"];
      const rows = scans.map((s) => [
        s.qrScanId,
        s.cartonId ?? "",
        `"${(s.qrData ?? "").replace(/"/g, '""')}"`,
        s.camera ?? "",
        s.forwarded ? "yes" : "no",
        s.forwardedAt ? new Date(s.forwardedAt).toISOString() : "",
        String(s.forwardAttempts),
        `"${(s.forwardError ?? "").replace(/"/g, '""')}"`,
        s.customerResponseStatus != null ? String(s.customerResponseStatus) : "",
        new Date(s.scannedAt).toISOString(),
      ]);
      const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
      return {
        filename: `qr-session-${session.sessionId.slice(0, 8)}-${session.customerName.replace(/\s+/g, "-")}.csv`,
        csv,
        sessionId: session.sessionId,
        customerName: session.customerName,
        totalRows: scans.length,
      };
    }),

  /** Export all sessions summary as CSV */
  exportAllSessionsCsv: protectedProcedure
    .input(z.object({
      customerId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const sessions = await listQrScanSessionHistory({ ...input, limit: 10000, offset: 0 });
      const header = ["sessionId", "runId", "lineId", "customerId", "customerName", "customerAppUrl", "status", "totalScanned", "totalForwarded", "totalErrors", "startedBy", "startedAt", "closedAt"];
      const rows = sessions.map((s) => [
        s.sessionId,
        s.runId,
        s.lineId,
        s.customerId,
        `"${s.customerName.replace(/"/g, '""')}"`,
        `"${s.customerAppUrl.replace(/"/g, '""')}"`,
        s.status,
        String(s.totalScanned),
        String(s.totalForwarded),
        String(s.totalErrors),
        s.startedBy ?? "",
        new Date(s.startedAt).toISOString(),
        s.closedAt ? new Date(s.closedAt).toISOString() : "",
      ]);
      const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const dateTag = new Date().toISOString().slice(0, 10);
      return {
        filename: `qr-sessions-all-${dateTag}.csv`,
        csv,
        totalRows: sessions.length,
      };
    }),
});

// ─── SLA Order Actions ──────────────────────────────────────────────────────
import {
  createSlaOrderAction,
  listSlaOrderActions,
  clearSlaOrderAction,
} from "./db";
// ─── Shipping Dashboard ───────────────────────────────────────────────────────
import {
  getShipReadyOrders,
  updateOutboundDetails,
  getShippingDocuments,
  getShippingDocumentsByOrders,
  insertShippingDocument,
  deleteShippingDocument,
} from "./db";
// ─── Audit Images Routerr ──────────────────────────────────────────────────────
import {
  listProductionScansForAudit,
  countProductionScansForAudit,
  getProductionScanByScanId,
} from "./db";
import { runScanImagePurgeOnce } from "./scheduler/scanImagePurge";

const auditImagesRouter = router({
  /** Paginated list of production scans with image URLs, supporting gallery filters */
  list: protectedProcedure
    .input(z.object({
      runId: z.string().optional(),
      verdict: z.enum(["pass", "fail", "hold"]).optional(),
      hasImages: z.boolean().optional(),
      fromTs: z.number().optional(), // UTC ms
      toTs: z.number().optional(),   // UTC ms
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const [scans, total] = await Promise.all([
        listProductionScansForAudit({
          runId: input.runId,
          verdict: input.verdict,
          hasImages: input.hasImages,
          fromTs: input.fromTs ? new Date(input.fromTs) : undefined,
          toTs: input.toTs ? new Date(input.toTs) : undefined,
          limit: input.limit,
          offset: input.offset,
        }),
        countProductionScansForAudit({
          runId: input.runId,
          verdict: input.verdict,
          hasImages: input.hasImages,
          fromTs: input.fromTs ? new Date(input.fromTs) : undefined,
          toTs: input.toTs ? new Date(input.toTs) : undefined,
        }),
      ]);
      return { scans, total };
    }),

  /** Single scan with all image URLs */
  getScanDetail: protectedProcedure
    .input(z.object({ scanId: z.string() }))
    .query(async ({ input }) => {
      const scan = await getProductionScanByScanId(input.scanId);
      if (!scan) throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      return scan;
    }),

  /** List all production runs for the filter dropdown */
  listRuns: protectedProcedure
    .query(async () => {
      const runs = await listProductionRuns(200);
      return runs.map((r) => ({
        runId: r.runId,
        lineId: r.lineId,
        expectedGtin: r.expectedGtin,
        expectedLot: r.expectedLot,
        status: r.status,
        startedAt: r.startedAt,
      }));
    }),

  /** Export image manifest CSV for a run (all scans with image URLs) */
  exportRunManifest: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      const scans = await listProductionScansForAudit({ runId: input.runId, limit: 5000 });
      const header = [
        "scan_id", "carton_id", "run_id", "verdict", "fail_reason",
        "scanned_gtin", "scanned_lot", "scanned_expiry",
        "cam_a_image_url", "cam_b_image_url", "post_apply_image_url",
        "post_apply_received_at", "scanned_at",
      ];
      const rows = scans.map((s) => [
        s.scanId, s.cartonId, s.runId, s.verdict, s.failReason ?? "",
        s.scannedGtin ?? "", s.scannedLot ?? "", s.scannedExpiry ?? "",
        s.camAImageUrl ?? "", s.camBImageUrl ?? "", s.postApplyImageUrl ?? "",
        s.postApplyReceivedAt ? new Date(s.postApplyReceivedAt).toISOString() : "",
        new Date(s.scannedAt).toISOString(),
      ]);
      const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
      return {
        filename: `scan-images-${input.runId}-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
        totalRows: scans.length,
      };
    }),

  /** Manually trigger the image retention purge (admin use) */
  triggerRetentionPurge: protectedProcedure
    .mutation(async () => {
      const result = await runScanImagePurgeOnce();
      return result;
    }),
});

// Re-export appRouter augmented with production line + QR scanning + audit images
export const appRouterFull = router({
  ...appRouterWithProductionLine._def.record,
  qrScanning: qrScanningRouter,
  auditImages: auditImagesRouter,
});
export type AppRouterFull = typeof appRouterFull;

// ── SLA Performance Router ────────────────────────────────────────────────────
import { classifyOrders, SLA_CLIENTS } from "./slaEngine.js";
import {
  writeSlaSnapshot,
  getSlaSummary,
  listSlaBreaches,
  listSlaWatch,
  listSnapshotDates,
  getSlaClientHistory,
  listAllSlaOrders,
} from "./sla.db.js";
import type { OrderTracking } from "../drizzle/schema.js";

/** Map an OrderTracking DB row to the shape expected by slaEngine.classifyOrder */
function orderTrackingToExtensiv(o: OrderTracking) {
  return {
    readOnly: {
      orderId: o.extensivOrderId,
      creationDate: o.creationDate ?? "",
      fullyAllocated: o.lifecycleStatus !== "unallocated",
      isClosed: false,
      facilityIdentifier: { name: o.facilityName ?? "" },
      customerIdentifier: { id: o.clientId, name: o.clientName },
      trackingNumber: null as string | null,
    },
    poNum: o.poNum ?? "",
    referenceNum: o.referenceNum ?? "",
    notes: o.notes ?? "",
    shipTo: { companyName: o.shipToName ?? "" },
  };
}

// ─── Shipping Dashboard Router ──────────────────────────────────────────────
const shippingDashboardRouter = router({
  /** Return all ship_ready orders for the outbound dashboard */
  listOutbound: protectedProcedure.query(async () => {
    return getShipReadyOrders();
  }),
  /**
   * Recommend an available outbound dock location for a given facility.
   * Lanes 1–26, positions A–E (5 positions per lane).
   * Returns the first cell not already occupied by a ship_ready order.
   */
  recommendDockLocation: protectedProcedure
    .input(z.object({
      facilityId: z.number().optional(),
      configId: z.number().optional(),  // extensiv_configs.id from QC session warehouseId
      palletCount: z.number().int().min(1).optional(), // number of pallets needing contiguous space
    }))
    .query(async ({ input }) => {
      const LANES = Array.from({ length: 26 }, (_, i) => i + 1);
      const POSITIONS = ["A", "B", "C", "D", "E"];

      function parseLoc(raw: string | null): { lane: number; position: string } | null {
        if (!raw) return null;
        const cleaned = raw.trim().toUpperCase().replace(/^(OB[-\s]?|DOCK[-\s]?)/i, "");
        let m = cleaned.match(/^([A-E])[-\s]?(\d{1,2})$/);
        if (m) {
          const lane = parseInt(m[2], 10);
          if (lane >= 1 && lane <= 26) return { lane, position: m[1] };
        }
        m = cleaned.match(/^(\d{1,2})[-\s]?([A-E])$/);
        if (m) {
          const lane = parseInt(m[1], 10);
          if (lane >= 1 && lane <= 26) return { lane, position: m[2] };
        }
        return null;
      }

      const allOrders = await getShipReadyOrders();
      // Resolve facilityId from configId if provided
      let resolvedFacilityId = input.facilityId;
      if (!resolvedFacilityId && input.configId) {
        const match = allOrders.find((o) => o.configId === input.configId);
        if (match) resolvedFacilityId = match.facilityId;
      }
      const facilityOrders = resolvedFacilityId
        ? allOrders.filter((o) => o.facilityId === resolvedFacilityId)
        : allOrders;

      const occupied = new Set<string>();
      for (const o of facilityOrders) {
        const parsed = parseLoc(o.outboundLocation);
        if (parsed) occupied.add(`${parsed.lane}-${parsed.position}`);
      }

      const totalCells = LANES.length * POSITIONS.length;
      const occupiedCount = occupied.size;

      // palletCount from the input (optional, defaults to 1)
      const palletCount = input.palletCount ?? 1;
      const needed = Math.max(1, palletCount);

      // Search for a lane that has `needed` contiguous free positions
      for (const lane of LANES) {
        // Build the list of free positions in this lane in order
        const freePositions = POSITIONS.filter((pos) => !occupied.has(`${lane}-${pos}`));
        if (freePositions.length >= needed) {
          // Find the first contiguous run of `needed` positions
          // Positions are A,B,C,D,E — contiguous means consecutive in the POSITIONS array
          let runStart = -1;
          let runLen = 0;
          for (let i = 0; i < POSITIONS.length; i++) {
            const pos = POSITIONS[i];
            if (!occupied.has(`${lane}-${pos}`)) {
              if (runStart === -1) runStart = i;
              runLen++;
              if (runLen >= needed) {
                // Found a valid block starting at runStart, length needed
                const block = POSITIONS.slice(runStart, runStart + needed);
                return {
                  recommended: true,
                  overflow: false,
                  lane,
                  position: block[0],
                  positions: block,
                  label: block.length === 1 ? `${block[0]}${lane}` : `${block[0]}${lane}–${block[block.length - 1]}${lane}`,
                  occupiedCount,
                  totalCells,
                };
              }
            } else {
              // Reset run
              runStart = -1;
              runLen = 0;
            }
          }
        }
      }

      // No lane has a contiguous block — fall back to Overflow
      return {
        recommended: true,
        overflow: true,
        lane: null as number | null,
        position: null as string | null,
        positions: [] as string[],
        label: "Overflow",
        occupiedCount,
        totalCells,
      };
    }),

  /**
   * Return all available (unoccupied) dock cells for a facility, plus the recommended one.
   * Used by the QC completion flow to let the user pick from open spaces.
   */
  listAvailableDockSpaces: protectedProcedure
    .input(z.object({
      facilityId: z.number().optional(),
      configId: z.number().optional(),
      palletCount: z.number().int().min(1).optional(),
      /** Extensiv clientId of the order being assigned — lanes with a DIFFERENT client's pallets are excluded */
      clientId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const LANES = Array.from({ length: 26 }, (_, i) => i + 1);
      const POSITIONS = ["A", "B", "C", "D", "E"];
      function parseLoc(raw: string | null): { lane: number; position: string } | null {
        if (!raw) return null;
        const cleaned = raw.trim().toUpperCase().replace(/^(OB[-\s]?|DOCK[-\s]?)/i, "");
        let m = cleaned.match(/^([A-E])[-\s]?(\d{1,2})$/);
        if (m) { const lane = parseInt(m[2], 10); if (lane >= 1 && lane <= 26) return { lane, position: m[1] }; }
        m = cleaned.match(/^(\d{1,2})[-\s]?([A-E])$/);
        if (m) { const lane = parseInt(m[1], 10); if (lane >= 1 && lane <= 26) return { lane, position: m[2] }; }
        return null;
      }
      const allOrders = await getShipReadyOrders();
      let resolvedFacilityId = input.facilityId;
      if (!resolvedFacilityId && input.configId) {
        const match = allOrders.find((o) => o.configId === input.configId);
        if (match) resolvedFacilityId = match.facilityId;
      }
      const facilityOrders = resolvedFacilityId
        ? allOrders.filter((o) => o.facilityId === resolvedFacilityId)
        : allOrders;
      const occupied = new Set<string>();
      // Track which clientId owns each lane (first occupied cell wins)
      const laneClientId = new Map<number, number>();
      for (const o of facilityOrders) {
        const parsed = parseLoc(o.outboundLocation);
        if (parsed) {
          occupied.add(`${parsed.lane}-${parsed.position}`);
          if (!laneClientId.has(parsed.lane)) laneClientId.set(parsed.lane, o.clientId);
        }
      }
      // Find all lanes that have a contiguous block of >= palletCount free positions
      const palletCount = input.palletCount ?? 1;
      type DockBlock = { lane: number; position: string; positions: string[]; label: string };
      const qualifyingBlocks: DockBlock[] = [];
      for (const lane of LANES) {
        // Skip lanes claimed by a different client (one order per lane rule)
        const laneOwner = laneClientId.get(lane);
        if (input.clientId && laneOwner !== undefined && laneOwner !== input.clientId) continue;
        let runStart = -1; let runLen = 0;
        for (let i = 0; i < POSITIONS.length; i++) {
          const pos = POSITIONS[i];
          if (!occupied.has(`${lane}-${pos}`)) {
            if (runStart === -1) runStart = i;
            runLen++;
            if (runLen >= palletCount) {
              const block = POSITIONS.slice(runStart, runStart + palletCount);
              qualifyingBlocks.push({
                lane,
                position: block[0],
                positions: block,
                label: block.length === 1 ? `${block[0]}${lane}` : `${block[0]}${lane}\u2013${block[block.length - 1]}${lane}`,
              });
              // Only record the first qualifying block per lane
              break;
            }
          } else { runStart = -1; runLen = 0; }
        }
      }
      // The recommended spot is the first qualifying block overall
      const recommended: DockBlock | null = qualifyingBlocks[0] ?? null;
      // available = only the starting positions of qualifying lanes (for display in the picker)
      const available: { lane: number; position: string; label: string }[] = qualifyingBlocks.map((b) => ({
        lane: b.lane,
        position: b.position,
        label: b.label,
      }));
      return {
        available,
        recommended,
        occupiedCount: occupied.size,
        totalCells: LANES.length * POSITIONS.length,
        overflow: qualifyingBlocks.length === 0,
      };
    }),
  /** Get an order_tracking row by extensivOrderId regardless of lifecycle stage — used by dock dialog */
  getOrderByExtensivId: protectedProcedure
    .input(z.object({ extensivOrderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const { orderTracking } = await import("../drizzle/schema.js");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select({
          id: orderTracking.id,
          extensivOrderId: orderTracking.extensivOrderId,
          clientName: orderTracking.clientName,
          lifecycleStatus: orderTracking.lifecycleStatus,
          outboundLocation: orderTracking.outboundLocation,
          palletCount: orderTracking.palletCount,
        })
        .from(orderTracking)
        .where(eq(orderTracking.extensivOrderId, input.extensivOrderId))
        .limit(1);
      return rows[0] ?? null;
    }),

  /** Update outbound location and/or pallet count for an order */
  updateOutbound: protectedProcedure
    .input(z.object({
      id: z.number(),
      outboundLocation: z.string().optional(),
      palletCount: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateOutboundDetails(id, data);
      return { success: true };
    }),

  /**
   * Returns daily overdue pallet counts for the past 30 days.
   */
  overduepalletTrend: protectedProcedure.query(async () => {
    const { orderTracking } = await import("../drizzle/schema.js");
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        shipReadyAt: orderTracking.shipReadyAt,
        shippedAt: orderTracking.shippedAt,
        palletCount: orderTracking.palletCount,
      })
      .from(orderTracking)
      .where(sql`${orderTracking.shipReadyAt} IS NOT NULL`);

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const result: { date: string; overdueOrders: number; overduePallets: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      day.setHours(23, 59, 59, 999);
      let overdueOrders = 0;
      let overduePallets = 0;
      for (const row of rows) {
        if (!row.shipReadyAt) continue;
        const placedAt = new Date(row.shipReadyAt);
        if (placedAt > day) continue;
        const daysOnDock = (day.getTime() - placedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysOnDock < 4) continue;
        if (row.shippedAt && new Date(row.shippedAt) <= day) continue;
        overdueOrders++;
        overduePallets += row.palletCount ?? 0;
      }
      result.push({ date: day.toISOString().slice(0, 10), overdueOrders, overduePallets });
    }
    return result;
  }),

  // ─── Shipping Documents ───────────────────────────────────────────────────────
  /** List all shipping documents for a single order */
  listDocuments: protectedProcedure
    .input(z.object({ orderTrackingId: z.number() }))
    .query(async ({ input }) => {
      return getShippingDocuments(input.orderTrackingId);
    }),

  /** Bulk fetch document presence for a list of orders (for dashboard column) */
  listDocumentsByOrders: protectedProcedure
    .input(z.object({ orderTrackingIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      return getShippingDocumentsByOrders(input.orderTrackingIds);
    }),

  /** Upload a shipping document (base64 data URL → S3) */
  uploadDocument: protectedProcedure
    .input(z.object({
      orderTrackingId: z.number(),
      docType: z.enum(['bol', 'customs', 'pallet_label', 'other']),
      fileName: z.string().min(1).max(512),
      dataUrl: z.string().min(1),   // base64 data URL
      mimeType: z.string().default('application/pdf'),
      note: z.string().max(256).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const base64 = input.dataUrl.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      const suffix = Date.now();
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `shipping-docs/${input.orderTrackingId}/${input.docType}-${suffix}-${safeFileName}`;
      const { storagePut } = await import('./storage');
      const { url } = await storagePut(key, buffer, input.mimeType);
      const id = await insertShippingDocument({
        orderTrackingId: input.orderTrackingId,
        docType: input.docType,
        fileName: input.fileName,
        fileUrl: url,
        fileKey: key,
        mimeType: input.mimeType,
        fileSizeBytes: buffer.length,
        note: input.note ?? null,
        uploadedBy: ctx.user?.name ?? null,
      });
      // If a customs document was uploaded, fire a Clearsight webhook to clear the pending alert
      if (input.docType === "customs") {
        try {
          const db2 = await getDb();
          if (db2) {
            const { eq: eqC, and: andC, or: orC } = await import("drizzle-orm");
            const { orderTracking: otTable, carrierAppointments: caTable } = await import("../drizzle/schema.js");
            // Look up the order to get extensivOrderId and reference
            const orderRows = await db2.select().from(otTable).where(eqC(otTable.id, input.orderTrackingId)).limit(1);
            const order = orderRows[0];
            if (order) {
              // Check for an active appointment
              const apptRows = await db2.select().from(caTable)
                .where(andC(
                  eqC(caTable.extensivOrderId, order.extensivOrderId),
                  orC(eqC(caTable.status, "scheduled"), eqC(caTable.status, "confirmed"))
                ))
                .limit(1);
              const appt = apptRows[0];
              if (appt) {
                await fireCortexWebhook("clearsight", "shipment.customs_docs_uploaded", {
                  appointmentId: appt.id,
                  extensivOrderId: order.extensivOrderId,
                  referenceNum: appt.referenceNum ?? order.referenceNum,
                  clientName: appt.clientName,
                  scheduledDate: appt.scheduledDate,
                  appointmentStatus: appt.status,
                  fileUrl: url,
                  fileName: input.fileName,
                  uploadedBy: ctx.user?.name ?? null,
                  message: `Customs documents have been uploaded for ${appt.clientName} (order ${appt.referenceNum ?? order.extensivOrderId}). Pickup is ${appt.status} for ${appt.scheduledDate}${appt.scheduledTimeStart ? " at " + appt.scheduledTimeStart : ""}.`,
                });
              }
            }
          }
        } catch (err) { console.warn("[Customs Uploaded] webhook failed:", err); }
      }
      return { success: true, id, url };
    }),

  /** Delete a shipping document by id */
  deleteDocument: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteShippingDocument(input.id);
      return { success: true };
    }),
  /** Manually resend the signed BOL for an order to Clearsight via Cortex webhook */
  resendToClearsight: protectedProcedure
    .input(z.object({
      orderTrackingId: z.number(),
      extensivOrderId: z.number(),
      referenceNum: z.string().nullable().optional(),
      clientName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      // Find the most recent BOL document for this order
      const { shippingDocuments: sdTable } = await import("../drizzle/schema.js");
      const bolDocs = await db
        .select()
        .from(sdTable)
        .where(
          eq(sdTable.orderTrackingId, input.orderTrackingId)
        )
        .orderBy(sdTable.createdAt);
      const signedBol = bolDocs.filter((d) => d.docType === "bol" && d.note?.includes("Signed")).pop();
      const anyBol = bolDocs.filter((d) => d.docType === "bol").pop();
      const bolDoc = signedBol ?? anyBol;
      if (!bolDoc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No BOL document found for this order. Please generate or upload a BOL first.' });
      }
      // Find the matching carrier appointment for additional metadata
      const apptRows = await db
        .select()
        .from(carrierAppointments)
        .where(eq(carrierAppointments.extensivOrderId, input.extensivOrderId))
        .orderBy(carrierAppointments.createdAt);
      const appt = apptRows.filter((a) => a.status !== "cancelled").pop() ?? apptRows[apptRows.length - 1];
      const sent = await fireCortexWebhook("clearsight", "shipment.bol_signed", {
        extensivOrderId: input.extensivOrderId,
        appointmentId: appt?.id ?? null,
        bolNumber: appt?.bolNumber ?? null,
        referenceNum: input.referenceNum ?? appt?.referenceNum ?? null,
        clientName: input.clientName,
        signedBolUrl: bolDoc.fileUrl,
        driverSignedAt: appt?.driverSignedAt?.toISOString() ?? new Date().toISOString(),
        resent: true,
      });
      if (!sent) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Clearsight is not configured or the webhook request failed. Check the Cortex Hub settings.' });
      }
      return { success: true, bolUrl: bolDoc.fileUrl, fileName: bolDoc.fileName };
    }),
});

const slaPerformanceRouter = router({
  /** Run a fresh SLA snapshot against all tracked orders and persist it */
  runSnapshot: protectedProcedure
    .input(z.object({ date: z.string().optional() }))
    .mutation(async ({ input }) => {
      const snapshotDate = input.date ?? new Date().toISOString().slice(0, 10);
      const tracked = await getTrackedOrders();
      const extensivOrders = tracked.map(orderTrackingToExtensiv);
      const results = classifyOrders(extensivOrders);
      const written = await writeSlaSnapshot(results, snapshotDate);
      return { snapshotDate, classified: results.length, written };
    }),

  /** Get summary stats for a snapshot date */
  getSummary: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      return getSlaSummary(input.date);
    }),

  /** List all OOS (out-of-SLA) orders for a snapshot date */
  listBreaches: protectedProcedure
    .input(z.object({ date: z.string(), clientId: z.number().optional() }))
    .query(async ({ input }) => {
      return listSlaBreaches(input.date, input.clientId);
    }),

  /** List watch items (alwaysFlag=true but not yet OOS) for a snapshot date */
  listWatch: protectedProcedure
    .input(z.object({ date: z.string(), clientId: z.number().optional() }))
    .query(async ({ input }) => {
      return listSlaWatch(input.date, input.clientId);
    }),

  /** List all available snapshot dates (most recent first) */
  listDates: protectedProcedure
    .query(async () => {
      return listSnapshotDates(60);
    }),

  /** Per-client compliance history across recent snapshots */
  getClientHistory: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      return getSlaClientHistory(input.clientId);
    }),

  /** All classified orders for a snapshot (for CSV export) */
  listAll: protectedProcedure
    .input(z.object({ date: z.string(), clientId: z.number().optional() }))
    .query(async ({ input }) => {
      return listAllSlaOrders(input.date, input.clientId);
    }),

  /** Return the list of all SLA-tracked clients with their IDs and names */
  getClientRules: protectedProcedure
    .query(async () => {
      return Object.entries(SLA_CLIENTS).map(([id, name]) => ({
        clientId: Number(id),
        clientName: name,
      })).sort((a, b) => a.clientName.localeCompare(b.clientName));
    }),
  /** Export all orders for a snapshot as CSV string */
  exportCsv: protectedProcedure
    .input(z.object({ date: z.string(), clientId: z.number().optional() }))
    .query(async ({ input }) => {
      const rows = await listAllSlaOrders(input.date, input.clientId);
      const header = ["orderId","clientName","poNum","refNum","creation","company","facility","fullyAllocated","rule","slaDate","outOfSla","alwaysFlag","flagNote","bizDaysLate"];
      const lines = rows.map((r) => [
        r.orderId, r.clientName, r.poNum, r.refNum, r.creation, r.company,
        r.facility, r.fullyAllocated ? "Y" : "N", r.rule, r.slaDate ?? "",
        r.outOfSla ? "Y" : "N", r.alwaysFlag ? "Y" : "N",
        r.flagNote ?? "", r.bizDaysLate ?? "",
      ].map(String).join(","));
      return {
        filename: `sla-report-${input.date}.csv`,
        csv: [header.join(","), ...lines].join("\n"),
        totalRows: rows.length,
      };
    }),
});

// ── Small Parcel Router ──────────────────────────────────────────────────────
import {
  createSmallParcelSession,
  getSmallParcelSession,
  updateSmallParcelSession,
  listSmallParcelSessions,
} from "./db.js";

/** Build a fallback ZPL label when Veeqo does not return ZPL content directly. */
function buildFallbackZpl(
  trackingNumber: string,
  carrier: string,
  serviceLevel: string,
  session: { shipToName?: string | null; shipToAddress1?: string | null; shipToCity?: string | null; shipToState?: string | null; shipToZip?: string | null; referenceNum?: string | null; clientName?: string | null },
): string {
  const zplSanitize = (s: string) => s.replace(/[\^~]/g, "");
  const shipToLine1 = session.shipToName ?? "";
  const shipToLine2 = session.shipToAddress1 ?? "";
  const shipToLine3 = [session.shipToCity, session.shipToState, session.shipToZip].filter(Boolean).join(", ");
  const refNum = session.referenceNum ?? "";
  const clientName = session.clientName ?? "";
  return [
    "^XA",
    "^MMT",
    "^PW812",
    "^LL1218",
    "^LS0",
    `^FO30,30^A0N,45,45^FD${zplSanitize(carrier)} ${zplSanitize(serviceLevel)}^FS`,
    "^FO30,85^GB752,3,3^FS",
    "^FO30,100^A0N,28,28^FDShip To:^FS",
    `^FO30,135^A0N,35,35^FD${zplSanitize(shipToLine1)}^FS`,
    `^FO30,178^A0N,30,30^FD${zplSanitize(shipToLine2)}^FS`,
    `^FO30,215^A0N,30,30^FD${zplSanitize(shipToLine3)}^FS`,
    "^FO30,260^GB752,3,3^FS",
    `^FO30,275^A0N,26,26^FDOrder: ${zplSanitize(refNum)}  Client: ${zplSanitize(clientName)}^FS`,
    `^FO30,320^BY3,2,100^BCN,100,Y,N,N^FD${zplSanitize(trackingNumber)}^FS`,
    `^FO30,440^A0N,28,28^FD${zplSanitize(trackingNumber)}^FS`,
    "^FO30,490^GB752,3,3^FS",
    "^FO30,500^A0N,22,22^FDGo Direct Solutions^FS",
    "^XZ",
  ].join("\n");
}

const smallParcelRouter = router({
  /** List available facilities (for facility picker at start of session) */
  listFacilities: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });
      return fetchAllFacilities(config);
    }),

  /** Look up an Extensiv order by Transaction ID (integer order ID) */
  lookupOrder: protectedProcedure
    .input(z.object({
      configId: z.number(),
      transactionId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });

      // Parse the transaction ID as an integer
      const txId = parseInt(input.transactionId.trim(), 10);
      if (isNaN(txId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `"${input.transactionId}" is not a valid Transaction ID. Please enter the numeric Extensiv order ID.` });
      }

      // Fetch directly by Extensiv order ID
      let o;
      try {
        const result = await fetchOrderWithDetail(config, txId);
        o = result.order;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "NOT_FOUND", message: `No order found for Transaction ID ${txId}. ${msg}` });
      }

      return {
        extensivOrderId: o.readOnly.orderId,
        referenceNum: o.referenceNum,
        clientId: o.readOnly.customerIdentifier.id,
        clientName: o.readOnly.customerIdentifier.name,
        facilityId: o.readOnly.facilityIdentifier.id,
        facilityName: o.readOnly.facilityIdentifier.name,
        status: o.readOnly.status,
        isClosed: o.readOnly.isClosed,
        shipTo: o.shipTo ?? null,
        totalWeight: (o.readOnly as { totalWeight?: number | null })?.totalWeight ?? null,
        orderItems: (o.orderItems ?? []).map((item) => ({
          sku: item.itemIdentifier.sku,
          qty: item.qty,
          lotNumber: item.lotNumber ?? null,
        })),
      };
    }),
  /** Create a new small parcel sessionn (after pick ticket scan & order confirmation) */
  createSession: protectedProcedure
    .input(z.object({
      configId: z.number(),
      facilityId: z.number(),
      facilityName: z.string().optional(),
      extensivOrderId: z.number(),
      referenceNum: z.string(),
      pickTicketNum: z.string().optional(),
      clientId: z.number(),
      clientName: z.string(),
      shipToName: z.string().optional(),
      shipToAddress1: z.string().optional(),
      shipToCity: z.string().optional(),
      shipToState: z.string().optional(),
      shipToZip: z.string().optional(),
      shipToCountry: z.string().optional(),
      orderItems: z.array(z.object({ sku: z.string(), qty: z.number(), lotNumber: z.string().nullable().optional() })),
      selectedPackageSizeId: z.number().optional(),
      selectedPackageSizeName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const scannedItems = input.orderItems.map((item) => ({ sku: item.sku, qty: item.qty, scanned: 0 }));
      const id = await createSmallParcelSession({
        configId: input.configId,
        facilityId: input.facilityId,
        facilityName: input.facilityName,
        extensivOrderId: input.extensivOrderId,
        referenceNum: input.referenceNum,
        pickTicketNum: input.pickTicketNum,
        clientId: input.clientId,
        clientName: input.clientName,
        shipToName: input.shipToName,
        shipToAddress1: input.shipToAddress1,
        shipToCity: input.shipToCity,
        shipToState: input.shipToState,
        shipToZip: input.shipToZip,
        shipToCountry: input.shipToCountry,
        scannedItems,
        status: "scanning",
        selectedPackageSizeId: input.selectedPackageSizeId ?? null,
        selectedPackageSizeName: input.selectedPackageSizeName ?? null,
        createdByUserId: String(ctx.user.id),
        createdByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
      });
      return { id };
    }),

  /** Get a single session */
  getSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const session = await getSmallParcelSession(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return session;
    }),

  /** Update scanned items on a session */
  updateScannedItems: protectedProcedure
    .input(z.object({
      id: z.number(),
      scannedItems: z.array(z.object({ sku: z.string(), qty: z.number(), scanned: z.number() })),
    }))
    .mutation(async ({ input }) => {
      const allScanned = input.scannedItems.every((item) => item.scanned >= item.qty);
      await updateSmallParcelSession(input.id, {
        scannedItems: input.scannedItems,
        status: allScanned ? "ready" : "scanning",
      });
      return { allScanned };
    }),

  /** Update package dimensions */
  updateDimensions: protectedProcedure
    .input(z.object({
      id: z.number(),
      weightKg: z.number().positive().optional(),
      lengthCm: z.number().positive().optional(),
      widthCm: z.number().positive().optional(),
      heightCm: z.number().positive().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...dims } = input;
      await updateSmallParcelSession(id, {
        weightKg: dims.weightKg?.toString(),
        lengthCm: dims.lengthCm?.toString(),
        widthCm: dims.widthCm?.toString(),
        heightCm: dims.heightCm?.toString(),
      });
      return { success: true };
    }),

  /**
   * Purchase a label via Veeqo.
   * NOTE: This is a stub until the Veeqo API key is provisioned.
   * It marks the session as label_purchased and stores a placeholder.
   */
  purchaseLabel: protectedProcedure
    .input(z.object({
      id: z.number(),
      // Optional: carrier service selection (for future rate-shopping UI)
      carrierService: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getSmallParcelSession(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status === "label_purchased") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Label already purchased for this session" });
      }

          // ── Step 1: Purchase label — STRICT INTEGRATION GATE ────────────────────
      // Read the active small_parcel integration. Only that system is called.
      // No fallthrough between Rate Wizard, Veeqo, and TechShip.
      const activeIntegration = (await getActiveShippingIntegration('small_parcel')) ?? 'rate_wizard';
      let labelUrl: string;
      let trackingNumber: string;
      let carrier: string;
      let serviceLevel: string;
      let labelZpl: string;
      // Look up the confirmed rate record for this session.
      // Primary: look up by Extensiv order ID (set when order was scanned via Extensiv).
      // Fallback: look up by session ID (set during confirmRate for manual / walk-up shipments).
      let confirmedShipment = session.extensivOrderId
        ? await getLatestRatedShipmentForOrder(String(session.extensivOrderId))
        : null;
      if (!confirmedShipment) {
        confirmedShipment = await getLatestRatedShipmentBySessionId(input.id);
      }
      // Veeqo path: ONLY when activeIntegration === 'veeqo'
      const veeqoApiKey = activeIntegration === 'veeqo' ? process.env.VEEQO_API_KEY : undefined;
      const hasVeeqoTokens = activeIntegration === 'veeqo' && !!(veeqoApiKey && confirmedShipment?.remoteShipmentId && confirmedShipment?.requestToken && confirmedShipment?.serviceCode);
      if (activeIntegration === 'veeqo' && !hasVeeqoTokens) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Veeqo is the active integration but no Veeqo rate tokens were found. Please re-shop rates with Veeqo selected.",
        });
      }
      if (hasVeeqoTokens) {
        // ── Live Veeqo label booking ─────────────────────────────────────────────────
        const veeqo = createVeeqoClient();
        let bookResult;
        try {
          bookResult = await veeqo.bookShipment({
            request_token: confirmedShipment!.requestToken!,
            label_format: "PDF",
            shipments: [{
              remote_shipment_id: confirmedShipment!.remoteShipmentId!,
              rate_id: confirmedShipment!.serviceCode!,
            }],
          });
        } catch (err) {
          console.error(`[SmallParcel] Veeqo bookShipment error:`, err);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Veeqo label booking failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }

        // New API response: { successful: { [remote_shipment_id]: VeeqoBookedShipment }, failed: {} }
        const remoteId = confirmedShipment!.remoteShipmentId!;
        const failedEntry = bookResult.failed?.[remoteId];
        if (failedEntry) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Veeqo label booking failed: ${failedEntry.errors?.join("; ") ?? "unknown error"}`,
          });
        }
        const bookedShipment = bookResult.successful?.[remoteId] ?? Object.values(bookResult.successful ?? {})[0];
        if (!bookedShipment) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Veeqo booking returned no successful shipment.",
          });
        }
        trackingNumber = bookedShipment.tracking_number;
        carrier = bookedShipment.carrier_id ?? bookedShipment.service_carrier ?? confirmedShipment!.carrierCode ?? "Veeqo";
        serviceLevel = bookedShipment.service_name ?? confirmedShipment!.serviceName ?? "";
        labelUrl = `https://app.veeqo.com/shipments/${bookedShipment.external_shipment_id ?? remoteId}`;

        // Use the label content from Veeqo if available, otherwise build a fallback ZPL
        const labelFormat = (bookedShipment.label_format ?? "").toUpperCase();
        if (bookedShipment.label_content && labelFormat === "ZPL") {
          // Veeqo returned raw ZPL — decode from base64
          labelZpl = Buffer.from(bookedShipment.label_content, "base64").toString("utf-8");
        } else if (bookedShipment.label_content && labelFormat === "PDF") {
          // Veeqo returned a PDF label — store base64 for browser printing, build fallback ZPL
          labelZpl = buildFallbackZpl(trackingNumber, carrier, serviceLevel, session);
          // Store the PDF base64 in labelUrl for direct download
          labelUrl = `data:application/pdf;base64,${bookedShipment.label_content}`;
        } else {
          labelZpl = buildFallbackZpl(trackingNumber, carrier, serviceLevel, session);
        }

        // Update the shipment record to 'booked'
        if (confirmedShipment) {
          await updateRateWizardShipment(confirmedShipment.id, {
            status: "booked",
            trackingNumber,
          });
        }

        console.log(`[SmallParcel] Veeqo label booked: ${trackingNumber} via ${carrier} ${serviceLevel}`);
      } else if (activeIntegration === 'rate_wizard' && confirmedShipment?.carrierCode && hasAnyCarrierCredentials()) {
        // ── Direct carrier label purchase (Rate Wizard only) ──────────────────────────
        // Build origin from carrier account or fall back to env defaults
        const allAccounts = await listCarrierAccounts();
        const activeAccounts = allAccounts.filter((a) => a.isActive);
        const originAccount = activeAccounts.find(
          (a) => a.carrierCode.toLowerCase() === confirmedShipment!.carrierCode!.toLowerCase() && a.originAddress1 && a.originPostal
        ) ?? activeAccounts.find((a) => a.originAddress1 && a.originPostal);

        // Parse credentials JSON for account-specific overrides
        let credentials: Record<string, string> = {};
        try { credentials = JSON.parse(originAccount?.credentials ?? "{}"); } catch { /* ignore */ }

        const weightLbs = session.weightKg ? parseFloat(String(session.weightKg)) * 2.20462 : 1;
        const lengthIn = session.lengthCm ? parseFloat(String(session.lengthCm)) / 2.54 : 12;
        const widthIn = session.widthCm ? parseFloat(String(session.widthCm)) / 2.54 : 8;
        const heightIn = session.heightCm ? parseFloat(String(session.heightCm)) / 2.54 : 4;

        const labelInput: CarrierLabelInput = {
          originName: originAccount?.originName ?? "Go Direct Solutions",
          originAddress1: originAccount?.originAddress1 ?? "123 Warehouse Dr",
          originCity: originAccount?.originCity ?? "",
          originState: originAccount?.originState ?? "",
          originPostal: originAccount?.originPostal ?? "",
          originCountry: originAccount?.originCountry ?? "US",
          destName: session.shipToName ?? "",
          destAddress1: session.shipToAddress1 ?? "",
          destCity: session.shipToCity ?? "",
          destState: session.shipToState ?? "",
          destPostal: session.shipToZip ?? "",
          destCountry: session.shipToCountry ?? "US",
          weightLbs: Math.max(weightLbs, 0.1),
          lengthIn: Math.max(lengthIn, 1),
          widthIn: Math.max(widthIn, 1),
          heightIn: Math.max(heightIn, 1),
          serviceCode: confirmedShipment.serviceCode ?? input.carrierService ?? "",
          orderNumber: session.referenceNum ?? undefined,
          referenceNum: session.referenceNum ?? undefined,
          accountNumber: credentials.accountNumber ?? credentials.account_number ?? undefined,
          meterNumber: credentials.meterNumber ?? credentials.meter_number ?? undefined,
          pickupAccount: credentials.pickupAccount ?? undefined,
          distributionCenter: credentials.distributionCenter ?? undefined,
        };

        console.log(`[SmallParcel] Purchasing direct carrier label: ${confirmedShipment.carrierCode} ${labelInput.serviceCode}`);
        const labelResult = await buyCarrierLabel(confirmedShipment.carrierCode!, labelInput);

        if (!labelResult.success) {
          console.error(`[SmallParcel] Direct carrier label failed: ${labelResult.error}`);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Label purchase failed (${labelResult.carrierName}): ${labelResult.error}`,
          });
        }

        trackingNumber = labelResult.trackingNumber;
        carrier = labelResult.carrierName;
        serviceLevel = labelResult.service;
        labelUrl = labelResult.labelUrl ?? "";
        labelZpl = labelResult.labelZpl ?? buildFallbackZpl(trackingNumber, carrier, serviceLevel, session);
        console.log(`[SmallParcel] Direct carrier label purchased: ${trackingNumber} via ${carrier} ${serviceLevel}`);
      } else if (activeIntegration === 'techship') {
        // ── TechShip label purchase ──────────────────────────────────────────────────────
        // TechShip API integration placeholder — credentials and endpoint TBD
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: "TechShip label purchase is not yet configured. Please contact your administrator to set up TechShip credentials.",
        });
      } else {
        // No valid integration path found — surface a clear error instead of a stub
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot purchase label: active integration is '${activeIntegration}' but no matching credentials or confirmed rate were found. Please re-shop rates and try again.`,
        });
      }

      // ── Step 2: Update session record with label details ──
      await updateSmallParcelSession(input.id, {
        status: "label_purchased",
        veeqoLabelUrl: labelUrl,
        veeqoTrackingNumber: trackingNumber,
        veeqoCarrierService: `${carrier} ${serviceLevel}`.trim(),
        labelPurchasedAt: new Date(),
        labelZpl,
      });

      // ── Step 2b: Write to unified shipments registry ──────────────────────────
      try {
        const shipmentId = await createShipment({
          platform: hasVeeqoTokens ? "veeqo" : "manual",
          mode: "small_parcel",
          configId: session.configId ?? undefined,
          extensivOrderId: session.extensivOrderId ?? undefined,
          orderNumber: session.referenceNum ?? undefined,
          customerId: session.clientId ?? undefined,
          customerName: session.clientName ?? undefined,
          facilityName: session.facilityName ?? undefined,
          shipToName: session.shipToName ?? undefined,
          shipToCity: session.shipToCity ?? undefined,
          shipToState: session.shipToState ?? undefined,
          shipToZip: session.shipToZip ?? undefined,
          carrier,
          serviceLevel,
          trackingNumber,
          veeqoShipmentId: hasVeeqoTokens && confirmedShipment ? String(confirmedShipment.id) : undefined,
          rateWizardShipmentId: confirmedShipment?.id ?? undefined,
          smallParcelSessionId: input.id,
          labelCostCents: confirmedShipment?.rateAmountCents ?? undefined,
          labelUrl,
          labelZpl,
          status: "booked",
        });
        // Push immediately to ClearSight (non-blocking)
        void pushShipmentToClearSight(shipmentId, "shipment.created");
      } catch (err) {
        // Non-fatal: log but don't fail the label purchase
        console.error("[SmallParcel] Failed to write unified shipment record:", err);
      }

      // ── Step 3: Mark the order as Packed then Shipped in Extensiv ──
      let extensivPackResult: { success: boolean; error?: string } = { success: false, error: "Config not found" };
      let extensivShipResult: { success: boolean; error?: string } = { success: false, error: "Config not found" };
      const orderId = session.extensivOrderId ?? null;

      if (orderId !== null) {
        try {
          const config = await getExtensivConfigById(session.configId);
          if (config) {
            // Step 3a: Mark as Packed
            extensivPackResult = await markOrderPacked(config, orderId);
            if (!extensivPackResult.success) {
              console.warn(`[SmallParcel] markOrderPacked failed for order ${orderId}: ${extensivPackResult.error}`);
            } else {
              console.log(`[SmallParcel] Order ${orderId} marked as Packed in Extensiv`);
              await updateSmallParcelSession(input.id, { extensivPackedAt: new Date() });
            }

            // Step 3b: Mark as Shipped (always attempt even if Packed failed)
            extensivShipResult = await markOrderShipped(config, {
              orderId,
              trackingNumber,
              carrierName: carrier,
              shipVia: serviceLevel,
            });
            if (!extensivShipResult.success) {
              console.warn(`[SmallParcel] markOrderShipped failed for order ${orderId}: ${extensivShipResult.error}`);
            } else {
              console.log(`[SmallParcel] Order ${orderId} marked as Shipped in Extensiv (tracking: ${trackingNumber})`);
              await updateSmallParcelSession(input.id, { extensivShippedAt: new Date() });
            }
          }
        } catch (err) {
          // Log but do not fail the label purchase — the label is already purchased
          console.error(`[SmallParcel] Error updating Extensiv order status:`, err);
          extensivShipResult = { success: false, error: String(err) };
        }
      }

      return {
        veeqoLabelUrl: labelUrl,
        trackingNumber,
        carrier,
        serviceLevel,
        labelZpl,
        extensivMarkedPacked: extensivPackResult.success,
        extensivMarkedShipped: extensivShipResult.success,
        extensivPackError: extensivPackResult.success ? undefined : extensivPackResult.error,
        extensivShipError: extensivShipResult.success ? undefined : extensivShipResult.error,
      };
    }),

  /** Cancel a session */
  cancelSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await updateSmallParcelSession(input.id, { status: "cancelled" });
      return { success: true };
    }),

  /** List recent sessions */
  listSessions: protectedProcedure
    .input(z.object({
      facilityId: z.number().optional(),
      status: z.enum(["scanning", "ready", "label_purchased", "cancelled", "voided"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      return listSmallParcelSessions(input ?? {});
    }),

  /** Return the stored ZPL for a completed session so the frontend can reprint it */
  getSessionZpl: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const session = await getSmallParcelSession(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!session.labelZpl) throw new TRPCError({ code: "NOT_FOUND", message: "No ZPL label stored for this session" });
      return { labelZpl: session.labelZpl, trackingNumber: session.veeqoTrackingNumber, carrier: session.veeqoCarrierService };
    }),

  /**
   * Void a purchased FedEx label via the FedEx REST Cancel Shipment API.
   * Marks the session as 'voided' in the DB and records the void timestamp.
   * Must be called before carrier pickup (same business day).
   */
  voidLabel: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      reason: z.string().max(512).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getSmallParcelSession(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      // Only label_purchased sessions can be voided
      if (session.status !== "label_purchased") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot void a session with status '${session.status}'. Only label_purchased sessions can be voided.`,
        });
      }

      // Already voided guard
      if (session.voidedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This label has already been voided." });
      }

      const trackingNumber = session.veeqoTrackingNumber ?? "";
      const reason = input.reason ?? "Voided by operator";

      // Attempt to void at FedEx (best-effort — we still mark the DB even if FedEx returns an error)
      let fedexResult: { success: boolean; message: string } = { success: false, message: "No tracking number" };
      if (trackingNumber) {
        fedexResult = await voidFedExLabel(trackingNumber);
      }

      // Mark the session as voided in the DB regardless of FedEx response
      // (operator may need to void manually at FedEx.com if the API call fails)
      await updateSmallParcelSession(input.id, {
        status: "voided",
        voidedAt: new Date(),
        voidReason: fedexResult.success
          ? reason
          : `${reason} [FedEx API: ${fedexResult.message}]`,
      });

      // Audit log entry (eventType is varchar, not enum, so any string is valid)
      await logSmallParcelAuditEvent({
        sessionId: input.id,
        extensivOrderId: session.extensivOrderId ?? undefined,
        clientName: session.clientName ?? undefined,
        eventType: "label_voided",
        trackingNumber,
        carrier: session.veeqoCarrierService ?? undefined,
        notes: `Voided by ${ctx.user.name ?? ctx.user.email ?? ctx.user.openId}. FedEx: ${fedexResult.message}`,
        userId: ctx.user.openId,
        userName: ctx.user.name ?? ctx.user.email ?? ctx.user.openId,
      });

      console.log(`[SmallParcel] Label voided: session ${input.id}, tracking ${trackingNumber}, FedEx: ${fedexResult.success ? "accepted" : "failed"} — ${fedexResult.message}`);

      return {
        success: true,
        fedexVoided: fedexResult.success,
        fedexMessage: fedexResult.message,
        trackingNumber,
      };
    }),

  // ── Package Size Config ───────────────────────────────────────────────────────────────────────────

  /** List package sizes for a specific client (includes global defaults) */
  listPackageSizes: protectedProcedure
    .input(z.object({ clientId: z.number().optional().default(0) }))
    .query(async ({ input }) => listPackageSizesForClient(input.clientId)),

  /** List ALL package sizes (for config/admin page) */
  listAllPackageSizes: protectedProcedure
    .query(async () => listAllPackageSizes()),

  /**
   * Fetch packaging options for a specific customer from Extensiv.
   * Returns unique PackageUnit types and Pallet types aggregated from all items.
   */
  getExtensivPackaging: protectedProcedure
    .input(z.object({ configId: z.number(), clientId: z.number() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });

      const { getExtensivToken } = await import("./extensiv/client.js");
      const token = await getExtensivToken(config);
      const baseUrl = config.baseUrl || "https://secure-wms.com";

      interface ItemOptions {
        PackageUnit?: {
          UnitIdentifier?: { Name?: string; Id?: number };
          InventoryUnitsPerUnit?: number;
          IsPrepackaged?: boolean;
          Imperial?: { Length?: number; Width?: number; Height?: number; Weight?: number };
          Metric?: { Length?: number; Width?: number; Height?: number; Weight?: number };
        };
        Pallets?: {
          TypeIdentifier?: { Name?: string; Id?: number };
          Qty?: number;
          Imperial?: { Length?: number; Width?: number; Height?: number; Weight?: number };
        };
        InventoryUnit?: { UnitIdentifier?: { Name?: string; Id?: number } };
      }
      interface RawItem { Sku?: string; Description?: string; Options?: ItemOptions; }

      // Fetch all items for this customer (paginated, plain JSON)
      let allItems: RawItem[] = [];
      let pg = 1;
      while (true) {
        const res = await fetch(
          `${baseUrl}/customers/${input.clientId}/items?pgsiz=200&pgnum=${pg}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
        );
        if (!res.ok) break;
        const data = await res.json() as { TotalResults?: number; ResourceList?: RawItem[] };
        const list = data.ResourceList ?? [];
        allItems = allItems.concat(list);
        const total = data.TotalResults;
        if (list.length === 0 || list.length < 200 || (total !== undefined && allItems.length >= total)) break;
        pg++;
      }

      // Collect ALL unique package type names from both PackageUnit and Pallets fields.
      // We return a flat list so the frontend can assign categories freely.
      type PackageTypeEntry = {
        name: string;            // display name (e.g. "Carton", "Master carton", "Pallet")
        sourceField: "packageUnit" | "pallet"; // which Extensiv field it came from
        unitId: number;          // UnitIdentifier.Id or TypeIdentifier.Id
        inventoryUnitsPerUnit: number | null; // only for packageUnit
        isPrepackaged: boolean;  // only for packageUnit
        imperial: { length: number | null; width: number | null; height: number | null; weight: number | null };
        skuCount: number;        // number of SKUs using this type
      };

      const typeMap = new Map<string, PackageTypeEntry>();

      for (const item of allItems) {
        const pkg = item.Options?.PackageUnit;
        const pallet = item.Options?.Pallets;

        if (pkg?.UnitIdentifier?.Name) {
          const name = pkg.UnitIdentifier.Name;
          const key = `pkg:${name}`;
          if (!typeMap.has(key)) {
            typeMap.set(key, {
              name,
              sourceField: "packageUnit",
              unitId: pkg.UnitIdentifier.Id ?? 0,
              inventoryUnitsPerUnit: pkg.InventoryUnitsPerUnit ?? null,
              isPrepackaged: pkg.IsPrepackaged ?? false,
              imperial: {
                length: pkg.Imperial?.Length ?? null,
                width: pkg.Imperial?.Width ?? null,
                height: pkg.Imperial?.Height ?? null,
                weight: pkg.Imperial?.Weight ?? null,
              },
              skuCount: 0,
            });
          }
          typeMap.get(key)!.skuCount++;
        }

        if (pallet?.TypeIdentifier?.Name) {
          const name = pallet.TypeIdentifier.Name;
          const key = `pallet:${name}`;
          if (!typeMap.has(key)) {
            typeMap.set(key, {
              name,
              sourceField: "pallet",
              unitId: pallet.TypeIdentifier.Id ?? 0,
              inventoryUnitsPerUnit: null,
              isPrepackaged: false,
              imperial: {
                length: pallet.Imperial?.Length ?? null,
                width: pallet.Imperial?.Width ?? null,
                height: pallet.Imperial?.Height ?? null,
                weight: pallet.Imperial?.Weight ?? null,
              },
              skuCount: 0,
            });
          }
          typeMap.get(key)!.skuCount++;
        }
      }

      // Sort: pallet-sourced entries first (they're usually pallets), then by skuCount desc, then name
      const allPackageTypes = Array.from(typeMap.values()).sort((a, b) => {
        if (a.sourceField !== b.sourceField) return a.sourceField === "pallet" ? -1 : 1;
        return b.skuCount - a.skuCount || a.name.localeCompare(b.name);
      });

      // Also keep the legacy shape for backward compatibility with existing frontend code
      const packageUnits = allPackageTypes
        .filter(t => t.sourceField === "packageUnit")
        .map(t => ({
          unitName: t.name,
          inventoryUnitsPerUnit: t.inventoryUnitsPerUnit,
          isPrepackaged: t.isPrepackaged,
          imperial: t.imperial,
          skuCount: t.skuCount,
        }));
      const palletTypes = allPackageTypes
        .filter(t => t.sourceField === "pallet")
        .map(t => ({
          palletName: t.name,
          qtyPerPallet: null as number | null,
          imperial: t.imperial,
          skuCount: t.skuCount,
        }));

      return { totalItems: allItems.length, allPackageTypes, packageUnits, palletTypes };
    }),

  /** Debug: return raw first item from Extensiv to inspect field structure */
  debugExtensivPackaging: protectedProcedure
    .input(z.object({ configId: z.number(), clientId: z.number() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });
      const { getExtensivToken } = await import("./extensiv/client.js");
      const token = await getExtensivToken(config);
      const baseUrl = config.baseUrl || "https://secure-wms.com";

      // Try HAL+JSON with detail=all
      const halRes = await fetch(
        `${baseUrl}/customers/${input.clientId}/items?pgsiz=3&pgnum=1&detail=all`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json" } }
      );
      const halData = await halRes.json();

      // Try plain JSON with detail=all
      const jsonRes = await fetch(
        `${baseUrl}/customers/${input.clientId}/items?pgsiz=3&pgnum=1&detail=all`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      const jsonData = await jsonRes.json();

      // Try plain JSON without detail
      const plainRes = await fetch(
        `${baseUrl}/customers/${input.clientId}/items?pgsiz=3&pgnum=1`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      const plainData = await plainRes.json();

      return {
        halStatus: halRes.status,
        halData,
        jsonStatus: jsonRes.status,
        jsonData,
        plainStatus: plainRes.status,
        plainData,
      };
    }),
  /** Dump raw packageUnit options for a specific SKU to diagnose weight field names */
  debugItemWeight: protectedProcedure
    .input(z.object({ configId: z.number(), customerId: z.number(), sku: z.string() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });
      const token = await getExtensivToken(config);
      const baseUrl = config.baseUrl || "https://secure-wms.com";
      const res = await fetch(
        `${baseUrl}/customers/${input.customerId}/items?sku=${encodeURIComponent(input.sku)}&pgsiz=5`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json" } }
      );
      const data = await res.json() as any;
      const embedded = data?._embedded ?? {};
      const items: any[] = Object.values(embedded).flat();
      return {
        status: res.status,
        itemCount: items.length,
        items: items.map((item: any) => ({
          sku: item.sku,
          optionsKeys: Object.keys(item.options ?? {}),
          packageUnit: item.options?.packageUnit ?? null,
          imperial: item.options?.imperial ?? null,
        })),
      };
    }),
  /** Create a new package size */
  createPackageSize: protectedProcedure
    .input(z.object({
      clientId: z.number().default(0),
      clientName: z.string().default("All Clients"),
      name: z.string().min(1).max(128),
      lengthCm: z.number().positive().optional(),
      widthCm: z.number().positive().optional(),
      heightCm: z.number().positive().optional(),
      weightKg: z.number().positive().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const id = await createPackageSize({
        clientId: input.clientId,
        clientName: input.clientName,
        name: input.name,
        lengthCm: input.lengthCm?.toString() ?? null,
        widthCm: input.widthCm?.toString() ?? null,
        heightCm: input.heightCm?.toString() ?? null,
        weightKg: input.weightKg?.toString() ?? null,
        sortOrder: input.sortOrder,
      });
      return { id };
    }),

  /** Update an existing package size */
  updatePackageSize: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      lengthCm: z.number().positive().nullable().optional(),
      widthCm: z.number().positive().nullable().optional(),
      heightCm: z.number().positive().nullable().optional(),
      weightKg: z.number().positive().nullable().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await updatePackageSize(id, {
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.lengthCm !== undefined ? { lengthCm: rest.lengthCm?.toString() ?? null } : {}),
        ...(rest.widthCm !== undefined ? { widthCm: rest.widthCm?.toString() ?? null } : {}),
        ...(rest.heightCm !== undefined ? { heightCm: rest.heightCm?.toString() ?? null } : {}),
        ...(rest.weightKg !== undefined ? { weightKg: rest.weightKg?.toString() ?? null } : {}),
        ...(rest.sortOrder !== undefined ? { sortOrder: rest.sortOrder } : {}),
      });
      return { ok: true };
    }),

  /** Delete a package size */
  deletePackageSize: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deletePackageSize(input.id);
      return { ok: true };
    }),

  // ── Audit Log ─────────────────────────────────────────────────────────────

  /** Log a single audit event (called from frontend for manual overrides, carrier changes, etc.) */
  logAuditEvent: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      extensivOrderId: z.number().optional(),
      clientName: z.string().optional(),
      eventType: z.enum(["manual_override", "label_purchased", "reprint", "carrier_changed", "scan_error"]),
      sku: z.string().optional(),
      qty: z.number().optional(),
      trackingNumber: z.string().optional(),
      carrier: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await logSmallParcelAuditEvent({
        ...input,
        userId: ctx.user.openId,
        userName: ctx.user.name ?? ctx.user.email ?? ctx.user.openId,
      });
      return { ok: true };
    }),

  /** Query the audit log with optional filters and pagination */
  listAuditLog: protectedProcedure
    .input(z.object({
      sessionId: z.number().optional(),
      eventType: z.string().optional(),
      userId: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional().default(100),
      offset: z.number().int().min(0).optional().default(0),
    }).optional())
    .query(async ({ input }) => {
      const opts = input ?? {};
      const [rows, total] = await Promise.all([
        getSmallParcelAuditLog(opts),
        countSmallParcelAuditLog(opts),
      ]);
      return { rows, total };
    }),

  // ── Supervisor PINs ────────────────────────────────────────────────────────

  listSupervisorPins: protectedProcedure.query(async () => {
    const pins = await listSupervisorPins();
    // Never return the hash to the frontend
    return pins.map(({ pinHash: _h, ...rest }) => rest);
  }),

  createSupervisorPin: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      pin: z.string().min(4).max(8).regex(/^\d+$/, "PIN must be digits only"),
      userId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const bcrypt = await import("bcryptjs");
      const pinHash = await bcrypt.hash(input.pin, 10);
      await createSupervisorPin({ name: input.name, pinHash, userId: input.userId });
      return { success: true };
    }),

  updateSupervisorPin: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(256).optional(),
      pin: z.string().min(4).max(8).regex(/^\d+$/, "PIN must be digits only").optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, pin, ...rest } = input;
      const update: Record<string, unknown> = { ...rest };
      if (pin) {
        const bcrypt = await import("bcryptjs");
        update.pinHash = await bcrypt.hash(pin, 10);
      }
      await updateSupervisorPin(id, update);
      return { success: true };
    }),

  deleteSupervisorPin: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteSupervisorPin(input.id);
      return { success: true };
    }),

  /** Verify a supervisor PIN — returns supervisor name on success, null on failure */
  verifySupervisorPin: protectedProcedure
    .input(z.object({ pin: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const supervisorName = await verifySupervisorPin(input.pin);
      return { valid: supervisorName !== null, supervisorName };
    }),

  // ── High-Value SKUs ────────────────────────────────────────────────────────

  listHighValueSkus: protectedProcedure.query(async () => listHighValueSkus()),

  addHighValueSku: protectedProcedure
    .input(z.object({
      sku: z.string().min(1).max(128),
      clientName: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await addHighValueSku({ ...input, sku: input.sku.toUpperCase() });
      return { success: true };
    }),

  removeHighValueSku: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await removeHighValueSku(input.id);
      return { success: true };
    }),

  /** Check if a given SKU (optionally scoped to a client) is flagged as high-value */
  checkHighValueSku: protectedProcedure
    .input(z.object({ sku: z.string(), clientName: z.string().optional() }))
    .query(async ({ input }) => {
      const highValue = await isHighValueSku(input.sku, input.clientName);
      return { highValue };
    }),

  /**
   * Resolve a scanned barcode (UPC/EAN/GTIN) to a SKU by looking up the
   * Extensiv item master for the given client. Returns the matched SKU string
   * or null if no match found.
   */
  resolveUpcToSku: protectedProcedure
    .input(z.object({
      configId: z.number().int(),
      clientId: z.number().int(),
      barcode: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) return { sku: null };
      const { getExtensivToken } = await import('./extensiv/client.js');
      const token = await getExtensivToken(config);
      const baseUrl = config.baseUrl || 'https://secure-wms.com';
      const normalised = input.barcode.trim().toUpperCase();
      // Actual Extensiv plain JSON response shape (PascalCase):
      // item.Upc = item-level UPC
      // item.Options.PackageUnit.Upc = package-level UPC (Primary UPC from Units of Measure tab)
      interface RawItemForUpc {
        Sku?: string;
        Upc?: string;
        Options?: {
          PackageUnit?: { Upc?: string };
        };
      }
      let pg = 1;
      while (true) {
        // Use plain JSON — HAL+JSON uses camelCase and detail=all is not supported
        const res = await fetch(
          `${baseUrl}/customers/${input.clientId}/items?pgsiz=200&pgnum=${pg}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        );
        if (!res.ok) break;
        const data = await res.json() as {
          TotalResults?: number;
          ResourceList?: RawItemForUpc[];
        };
        const list = data.ResourceList ?? [];
        for (const item of list) {
          if (!item.Sku) continue;
          // Check item-level UPC
          if (item.Upc && item.Upc.trim().toUpperCase() === normalised) return { sku: item.Sku };
          // Check Options.PackageUnit.Upc (Primary UPC from Units of Measure tab in Extensiv)
          const pkgUpc = item.Options?.PackageUnit?.Upc;
          if (pkgUpc && pkgUpc.trim().toUpperCase() === normalised) return { sku: item.Sku };
        }
        // Stop when page is not full (last page), or TotalResults reached
        const total = data.TotalResults;
        if (list.length === 0 || list.length < 200 || (total !== undefined && pg * 200 >= total)) break;
        pg++;
      }
      return { sku: null };
    }),

  /** Get a small parcel setting by key */
  getSetting: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const value = await getSmallParcelSetting(input.key);
      return { value };
    }),

  /** Update a small parcel setting */
  setSetting: protectedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await setSmallParcelSetting(input.key, input.value);
      return { success: true };
    }),

  /** Get all small parcel settings as a key/value map */
  getAllSettings: protectedProcedure.query(async () => {
    const [countdown, replenishmentWeeks] = await Promise.all([
      getSmallParcelSetting('reprint_countdown_seconds'),
      getSmallParcelSetting('packaging_replenishment_weeks'),
    ]);
    const parsedWeeks = replenishmentWeeks ? parseInt(replenishmentWeeks, 10) : 4;
    const validWeeks = [2, 4, 6].includes(parsedWeeks) ? parsedWeeks : 4;
    return {
      reprintCountdownSeconds: countdown ? parseInt(countdown, 10) : 10,
      packagingReplenishmentWeeks: validWeeks,
    };
  }),

  // ── Client Packaging Enabled ────────────────────────────────────────────────
  /** Get all packaging type rows (enabled/disabled) for a given config+client */
  getClientPackagingEnabled: protectedProcedure
    .input(z.object({ configId: z.number().int(), clientId: z.number().int(), clientName: z.string().optional() }))
    .query(async ({ input }) => {
      return getClientPackagingEnabled(input.configId, input.clientId, input.clientName);
    }),

  /** Enable or disable a packaging type for a client */
  setClientPackagingEnabled: protectedProcedure
    .input(z.object({
      configId: z.number().int(),
      clientId: z.number().int(),
      clientName: z.string(),
      category: z.enum(['package_unit', 'pallet']),
      typeName: z.string().min(1),
      enabled: z.boolean(),
      sortOrder: z.number().int().optional().default(0),
    }))
    .mutation(async ({ input }) => {
      await upsertClientPackagingEnabled({
        configId: input.configId,
        clientId: input.clientId,
        clientName: input.clientName,
        category: input.category,
        typeName: input.typeName,
        enabled: input.enabled,
        sortOrder: input.sortOrder ?? 0,
      });
      return { success: true };
    }),

  /**
   * Add a custom packaging type: inserts into packaging_inventory AND enables it for the client.
   * This is the correct way to add a custom type so it appears in the grid immediately.
   */
  addCustomPackagingType: protectedProcedure
    .input(z.object({
      configId: z.number().int(),
      clientId: z.number().int(),
      clientName: z.string(),
      category: z.enum(['envelope', 'box', 'pallet']),
      typeName: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const { upsertPackagingInventoryItem, upsertClientPackagingEnabled, listPackagingInventory } = await import('./db.js');
      // 0. Duplicate check — reject if a type with the same name already exists in this category
      const existing = await listPackagingInventory(input.configId);
      const nameLower = input.typeName.trim().toLowerCase();
      const duplicate = existing.find(
        (item) => item.category === input.category && item.name.trim().toLowerCase() === nameLower
      );
      if (duplicate) {
        const { TRPCError } = await import('@trpc/server');
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A ${input.category} named "${duplicate.name}" already exists in inventory. Please use a different name.`,
        });
      }
      // 1. Insert into packaging_inventory so it shows in the grid
      const item = await upsertPackagingInventoryItem({
        configId: input.configId,
        facilityId: 0, // global (not facility-specific)
        name: input.typeName,
        category: input.category,
        unit: 'each',
        onHandQty: 0,
        minStockLevel: 0,
        weeklyConsumption: 0,
        notes: null,
        isCustom: true,
      });
      // 2. Enable it for this client in clientPackagingEnabled
      const dbCategory = input.category === 'pallet' ? 'pallet' : 'package_unit';
      await upsertClientPackagingEnabled({
        configId: input.configId,
        clientId: input.clientId,
        clientName: input.clientName,
        category: dbCategory,
        typeName: input.typeName,
        enabled: true,
        sortOrder: 0,
      });
      return { success: true, item };
    }),

  /** Return the most recent order date per clientId for a given configId (for graying out inactive clients) */
  getLastOrderDatesPerClient: protectedProcedure
    .input(z.object({ configId: z.number().int() }))
    .query(async ({ input }) => {
      const map = await getLastOrderDatePerClient(input.configId);
      // Convert Map to array of { clientId, lastOrderDate } for JSON serialisation
      return Array.from(map.entries()).map(([clientId, lastOrderDate]) => ({
        clientId,
        lastOrderDate,
      }));
    }),

  /** Return enabled packaging types for a client — used by Pack & Ship and QC */
  getEnabledPackagingForClient: protectedProcedure
    .input(z.object({ configId: z.number().int(), clientId: z.number().int() }))
    .query(async ({ input }) => {
      const rows = await getClientPackagingEnabled(input.configId, input.clientId);
      return rows.filter((r) => r.enabled);
    }),

  /** Return all distinct packaging type names ever used across all clients (for the global catalogue) */
  getAllPackagingTypeNames: protectedProcedure
    .input(z.object({ configId: z.number().int() }))
    .query(async ({ input }) => {
      const { getAllDistinctPackagingTypeNames } = await import('./db.js');
      return getAllDistinctPackagingTypeNames(input.configId);
    }),

  // ─── Packaging Inventory ─────────────────────────────────────────────────
  listPackagingInventory: protectedProcedure
    .input(z.object({ configId: z.number().int(), facilityId: z.number().int().optional() }))
    .query(async ({ input }) => {
      if (input.facilityId && input.facilityId > 0) {
        const { listPackagingInventoryByFacility } = await import('./db.js');
        return listPackagingInventoryByFacility(input.configId, input.facilityId);
      }
      const { listPackagingInventory } = await import('./db.js');
      return listPackagingInventory(input.configId);
    }),

  /**
   * Fetch all unique packaging types across all customers in a facility.
   * Used by the Packaging Inventory page to show every known pack type
   * (even those not yet in the inventory DB) for a given warehouse.
   */
  getExtensivPackagingForFacility: protectedProcedure
    .input(z.object({ configId: z.number().int(), facilityId: z.number().int() }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });

      const { getExtensivToken } = await import("./extensiv/client.js");
      const { fetchCustomersForFacility } = await import("./extensiv/api.js");
      const token = await getExtensivToken(config);
      const baseUrl = config.baseUrl || "https://secure-wms.com";

      // Get all customers for this facility
      const customers = await fetchCustomersForFacility(config, input.facilityId);

      interface ItemOptions {
        PackageUnit?: { UnitIdentifier?: { Name?: string; Id?: number }; InventoryUnitsPerUnit?: number; IsPrepackaged?: boolean; Imperial?: { Length?: number; Width?: number; Height?: number; Weight?: number } };
        Pallets?: { TypeIdentifier?: { Name?: string; Id?: number }; Qty?: number; Imperial?: { Length?: number; Width?: number; Height?: number; Weight?: number } };
      }
      interface RawItem { Options?: ItemOptions; }

      type PackageTypeEntry = {
        name: string;
        sourceField: "packageUnit" | "pallet";
        unitId: number;
        inventoryUnitsPerUnit: number | null;
        isPrepackaged: boolean;
        imperial: { length: number | null; width: number | null; height: number | null; weight: number | null };
        skuCount: number;
      };

      const typeMap = new Map<string, PackageTypeEntry>();

      // Fetch items for each customer and collect unique package types
      for (const customer of customers) {
        let pg = 1;
        while (true) {
          const res = await fetch(
            `${baseUrl}/customers/${customer.id}/items?pgsiz=200&pgnum=${pg}`,
            { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
          );
          if (!res.ok) break;
          const data = await res.json() as { TotalResults?: number; ResourceList?: RawItem[] };
          const list = data.ResourceList ?? [];
          for (const item of list) {
            const pkg = item.Options?.PackageUnit;
            const pallet = item.Options?.Pallets;
            if (pkg?.UnitIdentifier?.Name) {
              const name = pkg.UnitIdentifier.Name;
              const key = `pkg:${name}`;
              if (!typeMap.has(key)) {
                typeMap.set(key, { name, sourceField: "packageUnit", unitId: pkg.UnitIdentifier.Id ?? 0, inventoryUnitsPerUnit: pkg.InventoryUnitsPerUnit ?? null, isPrepackaged: pkg.IsPrepackaged ?? false, imperial: { length: pkg.Imperial?.Length ?? null, width: pkg.Imperial?.Width ?? null, height: pkg.Imperial?.Height ?? null, weight: pkg.Imperial?.Weight ?? null }, skuCount: 0 });
              }
              typeMap.get(key)!.skuCount++;
            }
            if (pallet?.TypeIdentifier?.Name) {
              const name = pallet.TypeIdentifier.Name;
              const key = `pallet:${name}`;
              if (!typeMap.has(key)) {
                typeMap.set(key, { name, sourceField: "pallet", unitId: pallet.TypeIdentifier.Id ?? 0, inventoryUnitsPerUnit: null, isPrepackaged: false, imperial: { length: pallet.Imperial?.Length ?? null, width: pallet.Imperial?.Width ?? null, height: pallet.Imperial?.Height ?? null, weight: pallet.Imperial?.Weight ?? null }, skuCount: 0 });
              }
              typeMap.get(key)!.skuCount++;
            }
          }
          const total = data.TotalResults;
          if (list.length === 0 || list.length < 200 || (total !== undefined && list.length + (pg - 1) * 200 >= total)) break;
          pg++;
        }
      }

      const allPackageTypes = Array.from(typeMap.values()).sort((a, b) => {
        if (a.sourceField !== b.sourceField) return a.sourceField === "pallet" ? -1 : 1;
        return b.skuCount - a.skuCount || a.name.localeCompare(b.name);
      });

      return { allPackageTypes, customerCount: customers.length };
    }),

  upsertPackagingInventoryItem: protectedProcedure
    .input(z.object({
      id: z.number().int().optional(),
      configId: z.number().int(),
      facilityId: z.number().int().default(0),
      name: z.string().min(1),
      category: z.enum(['envelope', 'box', 'pallet']),
      unit: z.string().default('each'),
      onHandQty: z.number().int().min(0),
      minStockLevel: z.number().int().min(0),
      weeklyConsumption: z.number().int().min(0).default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { upsertPackagingInventoryItem } = await import('./db.js');
      return upsertPackagingInventoryItem(input as any);
    }),

  deletePackagingInventoryItem: protectedProcedure
    .input(z.object({ id: z.number().int(), configId: z.number().int() }))
    .mutation(async ({ input }) => {
      const { deletePackagingInventoryItem } = await import('./db.js');
      await deletePackagingInventoryItem(input.id, input.configId);
      return { success: true };
    }),

  updatePackagingOnHand: protectedProcedure
    .input(z.object({ id: z.number().int(), configId: z.number().int(), onHandQty: z.number().int().min(0) }))
    .mutation(async ({ input }) => {
      const { updatePackagingOnHand } = await import('./db.js');
      await updatePackagingOnHand(input.id, input.configId, input.onHandQty);
      return { success: true };
    }),

  listPackagingReorderRequests: protectedProcedure
    .input(z.object({ configId: z.number().int() }))
    .query(async ({ input }) => {
      const { listPackagingReorderRequests } = await import('./db.js');
      return listPackagingReorderRequests(input.configId);
    }),

  createPackagingReorderRequest: protectedProcedure
    .input(z.object({
      inventoryItemId: z.number().int(),
      configId: z.number().int(),
      requestedQty: z.number().int().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createPackagingReorderRequest, listPackagingInventory, getSmallParcelSetting } = await import('./db.js');
      const { notifyOwner } = await import('./_core/notification.js');
      const { sendEmail, buildReorderEmailHtml } = await import('./email.js');

      const items = await listPackagingInventory(input.configId);
      const item = items.find((i) => i.id === input.inventoryItemId);
      const itemName = item?.name ?? `Item #${input.inventoryItemId}`;
      const requesterName = ctx.user.name ?? ctx.user.email ?? 'Unknown';

      const request = await createPackagingReorderRequest({
        inventoryItemId: input.inventoryItemId,
        configId: input.configId,
        requestedQty: input.requestedQty,
        notes: input.notes ?? null,
        requestedByUserId: ctx.user.id,
        requestedByName: requesterName,
        status: 'pending',
      });

      // 1. Notify owner (in-app notification)
      await notifyOwner({
        title: `📦 Packaging Reorder Request — ${itemName}`,
        content: `${requesterName} has requested a reorder of **${input.requestedQty}** units of **${itemName}**.\n\n${input.notes ? `Notes: ${input.notes}` : 'No additional notes.'}`,
      });

      // 2. Send formatted email to accounting address if configured
      const accountingEmail = await getSmallParcelSetting('packaging_accounting_email');
      if (accountingEmail) {
        // Calculate suggested qty using the 4-week formula (same as frontend)
        const onHand = item?.onHandQty ?? 0;
        const weekly = item?.weeklyConsumption ?? 0;
        const minStock = item?.minStockLevel ?? 0;
        const suggestedQty = weekly > 0
          ? Math.max(1, Math.ceil(weekly * 4) - onHand)
          : Math.max(1, minStock * 2 - onHand);

        const { subject, text, html } = buildReorderEmailHtml({
          itemName,
          category: item?.category ?? 'box',
          requestedQty: input.requestedQty,
          onHandQty: onHand,
          minStockLevel: minStock,
          weeklyConsumption: weekly > 0 ? weekly : null,
          suggestedQty,
          requesterName,
          notes: input.notes,
        });

        // CC the requester if they have an email address on their account
        const requesterEmail = ctx.user.email ?? null;
        const cc = requesterEmail && requesterEmail !== accountingEmail
          ? requesterEmail
          : undefined;

        await sendEmail({ to: accountingEmail, cc, subject, text, html });
      }

      return request;
    }),

  updatePackagingReorderRequestStatus: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      configId: z.number().int(),
      status: z.enum(['pending', 'ordered', 'received', 'cancelled']),
    }))
    .mutation(async ({ input }) => {
      const { updatePackagingReorderRequestStatus } = await import('./db.js');
      const fulfilledAt = input.status === 'received' ? new Date() : undefined;
      await updatePackagingReorderRequestStatus(input.id, input.configId, input.status, fulfilledAt);
      return { success: true };
    }),

  /**
   * Import packaging types from Extensiv across all clients and seed the
   * packaging_inventory table (skipping items that already exist by name).
   * Returns counts of inserted vs skipped items.
   */
  importPackagingFromExtensiv: protectedProcedure
    .input(z.object({ configId: z.number().int() }))
    .mutation(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });

      const { getExtensivToken } = await import('./extensiv/client.js');
      const { upsertPackagingInventoryItem, listPackagingInventory } = await import('./db.js');
      const token = await getExtensivToken(config);
      const baseUrl = config.baseUrl || 'https://secure-wms.com';

      // Classify a package unit name into envelope / box / pallet
      function classifyName(name: string): 'envelope' | 'box' | 'pallet' {
        const l = name.toLowerCase();
        if (l.includes('pallet') || l.includes('skid')) return 'pallet';
        if (
          l.includes('envelope') || l.includes('mailer') ||
          l.includes('poly') || l.includes('flat') ||
          l.includes('padded') || l.includes('bubble')
        ) return 'envelope';
        return 'box';
      }

      // Collect all customers first
      interface RawCustomer { Id?: number; Name?: string; }
      const custRes = await fetch(`${baseUrl}/customers?pgsiz=200&pgnum=1`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const custData = custRes.ok ? (await custRes.json() as { ResourceList?: RawCustomer[] }) : { ResourceList: [] };
      const customers: Array<{ id: number; name: string }> = (custData.ResourceList ?? [])
        .filter((c) => c.Id)
        .map((c) => ({ id: c.Id!, name: c.Name ?? String(c.Id) }));

      // For each customer, fetch items and collect unique package unit / pallet names
      const nameSet = new Map<string, 'envelope' | 'box' | 'pallet'>(); // name → category

      interface ItemOptions {
        PackageUnit?: { UnitIdentifier?: { Name?: string } };
        Pallets?: { TypeIdentifier?: { Name?: string } };
      }
      interface RawItem { Options?: ItemOptions; }

      for (const cust of customers) {
        let pg = 1;
        while (true) {
          const res = await fetch(`${baseUrl}/customers/${cust.id}/items?pgsiz=200&pgnum=${pg}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          });
          if (!res.ok) break;
          const data = await res.json() as { TotalResults?: number; ResourceList?: RawItem[] };
          const list = data.ResourceList ?? [];
          for (const item of list) {
            const pkgName = item.Options?.PackageUnit?.UnitIdentifier?.Name;
            if (pkgName && !nameSet.has(pkgName)) nameSet.set(pkgName, classifyName(pkgName));
            const palName = item.Options?.Pallets?.TypeIdentifier?.Name;
            if (palName && !nameSet.has(palName)) nameSet.set(palName, 'pallet');
          }
          if (list.length === 0 || list.length >= (data.TotalResults ?? 0)) break;
          pg++;
        }
      }

      // Load existing items to avoid duplicates
      const existing = await listPackagingInventory(input.configId);
      const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));

      let inserted = 0;
      let skipped = 0;
      for (const [name, category] of Array.from(nameSet.entries())) {
        if (existingNames.has(name.toLowerCase())) { skipped++; continue; }
        await upsertPackagingInventoryItem({
          configId: input.configId,
          name,
          category,
          unit: 'each',
          onHandQty: 0,
          minStockLevel: 0,
          weeklyConsumption: 0,
          notes: null,
        } as any);
        inserted++;
      }

      return { inserted, skipped, total: nameSet.size };
    }),

  /**
   * Seed the packaging inventory with a standard list of real-world packaging sizes.
   * Skips any names already present. Safe to call multiple times.
   */
  seedStandardPackagingTypes: protectedProcedure
    .input(z.object({ configId: z.number().int(), facilityId: z.number().int().default(0) }))
    .mutation(async ({ input }) => {
      const { upsertPackagingInventoryItem, listPackagingInventory } = await import('./db.js');

      const STANDARD_TYPES: Array<{ name: string; category: 'envelope' | 'box' | 'pallet'; unit: string; notes?: string }> = [
        // ── Envelopes / Mailers ──
        { name: 'FedEx Letter Envelope', category: 'envelope', unit: 'each', notes: '9.5×12.5 in' },
        { name: 'FedEx Padded Pak', category: 'envelope', unit: 'each', notes: '11.75×14.75 in' },
        { name: 'FedEx Small Pak', category: 'envelope', unit: 'each', notes: '10.25×12.75 in' },
        { name: 'FedEx Large Pak', category: 'envelope', unit: 'each', notes: '12×15.5 in' },
        { name: 'UPS Letter Envelope', category: 'envelope', unit: 'each', notes: '9.5×12.5 in' },
        { name: 'UPS Padded Pak', category: 'envelope', unit: 'each', notes: '11×13.25 in' },
        { name: 'USPS Priority Mail Flat Rate Envelope', category: 'envelope', unit: 'each', notes: '12.5×9.5 in' },
        { name: 'USPS Priority Mail Padded Flat Rate Envelope', category: 'envelope', unit: 'each', notes: '12.5×9.5 in' },
        { name: 'Poly Mailer 6x9', category: 'envelope', unit: 'each', notes: '6×9 in' },
        { name: 'Poly Mailer 9x12', category: 'envelope', unit: 'each', notes: '9×12 in' },
        { name: 'Poly Mailer 10x13', category: 'envelope', unit: 'each', notes: '10×13 in' },
        { name: 'Poly Mailer 12x15.5', category: 'envelope', unit: 'each', notes: '12×15.5 in' },
        { name: 'Poly Mailer 14.5x19', category: 'envelope', unit: 'each', notes: '14.5×19 in' },
        { name: 'Bubble Mailer #000 (4x8)', category: 'envelope', unit: 'each', notes: '4×8 in' },
        { name: 'Bubble Mailer #00 (5x10)', category: 'envelope', unit: 'each', notes: '5×10 in' },
        { name: 'Bubble Mailer #0 (6x10)', category: 'envelope', unit: 'each', notes: '6×10 in' },
        { name: 'Bubble Mailer #2 (8.5x12)', category: 'envelope', unit: 'each', notes: '8.5×12 in' },
        { name: 'Bubble Mailer #4 (9.5x14.5)', category: 'envelope', unit: 'each', notes: '9.5×14.5 in' },
        { name: 'Bubble Mailer #5 (10.5x16)', category: 'envelope', unit: 'each', notes: '10.5×16 in' },
        { name: 'Bubble Mailer #7 (14.25x20)', category: 'envelope', unit: 'each', notes: '14.25×20 in' },
        // ── Boxes ──
        { name: 'Box 6x6x6', category: 'box', unit: 'each', notes: '6×6×6 in' },
        { name: 'Box 8x6x4', category: 'box', unit: 'each', notes: '8×6×4 in' },
        { name: 'Box 8x8x8', category: 'box', unit: 'each', notes: '8×8×8 in' },
        { name: 'Box 10x8x6', category: 'box', unit: 'each', notes: '10×8×6 in' },
        { name: 'Box 10x10x10', category: 'box', unit: 'each', notes: '10×10×10 in' },
        { name: 'Box 12x9x6', category: 'box', unit: 'each', notes: '12×9×6 in' },
        { name: 'Box 12x12x8', category: 'box', unit: 'each', notes: '12×12×8 in' },
        { name: 'Box 12x12x12', category: 'box', unit: 'each', notes: '12×12×12 in' },
        { name: 'Box 14x10x8', category: 'box', unit: 'each', notes: '14×10×8 in' },
        { name: 'Box 14x14x14', category: 'box', unit: 'each', notes: '14×14×14 in' },
        { name: 'Box 16x12x8', category: 'box', unit: 'each', notes: '16×12×8 in' },
        { name: 'Box 16x12x12', category: 'box', unit: 'each', notes: '16×12×12 in' },
        { name: 'Box 18x12x12', category: 'box', unit: 'each', notes: '18×12×12 in' },
        { name: 'Box 18x14x12', category: 'box', unit: 'each', notes: '18×14×12 in' },
        { name: 'Box 18x18x16', category: 'box', unit: 'each', notes: '18×18×16 in' },
        { name: 'Box 20x14x14', category: 'box', unit: 'each', notes: '20×14×14 in' },
        { name: 'Box 20x16x12', category: 'box', unit: 'each', notes: '20×16×12 in' },
        { name: 'Box 20x20x20', category: 'box', unit: 'each', notes: '20×20×20 in' },
        { name: 'Box 24x18x18', category: 'box', unit: 'each', notes: '24×18×18 in' },
        { name: 'Box 24x24x24', category: 'box', unit: 'each', notes: '24×24×24 in' },
        { name: 'FedEx Small Box', category: 'box', unit: 'each', notes: '10.875×1.5×12.375 in' },
        { name: 'FedEx Medium Box (Top Load)', category: 'box', unit: 'each', notes: '11.5×2.375×13.25 in' },
        { name: 'FedEx Large Box', category: 'box', unit: 'each', notes: '12.375×3×17.5 in' },
        { name: 'FedEx Extra Large Box', category: 'box', unit: 'each', notes: '11.875×10.75×11 in' },
        { name: 'UPS Small Box', category: 'box', unit: 'each', notes: '13×11×2 in' },
        { name: 'UPS Medium Box', category: 'box', unit: 'each', notes: '15×11×3 in' },
        { name: 'UPS Large Box', category: 'box', unit: 'each', notes: '17×12×3.5 in' },
        { name: 'USPS Priority Mail Small Flat Rate Box', category: 'box', unit: 'each', notes: '8.625×5.375×1.625 in' },
        { name: 'USPS Priority Mail Medium Flat Rate Box', category: 'box', unit: 'each', notes: '11×8.5×5.5 in' },
        { name: 'USPS Priority Mail Large Flat Rate Box', category: 'box', unit: 'each', notes: '12.25×12.25×6 in' },
        // ── Pallets ──
        { name: 'GMA Standard Pallet (48x40)', category: 'pallet', unit: 'each', notes: '48×40 in — most common North American pallet' },
        { name: 'GMA Standard Pallet - Heat Treated (48x40)', category: 'pallet', unit: 'each', notes: '48×40 in — ISPM 15 heat treated, required for international shipments' },
        { name: 'Half Pallet (48x20)', category: 'pallet', unit: 'each', notes: '48×20 in' },
        { name: 'Quarter Pallet (24x20)', category: 'pallet', unit: 'each', notes: '24×20 in' },
        { name: 'Euro Pallet (47x31.5)', category: 'pallet', unit: 'each', notes: '1200×800 mm / 47×31.5 in' },
        { name: 'Chep Pallet (48x40)', category: 'pallet', unit: 'each', notes: '48×40 in — blue CHEP rental pallet' },
        { name: 'Plastic Pallet (48x40)', category: 'pallet', unit: 'each', notes: '48×40 in' },
        { name: 'Display Pallet (24x24)', category: 'pallet', unit: 'each', notes: '24×24 in — retail display' },
      ];

      const existing = await listPackagingInventory(input.configId);
      const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));

      let inserted = 0;
      let skipped = 0;
      for (const t of STANDARD_TYPES) {
        if (existingNames.has(t.name.toLowerCase())) { skipped++; continue; }
        await upsertPackagingInventoryItem({
          configId: input.configId,
          facilityId: input.facilityId,
          name: t.name,
          category: t.category,
          unit: t.unit,
          onHandQty: 0,
          minStockLevel: 0,
           weeklyConsumption: 0,
          notes: t.notes ?? null,
        } as any);
        inserted++;
      }
      return { inserted, skipped, total: STANDARD_TYPES.length };
    }),

  // ── Printer Config (multi-printer + WebSocket bridge) ────────────────────
  /** Get all printer configs and bridge port from small_parcel_settings */
  getPrinterConfig: protectedProcedure.query(async () => {
    const [ip, port, name1, ip2, port2, name2, bridgePort] = await Promise.all([
      getSmallParcelSetting("printer_ip"),
      getSmallParcelSetting("printer_port"),
      getSmallParcelSetting("printer1_name"),
      getSmallParcelSetting("printer2_ip"),
      getSmallParcelSetting("printer2_port"),
      getSmallParcelSetting("printer2_name"),
      getSmallParcelSetting("bridge_port"),
    ]);
    return {
      // Printer 1 (primary — Zebra ZT610)
      printerIp:   ip ?? "",
      printerPort: port ? parseInt(port, 10) : 9100,
      printerName: name1 ?? "Zebra ZT610",
      // Printer 2 (secondary — Zebra ZT411)
      printer2Ip:   ip2 ?? "",
      printer2Port: port2 ? parseInt(port2, 10) : 9100,
      printer2Name: name2 ?? "Zebra ZT411",
      /** Local WebSocket bridge port (zpl-bridge.js running on warehouse Mac) */
      bridgePort: bridgePort ? parseInt(bridgePort, 10) : 9101,
    };
  }),
  /** Save all printer configs and bridge port to small_parcel_settings */
  setPrinterConfig: protectedProcedure
    .input(z.object({
      printerIp:    z.string(),
      printerPort:  z.number().int().min(1).max(65535).default(9100),
      printerName:  z.string().default("Zebra ZT610"),
      printer2Ip:   z.string().default(""),
      printer2Port: z.number().int().min(1).max(65535).default(9100),
      printer2Name: z.string().default("Zebra ZT411"),
      /** Local WebSocket bridge port (default 9101) */
      bridgePort: z.number().int().min(1).max(65535).default(9101),
    }))
    .mutation(async ({ input }) => {
      await Promise.all([
        setSmallParcelSetting("printer_ip",    input.printerIp),
        setSmallParcelSetting("printer_port",  String(input.printerPort)),
        setSmallParcelSetting("printer1_name", input.printerName),
        setSmallParcelSetting("printer2_ip",   input.printer2Ip),
        setSmallParcelSetting("printer2_port", String(input.printer2Port)),
        setSmallParcelSetting("printer2_name", input.printer2Name),
        setSmallParcelSetting("bridge_port",   String(input.bridgePort)),
      ]);
      return { success: true };
    }),

  /**
   * Send a raw ZPL string directly to the configured Zebra network printer
   * via a TCP socket on the server. This bypasses the need for Zebra BrowserPrint
   * on the client workstation.
   */
  sendZpl: protectedProcedure
    .input(z.object({
      zpl: z.string().min(1),
      /** Override printer IP — falls back to small_parcel_settings if omitted */
      printerIp: z.string().optional(),
      /** Override printer port — falls back to small_parcel_settings if omitted */
      printerPort: z.number().int().min(1).max(65535).optional(),
    }))
    .mutation(async ({ input }) => {
      const net = await import("net");
      // Resolve printer IP/port: input override > DB setting > error
      let printerIp = input.printerIp;
      let printerPort = input.printerPort ?? 9100;
      if (!printerIp) {
        const [storedIp, storedPort] = await Promise.all([
          getSmallParcelSetting("printer_ip"),
          getSmallParcelSetting("printer_port"),
        ]);
        printerIp = storedIp ?? "";
        if (storedPort) printerPort = parseInt(storedPort, 10);
      }
      if (!printerIp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No printer IP configured. Go to Small Parcel → Printer Settings to set up your Zebra printer.",
        });
      }
      const zplBuffer = Buffer.from(input.zpl, "utf-8");
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error(`Printer connection timed out after 8s (${printerIp}:${printerPort})`));
        }, 8000);
        socket.connect(printerPort, printerIp!, () => {
          socket.write(zplBuffer, () => {
            clearTimeout(timeout);
            socket.end();
            resolve();
          });
        });
        socket.on("error", (err: Error) => {
          clearTimeout(timeout);
          reject(new Error(`Printer error (${printerIp}:${printerPort}): ${err.message}`));
        });
      });
      return { success: true, printerIp, printerPort };
    }),
});
// Re-export appRouter augmented with all feature routers including SLA
const techshipRouter = router({
  list: protectedProcedure.query(async () => {
    const configs = await listTechshipConfigs();
    return configs.map((c) => ({
      ...c,
      // mask the secret for display — only show last 4 chars
      apiSecretMasked: c.apiSecret ? `${'*'.repeat(Math.max(0, c.apiSecret.length - 4))}${c.apiSecret.slice(-4)}` : '',
    }));
  }),
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      return getTechshipConfig(input.id);
    }),
  save: protectedProcedure
    .input(z.object({
      id: z.number().int().optional(),
      locationName: z.string().min(1),
      baseUrl: z.string().url(),
      apiKey: z.string().min(1),
      apiSecret: z.string().min(1),
      isActive: z.boolean().default(true),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await upsertTechshipConfig(data, id);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteTechshipConfig(input.id);
      return { success: true };
    }),
  testConnection: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const cfg = await getTechshipConfig(input.id);
      if (!cfg) throw new TRPCError({ code: 'NOT_FOUND', message: 'TechShip config not found' });
      try {
        const url = `${cfg.baseUrl.replace(/\/$/, '')}/api/v1/ping`;
        const resp = await fetch(url, {
          headers: { 'X-API-KEY': cfg.apiKey, 'X-API-SECRET': cfg.apiSecret, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          return { success: true, message: `Connected to ${cfg.locationName} (HTTP ${resp.status})` };
        } else {
          const body = await resp.text().catch(() => '');
          return { success: false, message: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: msg };
      }
    }),
});

const shippingIntegrationRouter = router({
  getSettings: protectedProcedure.query(async () => {
    const [ltl, sp] = await Promise.all([
      getActiveShippingIntegration('ltl'),
      getActiveShippingIntegration('small_parcel'),
    ]);
    return { ltl: ltl ?? 'shipwell', small_parcel: sp ?? 'techship' };
  }),
  setActive: protectedProcedure
    .input(z.object({
      category: z.enum(['ltl', 'small_parcel']),
      integration: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      await setActiveShippingIntegration(input.category, input.integration);
      return { success: true };
    }),
});

// ─── Rate Wizard Router ───────────────────────────────────────────────────────
const CARRIER_LABELS: Record<string, string> = {
  usps: "USPS",
  fedex: "FedEx",
  ups: "UPS",
  ontrac: "OnTrac",
  dhl_express: "DHL Express",
  canpar: "Canpar",
  purolator: "Purolator",
  canada_post: "Canada Post",
  gls_canada: "GLS Canada",
  other: "Other",
};

const rateWizardRouter = router({
  // ── Carrier Accounts ──────────────────────────────────────────────────────
  listCarrierAccounts: protectedProcedure
    .input(z.object({ locationId: z.string().optional() }))
    .query(async ({ input }) => {
      const accounts = await listCarrierAccounts(input.locationId);
      // Mask credentials — never return raw API keys to the frontend
      return accounts.map((a) => ({
        ...a,
        credentials: "••••••••",
        carrierLabel: CARRIER_LABELS[a.carrierCode] ?? a.carrierCode,
      }));
    }),

  getCarrierAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const a = await getCarrierAccount(input.id);
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...a, credentials: "••••••••", carrierLabel: CARRIER_LABELS[a.carrierCode] ?? a.carrierCode };
    }),

  upsertCarrierAccount: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        locationId: z.string().min(1),
        country: z.string().length(2).default("US"),
        carrierCode: z.string().min(1),
        credentials: z.string().optional(), // raw JSON — only update if provided and not masked
        originName: z.string().optional(),
        originAddress1: z.string().optional(),
        originCity: z.string().optional(),
        originState: z.string().optional(),
        originPostal: z.string().optional(),
        originCountry: z.string().optional(),
        isActive: z.boolean().default(true),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, credentials, ...rest } = input;
      // If credentials is masked or empty, fetch existing and keep them
      let finalCredentials = credentials ?? "{}";
      if (id && (!credentials || credentials.includes("•"))) {
        const existing = await getCarrierAccount(id);
        finalCredentials = existing?.credentials ?? "{}";
      }
      const saved = await upsertCarrierAccount({ ...rest, credentials: finalCredentials, id });
      return { ...saved, credentials: "••••••••", carrierLabel: CARRIER_LABELS[saved.carrierCode] ?? saved.carrierCode };
    }),

  deleteCarrierAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteCarrierAccount(input.id);
      return { success: true };
    }),

  // ── Seed default carrier accounts from environment credentials ────────────
  seedDefaultCarrierAccounts: protectedProcedure
    .input(z.object({ locationId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      type CarrierSeed = { carrierCode: string; name: string; credentialJson: string };
      const seeds: CarrierSeed[] = [];

      if (process.env.USPS_EHUB_API_KEY) {
        seeds.push({
          carrierCode: "usps",
          name: "USPS (eHub)",
          credentialJson: JSON.stringify({ apiKey: process.env.USPS_EHUB_API_KEY }),
        });
      }
      if (process.env.FEDEX_USER_KEY && process.env.FEDEX_PASSWORD) {
        seeds.push({
          carrierCode: "fedex",
          name: "FedEx",
          credentialJson: JSON.stringify({ userKey: process.env.FEDEX_USER_KEY, password: process.env.FEDEX_PASSWORD }),
        });
      }
      if (process.env.UPS_REST_TOKEN) {
        seeds.push({
          carrierCode: "ups",
          name: "UPS",
          credentialJson: JSON.stringify({ accessToken: process.env.UPS_REST_TOKEN }),
        });
      }
      if (process.env.ONTRAC_ACCOUNT && process.env.ONTRAC_PASSWORD) {
        seeds.push({
          carrierCode: "ontrac",
          name: "OnTrac",
          credentialJson: JSON.stringify({ account: process.env.ONTRAC_ACCOUNT, password: process.env.ONTRAC_PASSWORD }),
        });
      }
      if (process.env.DHL_USER_KEY && process.env.DHL_PASSWORD) {
        seeds.push({
          carrierCode: "dhl",
          name: "DHL",
          credentialJson: JSON.stringify({ userKey: process.env.DHL_USER_KEY, password: process.env.DHL_PASSWORD }),
        });
      }

      if (seeds.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No carrier credentials found in environment" });
      }

      // Only insert carriers that don't already exist for this location
      const existing = await listCarrierAccounts(input.locationId);
      const existingCodes = new Set(existing.map((a) => a.carrierCode));
      const toInsert = seeds.filter((s) => !existingCodes.has(s.carrierCode));

      const created: string[] = [];
      for (const seed of toInsert) {
        await upsertCarrierAccount({
          carrierCode: seed.carrierCode,
          name: seed.name,
          locationId: input.locationId,
          country: "US",
          credentials: seed.credentialJson,
          isActive: true,
          notes: "Auto-seeded from environment credentials. Please update the origin address.",
        });
        created.push(seed.name);
      }

      return {
        created,
        skipped: seeds.filter((s) => existingCodes.has(s.carrierCode)).map((s) => s.name),
        message: created.length > 0
          ? `Created ${created.length} carrier account(s): ${created.join(", ")}. Please update the origin address for each.`
          : "All carrier accounts already exist for this location.",
      };
    }),

  // ── Customer Shipping Rules ────────────────────────────────────────────────
  listCustomerShippingRules: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .query(async ({ input }) => listCustomerShippingRules(input.configId)),

  upsertCustomerShippingRule: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        configId: z.number(),
        customerId: z.number(),
        customerName: z.string(),
        integration: z.enum(["rate_wizard", "veeqo", "techship"]).default("rate_wizard"),
        preferredCarrier: z.string().optional(),
        maxTransitDays: z.number().optional(),
        excludedCarriers: z.string().optional(), // JSON array string
        defaultFreightClass: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => upsertCustomerShippingRule(input)),

  /** Return the default freight class for a customer (by Extensiv customerId), or null if not set. */
  getFreightClassForCustomer: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const rule = await getCustomerShippingRuleByCustomerId(input.customerId);
      return { freightClass: rule?.defaultFreightClass ?? null };
    }),

  deleteCustomerShippingRule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteCustomerShippingRule(input.id);
      return { success: true };
    }),

  // ── Shipment History ──────────────────────────────────────────────────────
  listShipments: protectedProcedure
    .input(z.object({ configId: z.number(), limit: z.number().default(100) }))
    .query(async ({ input }) => listRateWizardShipments(input.configId, input.limit)),

  // ── Rate Shopping ─────────────────────────────────────────────────────────
  getRates: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        orderId: z.number().optional(),
        orderNumber: z.string().optional(),
        locationId: z.string(),
        customerId: z.number().optional(),
        customerName: z.string().optional(),
        weightLbs: z.number(),
        lengthIn: z.number(),
        widthIn: z.number(),
        heightIn: z.number(),
        destPostal: z.string(),
        destCountry: z.string().default("US"),
        destAddress1: z.string().optional(),
        destCity: z.string().optional(),
        destState: z.string().optional(),
        destName: z.string().optional(),
        isResidential: z.boolean().default(false),
        declaredValue: z.number().optional(),
        requireSignature: z.boolean().default(false),
        // Amazon-specific fields (for is_amazon_order Veeqo rate shopping)
        amazonOrderId: z.string().optional(),   // e.g. "114-1234567-1234567"
        channelName: z.string().optional(),      // e.g. "amazon"
        orderItems: z.array(z.object({
          sku: z.string(),
          qty: z.number(),
          asin: z.string().optional(),
          unitValue: z.number().optional(),
          currency: z.string().optional(),
        })).optional(),
      })
    )
     .query(async ({ input }) => {
      // ── Hard gate: read the active small_parcel integration ─────────────────
      // This is the ONLY routing decision. No fallthrough between integrations.
      const activeIntegration = (await getActiveShippingIntegration('small_parcel')) ?? 'rate_wizard';
      // Fetch per-carrier markup percentages from OpFi (cached 5 min per client)
      const opfiMarkups = await getCarrierMarkups(input.customerId ?? 0);
      // Customer routing rule (for preferred carrier / excluded carriers / max transit days)
      let customerRule: Awaited<ReturnType<typeof listCustomerShippingRules>>[number] | null = null;
      if (input.customerId && input.configId) {
        const rules = await listCustomerShippingRules(input.configId);
        customerRule = rules.find((r) => r.customerId === input.customerId) ?? null;
      }
      const integration = activeIntegration;
      const preferredCarrier = customerRule?.preferredCarrier ?? null;
      const excludedCarriers: string[] = (() => {
        try { return JSON.parse(customerRule?.excludedCarriers ?? "[]"); } catch { return []; }
      })();
      const maxTransitDays = customerRule?.maxTransitDays ?? null;

      // Active carrier accounts for this location
      const accounts = await listCarrierAccounts(input.locationId);
      const activeAccounts = accounts.filter((a) => a.isActive && !excludedCarriers.includes(a.carrierCode));

      // ── Rate fetching: Veeqo Rate Shopping API (live) or mock fallback ────────
      type RateResult = {
        rateId: string; carrierCode: string; carrierName: string; service: string;
        serviceCode: string;
        transitDays: number; totalCost: number; currency: string;
        isPreferred: boolean; isCheapest: boolean; isFastest: boolean;
        surcharges: Array<{ label: string; amount: number }>;
        isMock: boolean; hasCredentials: boolean;
        // Veeqo Rate Shopping API tokens (needed to book the label)
        remoteShipmentId?: string;
        requestToken?: string;
      };
       const rates: RateResult[] = [];
      // ── STRICT INTEGRATION GATE ──────────────────────────────────────────────────────
      // Only the ACTIVE integration is called. No fallthrough between systems.
      // activeIntegration: 'rate_wizard' | 'veeqo' | 'techship'
      // Veeqo credentials (only used when activeIntegration === 'veeqo')
      const veeqoApiKey = activeIntegration === 'veeqo' ? process.env.VEEQO_API_KEY : undefined;
      const veeqoConfigIds: number[] = [];
      if (activeIntegration === 'veeqo') {
        for (const account of activeAccounts) {
          try {
            const creds = JSON.parse(account.credentials ?? "{}");
            if (creds.shipping_configuration_id) {
              veeqoConfigIds.push(Number(creds.shipping_configuration_id));
            }
          } catch { /* skip */ }
        }
      }
      // shipping_configuration_ids is optional in the new Rate Shopping API — just need the API key
      const hasVeeqoCredentials = activeIntegration === 'veeqo' && !!veeqoApiKey;

      if (hasVeeqoCredentials && input.destPostal) {
        // ── Live Veeqo Rate Shopping ──────────────────────────────────────────
        try {
          const veeqo = createVeeqoClient();

          // Build origin address from the first active account that has origin info
          const originAccount = activeAccounts.find((a) => a.originAddress1 && a.originPostal);
          const shipFrom: VeeqoAddress = {
            name: originAccount?.originName ?? "Go Direct Solutions",
            address_line1: originAccount?.originAddress1 ?? "123 Warehouse Dr",
            city: originAccount?.originCity ?? "",
            state_or_region: originAccount?.originState ?? "",
            postal_code: originAccount?.originPostal ?? "",
            country_code: originAccount?.originCountry ?? (input.destCountry === "CA" ? "CA" : "US"),
          };

          const shipTo: VeeqoAddress = {
            name: input.destName ?? input.destCity ?? "Recipient",
            address_line1: input.destAddress1 ?? "",
            city: input.destCity ?? "",
            state_or_region: input.destState ?? "",
            postal_code: input.destPostal,
            country_code: input.destCountry,
          };

          // Detect Amazon orders: referenceNum matches Amazon order ID pattern (###-#######-#######)
          // or caller explicitly passes amazonOrderId / channelName
          const AMAZON_ORDER_PATTERN = /^\d{3}-\d{7}-\d{7}$/;
          const isAmazonOrder = !!(input.amazonOrderId ||
            (input.orderNumber && AMAZON_ORDER_PATTERN.test(input.orderNumber)) ||
            input.channelName?.toLowerCase().includes("amazon"));
          const amazonOrderId = input.amazonOrderId ??
            (input.orderNumber && AMAZON_ORDER_PATTERN.test(input.orderNumber) ? input.orderNumber : undefined);

          // Build channel_items for Amazon orders — one entry per order item
          const channelItems = isAmazonOrder && input.orderItems?.length
            ? input.orderItems.map((item) => ({
                remote_id: amazonOrderId ?? input.orderNumber ?? "unknown",
                quantity: item.qty,
                asin: item.asin,
                value: item.unitValue != null ? String(item.unitValue) : undefined,
                currency_code: item.currency ?? "USD",
              }))
            : undefined;

          const ratesResp = await veeqo.getRates({
            from_address: shipFrom,
            to_address: shipTo,
            parcels: [{
              weight: lbsToOz(input.weightLbs),
              weight_unit: "oz",
              length: input.lengthIn,
              width: input.widthIn,
              height: input.heightIn,
              dimension_unit: "in",
            }],
            shipping_configuration_ids: veeqoConfigIds.map(String),
            ...(isAmazonOrder ? { is_amazon_order: true } : {}),
            ...(channelItems ? { channel_items: channelItems } : {}),
          });

          if (isAmazonOrder) {
            console.log(`[RateWizard] Amazon order detected (${amazonOrderId ?? input.orderNumber}) — is_amazon_order=true, channel_items=${channelItems?.length ?? 0}`);
          }

          // In the new API, remote_shipment_id and request_token are top-level (not per-quote)
          const remoteShipmentId = ratesResp.remote_shipment_id;
          const requestToken = ratesResp.request_token;

          for (const vRate of ratesResp.quotes) {
            const rawCost = parseFloat(vRate.total_net_charge);
            if (!isFinite(rawCost)) continue;

            // Estimate transit days from delivery_date if provided
            let transitDays = 99;
            if (vRate.delivery_date) {
              const diffMs = new Date(vRate.delivery_date).getTime() - Date.now();
              if (diffMs > 0) transitDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            }
            if (maxTransitDays !== null && transitDays > maxTransitDays) continue;

            // Determine carrier code from carrier field
            const carrierCode = vRate.carrier ?? "other";
            if (excludedCarriers.includes(carrierCode)) continue;

            const totalCost = applyMarkup(rawCost, getMarkupPct(CARRIER_LABELS[carrierCode] ?? carrierCode, opfiMarkups));
            const surcharges: Array<{ label: string; amount: number }> = vRate.charges
              .filter((c) => c.chargeType === "OPTIONAL" && c.value > 0)
              .map((c) => ({ label: c.chargeId, amount: c.value }));

            rates.push({
              rateId: vRate.code,
              carrierCode,
              carrierName: CARRIER_LABELS[carrierCode] ?? vRate.carrier_nice_name ?? carrierCode,
              service: vRate.title,
              serviceCode: vRate.code,
              transitDays,
              totalCost,
              currency: vRate.currency_code ?? (input.destCountry === "CA" ? "CAD" : "USD"),
              isPreferred: preferredCarrier === carrierCode,
              isCheapest: false,
              isFastest: false,
              surcharges,
              isMock: false,
              hasCredentials: true,
              remoteShipmentId,
              requestToken,
            });
          }

          console.log(`[RateWizard] Veeqo live rates: ${rates.length} rates for ${input.destPostal}`);
        } catch (err) {
          console.error(`[RateWizard] Veeqo getRates error:`, err);
          // Fall through to mock data if Veeqo API fails
        }
      }

      // ── Direct Carrier Rate Fetchers (Rate Wizard only) ────────────────────────
      // ONLY runs when activeIntegration === 'rate_wizard'. Never mixes with Veeqo.
      if (activeIntegration === 'rate_wizard' && input.destPostal) {
        const originAccount = activeAccounts.find((a) => a.originAddress1 && a.originPostal);
        const carrierInput: CarrierRateInput = {
          originName: originAccount?.originName ?? "Go Direct Solutions",
          originAddress1: originAccount?.originAddress1 ?? "",
          originCity: originAccount?.originCity ?? "",
          originState: originAccount?.originState ?? "",
          originPostal: originAccount?.originPostal ?? "",
          originCountry: originAccount?.originCountry ?? "US",
          destName: input.destName,
          destAddress1: input.destAddress1,
          destCity: input.destCity,
          destState: input.destState,
          destPostal: input.destPostal,
          destCountry: input.destCountry,
          isResidential: input.isResidential,
          weightLbs: input.weightLbs,
          lengthIn: input.lengthIn,
          widthIn: input.widthIn,
          heightIn: input.heightIn,
          declaredValue: input.declaredValue,
          requireSignature: input.requireSignature,
        };

        try {
          const directRates = await fetchAllCarrierRates(carrierInput);
          // Track which carrier codes already have Veeqo rates
          const veeqoCarrierCodes = new Set(rates.map((r) => r.carrierCode));

          for (const dr of directRates) {
            // Skip if excluded by customer rule
            if (excludedCarriers.includes(dr.carrierCode)) continue;
            // Skip if transit days exceed customer rule
            if (maxTransitDays !== null && dr.transitDays > maxTransitDays) continue;
            // Skip if Veeqo already returned rates for this carrier (avoid duplicates)
            if (veeqoCarrierCodes.has(dr.carrierCode)) continue;

            const totalCost = applyMarkup(dr.totalCost, getMarkupPct(dr.carrierName, opfiMarkups));

            rates.push({
              rateId: dr.rateId,
              carrierCode: dr.carrierCode,
              carrierName: dr.carrierName,
              service: dr.service,
              serviceCode: dr.serviceCode ?? "",
              transitDays: dr.transitDays,
              totalCost,
              currency: dr.currency,
              isPreferred: preferredCarrier === dr.carrierCode,
              isCheapest: false,
              isFastest: false,
              surcharges: dr.surcharges,
              isMock: false,
              hasCredentials: true,
              // Direct carrier rates don't use Veeqo booking tokens
              remoteShipmentId: undefined,
              requestToken: undefined,
            });
          }

          if (directRates.length > 0) {
            console.log(`[RateWizard] Direct carrier rates: ${directRates.length} rates merged for ${input.destPostal}`);
          }
        } catch (err) {
          console.error(`[RateWizard] Direct carrier fetch error:`, err);
        }
      }

      // ── Mock fallback (Rate Wizard only, when no live credentials available) ────
      if (rates.length === 0 && activeIntegration === 'rate_wizard') {
        const MOCK_SERVICES: Record<string, Array<{ service: string; transitDays: number; baseCost: number }>> = {
          usps: [
            { service: "Priority Mail", transitDays: 2, baseCost: 8.5 },
            { service: "Priority Mail Express", transitDays: 1, baseCost: 24.9 },
            { service: "Ground Advantage", transitDays: 4, baseCost: 5.8 },
          ],
          fedex: [
            { service: "FedEx Ground", transitDays: 4, baseCost: 9.2 },
            { service: "FedEx Express Saver", transitDays: 3, baseCost: 18.4 },
            { service: "FedEx 2Day", transitDays: 2, baseCost: 26.1 },
            { service: "FedEx Overnight", transitDays: 1, baseCost: 48.7 },
          ],
          ups: [
            { service: "UPS Ground", transitDays: 4, baseCost: 9.6 },
            { service: "UPS 3 Day Select", transitDays: 3, baseCost: 19.2 },
            { service: "UPS 2nd Day Air", transitDays: 2, baseCost: 28.5 },
            { service: "UPS Next Day Air", transitDays: 1, baseCost: 52.3 },
          ],
          ontrac: [
            { service: "OnTrac Ground", transitDays: 3, baseCost: 7.8 },
            { service: "OnTrac Sunrise", transitDays: 1, baseCost: 22.4 },
          ],
          dhl_express: [
            { service: "DHL Express Worldwide", transitDays: 2, baseCost: 32.6 },
            { service: "DHL Express 12:00", transitDays: 1, baseCost: 44.1 },
          ],
          canpar: [
            { service: "Canpar Ground", transitDays: 4, baseCost: 11.2 },
            { service: "Canpar Express", transitDays: 2, baseCost: 19.8 },
          ],
          purolator: [
            { service: "Purolator Ground", transitDays: 4, baseCost: 12.1 },
            { service: "Purolator Express", transitDays: 2, baseCost: 22.5 },
            { service: "Purolator Express 9AM", transitDays: 1, baseCost: 38.9 },
          ],
          canada_post: [
            { service: "Regular Parcel", transitDays: 5, baseCost: 9.4 },
            { service: "Expedited Parcel", transitDays: 3, baseCost: 14.6 },
            { service: "Xpresspost", transitDays: 2, baseCost: 22.3 },
            { service: "Priority", transitDays: 1, baseCost: 36.8 },
          ],
          gls_canada: [
            { service: "GLS Parcel", transitDays: 4, baseCost: 10.5 },
          ],
        };

        const dimWeight = (input.lengthIn * input.widthIn * input.heightIn) / 139;
        const billableWeight = Math.max(input.weightLbs, dimWeight);
        const weightMultiplier = Math.max(1, billableWeight / 5);
        const residentialSurcharge = input.isResidential ? 4.9 : 0;
        const signatureSurcharge = input.requireSignature ? 5.0 : 0;

        for (const account of activeAccounts) {
          const services = MOCK_SERVICES[account.carrierCode];
          if (!services) continue;
          let hasCredentials = false;
          try {
            const creds = JSON.parse(account.credentials ?? "{}");
            hasCredentials = Object.keys(creds).length > 0;
          } catch { hasCredentials = false; }

          for (const svc of services) {
            if (maxTransitDays !== null && svc.transitDays > maxTransitDays) continue;
            const surcharges: Array<{ label: string; amount: number }> = [];
            if (residentialSurcharge > 0) surcharges.push({ label: "Residential", amount: residentialSurcharge });
            if (signatureSurcharge > 0) surcharges.push({ label: "Signature", amount: signatureSurcharge });
            const rawCost = svc.baseCost * weightMultiplier + surcharges.reduce((s, x) => s + x.amount, 0);
            const totalCost = applyMarkup(rawCost, getMarkupPct(CARRIER_LABELS[account.carrierCode] ?? account.carrierCode, opfiMarkups));
            rates.push({
              rateId: `${account.carrierCode}_${svc.service.replace(/\s+/g, "_").toLowerCase()}_mock`,
              carrierCode: account.carrierCode,
              carrierName: CARRIER_LABELS[account.carrierCode] ?? account.carrierCode,
              service: svc.service,
              serviceCode: "",
              transitDays: svc.transitDays,
              totalCost,
              currency: input.destCountry === "CA" ? "CAD" : "USD",
              isPreferred: preferredCarrier === account.carrierCode,
              isCheapest: false,
              isFastest: false,
              surcharges,
              isMock: !hasCredentials,
              hasCredentials,
            });
          }
        }
      }

      if (rates.length > 0) {
        const minCost = Math.min(...rates.map((r) => r.totalCost));
        const minTransit = Math.min(...rates.map((r) => r.transitDays));
        rates.forEach((r) => {
          r.isCheapest = r.totalCost === minCost;
          r.isFastest = r.transitDays === minTransit;
        });
      }

      rates.sort((a, b) => {
        if (a.isPreferred && !b.isPreferred) return -1;
        if (!a.isPreferred && b.isPreferred) return 1;
        return a.totalCost - b.totalCost;
      });

      // Auto-select: preferred carrier first, then cheapest SLA-compliant rate, then absolute cheapest
      const autoSelected = (() => {
        const preferred = rates.find((r) => r.isPreferred);
        if (preferred) return preferred;
        if (maxTransitDays !== null) {
          const slaCompliant = rates.filter((r) => r.transitDays <= maxTransitDays);
          if (slaCompliant.length > 0) {
            return slaCompliant.reduce((a, b) => a.totalCost <= b.totalCost ? a : b);
          }
        }
        return rates.find((r) => r.isCheapest) ?? null;
      })();

      return {
        rates,
        integration,
        customerRule: customerRule
          ? { integration: customerRule.integration, preferredCarrier: customerRule.preferredCarrier, maxTransitDays: customerRule.maxTransitDays }
          : null,
        autoSelectedRateId: autoSelected?.rateId ?? null,
        isMockData: rates.length > 0 && rates.every((r) => r.isMock),
        activeCarrierCount: activeAccounts.length,
      };
    }),

  confirmRate: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        /** Small-parcel session ID — stored so purchaseLabel can look up the rate even when extensivOrderId is null */
        sessionId: z.number().optional(),
        orderId: z.number().optional(),
        orderNumber: z.string().optional(),
        locationId: z.string(),
        customerId: z.number().optional(),
        customerName: z.string().optional(),
        rateId: z.string(),
        /** The carrier-native service code (e.g. FEDEX_2_DAY_ONE_RATE). Preferred over rateId for label purchase. */
        serviceCode: z.string().optional(),
        carrierCode: z.string(),
        carrierName: z.string(),
        service: z.string(),
        transitDays: z.number(),
        totalCost: z.number(),
        currency: z.string(),
        weightLbs: z.number(),
        destPostal: z.string(),
        destCountry: z.string(),
        isMock: z.boolean(),
        // Veeqo Rate Shopping API tokens (present when live rates were fetched)
        remoteShipmentId: z.string().optional(),
        requestToken: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const shipment = await createRateWizardShipment({
        configId: input.configId,
        sessionId: input.sessionId,
        orderId: input.orderId ? String(input.orderId) : undefined,
        locationId: input.locationId,
        customerId: input.customerId,
        customerName: input.customerName,
        carrierCode: input.carrierCode,
        // Prefer the explicit serviceCode (carrier-native) over rateId (may have carrier prefix)
        serviceCode: input.serviceCode ?? input.rateId,
        serviceName: `${input.carrierName} ${input.service}`,
        transitDays: input.transitDays,
        rateAmountCents: Math.round(input.totalCost * 100),
        currency: input.currency,
        weightOz: Math.round(input.weightLbs * 16),
        status: input.isMock ? "rated" : "confirmed", // 'confirmed' for real rates so purchaseLabel can find them
        bookedByUserId: typeof ctx.user.id === "number" ? ctx.user.id : undefined,
        bookedByName: ctx.user.name ?? ctx.user.email,
        remoteShipmentId: input.remoteShipmentId,
        requestToken: input.requestToken,
      });
      return { success: true, shipmentId: shipment.id, isMock: input.isMock };
    }),

  // ── Carrier Metadata ──────────────────────────────────────────────────────
  getCarrierOptions: publicProcedure.query(() => {
    const US_CARRIERS = ["usps", "fedex", "ups", "ontrac", "dhl_express", "other"];
    const CA_CARRIERS = ["fedex", "ups", "dhl_express", "canpar", "purolator", "canada_post", "gls_canada", "other"];
    return {
      us: US_CARRIERS.map((c) => ({ code: c, label: CARRIER_LABELS[c] ?? c })),
      ca: CA_CARRIERS.map((c) => ({ code: c, label: CARRIER_LABELS[c] ?? c })),
      all: Object.entries(CARRIER_LABELS).map(([code, label]) => ({ code, label })),
    };
  }),

  /** Returns live connection status for each direct carrier API */
  getCarrierStatus: protectedProcedure.query(() => {
    return getCarrierConnectionStatus();
  }),


  // ── Routing Table Lookup ─────────────────────────────────────────────────
  // Given a warehouse + destination ZIP, returns the pre-computed priority routes
  // from the carrier routing table (e.g. Threshold 2-day guide).
  lookupRoute: protectedProcedure
    .input(z.object({
      warehouse: z.string(),
      destPostal: z.string(),
      clientName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const zipInt = parseInt(input.destPostal.replace(/\D/g, "").slice(0, 5), 10);
      if (isNaN(zipInt)) return [];

      // Carrier name → carrierCode mapping
      const carrierCodeMap: Record<string, string> = {
        "FEDEX": "fedex",
        "FEDEX ONE RATE": "fedex",
        "UPS": "ups",
        "Ontrac": "ontrac",
        "USPS": "usps",
        "DHL": "dhl",
      };
      // Service level → Rate Wizard service code mapping
      const serviceCodeMap: Record<string, string> = {
        "Two Day One Rate": "FEDEX_2_DAY_ONE_RATE",
        "Ground": "GROUND_HOME_DELIVERY",
        "Ontrac Ground Service": "ONTRAC_GROUND",
      };

      const { eq, and, or, isNull, asc } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(carrierRoutingTable)
        .where(
          and(
            eq(carrierRoutingTable.zipCode, zipInt),
            eq(carrierRoutingTable.warehouse, input.warehouse),
            or(
              eq(carrierRoutingTable.clientName, input.clientName ?? ""),
              isNull(carrierRoutingTable.clientName)
            )
          )
        )
        .orderBy(asc(carrierRoutingTable.priority))
        .limit(10);

      return rows.map(r => ({
        warehouse: r.warehouse,
        carrier: r.carrier,
        carrierCode: carrierCodeMap[r.carrier] ?? r.carrier.toLowerCase(),
        serviceLevel: r.serviceLevel ?? "",
        serviceCode: serviceCodeMap[r.serviceLevel ?? ""] ?? "",
        zipCode: r.zipCode,
        cost: r.cost ? parseFloat(r.cost) : null,
        priority: r.priority,
        clientName: r.clientName,
        isRecommended: r.priority === "A",
      }));
    }),
});
// ─── Shipping History Router ─────────────────────────────────────────────────
const shippingHistoryRouter = router({
  /** List unified shipments with optional filters and pagination */
  list: protectedProcedure
    .input(z.object({
      platform: z.enum(["veeqo", "techship", "shipwell", "manual"]).optional(),
      facilityName: z.string().optional(),
      customerId: z.number().optional(),
      orderNumber: z.string().optional(),
      trackingNumber: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const [rows, total] = await Promise.all([
        listShipmentsUnified(input),
        countShipmentsUnified(input),
      ]);
      return { rows, total };
    }),

  /** Get a single shipment by ID */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const row = await getShipmentById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  /** Manually record a tracking number from any platform */
  recordManual: protectedProcedure
    .input(z.object({
      platform: z.enum(["veeqo", "techship", "shipwell", "manual"]).default("manual"),
      mode: z.enum(["small_parcel", "ltl", "ftl", "other"]).default("small_parcel"),
      orderNumber: z.string().optional(),
      customerName: z.string().optional(),
      facilityName: z.string().optional(),
      shipToName: z.string().optional(),
      shipToCity: z.string().optional(),
      shipToState: z.string().optional(),
      shipToZip: z.string().optional(),
      carrier: z.string().optional(),
      serviceLevel: z.string().optional(),
      trackingNumber: z.string().min(1),
      bolNumber: z.string().optional(),
      proNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createShipment({
        ...input,
        status: "booked",
        bookedByUserId: String(ctx.user.id),
        bookedByName: ctx.user.name ?? undefined,
      });
      // Push immediately to ClearSight (non-blocking)
      void pushShipmentToClearSight(id, "shipment.created");
      return { id };
    }),

  /** Update tracking info on an existing shipment (e.g. add PRO number, update status) */
  updateTracking: protectedProcedure
    .input(z.object({
      id: z.number(),
      trackingNumber: z.string().optional(),
      bolNumber: z.string().optional(),
      proNumber: z.string().optional(),
      status: z.string().optional(),
      carrierScac: z.string().optional(),
      estimatedDeliveryAt: z.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateShipment(id, data);
      // Push update to ClearSight (non-blocking)
      void pushShipmentToClearSight(id, "shipment.updated");
      return { success: true };
    }),

  /** Manually retry pushing a shipment to ClearSight */
  retryPush: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Reset attempt count so the push is retried even if it hit the 5-attempt cap
      await updateShipment(input.id, {
        clearSightPushStatus: "pending",
        clearSightPushAttempts: 0,
        clearSightPushError: null,
      });
      void pushShipmentToClearSight(input.id, "shipment.updated");
      return { success: true };
    }),
});

import { cortexHubRouter } from "./routers/cortex-hub";
import { analyticsRouter } from "./routers/analytics";
import { notesRouter } from "./routers/notes";
import { exceptionsRouter } from "./routers/exceptions";
import { myShiftRouter } from "./routers/myShift";
import { scanModeRouter } from "./routers/scanMode";
import { liveOpsRouter } from "./routers/liveOps";
import { clientProfilesRouter } from "./routers/clientProfiles";
import { photoCaptureRouter } from "./routers/photoCapture";
import { workloadRouter } from "./routers/workload";
import { onboardingRouter } from "./routers/onboarding";
import { pullTrackerRouter } from "./routers/pullTracker";
import { associatesRouter } from "./routers/associates";
import { pullAlertsRouter } from "./routers/pullAlerts";
import { itemsRouter } from "./routers/items";
import { syncMuOnFileNow, getMuOnFileSyncInfo } from "./scheduler/muOnFileSync";

// ─── EDI 945 Monitor ──────────────────────────────────────────────────────────
const ediMonitorRouter = router({
  /**
   * Fetch recently shipped orders from Extensiv and cross-reference ClearSight
   * retailer EDI requirements to surface real 945 failures.
   *
   * Status values:
   *   "sent"         — asnSent = true (945 transmitted OK)
   *   "not_required" — asnSent = false but retailer does not require EDI
   *   "missing"      — asnSent = false AND retailer requires EDI (action needed)
   *   "unknown"      — asnSent = false and retailer not found in ClearSight list
   */
  getShippedOrders: protectedProcedure
    .input(z.object({
      configId: z.number(),
      daysBack: z.number().min(1).max(90).default(7),
    }))
    .query(async ({ input }) => {
      const config = await getExtensivConfigById(input.configId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });

      const now = new Date();
      const from = new Date(now.getTime() - input.daysBack * 24 * 60 * 60 * 1000);
      const fromStr = from.toISOString().replace("Z", "");
      const toStr = now.toISOString().replace("Z", "");

      // Fetch shipped orders from Extensiv
      let orders: Awaited<ReturnType<typeof fetchShippedOrders>> = [];
      try {
        orders = await fetchShippedOrders(
          { tplGuid: config.tplGuid, clientId: config.clientId, clientSecret: config.clientSecret, userLoginId: config.userLoginId, baseUrl: config.baseUrl },
          fromStr,
          toStr
        );
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Extensiv fetch failed: ${err instanceof Error ? err.message : String(err)}` });
      }

      // Fetch EDI retailer list from ClearSight
      let ediRetailers: Array<{ name: string; requiresEdi: boolean; aliases?: string[] }> = [];
      try {
        const conn = await getCortexConnection("clearsight");
        if (conn?.enabled && conn.baseUrl && conn.outboundApiKey) {
          const url = conn.baseUrl.replace(/\/$/, "") + "/api/retailers";
          const res = await fetch(url, {
            headers: { "X-API-Key": conn.outboundApiKey },
            signal: AbortSignal.timeout(8_000),
          });
          if (res.ok) {
            const body = await res.json() as { retailers?: typeof ediRetailers };
            ediRetailers = body.retailers ?? [];
          } else {
            console.warn(`[EDI Monitor] ClearSight /api/retailers returned HTTP ${res.status}`);
          }
        }
      } catch (err) {
        console.warn("[EDI Monitor] Failed to fetch ClearSight retailer list:", err);
      }

      // Build a lookup: retailer name (lowercased) → requiresEdi
      const retailerMap = new Map<string, boolean>();
      for (const r of ediRetailers) {
        retailerMap.set(r.name.toLowerCase(), r.requiresEdi);
        for (const alias of (r.aliases ?? [])) {
          retailerMap.set(alias.toLowerCase(), r.requiresEdi);
        }
      }

      // Enrich each order with EDI status
      const enriched = orders.map((order) => {
        const customerName = order.readOnly.customerIdentifier?.name ?? "";
        const asnSent = order.readOnly.asnSent ?? false;

        let ediStatus: "sent" | "missing" | "not_required" | "unknown";
        if (asnSent) {
          ediStatus = "sent";
        } else {
          const requiresEdi = retailerMap.get(customerName.toLowerCase());
          if (requiresEdi === true) {
            ediStatus = "missing";
          } else if (requiresEdi === false) {
            ediStatus = "not_required";
          } else {
            ediStatus = "unknown";
          }
        }

        return {
          orderId: order.readOnly.orderId,
          referenceNum: order.referenceNum,
          poNum: order.poNum ?? null,
          customerName,
          facilityName: order.readOnly.facilityIdentifier?.name ?? "",
          shipDate: order.readOnly.shipDate ?? null,
          processDate: order.readOnly.processDate ?? null,
          trackingNumber: order.readOnly.trackingNumber ?? null,
          carrierName: order.readOnly.carrierName ?? null,
          asnSent,
          asnCandidate: order.readOnly.asnCandidate ?? 0,
          ediStatus,
        };
      });

      const summary = {
        total: enriched.length,
        sent: enriched.filter(o => o.ediStatus === "sent").length,
        missing: enriched.filter(o => o.ediStatus === "missing").length,
        notRequired: enriched.filter(o => o.ediStatus === "not_required").length,
        unknown: enriched.filter(o => o.ediStatus === "unknown").length,
        clearSightConnected: ediRetailers.length > 0,
      };

      return { orders: enriched, summary };
    }),
});

// ─── EDI Retailers Router ─────────────────────────────────────────────────────
const ediRetailersRouter = router({
  list: protectedProcedure.query(async () => getEdiRetailers()),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const r = await getEdiRetailerById(input.id);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });
      return r;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      requiresEdi: z.boolean().default(true),
      aliases: z.array(z.string()).default([]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createEdiRetailer(input);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      requiresEdi: z.boolean().optional(),
      aliases: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateEdiRetailer(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteEdiRetailer(input.id);
      return { success: true };
    }),
});

// ─── EDI Escalations Router ──────────────────────────────────────────────────
const ediEscalationsRouter = router({
  list: protectedProcedure
    .input(z.object({ configId: z.number().optional() }))
    .query(async ({ input }) => getEdiEscalations(input.configId)),

  flag: protectedProcedure
    .input(z.object({
      configId: z.number(),
      orderNumber: z.string(),
      customerName: z.string().optional(),
      shipDate: z.string().optional(),
      trackingNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const flaggedBy = ctx.user?.name ?? "Unknown";
      const id = await createEdiEscalation({ ...input, flaggedBy });
      // Notify owner
      try {
        const { notifyOwner } = await import('./_core/notification.js');
        await notifyOwner({
          title: `EDI 945 Escalation: Order ${input.orderNumber}`,
          content: `Order ${input.orderNumber} (${input.customerName ?? 'unknown customer'}) flagged for manual EDI 945 follow-up by ${flaggedBy}.${input.notes ? ` Notes: ${input.notes}` : ''}`,
        });
      } catch { /* non-blocking */ }
      return { id };
    }),

  resolve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await resolveEdiEscalation(input.id, ctx.user?.name ?? "Unknown");
      return { success: true };
    }),

  dismiss: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await dismissEdiEscalation(input.id, ctx.user?.name ?? "Unknown");
      return { success: true };
    }),
});

// ─── Carrier Pickup Scanner ────────────────────────────────────────────────────
const carrierPickupRouter = router({
  /** Fetch a single ship_ready order by extensivOrderId (used when navigating from Shipping Dashboard) */
  getOrderById: protectedProcedure
    .input(z.object({ extensivOrderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const { eq } = await import("drizzle-orm");
      const { orderTracking } = await import("../drizzle/schema");
      const rows = await db
        .select()
        .from(orderTracking)
        .where(eq(orderTracking.extensivOrderId, input.extensivOrderId))
        .limit(1);
      return rows[0] ?? null;
    }),

  /** Search ship_ready orders by order ID, reference number, carrier, or client name */
  searchOrders: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { or, like } = await import("drizzle-orm");
      const { orderTracking } = await import("../drizzle/schema");
      const q = `%${input.query}%`;
      const rows = await db
        .select()
        .from(orderTracking)
        .where(
          or(
            like(orderTracking.referenceNum, q),
            like(orderTracking.clientName, q),
            like(orderTracking.shipToName, q),
            like(orderTracking.outboundLocation, q)
          )
        )
        .limit(10);
      return rows;
    }),

  /** Start a new pickup session */
  startSession: protectedProcedure
    .input(z.object({
      transactionId: z.number().optional(),
      referenceNum: z.string().optional(),
      clientName: z.string().optional(),
      shipToName: z.string().optional(),
      outboundLocation: z.string().optional(),
      expectedPallets: z.number().optional(),
      warehouseId: z.number().optional(),
      warehouseName: z.string().optional(),
      carrierName: z.string().optional(),
      driverName: z.string(),
      trailerNumber: z.string(),
      sealNumber: z.string().optional(),
      proNumber: z.string().optional(),
      isDemo: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(pickupSessions).values({
        transactionId: input.transactionId,
        referenceNum: input.referenceNum,
        clientName: input.clientName,
        shipToName: input.shipToName,
        outboundLocation: input.outboundLocation,
        expectedPallets: input.expectedPallets,
        warehouseId: input.warehouseId,
        warehouseName: input.warehouseName,
        carrierName: input.carrierName,
        driverName: input.driverName,
        trailerNumber: input.trailerNumber,
        sealNumber: input.sealNumber ?? null,
        proNumber: input.proNumber ?? null,
        status: "scanning",
        isDemo: input.isDemo,
        createdBy: ctx.user?.name ?? "unknown",
      });
      const sessionId = (result as unknown as { insertId: number }).insertId;
      return { sessionId };
    }),

  /** Scan a pallet label during a pickup session */
  scanPallet: protectedProcedure
    .input(z.object({ sessionId: z.number(), labelValue: z.string().min(4, "Scan value too short — please scan the barcode on the physical pallet label") }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq } = await import("drizzle-orm");
      // ── Validate that the scanned label matches a known pallet UPC for this order ──
      const [session] = await db.select().from(pickupSessions).where(eq(pickupSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.transactionId) {
        const qcSession = await getQcSessionByTransactionId(session.transactionId);
        if (qcSession) {
          const qcPallets = await getQcPallets(qcSession.id);
          const knownUpcs = qcPallets
            .map((p) => p.palletUpc?.trim().toLowerCase())
            .filter(Boolean) as string[];
          if (knownUpcs.length > 0) {
            const scanned = input.labelValue.trim().toLowerCase();
            if (!knownUpcs.includes(scanned)) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `"${input.labelValue}" does not match any pallet label for this order. Please scan the barcode on the physical pallet label.`,
              });
            }
          }
        }
      }
      const existing = await db
        .select()
        .from(pickupScans)
        .where(eq(pickupScans.sessionId, input.sessionId))
        .then((rows: Array<{ labelValue: string }>) => rows.find(r => r.labelValue === input.labelValue));
      if (existing) {
        return { success: false, duplicate: true, message: `Label ${input.labelValue} already scanned.` };
      }
      await db.insert(pickupScans).values({
        sessionId: input.sessionId,
        labelValue: input.labelValue,
        scannedBy: ctx.user?.name ?? "unknown",
      });
      const allScans = await db.select().from(pickupScans).where(eq(pickupScans.sessionId, input.sessionId));
      return { success: true, duplicate: false, totalScanned: allScans.length };
    }),

  /** Get current session state */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq } = await import("drizzle-orm");
      const [session] = await db.select().from(pickupSessions).where(eq(pickupSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const scans = await db.select().from(pickupScans).where(eq(pickupScans.sessionId, input.sessionId));
      return { session, scans };
    }),

  /** Complete a pickup session and mark order as Shipped in Extensiv */
  completeSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq } = await import("drizzle-orm");
      const [session] = await db.select().from(pickupSessions).where(eq(pickupSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status === "complete") return { success: true, shippedInExtensiv: session.shippedInExtensiv ?? false };

      await db.update(pickupSessions)
        .set({ status: "complete", completedAt: new Date() })
        .where(eq(pickupSessions.id, input.sessionId));

      // Audit log
      const { auditLogs } = await import("../drizzle/schema");
      await db.insert(auditLogs).values({
        userId: null,
        action: "carrierPickup.completeSession",
        entityType: "pickup_session",
        entityId: String(input.sessionId),
        details: {
          operator: ctx.user?.name ?? "unknown",
          referenceNum: session.referenceNum,
          driverName: session.driverName,
          trailerNumber: session.trailerNumber,
          isDemo: session.isDemo,
        },
      });

      // ── Mark linked carrier appointment as completed ────────────────────────
      if (session.transactionId) {
        try {
          const { isNotNull, and: andOp, ne } = await import("drizzle-orm");
          await db.update(carrierAppointments)
            .set({ status: "completed", updatedAt: new Date() })
            .where(andOp(
              eq(carrierAppointments.extensivOrderId, session.transactionId),
              ne(carrierAppointments.status, "cancelled")
            ));
        } catch (e) {
          console.warn("[carrierPickup] appointment status update failed:", (e as Error).message);
        }
      }
      // ── Auto-clear dock position ──────────────────────────────────────────
      if (session.transactionId) {
        try {
          const { dockAssignments } = await import("../drizzle/schema.js");
          const { isNull, and: andOp } = await import("drizzle-orm");
          await db.update(dockAssignments)
            .set({ clearedAt: new Date() })
            .where(andOp(eq(dockAssignments.extensivOrderId, session.transactionId), isNull(dockAssignments.clearedAt)));
        } catch (e) {
          console.warn("[carrierPickup] dock auto-clear failed:", (e as Error).message);
        }
      }

      // ── Push to ClearSight ────────────────────────────────────────────────
      if (session.transactionId) {
        try {
          const { shipments: shipmentsTable } = await import("../drizzle/schema.js");
          const shipmentRows = await db.select({ id: shipmentsTable.id }).from(shipmentsTable)
            .where(eq(shipmentsTable.extensivOrderId, session.transactionId)).limit(1);
          if (shipmentRows[0]) {
            void pushShipmentToClearSight(shipmentRows[0].id, "shipment.updated");
          }
        } catch (e) {
          console.warn("[carrierPickup] ClearSight push failed:", (e as Error).message);
        }
      }

      if (session.isDemo || !session.transactionId) {
        return { success: true, shippedInExtensiv: false, skippedExtensiv: true };
      }

      let shippedInExtensiv = false;
      try {
        const configs = await getExtensivConfigs();
        const config = session.warehouseId
          ? configs.find(c => c.id === session.warehouseId) ?? configs[0]
          : configs[0];
        if (config) {
          const proNum = session.proNumber ?? session.trailerNumber ?? "PICKUP";
          const result = await markOrderShipped(config, {
            orderId: session.transactionId,
            trackingNumber: proNum,
            carrierName: session.carrierName ?? undefined,
          });
          shippedInExtensiv = result.success;
          if (result.success) {
            await db.update(pickupSessions)
              .set({ shippedInExtensiv: true })
              .where(eq(pickupSessions.id, input.sessionId));
            // Mark the orderTracking row as shipped so the Shipping Dashboard shows the Shipped badge
            if (session.transactionId) {
              const { orderTracking } = await import("../drizzle/schema");
              await db.update(orderTracking)
                .set({ lifecycleStatus: "shipped", shippedAt: new Date() })
                .where(eq(orderTracking.extensivOrderId, session.transactionId))
                .catch(e => console.warn("[carrierPickup] orderTracking shipped update failed:", e));
            }
          } else {
            console.warn(`[carrierPickup] markOrderShipped failed for session ${input.sessionId}:`, (result as { error?: string }).error);
          }
        }
      } catch (err) {
        console.warn(`[carrierPickup] Extensiv ship call threw for session ${input.sessionId}:`, err);
      }

      return { success: true, shippedInExtensiv };
    }),

  /** Generate a BOL PDF for a pickup session and save the URL */
  generatePickupBol: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq } = await import("drizzle-orm");
      const [session] = await db.select().from(pickupSessions).where(eq(pickupSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const { generateBolPdf } = await import("./bolGenerator.js");
      const bolUrl = await generateBolPdf({
        orderNumber: session.transactionId ?? input.sessionId,
        referenceNum: session.referenceNum,
        clientName: session.clientName ?? "Unknown",
        shipToName: session.shipToName,
        facilityName: session.warehouseName,
        outboundLocation: session.outboundLocation,
        palletCount: session.expectedPallets,
        carrierName: session.carrierName,
        driverName: session.driverName,
        trailerNumber: session.trailerNumber,
        bolNumber: session.proNumber ?? `GD-PKP-${input.sessionId}`,
        proNumber: session.proNumber,
        appointmentId: input.sessionId,
      });
      await db.update(pickupSessions).set({ bolUrl }).where(eq(pickupSessions.id, input.sessionId));
      // Auto-attach to shipping_documents
      if (session.transactionId) {
        try {
          const { orderTracking: ot, shippingDocuments: sdTable } = await import("../drizzle/schema.js");
          const { and, like } = await import("drizzle-orm");
          const otRows = await db.select({ id: ot.id }).from(ot)
            .where(eq(ot.extensivOrderId, session.transactionId)).limit(1);
          if (otRows[0]) {
            await db.delete(sdTable).where(
              and(eq(sdTable.orderTrackingId, otRows[0].id), eq(sdTable.docType, "bol"), like(sdTable.note, "Auto-generated from pickup%"))
            );
            await db.insert(sdTable).values({
              orderTrackingId: otRows[0].id,
              docType: "bol",
              fileName: `BOL-${session.transactionId}-PKP${input.sessionId}.pdf`,
              fileUrl: bolUrl,
              fileKey: `bol/pickup-${input.sessionId}-order-${session.transactionId}.pdf`,
              mimeType: "application/pdf",
              note: `Auto-generated from pickup session #${input.sessionId}`,
              uploadedBy: "system",
            });
          }
        } catch (e) {
          console.warn("[generatePickupBol] Auto-attach failed:", (e as Error).message);
        }
      }
      return { bolUrl };
    }),

  /** Overlay driver signature on the pickup BOL and save the signed URL */
  savePickupBol: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      signatureDataUrl: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq } = await import("drizzle-orm");
      const [session] = await db.select().from(pickupSessions).where(eq(pickupSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      // Generate BOL first if not yet generated
      let currentBolUrl = session.bolUrl;
      if (!currentBolUrl) {
        const { generateBolPdf } = await import("./bolGenerator.js");
        currentBolUrl = await generateBolPdf({
          orderNumber: session.transactionId ?? input.sessionId,
          referenceNum: session.referenceNum,
          clientName: session.clientName ?? "Unknown",
          shipToName: session.shipToName,
          facilityName: session.warehouseName,
          outboundLocation: session.outboundLocation,
          palletCount: session.expectedPallets,
          carrierName: session.carrierName,
          driverName: session.driverName,
          trailerNumber: session.trailerNumber,
          bolNumber: session.proNumber ?? `GD-PKP-${input.sessionId}`,
          proNumber: session.proNumber,
          appointmentId: input.sessionId,
        });
        await db.update(pickupSessions).set({ bolUrl: currentBolUrl }).where(eq(pickupSessions.id, input.sessionId));
      }
      const { overlaySignatureOnBol } = await import("./bolGenerator.js");
      const signedBolUrl = await overlaySignatureOnBol(
        currentBolUrl,
        input.signatureDataUrl,
        input.sessionId,
        session.transactionId ?? input.sessionId
      );
      await db.update(pickupSessions).set({ signedBolUrl }).where(eq(pickupSessions.id, input.sessionId));
      // Update shipping_documents with signed BOL
      if (session.transactionId) {
        try {
          const { orderTracking: ot, shippingDocuments: sdTable } = await import("../drizzle/schema.js");
          const { and } = await import("drizzle-orm");
          const otRows = await db.select({ id: ot.id }).from(ot)
            .where(eq(ot.extensivOrderId, session.transactionId)).limit(1);
          if (otRows[0]) {
            await db.delete(sdTable).where(and(eq(sdTable.orderTrackingId, otRows[0].id), eq(sdTable.docType, "bol")));
            await db.insert(sdTable).values({
              orderTrackingId: otRows[0].id,
              docType: "bol",
              fileName: `BOL-${session.transactionId}-PKP${input.sessionId}-SIGNED.pdf`,
              fileUrl: signedBolUrl,
              fileKey: `bol/signed/pickup-${input.sessionId}-order-${session.transactionId}-signed.pdf`,
              mimeType: "application/pdf",
              note: `Signed by driver — pickup session #${input.sessionId}`,
              uploadedBy: "system",
            });
          }
        } catch (e) {
          console.warn("[savePickupBol] Update shipping_documents failed:", (e as Error).message);
        }
        // Push to ClearSight
        try {
          const { shipments: shipmentsTable } = await import("../drizzle/schema.js");
          const shipmentRows = await db.select({ id: shipmentsTable.id }).from(shipmentsTable)
            .where(eq(shipmentsTable.extensivOrderId, session.transactionId)).limit(1);
          if (shipmentRows[0]) {
            void pushShipmentToClearSight(shipmentRows[0].id, "shipment.updated");
          }
        } catch (e) {
          console.warn("[savePickupBol] ClearSight push failed:", (e as Error).message);
        }
      }
      return { bolUrl: currentBolUrl, signedBolUrl };
    }),

  /** List recent pickup sessions */
  listHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { desc, count, inArray } = await import("drizzle-orm");
      const sessions = await db
        .select().from(pickupSessions)
        .orderBy(desc(pickupSessions.createdAt))
        .limit(input.limit);
      if (sessions.length === 0) return [];
      const sessionIds = sessions.map(s => s.id);
      const scanCounts = await db
        .select({ sessionId: pickupScans.sessionId, scannedCount: count(pickupScans.id) })
        .from(pickupScans)
        .where(inArray(pickupScans.sessionId, sessionIds))
        .groupBy(pickupScans.sessionId);
      const countMap = new Map(scanCounts.map(r => [r.sessionId, Number(r.scannedCount)]));
      return sessions.map(s => ({ ...s, scannedCount: countMap.get(s.id) ?? 0 }));
    }),

  /** Retry marking a completed session as Shipped in Extensiv */
  retryShipInExtensiv: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { eq } = await import("drizzle-orm");
      const [session] = await db.select().from(pickupSessions).where(eq(pickupSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.isDemo || !session.transactionId) return { success: false, reason: "demo or no transactionId" };
      try {
        const configs = await getExtensivConfigs();
        const config = session.warehouseId
          ? configs.find(c => c.id === session.warehouseId) ?? configs[0]
          : configs[0];
        if (!config) return { success: false, reason: "no Extensiv config found" };
        const proNum = session.proNumber ?? session.trailerNumber ?? "PICKUP";
        const result = await markOrderShipped(config, {
          orderId: session.transactionId,
          trackingNumber: proNum,
          carrierName: session.carrierName ?? undefined,
        });
        if (result.success) {
          await db.update(pickupSessions).set({ shippedInExtensiv: true }).where(eq(pickupSessions.id, input.sessionId));
        }
        return result;
      } catch (err: unknown) {
        return { success: false, reason: String(err) };
      }
    }),
});
// ─── Carrier Appointments ────────────────────────────────────────────────────
const carrierAppointmentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      facilityId: z.number().optional(),
      status: z.enum(["scheduled", "confirmed", "cancelled", "completed", "all"]).default("all"),
      date: z.string().optional(), // ISO date string filter
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq, and, or, gte, lte, desc } = await import("drizzle-orm");
      const conditions: any[] = [];
      if (input.facilityId) conditions.push(eq(carrierAppointments.facilityId, input.facilityId));
      if (input.status !== "all") conditions.push(eq(carrierAppointments.status, input.status as any));
      if (input.date) conditions.push(eq(carrierAppointments.scheduledDate, input.date));
      const rows = await db
        .select()
        .from(carrierAppointments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(carrierAppointments.scheduledDate), carrierAppointments.scheduledTimeStart);
      return rows;
    }),

  getByOrder: protectedProcedure
    .input(z.object({ extensivOrderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq, and, desc } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(carrierAppointments)
        .where(and(
          eq(carrierAppointments.extensivOrderId, input.extensivOrderId),
          // Only return active appointments (not cancelled)
        ))
        .orderBy(desc(carrierAppointments.createdAt))
        .limit(1);
      return rows[0] ?? null;
    }),

  create: protectedProcedure
    .input(z.object({
      extensivOrderId: z.number(),
      referenceNum: z.string().optional(),
      clientName: z.string(),
      shipToName: z.string().optional(),
      facilityId: z.number(),
      facilityName: z.string().optional(),
      outboundLocation: z.string().optional(),
      palletCount: z.number().optional(),
      scheduledDate: z.string(),
      scheduledTimeStart: z.string().optional(),
      scheduledTimeEnd: z.string().optional(),
      carrierName: z.string().optional(),
      driverName: z.string().optional(),
      trailerNumber: z.string().optional(),
      contactPhone: z.string().optional(),
      contactEmail: z.string().optional(),
      bolNumber: z.string().optional(),
      proNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const now = new Date();
      // Auto-generate BOL number if not provided
      const bolNumber = input.bolNumber || `BOL-${Date.now()}`;
      const [result] = await db.insert(carrierAppointments).values({
        ...input,
        bolNumber,
        status: "scheduled",
        createdBy: ctx.user?.id,
        createdByName: ctx.user?.name ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
      const id = (result as any).insertId;
      const rows = await db.select().from(carrierAppointments).where((await import("drizzle-orm")).eq(carrierAppointments.id, id)).limit(1);
      const appt = rows[0];
      // Fire Clearsight webhook if client requires customs docs but none are uploaded
      try {
        const { eq: eqInner, and: andInner } = await import("drizzle-orm");
        const { orderTracking, clientProfiles, shippingDocuments } = await import("../drizzle/schema.js");
        const orderRows = await db.select().from(orderTracking).where(eqInner(orderTracking.extensivOrderId, input.extensivOrderId)).limit(1);
        const order = orderRows[0];
        if (order) {
          const profileRows = await db.select().from(clientProfiles)
            .where(andInner(eqInner(clientProfiles.customerId, order.clientId), eqInner(clientProfiles.configId, order.configId)))
            .limit(1);
          const profile = profileRows[0];
          if (profile?.requiresCustomsDocs) {
            const docRows = await db.select().from(shippingDocuments)
              .where(andInner(eqInner(shippingDocuments.orderTrackingId, order.id), eqInner(shippingDocuments.docType, "customs")));
            const hasCustoms = docRows.length > 0;
            if (!hasCustoms) {
              await fireCortexWebhook("clearsight", "shipment.customs_docs_missing", {
                trigger: "appointment_scheduled",
                appointmentId: appt?.id,
                extensivOrderId: input.extensivOrderId,
                referenceNum: input.referenceNum ?? order.referenceNum,
                clientName: input.clientName,
                scheduledDate: input.scheduledDate,
                scheduledTimeStart: input.scheduledTimeStart,
                facilityName: input.facilityName,
                message: `Customs documents are required for ${input.clientName} (order ${input.referenceNum ?? input.extensivOrderId}) but have not been uploaded. Pickup is scheduled for ${input.scheduledDate}${input.scheduledTimeStart ? " at " + input.scheduledTimeStart : ""}.`,
              });
            }
          }
        }
      } catch (err) { console.warn("[Customs Notify] create check failed:", err); }
      return appt;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      scheduledDate: z.string().optional(),
      scheduledTimeStart: z.string().optional(),
      scheduledTimeEnd: z.string().optional(),
      carrierName: z.string().optional(),
      driverName: z.string().optional(),
      trailerNumber: z.string().optional(),
      contactPhone: z.string().optional(),
      contactEmail: z.string().optional(),
      bolNumber: z.string().optional(),
      proNumber: z.string().optional(),
      notes: z.string().optional(),
      outboundLocation: z.string().optional(),
      palletCount: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      const { id, ...fields } = input;
      await db.update(carrierAppointments).set({ ...fields, updatedAt: new Date() }).where(eq(carrierAppointments.id, id));
      const rows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, id)).limit(1);
      return rows[0];
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      const now = new Date();
      await db.update(carrierAppointments)
        .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
        .where(eq(carrierAppointments.id, input.id));
      const rows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, input.id)).limit(1);
      const appt = rows[0];
      // Fire Clearsight webhook if client requires customs docs but none are uploaded
      try {
        const { eq: eqInner, and: andInner } = await import("drizzle-orm");
        const { orderTracking, clientProfiles, shippingDocuments } = await import("../drizzle/schema.js");
        const orderRows = await db.select().from(orderTracking).where(eqInner(orderTracking.extensivOrderId, appt.extensivOrderId)).limit(1);
        const order = orderRows[0];
        if (order) {
          const profileRows = await db.select().from(clientProfiles)
            .where(andInner(eqInner(clientProfiles.customerId, order.clientId), eqInner(clientProfiles.configId, order.configId)))
            .limit(1);
          const profile = profileRows[0];
          if (profile?.requiresCustomsDocs) {
            const docRows = await db.select().from(shippingDocuments)
              .where(andInner(eqInner(shippingDocuments.orderTrackingId, order.id), eqInner(shippingDocuments.docType, "customs")));
            const hasCustoms = docRows.length > 0;
            if (!hasCustoms) {
              await fireCortexWebhook("clearsight", "shipment.customs_docs_missing", {
                trigger: "appointment_confirmed",
                appointmentId: appt.id,
                extensivOrderId: appt.extensivOrderId,
                referenceNum: appt.referenceNum ?? order.referenceNum,
                clientName: appt.clientName,
                scheduledDate: appt.scheduledDate,
                scheduledTimeStart: appt.scheduledTimeStart,
                facilityName: appt.facilityName,
                bolNumber: appt.bolNumber,
                message: `URGENT: Customs documents are required for ${appt.clientName} (order ${appt.referenceNum ?? appt.extensivOrderId}) but have not been uploaded. Pickup is CONFIRMED for ${appt.scheduledDate}${appt.scheduledTimeStart ? " at " + appt.scheduledTimeStart : ""}.`,
              });
              // Also notify owner
              try {
                const { notifyOwner } = await import("./_core/notification.js");
                await notifyOwner({
                  title: `⚠️ Missing Customs Docs — ${appt.clientName}`,
                  content: `Order ${appt.referenceNum ?? appt.extensivOrderId} (${appt.clientName}) has a confirmed pickup on ${appt.scheduledDate}${appt.scheduledTimeStart ? " at " + appt.scheduledTimeStart : ""} but customs documents have not been uploaded. Please upload before the carrier arrives.`,
                });
              } catch { /* non-blocking */ }
            }
          }
        }
      } catch (err) { console.warn("[Customs Notify] confirm check failed:", err); }
      return appt;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      const now = new Date();
      await db.update(carrierAppointments)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now, notes: input.reason })
        .where(eq(carrierAppointments.id, input.id));
      const rows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, input.id)).limit(1);
      return rows[0];
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      const now = new Date();
      await db.update(carrierAppointments)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(carrierAppointments.id, input.id));
      const rows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, input.id)).limit(1);
      return rows[0];
    }),

  // Look up order details from order_tracking for the booking form
  getOrderDetails: protectedProcedure
    .input(z.object({ extensivOrderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      const { orderTracking } = await import("../drizzle/schema.js");
      const rows = await db
        .select({
          extensivOrderId: orderTracking.extensivOrderId,
          clientName: orderTracking.clientName,
          facilityId: orderTracking.facilityId,
          facilityName: orderTracking.facilityName,
          outboundLocation: orderTracking.outboundLocation,
          palletCount: orderTracking.palletCount,
          referenceNum: orderTracking.referenceNum,
          shipToName: orderTracking.shipToName,
        })
        .from(orderTracking)
        .where(eq(orderTracking.extensivOrderId, input.extensivOrderId))
        .limit(1);
      return rows[0] ?? null;
    }),

  // Generate BOL and packing list documents for an appointment
  generateDocuments: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      const { orderTracking } = await import("../drizzle/schema.js");
      const { generateBolPdf } = await import("./bolGenerator.js");
      // Fetch the appointment
      const apptRows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, input.id)).limit(1);
      if (!apptRows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });
      const appt = apptRows[0];
      // Fetch order details
      const orderRows = await db
        .select()
        .from(orderTracking)
        .where(eq(orderTracking.extensivOrderId, appt.extensivOrderId))
        .limit(1);
      const order = orderRows[0];
      // Generate BOL PDF
      const bolUrl = await generateBolPdf({
        orderNumber: appt.extensivOrderId,
        referenceNum: appt.referenceNum ?? order?.referenceNum,
        clientName: appt.clientName,
        shipToName: appt.shipToName ?? order?.shipToName,
        facilityName: appt.facilityName,
        outboundLocation: appt.outboundLocation ?? order?.outboundLocation,
        palletCount: appt.palletCount ?? order?.palletCount,
        carrierName: appt.carrierName,
        driverName: appt.driverName,
        trailerNumber: appt.trailerNumber,
        bolNumber: appt.bolNumber,
        proNumber: appt.proNumber,
        appointmentId: appt.id,
        scheduledDate: appt.scheduledDate,
        scheduledTimeStart: appt.scheduledTimeStart,
      });
      const now = new Date();
      await db.update(carrierAppointments)
        .set({
          bolUrl,
          documentsGeneratedAt: now,
          updatedAt: now,
        })
        .where(eq(carrierAppointments.id, input.id));
       // ── Auto-attach BOL to shipping_documents ────────────────────────────────
      try {
        const { orderTracking: ot, shippingDocuments: sdTable } = await import("../drizzle/schema.js");
        const { and, like } = await import("drizzle-orm");
        const otRows = await db
          .select({ id: ot.id })
          .from(ot)
          .where(eq(ot.extensivOrderId, appt.extensivOrderId))
          .limit(1);
        if (otRows[0]) {
          // Remove any previous auto-generated (unsigned) BOL for this order
          await db.delete(sdTable)
            .where(
              and(
                eq(sdTable.orderTrackingId, otRows[0].id),
                eq(sdTable.docType, "bol"),
                like(sdTable.note, "Auto-generated%")
              )
            );
          await db.insert(sdTable).values({
            orderTrackingId: otRows[0].id,
            docType: "bol",
            fileName: `BOL-${appt.extensivOrderId}-${appt.bolNumber ?? appt.id}.pdf`,
            fileUrl: bolUrl,
            fileKey: `bol/appt-${appt.id}-order-${appt.extensivOrderId}.pdf`,
            mimeType: "application/pdf",
            note: `Auto-generated from appointment #${appt.id}`,
            uploadedBy: "system",
          });
        }
      } catch (e) {
        console.warn("[generateDocuments] Auto-attach BOL failed:", (e as Error).message);
      }
      const rows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, input.id)).limit(1);
      return { appointment: rows[0], bolUrl };
    }),
  // Submit driver signature — overlays it on the BOL PDF and saves the signed URL
  submitSignature: protectedProcedure
    .input(z.object({
      id: z.number(),              // appointment id
      signatureDataUrl: z.string(), // base64 PNG data URL
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { eq } = await import("drizzle-orm");
      const { overlaySignatureOnBol } = await import("./bolGenerator.js");
      const apptRows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, input.id)).limit(1);
      if (!apptRows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });
      const appt = apptRows[0];
      if (!appt.bolUrl) throw new TRPCError({ code: 'BAD_REQUEST', message: 'BOL not yet generated. Generate documents first.' });
      const signedBolUrl = await overlaySignatureOnBol(
        appt.bolUrl,
        input.signatureDataUrl,
        appt.id,
        appt.extensivOrderId
      );
      const now = new Date();
      await db.update(carrierAppointments)
        .set({
          signedBolUrl,
          driverSignedAt: now,
          updatedAt: now,
        })
        .where(eq(carrierAppointments.id, input.id));
       // ── Update shipping_documents with signed BOL ─────────────────────────
      try {
        const { orderTracking: ot, shippingDocuments: sdTable } = await import("../drizzle/schema.js");
        const { and, like } = await import("drizzle-orm");
        const otRows = await db
          .select({ id: ot.id })
          .from(ot)
          .where(eq(ot.extensivOrderId, appt.extensivOrderId))
          .limit(1);
        if (otRows[0]) {
          // Replace auto-generated BOL with the signed version
          await db.delete(sdTable)
            .where(
              and(
                eq(sdTable.orderTrackingId, otRows[0].id),
                eq(sdTable.docType, "bol")
              )
            );
          await db.insert(sdTable).values({
            orderTrackingId: otRows[0].id,
            docType: "bol",
            fileName: `BOL-${appt.extensivOrderId}-SIGNED.pdf`,
            fileUrl: signedBolUrl,
            fileKey: `bol/signed/appt-${appt.id}-order-${appt.extensivOrderId}-signed.pdf`,
            mimeType: "application/pdf",
            note: `Signed by driver — appointment #${appt.id}`,
            uploadedBy: "system",
          });
        }
      } catch (e) {
        console.warn("[submitSignature] Update shipping_documents failed:", (e as Error).message);
      }
      // ── Send signed BOL to Clearsight via Cortex webhook ─────────────────
      try {
        await fireCortexWebhook("clearsight", "shipment.bol_signed", {
          extensivOrderId: appt.extensivOrderId,
          appointmentId: appt.id,
          bolNumber: appt.bolNumber,
          referenceNum: appt.referenceNum,
          clientName: appt.clientName,
          signedBolUrl,
          driverSignedAt: now.toISOString(),
        });
      } catch (e) {
        console.warn("[submitSignature] Clearsight webhook failed:", (e as Error).message);
      }
      const rows = await db.select().from(carrierAppointments).where(eq(carrierAppointments.id, input.id)).limit(1);
      return { appointment: rows[0], signedBolUrl };
    }),
});
// ─── MU Cache Sync Router ───────────────────────────────────────────────────
const muSyncRouter = router({
  /** Get current MU sync status (running, last sync time, summary) */
  getStatus: protectedProcedure.query(() => {
    const info = getMuOnFileSyncInfo();
    return {
      syncRunning: info.syncRunning,
      lastSyncAt: info.lastSyncAt ? info.lastSyncAt.toISOString() : null,
      lastSyncSummary: info.lastSyncSummary,
    };
  }),
  /** Manually trigger a full MU on-file sync (resets sync_state to force full backfill) */
  triggerNow: protectedProcedure
    .input(z.object({
      fullBackfill: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const info = getMuOnFileSyncInfo();
      if (info.syncRunning) {
        throw new TRPCError({ code: "CONFLICT", message: "A sync is already running. Please wait for it to complete." });
      }
      if (input.fullBackfill) {
        // Reset sync_state so the run performs a full backfill instead of incremental
        const db = await getDb();
        await db!.execute(sql`DELETE FROM sync_state WHERE sync_type = 'mu_on_file'`);
      }
      // Fire and forget — the mutation returns immediately; client polls getStatus
      syncMuOnFileNow().catch((err) =>
        console.error("[muSyncRouter] Manual sync error:", err?.message)
      );
      return { started: true, fullBackfill: input.fullBackfill };
    }),
});

// ──────────────────────────────────────────────────────────────────────────────
export const appRouterV4 = router({
  ...appRouterFull._def.record,
  slaPerformance: slaPerformanceRouter,
  shippingDashboard: shippingDashboardRouter,
  smallParcel: smallParcelRouter,
  techship: techshipRouter,
  shippingIntegration: shippingIntegrationRouter,
  rateWizard: rateWizardRouter,
  shippingHistory: shippingHistoryRouter,
  directly: directlyRouter,
  cortexHub: cortexHubRouter,
  notes: notesRouter,
  exceptions: exceptionsRouter,
  myShift: myShiftRouter,
  scanMode: scanModeRouter,
  liveOps: liveOpsRouter,
  clientProfiles: clientProfilesRouter,
  photoCapture: photoCaptureRouter,
  workload: workloadRouter,
  onboarding: onboardingRouter,
  pullTracker: pullTrackerRouter,
  associates: associatesRouter,
  pullAlerts: pullAlertsRouter,
  items: itemsRouter,
  ediMonitor: ediMonitorRouter,
  ediRetailers: ediRetailersRouter,
  ediEscalations: ediEscalationsRouter,
  carrierPickup: carrierPickupRouter,
  carrierAppointments: carrierAppointmentsRouter,
  dockManager: dockManagerRouter,
  muSync: muSyncRouter,
  analytics: analyticsRouter,
});
export type AppRouterV4 = typeof appRouterV4;
