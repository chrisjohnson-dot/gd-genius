/**
 * Item Dims Nightly Sync Scheduler
 *
 * Runs every night at 2:00 AM Eastern (07:00 UTC) to sync SKU dimensions,
 * carton weights, and case quantities from Extensiv into the item_dims table.
 *
 * The calculatePalletWeight procedure reads from this table first (fast DB lookup)
 * before falling back to live Extensiv API calls.
 */
import cron from "node-cron";
import { getDb, getExtensivConfigs } from "../db";
import { sql } from "drizzle-orm";
import { fetchItemCartonWeightMap, fetchItemCaseAmountMap, fetchItemUnitWeightMap, fetchCustomers } from "../extensiv/api";
import type { ExtensivClientConfig } from "../extensiv/client";

let syncRunning = false;
let lastSyncAt: Date | null = null;
let lastSyncSummary: string | null = null;

// ─── Core sync function ───────────────────────────────────────────────────────
export async function syncItemDimsNow(): Promise<{ success: boolean; message: string; skuCount: number }> {
  if (syncRunning) {
    return { success: false, message: "Item dims sync already in progress", skuCount: 0 };
  }
  syncRunning = true;
  let totalSkus = 0;
  try {
    const allConfigs = await getExtensivConfigs();
    const configs = allConfigs.filter(c => c.isActive);
    if (configs.length === 0) {
      lastSyncAt = new Date();
      lastSyncSummary = "No active Extensiv configs found";
      return { success: true, message: lastSyncSummary, skuCount: 0 };
    }

    for (const config of configs) {
      const clientConfig: ExtensivClientConfig = {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tplGuid: config.tplGuid,
        userLoginId: config.userLoginId,
        baseUrl: config.baseUrl,
      };

      try {
        const customers = await fetchCustomers(clientConfig);
        for (const customer of customers) {
          if (!customer.id) continue;
          try {
            // Fetch carton weights, case amounts, and per-unit weights in parallel
            const [cartonWeightMap, caseAmountMap, unitWeightMap] = await Promise.all([
              fetchItemCartonWeightMap(clientConfig, customer.id),
              fetchItemCaseAmountMap(clientConfig, customer.id),
              fetchItemUnitWeightMap(clientConfig, customer.id),
            ]);

            // Merge all SKUs from all maps
            const allSkus = new Set([...cartonWeightMap.keys(), ...caseAmountMap.keys(), ...unitWeightMap.keys()]);
            if (allSkus.size === 0) continue;

            // Upsert each SKU into item_dims
            for (const sku of allSkus) {
              const cartonWeightLb = cartonWeightMap.get(sku) ?? null;
              const unitsPerCarton = caseAmountMap.get(sku) ?? null;
              // unit_weight_lb: prefer carton/units calculation, fall back to item-level imperial.weight
              const unitWeightLb =
                cartonWeightLb != null && unitsPerCarton != null && unitsPerCarton > 0
                  ? cartonWeightLb / unitsPerCarton
                  : (unitWeightMap.get(sku) ?? null);

              const db = await getDb();
              if (!db) continue;
              await db.execute(
                sql`INSERT INTO item_dims (config_id, customer_id, sku, unit_weight_lb, carton_weight_lb, units_per_carton, synced_at)
                 VALUES (${config.id}, ${customer.id}, ${sku}, ${unitWeightLb}, ${cartonWeightLb}, ${unitsPerCarton}, NOW())
                 ON DUPLICATE KEY UPDATE
                   unit_weight_lb = VALUES(unit_weight_lb),
                   carton_weight_lb = VALUES(carton_weight_lb),
                   units_per_carton = VALUES(units_per_carton),
                   synced_at = NOW()`
              );
              totalSkus++;
            }
            console.log(`[ItemDimsSync] Config ${config.id} / Customer ${customer.id}: synced ${allSkus.size} SKUs`);
          } catch (err: any) {
            console.error(`[ItemDimsSync] Config ${config.id} / Customer ${customer.id} failed:`, err?.message);
          }
        }
      } catch (err: any) {
        console.error(`[ItemDimsSync] Config ${config.id} failed:`, err?.message);
      }
    }

    lastSyncAt = new Date();
    lastSyncSummary = `Synced ${totalSkus} SKU dims`;
    return { success: true, message: lastSyncSummary, skuCount: totalSkus };
  } catch (err: any) {
    lastSyncSummary = `Error: ${err?.message}`;
    return { success: false, message: lastSyncSummary, skuCount: 0 };
  } finally {
    syncRunning = false;
  }
}

export function getItemDimsSyncInfo() {
  return { lastSyncAt, lastSyncSummary, syncRunning };
}

// ─── Scheduler: 2:00 AM Eastern = 07:00 UTC ──────────────────────────────────
export function startItemDimsSyncScheduler() {
  // 07:00 UTC = 02:00 AM Eastern (EST) / 03:00 AM Eastern (EDT)
  cron.schedule("0 7 * * *", () => {
    console.log("[ItemDimsSync] Starting nightly SKU dims sync...");
    syncItemDimsNow()
      .then((result) => console.log(`[ItemDimsSync] Completed: ${result.message}`))
      .catch((err) => console.error("[ItemDimsSync] Scheduler error:", err));
  });
  console.log("[ItemDimsSync] Nightly sync scheduled at 07:00 UTC (2:00 AM Eastern)");
}
