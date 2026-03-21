/**
 * Overdue Order Morning Alert Scheduler
 *
 * Fires every day at a configurable time (default 07:00, stored in alert_settings)
 * and sends the owner a notification listing all unallocated orders whose Required
 * Ship Date has already passed.
 *
 * Suppression & Escalation rules:
 *  - An order is suppressed (skipped) if it was already notified today.
 *  - An order is ESCALATED if it was last notified 2+ calendar days ago (i.e. it
 *    was suppressed for at least one full day and has now re-surfaced). Escalated
 *    orders are always included regardless of today-suppression and are marked
 *    with "⚠️ ESCALATED" in the notification.
 *
 * Exports:
 *  - sendOverdueAlertNow()        — manual on-demand trigger (tRPC test button)
 *  - startOverdueAlertScheduler() — call once at server startup
 *  - rescheduleOverdueAlert()     — call after the user changes the alert time
 */

import cron, { ScheduledTask } from "node-cron";
import { getOverdueUnallocatedOrders, markOverdueAlertSent, getAlertTime } from "../db";
import { notifyOwner } from "../_core/notification";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of calendar days after which a suppressed order is re-escalated. */
export const ESCALATION_THRESHOLD_DAYS = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA"); // always YYYY-MM-DD
}

/** True when the order was already alerted today. */
export function alreadyNotifiedToday(lastSentAt: Date | null | undefined): boolean {
  if (!lastSentAt) return false;
  return new Date(lastSentAt).toLocaleDateString("en-CA") === todayDateStr();
}

/**
 * Returns the number of full calendar days since the last alert was sent.
 * Returns null if the order has never been alerted.
 */
export function daysSinceLastAlert(lastSentAt: Date | null | undefined): number | null {
  if (!lastSentAt) return null;
  const sentDate = new Date(lastSentAt);
  const today = new Date(todayDateStr());
  const diffMs = today.getTime() - new Date(sentDate.toLocaleDateString("en-CA")).getTime();
  return Math.floor(diffMs / 86_400_000);
}

/**
 * True when an order should be escalated:
 * it was notified at least ESCALATION_THRESHOLD_DAYS ago (was suppressed for
 * that many days and is now re-surfacing).
 */
export function isEscalated(lastSentAt: Date | null | undefined): boolean {
  const days = daysSinceLastAlert(lastSentAt);
  if (days === null) return false;
  return days >= ESCALATION_THRESHOLD_DAYS;
}

// ─── Core alert function ──────────────────────────────────────────────────────

