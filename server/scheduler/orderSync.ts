/**
 * Order Sync Scheduler
 *
 * Runs every hour to sync open orders from Extensiv into the order_tracking table.
 * - New orders → inserted as 'unallocated'
 * - Existing orders → details refreshed, lifecycleStatus preserved
 * - Orders no longer in Extensiv (shipped/closed) → removed from table
 *
 * Also exposes a `syncOrdersNow()` function for manual on-demand sync.
 */

import cron from "node-cron";
import { getExtensivConfigs, upsertTrackedOrders } from "../db";
import { fetchAllFacilities, fetchCustomersForFacility, fetchOpenOrders } from "../extensiv/api";
import type { ExtensivClientConfig } from "../extensiv/client";

let syncRunning = false;
let lastSyncAt: Date | null = null;
let lastSyncSummary: string | null = null;

// ─── Core sync function ───────────────────────────────────────────────────────

export async function syncOrdersNow(): Promise<{
  success: boolean;
  inserted: number;
  updated: number;
  removed: number;
  message: string;
}> {
  if (syncRunning) {
    return { success: false, inserted: 0, updated: 0, removed: 0, message: "Sync already in progress" };
  }

  syncRunning = true;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalRemoved = 0;

  try {
    const configs = await getExtensivConfigs();
    if (configs.length === 0) {
      lastSyncAt = new Date();
      lastSyncSummary = "No Extensiv configs found";
      return { success: true, inserted: 0, updated: 0, removed: 0, message: lastSyncSummary };
    }

    for (const config of configs) {
      if (!config.isActive) continue;

      const clientConfig: ExtensivClientConfig = {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tplGuid: config.tplGuid,
        userLoginId: config.userLoginId,
        baseUrl: config.baseUrl,
      };

      try {
        const facilities = await fetchAllFacilities(clientConfig);
        if (facilities.length === 0) {
          console.warn(`[OrderSync] No facilities found for config ${config.id}`);
          continue;
        }

        for (const facility of facilities) {
          const facilityId = facility.id;
          const facilityName = facility.name;
          const facilityCustomers = await fetchCustomersForFacility(clientConfig, facilityId);
          if (facilityCustomers.length === 0) continue;
          {
          const ordersForFacility: Parameters<typeof upsertTrackedOrders>[0] = [];

          await Promise.all(
            facilityCustomers.map(async (customer: { id: number; name: string }) => {
              try {
                const orders = await fetchOpenOrders(clientConfig, customer.id, facilityId);
                for (const o of orders) {
                  const oRaw = o as unknown as Record<string, unknown>;
                  const totalPieces = (o.orderItems ?? []).reduce((s, item) => s + (item.qty ?? 0), 0);
                  const skuCount = new Set(
                    (o.orderItems ?? []).map((item) => item.itemIdentifier?.sku).filter(Boolean)
                  ).size;
                  // Capture savedElements (order-level custom fields) from Extensiv
                  const rawSavedElements = oRaw.savedElements;
                  let savedElementsJson: string | null = null;
                  if (Array.isArray(rawSavedElements) && rawSavedElements.length > 0) {
                    savedElementsJson = JSON.stringify(
                      rawSavedElements.map((el: unknown) => {
                        const e = el as Record<string, unknown>;
                        return { name: String(e.name ?? ""), value: String(e.value ?? "") };
                      })
                    );
                  }

                  ordersForFacility.push({
                    extensivOrderId: o.readOnly.orderId,
                    referenceNum: o.referenceNum ?? null,
                    poNum: (oRaw.poNum as string | null) ?? null,
                    configId: config.id,
                    clientId: customer.id,
                    clientName: customer.name,
                    facilityId: o.readOnly.facilityIdentifier?.id ?? facilityId,
                    facilityName: o.readOnly.facilityIdentifier?.name ?? facilityName,
                    shipToName: o.shipTo?.companyName ?? o.shipTo?.name ?? null,
                    shipToCity: o.shipTo?.city ?? null,
                    totalPieces,
                    skuCount,
                    notes: (oRaw.notes as string | null) ?? null,
                    savedElements: savedElementsJson,
                    extensivStatus: o.readOnly.status ?? 0,
                    fullyAllocated: o.readOnly.fullyAllocated ?? false,
                    creationDate: o.readOnly.creationDate ?? null,
                    requiredShipDate: o.earliestShipDate ?? (oRaw.earliestShipDate as string | null) ?? null,
                  });
                }
              } catch (err) {
                console.warn(`[OrderSync] Failed to fetch orders for customer ${customer.id}:`, err);
              }
            })
          );

          // Retry upsert up to 3 times on transient DB errors (ECONNRESET, timeout)
          let result = { inserted: 0, updated: 0, removed: 0 };
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              result = await upsertTrackedOrders(ordersForFacility, config.id, facilityId);
              break;
            } catch (dbErr: unknown) {
              const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
              if (attempt < 3 && (msg.includes('ECONNRESET') || msg.includes('timeout') || msg.includes('ETIMEDOUT'))) {
                console.warn(`[OrderSync] DB upsert attempt ${attempt} failed for facility ${facilityId}, retrying in 3s...`);
                await new Promise((res) => setTimeout(res, 3000));
              } else {
                console.error(`[OrderSync] DB upsert failed for facility ${facilityId} after ${attempt} attempt(s):`, dbErr);
                break;
              }
            }
          }
          totalInserted += result.inserted;
          totalUpdated += result.updated;
          totalRemoved += result.removed;
          console.log(
            `[OrderSync] Config ${config.id} / Facility ${facilityId}: +${result.inserted} new, ~${result.updated} updated, -${result.removed} removed`
          );
        } // end facility loop
        } // end facilities.forEach
      } catch (err) {
        console.error(`[OrderSync] Failed to sync config ${config.id}:`, err);
      }
    }

    lastSyncAt = new Date();
    lastSyncSummary = `+${totalInserted} new, ~${totalUpdated} updated, -${totalRemoved} removed`;
    console.log(`[OrderSync] Completed at ${lastSyncAt.toISOString()}: ${lastSyncSummary}`);
    return {
      success: true,
      inserted: totalInserted,
      updated: totalUpdated,
      removed: totalRemoved,
      message: lastSyncSummary,
    };
  } finally {
    syncRunning = false;
  }
}

export function getLastSyncInfo(): { lastSyncAt: Date | null; lastSyncSummary: string | null; syncRunning: boolean } {
  return { lastSyncAt, lastSyncSummary, syncRunning };
}

// ─── Hourly cron job ──────────────────────────────────────────────────────────

let syncJob: ReturnType<typeof cron.schedule> | null = null;

export function startOrderSyncScheduler(): void {
  if (syncJob) return; // already started

  // Run at the top of every hour
  syncJob = cron.schedule("0 0 * * * *", async () => {
    console.log("[OrderSync] Hourly sync triggered");
    await syncOrdersNow();
  });

  console.log("[OrderSync] Hourly order sync scheduler started");

  // Run an initial sync shortly after startup (30 seconds delay to let server settle)
  setTimeout(() => {
    console.log("[OrderSync] Running initial sync on startup");
    syncOrdersNow().catch((err) => console.error("[OrderSync] Initial sync failed:", err));
  }, 30_000);
}

export function stopOrderSyncScheduler(): void {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
  }
}
