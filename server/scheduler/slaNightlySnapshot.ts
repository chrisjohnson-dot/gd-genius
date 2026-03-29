/**
 * Nightly SLA Snapshot Scheduler
 *
 * Fires every day at 00:00 UTC (midnight) and records the current SLA rate for
 * every active facility into the sla_daily_snapshots table.  These snapshots
 * power the 7-day sparkline on each warehouse card in the SLA Tracker.
 *
 * Exports:
 *  - startSlaNightlySnapshot()   — call once at server startup
 *  - recordSlaNightlySnapshot()  — manual on-demand trigger (tRPC test button)
 */
import cron, { ScheduledTask } from "node-cron";
import { getOrderSlaStatuses, upsertSlaDailySnapshot } from "../db";
import { notifyOwner } from "../_core/notification";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in UTC. */
export function todayUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Core snapshot logic ──────────────────────────────────────────────────────

/**
 * Reads all tracked orders, groups them by facility, computes the in-SLA
 * percentage for each facility, and upserts one row per facility into
 * sla_daily_snapshots for today's date.
 *
 * Returns a summary array for logging / notification.
 */
export async function recordSlaNightlySnapshot(): Promise<
  Array<{ facilityId: number; facilityName: string; slaRate: number; total: number }>
> {
  console.log("[SlaNightlySnapshot] Starting nightly SLA snapshot...");

  const orders = await getOrderSlaStatuses();

  // Group by facilityId
  const facilityMap = new Map<
    number,
    { facilityName: string; inSla: number; total: number }
  >();

  for (const order of orders) {
    const fid = order.facilityId;
    const fname = order.facilityName ?? `Facility ${fid}`;
    if (!facilityMap.has(fid)) {
      facilityMap.set(fid, { facilityName: fname, inSla: 0, total: 0 });
    }
    const entry = facilityMap.get(fid)!;
    entry.total += 1;
    if (order.slaStatus === "in_sla") entry.inSla += 1;
  }

  const snapshotDate = todayUtcDateStr();
  const results: Array<{
    facilityId: number;
    facilityName: string;
    slaRate: number;
    total: number;
  }> = [];

  for (const [facilityId, { facilityName, inSla, total }] of Array.from(facilityMap.entries())) {
    const slaRate = total > 0 ? Math.round((inSla / total) * 100) : 100;
    await upsertSlaDailySnapshot({
      facilityId,
      facilityName,
      snapshotDate,
      inSlaCount: inSla,
      totalCount: total,
      slaRate,
    });
    results.push({ facilityId, facilityName, slaRate, total });
    console.log(
      `[SlaNightlySnapshot] ${facilityName} (id=${facilityId}): ${inSla}/${total} = ${slaRate}% in SLA`
    );
  }

  console.log(
    `[SlaNightlySnapshot] Done — recorded snapshots for ${results.length} facilities.`
  );
  return results;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let _task: ScheduledTask | null = null;

/**
 * Registers the midnight UTC cron job.  Safe to call multiple times — only one
 * task is ever active.
 */
export function startSlaNightlySnapshot(): void {
  if (_task) {
    console.log("[SlaNightlySnapshot] Scheduler already running, skipping re-register.");
    return;
  }

  // "0 0 0 * * *" = every day at 00:00:00 UTC (6-field node-cron format)
  _task = cron.schedule(
    "0 0 0 * * *",
    async () => {
      try {
        const results = await recordSlaNightlySnapshot();
        if (results.length > 0) {
          const lines = results
            .map((r) => `• ${r.facilityName}: ${r.slaRate}% in SLA (${r.total} orders)`)
            .join("\n");
          await notifyOwner({
            title: `Nightly SLA Snapshot — ${results.length} facilities recorded`,
            content: lines,
          });
        }
      } catch (err) {
        console.error("[SlaNightlySnapshot] Error during nightly snapshot:", err);
      }
    },
    { timezone: "UTC" }
  );

  console.log("[SlaNightlySnapshot] Scheduler registered — fires daily at 00:00 UTC.");
}

/** Stop the scheduler (useful in tests or graceful shutdown). */
export function stopSlaNightlySnapshot(): void {
  if (_task) {
    _task.stop();
    _task = null;
    console.log("[SlaNightlySnapshot] Scheduler stopped.");
  }
}
