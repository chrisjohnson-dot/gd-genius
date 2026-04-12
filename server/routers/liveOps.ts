import { z } from "zod";
import { sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

export const liveOpsRouter = router({
  /**
   * Main snapshot: pipeline stage counts per warehouse (or all warehouses)
   */
  snapshot: protectedProcedure
    .input(z.object({ warehouseId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const wh = input.warehouseId ?? null;

      // Stage 1: Unallocated (sla_snapshots not fully allocated)
      const unallocRows = await db.execute<{ warehouseId: string; cnt: number }>(
        wh
          ? sql`SELECT COALESCE(facility,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM sla_snapshots WHERE fullyAllocated=0 AND facility=${wh} GROUP BY facility`
          : sql`SELECT COALESCE(facility,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM sla_snapshots WHERE fullyAllocated=0 GROUP BY facility`
      );

      // Stage 2: Allocated (confirmed runs, allocated orders)
      const allocRows = await db.execute<{ warehouseId: string; cnt: number }>(
        wh
          ? sql`SELECT COALESCE(ar.facilityName,'Unknown') AS warehouseId, COUNT(aro.id) AS cnt FROM allocation_run_orders aro JOIN allocation_runs ar ON ar.id=aro.runId WHERE aro.status='allocated' AND ar.status='confirmed' AND ar.facilityName=${wh} GROUP BY ar.facilityName`
          : sql`SELECT COALESCE(ar.facilityName,'Unknown') AS warehouseId, COUNT(aro.id) AS cnt FROM allocation_run_orders aro JOIN allocation_runs ar ON ar.id=aro.runId WHERE aro.status='allocated' AND ar.status='confirmed' GROUP BY ar.facilityName`
      );

      // Stage 3: QC (active qc_scan_sessions)
      const qcRows = await db.execute<{ warehouseId: string; cnt: number }>(
        wh
          ? sql`SELECT COALESCE(warehouseName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM qc_scan_sessions WHERE status NOT IN ('completed','cancelled') AND warehouseName=${wh} GROUP BY warehouseName`
          : sql`SELECT COALESCE(warehouseName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM qc_scan_sessions WHERE status NOT IN ('completed','cancelled') GROUP BY warehouseName`
      );

      // Stage 4: QC Done (completed but not yet shipped)
      const qcDoneRows = await db.execute<{ warehouseId: string; cnt: number }>(
        wh
          ? sql`SELECT COALESCE(warehouseName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM qc_scan_sessions WHERE status='completed' AND shippedAt IS NULL AND warehouseName=${wh} GROUP BY warehouseName`
          : sql`SELECT COALESCE(warehouseName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM qc_scan_sessions WHERE status='completed' AND shippedAt IS NULL GROUP BY warehouseName`
      );

      // Stage 5: Packing (small parcel sessions in scanning/ready)
      const packingRows = await db.execute<{ warehouseId: string; cnt: number }>(
        wh
          ? sql`SELECT COALESCE(facilityName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM small_parcel_sessions WHERE status IN ('scanning','ready') AND facilityName=${wh} GROUP BY facilityName`
          : sql`SELECT COALESCE(facilityName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM small_parcel_sessions WHERE status IN ('scanning','ready') GROUP BY facilityName`
      );

      // Stage 6: Ship Ready (label purchased, not yet shipped)
      const shipReadyRows = await db.execute<{ warehouseId: string; cnt: number }>(
        wh
          ? sql`SELECT COALESCE(facilityName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM small_parcel_sessions WHERE status='label_purchased' AND extensivShippedAt IS NULL AND facilityName=${wh} GROUP BY facilityName`
          : sql`SELECT COALESCE(facilityName,'Unknown') AS warehouseId, COUNT(*) AS cnt FROM small_parcel_sessions WHERE status='label_purchased' AND extensivShippedAt IS NULL GROUP BY facilityName`
      );

      const allWarehouses = new Set<string>();
      for (const r of [...unallocRows, ...allocRows, ...qcRows, ...qcDoneRows, ...packingRows, ...shipReadyRows]) {
        allWarehouses.add((r as any).warehouseId);
      }

      const toMap = (rows: any[]) => {
        const m: Record<string, number> = {};
        for (const r of rows) m[r.warehouseId] = Number(r.cnt);
        return m;
      };

      const unallocMap = toMap(unallocRows as any[]);
      const allocMap = toMap(allocRows as any[]);
      const qcMap = toMap(qcRows as any[]);
      const qcDoneMap = toMap(qcDoneRows as any[]);
      const packingMap = toMap(packingRows as any[]);
      const shipReadyMap = toMap(shipReadyRows as any[]);

      const warehouses = Array.from(allWarehouses).sort().map((wh) => ({
        warehouseId: wh,
        stages: {
          unallocated: unallocMap[wh] ?? 0,
          allocated: allocMap[wh] ?? 0,
          qc: qcMap[wh] ?? 0,
          qcDone: qcDoneMap[wh] ?? 0,
          packing: packingMap[wh] ?? 0,
          shipReady: shipReadyMap[wh] ?? 0,
        },
        total:
          (unallocMap[wh] ?? 0) +
          (allocMap[wh] ?? 0) +
          (qcMap[wh] ?? 0) +
          (qcDoneMap[wh] ?? 0) +
          (packingMap[wh] ?? 0) +
          (shipReadyMap[wh] ?? 0),
      }));

      return { warehouses, snapshotAt: new Date() };
    }),

  /**
   * Alert ticker: last N ops_events (most recent first)
   */
  events: protectedProcedure
    .input(
      z.object({
        warehouseId: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db.execute<any>(
        input.warehouseId
          ? sql`SELECT id, eventType, severity, warehouseId, clientId, entityType, entityId, description, metadata, userId, userName, occurredAt FROM ops_events WHERE warehouseId=${input.warehouseId} ORDER BY occurredAt DESC LIMIT ${input.limit}`
          : sql`SELECT id, eventType, severity, warehouseId, clientId, entityType, entityId, description, metadata, userId, userName, occurredAt FROM ops_events ORDER BY occurredAt DESC LIMIT ${input.limit}`
      );

      return (rows as any[]).map((r) => ({
        ...r,
        metadata: r.metadata ? (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) : null,
        occurredAt: new Date(r.occurredAt),
      }));
    }),

  /**
   * Station activity: active workers per station from shift_sessions
   */
  stationActivity: protectedProcedure
    .input(z.object({ warehouseId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const shiftRows = await db.execute<any>(
        input.warehouseId
          ? sql`SELECT COALESCE(warehouseId,'Unknown') AS warehouseId, COALESCE(role,'unknown') AS role, COUNT(*) AS activeWorkers FROM shift_sessions WHERE endedAt IS NULL AND startedAt IS NOT NULL AND warehouseId=${input.warehouseId} GROUP BY warehouseId, role ORDER BY warehouseId, role`
          : sql`SELECT COALESCE(warehouseId,'Unknown') AS warehouseId, COALESCE(role,'unknown') AS role, COUNT(*) AS activeWorkers FROM shift_sessions WHERE endedAt IS NULL AND startedAt IS NOT NULL GROUP BY warehouseId, role ORDER BY warehouseId, role`
      );

      const byWarehouse: Record<string, { role: string; activeWorkers: number }[]> = {};
      for (const r of shiftRows as any[]) {
        if (!byWarehouse[r.warehouseId]) byWarehouse[r.warehouseId] = [];
        byWarehouse[r.warehouseId].push({ role: r.role, activeWorkers: Number(r.activeWorkers) });
      }

      const recvRows = await db.execute<any>(
        input.warehouseId
          ? sql`SELECT COALESCE(facilityName,'Unknown') AS warehouseId, COUNT(*) AS activeSessions FROM receive_pallet_sessions WHERE status='open' AND facilityName=${input.warehouseId} GROUP BY facilityName`
          : sql`SELECT COALESCE(facilityName,'Unknown') AS warehouseId, COUNT(*) AS activeSessions FROM receive_pallet_sessions WHERE status='open' GROUP BY facilityName`
      );

      return {
        shiftWorkers: byWarehouse,
        receivingSessions: (recvRows as any[]).map((r) => ({
          warehouseId: r.warehouseId,
          activeSessions: Number(r.activeSessions),
        })),
      };
    }),

  /**
   * Exception summary: counts by priority + top 5 open exceptions
   */
  exceptionSummary: protectedProcedure
    .input(z.object({ warehouseId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const countRows = await db.execute<any>(
        input.warehouseId
          ? sql`SELECT priority, COUNT(*) AS cnt FROM exceptions WHERE status IN ('open','in_progress') AND warehouseId=${input.warehouseId} GROUP BY priority`
          : sql`SELECT priority, COUNT(*) AS cnt FROM exceptions WHERE status IN ('open','in_progress') GROUP BY priority`
      );

      const topRows = await db.execute<any>(
        input.warehouseId
          ? sql`SELECT id, exceptionType, priority, title, clientName, warehouseId, createdAt FROM exceptions WHERE status IN ('open','in_progress') AND warehouseId=${input.warehouseId} ORDER BY FIELD(priority,'critical','high','medium','low'), createdAt ASC LIMIT 5`
          : sql`SELECT id, exceptionType, priority, title, clientName, warehouseId, createdAt FROM exceptions WHERE status IN ('open','in_progress') ORDER BY FIELD(priority,'critical','high','medium','low'), createdAt ASC LIMIT 5`
      );

      const counts: Record<string, number> = {};
      for (const r of countRows as any[]) counts[r.priority] = Number(r.cnt);

      return {
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        bySeverity: {
          critical: counts.critical ?? 0,
          high: counts.high ?? 0,
          medium: counts.medium ?? 0,
          low: counts.low ?? 0,
        },
        topExceptions: (topRows as any[]).map((r) => ({
          ...r,
          createdAt: new Date(r.createdAt),
        })),
      };
    }),

  /**
   * SLA breach summary: orders currently out of SLA per warehouse/client
   */
  slaSummary: protectedProcedure
    .input(z.object({ warehouseId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db.execute<any>(
        input.warehouseId
          ? sql`SELECT COALESCE(facility,'Unknown') AS warehouseId, clientName, COUNT(*) AS breachedOrders, MAX(bizDaysLate) AS worstDaysLate FROM sla_snapshots WHERE outOfSla=1 AND facility=${input.warehouseId} GROUP BY facility, clientName ORDER BY worstDaysLate DESC LIMIT 20`
          : sql`SELECT COALESCE(facility,'Unknown') AS warehouseId, clientName, COUNT(*) AS breachedOrders, MAX(bizDaysLate) AS worstDaysLate FROM sla_snapshots WHERE outOfSla=1 GROUP BY facility, clientName ORDER BY worstDaysLate DESC LIMIT 20`
      );

      return (rows as any[]).map((r) => ({
        warehouseId: r.warehouseId,
        clientName: r.clientName,
        breachedOrders: Number(r.breachedOrders),
        worstDaysLate: Number(r.worstDaysLate),
      }));
    }),

  /**
   * List distinct warehouses for the warehouse selector
   */
  warehouses: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const rows = await db.execute<any>(
      sql`SELECT DISTINCT facilityName AS warehouseId FROM allocation_runs WHERE facilityName IS NOT NULL AND facilityName != ''
          UNION SELECT DISTINCT facilityName AS warehouseId FROM small_parcel_sessions WHERE facilityName IS NOT NULL AND facilityName != ''
          UNION SELECT DISTINCT warehouseName AS warehouseId FROM qc_scan_sessions WHERE warehouseName IS NOT NULL AND warehouseName != ''
          ORDER BY warehouseId`
    );

    return (rows as any[]).map((r) => r.warehouseId as string);
  }),
});
