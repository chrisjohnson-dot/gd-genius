/**
 * QR Scanning DB helpers
 * Tables: customer_app_configs, qr_scan_sessions, qr_scans
 */

import { getDb } from "./db";
import {
  customerAppConfigs,
  qrScanSessions,
  qrScans,
  type CustomerAppConfig,
  type InsertCustomerAppConfig,
  type QrScanSession,
  type InsertQrScanSession,
  type QrScan,
  type InsertQrScan,
} from "../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

// ─── Customer App Configs ─────────────────────────────────────────────────────

export async function listCustomerAppConfigs(): Promise<CustomerAppConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerAppConfigs).orderBy(customerAppConfigs.customerName);
}

export async function getCustomerAppConfig(customerId: string): Promise<CustomerAppConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(customerAppConfigs)
    .where(eq(customerAppConfigs.customerId, customerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertCustomerAppConfig(
  data: InsertCustomerAppConfig
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(customerAppConfigs)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        customerName: data.customerName,
        appUrl: data.appUrl,
        authHeader: data.authHeader ?? null,
        enabled: data.enabled ?? true,
        notes: data.notes ?? null,
      },
    });
}

export async function deleteCustomerAppConfig(customerId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(customerAppConfigs).where(eq(customerAppConfigs.customerId, customerId));
}

// ─── QR Scan Sessions ─────────────────────────────────────────────────────────

export async function createQrScanSession(data: InsertQrScanSession): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(qrScanSessions).values(data);
}

export async function getActiveQrScanSession(runId: string): Promise<QrScanSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(qrScanSessions)
    .where(and(eq(qrScanSessions.runId, runId), eq(qrScanSessions.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function getQrScanSession(sessionId: string): Promise<QrScanSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(qrScanSessions)
    .where(eq(qrScanSessions.sessionId, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listQrScanSessions(runId?: string): Promise<QrScanSession[]> {
  const db = await getDb();
  if (!db) return [];
  if (runId) {
    return db
      .select()
      .from(qrScanSessions)
      .where(eq(qrScanSessions.runId, runId))
      .orderBy(desc(qrScanSessions.startedAt));
  }
  return db.select().from(qrScanSessions).orderBy(desc(qrScanSessions.startedAt)).limit(50);
}

export async function updateQrScanSession(
  sessionId: string,
  data: Partial<QrScanSession>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(qrScanSessions)
    .set(data as any)
    .where(eq(qrScanSessions.sessionId, sessionId));
}

// ─── QR Scans ─────────────────────────────────────────────────────────────────

export async function createQrScan(data: InsertQrScan): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(qrScans).values(data);
}

export async function listQrScans(sessionId: string, limit = 50): Promise<QrScan[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(qrScans)
    .where(eq(qrScans.sessionId, sessionId))
    .orderBy(desc(qrScans.scannedAt))
    .limit(limit);
}

export async function getQrScan(qrScanId: string): Promise<QrScan | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(qrScans)
    .where(eq(qrScans.qrScanId, qrScanId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateQrScan(
  qrScanId: string,
  data: Partial<QrScan>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(qrScans)
    .set(data as any)
    .where(eq(qrScans.qrScanId, qrScanId));
}

/** Full paginated session history with optional filters */
export async function listQrScanSessionHistory(opts: {
  customerId?: string;
  status?: "active" | "paused" | "closed";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<QrScanSession[]> {
  const db = await getDb();
  if (!db) return [];
  const { customerId, status, dateFrom, dateTo, limit = 50, offset = 0 } = opts;
  const conditions: ReturnType<typeof eq>[] = [];
  if (customerId) conditions.push(eq(qrScanSessions.customerId, customerId));
  if (status) conditions.push(eq(qrScanSessions.status, status));
  if (dateFrom) conditions.push(gte(qrScanSessions.startedAt, new Date(dateFrom)));
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(qrScanSessions.startedAt, end));
  }
  const base = db
    .select()
    .from(qrScanSessions)
    .orderBy(desc(qrScanSessions.startedAt))
    .limit(limit)
    .offset(offset);
  if (conditions.length === 0) return base;
  if (conditions.length === 1) return base.where(conditions[0]);
  return base.where(and(...conditions));
}

/** Get pending (not yet forwarded) QR scans for a session */
export async function getPendingQrScans(sessionId: string): Promise<QrScan[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(qrScans)
    .where(and(eq(qrScans.sessionId, sessionId), eq(qrScans.forwarded, false)))
    .orderBy(qrScans.scannedAt)
    .limit(100);
}
