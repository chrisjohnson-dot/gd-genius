import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ─── Workload Router ──────────────────────────────────────────────────────────
// Predictive workload planning: throughput snapshots + forecast generation
// + live production rate measurement + backlog projection

const STAGES = ['unallocated', 'allocated', 'picking', 'qc', 'qc_complete', 'ship_ready'] as const;

// Window options in milliseconds
const WINDOW_MS: Record<string, number> = {
  '1h':  1 * 3600_000,
  '3h':  3 * 3600_000,
  '24h': 24 * 3600_000,
};

export const workloadRouter = router({
  // ── Get current pipeline counts per stage ─────────────────────────────────
  getPipelineSnapshot: protectedProcedure
    .input(z.object({ warehouseId: z.string().default('all') }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const rows = await db.execute<any>(sql`
        SELECT lifecycle_status as stage, COUNT(*) as count
        FROM order_tracking
        WHERE lifecycle_status IN ('unallocated','allocated','picking','qc','qc_complete','ship_ready')
          ${input.warehouseId !== 'all' ? sql`AND facilityName = ${input.warehouseId}` : sql``}
        GROUP BY lifecycle_status
      `);
      const counts: Record<string, number> = {};
      for (const r of (rows as any[])) {
        counts[r.stage] = Number(r.count);
      }
      return STAGES.map(stage => ({ stage, count: counts[stage] ?? 0 }));
    }),

  // ── Live production rate from completed pull sessions ─────────────────────
  // Returns items/hr and cases/hr measured over the chosen window (1h/3h/24h),
  // plus per-warehouse breakdown and per-hour trend buckets for sparklines.
  getThroughputRate: protectedProcedure
    .input(z.object({
      warehouseId: z.string().default('all'),
      window: z.enum(['1h', '3h', '24h']).default('1h'),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const now = Date.now();
      const windowMs = WINDOW_MS[input.window] ?? WINDOW_MS['1h'];
      const since = now - windowMs;
      const windowHours = windowMs / 3600_000;

      // Aggregate completed sessions in the window
      const aggRows = await db.execute<any>(sql`
        SELECT
          warehouse_id,
          COUNT(*) as session_count,
          SUM(total_items) as total_items,
          SUM(total_cases) as total_cases,
          SUM(duration_seconds) as total_duration_s
        FROM pull_sessions
        WHERE status = 'completed'
          AND ended_at >= ${since}
          ${input.warehouseId !== 'all' ? sql`AND warehouse_id = ${input.warehouseId}` : sql``}
        GROUP BY warehouse_id
      `);

      const rows = aggRows as any[];
      let totalItems = 0;
      let totalCases = 0;
      let totalDurationS = 0;
      let sessionCount = 0;
      const byWarehouse: Array<{ warehouseId: string; itemsPerHour: number; casesPerHour: number; sessions: number }> = [];

      for (const r of rows) {
        const items = Number(r.total_items) || 0;
        const cases = Number(r.total_cases) || 0;
        const durS = Number(r.total_duration_s) || 0;
        const sessions = Number(r.session_count) || 0;
        totalItems += items;
        totalCases += cases;
        totalDurationS += durS;
        sessionCount += sessions;
        const durH = durS / 3600;
        byWarehouse.push({
          warehouseId: r.warehouse_id,
          itemsPerHour: durH > 0 ? Math.round(items / durH) : 0,
          casesPerHour: durH > 0 ? Math.round(cases / durH) : 0,
          sessions,
        });
      }

      // Overall rate — use actual worked hours, not wall-clock window
      const totalDurationH = totalDurationS / 3600;
      const itemsPerHour = totalDurationH > 0 ? Math.round(totalItems / totalDurationH) : 0;
      const casesPerHour = totalDurationH > 0 ? Math.round(totalCases / totalDurationH) : 0;

      // Hourly trend buckets within the window (for sparkline)
      const bucketCount = Math.min(Math.round(windowHours), 24);
      const bucketMs = windowMs / bucketCount;
      const trendRows = await db.execute<any>(sql`
        SELECT
          FLOOR(ended_at / ${bucketMs}) * ${bucketMs} as bucket,
          SUM(total_items) as items,
          SUM(total_cases) as cases,
          SUM(duration_seconds) as dur_s
        FROM pull_sessions
        WHERE status = 'completed'
          AND ended_at >= ${since}
          ${input.warehouseId !== 'all' ? sql`AND warehouse_id = ${input.warehouseId}` : sql``}
        GROUP BY bucket
        ORDER BY bucket ASC
      `);

      const trendBuckets = (trendRows as any[]).map((r: any) => {
        const durH = (Number(r.dur_s) || 0) / 3600;
        return {
          bucket: Number(r.bucket),
          items: Number(r.items) || 0,
          cases: Number(r.cases) || 0,
          itemsPerHour: durH > 0 ? Math.round(Number(r.items) / durH) : 0,
        };
      });

      return {
        window: input.window,
        windowHours,
        measuredAt: now,
        sessionCount,
        totalItems,
        totalCases,
        itemsPerHour,
        casesPerHour,
        byWarehouse,
        trendBuckets,
      };
    }),

  // ── Backlog projection ────────────────────────────────────────────────────
  // Compares the current production rate (from the chosen window) against the
  // open backlog (allocated + picking orders) to project completion time.
  getBacklogProjection: protectedProcedure
    .input(z.object({
      warehouseId: z.string().default('all'),
      window: z.enum(['1h', '3h', '24h']).default('1h'),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const now = Date.now();
      const windowMs = WINDOW_MS[input.window] ?? WINDOW_MS['1h'];
      const since = now - windowMs;

      // Current rate from completed sessions in the window
      const rateRows = await db.execute<any>(sql`
        SELECT
          SUM(total_items) as total_items,
          SUM(total_cases) as total_cases,
          SUM(duration_seconds) as total_duration_s,
          COUNT(*) as session_count
        FROM pull_sessions
        WHERE status = 'completed'
          AND ended_at >= ${since}
          ${input.warehouseId !== 'all' ? sql`AND warehouse_id = ${input.warehouseId}` : sql``}
      `);
      const rateRow = (rateRows as any[])[0] ?? {};
      const durH = (Number(rateRow.total_duration_s) || 0) / 3600;
      const rateItems = Number(rateRow.total_items) || 0;
      const rateCases = Number(rateRow.total_cases) || 0;
      const itemsPerHour = durH > 0 ? rateItems / durH : 0;
      const casesPerHour = durH > 0 ? rateCases / durH : 0;

      // Open backlog: orders in allocated + picking stages
      const backlogRows = await db.execute<any>(sql`
        SELECT
          lifecycle_status as stage,
          COUNT(*) as order_count,
          COALESCE(SUM(totalPieces), 0) as total_pieces
        FROM order_tracking
        WHERE lifecycle_status IN ('allocated', 'picking')
          ${input.warehouseId !== 'all' ? sql`AND facilityName = ${input.warehouseId}` : sql``}
        GROUP BY lifecycle_status
      `);

      let backlogOrders = 0;
      let backlogPieces = 0;
      const backlogByStage: Array<{ stage: string; orders: number; pieces: number }> = [];
      for (const r of (backlogRows as any[])) {
        const orders = Number(r.order_count) || 0;
        const pieces = Number(r.total_pieces) || 0;
        backlogOrders += orders;
        backlogPieces += pieces;
        backlogByStage.push({ stage: r.stage, orders, pieces });
      }

      // Projection: hours to clear backlog at current rate
      // Use pieces as the primary unit (matches items in pull sessions)
      const hoursToComplete = itemsPerHour > 0 ? backlogPieces / itemsPerHour : null;
      const projectedCompletionAt = hoursToComplete !== null ? now + hoursToComplete * 3600_000 : null;

      // Pace status
      let paceStatus: 'on_track' | 'at_risk' | 'critical' | 'no_data' = 'no_data';
      if (itemsPerHour > 0 && hoursToComplete !== null) {
        if (hoursToComplete <= 4) paceStatus = 'on_track';
        else if (hoursToComplete <= 8) paceStatus = 'at_risk';
        else paceStatus = 'critical';
      }

      // Also fetch unallocated order count for full picture
      const unallocRows = await db.execute<any>(sql`
        SELECT COUNT(*) as cnt, COALESCE(SUM(totalPieces), 0) as pieces
        FROM order_tracking
        WHERE lifecycle_status = 'unallocated'
          ${input.warehouseId !== 'all' ? sql`AND facilityName = ${input.warehouseId}` : sql``}
      `);
      const unallocRow = (unallocRows as any[])[0] ?? {};

      return {
        window: input.window,
        measuredAt: now,
        rate: {
          itemsPerHour: Math.round(itemsPerHour),
          casesPerHour: Math.round(casesPerHour),
          sessionCount: Number(rateRow.session_count) || 0,
          basedOnItems: rateItems,
          basedOnDurationH: Math.round(durH * 10) / 10,
        },
        backlog: {
          orders: backlogOrders,
          pieces: backlogPieces,
          byStage: backlogByStage,
          unallocatedOrders: Number(unallocRow.cnt) || 0,
          unallocatedPieces: Number(unallocRow.pieces) || 0,
        },
        projection: {
          hoursToComplete: hoursToComplete !== null ? Math.round(hoursToComplete * 10) / 10 : null,
          projectedCompletionAt,
          paceStatus,
        },
      };
    }),

  // ── Burn-down series ──────────────────────────────────────────────────────
  // Returns hourly data points for the last N hours showing:
  //   - cumulative items completed (actual burn-down)
  //   - projected remaining at each point
  // Used to draw the burn-down chart.
  getBurndownSeries: protectedProcedure
    .input(z.object({
      warehouseId: z.string().default('all'),
      hours: z.number().int().min(1).max(48).default(24),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const now = Date.now();
      const since = now - input.hours * 3600_000;
      const bucketMs = 3600_000; // 1-hour buckets

      // Completed items per hour bucket
      const completedRows = await db.execute<any>(sql`
        SELECT
          FLOOR(ended_at / ${bucketMs}) * ${bucketMs} as bucket,
          SUM(total_items) as items_completed,
          SUM(total_cases) as cases_completed,
          COUNT(*) as sessions
        FROM pull_sessions
        WHERE status = 'completed'
          AND ended_at >= ${since}
          ${input.warehouseId !== 'all' ? sql`AND warehouse_id = ${input.warehouseId}` : sql``}
        GROUP BY bucket
        ORDER BY bucket ASC
      `);

      // Build a full series with zero-fill for missing hours
      const bucketMap: Record<number, { items: number; cases: number; sessions: number }> = {};
      for (const r of (completedRows as any[])) {
        const b = Number(r.bucket);
        bucketMap[b] = {
          items: Number(r.items_completed) || 0,
          cases: Number(r.cases_completed) || 0,
          sessions: Number(r.sessions) || 0,
        };
      }

      const series: Array<{
        bucket: number;
        label: string;
        itemsCompleted: number;
        casesCompleted: number;
        sessions: number;
        cumulative: number;
      }> = [];

      let cumulative = 0;
      for (let i = 0; i < input.hours; i++) {
        const bucketStart = Math.floor((since + i * bucketMs) / bucketMs) * bucketMs;
        const d = bucketMap[bucketStart] ?? { items: 0, cases: 0, sessions: 0 };
        cumulative += d.items;
        series.push({
          bucket: bucketStart,
          label: new Date(bucketStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          itemsCompleted: d.items,
          casesCompleted: d.cases,
          sessions: d.sessions,
          cumulative,
        });
      }

      return { series, totalCompleted: cumulative };
    }),

  // ── Record a throughput snapshot for the current hour ─────────────────────
  recordSnapshot: protectedProcedure
    .input(z.object({
      warehouseId: z.string().default('all'),
      stage: z.string(),
      ordersProcessed: z.number().int().default(0),
      workerCount: z.number().int().default(0),
      avgTimeSeconds: z.number().int().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const now = Date.now();
      const hourBucket = Math.floor(now / 3600000) * 3600000;
      await db.execute(sql`
        INSERT INTO throughput_snapshots
          (warehouse_id, stage, hour_bucket, orders_processed, worker_count, avg_time_seconds, recorded_at)
        VALUES
          (${input.warehouseId}, ${input.stage}, ${hourBucket},
           ${input.ordersProcessed}, ${input.workerCount}, ${input.avgTimeSeconds}, ${now})
      `);
      return { success: true };
    }),

  // ── Get historical throughput for the last N days ─────────────────────────
  getHistoricalThroughput: protectedProcedure
    .input(z.object({
      warehouseId: z.string().default('all'),
      stage: z.string().optional(),
      days: z.number().int().min(1).max(90).default(14),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const since = Date.now() - input.days * 86400000;
      const rows = await db.execute<any>(sql`
        SELECT
          stage,
          hour_bucket,
          SUM(orders_processed) as orders_processed,
          AVG(worker_count) as avg_workers,
          AVG(avg_time_seconds) as avg_time_seconds
        FROM throughput_snapshots
        WHERE warehouse_id = ${input.warehouseId}
          AND hour_bucket >= ${since}
          ${input.stage ? sql`AND stage = ${input.stage}` : sql``}
        GROUP BY stage, hour_bucket
        ORDER BY hour_bucket ASC
      `);
      return rows as any[];
    }),

  // ── Generate a workload forecast ──────────────────────────────────────────
  generateForecast: protectedProcedure
    .input(z.object({
      warehouseId: z.string().default('all'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const now = Date.now();

      const queueRows = await db.execute<any>(sql`
        SELECT lifecycle_status as stage, COUNT(*) as count
        FROM order_tracking
        WHERE lifecycle_status IN ('unallocated','allocated','picking','qc','qc_complete','ship_ready')
        GROUP BY lifecycle_status
      `);
      const queueCounts: Record<string, number> = {};
      for (const r of (queueRows as any[])) {
        queueCounts[r.stage] = Number(r.count);
      }

      const since7d = now - 7 * 86400000;
      const throughputRows = await db.execute<any>(sql`
        SELECT stage,
               AVG(orders_processed) as avg_per_hour
        FROM throughput_snapshots
        WHERE warehouse_id = ${input.warehouseId}
          AND hour_bucket >= ${since7d}
        GROUP BY stage
      `);
      const throughput: Record<string, number> = {};
      for (const r of (throughputRows as any[])) {
        throughput[r.stage] = Number(r.avg_per_hour) || 0;
      }

      const DEFAULT_THROUGHPUT = 30;
      const slaDeadline = now + 16 * 3600000;

      const forecasts = [];
      for (const stage of STAGES) {
        const currentQueue = queueCounts[stage] ?? 0;
        const tph = throughput[stage] || DEFAULT_THROUGHPUT;
        const hoursNeeded = tph > 0 ? currentQueue / tph : 0;
        const projectedCompletionAt = now + hoursNeeded * 3600000;
        const slaBreachCount = projectedCompletionAt > slaDeadline
          ? Math.ceil((projectedCompletionAt - slaDeadline) / 3600000 * tph)
          : 0;

        forecasts.push({
          stage,
          currentQueue,
          throughputPerHour: tph,
          hoursNeeded: Math.round(hoursNeeded * 10) / 10,
          projectedCompletionAt: Math.round(projectedCompletionAt),
          slaBreachCount,
          bottleneck: false,
        });
      }

      const maxHours = Math.max(...forecasts.map(f => f.hoursNeeded));
      for (const f of forecasts) {
        if (f.hoursNeeded === maxHours && maxHours > 0) f.bottleneck = true;
      }

      for (const f of forecasts) {
        await db.execute(sql`
          INSERT INTO workload_forecasts
            (warehouse_id, forecast_at, stage, current_queue, projected_completion_at,
             sla_breach_count, throughput_per_hour, required_throughput, bottleneck)
          VALUES
            (${input.warehouseId}, ${now}, ${f.stage}, ${f.currentQueue},
             ${f.projectedCompletionAt}, ${f.slaBreachCount}, ${f.throughputPerHour},
             ${f.throughputPerHour}, ${f.bottleneck ? 1 : 0})
        `);
      }

      return { forecasts, generatedAt: now };
    }),

  // ── Get the latest forecast ───────────────────────────────────────────────
  getLatestForecast: protectedProcedure
    .input(z.object({ warehouseId: z.string().default('all') }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const latestRows = await db.execute<any>(sql`
        SELECT MAX(forecast_at) as latest_at
        FROM workload_forecasts
        WHERE warehouse_id = ${input.warehouseId}
      `);
      const latestAt = (latestRows as any[])[0]?.latest_at;
      if (!latestAt) return { forecasts: [], generatedAt: null };

      const rows = await db.execute<any>(sql`
        SELECT * FROM workload_forecasts
        WHERE warehouse_id = ${input.warehouseId}
          AND forecast_at = ${latestAt}
        ORDER BY id ASC
      `);
      return { forecasts: rows as any[], generatedAt: Number(latestAt) };
    }),

  // ── Get staffing recommendation ───────────────────────────────────────────
  getStaffingRecommendation: protectedProcedure
    .input(z.object({ warehouseId: z.string().default('all') }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const since = Date.now() - 30 * 86400000;
      const rows = await db.execute<any>(sql`
        SELECT
          stage,
          AVG(orders_processed) as avg_orders_per_hour,
          AVG(worker_count) as avg_workers,
          MAX(orders_processed) as peak_orders,
          COUNT(*) as data_points
        FROM throughput_snapshots
        WHERE warehouse_id = ${input.warehouseId}
          AND hour_bucket >= ${since}
          AND worker_count > 0
        GROUP BY stage
      `);

      return (rows as any[]).map((r: any) => ({
        stage: r.stage,
        avgOrdersPerHour: Number(r.avg_orders_per_hour) || 0,
        avgWorkers: Number(r.avg_workers) || 0,
        ordersPerWorkerPerHour: Number(r.avg_workers) > 0
          ? Number(r.avg_orders_per_hour) / Number(r.avg_workers)
          : 0,
        peakOrders: Number(r.peak_orders) || 0,
        dataPoints: Number(r.data_points) || 0,
      }));
    }),
});
