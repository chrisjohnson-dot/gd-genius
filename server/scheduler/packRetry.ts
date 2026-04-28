/**
 * Nightly Extensiv Pack-Retry Scheduler
 *
 * Fires every day at 03:00 UTC and retries markOrderPacked for all completed
 * QC sessions where packedInExtensiv = false (or NULL) and foundInExtensiv = true.
 *
 * Exports:
 *  - startPackRetryScheduler()  — call once at server startup
 *  - runPackRetryOnce()         — manual on-demand trigger (tRPC admin / scheduled endpoint)
 */
import cron, { ScheduledTask } from "node-cron";
import {
  getPendingPackSessions,
  getExtensivConfigById,
  updateQcSession,
  createAuditLog,
} from "../db";
import { markOrderPacked } from "../extensiv/api";

let task: ScheduledTask | null = null;

export interface PackRetryResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ sessionId: number; referenceNumber: string; error: string }>;
}

export async function runPackRetryOnce(): Promise<PackRetryResult> {
  const pending = await getPendingPackSessions();
  const result: PackRetryResult = {
    attempted: pending.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  if (pending.length === 0) {
    console.log("[PackRetry] No pending sessions to retry.");
    return result;
  }

  console.log(`[PackRetry] Retrying ${pending.length} pending session(s)…`);

  for (const session of pending) {
    try {
      const config = await getExtensivConfigById(session.warehouseId);
      if (!config) {
        const msg = `No Extensiv config for warehouseId ${session.warehouseId}`;
        console.warn(`[PackRetry] Session ${session.id}: ${msg}`);
        result.failed++;
        result.errors.push({ sessionId: session.id, referenceNumber: session.referenceNumber, error: msg });
        continue;
      }

      const packResult = await markOrderPacked(config, session.transactionId);
      if (packResult.success) {
        await updateQcSession(session.id, { packedInExtensiv: true });
        await createAuditLog({
          action: "qc.packRetry.success",
          entityType: "qc_scan_session",
          entityId: String(session.id),
          userId: undefined,
          details: JSON.stringify({
            sessionId: session.id,
            transactionId: session.transactionId,
            triggeredBy: "nightly-pack-retry",
          }),
        });
        console.log(`[PackRetry] Session ${session.id} (TX ${session.transactionId}): ✓ Packed`);
        result.succeeded++;
      } else {
        const msg = packResult.error ?? "Unknown Extensiv error";
        console.warn(`[PackRetry] Session ${session.id} (TX ${session.transactionId}): ✗ ${msg}`);
        result.failed++;
        result.errors.push({ sessionId: session.id, referenceNumber: session.referenceNumber, error: msg });
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error(`[PackRetry] Session ${session.id} threw: ${msg}`);
      result.failed++;
      result.errors.push({ sessionId: session.id, referenceNumber: session.referenceNumber, error: msg });
    }
  }

  console.log(
    `[PackRetry] Done. Attempted=${result.attempted} Succeeded=${result.succeeded} Failed=${result.failed}`
  );
  return result;
}

export function startPackRetryScheduler(): void {
  if (task) return; // already started

  // Run at 03:00 UTC every day
  task = cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const result = await runPackRetryOnce();
        if (result.failed > 0) {
          console.warn(
            `[PackRetry] Nightly run: ${result.succeeded} succeeded, ${result.failed} still failing.`
          );
        }
      } catch (err: any) {
        console.error("[PackRetry] Scheduler error:", err?.message);
      }
    },
    { timezone: "UTC" }
  );

  console.log("[PackRetry] Nightly pack-retry scheduler started (03:00 UTC daily)");
}
