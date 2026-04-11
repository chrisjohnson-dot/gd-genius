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
});
