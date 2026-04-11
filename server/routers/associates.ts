/**
 * associates.ts
 * Warehouse Associates lookup table — CRUD for admin, lookup for pull tracker.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ─── Shared mapper ─────────────────────────────────────────────────────────────
function mapRow(r: any) {
  return {
    id: r.id as number,
    associateId: r.associate_id as string,
    name: r.name as string,
    warehouseId: r.warehouse_id as string,
    role: r.role as string | null,
    active: Boolean(r.active),
    notes: r.notes as string | null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export const associatesRouter = router({

  // Look up a single associate by their badge/ID — used by the scanner for auto-fill
  lookupById: protectedProcedure
    .input(z.object({ associateId: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.execute<any>(sql`
        SELECT * FROM warehouse_associates
        WHERE associate_id = ${input.associateId} AND active = 1
        LIMIT 1
      `);
      const row = (rows as any[])[0];
      return row ? mapRow(row) : null;
    }),

  // List all associates (admin view)
  list: protectedProcedure
    .input(z.object({
      warehouseId: z.string().optional(),
      activeOnly: z.boolean().default(true),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute<any>(sql`
        SELECT * FROM warehouse_associates
        WHERE 1=1
          ${input.activeOnly ? sql`AND active = 1` : sql``}
          ${input.warehouseId ? sql`AND (warehouse_id = ${input.warehouseId} OR warehouse_id = 'all')` : sql``}
          ${input.search ? sql`AND (name LIKE ${'%' + input.search + '%'} OR associate_id LIKE ${'%' + input.search + '%'})` : sql``}
        ORDER BY name ASC
      `);
      return (rows as any[]).map(mapRow);
    }),

  // Create or update an associate (upsert by associate_id)
  upsert: protectedProcedure
    .input(z.object({
      associateId: z.string().min(1).max(128),
      name: z.string().min(1).max(255),
      warehouseId: z.string().max(64).default("all"),
      role: z.string().max(128).optional(),
      notes: z.string().max(1000).optional(),
      active: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const now = Date.now();

      // Check if exists
      const existing = await db.execute<any>(sql`
        SELECT id FROM warehouse_associates WHERE associate_id = ${input.associateId} LIMIT 1
      `);

      if ((existing as any[]).length > 0) {
        await db.execute(sql`
          UPDATE warehouse_associates SET
            name = ${input.name},
            warehouse_id = ${input.warehouseId},
            role = ${input.role ?? null},
            notes = ${input.notes ?? null},
            active = ${input.active ? 1 : 0},
            updated_at = ${now}
          WHERE associate_id = ${input.associateId}
        `);
        return { associateId: input.associateId, created: false };
      } else {
        await db.execute(sql`
          INSERT INTO warehouse_associates
            (associate_id, name, warehouse_id, role, notes, active, created_at, updated_at)
          VALUES
            (${input.associateId}, ${input.name}, ${input.warehouseId},
             ${input.role ?? null}, ${input.notes ?? null}, 1, ${now}, ${now})
        `);
        return { associateId: input.associateId, created: true };
      }
    }),

  // Deactivate (soft-delete) an associate
  deactivate: protectedProcedure
    .input(z.object({ associateId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`
        UPDATE warehouse_associates SET active = 0, updated_at = ${Date.now()}
        WHERE associate_id = ${input.associateId}
      `);
      return { success: true };
    }),

  // Reactivate an associate
  reactivate: protectedProcedure
    .input(z.object({ associateId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`
        UPDATE warehouse_associates SET active = 1, updated_at = ${Date.now()}
        WHERE associate_id = ${input.associateId}
      `);
      return { success: true };
    }),

  // Delete permanently (admin only)
  delete: protectedProcedure
    .input(z.object({ associateId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`
        DELETE FROM warehouse_associates WHERE associate_id = ${input.associateId}
      `);
      return { success: true };
    }),

  // Performance stats for a single associate
  getStats: protectedProcedure
    .input(z.object({ associateId: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // KPI aggregates from completed sessions
      const kpiRows = await db.execute<any>(sql`
        SELECT
          COUNT(*) AS total_sessions,
          SUM(total_items) AS total_items,
          SUM(total_pallets) AS total_pallets,
          SUM(total_cases) AS total_cases,
          AVG(CASE
            WHEN ended_at IS NOT NULL AND started_at IS NOT NULL AND ended_at > started_at
            THEN total_items / ((ended_at - started_at) / 3600000.0)
            ELSE NULL
          END) AS avg_items_per_hour,
          AVG(CASE
            WHEN ended_at IS NOT NULL AND started_at IS NOT NULL AND ended_at > started_at
            THEN (ended_at - started_at) / 60000.0
            ELSE NULL
          END) AS avg_duration_minutes
        FROM pull_sessions
        WHERE associate_id = ${input.associateId} AND status = 'completed'
      `);
      const kpi = (kpiRows as any[])[0] ?? {};

      // Recent 10 completed sessions for history table
      const sessionRows = await db.execute<any>(sql`
        SELECT id, pick_ticket, warehouse_id, started_at, ended_at,
               total_items, total_pallets, total_cases, status
        FROM pull_sessions
        WHERE associate_id = ${input.associateId}
        ORDER BY started_at DESC
        LIMIT 10
      `);
      const sessions = (sessionRows as any[]).map((s: any) => ({
        id: Number(s.id),
        pickTicket: s.pick_ticket as string,
        warehouseId: s.warehouse_id as string,
        startedAt: Number(s.started_at),
        endedAt: s.ended_at ? Number(s.ended_at) : null,
        totalItems: Number(s.total_items ?? 0),
        totalPallets: Number(s.total_pallets ?? 0),
        totalCases: Number(s.total_cases ?? 0),
        status: s.status as string,
        durationMinutes: s.ended_at && s.started_at
          ? Math.round((Number(s.ended_at) - Number(s.started_at)) / 60000)
          : null,
        itemsPerHour: s.ended_at && s.started_at && Number(s.total_items) > 0
          ? Math.round(Number(s.total_items) / ((Number(s.ended_at) - Number(s.started_at)) / 3600000))
          : null,
      }));

      // Daily items/hour trend for last 30 days (for chart)
      const trendRows = await db.execute<any>(sql`
        SELECT
          DATE(FROM_UNIXTIME(started_at / 1000)) AS day,
          SUM(total_items) AS items,
          SUM(CASE
            WHEN ended_at IS NOT NULL AND ended_at > started_at
            THEN (ended_at - started_at) / 3600000.0
            ELSE 0
          END) AS hours
        FROM pull_sessions
        WHERE associate_id = ${input.associateId}
          AND status = 'completed'
          AND started_at >= ${Date.now() - 30 * 24 * 3600000}
        GROUP BY day
        ORDER BY day ASC
      `);
      const trend = (trendRows as any[]).map((t: any) => ({
        day: t.day as string,
        items: Number(t.items ?? 0),
        hours: Number(t.hours ?? 0),
        itemsPerHour: t.hours > 0 ? Math.round(Number(t.items) / Number(t.hours)) : 0,
      }));

      return {
        totalSessions: Number(kpi.total_sessions ?? 0),
        totalItems: Number(kpi.total_items ?? 0),
        totalPallets: Number(kpi.total_pallets ?? 0),
        totalCases: Number(kpi.total_cases ?? 0),
        avgItemsPerHour: kpi.avg_items_per_hour != null ? Math.round(Number(kpi.avg_items_per_hour)) : null,
        avgDurationMinutes: kpi.avg_duration_minutes != null ? Math.round(Number(kpi.avg_duration_minutes)) : null,
        sessions,
        trend,
      };
    }),
});
