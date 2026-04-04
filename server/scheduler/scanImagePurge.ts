/**
 * Nightly Scan Image Purge Scheduler
 *
 * Fires every day at 02:00 UTC and purges scan images (Camera A, B, C) that
 * are older than the configured scanImageRetentionDays window.
 * If scanImageRetentionDays = 0, the job runs but immediately exits (no purge).
 *
 * Exports:
 *  - startScanImagePurgeScheduler()  — call once at server startup
 *  - runScanImagePurgeOnce()         — manual on-demand trigger (tRPC admin)
 */
import cron, { ScheduledTask } from "node-cron";
import { runScanImageRetentionPurge } from "../scanImageRetention";

let task: ScheduledTask | null = null;

export async function runScanImagePurgeOnce(): Promise<ReturnType<typeof runScanImageRetentionPurge>> {
  return runScanImageRetentionPurge();
}

export function startScanImagePurgeScheduler(): void {
  if (task) return; // already started
  // Run at 02:00 UTC every day
  task = cron.schedule("0 2 * * *", async () => {
    try {
      const result = await runScanImageRetentionPurge();
      console.log(
        `[ScanImagePurge] Nightly run complete. Purged=${result.purgedCount} Skipped=${result.skippedCount} Errors=${result.errors.length}`
      );
    } catch (err: any) {
      console.error("[ScanImagePurge] Scheduler error:", err?.message);
    }
  }, { timezone: "UTC" });

  console.log("[ScanImagePurge] Nightly purge scheduler started (02:00 UTC daily)");
}
