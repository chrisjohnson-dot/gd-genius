import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { clientProfiles, clientProfileAudit } from "../../drizzle/schema";
import { eq, and, sql, desc, like } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────────

function db() {
  const d = getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const clientProfilesRouter = router({
  // List all clients with key metrics (sorted alphabetically per preference)
  list: protectedProcedure
    .input(z.object({ configId: z.number().optional(), search: z.string().optional() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return [];

      // Get all clients from client_visibility joined with profiles
      const rows = await d.execute(sql`
        SELECT
          cv.clientId,
          cv.clientName,
          cv.orderChannel,
          cv.isVisible,
          cv.configId,
          cp.id AS profileId,
          cp.brandColor,
          cp.contactName,
          cp.contactEmail,
          cp.slaStandardHours,
          cp.specialInstructions,
          cp.qcScanType,
          COALESCE(open_orders.cnt, 0) AS openOrderCount,
          COALESCE(unalloc_orders.cnt, 0) AS unallocatedCount,
          COALESCE(exc.cnt, 0) AS activeExceptions
        FROM client_visibility cv
        LEFT JOIN client_profiles cp ON cp.customerId = cv.clientId AND cp.configId = cv.configId
        LEFT JOIN (
          SELECT clientId, COUNT(*) AS cnt
          FROM order_tracking
          WHERE status NOT IN ('shipped', 'closed', 'cancelled')
          GROUP BY clientId
        ) open_orders ON open_orders.clientId = cv.clientId
        LEFT JOIN (
          SELECT clientId, COUNT(*) AS cnt
          FROM order_tracking
          WHERE status = 'unallocated'
          GROUP BY clientId
        ) unalloc_orders ON unalloc_orders.clientId = cv.clientId
        LEFT JOIN (
          SELECT clientName, COUNT(*) AS cnt
          FROM exceptions
          WHERE status NOT IN ('resolved', 'closed')
          GROUP BY clientName
        ) exc ON exc.clientName = cv.clientName
        WHERE cv.isVisible = 1
        ${input?.configId ? sql`AND cv.configId = ${input.configId}` : sql``}
        ${input?.search ? sql`AND cv.clientName LIKE ${`%${input.search}%`}` : sql``}
        ORDER BY cv.clientName ASC
      `);

      return (rows as unknown) as Array<{
        clientId: number;
        clientName: string;
        orderChannel: string;
        isVisible: number;
        configId: number;
        profileId: number | null;
        brandColor: string | null;
        contactName: string | null;
        contactEmail: string | null;
        slaStandardHours: number | null;
        specialInstructions: string | null;
        qcScanType: string | null;
        openOrderCount: number;
        unallocatedCount: number;
        activeExceptions: number;
      }>;
    }),

  // Get full profile for a single client (creates default if not exists)
  getProfile: protectedProcedure
    .input(z.object({ customerId: z.number(), configId: z.number() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return null;

      // Try to get existing profile
      const existing = await d
        .select()
        .from(clientProfiles)
        .where(and(eq(clientProfiles.customerId, input.customerId), eq(clientProfiles.configId, input.configId)))
        .limit(1);

      if (existing.length > 0) return existing[0];

      // Get client name from client_visibility
      const cv = await d.execute(sql`
        SELECT clientName, orderChannel FROM client_visibility
        WHERE clientId = ${input.customerId} AND configId = ${input.configId}
        LIMIT 1
      `);
      const cvRow = ((cv as unknown) as Array<{ clientName: string; orderChannel: string }>)[0];
      if (!cvRow) return null;

      // Create default profile
      await d.insert(clientProfiles).values({
        customerId: input.customerId,
        configId: input.configId,
        customerName: cvRow.clientName,
        orderChannel: (cvRow.orderChannel as "b2b" | "d2c" | "both") ?? "b2b",
      });

      const created = await d
        .select()
        .from(clientProfiles)
        .where(and(eq(clientProfiles.customerId, input.customerId), eq(clientProfiles.configId, input.configId)))
        .limit(1);

      return created[0] ?? null;
    }),

  // Update profile fields (with audit logging)
  updateProfile: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      configId: z.number(),
      patch: z.object({
        brandColor: z.string().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        orderChannel: z.enum(["b2b", "d2c", "both"]).optional(),
        slaStandardHours: z.number().optional(),
        slaExpeditedHours: z.number().optional(),
        slaCutoffTime: z.string().optional(),
        qcScanType: z.enum(["standard", "enhanced", "visual"]).optional(),
        qcDamageThresholdPct: z.number().optional(),
        qcItemCountRequired: z.number().optional(),
        qcPhotoRequirement: z.enum(["none", "exceptions_only", "per_order", "per_item"]).optional(),
        packagingBoxType: z.string().optional(),
        packagingVoidFill: z.number().optional(),
        packagingInsertSheets: z.number().optional(),
        packagingTissueWrap: z.number().optional(),
        packagingGiftMessaging: z.number().optional(),
        lotTrackingRequired: z.number().optional(),
        billingPerOrderFee: z.string().optional(),
        billingPerItemFee: z.string().optional(),
        billingStorageFee: z.string().optional(),
        billingFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
        billingPoRequired: z.number().optional(),
        specialInstructions: z.string().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await getDb();
      if (!d) throw new Error("Database not available");

      // Get current profile for audit
      const current = await d
        .select()
        .from(clientProfiles)
        .where(and(eq(clientProfiles.customerId, input.customerId), eq(clientProfiles.configId, input.configId)))
        .limit(1);

      if (current.length === 0) throw new Error("Profile not found");

      const old = current[0];
      const auditEntries: Array<{
        clientProfileId: number;
        customerId: number;
        userId: string;
        userName: string;
        fieldName: string;
        oldValue: string;
        newValue: string;
      }> = [];

      for (const [key, val] of Object.entries(input.patch)) {
        const oldVal = String((old as Record<string, unknown>)[key] ?? "");
        const newVal = String(val ?? "");
        if (oldVal !== newVal) {
          auditEntries.push({
            clientProfileId: old.id,
            customerId: input.customerId,
            userId: ctx.user.openId,
            userName: ctx.user.name ?? "Unknown",
            fieldName: key,
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      }

      await d
        .update(clientProfiles)
        .set(input.patch as Partial<typeof clientProfiles.$inferInsert>)
        .where(and(eq(clientProfiles.customerId, input.customerId), eq(clientProfiles.configId, input.configId)));

      if (auditEntries.length > 0) {
        for (const entry of auditEntries) {
          await d.insert(clientProfileAudit).values(entry);
        }
      }

      return { success: true, auditCount: auditEntries.length };
    }),

  // Get order history for a client (last 90 days)
  getOrderHistory: protectedProcedure
    .input(z.object({ customerId: z.number(), configId: z.number(), days: z.number().default(90) }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return [];

      const rows = await d.execute(sql`
        SELECT
          DATE(createdAt) AS date,
          COUNT(*) AS totalOrders,
          SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shippedOrders,
          SUM(CASE WHEN status = 'unallocated' THEN 1 ELSE 0 END) AS unallocatedOrders
        FROM order_tracking
        WHERE clientId = ${input.customerId}
          AND configId = ${input.configId}
          AND createdAt >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `);

      return (rows as unknown) as Array<{ date: string; totalOrders: number; shippedOrders: number; unallocatedOrders: number }>;
    }),

  // Get SLA compliance trend (last 30 days) — % of orders shipped within SLA
  getSlaTrend: protectedProcedure
    .input(z.object({ customerId: z.number(), configId: z.number() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return [];

      const rows = await d.execute(sql`
        SELECT
          DATE(createdAt) AS date,
          COUNT(*) AS total,
          SUM(CASE WHEN slaStatus = 'on_time' THEN 1 ELSE 0 END) AS onTime,
          SUM(CASE WHEN slaStatus = 'breached' THEN 1 ELSE 0 END) AS breached
        FROM sla_snapshots
        WHERE clientId = ${input.customerId}
          AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `);

      return (rows as unknown) as Array<{ date: string; total: number; onTime: number; breached: number }>;
    }),

  // Get active exceptions for a client
  getExceptions: protectedProcedure
    .input(z.object({ clientName: z.string() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return [];

      const excRows = await d.execute(sql`
        SELECT * FROM exceptions
        WHERE clientName = ${input.clientName}
          AND status NOT IN ('resolved', 'closed')
        ORDER BY createdAt DESC
        LIMIT 20
      `);

      return (excRows as unknown) as unknown[];
    }),

  // Get audit log for a profile
  getAuditLog: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return [];

      return d
        .select()
        .from(clientProfileAudit)
        .where(eq(clientProfileAudit.customerId, input.customerId))
        .orderBy(desc(clientProfileAudit.changedAt))
        .limit(50);
    }),

  // Get allocation rules for a client
  getAllocationRules: protectedProcedure
    .input(z.object({ customerId: z.number(), configId: z.number() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return null;

      const rows = await d.execute(sql`
        SELECT * FROM customer_rules
        WHERE customerId = ${input.customerId} AND configId = ${input.configId}
        LIMIT 1
      `);

      return ((rows as unknown) as unknown[])[0] ?? null;
    }),

  // Get shipping rules for a client
  getShippingRules: protectedProcedure
    .input(z.object({ customerId: z.number(), configId: z.number() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return [];

      const rows = await d.execute(sql`
        SELECT * FROM customer_shipping_rules
        WHERE customer_id = ${input.customerId} AND config_id = ${input.configId}
      `);

      return (rows as unknown) as unknown[];
    }),

  // Get summary stats for a client (for the profile header)
  getStats: protectedProcedure
    .input(z.object({ customerId: z.number(), configId: z.number(), clientName: z.string() }))
    .query(async ({ input }) => {
      const d = await getDb();
      if (!d) return null;

      const rows = await d.execute(sql`
        SELECT
          COUNT(*) AS openOrders,
          SUM(CASE WHEN status = 'unallocated' THEN 1 ELSE 0 END) AS unallocatedOrders,
          SUM(CASE WHEN status = 'shipped' AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS shippedThisMonth,
          SUM(CASE WHEN status = 'shipped' AND createdAt >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS shippedLastMonth
        FROM order_tracking
        WHERE clientId = ${input.customerId}
          AND configId = ${input.configId}
          AND status NOT IN ('cancelled')
      `);

      const excRows = await d.execute(sql`
        SELECT COUNT(*) AS activeExceptions
        FROM exceptions
        WHERE clientName = ${input.clientName}
          AND status NOT IN ('resolved', 'closed')
      `);

      const stats = ((rows as unknown) as Array<Record<string, unknown>>)[0] ?? {};
      const excStats = ((excRows as unknown) as Array<Record<string, unknown>>)[0] ?? {};

      return {
        openOrders: Number(stats.openOrders ?? 0),
        unallocatedOrders: Number(stats.unallocatedOrders ?? 0),
        shippedThisMonth: Number(stats.shippedThisMonth ?? 0),
        shippedLastMonth: Number(stats.shippedLastMonth ?? 0),
        activeExceptions: Number(excStats.activeExceptions ?? 0),
        trend: Number(stats.shippedLastMonth ?? 0) > 0
          ? ((Number(stats.shippedThisMonth ?? 0) - Number(stats.shippedLastMonth ?? 0)) / Number(stats.shippedLastMonth)) * 100
          : 0,
      };
    }),
});
