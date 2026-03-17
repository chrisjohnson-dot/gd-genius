/**
 * Auto-Run Scheduler
 *
 * Uses node-cron to schedule allocation runs for all customers flagged with autoRun=true.
 * The schedule is stored per Extensiv config in the schedule_configs table.
 * Each run: propose → auto-confirm → notify owner.
 */

import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import {
  getExtensivConfigs,
  getExtensivConfigById,
  getScheduleConfig,
  getAutoRunCustomers,
  getLocationConfigsByCustomer,
  createAllocationRun,
  updateAllocationRun,
  createAllocationRunOrders,
  createAuditLog,
  updateScheduleConfigLastRun,
} from "../db";
import {
  fetchOpenOrders,
  fetchInventory,
  fetchItemDescriptions,
  fetchOrderWithDetail,
  moveInventory,
  allocateOrder,
  updateOrderProposedAllocations,
} from "../extensiv/api";
import { runAllocationEngine, LocationTypeMap } from "../allocation/engine";
import { notifyOwner } from "../_core/notification";

// ─── Active cron jobs registry ────────────────────────────────────────────────
const activeJobs = new Map<number, ScheduledTask>();

// ─── Run allocation for a single config ──────────────────────────────────────

async function runAutoAllocation(configId: number): Promise<void> {
  console.log(`[AutoRun] Starting auto-allocation for configId=${configId}`);

  const config = await getExtensivConfigById(configId);
  if (!config) {
    console.warn(`[AutoRun] Config ${configId} not found, skipping.`);
    return;
  }

  const autoRunCustomers = await getAutoRunCustomers(configId);
  if (autoRunCustomers.length === 0) {
    console.log(`[AutoRun] No auto-run customers for configId=${configId}, skipping.`);
    await updateScheduleConfigLastRun(configId, "skipped", "No auto-run customers enrolled.");
    return;
  }

  // Group customers by facility
  const byFacility = new Map<number, typeof autoRunCustomers>();
  for (const c of autoRunCustomers) {
    if (!c.facilityId) continue;
    if (!byFacility.has(c.facilityId)) byFacility.set(c.facilityId, []);
    byFacility.get(c.facilityId)!.push(c);
  }

  if (byFacility.size === 0) {
    console.log(`[AutoRun] Auto-run customers have no facilityId set, skipping.`);
    await updateScheduleConfigLastRun(configId, "skipped", "Auto-run customers have no facility configured.");
    return;
  }

  let totalAllocated = 0;
  let totalSkipped = 0;
  let totalOrders = 0;
  const runIds: number[] = [];
  const errors: string[] = [];

  for (const [facilityId, customers] of Array.from(byFacility)) {
    // Fetch open orders and run allocation per customer
    const allAllocated: ReturnType<typeof runAllocationEngine>["allocatedOrders"] = [];
    const allSkipped: ReturnType<typeof runAllocationEngine>["skippedOrders"] = [];
    const allPullList: ReturnType<typeof runAllocationEngine>["pullList"] = [];
    const allPackList: ReturnType<typeof runAllocationEngine>["packList"] = [];
    const customerNames: string[] = [];

    for (const customer of customers) {
      if (!customer.customerId) continue;

      try {
        // Fetch open orders for this customer
        const openOrders = await fetchOpenOrders(config, customer.customerId, facilityId);
        if (openOrders.length === 0) continue;

        // Fetch full order details — use readOnly.orderId as Extensiv's internal order ID
        // (In Extensiv API: readOnly.orderId = internal numeric ID; referenceNum = customer's ref number)
        const ordersWithDetail = await Promise.all(
          openOrders.map((o) => fetchOrderWithDetail(config, o.readOnly.orderId))
        );
        const orders = ordersWithDetail.map((o) => o.order);

        // Fetch inventory
        const inventory = await fetchInventory(config, customer.customerId, facilityId);

        // Fetch item descriptions
        const descMap = await fetchItemDescriptions(config, customer.customerId);

        // Build location type map
        const locationConfigsData = await getLocationConfigsByCustomer(configId, customer.customerId);
        const locationTypeMap: LocationTypeMap = {};
        for (const lc of locationConfigsData) {
          locationTypeMap[lc.locationId] = lc.locationType;
        }

        // Find staging location for this customer
        const stagingLoc = locationConfigsData.find((lc) => lc.locationType === "staging");
        if (!stagingLoc) {
          console.warn(`[AutoRun] No staging location for customer ${customer.customerId}, skipping.`);
          continue;
        }

        // Run allocation engine
        const result = runAllocationEngine(
          orders,
          inventory,
          locationTypeMap,
          stagingLoc.locationId,
          stagingLoc.locationName,
          descMap,
          customer.noLotMixing
        );

        allAllocated.push(...result.allocatedOrders);
        allSkipped.push(...result.skippedOrders);
        allPullList.push(...result.pullList);
        allPackList.push(...result.packList);
        customerNames.push(customer.customerName ?? String(customer.customerId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[AutoRun] Error processing customer ${customer.customerId}: ${msg}`);
        errors.push(`Customer ${customer.customerName ?? customer.customerId}: ${msg}`);
      }
    }

    if (allAllocated.length === 0 && allSkipped.length === 0) continue;

    totalOrders += allAllocated.length + allSkipped.length;

    // Save run record
    const runId = await createAllocationRun({
      configId,
      customerId: customers.length === 1 ? customers[0]!.customerId : null,
      customerName: customers.length === 1 ? customers[0]!.customerName : null,
      customerNames: JSON.stringify(customerNames),
      facilityId,
      facilityName: customers[0]?.facilityName ?? null,
      status: "proposed",
      orderCount: allAllocated.length + allSkipped.length,
      allocatedCount: allAllocated.length,
      skippedCount: allSkipped.length,
      pullList: allPullList as unknown as Record<string, unknown>[],
      createdBy: null,
    });
    runIds.push(runId);

    // Save per-order results
    await createAllocationRunOrders([
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
        allocationDetail: {} as Record<string, unknown>,
      })),
    ]);

    // Auto-confirm: execute moves + allocations
    const confirmErrors: string[] = [];
    let successCount = 0;

    for (const runOrder of allAllocated) {
      const detail = runOrder as {
        lineItems: Array<{ sku: string; allocations: Array<{ receiveItemId: number; qty: number; locationType: string }> }>;
        pullListItems: Array<{ receiveItemId: number; qty: number; toLocationId: number }>;
      };

      try {
        // Step 1: Move inventory to staging
        const moveItems = detail.pullListItems.map((p) => ({
          receiveItemId: p.receiveItemId,
          quantity: p.qty,
        }));
        if (moveItems.length > 0) {
          const stagingLocationId = detail.pullListItems[0]?.toLocationId;
          if (stagingLocationId) {
            const moveResult = await moveInventory(config, stagingLocationId, moveItems);
            if (!moveResult.success) {
              confirmErrors.push(`Order ${runOrder.referenceNum}: move failed - ${moveResult.error}`);
              continue;
            }
          }
        }

        // Step 2: Fetch fresh ETag
        const { order, etag } = await fetchOrderWithDetail(config, runOrder.orderId);

        // Step 3: Update proposed allocations
        const updatedOrderItems = (order.orderItems ?? []).map((item) => {
          const lineDetail = detail.lineItems.find((l) => l.sku === item.itemIdentifier.sku);
          if (!lineDetail) return item;
          return {
            ...item,
            proposedAllocations: lineDetail.allocations.map((a) => ({
              receivedItemId: a.receiveItemId,
              qty: a.qty,
            })),
          };
        });

        const updateResult = await updateOrderProposedAllocations(config, runOrder.orderId, etag, updatedOrderItems);
        if (!updateResult.success) {
          confirmErrors.push(`Order ${runOrder.referenceNum}: update failed - ${updateResult.error}`);
          continue;
        }

        // Step 4: Allocate
        const allocResult = await allocateOrder(config, runOrder.orderId, updateResult.newEtag);
        if (allocResult.success) {
          successCount++;
        } else {
          confirmErrors.push(`Order ${runOrder.referenceNum}: allocate failed - ${allocResult.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        confirmErrors.push(`Order ${runOrder.referenceNum}: ${msg}`);
      }
    }

    const finalStatus = confirmErrors.length === 0 ? "confirmed" : "failed";
    await updateAllocationRun(runId, {
      status: finalStatus,
      confirmedAt: new Date(),
      notes: confirmErrors.length > 0 ? confirmErrors.slice(0, 5).join("; ") : undefined,
    });

    await createAuditLog({
      userId: null,
      action: "allocation.autoRun",
      entityType: "allocation_run",
      entityId: String(runId),
      details: {
        customers: customerNames,
        facilityId,
        orderCount: allAllocated.length + allSkipped.length,
        allocated: successCount,
        skipped: allSkipped.length,
        errors: confirmErrors.slice(0, 10),
      },
    });

    totalAllocated += successCount;
    totalSkipped += allSkipped.length;
    errors.push(...confirmErrors);
  }

  // Update schedule last run status
  const summary = `Allocated: ${totalAllocated} | Skipped: ${totalSkipped} | Orders: ${totalOrders} | Runs: ${runIds.join(", ")}${errors.length > 0 ? ` | Errors: ${errors.slice(0, 3).join("; ")}` : ""}`;
  const overallStatus = errors.length === 0 ? "success" : "partial";
  await updateScheduleConfigLastRun(configId, overallStatus, summary);

  // Send owner notification
  try {
    const notifContent = [
      `**Auto-Run Completed** — ${new Date().toLocaleString()}`,
      ``,
      `Config: ${config.name}`,
      `Orders Processed: ${totalOrders}`,
      `Successfully Allocated: ${totalAllocated}`,
      `Skipped (insufficient inventory): ${totalSkipped}`,
      errors.length > 0 ? `Errors: ${errors.slice(0, 5).join("; ")}` : `No errors.`,
      `Run IDs: ${runIds.join(", ")}`,
    ].join("\n");

    await notifyOwner({
      title: `GD Allocation Auto-Run: ${totalAllocated} orders allocated`,
      content: notifContent,
    });
  } catch (err) {
    console.warn("[AutoRun] Failed to send notification:", err);
  }

  console.log(`[AutoRun] Completed for configId=${configId}: ${totalAllocated} allocated, ${totalSkipped} skipped.`);
}

// ─── Schedule management ──────────────────────────────────────────────────────

export function stopSchedule(configId: number): void {
  const existing = activeJobs.get(configId);
  if (existing) {
    existing.stop();
    activeJobs.delete(configId);
    console.log(`[AutoRun] Stopped schedule for configId=${configId}`);
  }
}

export function startSchedule(configId: number, cronExpression: string): void {
  stopSchedule(configId);

  // node-cron uses 5-field (standard) or 6-field (with seconds) cron expressions
  // Validate before scheduling
  if (!cron.validate(cronExpression)) {
    console.warn(`[AutoRun] Invalid cron expression "${cronExpression}" for configId=${configId}`);
    return;
  }

  const task = cron.schedule(cronExpression, async () => {
    try {
      await runAutoAllocation(configId);
    } catch (err) {
      console.error(`[AutoRun] Unhandled error for configId=${configId}:`, err);
    }
  });

  activeJobs.set(configId, task);
  console.log(`[AutoRun] Scheduled configId=${configId} with cron="${cronExpression}"`);
}

// ─── Boot: restore all enabled schedules from DB ─────────────────────────────

export async function initScheduler(): Promise<void> {
  console.log("[AutoRun] Initializing scheduler...");
  try {
    const configs = await getExtensivConfigs();
    for (const config of configs) {
      const schedule = await getScheduleConfig(config.id);
      if (schedule?.isEnabled && schedule.cronExpression) {
        startSchedule(config.id, schedule.cronExpression);
      }
    }
    console.log(`[AutoRun] Scheduler initialized. Active jobs: ${activeJobs.size}`);
  } catch (err) {
    console.error("[AutoRun] Failed to initialize scheduler:", err);
  }
}

// ─── Manual trigger (for testing/UI) ─────────────────────────────────────────

export async function triggerManualRun(configId: number): Promise<void> {
  await runAutoAllocation(configId);
}
