import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { mysqlTable, int, varchar, text, timestamp, mysqlEnum, json } from "drizzle-orm/mysql-core";
import { eq, and, desc, sql } from "drizzle-orm";

// ─── Inline table definitions ─────────────────────────────────────────────────
const scanSessions = mysqlTable("scan_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 128 }).notNull(),
  mode: varchar("mode", { length: 64 }).notNull().default("generic"),
  warehouseId: varchar("warehouseId", { length: 64 }),
  status: mysqlEnum("status", ["active", "completed", "aborted"]).notNull().default("active"),
  totalScans: int("totalScans").notNull().default(0),
  successScans: int("successScans").notNull().default(0),
  errorScans: int("errorScans").notNull().default(0),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

const scanEvents = mysqlTable("scan_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId").notNull(),
  barcode: varchar("barcode", { length: 256 }).notNull(),
  barcodeType: varchar("barcodeType", { length: 64 }),
  resolvedEntityType: varchar("resolvedEntityType", { length: 64 }),
  resolvedEntityId: varchar("resolvedEntityId", { length: 128 }),
  resolvedLabel: varchar("resolvedLabel", { length: 256 }),
  status: mysqlEnum("status", ["success", "error", "warning"]).notNull().default("success"),
  errorMessage: text("errorMessage"),
  metadata: json("metadata"),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
});

// ─── Barcode resolver ─────────────────────────────────────────────────────────
// Resolves a barcode string to a known entity type and ID.
// Extend this function to add more barcode patterns.
async function resolveBarcode(
  barcode: string,
  _mode: string
): Promise<{
  entityType: string | null;
  entityId: string | null;
  label: string | null;
  status: "success" | "error" | "warning";
  errorMessage: string | null;
}> {
  const b = barcode.trim();

  // FedEx tracking number patterns (12, 15, 20, 22 digits)
  if (/^\d{12}$/.test(b) || /^\d{15}$/.test(b) || /^\d{20}$/.test(b) || /^\d{22}$/.test(b)) {
    return { entityType: "tracking", entityId: b, label: `FedEx: ${b}`, status: "success", errorMessage: null };
  }
  // UPS tracking (1Z...)
  if (/^1Z[A-Z0-9]{16}$/.test(b)) {
    return { entityType: "tracking", entityId: b, label: `UPS: ${b}`, status: "success", errorMessage: null };
  }
  // USPS tracking (20-22 digits)
  if (/^\d{20,22}$/.test(b)) {
    return { entityType: "tracking", entityId: b, label: `USPS: ${b}`, status: "success", errorMessage: null };
  }
  // LPN / pallet label (LP + digits)
  if (/^LP\d+$/i.test(b)) {
    return { entityType: "lpn", entityId: b.toUpperCase(), label: `LPN: ${b.toUpperCase()}`, status: "success", errorMessage: null };
  }
  // Order reference (ORD- prefix)
  if (/^ORD-\d+$/i.test(b)) {
    return { entityType: "order", entityId: b.toUpperCase(), label: `Order: ${b.toUpperCase()}`, status: "success", errorMessage: null };
  }
  // SKU / item barcode (alphanumeric, 6-20 chars)
  if (/^[A-Z0-9\-_]{6,20}$/i.test(b)) {
    return { entityType: "sku", entityId: b.toUpperCase(), label: `SKU: ${b.toUpperCase()}`, status: "success", errorMessage: null };
  }

  return {
    entityType: null,
    entityId: null,
    label: null,
    status: "warning",
    errorMessage: `Unrecognized barcode format: ${b}`,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const scanModeRouter = router({
  // Start a new scan session
  startSession: protectedProcedure
    .input(
      z.object({
        mode: z.string().min(1).max(64).optional().default("generic"),
        warehouseId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Abort any existing active session for this user
      await db
        .update(scanSessions)
        .set({ status: "aborted", endedAt: new Date() })
        .where(and(eq(scanSessions.userId, ctx.user.id), eq(scanSessions.status, "active")));

      const [result] = await db.insert(scanSessions).values({
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? `user-${ctx.user.id}`,
        mode: input.mode,
        warehouseId: input.warehouseId,
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  // End a scan session
  endSession: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db
        .update(scanSessions)
        .set({ status: "completed", endedAt: new Date(), notes: input.notes })
        .where(and(eq(scanSessions.id, input.id), eq(scanSessions.userId, ctx.user.id)));
      return { success: true };
    }),

  // Get active session for current user
  activeSession: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const [session] = await db
      .select()
      .from(scanSessions)
      .where(and(eq(scanSessions.userId, ctx.user.id), eq(scanSessions.status, "active")))
      .orderBy(desc(scanSessions.startedAt))
      .limit(1);

    if (!session) return null;

    const events = await db
      .select()
      .from(scanEvents)
      .where(eq(scanEvents.sessionId, session.id))
      .orderBy(desc(scanEvents.scannedAt))
      .limit(50);

    return { ...session, events };
  }),

  // Process a scanned barcode
  scan: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        barcode: z.string().min(1).max(256),
        barcodeType: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Get session to know mode
      const [session] = await db
        .select()
        .from(scanSessions)
        .where(and(eq(scanSessions.id, input.sessionId), eq(scanSessions.userId, ctx.user.id)))
        .limit(1);

      if (!session) throw new Error("Scan session not found");
      if (session.status !== "active") throw new Error("Scan session is not active");

      const resolved = await resolveBarcode(input.barcode, session.mode);

      // Insert scan event
      const [result] = await db.insert(scanEvents).values({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        barcode: input.barcode,
        barcodeType: input.barcodeType,
        resolvedEntityType: resolved.entityType,
        resolvedEntityId: resolved.entityId,
        resolvedLabel: resolved.label,
        status: resolved.status,
        errorMessage: resolved.errorMessage,
      });

      // Update session counters
      const isSuccess = resolved.status === "success";
      await db
        .update(scanSessions)
        .set({
          totalScans: sql`total_scans + 1`,
          successScans: isSuccess ? sql`success_scans + 1` : sql`success_scans`,
          errorScans: !isSuccess ? sql`error_scans + 1` : sql`error_scans`,
        })
        .where(eq(scanSessions.id, input.sessionId));

      return {
        id: (result as { insertId: number }).insertId,
        ...resolved,
      };
    }),

  // Recent sessions (last 10)
  recentSessions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(scanSessions)
      .where(eq(scanSessions.userId, ctx.user.id))
      .orderBy(desc(scanSessions.startedAt))
      .limit(10);
  }),

  // Get events for a session
  sessionEvents: protectedProcedure
    .input(z.object({ sessionId: z.number(), limit: z.number().min(1).max(500).optional().default(100) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(scanEvents)
        .where(and(eq(scanEvents.sessionId, input.sessionId), eq(scanEvents.userId, ctx.user.id)))
        .orderBy(desc(scanEvents.scannedAt))
        .limit(input.limit);
    }),
});