export async function sendOverdueAlertNow(): Promise<{
  success: boolean;
  overdueCount: number;
  suppressedCount: number;
  escalatedCount: number;
  message: string;
}> {
  let allOverdue: Awaited<ReturnType<typeof getOverdueUnallocatedOrders>>;

  try {
    allOverdue = await getOverdueUnallocatedOrders();
  } catch (err) {
    console.error("[OverdueAlert] Failed to query overdue orders:", err);
    return { success: false, overdueCount: 0, suppressedCount: 0, escalatedCount: 0, message: "DB query failed" };
  }

  // ── Categorise orders ─────────────────────────────────────────────────────
  // Escalated: notified 2+ days ago — always include, mark as escalated
  // New/fresh: never notified or notified before today — include normally
  // Suppressed: notified today AND not escalated — skip
  const escalatedOrders = allOverdue.filter((o) => isEscalated(o.lastOverdueAlertSentAt));
  const freshOrders = allOverdue.filter(
    (o) => !alreadyNotifiedToday(o.lastOverdueAlertSentAt) && !isEscalated(o.lastOverdueAlertSentAt)
  );
  const suppressedOrders = allOverdue.filter(
    (o) => alreadyNotifiedToday(o.lastOverdueAlertSentAt) && !isEscalated(o.lastOverdueAlertSentAt)
  );

  const suppressedCount = suppressedOrders.length;
  const escalatedCount = escalatedOrders.length;
  // All orders to include in this run (escalated first for prominence)
  const orders = [...escalatedOrders, ...freshOrders];

  if (suppressedCount > 0) {
    console.log(`[OverdueAlert] Suppressed ${suppressedCount} order(s) already notified today.`);
  }
  if (escalatedCount > 0) {
    console.log(`[OverdueAlert] Escalating ${escalatedCount} order(s) suppressed for ${ESCALATION_THRESHOLD_DAYS}+ days.`);
  }

  if (orders.length === 0) {
    const msg = suppressedCount > 0
      ? `All ${suppressedCount} overdue order(s) already notified today — skipping.`
      : "No overdue orders";
    console.log(`[OverdueAlert] ${msg}`);
    return { success: true, overdueCount: 0, suppressedCount, escalatedCount: 0, message: msg };
  }

  // ── Build notification ────────────────────────────────────────────────────
  const today = todayDateStr();

  // Group by facility
  const byFacility = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.facilityName ?? `Facility #${o.facilityId}`;
    if (!byFacility.has(key)) byFacility.set(key, []);
    byFacility.get(key)!.push(o);
  }

  const escalatedSet = new Set(escalatedOrders.map((o) => o.extensivOrderId));

  const headerParts: string[] = [];
  if (escalatedCount > 0) headerParts.push(`${escalatedCount} escalated`);
  headerParts.push(`${freshOrders.length} new`);

  const lines: string[] = [
    `📦 **${orders.length} unallocated order${orders.length !== 1 ? "s" : ""} past their Required Ship Date** as of ${today}` +
      (escalatedCount > 0 ? ` (${headerParts.join(", ")})` : "") +
      ".\n",
  ];

  if (escalatedCount > 0) {
    lines.push(`> ⚠️ **${escalatedCount} order${escalatedCount !== 1 ? "s have" : " has"} been overdue for ${ESCALATION_THRESHOLD_DAYS}+ days without resolution — immediate action required.**\n`);
  }

  for (const [facility, facilityOrders] of Array.from(byFacility.entries())) {
    lines.push(`**${facility}** (${facilityOrders.length} order${facilityOrders.length !== 1 ? "s" : ""})`);
    for (const o of facilityOrders) {
      const ref = o.referenceNum ?? `#${o.extensivOrderId}`;
      const shipDate = o.requiredShipDate?.slice(0, 10) ?? "unknown";
      const daysLate = Math.floor((Date.now() - new Date(shipDate).getTime()) / 86_400_000);
      const client = o.clientName ?? "Unknown client";
      const dest = [o.shipToName, o.shipToCity].filter(Boolean).join(", ") || "—";
      const escalatedMarker = escalatedSet.has(o.extensivOrderId) ? " 🔴 **ESCALATED**" : "";
      const days = daysSinceLastAlert(o.lastOverdueAlertSentAt);
      const escalatedNote = escalatedSet.has(o.extensivOrderId) && days !== null
        ? ` (suppressed ${days}d)`
        : "";
      lines.push(`  • ${ref} | ${client} → ${dest} | Ship date: ${shipDate} (${daysLate}d overdue)${escalatedMarker}${escalatedNote}`);
    }
    lines.push("");
  }

  if (suppressedCount > 0) {
    lines.push(`_${suppressedCount} additional order${suppressedCount !== 1 ? "s were" : " was"} already notified today and excluded from this alert._`);
    lines.push("");
  }

  lines.push("Please action these orders as soon as possible.");

  const content = lines.join("\n");

  const titleParts: string[] = [];
  if (escalatedCount > 0) titleParts.push(`${escalatedCount} 🔴 Escalated`);
  titleParts.push(`${orders.length} Overdue`);
  const title = `⚠️ ${titleParts.join(", ")} Unallocated Order${orders.length !== 1 ? "s" : ""} — ${today}`;

  // ── Send notification ─────────────────────────────────────────────────────
  try {
    const sent = await notifyOwner({ title, content });
    if (sent) {
      const ids = orders.map((o) => o.extensivOrderId);
      await markOverdueAlertSent(ids);
      console.log(
        `[OverdueAlert] Notification sent — ${orders.length} orders notified (${escalatedCount} escalated, ${suppressedCount} suppressed).`
      );
      return {
        success: true,
        overdueCount: orders.length,
        suppressedCount,
        escalatedCount,
        message: `Notified: ${orders.length} overdue orders (${escalatedCount} escalated, ${suppressedCount} suppressed)`,
      };
    } else {
      console.warn("[OverdueAlert] Notification service returned false.");
      return { success: false, overdueCount: orders.length, suppressedCount, escalatedCount, message: "Notification service unavailable" };
    }
  } catch (err) {
    console.error("[OverdueAlert] Failed to send notification:", err);
    return { success: false, overdueCount: orders.length, suppressedCount, escalatedCount, message: "Notification send failed" };
  }
}

// ─── Dynamic scheduler ────────────────────────────────────────────────────────

let _task: ScheduledTask | null = null;

function buildCron(hour: number, minute: number): string {
  return `${minute} ${hour} * * *`;
}

export async function rescheduleOverdueAlert(): Promise<void> {
  if (_task) {
    _task.stop();
    _task = null;
  }

  const { hour, minute } = await getAlertTime();
  const expression = buildCron(hour, minute);
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(hour)}:${pad(minute)}`;

  _task = cron.schedule(expression, async () => {
    console.log(`[OverdueAlert] Running daily ${timeStr} overdue order check…`);
    await sendOverdueAlertNow();
  });

  console.log(`[OverdueAlert] Scheduler registered — fires daily at ${timeStr}.`);
}

export async function startOverdueAlertScheduler(): Promise<void> {
  await rescheduleOverdueAlert();
}
