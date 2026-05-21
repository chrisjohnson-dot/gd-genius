import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeekdayAvg {
  dow: number;        // 1=Sun, 2=Mon, ..., 7=Sat
  dayLabel: string;   // "Mon", "Tue", etc.
  orderCount: number;
  totalUnits: number;
  avgUnitsPerOrder: number;
}

export interface WeeklyVolRow {
  weekIso: string;    // e.g. "2025-W47"
  weekStart: string;  // ISO date of Monday of that week
  dow: number;
  dayLabel: string;
  orderCount: number;
  totalUnits: number;
  isDominant: boolean; // true if this day > 50% of week's total units
}

const DOW_LABELS: Record<number, string> = {
  1: "Sun",
  2: "Mon",
  3: "Tue",
  4: "Wed",
  5: "Thu",
  6: "Fri",
  7: "Sat",
};

// ─── Aggregation helper ───────────────────────────────────────────────────────
// Runs against order_tracking and writes to b2b_cadence_cache.
// Called by the heartbeat handler and by the manual refresh mutation.

export async function computeAndStoreCadence(
  facilityId: number | null,
  clientId: number | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const facilityFilter = facilityId != null
    ? sql`AND facilityId = ${facilityId}`
    : sql``;
  const clientFilter = clientId != null
    ? sql`AND clientId = ${clientId}`
    : sql``;

  // ── 1. Weekday averages ──────────────────────────────────────────────────
  const weekdayRows = await db.execute(sql`
    SELECT
      DAYOFWEEK(STR_TO_DATE(creationDate, '%Y-%m-%dT%H:%i:%s.%f')) AS dow,
      COUNT(*)                                                       AS orderCount,
      COALESCE(SUM(totalPieces), 0)                                  AS totalUnits,
      COALESCE(AVG(totalPieces), 0)                                  AS avgUnitsPerOrder
    FROM order_tracking
    WHERE creationDate IS NOT NULL
      AND creationDate != ''
      AND totalPieces > 0
      ${facilityFilter}
      ${clientFilter}
    GROUP BY dow
    ORDER BY dow
  `);

  // ── 2. Weekly volume by day (last 52 weeks) ──────────────────────────────
  const weeklyRows = await db.execute(sql`
    SELECT
      YEARWEEK(STR_TO_DATE(creationDate, '%Y-%m-%dT%H:%i:%s.%f'), 3) AS yw,
      DAYOFWEEK(STR_TO_DATE(creationDate, '%Y-%m-%dT%H:%i:%s.%f'))   AS dow,
      COUNT(*)                                                         AS orderCount,
      COALESCE(SUM(totalPieces), 0)                                    AS totalUnits
    FROM order_tracking
    WHERE creationDate IS NOT NULL
      AND creationDate != ''
      AND totalPieces > 0
      AND STR_TO_DATE(creationDate, '%Y-%m-%dT%H:%i:%s.%f') >= DATE_SUB(NOW(), INTERVAL 52 WEEK)
      ${facilityFilter}
      ${clientFilter}
    GROUP BY yw, dow
    ORDER BY yw, dow
  `);

  // ── 3. Delete old cache rows for this (facilityId, clientId) scope ───────
  if (facilityId == null && clientId == null) {
    await db.execute(sql`
      DELETE FROM b2b_cadence_cache
      WHERE facility_id IS NULL AND client_id IS NULL
    `);
  } else if (facilityId != null && clientId == null) {
    await db.execute(sql`
      DELETE FROM b2b_cadence_cache
      WHERE facility_id = ${facilityId} AND client_id IS NULL
    `);
  } else if (facilityId == null && clientId != null) {
    await db.execute(sql`
      DELETE FROM b2b_cadence_cache
      WHERE facility_id IS NULL AND client_id = ${clientId}
    `);
  } else {
    await db.execute(sql`
      DELETE FROM b2b_cadence_cache
      WHERE facility_id = ${facilityId} AND client_id = ${clientId}
    `);
  }

  const now = new Date();

  // ── 4. Insert weekday_avg rows ────────────────────────────────────────────
  const wdRows = weekdayRows as any[];
  for (const row of wdRows) {
    await db.execute(sql`
      INSERT INTO b2b_cadence_cache
        (facility_id, client_id, row_type, week_iso, dow, order_count, total_units, avg_units_per_order, computed_at)
      VALUES
        (${facilityId}, ${clientId}, 'weekday_avg', NULL, ${Number(row.dow)},
         ${Number(row.orderCount)}, ${Number(row.totalUnits)},
         ${Number(row.avgUnitsPerOrder)}, ${now})
    `);
  }

  // ── 5. Insert weekly_vol rows ─────────────────────────────────────────────
  const wvRows = weeklyRows as any[];
  for (const row of wvRows) {
    const yw = String(row.yw); // e.g. "202547"
    const year = yw.slice(0, 4);
    const week = yw.slice(4);
    const weekIso = `${year}-W${week.padStart(2, "0")}`;

    await db.execute(sql`
      INSERT INTO b2b_cadence_cache
        (facility_id, client_id, row_type, week_iso, dow, order_count, total_units, avg_units_per_order, computed_at)
      VALUES
        (${facilityId}, ${clientId}, 'weekly_vol', ${weekIso}, ${Number(row.dow)},
         ${Number(row.orderCount)}, ${Number(row.totalUnits)},
         NULL, ${now})
    `);
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const analyticsRouter = router({
  // Returns cached cadence data. Falls back to live computation if cache is empty.
  getB2BCadence: publicProcedure
    .input(z.object({
      facilityId: z.number().nullable().optional(),
      clientId: z.number().nullable().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const fid = input.facilityId ?? null;
      const cid = input.clientId ?? null;

      // Build WHERE conditions for cache lookup
      const fidCond = fid == null
        ? sql`facility_id IS NULL`
        : sql`facility_id = ${fid}`;
      const cidCond = cid == null
        ? sql`client_id IS NULL`
        : sql`client_id = ${cid}`;

      // Check if cache exists
      const cacheCheck = await db.execute(sql`
        SELECT COUNT(*) as cnt, MAX(computed_at) as lastComputed
        FROM b2b_cadence_cache
        WHERE ${fidCond} AND ${cidCond}
      `);

      const cacheCount = Number((cacheCheck as any[])[0]?.cnt ?? 0);
      const lastComputed: Date | null = (cacheCheck as any[])[0]?.lastComputed ?? null;

      // If cache is empty, compute on-the-fly (first load)
      if (cacheCount === 0) {
        await computeAndStoreCadence(fid, cid);
      }

      // Read weekday averages from cache
      const wdCached = await db.execute(sql`
        SELECT dow, order_count, total_units, avg_units_per_order
        FROM b2b_cadence_cache
        WHERE row_type = 'weekday_avg' AND ${fidCond} AND ${cidCond}
        ORDER BY dow
      `);

      const weekdayAvgs: WeekdayAvg[] = (wdCached as any[]).map(r => ({
        dow: Number(r.dow),
        dayLabel: DOW_LABELS[Number(r.dow)] ?? `D${r.dow}`,
        orderCount: Number(r.order_count),
        totalUnits: Number(r.total_units),
        avgUnitsPerOrder: Number(r.avg_units_per_order ?? 0),
      }));

      // Read weekly volume from cache
      const wvCached = await db.execute(sql`
        SELECT week_iso, dow, order_count, total_units
        FROM b2b_cadence_cache
        WHERE row_type = 'weekly_vol' AND ${fidCond} AND ${cidCond}
        ORDER BY week_iso, dow
      `);

      // Group by week and compute dominant-day flag
      const weekMap = new Map<string, { dow: number; orderCount: number; totalUnits: number }[]>();
      for (const r of wvCached as any[]) {
        const key = String(r.week_iso);
        if (!weekMap.has(key)) weekMap.set(key, []);
        weekMap.get(key)!.push({
          dow: Number(r.dow),
          orderCount: Number(r.order_count),
          totalUnits: Number(r.total_units),
        });
      }

      const weeklyVol: WeeklyVolRow[] = [];
      for (const [weekIso, days] of weekMap.entries()) {
        const weekTotal = days.reduce((s, d) => s + d.totalUnits, 0);
        for (const d of days) {
          const isDominant = weekTotal > 0 && d.totalUnits / weekTotal > 0.5;
          weeklyVol.push({
            weekIso,
            weekStart: isoWeekToMonday(weekIso),
            dow: d.dow,
            dayLabel: DOW_LABELS[d.dow] ?? `D${d.dow}`,
            orderCount: d.orderCount,
            totalUnits: d.totalUnits,
            isDominant,
          });
        }
      }

      return {
        weekdayAvgs,
        weeklyVol,
        lastComputed,
        cacheWasEmpty: cacheCount === 0,
      };
    }),

  // Manual refresh — recomputes and stores the cache for the given scope
  refreshB2BCadence: publicProcedure
    .input(z.object({
      facilityId: z.number().nullable().optional(),
      clientId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const fid = input.facilityId ?? null;
      const cid = input.clientId ?? null;
      await computeAndStoreCadence(fid, cid);
      return { success: true, refreshedAt: new Date() };
    }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert ISO week string (e.g. "2025-W47") to the Monday date of that week */
function isoWeekToMonday(weekIso: string): string {
  const match = weekIso.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekIso;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  // Jan 4 is always in week 1 of the ISO year
  const jan4 = new Date(year, 0, 4);
  const jan4Dow = jan4.getDay() || 7; // Mon=1..Sun=7
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4Dow - 1) + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}
