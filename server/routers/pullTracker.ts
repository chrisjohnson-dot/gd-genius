/**
 * pullTracker.ts
 * Warehouse Pull Tracker — tracks pick-time sessions for LTL warehouse associates.
 * Associates scan their pick ticket to start, enter their ID, scan items (pallets/cases),
 * then scan again to end. Data is stored and optionally pushed to OpFi.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const OPFI_BASE_URL = process.env.OPFI_BASE_URL || "https://gobilling-nefrolgy.manus.space";
const OPFI_API_KEY = process.env.OPFI_API_KEY;

// ─── Push to OpFi ─────────────────────────────────────────────────────────────
async function pushPullSessionToOpFi(session: {
  id: number;
  pickTicket: string;
  associateId: string;
  associateName: string | null;
  warehouseId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  totalPallets: number;
  totalCases: number;
  totalItems: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      source: "gd-genius",
      event: "pull_session.completed",
      data: {
        sessionId: session.id,
        pickTicket: session.pickTicket,
        associateId: session.associateId,
        associateName: session.associateName,
        warehouseId: session.warehouseId,
        startedAt: new Date(session.startedAt).toISOString(),
        endedAt: new Date(session.endedAt).toISOString(),
        durationSeconds: session.durationSeconds,
        totalPallets: session.totalPallets,
        totalCases: session.totalCases,
        totalItems: session.totalItems,
      },
    };
    const body = JSON.stringify(payload);
    const res = await fetch(`${OPFI_BASE_URL}/api/genius/pull-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(OPFI_API_KEY ? { "X-Api-Key": OPFI_API_KEY } : {}),
      },
      body,
    });
    if (res.ok || res.status === 409) return { success: true };
    const text = await res.text().catch(() => "");
    return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const pullTrackerRouter = router({

  // Start a new pull session — called when worker scans pick ticket + enters associate ID
  startSession: protectedProcedure
    .input(z.object({
      pickTicket: z.string().min(1).max(128),
      associateId: z.string().min(1).max(128),
      associateName: z.string().max(255).optional(),
      warehouseId: z.string().max(64).default("default"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const now = Date.now();

      // Check for an already-active session for this pick ticket
      const existing = await db.execute<any>(sql`
        SELECT id FROM pull_sessions
        WHERE pick_ticket = ${input.pickTicket} AND status = 'active'
        LIMIT 1
      `);
      if ((existing as any[]).length > 0) {
        return { sessionId: (existing as any[])[0].id, resumed: true };
      }

      const result = await db.execute<any>(sql`
        INSERT INTO pull_sessions
          (pick_ticket, associate_id, associate_name, warehouse_id, status, started_at, created_by)
        VALUES
          (${input.pickTicket}, ${input.associateId}, ${input.associateName ?? null},
           ${input.warehouseId}, 'active', ${now}, ${ctx.user.id})
      `);
      const sessionId = (result as any).insertId ?? (result as any)[0]?.insertId;
      return { sessionId: Number(sessionId), resumed: false };
    }),

  // End a pull session — records end time, duration, totals, and optionally pushes to OpFi
  endSession: protectedProcedure
    .input(z.object({
      sessionId: z.number().int().positive(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const now = Date.now();

      // Get session
      const rows = await db.execute<any>(sql`
        SELECT * FROM pull_sessions WHERE id = ${input.sessionId} AND status = 'active' LIMIT 1
      `);
      const session = (rows as any[])[0];
      if (!session) throw new Error("Session not found or already completed");

      const durationSeconds = Math.round((now - Number(session.started_at)) / 1000);

      // Count items
      const countRows = await db.execute<any>(sql`
        SELECT
          SUM(CASE WHEN item_type = 'pallet' THEN quantity ELSE 0 END) as pallets,
          SUM(CASE WHEN item_type = 'case' THEN quantity ELSE 0 END) as cases,
          SUM(quantity) as total
        FROM pull_session_items WHERE session_id = ${input.sessionId}
      `);
      const counts = (countRows as any[])[0] ?? {};
      const totalPallets = Number(counts.pallets) || 0;
      const totalCases = Number(counts.cases) || 0;
      const totalItems = Number(counts.total) || 0;

      await db.execute(sql`
        UPDATE pull_sessions SET
          status = 'completed',
          ended_at = ${now},
          duration_seconds = ${durationSeconds},
          total_pallets = ${totalPallets},
          total_cases = ${totalCases},
          total_items = ${totalItems},
          notes = ${input.notes ?? null}
        WHERE id = ${input.sessionId}
      `);

      // Push to OpFi
      const opfiResult = await pushPullSessionToOpFi({
        id: input.sessionId,
        pickTicket: session.pick_ticket,
        associateId: session.associate_id,
        associateName: session.associate_name,
        warehouseId: session.warehouse_id,
        startedAt: Number(session.started_at),
        endedAt: now,
        durationSeconds,
        totalPallets,
        totalCases,
        totalItems,
      });

      if (opfiResult.success) {
        await db.execute(sql`
          UPDATE pull_sessions SET opfi_pushed = 1, opfi_pushed_at = ${now}
          WHERE id = ${input.sessionId}
        `);
      }

      return {
        success: true,
        durationSeconds,
        totalPallets,
        totalCases,
        totalItems,
        opfiPushed: opfiResult.success,
        opfiError: opfiResult.error,
      };
    }),

  // Add a scanned item (pallet or case) to the active session
  addItem: protectedProcedure
    .input(z.object({
      sessionId: z.number().int().positive(),
      itemType: z.enum(["pallet", "case", "unit"]).default("case"),
      barcode: z.string().max(255).optional(),
      sku: z.string().max(128).optional(),
      description: z.string().max(255).optional(),
      quantity: z.number().int().min(1).default(1),
      location: z.string().max(128).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const now = Date.now();

      // Verify session is active
      const rows = await db.execute<any>(sql`
        SELECT id FROM pull_sessions WHERE id = ${input.sessionId} AND status = 'active' LIMIT 1
      `);
      if ((rows as any[]).length === 0) throw new Error("Session not active");

      const result = await db.execute<any>(sql`
        INSERT INTO pull_session_items
          (session_id, item_type, barcode, sku, description, quantity, location, scanned_at)
        VALUES
          (${input.sessionId}, ${input.itemType}, ${input.barcode ?? null},
           ${input.sku ?? null}, ${input.description ?? null},
           ${input.quantity}, ${input.location ?? null}, ${now})
      `);
      const itemId = (result as any).insertId ?? (result as any)[0]?.insertId;
      return { itemId: Number(itemId) };
    }),

  // Remove a scanned item from the session
  removeItem: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`DELETE FROM pull_session_items WHERE id = ${input.itemId}`);
      return { success: true };
    }),

  // Get a single session with its items
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const sessions = await db.execute<any>(sql`
        SELECT * FROM pull_sessions WHERE id = ${input.sessionId} LIMIT 1
      `);
      const session = (sessions as any[])[0];
      if (!session) return null;

      const items = await db.execute<any>(sql`
        SELECT * FROM pull_session_items WHERE session_id = ${input.sessionId}
        ORDER BY scanned_at ASC
      `);

      return {
        id: session.id,
        pickTicket: session.pick_ticket,
        associateId: session.associate_id,
        associateName: session.associate_name,
        warehouseId: session.warehouse_id,
        status: session.status,
        startedAt: Number(session.started_at),
        endedAt: session.ended_at ? Number(session.ended_at) : null,
        durationSeconds: session.duration_seconds,
        totalPallets: session.total_pallets,
        totalCases: session.total_cases,
        totalItems: session.total_items,
        notes: session.notes,
        opfiPushed: Boolean(session.opfi_pushed),
        items: (items as any[]).map((i: any) => ({
          id: i.id,
          itemType: i.item_type,
          barcode: i.barcode,
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          location: i.location,
          scannedAt: Number(i.scanned_at),
        })),
      };
    }),

  // List sessions — for manager dashboard
  listSessions: protectedProcedure
    .input(z.object({
      warehouseId: z.string().optional(),
      associateId: z.string().optional(),
      status: z.enum(["active", "completed", "cancelled", "all"]).default("all"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
      dateFrom: z.number().optional(), // unix ms
      dateTo: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db.execute<any>(sql`
        SELECT
          ps.*,
          COUNT(psi.id) as item_count
        FROM pull_sessions ps
        LEFT JOIN pull_session_items psi ON psi.session_id = ps.id
        WHERE 1=1
          ${input.warehouseId ? sql`AND ps.warehouse_id = ${input.warehouseId}` : sql``}
          ${input.associateId ? sql`AND ps.associate_id = ${input.associateId}` : sql``}
          ${input.status !== "all" ? sql`AND ps.status = ${input.status}` : sql``}
          ${input.dateFrom ? sql`AND ps.started_at >= ${input.dateFrom}` : sql``}
          ${input.dateTo ? sql`AND ps.started_at <= ${input.dateTo}` : sql``}
        GROUP BY ps.id
        ORDER BY ps.started_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);

      return (rows as any[]).map((r: any) => ({
        id: r.id,
        pickTicket: r.pick_ticket,
        associateId: r.associate_id,
        associateName: r.associate_name,
        warehouseId: r.warehouse_id,
        status: r.status,
        startedAt: Number(r.started_at),
        endedAt: r.ended_at ? Number(r.ended_at) : null,
        durationSeconds: r.duration_seconds,
        totalPallets: r.total_pallets,
        totalCases: r.total_cases,
        totalItems: r.total_items,
        opfiPushed: Boolean(r.opfi_pushed),
        itemCount: Number(r.item_count),
      }));
    }),

  // Associate efficiency stats — for manager dashboard
  associateStats: protectedProcedure
    .input(z.object({
      warehouseId: z.string().optional(),
      dateFrom: z.number().optional(),
      dateTo: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db.execute<any>(sql`
        SELECT
          associate_id,
          MAX(associate_name) as associate_name,
          COUNT(*) as session_count,
          SUM(total_pallets) as total_pallets,
          SUM(total_cases) as total_cases,
          SUM(total_items) as total_items,
          SUM(duration_seconds) as total_seconds,
          AVG(duration_seconds) as avg_seconds_per_session,
          ROUND(SUM(total_items) / NULLIF(SUM(duration_seconds) / 3600, 0), 1) as items_per_hour
        FROM pull_sessions
        WHERE status = 'completed'
          ${input.warehouseId ? sql`AND warehouse_id = ${input.warehouseId}` : sql``}
          ${input.dateFrom ? sql`AND started_at >= ${input.dateFrom}` : sql``}
          ${input.dateTo ? sql`AND started_at <= ${input.dateTo}` : sql``}
        GROUP BY associate_id
        ORDER BY items_per_hour DESC
      `);

      return (rows as any[]).map((r: any) => ({
        associateId: r.associate_id,
        associateName: r.associate_name,
        sessionCount: Number(r.session_count),
        totalPallets: Number(r.total_pallets) || 0,
        totalCases: Number(r.total_cases) || 0,
        totalItems: Number(r.total_items) || 0,
        totalSeconds: Number(r.total_seconds) || 0,
        avgSecondsPerSession: Math.round(Number(r.avg_seconds_per_session) || 0),
        itemsPerHour: Number(r.items_per_hour) || 0,
      }));
    }),

  // Manually retry OpFi push for a completed session
  retryOpFiPush: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db.execute<any>(sql`
        SELECT * FROM pull_sessions WHERE id = ${input.sessionId} AND status = 'completed' LIMIT 1
      `);
      const session = (rows as any[])[0];
      if (!session) throw new Error("Completed session not found");

      const result = await pushPullSessionToOpFi({
        id: session.id,
        pickTicket: session.pick_ticket,
        associateId: session.associate_id,
        associateName: session.associate_name,
        warehouseId: session.warehouse_id,
        startedAt: Number(session.started_at),
        endedAt: Number(session.ended_at),
        durationSeconds: session.duration_seconds,
        totalPallets: session.total_pallets,
        totalCases: session.total_cases,
        totalItems: session.total_items,
      });

      if (result.success) {
        await db.execute(sql`
          UPDATE pull_sessions SET opfi_pushed = 1, opfi_pushed_at = ${Date.now()}
          WHERE id = ${input.sessionId}
        `);
      }
      return result;
    }),
});
