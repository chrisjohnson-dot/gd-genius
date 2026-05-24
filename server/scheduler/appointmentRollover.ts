/**
 * Nightly Carrier Appointment Rollover Scheduler
 *
 * Fires every day at 23:55 UTC (just before midnight) and rolls over any
 * carrier appointment that is still in "scheduled" or "confirmed" status
 * on today's date by advancing its scheduledDate to the next calendar day.
 *
 * This ensures that appointments not completed on their booked day
 * automatically appear on the following day's list.
 *
 * Exports:
 *  - startAppointmentRolloverScheduler() — call once at server startup
 *  - rolloverPastAppointments()          — manual on-demand trigger
 */
import cron from "node-cron";
import { getDb } from "../db";
import { carrierAppointments } from "../../drizzle/schema";

// ─── Core rollover logic ──────────────────────────────────────────────────────

/**
 * Finds all "scheduled" or "confirmed" appointments whose scheduledDate is
 * strictly before today (UTC) and advances each one by one calendar day.
 *
 * Returns the number of appointments rolled over.
 */
export async function rolloverPastAppointments(): Promise<number> {
  console.log("[AppointmentRollover] Starting rollover check...");
  const db = await getDb();
  if (!db) {
    console.warn("[AppointmentRollover] DB unavailable — skipping.");
    return 0;
  }

  const { lt, or, eq, and } = await import("drizzle-orm");

  // Today's date in UTC as YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch all active (non-completed, non-cancelled) appointments scheduled before today
  const pastAppointments = await db
    .select({ id: carrierAppointments.id, scheduledDate: carrierAppointments.scheduledDate })
    .from(carrierAppointments)
    .where(
      and(
        lt(carrierAppointments.scheduledDate, todayStr),
        or(
          eq(carrierAppointments.status, "scheduled"),
          eq(carrierAppointments.status, "confirmed")
        )
      )
    );

  if (pastAppointments.length === 0) {
    console.log("[AppointmentRollover] No past appointments to roll over.");
    return 0;
  }

  let rolled = 0;
  for (const appt of pastAppointments) {
    // Advance the scheduledDate by one calendar day
    const current = new Date(appt.scheduledDate + "T00:00:00Z");
    current.setUTCDate(current.getUTCDate() + 1);
    const nextDate = current.toISOString().slice(0, 10);

    await db
      .update(carrierAppointments)
      .set({ scheduledDate: nextDate, updatedAt: new Date() })
      .where(eq(carrierAppointments.id, appt.id));

    rolled++;
  }

  console.log(`[AppointmentRollover] Rolled over ${rolled} appointment(s) to the next day.`);
  return rolled;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Starts the nightly rollover cron job.
 * Fires at 23:55 UTC every day.
 */
export function startAppointmentRolloverScheduler(): void {
  // Cron: seconds minutes hours day-of-month month day-of-week
  // 0 55 23 * * * = every day at 23:55:00 UTC
  cron.schedule("0 55 23 * * *", async () => {
    try {
      const count = await rolloverPastAppointments();
      if (count > 0) {
        console.log(`[AppointmentRollover] Nightly rollover complete — ${count} appointment(s) moved to next day.`);
      }
    } catch (err) {
      console.error("[AppointmentRollover] Nightly rollover failed:", err);
    }
  });
  console.log("[AppointmentRollover] Scheduler started — fires nightly at 23:55 UTC.");
}
