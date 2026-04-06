/**
 * sla.db.ts — DB helpers for the SLA performance feature.
 *
 * Handles writing snapshots, querying breaches, watch items, and summary stats.
 */
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { getDb } from "./db.js";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { slaSnapshots, type InsertSlaSnapshot } from "../drizzle/schema.js";
import type { SlaResult } from "./slaEngine.js";

// ── Write snapshot ────────────────────────────────────────────────────────────

export async function writeSlaSnapshot(results: SlaResult[], snapshotDate: string): Promise<number> {
  if (results.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;

  // Delete existing snapshot for this date to allow re-runs
  await db.delete(slaSnapshots).where(eq(slaSnapshots.snapshotDate, snapshotDate));

  const rows: InsertSlaSnapshot[] = results.map((r) => ({
    snapshotDate,
    orderId: r.orderId,
    clientId: r.clientId,
    clientName: r.clientName,
    poNum: r.poNum,
    refNum: r.refNum,
    creation: r.creation,
    company: r.company,
    notes: r.notes,
    facility: r.facility,
    fullyAllocated: r.fullyAllocated,
    rule: r.rule,
    slaDate: r.slaDate ?? undefined,
    outOfSla: r.outOfSla,
    alwaysFlag: r.alwaysFlag,
    flagNote: r.flagNote ?? undefined,
    bizDaysLate: r.bizDaysLate ?? undefined,
  }));

  // Insert in batches of 500
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(slaSnapshots).values(rows.slice(i, i + BATCH));
  }

  return rows.length;
}

// ── Summary stats ─────────────────────────────────────────────────────────────

export async function getSlaSummary(snapshotDate: string) {
  const db = await getDb();
  if (!db) return { snapshotDate, total: 0, inSla: 0, outOfSla: 0, alwaysFlag: 0, fullyAllocated: 0, compliancePct: 100 };
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      outOfSla: sql<number>`SUM(CASE WHEN out_of_sla = 1 THEN 1 ELSE 0 END)`,
      alwaysFlag: sql<number>`SUM(CASE WHEN always_flag = 1 THEN 1 ELSE 0 END)`,
      fullyAllocated: sql<number>`SUM(CASE WHEN fully_allocated = 1 THEN 1 ELSE 0 END)`,
    })
    .from(slaSnapshots)
    .where(eq(slaSnapshots.snapshotDate, snapshotDate));

  const r = rows[0] ?? { total: 0, outOfSla: 0, alwaysFlag: 0, fullyAllocated: 0 };
  const total = Number(r.total) || 0;
  const oos = Number(r.outOfSla) || 0;
  const inSla = total - oos;
  const compliancePct = total > 0 ? Math.round((inSla / total) * 1000) / 10 : 100;

  return {
    snapshotDate,
    total,
    inSla,
    outOfSla: oos,
    alwaysFlag: Number(r.alwaysFlag) || 0,
    fullyAllocated: Number(r.fullyAllocated) || 0,
    compliancePct,
  };
}

// ── Breach list ───────────────────────────────────────────────────────────────

export async function listSlaBreaches(snapshotDate: string, clientId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(slaSnapshots.snapshotDate, snapshotDate),
    eq(slaSnapshots.outOfSla, true),
  ];
  if (clientId) conditions.push(eq(slaSnapshots.clientId, clientId));

  return db
    .select()
    .from(slaSnapshots)
    .where(and(...conditions))
    .orderBy(desc(slaSnapshots.bizDaysLate));
}

// ── Watch list ────────────────────────────────────────────────────────────────

export async function listSlaWatch(snapshotDate: string, clientId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(slaSnapshots.snapshotDate, snapshotDate),
    eq(slaSnapshots.alwaysFlag, true),
    eq(slaSnapshots.outOfSla, false), // exclude already-breached (shown in breach table)
  ];
  if (clientId) conditions.push(eq(slaSnapshots.clientId, clientId));

  return db
    .select()
    .from(slaSnapshots)
    .where(and(...conditions))
    .orderBy(slaSnapshots.slaDate);
}

// ── Available snapshot dates ──────────────────────────────────────────────────

export async function listSnapshotDates(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ snapshotDate: slaSnapshots.snapshotDate })
    .from(slaSnapshots)
    .orderBy(desc(slaSnapshots.snapshotDate))
    .limit(limit);
  return rows.map((r: { snapshotDate: string }) => r.snapshotDate);
}

// ── Per-client breach history ─────────────────────────────────────────────────

export async function getSlaClientHistory(clientId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  const dates = await listSnapshotDates(limit);
  if (dates.length === 0) return [];

  const rows = await db
    .select({
      snapshotDate: slaSnapshots.snapshotDate,
      total: sql<number>`COUNT(*)`,
      outOfSla: sql<number>`SUM(CASE WHEN out_of_sla = 1 THEN 1 ELSE 0 END)`,
    })
    .from(slaSnapshots)
    .where(
      and(
        eq(slaSnapshots.clientId, clientId),
        inArray(slaSnapshots.snapshotDate, dates)
      )
    )
    .groupBy(slaSnapshots.snapshotDate)
    .orderBy(desc(slaSnapshots.snapshotDate));

  return rows.map((r: { snapshotDate: string; total: number; outOfSla: number }) => ({
    snapshotDate: r.snapshotDate,
    total: Number(r.total),
    outOfSla: Number(r.outOfSla),
    compliancePct: Number(r.total) > 0 ? Math.round(((Number(r.total) - Number(r.outOfSla)) / Number(r.total)) * 1000) / 10 : 100,
  }));
}

// ── All orders for a snapshot ─────────────────────────────────────────────────

export async function listAllSlaOrders(snapshotDate: string, clientId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(slaSnapshots.snapshotDate, snapshotDate)];
  if (clientId) conditions.push(eq(slaSnapshots.clientId, clientId));

  return db
    .select()
    .from(slaSnapshots)
    .where(and(...conditions))
    .orderBy(slaSnapshots.clientName, slaSnapshots.slaDate);
}
