import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql, eq, and, isNull, desc } from "drizzle-orm";
import { mysqlTable, int, varchar, text, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";

// Inline table definitions (avoids interactive drizzle-kit generate prompts)
const shiftSessions = mysqlTable("shift_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 128 }).notNull(),
  warehouseId: varchar("warehouseId", { length: 64 }),
  role: varchar("role", { length: 64 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  notes: text("notes"),
});

const shiftTasks = mysqlTable("shift_tasks", {
  id: int("id").autoincrement().primaryKey(),
  shiftSessionId: int("shiftSessionId").notNull(),
  userId: int("userId").notNull(),
  taskType: varchar("taskType", { length: 64 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).notNull().default("medium"),
  status: mysqlEnum("status", ["pending", "in_progress", "done", "skipped"]).notNull().default("pending"),
  entityType: varchar("entityType", { length: 64 }),
  entityId: varchar("entityId", { length: 128 }),
  dueAt: timestamp("dueAt"),
  completedAt: timestamp("completedAt"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const myShiftRouter = router({
  // Get the current user's active shift session (no endedAt)
  currentShift: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const [session] = await db
      .select()
      .from(shiftSessions)
      .where(and(eq(shiftSessions.userId, ctx.user.id), isNull(shiftSessions.endedAt)))
      .orderBy(desc(shiftSessions.startedAt))
      .limit(1);

    if (!session) return null;

    const tasks = await db
      .select()
      .from(shiftTasks)
      .where(eq(shiftTasks.shiftSessionId, session.id))
      .orderBy(shiftTasks.sortOrder, shiftTasks.createdAt);

    return { ...session, tasks };
  }),

  // Start a new shift
  startShift: protectedProcedure
    .input(
      z.object({
        warehouseId: z.string().optional(),
        role: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // End any existing open shift first
      await db
        .update(shiftSessions)
        .set({ endedAt: new Date() })
        .where(and(eq(shiftSessions.userId, ctx.user.id), isNull(shiftSessions.endedAt)));

      const [result] = await db.insert(shiftSessions).values({
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? `user-${ctx.user.id}`,
        warehouseId: input.warehouseId,
        role: input.role,
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  // End the current shift
  endShift: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db
        .update(shiftSessions)
        .set({ endedAt: new Date(), notes: input.notes })
        .where(and(eq(shiftSessions.id, input.id), eq(shiftSessions.userId, ctx.user.id)));
      return { success: true };
    }),

  // Add a task to the current shift
  addTask: protectedProcedure
    .input(
      z.object({
        shiftSessionId: z.number(),
        taskType: z.string().min(1).max(64),
        title: z.string().min(1).max(256),
        description: z.string().optional(),
        priority: z.enum(["critical", "high", "medium", "low"]).optional().default("medium"),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        dueAt: z.date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Get current max sortOrder
      const [maxRow] = await db
        .select({ maxSort: sql<number>`MAX(sort_order)` })
        .from(shiftTasks)
        .where(eq(shiftTasks.shiftSessionId, input.shiftSessionId));
      const nextSort = (((maxRow?.maxSort ?? 0) as number) || 0) + 10;

      const [result] = await db.insert(shiftTasks).values({
        shiftSessionId: input.shiftSessionId,
        userId: ctx.user.id,
        taskType: input.taskType,
        title: input.title,
        description: input.description,
        priority: input.priority,
        entityType: input.entityType,
        entityId: input.entityId,
        dueAt: input.dueAt,
        sortOrder: nextSort,
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  // Update task status
  updateTaskStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "in_progress", "done", "skipped"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = { status: input.status };
      if (input.status === "done") update.completedAt = new Date();

      await db
        .update(shiftTasks)
        .set(update)
        .where(and(eq(shiftTasks.id, input.id), eq(shiftTasks.userId, ctx.user.id)));
      return { success: true };
    }),

  // Delete a task
  deleteTask: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db
        .delete(shiftTasks)
        .where(and(eq(shiftTasks.id, input.id), eq(shiftTasks.userId, ctx.user.id)));
      return { success: true };
    }),

  // Shift stats: completed tasks, duration, etc.
  stats: protectedProcedure
    .input(z.object({ shiftSessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, done: 0, inProgress: 0, pending: 0, skipped: 0 };

      const tasks = await db
        .select()
        .from(shiftTasks)
        .where(eq(shiftTasks.shiftSessionId, input.shiftSessionId));

      return {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        pending: tasks.filter((t) => t.status === "pending").length,
        skipped: tasks.filter((t) => t.status === "skipped").length,
      };
    }),

  // List distinct warehouses for the start-shift dropdown
  warehouses: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute<{ warehouseId: string }>(
      sql`SELECT DISTINCT facilityName AS warehouseId FROM allocation_runs WHERE facilityName IS NOT NULL AND facilityName != ''
          UNION SELECT DISTINCT facilityName AS warehouseId FROM small_parcel_sessions WHERE facilityName IS NOT NULL AND facilityName != ''
          UNION SELECT DISTINCT warehouseName AS warehouseId FROM qc_scan_sessions WHERE warehouseName IS NOT NULL AND warehouseName != ''
          UNION SELECT DISTINCT warehouseId AS warehouseId FROM shift_sessions WHERE warehouseId IS NOT NULL AND warehouseId != ''
          ORDER BY warehouseId`
    );
    return (rows as any[]).map((r) => r.warehouseId as string);
  }),

  // Recent shifts (last 5)
  recentShifts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const sessions = await db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.userId, ctx.user.id))
      .orderBy(desc(shiftSessions.startedAt))
      .limit(5);
    return sessions;
  }),
});
