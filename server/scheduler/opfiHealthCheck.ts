/**
 * OpFi Health Check Scheduler
 *
 * Runs testOpFiConnection() every 15 minutes and persists the result
 * to the cortex_connections.health_status column so the Cortex Integration
 * UI always shows an up-to-date connection badge without requiring a manual
 * "Test Connection" click.
 *
 * Exports:
 *  - startOpFiHealthCheckScheduler() — call once at server startup
 *  - runOpFiHealthCheckNow()         — on-demand trigger (used in tests)
 */

import { testOpFiConnection } from "../opfiRateSheets";
import { updateCortexHealthStatus } from "../db";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let _timer: ReturnType<typeof setInterval> | null = null;

/**
 * Run a single OpFi health probe and persist the result.
 * Never throws — all errors are caught and recorded as "error" status.
 */
export async function runOpFiHealthCheckNow(): Promise<{
  status: "ok" | "error";
  durationMs: number;
  detail: string;
}> {
  try {
    const result = await testOpFiConnection();
    await updateCortexHealthStatus("opfi", "ok");
    const detail = `HTTP ${result.httpStatus}, ${result.durationMs}ms` +
      (result.hasRateSheets ? ", rate sheets present" : ", no rate sheets for probe client");
    console.log(`[OpFiHealthCheck] OK — ${detail}`);
    return { status: "ok", durationMs: result.durationMs, detail };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateCortexHealthStatus("opfi", "error").catch(() => {
      // DB write failure should not mask the original error
    });
    console.warn(`[OpFiHealthCheck] FAILED — ${msg}`);
    return { status: "error", durationMs: 0, detail: msg };
  }
}

/**
 * Start the recurring 15-minute health check.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startOpFiHealthCheckScheduler(): void {
  if (_timer !== null) return; // already running

  // Run immediately on startup so the badge is populated right away
  void runOpFiHealthCheckNow();

  _timer = setInterval(() => {
    void runOpFiHealthCheckNow();
  }, INTERVAL_MS);

  console.log("[OpFiHealthCheck] Scheduler started — probing every 15 minutes.");
}

/**
 * Stop the scheduler (used in tests to avoid open handles).
 */
export function stopOpFiHealthCheckScheduler(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}
