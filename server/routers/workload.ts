import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ─── Workload Router ──────────────────────────────────────────────────────────
// Predictive workload planning: throughput snapshots + forecast generation

const STAGES = ['unallocated', 'allocated', 'picking', 'qc', 'qc_complete', 'ship_ready'] as const;

export const workloadRouter = router({
  // Get current pipeline counts per stage
  getPipelineSnapshot: protectedProcedure
    .input(z.object({ warehouseId: z.string().default('all') }))
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const rows = await db.execute<any>(sql`
        SELECT lifecycle_status as stage, COUNT(*) as count
        FROM order_tracking
        WHERE lifecycle_status IN ('unallocated','allocated','picking','qc','qc_complete','ship_ready')
        GROUP BY lifecycle_status
      `);
      const counts: Record<string, number> = {};
      for (const r of (rows as any[])) {
        counts[r.stage] = Number(r.count);
      }
      return STAGES.map(stage => ({ stage, count: counts[stage] ?? 0 }));
    }),

  // Record a throughput snapshot for the current hour
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

  // Get historical throughput for the last N days
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

  // Generate a workload forecast based on current queue + historical throughput
  generateForecast: protectedProcedure
    .input(z.object({
      warehouseId: z.string().default('all'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const now = Date.now();

      // Get current queue counts
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

      // Get average throughput per stage (last 7 days)
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

      // Mark bottleneck
      const maxHours = Math.max(...forecasts.map(f => f.hoursNeeded));
      for (const f of forecasts) {
        if (f.hoursNeeded === maxHours && maxHours > 0) f.bottleneck = true;
      }

      // Persist forecasts
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

  // Get the latest forecast
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

  // Get staffing recommendation
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
