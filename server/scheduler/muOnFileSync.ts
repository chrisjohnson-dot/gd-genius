/**
 * Nightly MU-on-file re-sync scheduler.
 *
 * Runs at 07:30 UTC (2:30 AM Eastern) every night — 30 minutes after the SKU dims sync.
 *
 * For each active Extensiv config, for each facility (warehouse), fetches all receivers
 * with detail=ReceiveItems and upserts every receiver item that has a muLabel into the
 * mu_labels table. This ensures the QC scanner can resolve MU barcodes instantly via a
 * fast DB lookup (Attempt 0) before falling back to live Extensiv API calls.
 *
 * The sync uses INSERT … ON DUPLICATE KEY UPDATE so it is safe to re-run at any time.
 * The unique key is (config_id, receiver_item_id, mu_label).
 */
import cron from "node-cron";
import { getDb, getExtensivConfigs } from "../db";
import { sql } from "drizzle-orm";
import { fetchAllFacilities, fetchCustomers } from "../extensiv/api";
import { createExtensivClient } from "../extensiv/client";
import type { ExtensivClientConfig } from "../extensiv/client";

let syncRunning = false;
let lastSyncAt: Date | null = null;
let lastSyncSummary: string | null = null;

// ─── Core sync function ───────────────────────────────────────────────────────
export async function syncMuOnFileNow(): Promise<{ success: boolean; message: string; muCount: number }> {
  if (syncRunning) {
    return { success: false, message: "MU on-file sync already in progress", muCount: 0 };
  }
  syncRunning = true;
  let totalMus = 0;
  try {
    const allConfigs = await getExtensivConfigs();
    const configs = allConfigs.filter((c) => c.isActive);
    if (configs.length === 0) {
      lastSyncAt = new Date();
      lastSyncSummary = "No active Extensiv configs found";
      return { success: true, message: lastSyncSummary, muCount: 0 };
    }

    for (const config of configs) {
      const clientConfig: ExtensivClientConfig = {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tplGuid: config.tplGuid,
        userLoginId: config.userLoginId,
        baseUrl: config.baseUrl,
      };
      const client = createExtensivClient(clientConfig);

      try {
        // Get all facilities for this config
        const facilities = await fetchAllFacilities(clientConfig);
        if (facilities.length === 0) {
          console.warn(`[MuOnFileSync] Config ${config.id}: no facilities found, skipping`);
          continue;
        }

        for (const facility of facilities) {
          console.log(`[MuOnFileSync] Config ${config.id} / Facility ${facility.id} (${facility.name}): starting receiver scan`);
          let facilityMus = 0;
          let pgnum = 1;
          const pgsiz = 100;

          while (true) {
            let receiversData: Record<string, unknown>;
            try {
              receiversData = (await client.get("/inventory/receivers", {
                rql: `ReadOnly.FacilityIdentifier.id==${facility.id}`,
                detail: "ReceiveItems",
                pgsiz,
                pgnum,
              })) as Record<string, unknown>;
            } catch (err: any) {
              console.error(`[MuOnFileSync] Config ${config.id} / Facility ${facility.id}: receivers fetch page ${pgnum} failed:`, err?.message);
              break;
            }

            // Extract receiver list — Extensiv returns HAL embedded or flat ResourceList
            let receiverList: Record<string, unknown>[] = [];
            const rl = receiversData["ResourceList"] ?? receiversData["resourceList"];
            if (Array.isArray(rl)) {
              receiverList = rl as Record<string, unknown>[];
            } else {
              const emb = (receiversData["_embedded"] ?? {}) as Record<string, unknown>;
              for (const key of Object.keys(emb)) {
                const arr = emb[key];
                if (Array.isArray(arr)) {
                  receiverList = arr as Record<string, unknown>[];
                  break;
                }
              }
            }

            if (receiverList.length === 0) break;

            const db = await getDb();
            if (!db) break;

            for (const receiver of receiverList) {
              const transactionId =
                (receiver["transactionId"] ?? receiver["TransactionId"]) as number | undefined;
              if (!transactionId) continue;

              // Collect items from embedded or top-level receiveItems array
              let items: Record<string, unknown>[] = [];
              const embR = (receiver["_embedded"] ?? {}) as Record<string, unknown>;
              for (const key of Object.keys(embR)) {
                const arr = embR[key];
                if (Array.isArray(arr)) {
                  items = arr as Record<string, unknown>[];
                  break;
                }
              }
              const topItems = receiver["receiveItems"] ?? receiver["ReceiveItems"];
              if (Array.isArray(topItems)) {
                items = [...items, ...(topItems as Record<string, unknown>[])];
              }

              for (const item of items) {
                const muLabel =
                  (item["muLabel"] ?? item["MuLabel"]) as string | undefined;
                if (!muLabel) continue; // skip items with no MU label

                const receiverItemId =
                  (item["receiverItemId"] ?? item["ReceiverItemId"] ?? item["id"] ?? item["Id"]) as number | undefined;
                if (!receiverItemId) continue;

                const sku =
                  ((item["itemIdentifier"] as Record<string, unknown> | undefined)?.["sku"] ??
                   (item["ItemIdentifier"] as Record<string, unknown> | undefined)?.["Sku"] ??
                   item["sku"] ?? item["Sku"] ?? "") as string;

                const muType =
                  (item["muType"] ?? item["MuType"] ?? "Pallet") as string;

                const qty =
                  ((item["received"] ?? item["Received"] ?? item["qty"] ?? item["Qty"] ?? 1) as number);

                try {
                  await db.execute(
                    sql`INSERT INTO mu_labels
                          (config_id, facility_id, transaction_id, receiver_item_id, sku, mu_label, mu_type, qty, synced_to_extensiv, created_at)
                        VALUES
                          (${config.id}, ${facility.id}, ${transactionId}, ${receiverItemId}, ${sku}, ${muLabel}, ${muType}, ${Math.round(qty)}, true, ${Date.now()})
                        ON DUPLICATE KEY UPDATE
                          facility_id        = VALUES(facility_id),
                          transaction_id     = VALUES(transaction_id),
                          sku                = VALUES(sku),
                          mu_type            = VALUES(mu_type),
                          qty                = VALUES(qty),
                          synced_to_extensiv = true,
                          created_at         = VALUES(created_at)`
                  );
                  facilityMus++;
                  totalMus++;
                } catch (upsertErr: any) {
                  console.error(
                    `[MuOnFileSync] Upsert failed for muLabel=${muLabel} receiverItemId=${receiverItemId}:`,
                    upsertErr?.message
                  );
                }
              }
            }

            // Pagination: stop when we got fewer than pgsiz records
            const totalResults = (receiversData["TotalResults"] ?? receiversData["totalResults"]) as number | undefined;
            if (receiverList.length < pgsiz) break;
            if (totalResults !== undefined && pgnum * pgsiz >= totalResults) break;
            pgnum++;
          }

          console.log(`[MuOnFileSync] Config ${config.id} / Facility ${facility.id} (${facility.name}): upserted ${facilityMus} MU records`);
        }
      } catch (err: any) {
        console.error(`[MuOnFileSync] Config ${config.id} failed:`, err?.message);
      }
    }

    lastSyncAt = new Date();
    lastSyncSummary = `Synced ${totalMus} MU label records across all warehouses`;
    return { success: true, message: lastSyncSummary, muCount: totalMus };
  } catch (err: any) {
    lastSyncSummary = `Error: ${err?.message}`;
    return { success: false, message: lastSyncSummary, muCount: 0 };
  } finally {
    syncRunning = false;
  }
}

export function getMuOnFileSyncInfo() {
  return { lastSyncAt, lastSyncSummary, syncRunning };
}

// ─── Scheduler: 2:30 AM Eastern = 07:30 UTC ──────────────────────────────────
export function startMuOnFileSyncScheduler() {
  // 07:30 UTC = 02:30 AM Eastern (EST) / 03:30 AM Eastern (EDT)
  cron.schedule("0 30 7 * * *", () => {
    console.log("[MuOnFileSync] Starting nightly MU on-file sync...");
    syncMuOnFileNow()
      .then((result) => console.log(`[MuOnFileSync] Completed: ${result.message}`))
      .catch((err) => console.error("[MuOnFileSync] Scheduler error:", err));
  });
  console.log("[MuOnFileSync] Nightly MU on-file sync scheduled at 07:30 UTC (2:30 AM Eastern)");
}
