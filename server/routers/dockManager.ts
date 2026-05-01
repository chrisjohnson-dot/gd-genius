import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { dockPositions, dockAssignments, orderTracking } from "../../drizzle/schema";
import { eq, and, isNull, sql, asc, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the total pallets currently assigned (not cleared) for a given position */
async function getOccupiedPallets(db: Awaited<ReturnType<typeof getDb>>, positionId: number): Promise<number> {
  if (!db) return 0;
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(pallet_count), 0)` })
    .from(dockAssignments)
    .where(and(eq(dockAssignments.dockPositionId, positionId), isNull(dockAssignments.clearedAt)));
  return Number(rows[0]?.total ?? 0);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const dockManagerRouter = router({

  /** List all dock positions with current occupancy */
  listPositions: protectedProcedure
    .input(z.object({ facilityName: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const facility = input?.facilityName ?? "COL-Columbus";

      // Get all positions for this facility
      const positions = await db
        .select()
        .from(dockPositions)
        .where(and(eq(dockPositions.facilityName, facility), eq(dockPositions.isActive, true)))
        .orderBy(asc(dockPositions.lane), asc(dockPositions.position));

      // Get active assignments with order info
      const activeAssignments = await db
        .select({
          id: dockAssignments.id,
          extensivOrderId: dockAssignments.extensivOrderId,
          dockPositionId: dockAssignments.dockPositionId,
          palletCount: dockAssignments.palletCount,
          assignedBy: dockAssignments.assignedBy,
          assignedAt: dockAssignments.assignedAt,
          bolNumber: dockAssignments.bolNumber,
          notes: dockAssignments.notes,
          // Order info
          referenceNum: orderTracking.referenceNum,
          clientName: orderTracking.clientName,
          shipToName: orderTracking.shipToName,
          shipToCity: orderTracking.shipToCity,
          requiredShipDate: orderTracking.requiredShipDate,
          shipwellStatus: orderTracking.shipwellStatus,
          lifecycleStatus: orderTracking.lifecycleStatus,
        })
        .from(dockAssignments)
        .leftJoin(orderTracking, eq(dockAssignments.extensivOrderId, orderTracking.extensivOrderId))
        .where(isNull(dockAssignments.clearedAt))
        .orderBy(asc(dockAssignments.assignedAt));

      // Build occupancy map
      const occupancyMap = new Map<number, number>();
      for (const a of activeAssignments) {
        occupancyMap.set(a.dockPositionId, (occupancyMap.get(a.dockPositionId) ?? 0) + a.palletCount);
      }

      // Build assignments map
      const assignmentsMap = new Map<number, typeof activeAssignments>();
      for (const a of activeAssignments) {
        if (!assignmentsMap.has(a.dockPositionId)) assignmentsMap.set(a.dockPositionId, []);
        assignmentsMap.get(a.dockPositionId)!.push(a);
      }

      return positions.map((pos) => {
        const occupied = occupancyMap.get(pos.id) ?? 0;
        return {
          ...pos,
          occupiedPallets: occupied,
          availablePallets: Math.max(0, pos.maxPallets - occupied),
          isFull: occupied >= pos.maxPallets,
          assignments: assignmentsMap.get(pos.id) ?? [],
        };
      });
    }),

  /** Get orders currently on the dock (active assignments) */
  listDockOrders: protectedProcedure
    .input(z.object({ facilityName: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const facility = input?.facilityName ?? "COL-Columbus";

      const rows = await db
        .select({
          assignmentId: dockAssignments.id,
          extensivOrderId: dockAssignments.extensivOrderId,
          dockPositionId: dockAssignments.dockPositionId,
          palletCount: dockAssignments.palletCount,
          assignedBy: dockAssignments.assignedBy,
          assignedAt: dockAssignments.assignedAt,
          bolNumber: dockAssignments.bolNumber,
          notes: dockAssignments.notes,
          // Position info
          lane: dockPositions.lane,
          position: dockPositions.position,
          label: dockPositions.label,
          isOverflow: dockPositions.isOverflow,
          // Order info
          referenceNum: orderTracking.referenceNum,
          clientName: orderTracking.clientName,
          shipToName: orderTracking.shipToName,
          shipToCity: orderTracking.shipToCity,
          requiredShipDate: orderTracking.requiredShipDate,
          shipwellStatus: orderTracking.shipwellStatus,
          lifecycleStatus: orderTracking.lifecycleStatus,
          shipwellShipmentUrl: orderTracking.shipwellShipmentUrl,
          facilityName: orderTracking.facilityName,
        })
        .from(dockAssignments)
        .innerJoin(dockPositions, eq(dockAssignments.dockPositionId, dockPositions.id))
        .leftJoin(orderTracking, eq(dockAssignments.extensivOrderId, orderTracking.extensivOrderId))
        .where(
          and(
            isNull(dockAssignments.clearedAt),
            eq(dockPositions.facilityName, facility)
          )
        )
        .orderBy(asc(dockPositions.lane), asc(dockPositions.position));

      return rows;
    }),

  /** Get orders on the dock that have no dock position assigned yet (ship_ready, no active assignment) */
  listUnassignedOrders: protectedProcedure
    .input(z.object({ facilityName: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const facility = input?.facilityName ?? "COL-Columbus";

      // Orders that are ship_ready or qc_complete but have no active dock assignment
      const assigned = await db
        .select({ extensivOrderId: dockAssignments.extensivOrderId })
        .from(dockAssignments)
        .where(isNull(dockAssignments.clearedAt));
      const assignedIds = assigned.map((r) => r.extensivOrderId);

      const rows = await db
        .select({
          extensivOrderId: orderTracking.extensivOrderId,
          referenceNum: orderTracking.referenceNum,
          clientName: orderTracking.clientName,
          shipToName: orderTracking.shipToName,
          shipToCity: orderTracking.shipToCity,
          requiredShipDate: orderTracking.requiredShipDate,
          palletCount: orderTracking.palletCount,
          shipwellStatus: orderTracking.shipwellStatus,
          lifecycleStatus: orderTracking.lifecycleStatus,
          outboundLocation: orderTracking.outboundLocation,
          shipReadyAt: orderTracking.shipReadyAt,
          facilityName: orderTracking.facilityName,
        })
        .from(orderTracking)
        .where(
          and(
            eq(orderTracking.facilityName, facility),
            sql`${orderTracking.lifecycleStatus} IN ('ship_ready', 'qc_complete')`
          )
        )
        .orderBy(asc(orderTracking.requiredShipDate));

      // Filter out already-assigned orders in JS (avoids complex NOT IN with large sets)
      const assignedSet = new Set(assignedIds);
      return rows.filter((r) => !assignedSet.has(r.extensivOrderId));
    }),

  /** Recommend the best available dock position for a given pallet count */
  recommendPosition: protectedProcedure
    .input(z.object({
      palletCount: z.number().int().min(1),
      facilityName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const facility = input.facilityName ?? "COL-Columbus";

      // Get all non-overflow positions ordered by lane ASC, position ASC
      const positions = await db
        .select()
        .from(dockPositions)
        .where(
          and(
            eq(dockPositions.facilityName, facility),
            eq(dockPositions.isActive, true),
            eq(dockPositions.isOverflow, false)
          )
        )
        .orderBy(asc(dockPositions.lane), asc(dockPositions.position));

      // Get current occupancy
      const occupancyRows = await db
        .select({
          dockPositionId: dockAssignments.dockPositionId,
          total: sql<number>`COALESCE(SUM(pallet_count), 0)`,
        })
        .from(dockAssignments)
        .where(isNull(dockAssignments.clearedAt))
        .groupBy(dockAssignments.dockPositionId);
      const occupancyMap = new Map(occupancyRows.map((r) => [r.dockPositionId, Number(r.total)]));

      // Find the lowest-numbered position with enough space
      const candidate = positions.find((pos) => {
        const occupied = occupancyMap.get(pos.id) ?? 0;
        return (pos.maxPallets - occupied) >= input.palletCount;
      });

      if (candidate) {
        const occupied = occupancyMap.get(candidate.id) ?? 0;
        return {
          recommended: candidate,
          occupiedPallets: occupied,
          availablePallets: candidate.maxPallets - occupied,
          isOverflow: false,
        };
      }

      // No regular position available — return overflow
      const overflow = await db
        .select()
        .from(dockPositions)
        .where(
          and(
            eq(dockPositions.facilityName, facility),
            eq(dockPositions.isOverflow, true),
            eq(dockPositions.isActive, true)
          )
        )
        .limit(1);

      if (!overflow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No dock positions available" });

      return {
        recommended: overflow[0],
        occupiedPallets: 0,
        availablePallets: overflow[0].maxPallets,
        isOverflow: true,
      };
    }),

  /** Assign an order to a dock position */
  assignPosition: protectedProcedure
    .input(z.object({
      extensivOrderId: z.number().int(),
      dockPositionId: z.number().int(),
      palletCount: z.number().int().min(1),
      bolNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify position exists and has capacity
      const pos = await db
        .select()
        .from(dockPositions)
        .where(eq(dockPositions.id, input.dockPositionId))
        .limit(1);
      if (!pos[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Dock position not found" });

      if (!pos[0].isOverflow) {
        const occupied = await getOccupiedPallets(db, input.dockPositionId);
        if (occupied + input.palletCount > pos[0].maxPallets) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Not enough space: ${pos[0].maxPallets - occupied} pallets available, ${input.palletCount} requested`,
          });
        }
      }

      // Clear any existing active assignment for this order
      await db
        .update(dockAssignments)
        .set({ clearedAt: new Date() })
        .where(
          and(
            eq(dockAssignments.extensivOrderId, input.extensivOrderId),
            isNull(dockAssignments.clearedAt)
          )
        );

      // Create new assignment
      await db.insert(dockAssignments).values({
        extensivOrderId: input.extensivOrderId,
        dockPositionId: input.dockPositionId,
        palletCount: input.palletCount,
        assignedBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
        bolNumber: input.bolNumber,
        notes: input.notes,
      });

      // Update outboundLocation on orderTracking
      await db
        .update(orderTracking)
        .set({ outboundLocation: pos[0].label })
        .where(eq(orderTracking.extensivOrderId, input.extensivOrderId));

      return { success: true, label: pos[0].label };
    }),

  /** Clear (remove) an order from its dock position (e.g. after carrier pickup) */
  clearPosition: protectedProcedure
    .input(z.object({
      assignmentId: z.number().int(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .update(dockAssignments)
        .set({ clearedAt: new Date() })
        .where(eq(dockAssignments.id, input.assignmentId));

      return { success: true };
    }),

  /** Move an order from one dock position to another */
  movePosition: protectedProcedure
    .input(z.object({
      extensivOrderId: z.number().int(),
      newDockPositionId: z.number().int(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get current assignment
      const current = await db
        .select({ palletCount: dockAssignments.palletCount, bolNumber: dockAssignments.bolNumber, notes: dockAssignments.notes })
        .from(dockAssignments)
        .where(and(eq(dockAssignments.extensivOrderId, input.extensivOrderId), isNull(dockAssignments.clearedAt)))
        .limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No active assignment found for this order" });

      // Verify new position has capacity
      const pos = await db.select().from(dockPositions).where(eq(dockPositions.id, input.newDockPositionId)).limit(1);
      if (!pos[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Target dock position not found" });

      if (!pos[0].isOverflow) {
        const occupied = await getOccupiedPallets(db, input.newDockPositionId);
        if (occupied + current[0].palletCount > pos[0].maxPallets) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Not enough space at ${pos[0].label}: ${pos[0].maxPallets - occupied} pallets available`,
          });
        }
      }

      // Clear old assignment and create new one
      await db
        .update(dockAssignments)
        .set({ clearedAt: new Date() })
        .where(and(eq(dockAssignments.extensivOrderId, input.extensivOrderId), isNull(dockAssignments.clearedAt)));

      await db.insert(dockAssignments).values({
        extensivOrderId: input.extensivOrderId,
        dockPositionId: input.newDockPositionId,
        palletCount: current[0].palletCount,
        assignedBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
        bolNumber: current[0].bolNumber ?? undefined,
        notes: current[0].notes ?? undefined,
      });

      await db
        .update(orderTracking)
        .set({ outboundLocation: pos[0].label })
        .where(eq(orderTracking.extensivOrderId, input.extensivOrderId));

      return { success: true, newLabel: pos[0].label };
    }),
});
