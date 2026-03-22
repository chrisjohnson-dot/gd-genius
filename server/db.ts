import { eq, desc, and, gte, isNotNull, isNull, sql } from "drizzle-orm";
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
  shipwellConfigs,
  ShipwellConfig,
  InsertShipwellConfig,
  slaRequirements,
  SlaRequirement,
  InsertSlaRequirement,
  laneThresholds,
  LaneThreshold,
  InsertLaneThreshold,
  alertSettings,
  clientVisibility,
  ClientVisibility,
  InsertClientVisibility,
  slaRules,
  SlaRule,
  InsertSlaRule,
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

export async function getAuditLogs(
  limit = 100,
  action?: string,
  userId?: number,
) {
  const db = await getDb();
  if (!db) return [];

  // Build WHERE conditions
  const conditions = [];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (userId) conditions.push(eq(auditLogs.userId, userId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/** Return the distinct action values present in audit_logs for the filter dropdown. */
export async function getDistinctAuditActions(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(auditLogs.action);
  return rows.map((r) => r.action);
}

/** Return users who have at least one audit log entry, for the user filter dropdown. */
export async function getAuditLogUsers(): Promise<Array<{ id: number; name: string | null; email: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(auditLogs)
    .innerJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(users.name);
  return rows;
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
    savedElements: string | null;  // JSON string of [{name,value}] from Extensiv
    extensivStatus: number;
    creationDate: string | null;
    requiredShipDate?: string | null;
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
          savedElements: o.savedElements ?? undefined,
          extensivStatus: o.extensivStatus,
          creationDate: o.creationDate ?? undefined,
          requiredShipDate: o.requiredShipDate ?? undefined,
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
        savedElements: o.savedElements ?? undefined,
        extensivStatus: o.extensivStatus,
        creationDate: o.creationDate ?? undefined,
        requiredShipDate: o.requiredShipDate ?? undefined,
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
  newStatus: OrderTracking["lifecycleStatus"],
  assignedAssociate?: string | null
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

  const updatePayload: Record<string, unknown> = {
    lifecycleStatus: newStatus,
    ...timestampField,
    lastSyncedAt: now,
  };
  // Only set assignedAssociate when transitioning to picking (or if explicitly provided)
  if (newStatus === "picking" && assignedAssociate !== undefined) {
    updatePayload.assignedAssociate = assignedAssociate ?? null;
  }

  await db
    .update(orderTracking)
    .set(updatePayload)
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

// ─── Shipwell Config Helpers ──────────────────────────────────────────────────

/** Get the active Shipwell config (there should only be one). */
export async function getShipwellConfig(): Promise<ShipwellConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(shipwellConfigs)
    .where(eq(shipwellConfigs.isActive, true))
    .limit(1);
  return rows[0] ?? null;
}

/** Upsert the Shipwell config (replace if one exists, insert if none). */
export async function upsertShipwellConfig(
  data: Omit<InsertShipwellConfig, "id" | "createdAt" | "updatedAt" | "cachedToken" | "tokenExpiresAt">
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete all existing configs then insert fresh (single-config model)
  await db.delete(shipwellConfigs);
  await db.insert(shipwellConfigs).values({
    ...data,
    cachedToken: null,
    tokenExpiresAt: null,
  });
}

/** Update the cached auth token on the active Shipwell config. */
export async function updateShipwellToken(token: string, expiresAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(shipwellConfigs)
    .set({ cachedToken: token, tokenExpiresAt: expiresAt })
    .where(eq(shipwellConfigs.isActive, true));
}

/** Mark an order as sent to Shipwell — store the PO ID, URL, and optional Shipment ID. */
export async function markOrderSentToShipwell(
  extensivOrderId: number,
  shipwellOrderId: string,
  shipwellPoUrl: string,
  shipwellShipmentId?: string,
  shipwellShipmentUrl?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orderTracking)
    .set({
      shipwellOrderId,
      shipwellPoUrl,
      shipwellSentAt: new Date(),
      ...(shipwellShipmentId ? { shipwellShipmentId } : {}),
      ...(shipwellShipmentUrl ? { shipwellShipmentUrl } : {}),
    })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

/** Update the live Shipwell status on an order row. */
export async function updateShipwellStatus(
  extensivOrderId: number,
  shipwellStatus: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orderTracking)
    .set({ shipwellStatus, shipwellStatusUpdatedAt: new Date() })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

/** Update the carrier bid count for a quoting order. */
export async function updateShipwellBidCount(
  extensivOrderId: number,
  bidCount: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orderTracking)
    .set({ shipwellBidCount: bidCount })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

/** Get all tracked orders that have a Shipwell Shipment ID (i.e., sent to Shipwell). */
export async function getOrdersWithShipwellShipment(): Promise<OrderTracking[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(orderTracking)
    .where(isNotNull(orderTracking.shipwellShipmentId));
}

/** Set shipwellQuotingStartedAt to now if not already set (first time order enters Quoting). */
export async function setShipwellQuotingStartedAt(
  extensivOrderId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Only set if not already set — we don't want to reset the clock on re-polls
  await db
    .update(orderTracking)
    .set({ shipwellQuotingStartedAt: new Date() })
    .where(
      and(
        eq(orderTracking.extensivOrderId, extensivOrderId),
        isNull(orderTracking.shipwellQuotingStartedAt)
      )
    );
}

/** Record when the zero-bid alert was sent to prevent duplicate notifications. */
export async function markZeroBidNotified(
  extensivOrderId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orderTracking)
    .set({ shipwellZeroBidNotifiedAt: new Date() })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

/**
 * Dismiss the zero-bid warning for an order by clearing shipwellZeroBidNotifiedAt.
 * This resets the notification clock so the alert can re-fire after the next
 * threshold period if the order still has no bids.
 */
export async function dismissZeroBidWarning(extensivOrderId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orderTracking)
    .set({ shipwellZeroBidNotifiedAt: null })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

/** Delete an order from tracking (used when Shipwell marks it Delivered). */
export async function removeTrackedOrder(extensivOrderId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(orderTracking)
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

// ─── SLA Requirements ────────────────────────────────────────────────────────

/** Return all SLA requirement overrides, ordered by clientName. */
export async function getSlaRequirements(): Promise<SlaRequirement[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(slaRequirements)
    .orderBy(slaRequirements.clientName);
}

/** Return the SLA requirement for a specific client (or null if not set). */
export async function getSlaRequirementByClient(
  clientId: number
): Promise<SlaRequirement | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(slaRequirements)
    .where(eq(slaRequirements.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

/** Upsert an SLA requirement for a client (insert or update by clientId). */
export async function upsertSlaRequirement(
  data: Omit<InsertSlaRequirement, "id" | "createdAt" | "updatedAt">
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getSlaRequirementByClient(data.clientId);
  if (existing) {
    await db
      .update(slaRequirements)
      .set({ slaDays: data.slaDays, clientName: data.clientName, notes: data.notes ?? null })
      .where(eq(slaRequirements.clientId, data.clientId));
  } else {
    await db.insert(slaRequirements).values(data);
  }
}

/** Delete an SLA requirement override for a client (reverts to default 2 days). */
export async function deleteSlaRequirement(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(slaRequirements).where(eq(slaRequirements.id, id));
}

/**
 * Compute SLA status for all currently tracked orders.
 * Returns each order annotated with:
 *   - slaDays: the applicable SLA threshold for this client
 *   - ageCalendarDays: calendar days since creationDate (day 1 = day after create date)
 *   - slaStatus: "in_sla" | "out_of_sla"
 *   - daysRemaining: positive = days left, negative = days overdue
 */
export async function getOrderSlaStatuses(): Promise<
  Array<
    OrderTracking & {
      slaDays: number;
      ageCalendarDays: number;
      slaStatus: "in_sla" | "out_of_sla";
      daysRemaining: number;
      matchedRuleName: string | null;
    }
  >
> {
  const db = await getDb();
  if (!db) return [];

  const [orders, requirements, allRules] = await Promise.all([
    db.select().from(orderTracking),
    db.select().from(slaRequirements),
    db.select().from(slaRules),
  ]);

  // Build a map of clientId → base slaDays for fast lookup
  const slaMap = new Map<number, number>();
  for (const req of requirements) {
    slaMap.set(req.clientId, req.slaDays);
  }

  // Build a map of clientId → sub-rules array for matching savedElements
  const rulesMap = new Map<number, Array<{ ruleName: string; slaDays: number }>>();
  for (const rule of allRules) {
    if (!rulesMap.has(rule.clientId)) rulesMap.set(rule.clientId, []);
    rulesMap.get(rule.clientId)!.push({ ruleName: rule.ruleName, slaDays: rule.slaDays });
  }

  const DEFAULT_SLA_DAYS = 2;
  const now = Date.now();

  return orders.map((order) => {
    let slaDays = slaMap.get(order.clientId) ?? DEFAULT_SLA_DAYS;
    let matchedRuleName: string | null = null;

    // Try to match savedElements values against client sub-rules
    const clientRules = rulesMap.get(order.clientId);
    if (clientRules && clientRules.length > 0 && order.savedElements) {
      try {
        const elements = JSON.parse(order.savedElements) as Array<{ name: string; value: string }>;
        for (const el of elements) {
          // Match by value (case-insensitive) against any rule name for this client
          const matched = clientRules.find(
            (r) => r.ruleName.toLowerCase() === el.value.toLowerCase()
          );
          if (matched) {
            slaDays = matched.slaDays;
            matchedRuleName = matched.ruleName;
            break;
          }
        }
      } catch {
        // Malformed JSON — ignore and fall back to base SLA
      }
    }

    // Age in calendar days: day 1 starts the day AFTER the create date
    let ageCalendarDays = 0;
    if (order.creationDate) {
      const createMs = new Date(order.creationDate).getTime();
      // Subtract one day because "day 1" is the day after creation
      ageCalendarDays = Math.max(
        0,
        Math.floor((now - createMs) / 86_400_000) - 1
      );
    }

    const daysRemaining = slaDays - ageCalendarDays;
    const slaStatus: "in_sla" | "out_of_sla" =
      daysRemaining >= 0 ? "in_sla" : "out_of_sla";

    return { ...order, slaDays, ageCalendarDays, slaStatus, daysRemaining, matchedRuleName };
  });
}

/**
 * Returns every known client (from order_tracking) merged with their SLA requirement.
 * Clients without an override get slaDays=2 (the system default) and isDefault=true.
 * Sorted alphabetically by clientName.
 */
export async function getAllClientsWithSlaRequirements(): Promise<
  Array<{
    clientId: number;
    clientName: string;
    slaDays: number;
    isDefault: boolean;
    requirementId: number | null;
    notes: string | null;
    updatedAt: Date | null;
  }>
> {
  const db = await getDb();
  if (!db) return [];

  const DEFAULT_SLA_DAYS = 2;

  const [clients, requirements] = await Promise.all([
    db
      .selectDistinct({ clientId: orderTracking.clientId, clientName: orderTracking.clientName })
      .from(orderTracking)
      .orderBy(orderTracking.clientName),
    db.select().from(slaRequirements),
  ]);

  const reqMap = new Map<number, SlaRequirement>();
  for (const r of requirements) reqMap.set(r.clientId, r);

  return clients.map((c) => {
    const req = reqMap.get(c.clientId);
    return {
      clientId: c.clientId,
      clientName: c.clientName,
      slaDays: req?.slaDays ?? DEFAULT_SLA_DAYS,
      isDefault: !req,
      requirementId: req?.id ?? null,
      notes: req?.notes ?? null,
      updatedAt: req ? new Date(req.updatedAt) : null,
    };
  });
}

/**
 * Returns a per-client summary of orders that are currently out of SLA,
 * sorted by worst breach first (most overdue days descending).
 * Each entry includes:
 *   - clientId, clientName, facilityName
 *   - breachCount: number of out-of-SLA orders
 *   - worstDaysOverdue: the highest overdue day count among their breached orders
 *   - orders: the individual breached orders (for drill-down)
 */
export async function getClientSlaBreachSummary(): Promise<
  Array<{
    clientId: number;
    clientName: string;
    facilityId: number | null;
    facilityName: string | null;
    breachCount: number;
    worstDaysOverdue: number;
    orders: Array<{
      extensivOrderId: number;
      referenceNum: string | null;
      facilityName: string | null;
      lifecycleStatus: string;
      requiredShipDate: string | null;
      daysOverdue: number;
    }>;
  }>
> {
  const all = await getOrderSlaStatuses();
  const breached = all.filter((o) => o.slaStatus === "out_of_sla");

  // Group by clientId
  const map = new Map<
    number,
    {
      clientId: number;
      clientName: string;
      facilityId: number | null;
      facilityName: string | null;
      orders: typeof breached;
    }
  >();

  for (const o of breached) {
    if (!map.has(o.clientId)) {
      map.set(o.clientId, {
        clientId: o.clientId,
        clientName: o.clientName,
        facilityId: o.facilityId ?? null,
        facilityName: o.facilityName ?? null,
        orders: [],
      });
    }
    map.get(o.clientId)!.orders.push(o);
  }

  return Array.from(map.values())
    .map((g) => ({
      clientId: g.clientId,
      clientName: g.clientName,
      facilityId: g.facilityId,
      facilityName: g.facilityName,
      breachCount: g.orders.length,
      worstDaysOverdue: Math.max(...g.orders.map((o) => Math.abs(o.daysRemaining))),
      orders: g.orders
        .sort((a, b) => a.daysRemaining - b.daysRemaining) // most overdue first
        .map((o) => ({
          extensivOrderId: o.extensivOrderId,
          referenceNum: o.referenceNum ?? null,
          facilityName: o.facilityName ?? null,
          lifecycleStatus: o.lifecycleStatus,
          requiredShipDate: o.requiredShipDate ?? null,
          daysOverdue: Math.abs(o.daysRemaining),
        })),
    }))
    .sort((a, b) => b.worstDaysOverdue - a.worstDaysOverdue);
}

// ─── Lane Threshold helpers ───────────────────────────────────────────────────

export async function getLaneThresholds(): Promise<LaneThreshold[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(laneThresholds).orderBy(laneThresholds.laneName);
}

export async function getLaneThresholdById(id: number): Promise<LaneThreshold | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(laneThresholds).where(eq(laneThresholds.id, id));
  return rows[0] ?? null;
}

export async function createLaneThreshold(data: Omit<InsertLaneThreshold, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(laneThresholds).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

export async function updateLaneThreshold(
  id: number,
  data: Partial<Omit<InsertLaneThreshold, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(laneThresholds).set(data).where(eq(laneThresholds.id, id));
}

export async function deleteLaneThreshold(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(laneThresholds).where(eq(laneThresholds.id, id));
}

/**
 * Resolve the zero-bid threshold hours for a given facility code.
 * Matches the most specific active threshold:
 *   1. facilityCode match (exact)
 *   2. facilityCode is null (global fallback)
 * Returns DEFAULT_ZERO_BID_HOURS (2) if no threshold is configured.
 */
export const DEFAULT_ZERO_BID_HOURS = 2;

export async function resolveZeroBidThreshold(facilityCode: string | null): Promise<number> {
  const db = await getDb();
  if (!db) return DEFAULT_ZERO_BID_HOURS;
  const rows = await db
    .select()
    .from(laneThresholds)
    .where(eq(laneThresholds.isActive, true));

  // Prefer facility-specific match
  if (facilityCode) {
    const specific = rows.find((r: LaneThreshold) => r.facilityCode === facilityCode);
    if (specific) return specific.thresholdHours;
  }
  // Fall back to global (null facilityCode)
  const global = rows.find((r: LaneThreshold) => !r.facilityCode);
  return global?.thresholdHours ?? DEFAULT_ZERO_BID_HOURS;
}

// ─── Overdue order alert ──────────────────────────────────────────────────────

/**
 * Returns all unallocated orders whose requiredShipDate is before today (UTC).
 * Used by the morning alert scheduler.
 */
export async function getOverdueUnallocatedOrders(): Promise<OrderTracking[]> {
  const db = await getDb();
  if (!db) return [];

  // Fetch all unallocated orders that have a requiredShipDate set
  const rows = await db
    .select()
    .from(orderTracking)
    .where(
      and(
        eq(orderTracking.lifecycleStatus, "unallocated"),
        isNotNull(orderTracking.requiredShipDate)
      )
    )
    .orderBy(orderTracking.requiredShipDate);

  // Filter in JS: requiredShipDate is stored as an ISO date string (YYYY-MM-DD or full ISO)
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  return rows.filter((o) => {
    const d = o.requiredShipDate?.slice(0, 10);
    return d !== undefined && d < todayStr;
  });
}

/**
 * Returns the total "needs attention" count for the sidebar badge:
 *   - Unallocated orders whose requiredShipDate is before today (overdue)
 *   - Orders in Shipwell Quoting status with zero bids for longer than their
 *     configured threshold (zero-bid orders)
 *
 * Returns { overdueCount, zeroBidCount, total }.
 */
export async function getAttentionCount(): Promise<{
  overdueCount: number;
  zeroBidCount: number;
  total: number;
}> {
  const db = await getDb();
  if (!db) return { overdueCount: 0, zeroBidCount: 0, total: 0 };

  // ── Overdue unallocated orders ────────────────────────────────────────────
  const overdueRows = await getOverdueUnallocatedOrders();
  const overdueCount = overdueRows.length;

  // ── Zero-bid orders ───────────────────────────────────────────────────────
  // Fetch all orders currently in Shipwell Quoting with zero bids and a
  // quotingStartedAt timestamp, then check against the DEFAULT threshold.
  // (We use the default here for a fast single query; per-lane precision is
  //  only needed for the per-row badge in the table.)
  const quotingRows = await db
    .select()
    .from(orderTracking)
    .where(
      and(
        eq(orderTracking.shipwellStatus, "quoting"),
        isNotNull(orderTracking.shipwellQuotingStartedAt)
      )
    );

  const defaultThresholdMs = DEFAULT_ZERO_BID_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const zeroBidCount = quotingRows.filter((o) => {
    const bids = o.shipwellBidCount ?? 0;
    if (bids > 0) return false;
    const startedAt = o.shipwellQuotingStartedAt;
    if (!startedAt) return false;
    return now - new Date(startedAt).getTime() >= defaultThresholdMs;
  }).length;

  return { overdueCount, zeroBidCount, total: overdueCount + zeroBidCount };
}

/**
 * Stamp the lastOverdueAlertSentAt timestamp on a set of orders to suppress
 * re-notification on the same calendar day.
 */
export async function markOverdueAlertSent(extensivOrderIds: number[]): Promise<void> {
  if (extensivOrderIds.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  // Update in batches to avoid huge IN clauses
  const BATCH = 100;
  for (let i = 0; i < extensivOrderIds.length; i += BATCH) {
    const batch = extensivOrderIds.slice(i, i + BATCH);
    for (const id of batch) {
      await db
        .update(orderTracking)
        .set({ lastOverdueAlertSentAt: now })
        .where(eq(orderTracking.extensivOrderId, id));
    }
  }
}

// ─── Alert Settings ──────────────────────────────────────────────────────────

const DEFAULT_ALERT_HOUR = 7;
const DEFAULT_ALERT_MINUTE = 0;

/** Returns the configured overdue-alert time as { hour, minute } (24-hour). Falls back to 07:00. */
export async function getAlertTime(): Promise<{ hour: number; minute: number }> {
  const db = await getDb();
  if (!db) return { hour: DEFAULT_ALERT_HOUR, minute: DEFAULT_ALERT_MINUTE };
  const rows = await db
    .select()
    .from(alertSettings)
    .where(eq(alertSettings.key, "overdue_alert_time"));
  if (!rows.length) return { hour: DEFAULT_ALERT_HOUR, minute: DEFAULT_ALERT_MINUTE };
  const [h, m] = rows[0].value.split(":").map(Number);
  const hour = Number.isFinite(h) && h >= 0 && h <= 23 ? h : DEFAULT_ALERT_HOUR;
  const minute = Number.isFinite(m) && m >= 0 && m <= 59 ? m : DEFAULT_ALERT_MINUTE;
  return { hour, minute };
}

/** Persists the overdue-alert time. Accepts hour (0-23) and minute (0-59). */
export async function setAlertTime(hour: number, minute: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const value = `${hour}:${String(minute).padStart(2, "0")}`;
  await db
    .insert(alertSettings)
    .values({ key: "overdue_alert_time", value })
    .onDuplicateKeyUpdate({ set: { value } });
}

// ─── Client Visibility ────────────────────────────────────────────────────────

/**
 * Return all client visibility rows for a given configId.
 * Rows are sorted alphabetically by clientName.
 */
export async function getClientVisibility(configId: number): Promise<ClientVisibility[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(clientVisibility)
    .where(eq(clientVisibility.configId, configId))
    .orderBy(clientVisibility.clientName);
}

/**
 * Upsert a batch of client visibility rows.
 * Each row is identified by (configId, clientId).
 */
export async function upsertClientVisibility(
  rows: Array<{ configId: number; clientId: number; clientName: string; isVisible: boolean }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const row of rows) {
    // Auto-lock when a client is manually hidden; unlock when manually shown
    const isLocked = !row.isVisible;
    await db
      .insert(clientVisibility)
      .values({ ...row, isLocked })
      .onDuplicateKeyUpdate({ set: { isVisible: row.isVisible, clientName: row.clientName, isLocked } });
  }
}

/**
 * Lock all currently hidden clients for a given configId.
 * Sets isLocked=true for every row where isVisible=false.
 * Returns the number of rows updated.
 */
export async function lockAllHiddenClients(configId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .update(clientVisibility)
    .set({ isLocked: true })
    .where(
      and(
        eq(clientVisibility.configId, configId),
        eq(clientVisibility.isVisible, false)
      )
    );
  return (result as any)[0]?.affectedRows ?? 0;
}

/**
 * Return the set of hidden clientIds for a given configId.
 * Clients not in client_visibility are treated as visible.
 */
export async function getHiddenClientIds(configId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ clientId: clientVisibility.clientId })
    .from(clientVisibility)
    .where(
      and(
        eq(clientVisibility.configId, configId),
        eq(clientVisibility.isVisible, false)
      )
    );
  return new Set(rows.map((r) => r.clientId));
}

/**
 * Sync the client_visibility table from the current order_tracking data.
 * Inserts new clients (defaulting to visible=true) without touching existing rows.
 */
export async function syncClientVisibilityFromOrders(configId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Get distinct clients from order_tracking for this configId
  const rows = await db
    .selectDistinct({
      clientId: orderTracking.clientId,
      clientName: orderTracking.clientName,
    })
    .from(orderTracking)
    .where(eq(orderTracking.configId, configId));

  for (const row of rows) {
    await db
      .insert(clientVisibility)
      .values({ configId, clientId: row.clientId, clientName: row.clientName, isVisible: true, isLocked: false })
      // Only update the cached name; never touch isVisible/isLocked for existing rows
      // (locked rows stay hidden, and we never re-enable manually hidden clients)
      .onDuplicateKeyUpdate({
        set: {
          // Update name if it changed in Extensiv
          clientName: row.clientName,
          // Only set isVisible=true for rows that are NOT locked
          // MySQL conditional: IF(isLocked = 0, 1, isVisible)
          isVisible: sql`IF(${clientVisibility.isLocked} = 0, 1, ${clientVisibility.isVisible})`,
        },
      });
  }
}

// ─── SLA Rules (per-client named sub-rules) ──────────────────────────────────

/** Return all sub-rules for a given client (by clientId). */
export async function getSlaRulesForClient(clientId: number): Promise<SlaRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(slaRules)
    .where(eq(slaRules.clientId, clientId))
    .orderBy(slaRules.ruleName);
}

/** Return all sub-rules for a list of clientIds (bulk fetch for the full table). */
export async function getAllSlaRules(): Promise<SlaRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(slaRules).orderBy(slaRules.clientName, slaRules.ruleName);
}

/** Upsert (insert or update) a named SLA rule for a client. */
export async function upsertSlaRule(
  input: Omit<InsertSlaRule, "createdAt" | "updatedAt">
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (input.id) {
    // Update existing
    await db
      .update(slaRules)
      .set({
        ruleName: input.ruleName,
        slaDays: input.slaDays,
        notes: input.notes ?? null,
        clientName: input.clientName,
        requirementId: input.requirementId,
      })
      .where(eq(slaRules.id, input.id));
  } else {
    // Insert new
    await db.insert(slaRules).values({
      requirementId: input.requirementId,
      clientId: input.clientId,
      clientName: input.clientName,
      ruleName: input.ruleName,
      slaDays: input.slaDays,
      notes: input.notes ?? null,
    });
  }
}

/** Delete a named SLA rule by id. */
export async function deleteSlaRule(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(slaRules).where(eq(slaRules.id, id));
}
