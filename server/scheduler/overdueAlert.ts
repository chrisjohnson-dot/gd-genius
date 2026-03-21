/**
 * Overdue Order Morning Alert Scheduler
 *
 * Fires every day at 7:00 AM (server local time) and sends the owner a
 * notification listing all unallocated orders whose Required Ship Date has
 * already passed.
 *
 * Also exports `sendOverdueAlertNow()` for manual on-demand triggering
 * (used by the tRPC test-trigger procedure).
 */

import cron from "node-cron";
import { getOverdueUnallocatedOrders } from "../db";
import { notifyOwner } from "../_core/notification";

// ─── Core alert function ──────────────────────────────────────────────────────

export async function sendOverdueAlertNow(): Promise<{
  success: boolean;
  overdueCount: number;
  message: string;
}> {
  let orders: Awaited<ReturnType<typeof getOverdueUnallocatedOrders>>;

  try {
    orders = await getOverdueUnallocatedOrders();
  } catch (err) {
    console.error("[OverdueAlert] Failed to query overdue orders:", err);
    return { success: false, overdueCount: 0, message: "DB query failed" };
  }

  if (orders.length === 0) {
    console.log("[OverdueAlert] No overdue unallocated orders — skipping notification.");
    return { success: true, overdueCount: 0, message: "No overdue orders" };
  }

  // Build notification content
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

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

  lines.push("Please action these orders as soon as possible.");

  const content = lines.join("\n");
  const title = `⚠️ ${orders.length} Overdue Unallocated Order${orders.length !== 1 ? "s" : ""} — ${today}`;

  try {
    const sent = await notifyOwner({ title, content });
    if (sent) {
      console.log(`[OverdueAlert] Notification sent — ${orders.length} overdue orders.`);
      return { success: true, overdueCount: orders.length, message: `Notified: ${orders.length} overdue orders` };
    } else {
      console.warn("[OverdueAlert] Notification service returned false — may be temporarily unavailable.");
      return { success: false, overdueCount: orders.length, message: "Notification service unavailable" };
    }
  } catch (err) {
    console.error("[OverdueAlert] Failed to send notification:", err);
    return { success: false, overdueCount: orders.length, message: "Notification send failed" };
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
