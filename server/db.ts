import { eq, desc, and, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  extensivConfigs,
  InsertExtensivConfig,
  ExtensivConfig,
  locationConfigs,
  InsertLocationConfig,
  LocationConfig,
  allocationRuns,
  InsertAllocationRun,
  AllocationRun,
  allocationRunOrders,
  InsertAllocationRunOrder,
  AllocationRunOrder,
  auditLogs,
  InsertAuditLog,
  customerRules,
  InsertCustomerRule,
  CustomerRule,
  scheduleConfigs,
  InsertScheduleConfig,
  ScheduleConfig,
  orderTracking,
  OrderTracking,
  InsertOrderTracking,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Extensiv Configs ────────────────────────────────────────────────────────

export async function getExtensivConfigs(): Promise<ExtensivConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(extensivConfigs).orderBy(extensivConfigs.name);
}

export async function getExtensivConfigById(id: number): Promise<ExtensivConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(extensivConfigs).where(eq(extensivConfigs.id, id)).limit(1);
  return result[0];
}

export async function upsertExtensivConfig(config: InsertExtensivConfig & { id?: number }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (config.id) {
    await db.update(extensivConfigs).set(config).where(eq(extensivConfigs.id, config.id));
    return config.id;
  }
  const result = await db.insert(extensivConfigs).values(config);
  return (result as unknown as { insertId: number }).insertId;
}

export async function deleteExtensivConfig(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(extensivConfigs).where(eq(extensivConfigs.id, id));
}

// ─── Location Configs ────────────────────────────────────────────────────────

export async function getLocationConfigs(configId: number): Promise<LocationConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locationConfigs).where(eq(locationConfigs.configId, configId));
}

export async function getLocationConfigsByCustomer(
  configId: number,
  customerId: number
): Promise<LocationConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(locationConfigs)
    .where(and(eq(locationConfigs.configId, configId), eq(locationConfigs.customerId, customerId)));
}

export async function upsertLocationConfig(config: InsertLocationConfig & { id?: number }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (config.id) {
    await db.update(locationConfigs).set(config).where(eq(locationConfigs.id, config.id));
  } else {
    await db.insert(locationConfigs).values(config);
  }
}

export async function deleteLocationConfig(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(locationConfigs).where(eq(locationConfigs.id, id));
}

export async function deleteLocationConfigsByConfigAndCustomer(
  configId: number,
  customerId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(locationConfigs)
    .where(and(eq(locationConfigs.configId, configId), eq(locationConfigs.customerId, customerId)));
}

// ─── Allocation Runs ─────────────────────────────────────────────────────────

export async function createAllocationRun(run: InsertAllocationRun): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(allocationRuns).values(run);
  // Drizzle MySQL2 returns [ResultSetHeader, ...] — insertId is on the first element
  const raw = result as unknown;
  let insertId: number | undefined;
  if (Array.isArray(raw) && raw[0] && typeof (raw[0] as Record<string,unknown>).insertId === "number") {
    insertId = (raw[0] as Record<string,unknown>).insertId as number;
  } else if (raw && typeof (raw as Record<string,unknown>).insertId === "number") {
    insertId = (raw as Record<string,unknown>).insertId as number;
  }
  console.log(`[createAllocationRun] insertId=${insertId} raw type=${Array.isArray(raw)?"array":typeof raw}`);
  if (!insertId) throw new Error(`createAllocationRun: could not get insertId from result: ${JSON.stringify(raw)}`);
  return insertId;
}

export async function updateAllocationRun(
  id: number,
  updates: Partial<AllocationRun>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(allocationRuns).set(updates).where(eq(allocationRuns.id, id));
}

export async function getAllocationRuns(limit = 50, sinceDate?: Date): Promise<AllocationRun[]> {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(allocationRuns);
  if (sinceDate) {
    return query.where(gte(allocationRuns.createdAt, sinceDate)).orderBy(desc(allocationRuns.createdAt)).limit(limit);
  }
  return query.orderBy(desc(allocationRuns.createdAt)).limit(limit);
}

export async function getAllocationRunById(id: number): Promise<AllocationRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(allocationRuns).where(eq(allocationRuns.id, id)).limit(1);
  return result[0];
}

