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
  const settingsRows = await db.execute<any>(
    sql`SELECT * FROM pull_alert_settings WHERE enabled = 1`
  );
  const settings = (settingsRows as any[]) as Array<{
    warehouse_id: string;
    threshold_minutes: number;
  }>;
  if (settings.length === 0) return 0;

  const globalSetting = settings.find((s) => s.warehouse_id === "all");
  const globalThreshold = globalSetting?.threshold_minutes ?? 120;
  const warehouseThresholds: Record<string, number> = {};
  settings.forEach((s) => {
    if (s.warehouse_id !== "all") warehouseThresholds[s.warehouse_id] = s.threshold_minutes;
  });

  // Fetch active sessions
  const sessionRows = await db.execute<any>(
    sql`SELECT id, pick_ticket, associate_id, associate_name, warehouse_id, start_time
        FROM pull_sessions WHERE status = 'active'`
  );
  const activeSessions = (sessionRows as any[]) as Array<{
    id: number;
    pick_ticket: string | null;
    associate_id: string | null;
    associate_name: string | null;
    warehouse_id: string | null;
    start_time: number;
  }>;

  let firedCount = 0;

  for (const session of activeSessions) {
    const threshold =
      session.warehouse_id && warehouseThresholds[session.warehouse_id] !== undefined
        ? warehouseThresholds[session.warehouse_id]
        : globalThreshold;

    const elapsedMinutes = Math.floor((now - session.start_time) / 60000);
    if (elapsedMinutes < threshold) continue;

    // Skip if already alerted
    const existingRows = await db.execute<any>(
      sql`SELECT id FROM pull_session_alerts WHERE session_id = ${session.id} LIMIT 1`
    );
    if ((existingRows as any[]).length > 0) continue;

    // Insert alert
    await db.execute(
      sql`INSERT INTO pull_session_alerts
          (session_id, pick_ticket, associate_id, associate_name, warehouse_id,
           elapsed_minutes, threshold_minutes, alerted_at, acknowledged)
         VALUES (${session.id}, ${session.pick_ticket}, ${session.associate_id},
                 ${session.associate_name}, ${session.warehouse_id},
                 ${elapsedMinutes}, ${threshold}, ${now}, 0)`
    );

    // Push owner notification
    const associateLabel = session.associate_name ?? session.associate_id ?? "Unknown";
    const warehouseLabel = session.warehouse_id ?? "Unknown warehouse";
    await notifyOwner({
      title: `⚠️ Overdue Pull Session — ${associateLabel}`,
      content: `Pull session for **${associateLabel}** at **${warehouseLabel}** has been running for **${elapsedMinutes} minutes** (threshold: ${threshold} min). Pick ticket: ${session.pick_ticket ?? "N/A"}.`,
    });

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
    const rows = await db.execute<any>(
      sql`SELECT * FROM pull_alert_settings ORDER BY warehouse_id`
    );
    return ((rows as any[]) as Array<{
      id: number;
      warehouse_id: string;
      threshold_minutes: number;
      enabled: number;
      notify_email: string | null;
      updated_at: number;
    }>).map((s) => ({
      id: s.id,
      warehouseId: s.warehouse_id,
      thresholdMinutes: s.threshold_minutes,
      enabled: Boolean(s.enabled),
      notifyEmail: s.notify_email,
      updatedAt: s.updated_at,
    }));
  }),

  /** Upsert a setting for a warehouse (or 'all' for global) */
  saveSetting: protectedProcedure
    .input(
      z.object({
        warehouseId: z.string().default("all"),
        thresholdMinutes: z.number().int().min(1).max(1440),
        enabled: z.boolean(),
        notifyEmail: z.string().email().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const now = Date.now();
      const enabledVal = input.enabled ? 1 : 0;
      const emailVal = input.notifyEmail ?? null;
      await db.execute(
        sql`INSERT INTO pull_alert_settings
              (warehouse_id, threshold_minutes, enabled, notify_email, created_at, updated_at)
            VALUES (${input.warehouseId}, ${input.thresholdMinutes}, ${enabledVal}, ${emailVal}, ${now}, ${now})
            ON DUPLICATE KEY UPDATE
              threshold_minutes = VALUES(threshold_minutes),
              enabled = VALUES(enabled),
              notify_email = VALUES(notify_email),
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
      return ((rows as any[]) as Array<{
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
      }));
    }),

  /** Count of unacknowledged alerts */
  getUnreadCount: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const rows = await db.execute<any>(
      sql`SELECT COUNT(*) as cnt FROM pull_session_alerts WHERE acknowledged = 0`
    );
    return { count: Number((rows as any[])[0]?.cnt ?? 0) };
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

  /** Manually trigger a session check */
  checkNow: protectedProcedure.mutation(async () => {
    const fired = await checkOverdueSessions();
    return { fired };
  }),
});
