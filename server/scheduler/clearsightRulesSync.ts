/**
 * ClearSight Retailer Rules Sync — STUB
 *
 * This scheduler will perform a nightly pull of retailer-specific allocation
 * rules from the GD ClearSight API and upsert them into the customer_rules table.
 *
 * Rules to be synced (once ClearSight endpoint is ready):
 *   - Minimum remaining shelf life (days)
 *   - Inventory sort preference (FEFO / LIFO / FIFO override)
 *   - Lot mixing restriction
 *   - Retailer compliance notes
 *
 * TODO: Activate once ClearSight exposes a retailer rules endpoint.
 *       Expected endpoint: GET {clearsightBaseUrl}/api/retailer-rules
 *       Auth: outbound API key stored in cortex_connections (platform = "clearsight")
 */

import cron from "node-cron";

let syncRunning = false;
let lastSyncAt: Date | null = null;
let lastSyncSummary: string = "Never run — ClearSight rules sync not yet active.";

/**
 * Stub sync function. Returns immediately with a no-op result until
 * ClearSight exposes the retailer rules endpoint.
 */
export async function syncClearSightRulesNow(): Promise<{
  success: boolean;
  updated: number;
  message: string;
}> {
  if (syncRunning) {
    return { success: false, updated: 0, message: "Sync already in progress" };
  }

  syncRunning = true;
  try {
    // ── STUB: no live call yet ────────────────────────────────────────────────
    // When ClearSight is ready, replace this block with:
    //   const conn = await getCortexConnection("clearsight");
    //   if (!conn) throw new Error("ClearSight not configured");
    //   const res = await fetch(`${conn.baseUrl}/api/retailer-rules`, {
    //     headers: { "x-api-key": conn.outboundApiKey },
    //   });
    //   const rules = await res.json();
    //   for (const rule of rules) { await upsertCustomerRuleFromClearSight(rule); }
    // ─────────────────────────────────────────────────────────────────────────

    lastSyncAt = new Date();
    lastSyncSummary = "Stub — ClearSight rules endpoint not yet configured. No data synced.";
    console.log("[ClearSightRulesSync] Stub run — no live endpoint configured.");
    return { success: true, updated: 0, message: lastSyncSummary };
  } finally {
    syncRunning = false;
  }
}

/** Status accessor for health checks / admin UI. */
export function getClearSightRulesSyncStatus() {
  return { running: syncRunning, lastSyncAt, lastSyncSummary };
}

/** Start the nightly ClearSight rules sync scheduler (02:30 UTC). */
export function startClearSightRulesSyncScheduler() {
  // Runs at 02:30 UTC every night — after the SLA snapshot (midnight) and
  // scan image purge (02:00) so DB load is spread across the night window.
  cron.schedule("0 30 2 * * *", async () => {
    console.log("[ClearSightRulesSync] Running nightly retailer rules sync...");
    await syncClearSightRulesNow();
  });
  console.log("[ClearSightRulesSync] Nightly retailer rules sync scheduler registered (02:30 UTC) — stub mode");
}
