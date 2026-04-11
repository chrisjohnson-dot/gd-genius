import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { exceptions, exceptionEvents } from "../../drizzle/schema";
import { eq, desc, and, or, like, inArray } from "drizzle-orm";

export const exceptionsRouter = router({
  // List exceptions with optional filters
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["open", "in_progress", "resolved", "dismissed", "all"]).optional().default("open"),
        priority: z.enum(["critical", "high", "medium", "low", "all"]).optional().default("all"),
        assignedToMe: z.boolean().optional().default(false),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status !== "all") {
        conditions.push(eq(exceptions.status, input.status as "open" | "in_progress" | "resolved" | "dismissed"));
      }
      if (input.priority !== "all") {
        conditions.push(eq(exceptions.priority, input.priority as "critical" | "high" | "medium" | "low"));
      }
      if (input.assignedToMe && ctx.user) {
        conditions.push(eq(exceptions.assignedToId, ctx.user.id));
      }
      if (input.search) {
        const q = `%${input.search}%`;
        conditions.push(
          or(
            like(exceptions.title, q),
            like(exceptions.clientName, q),
            like(exceptions.exceptionType, q),
            like(exceptions.entityId, q)
          )
        );
      }

      const rows = await db
        .select()
        .from(exceptions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(exceptions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  // Get a single exception with its events
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [exc] = await db
        .select()
        .from(exceptions)
        .where(eq(exceptions.id, input.id))
        .limit(1);
      if (!exc) throw new Error("Exception not found");

      const events = await db
        .select()
        .from(exceptionEvents)
        .where(eq(exceptionEvents.exceptionId, input.id))
        .orderBy(desc(exceptionEvents.createdAt));

      return { ...exc, events };
    }),

  // Create a new exception
  create: protectedProcedure
    .input(
      z.object({
        exceptionType: z.string().min(1).max(64),
        priority: z.enum(["critical", "high", "medium", "low"]).optional().default("medium"),
        title: z.string().min(1).max(256),
        description: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        warehouseId: z.string().optional(),
        clientName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [result] = await db.insert(exceptions).values({
        ...input,
        status: "open",
      });
      const id = (result as { insertId: number }).insertId;

      await db.insert(exceptionEvents).values({
        exceptionId: id,
        eventType: "created",
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email,
        detail: `Exception created by ${ctx.user.name ?? ctx.user.email}`,
      });

      return { id };
    }),

  // Update status (open → in_progress → resolved/dismissed)
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["open", "in_progress", "resolved", "dismissed"]),
        resolutionNote: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { status: input.status };
      if (input.status === "resolved" || input.status === "dismissed") {
        updateData.resolvedAt = new Date();
        updateData.resolvedById = ctx.user.id;
        updateData.resolvedByName = ctx.user.name ?? ctx.user.email;
        if (input.resolutionNote) updateData.resolutionNote = input.resolutionNote;
      }

      await db
        .update(exceptions)
        .set(updateData)
        .where(eq(exceptions.id, input.id));

      await db.insert(exceptionEvents).values({
        exceptionId: input.id,
        eventType: `status_changed_to_${input.status}`,
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email,
        detail: input.resolutionNote ?? `Status changed to ${input.status}`,
      });

      return { success: true };
    }),

  // Assign exception to a user
  assign: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        assignedToId: z.number(),
        assignedToName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db
        .update(exceptions)
        .set({
          assignedToId: input.assignedToId,
          assignedToName: input.assignedToName,
          status: "in_progress",
        })
        .where(eq(exceptions.id, input.id));

      await db.insert(exceptionEvents).values({
        exceptionId: input.id,
        eventType: "assigned",
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email,
        detail: `Assigned to ${input.assignedToName}`,
      });

      return { success: true };
    }),

  // Update priority
  updatePriority: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        priority: z.enum(["critical", "high", "medium", "low"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db
        .update(exceptions)
        .set({ priority: input.priority })
        .where(eq(exceptions.id, input.id));

      await db.insert(exceptionEvents).values({
        exceptionId: input.id,
        eventType: "priority_changed",
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email,
        detail: `Priority changed to ${input.priority}`,
      });

      return { success: true };
    }),

  // Summary counts for the badge/header
  counts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

    const rows = await db
      .select()
      .from(exceptions)
      .where(inArray(exceptions.status, ["open", "in_progress"]));

    const counts = { total: rows.length, critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of rows) {
      const p = r.priority as keyof typeof counts;
      if (p in counts) counts[p]++;
    }
    return counts;
  }),
});