export async function createAllocationRunOrders(
  items: InsertAllocationRunOrder[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (items.length === 0) return;
  // Insert in chunks of 50 to avoid MySQL packet size limits on large batches
  const CHUNK_SIZE = 50;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await db.insert(allocationRunOrders).values(chunk);
  }
}

export async function getAllocationRunOrders(runId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(allocationRunOrders).where(eq(allocationRunOrders.runId, runId));
}
export async function updateAllocationRunOrder(
  id: number,
  updates: Partial<AllocationRunOrder>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(allocationRunOrders).set(updates).where(eq(allocationRunOrders.id, id));
}
export async function getAllocationRunOrderById(id: number): Promise<AllocationRunOrder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(allocationRunOrders).where(eq(allocationRunOrders.id, id)).limit(1);
  return result[0];
}

export async function deleteAllocationRun(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete child run orders first (no cascade in MySQL by default)
  await db.delete(allocationRunOrders).where(eq(allocationRunOrders.runId, id));
  await db.delete(allocationRuns).where(eq(allocationRuns.id, id));
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export async function createAuditLog(log: InsertAuditLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(log);
}

export async function getAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ─── Customer Rules ───────────────────────────────────────────────────────────

export async function getCustomerRules(configId: number): Promise<CustomerRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerRules).where(eq(customerRules.configId, configId));
}

export async function getCustomerRule(configId: number, customerId: number): Promise<CustomerRule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(customerRules)
    .where(and(eq(customerRules.configId, configId), eq(customerRules.customerId, customerId)))
    .limit(1);
  return rows[0];
}

export async function upsertCustomerRule(
  rule: InsertCustomerRule
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(customerRules)
    .values(rule)
    .onDuplicateKeyUpdate({
      set: {
        customerName: rule.customerName,
        facilityId: rule.facilityId,
        facilityName: rule.facilityName,
        noLotMixing: rule.noLotMixing,
        autoRun: rule.autoRun,
        locationPriorityPatterns: rule.locationPriorityPatterns ?? [],
        notes: rule.notes ?? null,
        updatedAt: new Date(),
      },
    });
}

// ─── Schedule Config ─────────────────────────────────────────────────────────

export async function getScheduleConfig(configId: number): Promise<ScheduleConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(scheduleConfigs)
    .where(eq(scheduleConfigs.configId, configId))
    .limit(1);
  return rows[0];
}

export async function upsertScheduleConfig(
  cfg: InsertScheduleConfig
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(scheduleConfigs)
    .values(cfg)
    .onDuplicateKeyUpdate({
      set: {
        isEnabled: cfg.isEnabled,
        cronExpression: cfg.cronExpression,
        timezone: cfg.timezone,
        updatedAt: new Date(),
      },
    });
}

export async function updateScheduleConfigLastRun(
  configId: number,
  status: string,
  summary: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(scheduleConfigs)
    .set({ lastRunAt: new Date(), lastRunStatus: status, lastRunSummary: summary, updatedAt: new Date() })
    .where(eq(scheduleConfigs.configId, configId));
}

export async function getAutoRunCustomers(configId: number): Promise<CustomerRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(customerRules)
    .where(and(eq(customerRules.configId, configId), eq(customerRules.autoRun, true)));
}

// ─── Order Tracking (Pick Schedule) ─────────────────────────────────────────

/** Upsert a batch of orders from Extensiv into the tracking table.
 *  - New orders → inserted with lifecycleStatus = 'unallocated'
 *  - Existing orders → order details refreshed (shipTo, pieces, etc.) but
 *    lifecycleStatus is NOT overwritten (preserves manual stage advances).
 *  - Orders whose extensivOrderId is NOT in the provided set → deleted (shipped/closed).
 */
