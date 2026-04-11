import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

// ─── Helper: run the session check ────────────────────────────────────────────
export async function checkOverdueSessions(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = Date.now();

  // Fetch all enabled settings
  // drizzle execute() for MySQL returns [[rows], fields] — unwrap with [0]
  const settingsResult = await db.execute<any>(
    sql`SELECT * FROM pull_alert_settings WHERE enabled = 1`
  );
  const settings = ((settingsResult as any[])[0] ?? []) as Array<{
    warehouse_id: string;
    threshold_minutes: number;
    re_alert_multiplier: number;
  }>;
  if (settings.length === 0) return 0;

  const globalSetting = settings.find((s) => s.warehouse_id === "all");
  const globalThreshold = globalSetting?.threshold_minutes ?? 120;
  const globalMultiplier = globalSetting?.re_alert_multiplier ?? 2;
  const warehouseThresholds: Record<string, number> = {};
  const warehouseMultipliers: Record<string, number> = {};
  settings.forEach((s) => {
    if (s.warehouse_id !== "all") {
      warehouseThresholds[s.warehouse_id] = s.threshold_minutes;
      warehouseMultipliers[s.warehouse_id] = s.re_alert_multiplier ?? globalMultiplier;
    }
  });

  // Fetch active sessions
  const sessionResult = await db.execute<any>(
    sql`SELECT id, pick_ticket, associate_id, associate_name, warehouse_id, started_at
        FROM pull_sessions WHERE status = 'active'`
  );
  const activeSessions = ((sessionResult as any[])[0] ?? []) as Array<{
    id: number;
    pick_ticket: string | null;
    associate_id: string | null;
    associate_name: string | null;
    warehouse_id: string | null;
    started_at: number;
  }>;

  let firedCount = 0;

  for (const session of activeSessions) {
    // Normalize id — TiDB may return BigInt; cast to plain number for sql interpolation
    const sessionId = Number(session.id);
    const threshold =
      session.warehouse_id && warehouseThresholds[session.warehouse_id] !== undefined
        ? warehouseThresholds[session.warehouse_id]
        : globalThreshold;

    // started_at may be a Date object or a number/string from TiDB
    const rawStartedAt: unknown = session.started_at;
    const startedAtMs = rawStartedAt instanceof Date
      ? rawStartedAt.getTime()
      : Number(rawStartedAt);
    const elapsedMinutes = Math.floor((now - startedAtMs) / 60000);
    if (elapsedMinutes < threshold) continue;

    const multiplier =
      session.warehouse_id && warehouseMultipliers[session.warehouse_id] !== undefined
        ? warehouseMultipliers[session.warehouse_id]
        : globalMultiplier;
    const escalationThreshold = threshold * multiplier;

    // Determine what alert level should fire now
    // level 1 = initial (elapsed >= threshold), level 2 = escalation (elapsed >= threshold * multiplier)
    const targetLevel = elapsedMinutes >= escalationThreshold ? 2 : 1;

    // Check existing alerts for this session
    const existingResult = await db.execute<any>(
      sql`SELECT alert_level FROM pull_session_alerts WHERE session_id = ${sessionId} ORDER BY alert_level DESC LIMIT 1`
    );
    const existingRows = (existingResult as any[])[0] ?? [];
    const highestExistingLevel: number = (existingRows as any[])[0]?.alert_level ?? 0;

    // Skip if we've already fired an alert at this level or higher
    if (highestExistingLevel >= targetLevel) continue;

    const alertLevel = targetLevel;
    const isEscalation = alertLevel >= 2;

    // Insert alert
    await db.execute(
      sql`INSERT INTO pull_session_alerts
          (session_id, pick_ticket, associate_id, associate_name, warehouse_id,
           elapsed_minutes, threshold_minutes, alerted_at, acknowledged, alert_level)
         VALUES (${sessionId}, ${session.pick_ticket}, ${session.associate_id},
                 ${session.associate_name}, ${session.warehouse_id},
                 ${elapsedMinutes}, ${threshold}, ${now}, 0, ${alertLevel})`
    );

    // Push owner notification
    const associateLabel = session.associate_name ?? session.associate_id ?? "Unknown";
    const warehouseLabel = session.warehouse_id ?? "Unknown warehouse";
    if (isEscalation) {
      await notifyOwner({
        title: `🚨 ESCALATION: Pull Session Still Running — ${associateLabel}`,
        content: `Pull session for **${associateLabel}** at **${warehouseLabel}** has been running for **${elapsedMinutes} minutes** — that's ${multiplier}× the ${threshold}-min threshold. Immediate attention required. Pick ticket: ${session.pick_ticket ?? "N/A"}.`,
      });
    } else {
      await notifyOwner({
        title: `⚠️ Overdue Pull Session — ${associateLabel}`,
        content: `Pull session for **${associateLabel}** at **${warehouseLabel}** has been running for **${elapsedMinutes} minutes** (threshold: ${threshold} min). Pick ticket: ${session.pick_ticket ?? "N/A"}.`,
      });
    }

    firedCount++;
  }

  return firedCount;
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const pullAlertsRouter = router({
  /** Get all alert settings */
  getSettings: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute<any>(
      sql`SELECT * FROM pull_alert_settings ORDER BY warehouse_id`
    );
    const rows = (result as any[])[0] ?? [];
    return ((rows as any[]) as Array<{
      id: number;
      warehouse_id: string;
      threshold_minutes: number;
      re_alert_multiplier: number;
      enabled: number;
      notify_email: string | null;
      updated_at: number;
      expected_items_per_hour: number | null;
    }>).map((s) => ({
      id: s.id,
      warehouseId: s.warehouse_id,
      thresholdMinutes: s.threshold_minutes,
      reAlertMultiplier: Number(s.re_alert_multiplier ?? 2),
      enabled: Boolean(s.enabled),
      notifyEmail: s.notify_email,
      updatedAt: s.updated_at,
      expectedItemsPerHour: s.expected_items_per_hour != null ? Number(s.expected_items_per_hour) : null,
    }));
  }),

  /** Upsert a setting for a warehouse (or 'all' for global) */
  saveSetting: protectedProcedure
    .input(
      z.object({
        warehouseId: z.string().default("all"),
        thresholdMinutes: z.number().int().min(1).max(1440),
        reAlertMultiplier: z.number().min(1).max(10).default(2),
        enabled: z.boolean(),
        notifyEmail: z.string().email().optional().nullable(),
        expectedItemsPerHour: z.number().min(1).max(9999).optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const now = Date.now();
      const enabledVal = input.enabled ? 1 : 0;
      const emailVal = input.notifyEmail ?? null;
      const multiplierVal = input.reAlertMultiplier ?? 2;
      const rateVal = input.expectedItemsPerHour ?? null;
      await db.execute(
        sql`INSERT INTO pull_alert_settings
              (warehouse_id, threshold_minutes, re_alert_multiplier, enabled, notify_email, expected_items_per_hour, created_at, updated_at)
            VALUES (${input.warehouseId}, ${input.thresholdMinutes}, ${multiplierVal}, ${enabledVal}, ${emailVal}, ${rateVal}, ${now}, ${now})
            ON DUPLICATE KEY UPDATE
              threshold_minutes = VALUES(threshold_minutes),
              re_alert_multiplier = VALUES(re_alert_multiplier),
              enabled = VALUES(enabled),
              notify_email = VALUES(notify_email),
              expected_items_per_hour = VALUES(expected_items_per_hour),
              updated_at = VALUES(updated_at)`
      );
      return { success: true };
    }),

  /** Delete a per-warehouse override */
  deleteSetting: protectedProcedure
    .input(z.object({ warehouseId: z.string() }))
    .mutation(async ({ input }) => {
      if (input.warehouseId === "all") throw new Error("Cannot delete the global setting.");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(
        sql`DELETE FROM pull_alert_settings WHERE warehouse_id = ${input.warehouseId}`
      );
      return { success: true };
    }),

  /** List alerts */
  getAlerts: protectedProcedure
    .input(
      z.object({
        includeAcknowledged: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = input.includeAcknowledged
        ? await db.execute<any>(
            sql`SELECT * FROM pull_session_alerts
                ORDER BY acknowledged ASC, alerted_at DESC
                LIMIT ${input.limit}`
          )
        : await db.execute<any>(
            sql`SELECT * FROM pull_session_alerts
                WHERE acknowledged = 0
                ORDER BY alerted_at DESC
                LIMIT ${input.limit}`
          );
      const alertRows = (rows as any[])[0] ?? [];
      return ((alertRows as any[]) as Array<{
        id: number;
        session_id: number;
        pick_ticket: string | null;
        associate_id: string | null;
        associate_name: string | null;
        warehouse_id: string | null;
        elapsed_minutes: number;
        threshold_minutes: number;
        alerted_at: number;
        acknowledged: number;
        acknowledged_at: number | null;
        acknowledged_by: string | null;
        alert_level: number;
        manager_note: string | null;
      }>).map((a) => ({
        id: a.id,
        sessionId: a.session_id,
        pickTicket: a.pick_ticket,
        associateId: a.associate_id,
        associateName: a.associate_name,
        warehouseId: a.warehouse_id,
        elapsedMinutes: a.elapsed_minutes,
        thresholdMinutes: a.threshold_minutes,
        alertedAt: a.alerted_at,
        acknowledged: Boolean(a.acknowledged),
        acknowledgedAt: a.acknowledged_at,
        acknowledgedBy: a.acknowledged_by,
        alertLevel: Number(a.alert_level ?? 1),
        managerNote: a.manager_note ?? null,
      }));
    }),

  /** Count of unacknowledged alerts */
  getUnreadCount: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const rows = await db.execute<any>(
      sql`SELECT COUNT(*) as cnt FROM pull_session_alerts WHERE acknowledged = 0`
    );
    const countRows = (rows as any[])[0] ?? [];
    return { count: Number((countRows as any[])[0]?.cnt ?? 0) };
  }),

  /** Acknowledge one or all alerts */
  acknowledge: protectedProcedure
    .input(
      z.object({
        alertId: z.number().int().optional(),
        acknowledgedBy: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const now = Date.now();
      const by = input.acknowledgedBy ?? (ctx.user as any)?.name ?? "Manager";
      if (input.alertId) {
        await db.execute(
          sql`UPDATE pull_session_alerts
              SET acknowledged = 1, acknowledged_at = ${now}, acknowledged_by = ${by}
              WHERE id = ${input.alertId}`
        );
      } else {
        await db.execute(
          sql`UPDATE pull_session_alerts
              SET acknowledged = 1, acknowledged_at = ${now}, acknowledged_by = ${by}
              WHERE acknowledged = 0`
        );
      }
      return { success: true };
    }),

  /** Save a manager note on a specific alert (also logs to history) */
  saveNote: protectedProcedure
    .input(
      z.object({
        alertId: z.number().int(),
        note: z.string().max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const writtenBy = (ctx.user as any)?.name ?? (ctx.user as any)?.id ?? "Manager";
      const now = Date.now();
      // Update the current note on the alert
      await db.execute(
        sql`UPDATE pull_session_alerts SET manager_note = ${input.note} WHERE id = ${input.alertId}`
      );
      // Append to history
      await db.execute(
        sql`INSERT INTO pull_alert_note_history (alert_id, note, written_by, written_at)
            VALUES (${input.alertId}, ${input.note}, ${writtenBy}, ${now})`
      );
      return { success: true };
    }),

  /** Get the full note edit history for a specific alert */
  getNoteHistory: protectedProcedure
    .input(z.object({ alertId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute<any>(
        sql`SELECT id, alert_id, note, written_by, written_at
            FROM pull_alert_note_history
            WHERE alert_id = ${input.alertId}
            ORDER BY written_at DESC
            LIMIT 50`
      );
      const data = ((rows as any[])[0] ?? []) as any[];
      return data.map((r) => ({
        id: Number(r.id),
        alertId: Number(r.alert_id),
        note: r.note as string,
        writtenBy: r.written_by as string,
        writtenAt: Number(r.written_at),
      }));
    }),

  /** Manually trigger a session check */
  checkNow: protectedProcedure.mutation(async () => {
    const fired = await checkOverdueSessions();
    return { fired };
  }),
});
