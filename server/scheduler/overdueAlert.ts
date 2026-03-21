/**
 * Overdue Order Morning Alert Scheduler
 *
 * Fires every day at 7:00 AM (server local time) and sends the owner a
 * notification listing all unallocated orders whose Required Ship Date has
 * already passed.
 *
 * Alert suppression: each order is only included in the notification once per
 * calendar day. If `lastOverdueAlertSentAt` is already set to today's date the
 * order is skipped. After a successful notification the timestamp is stamped on
 * every included order so they won't appear again until tomorrow.
 *
 * Also exports `sendOverdueAlertNow()` for manual on-demand triggering
 * (used by the tRPC test-trigger procedure).
 */

import cron from "node-cron";
import { getOverdueUnallocatedOrders, markOverdueAlertSent } from "../db";
import { notifyOwner } from "../_core/notification";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" in the server's local timezone. */
function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA"); // always YYYY-MM-DD
}

/** True when the order was already alerted today. */
function alreadyNotifiedToday(lastSentAt: Date | null | undefined): boolean {
  if (!lastSentAt) return false;
  return new Date(lastSentAt).toLocaleDateString("en-CA") === todayDateStr();
}

// ─── Core alert function ──────────────────────────────────────────────────────

export async function sendOverdueAlertNow(): Promise<{
  success: boolean;
  overdueCount: number;
  suppressedCount: number;
  message: string;
}> {
  let allOverdue: Awaited<ReturnType<typeof getOverdueUnallocatedOrders>>;

  try {
    allOverdue = await getOverdueUnallocatedOrders();
  } catch (err) {
    console.error("[OverdueAlert] Failed to query overdue orders:", err);
    return { success: false, overdueCount: 0, suppressedCount: 0, message: "DB query failed" };
  }

  // ── Suppression filter ────────────────────────────────────────────────────
  const suppressedOrders = allOverdue.filter((o) => alreadyNotifiedToday(o.lastOverdueAlertSentAt));
  const orders = allOverdue.filter((o) => !alreadyNotifiedToday(o.lastOverdueAlertSentAt));
  const suppressedCount = suppressedOrders.length;

  if (suppressedCount > 0) {
    console.log(`[OverdueAlert] Suppressed ${suppressedCount} order(s) already notified today.`);
  }

  if (orders.length === 0) {
    const msg = suppressedCount > 0
      ? `All ${suppressedCount} overdue order(s) already notified today — skipping.`
      : "No overdue orders";
    console.log(`[OverdueAlert] ${msg}`);
    return { success: true, overdueCount: 0, suppressedCount, message: msg };
  }

  // ── Build notification ────────────────────────────────────────────────────
  const today = todayDateStr();

  // Group by facility for a cleaner message
  const byFacility = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.facilityName ?? `Facility #${o.facilityId}`;
    if (!byFacility.has(key)) byFacility.set(key, []);
    byFacility.get(key)!.push(o);
  }

  const lines: string[] = [
    `📦 **${orders.length} unallocated order${orders.length !== 1 ? "s" : ""} past their Required Ship Date** as of ${today}.\n`,
  ];

  for (const [facility, facilityOrders] of Array.from(byFacility.entries())) {
    lines.push(`**${facility}** (${facilityOrders.length} order${facilityOrders.length !== 1 ? "s" : ""})`);
    for (const o of facilityOrders) {
      const ref = o.referenceNum ?? `#${o.extensivOrderId}`;
      const shipDate = o.requiredShipDate?.slice(0, 10) ?? "unknown";
      const daysLate = Math.floor(
        (Date.now() - new Date(shipDate).getTime()) / 86_400_000
      );
      const client = o.clientName ?? "Unknown client";
      const dest = [o.shipToName, o.shipToCity].filter(Boolean).join(", ") || "—";
      lines.push(`  • ${ref} | ${client} → ${dest} | Ship date: ${shipDate} (${daysLate}d overdue)`);
    }
    lines.push("");
  }

  if (suppressedCount > 0) {
    lines.push(`_${suppressedCount} additional order${suppressedCount !== 1 ? "s were" : " was"} already notified today and excluded from this alert._`);
    lines.push("");
  }

  lines.push("Please action these orders as soon as possible.");

  const content = lines.join("\n");
  const title = `⚠️ ${orders.length} Overdue Unallocated Order${orders.length !== 1 ? "s" : ""} — ${today}`;

  // ── Send notification ─────────────────────────────────────────────────────
  try {
    const sent = await notifyOwner({ title, content });
    if (sent) {
      // Stamp all notified orders so they won't fire again today
      const ids = orders.map((o) => o.extensivOrderId);
      await markOverdueAlertSent(ids);
      console.log(`[OverdueAlert] Notification sent — ${orders.length} orders notified, ${suppressedCount} suppressed.`);
      return {
        success: true,
        overdueCount: orders.length,
        suppressedCount,
        message: `Notified: ${orders.length} overdue orders (${suppressedCount} suppressed)`,
      };
    } else {
      console.warn("[OverdueAlert] Notification service returned false — may be temporarily unavailable.");
      return { success: false, overdueCount: orders.length, suppressedCount, message: "Notification service unavailable" };
    }
  } catch (err) {
    console.error("[OverdueAlert] Failed to send notification:", err);
    return { success: false, overdueCount: orders.length, suppressedCount, message: "Notification send failed" };
  }
}

// ─── Scheduler bootstrap ──────────────────────────────────────────────────────

/**
 * Start the daily 7 AM overdue order alert cron job.
 * Call once at server startup.
 */
export function startOverdueAlertScheduler(): void {
  // "0 7 * * *" = every day at 07:00 local server time
  cron.schedule("0 7 * * *", async () => {
    console.log("[OverdueAlert] Running daily 7 AM overdue order check…");
    await sendOverdueAlertNow();
  });
  console.log("[OverdueAlert] Scheduler registered — fires daily at 07:00.");
}
