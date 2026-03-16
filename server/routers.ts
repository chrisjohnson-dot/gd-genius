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
import { fetchCustomers, fetchOpenOrders, fetchInventory, fetchItemDescriptions, fetchOrderWithDetail, moveInventory, allocateOrder, updateOrderProposedAllocations, fetchAllFacilities, fetchCustomersForFacility } from "./extensiv/api";
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

    // Debug endpoint: returns raw /properties/facilities response for troubleshooting
    facilitiesRaw: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .query(async ({ input }) => {
        const config = await getExtensivConfigById(input.configId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND" });
        const { createExtensivClient } = await import("./extensiv/client");
        const client = createExtensivClient(config);
        try {
          const data = await client.get("/properties/facilities", { pgsiz: 500 });
          console.log("[Extensiv] /properties/facilities raw:", JSON.stringify(data));
          return { ok: true, data };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Extensiv] /properties/facilities error:", msg);
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
  }),

  // ─── Allocation ────────────────────────────────────────────────────────────
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

          // Look up per-customer rules (e.g. noLotMixing)
          const customerRule = await getCustomerRule(input.configId, customer.customerId);
          const noLotMixing = customerRule?.noLotMixing ?? false;

          // Run allocation engine for this customer
          const result = runAllocationEngine(
            orders,
            inventory,
            locationTypeMap,
            customer.stagingLocationId,
            customer.stagingLocationName,
            descMap,
            noLotMixing
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
          createdBy: ctx.user.id,
        });

        // Save per-order results
        const runOrderItems = [
          ...allAllocated.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            status: "allocated" as const,
            allocationDetail: o as unknown as Record<string, unknown>,
          })),
          ...allSkipped.map((o) => ({
            runId,
            orderId: o.orderId,
            referenceNum: o.referenceNum,
            status: "skipped" as const,
            skipReason: o.skipReason,
            allocationDetail: null,
          })),
        ];
        await createAllocationRunOrders(runOrderItems);

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

        for (const runOrder of allocatedOrders) {
          const detail = runOrder.allocationDetail as {
            lineItems: Array<{
              sku: string;
              allocations: Array<{ receiveItemId: number; qty: number; locationType: string }>;
            }>;
            pullListItems: Array<{
              receiveItemId: number;
              qty: number;
              toLocationId: number;
            }>;
          } | null;

          if (!detail) continue;

          try {
            // Step 1: Move inventory to staging (only non-staging items)
            const moveItems = detail.pullListItems.map((p) => ({
              receiveItemId: p.receiveItemId,
              quantity: p.qty,
            }));

            if (moveItems.length > 0) {
              const stagingLocationId = detail.pullListItems[0]?.toLocationId;
              if (stagingLocationId) {
                const moveResult = await moveInventory(config, stagingLocationId, moveItems);
                if (!moveResult.success) {
                  errors.push(
                    `Order ${runOrder.referenceNum}: move failed - ${moveResult.error}`
                  );
                  continue;
                }
              }
            }

            // Step 2: Get fresh ETag and allocate order
            const { order, etag } = await fetchOrderWithDetail(config, runOrder.orderId);

            // Build proposed allocations for order items
            const updatedOrderItems = (order.orderItems ?? []).map((item) => {
              const lineDetail = detail.lineItems.find(
                (l) => l.sku === item.itemIdentifier.sku
              );
              if (!lineDetail) return item;
              return {
                ...item,
                proposedAllocations: lineDetail.allocations.map((a) => ({
                  receivedItemId: a.receiveItemId,
                  qty: a.qty,
                })),
              };
            });

            // Update order with proposed allocations
            const updateResult = await updateOrderProposedAllocations(
              config,
              runOrder.orderId,
              etag,
              updatedOrderItems
            );

            if (!updateResult.success) {
              errors.push(
                `Order ${runOrder.referenceNum}: update failed - ${updateResult.error}`
              );
              continue;
            }

            // Step 3: Allocate
            const allocResult = await allocateOrder(
              config,
              runOrder.orderId,
              updateResult.newEtag
            );

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
        })
      )
      .mutation(async ({ input, ctx }) => {
        await upsertCustomerRule(input);
        await createAuditLog({
          userId: ctx.user.id,
          action: "customerRules.save",
          entityType: "customer_rules",
          entityId: String(input.customerId),
          details: { noLotMixing: input.noLotMixing, autoRun: input.autoRun },
        });
        return { success: true };
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
