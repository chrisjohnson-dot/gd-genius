/**
 * Heartbeat handler — POST /api/scheduled/orderSync
 *
 * Called by the Manus platform every 15 minutes.
 * Tries to sync orders from Cortex first (fast path).
 * Falls back to direct Extensiv sync if Cortex is not configured or errors.
 */

import type { Request, Response } from "express";
import { syncOrdersFromCortex } from "../scheduler/cortexOrderSync";
import { syncOrdersNow } from "../scheduler/orderSync";

export async function scheduledOrderSyncHandler(req: Request, res: Response): Promise<void> {
  const taskUid = req.headers["x-manus-cron-task-uid"] as string | undefined;
  console.log(`[ScheduledOrderSync] Triggered by Heartbeat (taskUid=${taskUid ?? "unknown"})`);

  try {
    // Attempt Cortex-first sync
    let result;
    try {
      result = await syncOrdersFromCortex();
    } catch (cortexErr: unknown) {
      const msg = cortexErr instanceof Error ? cortexErr.message : String(cortexErr);
      console.warn(`[ScheduledOrderSync] Cortex sync failed (${msg}), falling back to Extensiv`);
      result = null;
    }

    // Fall back to direct Extensiv sync if Cortex not configured or errored
    if (result === null) {
      console.log("[ScheduledOrderSync] Cortex not available — running direct Extensiv sync");
      const extensivResult = await syncOrdersNow();
      res.json({
        ok: true,
        source: "extensiv_fallback",
        ...extensivResult,
        taskUid,
      });
      return;
    }

    res.json({
      ok: true,
      ...result,
      taskUid,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[ScheduledOrderSync] Handler error:", err);
    res.status(500).json({
      error: msg,
      stack,
      context: { url: req.url, taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