export async function upsertTrackedOrders(
  orders: Array<{
    extensivOrderId: number;
    referenceNum: string | null;
    poNum: string | null;
    configId: number;
    clientId: number;
    clientName: string;
    facilityId: number;
    facilityName: string;
    shipToName: string | null;
    shipToCity: string | null;
    totalPieces: number;
    skuCount: number;
    notes: string | null;
    extensivStatus: number;
    creationDate: string | null;
  }>,
  configId: number,
  facilityId: number
): Promise<{ inserted: number; updated: number; removed: number }> {
  const db = await getDb();
  if (!db) return { inserted: 0, updated: 0, removed: 0 };

  // Fetch existing tracked orders for this config+facility
  const existing = await db
    .select({ id: orderTracking.id, extensivOrderId: orderTracking.extensivOrderId })
    .from(orderTracking)
    .where(and(eq(orderTracking.configId, configId), eq(orderTracking.facilityId, facilityId)));

  const existingMap = new Map(existing.map((r) => [r.extensivOrderId, r.id]));
  const incomingIds = new Set(orders.map((o) => o.extensivOrderId));

  let inserted = 0;
  let updated = 0;

  for (const o of orders) {
    const now = new Date();
    if (existingMap.has(o.extensivOrderId)) {
      // Update details only — do NOT touch lifecycleStatus
      await db
        .update(orderTracking)
        .set({
          referenceNum: o.referenceNum ?? undefined,
          poNum: o.poNum ?? undefined,
          clientName: o.clientName,
          facilityName: o.facilityName,
          shipToName: o.shipToName ?? undefined,
          shipToCity: o.shipToCity ?? undefined,
          totalPieces: o.totalPieces,
          skuCount: o.skuCount,
          notes: o.notes ?? undefined,
          extensivStatus: o.extensivStatus,
          creationDate: o.creationDate ?? undefined,
          lastSyncedAt: now,
        })
        .where(eq(orderTracking.extensivOrderId, o.extensivOrderId));
      updated++;
    } else {
      // Insert new order as unallocated
      await db.insert(orderTracking).values({
        extensivOrderId: o.extensivOrderId,
        referenceNum: o.referenceNum ?? undefined,
        poNum: o.poNum ?? undefined,
        configId: o.configId,
        clientId: o.clientId,
        clientName: o.clientName,
        facilityId: o.facilityId,
        facilityName: o.facilityName,
        shipToName: o.shipToName ?? undefined,
        shipToCity: o.shipToCity ?? undefined,
        totalPieces: o.totalPieces,
        skuCount: o.skuCount,
        notes: o.notes ?? undefined,
        extensivStatus: o.extensivStatus,
        creationDate: o.creationDate ?? undefined,
        lifecycleStatus: "unallocated",
        firstSeenAt: now,
        lastSyncedAt: now,
      });
      inserted++;
    }
  }

  // Remove orders that are no longer in Extensiv (shipped/closed)
  let removed = 0;
  for (const [extId, dbId] of Array.from(existingMap.entries())) {
    if (!incomingIds.has(extId)) {
      await db.delete(orderTracking).where(eq(orderTracking.id, dbId));
      removed++;
    }
  }

  return { inserted, updated, removed };
}

/** Advance an order to the next lifecycle stage. */
export async function updateOrderLifecycleStatus(
  extensivOrderId: number,
  newStatus: OrderTracking["lifecycleStatus"]
): Promise<OrderTracking | null> {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const timestampField: Partial<Record<string, Date>> = {};
  if (newStatus === "allocated")   timestampField.allocatedAt = now;
  if (newStatus === "picking")     timestampField.pickingAt = now;
  if (newStatus === "qc")          timestampField.qcAt = now;
  if (newStatus === "qc_complete") timestampField.qcCompleteAt = now;
  if (newStatus === "ship_ready")  timestampField.shipReadyAt = now;

  await db
    .update(orderTracking)
    .set({ lifecycleStatus: newStatus, ...timestampField, lastSyncedAt: now })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));

  const rows = await db
    .select()
    .from(orderTracking)
    .where(eq(orderTracking.extensivOrderId, extensivOrderId))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all tracked orders, optionally filtered by facilityId. */
export async function getTrackedOrders(facilityId?: number): Promise<OrderTracking[]> {
  const db = await getDb();
  if (!db) return [];
  if (facilityId) {
    return db
      .select()
      .from(orderTracking)
      .where(eq(orderTracking.facilityId, facilityId))
      .orderBy(orderTracking.firstSeenAt);
  }
  return db.select().from(orderTracking).orderBy(orderTracking.firstSeenAt);
}

/** Get the most recent lastSyncedAt across all tracked orders (for "last synced" display). */
export async function getLastSyncTime(): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ lastSyncedAt: orderTracking.lastSyncedAt })
    .from(orderTracking)
    .orderBy(desc(orderTracking.lastSyncedAt))
    .limit(1);
  return rows[0]?.lastSyncedAt ?? null;
}
