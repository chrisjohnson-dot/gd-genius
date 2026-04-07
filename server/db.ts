import { eq, desc, and, gte, lte, isNotNull, isNull, sql, inArray, or, count, SQL } from "drizzle-orm";
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
  returnsSessions,
  returnsItems,
  ReturnsSession,
  InsertReturnsSession,
  ReturnsItem,
  InsertReturnsItem,
  cortexConnections,
  cortexReturns,
  CortexConnection,
  InsertCortexConnection,
  CortexReturn,
  InsertCortexReturn,
  qcScanSessions,
  QcScanSession,
  InsertQcScanSession,
  qcScanItems,
  QcScanItem,
  InsertQcScanItem,
  qcPallets,
  QcPallet,
  InsertQcPallet,
  qcFlaggedScans,
  QcFlaggedScan,
  InsertQcFlaggedScan,
  palletScans,
  PalletScan,
  InsertPalletScan,
  slaFacilityThresholds,
  SlaFacilityThreshold,
  InsertSlaFacilityThreshold,
  slaDailySnapshots,
  SlaDailySnapshot,
  InsertSlaDailySnapshot,
  putAwayScans,
  muLabels,
  receiptItemConfirmations,
  putAwayPriority,
  slaOrderActions,
  SlaOrderAction,
  InsertSlaOrderAction,
  smallParcelSessions,
  SmallParcelSession,
  InsertSmallParcelSession,
  smallParcelPackageSizes,
  SmallParcelPackageSize,
  InsertSmallParcelPackageSize,
  smallParcelAuditLog,
  SmallParcelAuditLog,
  InsertSmallParcelAuditLog,
  supervisorPins,
  SupervisorPin,
  InsertSupervisorPin,
  smallParcelHighValueSkus,
  SmallParcelHighValueSku,
  InsertSmallParcelHighValueSku,
  techshipConfigs,
  TechshipConfig,
  InsertTechshipConfig,
  shippingIntegrationSettings,
  ShippingIntegrationSetting,
} from "../drizzle/schema";
import type { PutAwayScan, InsertPutAwayScan } from "../drizzle/schema";
import type { MuLabel, InsertMuLabel, ReceiptItemConfirmation, InsertReceiptItemConfirmation } from "../drizzle/schema";
import type { PutAwayPriority, InsertPutAwayPriority } from "../drizzle/schema";
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

export async function getUnresolvedVerificationCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(allocationRuns)
    .where(
      and(
        eq(allocationRuns.status, "confirmed"),
        inArray(allocationRuns.verificationStatus, ["partial", "mismatch", "failed"])
      )
    );
  return Number(result[0]?.count ?? 0);
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
        .where(
          and(
            eq(orderTracking.extensivOrderId, o.extensivOrderId),
            eq(orderTracking.configId, configId),
            eq(orderTracking.facilityId, facilityId)
          )
        );
      updated++;
    } else {
      // Insert new order as unallocated; use onDuplicateKeyUpdate as a safety net
      // in case the unique index catches a race between the existingMap fetch and this insert.
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
      }).onDuplicateKeyUpdate({
        set: {
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
        },
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
      orderChannel: "b2b" | "d2c" | "both";
      slaActionStatus: "active" | "waived" | "removed";
    }
  >
> {
  const db = await getDb();
  if (!db) return [];

  const [orders, requirements, allRules, channelRows, actionRows] = await Promise.all([
    db.select().from(orderTracking),
    db.select().from(slaRequirements),
    db.select().from(slaRules),
    db.select({ clientId: clientVisibility.clientId, configId: clientVisibility.configId, orderChannel: clientVisibility.orderChannel }).from(clientVisibility),
    db.select().from(slaOrderActions).orderBy(desc(slaOrderActions.performedAt)),
  ]);
  // Build channel map: clientId → channel (last config wins; 'both' is default)
  const channelMap = new Map<number, "b2b" | "d2c" | "both">();
  for (const r of channelRows) {
    channelMap.set(r.clientId, (r.orderChannel ?? "both") as "b2b" | "d2c" | "both");
  }
  // Build action map: extensivOrderId → latest action
  const actionMap = new Map<number, "waived" | "removed">();
  for (const a of actionRows) {
    if (!actionMap.has(a.extensivOrderId)) {
      actionMap.set(a.extensivOrderId, a.action as "waived" | "removed");
    }
  }

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

    // Apply any per-order extension (customer-requested later date)
    const extensionDays = order.slaExtensionDays ?? 0;
    const effectiveSlaDays = slaDays + extensionDays;
    const daysRemaining = effectiveSlaDays - ageCalendarDays;
    const slaStatus: "in_sla" | "out_of_sla" =
      daysRemaining >= 0 ? "in_sla" : "out_of_sla";

    const orderChannel = channelMap.get(order.clientId) ?? "both";
    const slaActionStatus: "active" | "waived" | "removed" = actionMap.get(order.extensivOrderId) ?? "active";
    return { ...order, slaDays: effectiveSlaDays, ageCalendarDays, slaStatus, daysRemaining, matchedRuleName, slaExtensionDays: extensionDays, orderChannel, slaActionStatus };
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
  verificationIssues: number;
  total: number;
}> {
  const db = await getDb();
  if (!db) return { overdueCount: 0, zeroBidCount: 0, verificationIssues: 0, total: 0 };

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

  // ── Unresolved verification issues ──────────────────────────────────────────
  const verificationIssues = await getUnresolvedVerificationCount();

  return { overdueCount, zeroBidCount, verificationIssues, total: overdueCount + zeroBidCount + verificationIssues };
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
 * Saves isVisible only — does NOT touch isLocked.
 * Locking is a separate, explicit action via setClientLock / lockAllHiddenClients.
 */
export async function upsertClientVisibility(
  rows: Array<{ configId: number; clientId: number; clientName: string; isVisible: boolean; orderChannel?: "b2b" | "d2c" | "both" }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const row of rows) {
    const channel = row.orderChannel ?? "both";
    await db
      .insert(clientVisibility)
      .values({ ...row, orderChannel: channel, isLocked: false })
      .onDuplicateKeyUpdate({ set: { isVisible: row.isVisible, clientName: row.clientName, orderChannel: channel } });
  }
}

/**
 * Toggle the lock state for a single client row.
 * When locked=true the sync job will never re-enable this client.
 * When locked=false the sync job may re-enable it if it appears in new orders.
 */
export async function setClientLock(
  configId: number,
  clientId: number,
  isLocked: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(clientVisibility)
    .set({ isLocked })
    .where(
      and(
        eq(clientVisibility.configId, configId),
        eq(clientVisibility.clientId, clientId)
      )
    );
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
      // On conflict (existing row): ONLY update the cached name.
      // NEVER touch isVisible or isLocked — those are user-managed.
      // New rows default to visible=true; existing rows keep whatever the user set.
      .onDuplicateKeyUpdate({
        set: {
          clientName: row.clientName,
        },
      });
  }
}

/**
 * Return a map of clientId → orderChannel for a given configId.
 * Clients not in client_visibility default to 'both'.
 */
export async function getClientChannelMap(configId: number): Promise<Map<number, "b2b" | "d2c" | "both">> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({ clientId: clientVisibility.clientId, orderChannel: clientVisibility.orderChannel })
    .from(clientVisibility)
    .where(eq(clientVisibility.configId, configId));
  return new Map(rows.map((r) => [r.clientId, (r.orderChannel ?? "both") as "b2b" | "d2c" | "both"]));
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

// ─── Per-order SLA extension ─────────────────────────────────────────────────

/**
 * Set or update the SLA extension for a specific order.
 * extensionDays is added to the order's base SLA deadline when evaluating breaches.
 */
export async function setSlaExtension(
  extensivOrderId: number,
  extensionDays: number,
  note: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orderTracking)
    .set({ slaExtensionDays: extensionDays, slaExtensionNote: note })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

/**
 * Clear the SLA extension for a specific order (reset to 0 days, no note).
 */
export async function clearSlaExtension(extensivOrderId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orderTracking)
    .set({ slaExtensionDays: 0, slaExtensionNote: null })
    .where(eq(orderTracking.extensivOrderId, extensivOrderId));
}

// ─── Returns helpers ──────────────────────────────────────────────────────────

export async function createReturnsSession(data: Omit<InsertReturnsSession, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(returnsSessions).values(data);
  return result.insertId as number;
}

export async function getReturnsSessions(filters?: { configId?: number; clientId?: number; status?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const sessions = await db.select().from(returnsSessions);
  return sessions
    .filter((s: ReturnsSession) => {
      if (filters?.configId !== undefined && s.configId !== filters.configId) return false;
      if (filters?.clientId !== undefined && s.clientId !== filters.clientId) return false;
      if (filters?.status && s.status !== filters.status) return false;
      return true;
    })
    .sort((a: ReturnsSession, b: ReturnsSession) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getReturnsSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [session] = await db.select().from(returnsSessions).where(eq(returnsSessions.id, id));
  return session ?? null;
}

export async function updateReturnsSession(
  id: number,
  data: Partial<Pick<InsertReturnsSession, "status" | "notes" | "referenceNumber" | "closedAt" | "pushStatus" | "pushAttempts" | "pushError" | "lastPushedAt">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(returnsSessions).set(data).where(eq(returnsSessions.id, id));
}

export async function addReturnsItem(data: Omit<InsertReturnsItem, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(returnsItems).values(data);
  return result.insertId as number;
}

export async function getReturnsItems(sessionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(returnsItems).where(eq(returnsItems.sessionId, sessionId));
}

export async function updateReturnsItem(
  id: number,
  data: Partial<Pick<InsertReturnsItem, "sku" | "description" | "quantity" | "condition" | "disposition" | "lotNumber" | "notes">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(returnsItems).set(data).where(eq(returnsItems.id, id));
}

export async function deleteReturnsItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(returnsItems).where(eq(returnsItems.id, id));
}

export async function getReturnsDashboardStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const allSessions = await db.select().from(returnsSessions);
  const allItems = await db.select().from(returnsItems);

  const open = allSessions.filter((s: ReturnsSession) => s.status === "open").length;
  const closed = allSessions.filter((s: ReturnsSession) => s.status === "closed").length;
  const totalItems = allItems.length;
  const totalQty = allItems.reduce((sum: number, i: ReturnsItem) => sum + i.quantity, 0);

  const conditionBreakdown = {
    new: allItems.filter((i: ReturnsItem) => i.condition === "new").reduce((s: number, i: ReturnsItem) => s + i.quantity, 0),
    good: allItems.filter((i: ReturnsItem) => i.condition === "good").reduce((s: number, i: ReturnsItem) => s + i.quantity, 0),
    damaged: allItems.filter((i: ReturnsItem) => i.condition === "damaged").reduce((s: number, i: ReturnsItem) => s + i.quantity, 0),
    unsellable: allItems.filter((i: ReturnsItem) => i.condition === "unsellable").reduce((s: number, i: ReturnsItem) => s + i.quantity, 0),
  };

  const recent = [...allSessions]
    .sort((a: ReturnsSession, b: ReturnsSession) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);

   return { open, closed, totalItems, totalQty, conditionBreakdown, recent };
}

/** Returns sessions with pushStatus='failed' and pushAttempts < 3 that are eligible for auto-retry */
export async function getFailedReturnSessions(): Promise<ReturnsSession[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(returnsSessions)
    .where(eq(returnsSessions.pushStatus, "failed"));
  // Only retry sessions that have fewer than 3 attempts
  return rows.filter((s: ReturnsSession) => (s.pushAttempts ?? 0) < 3);
}
// ─── GD Cortex DB Helpers ──────────────────────────────────────────────────────

export async function getCortexConnection(platform: string): Promise<CortexConnection | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(cortexConnections).where(eq(cortexConnections.platform, platform));
  return rows[0] ?? null;
}

export async function getAllCortexConnections(): Promise<CortexConnection[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cortexConnections).orderBy(cortexConnections.platform);
}

export async function upsertCortexConnection(
  platform: string,
  data: Partial<Omit<InsertCortexConnection, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getCortexConnection(platform);
  if (existing) {
    await db.update(cortexConnections).set(data).where(eq(cortexConnections.platform, platform));
  } else {
    await db.insert(cortexConnections).values({ platform, ...data } as InsertCortexConnection);
  }
}

export async function updateCortexHealthStatus(
  platform: string,
  status: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(cortexConnections)
    .set({ lastHealthCheck: new Date(), lastHealthStatus: status })
    .where(eq(cortexConnections.platform, platform));
}

// ─── Cortex Returns ───────────────────────────────────────────────────────────

export async function createCortexReturn(
  data: Omit<InsertCortexReturn, "id" | "createdAt" | "updatedAt">
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(cortexReturns).values(data as InsertCortexReturn);
  return (result as { insertId: number }).insertId;
}

export async function getCortexReturnByReturnNumber(returnNumber: string): Promise<CortexReturn | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(cortexReturns).where(eq(cortexReturns.returnNumber, returnNumber));
  return rows[0] ?? null;
}

export async function getCortexReturn(id: number): Promise<CortexReturn | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(cortexReturns).where(eq(cortexReturns.id, id));
  return rows[0] ?? null;
}

export async function updateCortexReturn(
  id: number,
  data: Partial<Omit<InsertCortexReturn, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(cortexReturns).set(data).where(eq(cortexReturns.id, id));
}

export async function getProcessedCortexReturns(since?: Date, limit = 100): Promise<CortexReturn[]> {
  const db = await getDb();
  if (!db) return [];
  const processedStatuses = ["Processed", "Refunded", "Rejected", "Restocked"];
  // Build query: status in processed list AND (since ? updatedAt >= since : all)
  const rows = await db
    .select()
    .from(cortexReturns)
    .orderBy(desc(cortexReturns.updatedAt))
    .limit(limit);
  // Filter in JS for status and since (avoids complex SQL IN clause)
  return rows.filter((r: CortexReturn) => {
    if (!processedStatuses.includes(r.status)) return false;
    if (since && r.updatedAt < since) return false;
    return true;
  });
}

export async function getPendingWebhookCortexReturns(): Promise<CortexReturn[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(cortexReturns)
    .where(eq(cortexReturns.webhookSent, false))
    .orderBy(cortexReturns.updatedAt);
}


// ─── QC Scanner helpers ───────────────────────────────────────────────────────

export async function createQcSession(data: InsertQcScanSession): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(qcScanSessions).values(data);
  return (result as any).insertId ?? 0;
}

export async function getQcSessionById(id: number): Promise<QcScanSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(qcScanSessions).where(eq(qcScanSessions.id, id));
  return rows[0] ?? null;
}

export async function getQcSessionByRef(referenceNumber: string): Promise<QcScanSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(qcScanSessions)
    .where(eq(qcScanSessions.referenceNumber, referenceNumber))
    .orderBy(desc(qcScanSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateQcSession(id: number, data: Partial<QcScanSession>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(qcScanSessions).set(data).where(eq(qcScanSessions.id, id));
}

export async function listQcSessions(limit = 50): Promise<QcScanSession[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(qcScanSessions).orderBy(desc(qcScanSessions.createdAt)).limit(limit);
}

// QC Scan Items

export async function upsertQcScanItem(sessionId: number, sku: string, upc: string | null, data: Partial<InsertQcScanItem>): Promise<QcScanItem | null> {
  const db = await getDb();
  if (!db) return null;
  const existing = await db
    .select()
    .from(qcScanItems)
    .where(and(eq(qcScanItems.sessionId, sessionId), eq(qcScanItems.sku, sku)));
  if (existing.length > 0) {
    await db.update(qcScanItems).set(data).where(and(eq(qcScanItems.sessionId, sessionId), eq(qcScanItems.sku, sku)));
    const updated = await db.select().from(qcScanItems).where(and(eq(qcScanItems.sessionId, sessionId), eq(qcScanItems.sku, sku)));
    return updated[0] ?? null;
  } else {
    const insert: InsertQcScanItem = { sessionId, sku, upc: upc ?? undefined, ...data } as InsertQcScanItem;
    await db.insert(qcScanItems).values(insert);
    const rows = await db.select().from(qcScanItems).where(and(eq(qcScanItems.sessionId, sessionId), eq(qcScanItems.sku, sku)));
    return rows[0] ?? null;
  }
}

export async function getQcScanItems(sessionId: number): Promise<QcScanItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(qcScanItems).where(eq(qcScanItems.sessionId, sessionId));
}

export async function incrementQcScanItem(sessionId: number, sku: string, amount: number): Promise<QcScanItem | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(qcScanItems).where(and(eq(qcScanItems.sessionId, sessionId), eq(qcScanItems.sku, sku)));
  if (rows.length === 0) return null;
  const item = rows[0];
  const newQty = Math.max(0, item.scannedQty + amount);
  const timestamps = (item.scanTimestamps as number[] | null) ?? [];
  if (amount > 0) timestamps.push(Date.now());
  await db.update(qcScanItems)
    .set({ scannedQty: newQty, scanTimestamps: timestamps })
    .where(and(eq(qcScanItems.sessionId, sessionId), eq(qcScanItems.sku, sku)));
  return { ...item, scannedQty: newQty, scanTimestamps: timestamps };
}

// QC Pallets

export async function createQcPallet(data: InsertQcPallet): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(qcPallets).values(data);
  return (result as any).insertId ?? 0;
}

export async function getQcPallets(sessionId: number): Promise<QcPallet[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(qcPallets)
    .where(and(eq(qcPallets.sessionId, sessionId), isNull(qcPallets.deletedAt)));
}

export async function updateQcPallet(id: number, data: Partial<QcPallet>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(qcPallets).set(data).where(eq(qcPallets.id, id));
}

// QC Flagged Scans

export async function createQcFlaggedScan(data: InsertQcFlaggedScan): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(qcFlaggedScans).values(data);
  return (result as any).insertId ?? 0;
}

export async function listQcFlaggedScans(status?: string): Promise<QcFlaggedScan[]> {
  const db = await getDb();
  if (!db) return [];
  if (status) {
    return db.select().from(qcFlaggedScans).where(eq(qcFlaggedScans.status, status)).orderBy(desc(qcFlaggedScans.createdAt));
  }
  return db.select().from(qcFlaggedScans).orderBy(desc(qcFlaggedScans.createdAt));
}

export async function resolveQcFlaggedScan(id: number, resolvedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(qcFlaggedScans).set({ status: "resolved", resolvedBy, resolvedAt: new Date() }).where(eq(qcFlaggedScans.id, id));
}

// ─── Pallet Scanner (Shipping) ─────────────────────────────────────────────

export async function createPalletScan(data: InsertPalletScan): Promise<PalletScan | null> {
  const db = _db;
  if (!db) return null;
  const [row] = await db.insert(palletScans).values(data).$returningId();
  if (!row) return null;
  const [scan] = await db.select().from(palletScans).where(eq(palletScans.id, row.id));
  return scan ?? null;
}

export async function listPalletScans(opts?: {
  warehouseName?: string;
  doorNumber?: string;
  limit?: number;
}): Promise<PalletScan[]> {
  const db = _db;
  if (!db) return [];
  const conditions = [];
  if (opts?.warehouseName) conditions.push(eq(palletScans.warehouseName, opts.warehouseName));
  if (opts?.doorNumber) conditions.push(eq(palletScans.doorNumber, opts.doorNumber));
  const query = db
    .select()
    .from(palletScans)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(palletScans.scannedAt))
    .limit(opts?.limit ?? 100);
  return query;
}

export async function updatePalletScanStatus(id: number, status: string): Promise<void> {
  const db = _db;
  if (!db) return;
  await db.update(palletScans).set({ status }).where(eq(palletScans.id, id));
}

// ─── QC Scanner — Recent Sessions ─────────────────────────────────────────────

export type RecentQcSession = {
  id: number;
  referenceNumber: string;
  customerName: string | null;
  poNumber: string | null;
  warehouseName: string | null;
  completedAt: Date | null;
  itemCount: number;
  totalExpected: number;
  totalScanned: number;
};

export async function getRecentCompletedQcSessions(limit = 5): Promise<RecentQcSession[]> {
  const db = await getDb();
  if (!db) return [];
  const sessions = await db
    .select()
    .from(qcScanSessions)
    .where(eq(qcScanSessions.status, "complete"))
    .orderBy(desc(qcScanSessions.completedAt))
    .limit(limit);

  if (sessions.length === 0) return [];

  // Fetch item counts for each session in parallel
  const results = await Promise.all(
    sessions.map(async (s) => {
      const items = await db
        .select({
          itemCount: sql<number>`count(*)`,
          totalExpected: sql<number>`coalesce(sum(${qcScanItems.expectedQty}), 0)`,
          totalScanned: sql<number>`coalesce(sum(${qcScanItems.scannedQty}), 0)`,
        })
        .from(qcScanItems)
        .where(eq(qcScanItems.sessionId, s.id));
      const agg = items[0] ?? { itemCount: 0, totalExpected: 0, totalScanned: 0 };
      return {
        id: s.id,
        referenceNumber: s.referenceNumber,
        customerName: s.customerName ?? null,
        poNumber: s.poNumber ?? null,
        warehouseName: s.warehouseName ?? null,
        completedAt: s.completedAt ?? null,
        itemCount: Number(agg.itemCount),
        totalExpected: Number(agg.totalExpected),
        totalScanned: Number(agg.totalScanned),
      };
    })
  );
  return results;
}

// ─── SLA Facility Thresholds ─────────────────────────────────────────────────

export async function getSlaFacilityThresholds() {
  const db = await getDb();
  return db!.select().from(slaFacilityThresholds).orderBy(slaFacilityThresholds.facilityName);
}

export async function getSlaFacilityThreshold(facilityId: number) {
  const db = await getDb();
  const rows = await db!
    .select()
    .from(slaFacilityThresholds)
    .where(eq(slaFacilityThresholds.facilityId, facilityId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSlaFacilityThreshold(data: {
  facilityId: number;
  facilityName: string;
  greenThreshold: number;
  yellowThreshold: number;
  notes?: string | null;
}) {
  const db = await getDb();
  await db!
    .insert(slaFacilityThresholds)
    .values({
      facilityId: data.facilityId,
      facilityName: data.facilityName,
      greenThreshold: data.greenThreshold,
      yellowThreshold: data.yellowThreshold,
      notes: data.notes ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        facilityName: data.facilityName,
        greenThreshold: data.greenThreshold,
        yellowThreshold: data.yellowThreshold,
        notes: data.notes ?? null,
      },
    });
  const rows = await db!
    .select()
    .from(slaFacilityThresholds)
    .where(eq(slaFacilityThresholds.facilityId, data.facilityId))
    .limit(1);
  return rows[0];
}

// ─── SLA Daily Snapshots ──────────────────────────────────────────────────────

/** Upsert a daily SLA snapshot for one facility (insert or replace for that date). */
export async function upsertSlaDailySnapshot(data: {
  facilityId: number;
  facilityName: string;
  snapshotDate: string; // YYYY-MM-DD
  inSlaCount: number;
  totalCount: number;
  slaRate: number;
}) {
  const db = await getDb();
  // Delete any existing snapshot for this facility+date then insert fresh
  await db!
    .delete(slaDailySnapshots)
    .where(
      and(
        eq(slaDailySnapshots.facilityId, data.facilityId),
        eq(slaDailySnapshots.snapshotDate, data.snapshotDate)
      )
    );
  await db!.insert(slaDailySnapshots).values(data);
}

/** Return the last N days of snapshots for a facility, ordered oldest-first. */
export async function getSlaDailyHistory(
  facilityId: number,
  days = 7
): Promise<SlaDailySnapshot[]> {
  const db = await getDb();
  const rows = await db!
    .select()
    .from(slaDailySnapshots)
    .where(eq(slaDailySnapshots.facilityId, facilityId))
    .orderBy(desc(slaDailySnapshots.snapshotDate))
    .limit(days);
  // Return oldest-first so sparklines render left-to-right chronologically
  return rows.reverse();
}

/** Return the latest snapshot for every facility (one row per facility). */
export async function getLatestSlaDailySnapshots(): Promise<SlaDailySnapshot[]> {
  const db = await getDb();
  // Subquery: max snapshotDate per facilityId
  const rows = await db!
    .select()
    .from(slaDailySnapshots)
    .orderBy(desc(slaDailySnapshots.snapshotDate));
  // Deduplicate: keep only the most recent row per facilityId
  const seen = new Set<number>();
  return rows.filter((r) => {
    if (seen.has(r.facilityId)) return false;
    seen.add(r.facilityId);
    return true;
  });
}

// ─── Allocation Verification Helpers ─────────────────────────────────────────

export type VerificationStatus = "pending" | "verified" | "partial" | "mismatch" | "failed";

export interface OrderVerificationResult {
  orderId: number;
  referenceNum: string;
  status: VerificationStatus;
  fullyAllocated: boolean | null;
  skuResults: Array<{
    sku: string;
    approvedQty: number;
    extensivQty: number;
    match: boolean;
  }>;
  error?: string;
}

/** Update the run-level verification status and detail after verifying Extensiv. */
export async function updateRunVerification(
  runId: number,
  status: VerificationStatus,
  detail: OrderVerificationResult[],
  verifiedAt: Date
): Promise<void> {
  const db = await getDb();
  await db!
    .update(allocationRuns)
    .set({ verificationStatus: status, verificationDetail: detail as unknown as null, verifiedAt })
    .where(eq(allocationRuns.id, runId));
}

/** Update a single run order's verification status and detail. */
export async function updateRunOrderVerification(
  runOrderId: number,
  status: VerificationStatus,
  detail: OrderVerificationResult["skuResults"]
): Promise<void> {
  const db = await getDb();
  await db!
    .update(allocationRunOrders)
    .set({ verificationStatus: status, verificationDetail: detail as unknown as null })
    .where(eq(allocationRunOrders.id, runOrderId));
}

// ─── Put Away Scans ────────────────────────────────────────────────────────

export async function createPutAwayScan(data: InsertPutAwayScan): Promise<void> {
  const db = await getDb();
  await db!.insert(putAwayScans).values(data);
}

export async function listPutAwayScans(
  sessionId: string,
  limit = 100
): Promise<PutAwayScan[]> {
  const db = await getDb();
  return db!
    .select()
    .from(putAwayScans)
    .where(eq(putAwayScans.sessionId, sessionId))
    .orderBy(desc(putAwayScans.scannedAt))
    .limit(limit);
}

export async function listPutAwayScansByConfig(
  configId: number,
  limit = 200
): Promise<PutAwayScan[]> {
  const db = await getDb();
  return db!
    .select()
    .from(putAwayScans)
    .where(eq(putAwayScans.configId, configId))
    .orderBy(desc(putAwayScans.scannedAt))
    .limit(limit);
}

export async function clearPutAwaySession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db!.delete(putAwayScans).where(eq(putAwayScans.sessionId, sessionId));
}

export type { PutAwayScan, InsertPutAwayScan };

// ─── MU Labels ───────────────────────────────────────────────────────────────

export async function createMuLabels(
  data: InsertMuLabel[]
): Promise<void> {
  const db = await getDb();
  await db!.insert(muLabels).values(data);
}

export async function getMuLabelsForTransaction(
  configId: number,
  transactionId: number
): Promise<MuLabel[]> {
  const db = await getDb();
  return db!
    .select()
    .from(muLabels)
    .where(
      and(
        eq(muLabels.configId, configId),
        eq(muLabels.transactionId, transactionId)
      )
    )
    .orderBy(muLabels.id);
}

export async function markMuLabelSynced(id: number): Promise<void> {
  const db = await getDb();
  await db!
    .update(muLabels)
    .set({ syncedToExtensiv: true })
    .where(eq(muLabels.id, id));
}

export async function deleteMuLabelsForTransaction(
  configId: number,
  transactionId: number
): Promise<void> {
  const db = await getDb();
  await db!
    .delete(muLabels)
    .where(
      and(
        eq(muLabels.configId, configId),
        eq(muLabels.transactionId, transactionId)
      )
    );
}

export type { MuLabel, InsertMuLabel };

// ─── Receipt Item Confirmations ───────────────────────────────────────────────

export async function upsertReceiptItemConfirmation(
  data: InsertReceiptItemConfirmation
): Promise<void> {
  const db = await getDb();
  // Delete existing confirmation for this item (upsert by transactionId + receiverItemId)
  await db!
    .delete(receiptItemConfirmations)
    .where(
      and(
        eq(receiptItemConfirmations.configId, data.configId),
        eq(receiptItemConfirmations.transactionId, data.transactionId),
        eq(receiptItemConfirmations.receiverItemId, data.receiverItemId)
      )
    );
  await db!.insert(receiptItemConfirmations).values(data);
}

export async function getReceiptItemConfirmations(
  configId: number,
  transactionId: number
): Promise<ReceiptItemConfirmation[]> {
  const db = await getDb();
  return db!
    .select()
    .from(receiptItemConfirmations)
    .where(
      and(
        eq(receiptItemConfirmations.configId, configId),
        eq(receiptItemConfirmations.transactionId, transactionId)
      )
    )
    .orderBy(receiptItemConfirmations.id);
}

export async function deleteReceiptItemConfirmations(
  configId: number,
  transactionId: number
): Promise<void> {
  const db = await getDb();
  await db!
    .delete(receiptItemConfirmations)
    .where(
      and(
        eq(receiptItemConfirmations.configId, configId),
        eq(receiptItemConfirmations.transactionId, transactionId)
      )
    );
}

export type { ReceiptItemConfirmation, InsertReceiptItemConfirmation };

// ─── Put Away Priority Config ─────────────────────────────────────────────────

export async function getPutAwayPriorities(
  configId: number,
  facilityId: number,
  customerId: number
): Promise<PutAwayPriority[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(putAwayPriority)
    .where(
      and(
        eq(putAwayPriority.configId, configId),
        eq(putAwayPriority.facilityId, facilityId),
        eq(putAwayPriority.customerId, customerId)
      )
    )
    .orderBy(putAwayPriority.priorityOrder);
}

export async function savePutAwayPriorities(
  configId: number,
  facilityId: number,
  customerId: number,
  entries: Array<{ aisle: string; level: string; priorityOrder: number }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete existing priorities for this config/facility/customer
  await db
    .delete(putAwayPriority)
    .where(
      and(
        eq(putAwayPriority.configId, configId),
        eq(putAwayPriority.facilityId, facilityId),
        eq(putAwayPriority.customerId, customerId)
      )
    );
  if (entries.length === 0) return;
  const now = Date.now();
  const rows: InsertPutAwayPriority[] = entries.map((e) => ({
    configId,
    facilityId,
    customerId,
    aisle: e.aisle,
    level: e.level,
    priorityOrder: e.priorityOrder,
    updatedAt: now,
  }));
  await db.insert(putAwayPriority).values(rows);
}

export async function deletePutAwayPriorities(
  configId: number,
  facilityId: number,
  customerId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(putAwayPriority)
    .where(
      and(
        eq(putAwayPriority.configId, configId),
        eq(putAwayPriority.facilityId, facilityId),
        eq(putAwayPriority.customerId, customerId)
      )
    );
}

// ─── Label Scan Settings ──────────────────────────────────────────────────────
import {
  labelScanSettings,
  LabelScanSettings,
  labelFiles,
  LabelFile,
  InsertLabelFile,
  labelScanSessions,
  LabelScanSession,
  InsertLabelScanSession,
  labelScanCartons,
  LabelScanCarton,
  InsertLabelScanCarton,
} from "../drizzle/schema";

export async function getLabelScanSettings(): Promise<LabelScanSettings | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(labelScanSettings).limit(1);
  return rows[0] ?? null;
}

export async function upsertLabelScanSettings(
  data: Partial<Omit<LabelScanSettings, "id" | "updatedAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getLabelScanSettings();
  if (existing) {
    await db.update(labelScanSettings).set(data).where(eq(labelScanSettings.id, existing.id));
  } else {
    await db.insert(labelScanSettings).values({
      printerIp: data.printerIp ?? "",
      printerPort: data.printerPort ?? 9100,
      gs1Prefix: data.gs1Prefix ?? "",
      labelFolderPath: data.labelFolderPath ?? "",
      plcProtocol: data.plcProtocol ?? "modbus",
      plcIp: data.plcIp ?? "",
      plcPort: data.plcPort ?? 502,
      plcUnitId: data.plcUnitId ?? 1,
      plcStubMode: data.plcStubMode ?? true,
      enipSlot: data.enipSlot ?? 0,
      enipPath: data.enipPath ?? "",
      enipTagBeltStop: data.enipTagBeltStop ?? "GD_BeltStop",
      enipTagTampFire: data.enipTagTampFire ?? "GD_TampFire",
      enipTagDivertOn: data.enipTagDivertOn ?? "GD_DivertOn",
      // v3 Modbus coil map
      modbusCoilDivert: data.modbusCoilDivert ?? 0,
      modbusCoilBeltStop: data.modbusCoilBeltStop ?? 1,
      modbusCoilTampFire: data.modbusCoilTampFire ?? 2,
      modbusCoilStopPlate: data.modbusCoilStopPlate ?? 3,
      modbusCoilSquareExtend: data.modbusCoilSquareExtend ?? 4,
      modbusCoilSquareRetract: data.modbusCoilSquareRetract ?? 5,
      modbusCoilTampReady: data.modbusCoilTampReady ?? 9,
      modbusCoilBeltRunning: data.modbusCoilBeltRunning ?? 10,
      modbusCoilSquareConfirmed: data.modbusCoilSquareConfirmed ?? 11,
      modbusCoilSquareHome: data.modbusCoilSquareHome ?? 12,
      modbusRegTampX: data.modbusRegTampX ?? 0,
      modbusRegTampY: data.modbusRegTampY ?? 1,
      modbusRegEncoderPos: data.modbusRegEncoderPos ?? 9,
      // Network topology
      qcAppIp: data.qcAppIp ?? "192.168.1.10",
      edgeComputeIp: data.edgeComputeIp ?? "192.168.1.20",
      zebraIp: data.zebraIp ?? "192.168.1.30",
      lpaIp: data.lpaIp ?? "192.168.1.50",
      lpaPort: data.lpaPort ?? 9200,
      // Squaring station
      tampXMmFixed: data.tampXMmFixed ?? "120.00",
      squaringTimeoutMs: data.squaringTimeoutMs ?? 2000,
      tampReadyTimeoutMs: data.tampReadyTimeoutMs ?? 1000,
    });
  }
}

// ─── Label Files ──────────────────────────────────────────────────────────────
export async function createLabelFile(data: InsertLabelFile): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(labelFiles).values(data) as any;
  return result.insertId;
}

export async function getLabelFileByBarcode(barcode: string): Promise<LabelFile | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(labelFiles).where(eq(labelFiles.barcode, barcode)).limit(1);
  return rows[0] ?? null;
}

/**
 * Look up a label file by barcode, scoped to a specific Extensiv transaction ID.
 * If extensivTransactionId is provided, prefer files tagged with that ID;
 * fall back to untagged files only if no scoped match is found.
 */
export async function getLabelFileByBarcodeScoped(
  barcode: string,
  extensivTransactionId?: string
): Promise<LabelFile | null> {
  const db = await getDb();
  if (!db) return null;
  if (extensivTransactionId) {
    // First: exact match on barcode + transaction ID
    const scoped = await db
      .select()
      .from(labelFiles)
      .where(and(eq(labelFiles.barcode, barcode), eq(labelFiles.extensivTransactionId, extensivTransactionId)))
      .limit(1);
    if (scoped.length > 0) return scoped[0]!;
    // Fallback: barcode match with no transaction ID tag
    const untagged = await db
      .select()
      .from(labelFiles)
      .where(and(eq(labelFiles.barcode, barcode), isNull(labelFiles.extensivTransactionId)))
      .limit(1);
    return untagged[0] ?? null;
  }
  // No scoping — match by barcode only
  const rows = await db.select().from(labelFiles).where(eq(labelFiles.barcode, barcode)).limit(1);
  return rows[0] ?? null;
}

/**
 * Return the single active label scan session (status = 'active'), if any.
 */
export async function getActiveLabelScanSession(): Promise<LabelScanSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(labelScanSessions)
    .where(eq(labelScanSessions.status, "active"))
    .orderBy(desc(labelScanSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLabelFiles(batchName?: string): Promise<LabelFile[]> {
  const db = await getDb();
  if (!db) return [];
  if (batchName) {
    return db.select().from(labelFiles).where(eq(labelFiles.batchName, batchName)).orderBy(labelFiles.uploadedAt);
  }
  return db.select().from(labelFiles).orderBy(labelFiles.uploadedAt);
}

export async function deleteLabelFile(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(labelFiles).where(eq(labelFiles.id, id));
}

export async function getLabelFileById(id: number): Promise<LabelFile | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(labelFiles).where(eq(labelFiles.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── Label Scan Sessions ──────────────────────────────────────────────────────
export async function createLabelScanSession(data: InsertLabelScanSession): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(labelScanSessions).values(data) as any;
  return result.insertId;
}

export async function getLabelScanSessionById(id: number): Promise<LabelScanSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(labelScanSessions).where(eq(labelScanSessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listLabelScanSessions(limit = 50): Promise<LabelScanSession[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(labelScanSessions).orderBy(labelScanSessions.createdAt).limit(limit);
}

export async function updateLabelScanSession(
  id: number,
  data: Partial<Omit<LabelScanSession, "id" | "createdAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(labelScanSessions).set(data).where(eq(labelScanSessions.id, id));
}

// ─── Label Scan Cartons ───────────────────────────────────────────────────────
export async function createLabelScanCarton(data: InsertLabelScanCarton): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(labelScanCartons).values(data) as any;
  return result.insertId;
}

export async function getLabelScanCartonsBySession(sessionId: number): Promise<LabelScanCarton[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(labelScanCartons).where(eq(labelScanCartons.sessionId, sessionId)).orderBy(labelScanCartons.scannedAt);
}

export async function getLabelScanCartonById(id: number): Promise<LabelScanCarton | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(labelScanCartons).where(eq(labelScanCartons.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateLabelScanCarton(
  id: number,
  data: Partial<Omit<LabelScanCarton, "id" | "createdAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(labelScanCartons).set(data).where(eq(labelScanCartons.id, id));
}

// ─── Production Line DB Helpers ───────────────────────────────────────────────
import {
  productionRuns,
  ProductionRun,
  InsertProductionRun,
  productionScans,
  ProductionScan,
  InsertProductionScan,
  productionSkuConfigs,
  ProductionSkuConfig,
  InsertProductionSkuConfig,
} from "../drizzle/schema";

export async function createProductionRun(data: InsertProductionRun): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(productionRuns).values(data);
  return (result as any).insertId;
}

export async function getActiveProductionRun(lineId: string): Promise<ProductionRun | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(productionRuns)
    .where(and(eq(productionRuns.lineId, lineId), eq(productionRuns.status, "active")))
    .orderBy(desc(productionRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProductionRunByRunId(runId: string): Promise<ProductionRun | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(productionRuns).where(eq(productionRuns.runId, runId)).limit(1);
  return rows[0] ?? null;
}

export async function updateProductionRun(
  runId: string,
  data: Partial<Omit<ProductionRun, "id" | "runId" | "createdAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(productionRuns).set(data).where(eq(productionRuns.runId, runId));
}

export async function listProductionRuns(limit = 50): Promise<ProductionRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productionRuns).orderBy(desc(productionRuns.startedAt)).limit(limit);
}

export async function createProductionScan(data: InsertProductionScan): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(productionScans).values(data);
  return (result as any).insertId;
}

export async function listProductionScans(runId: string, limit = 100): Promise<ProductionScan[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(productionScans)
    .where(eq(productionScans.runId, runId))
    .orderBy(desc(productionScans.scannedAt))
    .limit(limit);
}

export async function getProductionSkuConfig(gtin: string): Promise<ProductionSkuConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(productionSkuConfigs).where(eq(productionSkuConfigs.gtin, gtin)).limit(1);
  return rows[0] ?? null;
}

export async function upsertProductionSkuConfig(data: InsertProductionSkuConfig): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(productionSkuConfigs)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        skuDescription: data.skuDescription,
        shelfLifeDaysMin: data.shelfLifeDaysMin,
        holdConfidenceMin: data.holdConfidenceMin,
        lotPattern: data.lotPattern,
      },
    });
}

export async function listProductionSkuConfigs(): Promise<ProductionSkuConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productionSkuConfigs).orderBy(productionSkuConfigs.gtin);
}

export async function deleteProductionSkuConfig(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(productionSkuConfigs).where(eq(productionSkuConfigs.id, id));
}

// ─── Scan Image helpers ───────────────────────────────────────────────────────

/** Update image URL/key columns on a production scan record */
export async function updateProductionScanImages(
  scanId: string,
  data: {
    camAImageUrl?: string;
    camAImageKey?: string;
    camBImageUrl?: string;
    camBImageKey?: string;
    postApplyImageUrl?: string;
    postApplyImageKey?: string;
    postApplyReceivedAt?: Date;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(productionScans)
    .set(data)
    .where(eq(productionScans.scanId, scanId));
}

/** Get a production scan by cartonId (most recent) */
export async function getProductionScanByCartonId(
  cartonId: string
): Promise<ProductionScan | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(productionScans)
    .where(eq(productionScans.cartonId, cartonId))
    .orderBy(desc(productionScans.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Get a production scan by scanId */
export async function getProductionScanByScanId(
  scanId: string
): Promise<ProductionScan | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(productionScans)
    .where(eq(productionScans.scanId, scanId))
    .limit(1);
  return rows[0] ?? null;
}

/** List production scans with optional filters for the audit image gallery */
export async function listProductionScansForAudit(opts: {
  runId?: string;
  verdict?: "pass" | "fail" | "hold";
  hasImages?: boolean; // only scans that have at least one image
  fromTs?: Date;
  toTs?: Date;
  limit?: number;
  offset?: number;
}): Promise<ProductionScan[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [];
  if (opts.runId) conditions.push(eq(productionScans.runId, opts.runId));
  if (opts.verdict) conditions.push(eq(productionScans.verdict, opts.verdict));
  if (opts.fromTs) conditions.push(gte(productionScans.scannedAt, opts.fromTs));
  if (opts.toTs) conditions.push(lte(productionScans.scannedAt, opts.toTs));
  if (opts.hasImages) {
    conditions.push(
      or(
        isNotNull(productionScans.camAImageUrl),
        isNotNull(productionScans.camBImageUrl),
        isNotNull(productionScans.postApplyImageUrl)
      )!
    );
  }
  const q = db
    .select()
    .from(productionScans)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(productionScans.scannedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return q;
}

/** Count production scans matching audit filters */
export async function countProductionScansForAudit(opts: {
  runId?: string;
  verdict?: "pass" | "fail" | "hold";
  hasImages?: boolean;
  fromTs?: Date;
  toTs?: Date;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions: SQL[] = [];
  if (opts.runId) conditions.push(eq(productionScans.runId, opts.runId));
  if (opts.verdict) conditions.push(eq(productionScans.verdict, opts.verdict));
  if (opts.fromTs) conditions.push(gte(productionScans.scannedAt, opts.fromTs));
  if (opts.toTs) conditions.push(lte(productionScans.scannedAt, opts.toTs));
  if (opts.hasImages) {
    conditions.push(
      or(
        isNotNull(productionScans.camAImageUrl),
        isNotNull(productionScans.camBImageUrl),
        isNotNull(productionScans.postApplyImageUrl)
      )!
    );
  }
  const rows = await db
    .select({ count: count() })
    .from(productionScans)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return rows[0]?.count ?? 0;
}

/** Purge old scan images: delete S3 keys and clear URL columns for scans older than cutoff */
export async function listOldScanImages(cutoffDate: Date): Promise<
  Array<{ scanId: string; camAImageKey: string | null; camBImageKey: string | null; postApplyImageKey: string | null }>
> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      scanId: productionScans.scanId,
      camAImageKey: productionScans.camAImageKey,
      camBImageKey: productionScans.camBImageKey,
      postApplyImageKey: productionScans.postApplyImageKey,
    })
    .from(productionScans)
    .where(
      and(
        lte(productionScans.scannedAt, cutoffDate),
        or(
          isNotNull(productionScans.camAImageKey),
          isNotNull(productionScans.camBImageKey),
          isNotNull(productionScans.postApplyImageKey)
        )!
      )
    );
}

/** Clear image columns for a set of scanIds after S3 deletion */
export async function clearScanImageColumns(scanIds: string[]): Promise<void> {
  const db = await getDb();
  if (!db || scanIds.length === 0) return;
  await db
    .update(productionScans)
    .set({
      camAImageUrl: null,
      camAImageKey: null,
      camBImageUrl: null,
      camBImageKey: null,
      postApplyImageUrl: null,
      postApplyImageKey: null,
      postApplyReceivedAt: null,
    })
    .where(inArray(productionScans.scanId, scanIds));
}

// ─── SLA Order Actions (Remove / Waive) ──────────────────────────────────────

/** Record a Remove or Waive action on an out-of-SLA order. */
export async function createSlaOrderAction(
  data: Omit<InsertSlaOrderAction, "id" | "performedAt">
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(slaOrderActions).values(data);
}

/** List all SLA order actions, newest first. Optionally filter by extensivOrderId. */
export async function listSlaOrderActions(
  extensivOrderId?: number
): Promise<SlaOrderAction[]> {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(slaOrderActions).orderBy(desc(slaOrderActions.performedAt));
  if (extensivOrderId !== undefined) {
    return q.where(eq(slaOrderActions.extensivOrderId, extensivOrderId));
  }
  return q;
}

/** Clear the latest action for an order (restore it to active SLA tracking). */
export async function clearSlaOrderAction(extensivOrderId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(slaOrderActions).where(eq(slaOrderActions.extensivOrderId, extensivOrderId));
}

// ─── Shipping Dashboard ───────────────────────────────────────────────────────
/** Return all ship_ready orders for the Shipping Dashboard, ordered by shipReadyAt asc. */
export async function getShipReadyOrders(): Promise<Array<{
  id: number;
  extensivOrderId: number;
  referenceNum: string | null;
  poNum: string | null;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  totalPieces: number | null;
  requiredShipDate: string | null;
  outboundLocation: string | null;
  palletCount: number | null;
  shipReadyAt: Date | null;
  firstSeenAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: orderTracking.id,
      extensivOrderId: orderTracking.extensivOrderId,
      referenceNum: orderTracking.referenceNum,
      poNum: orderTracking.poNum,
      clientId: orderTracking.clientId,
      clientName: orderTracking.clientName,
      facilityId: orderTracking.facilityId,
      facilityName: orderTracking.facilityName,
      shipToName: orderTracking.shipToName,
      shipToCity: orderTracking.shipToCity,
      totalPieces: orderTracking.totalPieces,
      requiredShipDate: orderTracking.requiredShipDate,
      outboundLocation: orderTracking.outboundLocation,
      palletCount: orderTracking.palletCount,
      shipReadyAt: orderTracking.shipReadyAt,
      firstSeenAt: orderTracking.firstSeenAt,
    })
    .from(orderTracking)
    .where(eq(orderTracking.lifecycleStatus, "ship_ready"))
    .orderBy(orderTracking.shipReadyAt);
}

/** Update outbound location and pallet count for an order. */
export async function updateOutboundDetails(
  id: number,
  data: { outboundLocation?: string; palletCount?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(orderTracking).set(data).where(eq(orderTracking.id, id));
}

/** Get a single tracked order by its DB primary key. */
export async function getOrderById(id: number): Promise<OrderTracking | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(orderTracking).where(eq(orderTracking.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── QC Audit Log ─────────────────────────────────────────────────────────────
export type QcAuditEvent = {
  id: string;
  eventType: "qc_scan" | "label_scan";
  sessionId: number;
  referenceNumber: string | null;
  customerName: string | null;
  warehouseName: string | null;
  createdBy: string | null;
  sku: string | null;
  barcode: string | null;
  scannedQty: number | null;
  status: string | null;
  scannedAt: Date;
  sessionCreatedAt: Date;
};

export async function listQcAuditLog(opts: {
  fromDate?: Date;
  toDate?: Date;
  user?: string;
  item?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: QcAuditEvent[]; total: number }> {
  const db = await getDb();
  if (!db) return { events: [], total: 0 };

  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  // ── QC Scanner scan items ──────────────────────────────────────────────────
  const qcQuery = db
    .select({
      sessionId: qcScanSessions.id,
      referenceNumber: qcScanSessions.referenceNumber,
      customerName: qcScanSessions.customerName,
      warehouseName: qcScanSessions.warehouseName,
      createdBy: qcScanSessions.createdBy,
      status: qcScanSessions.status,
      sessionCreatedAt: qcScanSessions.createdAt,
      itemId: qcScanItems.id,
      sku: qcScanItems.sku,
      scannedQty: qcScanItems.scannedQty,
      itemUpdatedAt: qcScanItems.updatedAt,
    })
    .from(qcScanItems)
    .innerJoin(qcScanSessions, eq(qcScanItems.sessionId, qcScanSessions.id));

  // ── Label Scanner cartons ──────────────────────────────────────────────────
  const labelQuery = db
    .select({
      sessionId: labelScanSessions.id,
      referenceNumber: labelScanSessions.orderRef,
      customerName: labelScanSessions.clientName,
      createdBy: labelScanSessions.createdBy,
      status: labelScanSessions.status,
      sessionCreatedAt: labelScanSessions.createdAt,
      cartonId: labelScanCartons.id,
      barcode: labelScanCartons.barcode,
      scannedAt: labelScanCartons.scannedAt,
    })
    .from(labelScanCartons)
    .innerJoin(labelScanSessions, eq(labelScanCartons.sessionId, labelScanSessions.id));

  const [qcRows, labelRows] = await Promise.all([qcQuery, labelQuery]);

  // Merge into unified events
  const allEvents: QcAuditEvent[] = [
    ...qcRows.map((r) => ({
      id: `qc-${r.sessionId}-${r.itemId}`,
      eventType: "qc_scan" as const,
      sessionId: r.sessionId,
      referenceNumber: r.referenceNumber,
      customerName: r.customerName ?? null,
      warehouseName: r.warehouseName ?? null,
      createdBy: r.createdBy ?? null,
      sku: r.sku,
      barcode: null,
      scannedQty: r.scannedQty,
      status: r.status,
      scannedAt: r.itemUpdatedAt,
      sessionCreatedAt: r.sessionCreatedAt,
    })),
    ...labelRows.map((r) => ({
      id: `label-${r.sessionId}-${r.cartonId}`,
      eventType: "label_scan" as const,
      sessionId: r.sessionId,
      referenceNumber: r.referenceNumber ?? null,
      customerName: r.customerName ?? null,
      warehouseName: null,
      createdBy: r.createdBy ?? null,
      sku: null,
      barcode: r.barcode,
      scannedQty: null,
      status: r.status,
      scannedAt: r.scannedAt,
      sessionCreatedAt: r.sessionCreatedAt,
    })),
  ];

  // Apply filters
  let filtered = allEvents;
  if (opts.fromDate) filtered = filtered.filter((e) => e.scannedAt >= opts.fromDate!);
  if (opts.toDate) {
    const end = new Date(opts.toDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((e) => e.scannedAt <= end);
  }
  if (opts.user) {
    const u = opts.user.toLowerCase();
    filtered = filtered.filter((e) => (e.createdBy ?? "").toLowerCase().includes(u));
  }
  if (opts.item) {
    const q = opts.item.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        (e.sku ?? "").toLowerCase().includes(q) ||
        (e.barcode ?? "").toLowerCase().includes(q) ||
        (e.referenceNumber ?? "").toLowerCase().includes(q) ||
        (e.customerName ?? "").toLowerCase().includes(q)
    );
  }

  // Sort newest first
  filtered.sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());

  const total = filtered.length;
  const events = filtered.slice(offset, offset + limit);
  return { events, total };
}

// ─── Order Detail Helpers ─────────────────────────────────────────────────────

import { slaSnapshots, SlaSnapshot } from "../drizzle/schema";

/** Return the most-recent SLA snapshot row for a given Extensiv order ID. */
export async function getLatestSlaSnapshotForOrder(
  extensivOrderId: number
): Promise<SlaSnapshot | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(slaSnapshots)
    .where(eq(slaSnapshots.orderId, extensivOrderId))
    .orderBy(desc(slaSnapshots.snapshotDate))
    .limit(1);
  return rows[0] ?? null;
}

/** Return audit log entries for a single order (by extensivOrderId string). */
export async function getOrderAuditHistory(
  extensivOrderId: number,
  limit = 50
): Promise<Array<{
  id: number;
  action: string;
  details: unknown;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.entityId, String(extensivOrderId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// // ── Small Parcel Sessions ─────────────────────────────────────────────────────
export async function createSmallParcelSession(data: Omit<InsertSmallParcelSession, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(smallParcelSessions).values(data);
  return (result[0] as { insertId: number }).insertId;
}
export async function getSmallParcelSession(id: number): Promise<SmallParcelSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(smallParcelSessions).where(eq(smallParcelSessions.id, id));
  return rows[0] ?? null;
}
export async function updateSmallParcelSession(id: number, data: Partial<InsertSmallParcelSession>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(smallParcelSessions).set({ ...data, updatedAt: new Date() }).where(eq(smallParcelSessions.id, id));
}
export async function listSmallParcelSessions(opts: { facilityId?: number; status?: string; limit?: number } = {}): Promise<SmallParcelSession[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [];
  if (opts.facilityId) conditions.push(eq(smallParcelSessions.facilityId, opts.facilityId));
  if (opts.status) conditions.push(eq(smallParcelSessions.status, opts.status as SmallParcelSession["status"]));
  const q = db.select().from(smallParcelSessions).orderBy(desc(smallParcelSessions.createdAt)).limit(opts.limit ?? 100);
  if (conditions.length === 1) return q.where(conditions[0]);
  if (conditions.length > 1) return q.where(and(...conditions));
  return q;
}

// ── Small Parcel Package Sizes ───────────────────────────────────────────────────────────────────

/** Return package sizes visible for a given client (client-specific + global defaults). */
export async function listPackageSizesForClient(clientId: number): Promise<SmallParcelPackageSize[]> {
  const db = await getDb();
  if (!db) return [];
  // Return sizes specific to this client OR global (clientId=0), sorted by sortOrder
  const rows = await db
    .select()
    .from(smallParcelPackageSizes)
    .where(
      or(
        eq(smallParcelPackageSizes.clientId, clientId),
        eq(smallParcelPackageSizes.clientId, 0)
      )
    )
    .orderBy(smallParcelPackageSizes.sortOrder, smallParcelPackageSizes.name);
  return rows;
}

/** Return ALL package sizes (for config page). */
export async function listAllPackageSizes(): Promise<SmallParcelPackageSize[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(smallParcelPackageSizes).orderBy(smallParcelPackageSizes.clientId, smallParcelPackageSizes.sortOrder);
}

export async function createPackageSize(data: Omit<InsertSmallParcelPackageSize, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(smallParcelPackageSizes).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function deletePackageSize(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(smallParcelPackageSizes).where(eq(smallParcelPackageSizes.id, id));
}

export async function updatePackageSize(id: number, data: Partial<Omit<InsertSmallParcelPackageSize, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(smallParcelPackageSizes).set({ ...data, updatedAt: new Date() }).where(eq(smallParcelPackageSizes.id, id));
}

// ─── Small Parcel Audit Log ───────────────────────────────────────────────────

export async function logSmallParcelAuditEvent(
  data: Omit<InsertSmallParcelAuditLog, "id" | "createdAt">
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(smallParcelAuditLog).values(data);
}

export async function getSmallParcelAuditLog(opts: {
  sessionId?: number;
  eventType?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<SmallParcelAuditLog[]> {
  const db = await getDb();
  if (!db) return [];
  const { sessionId, eventType, userId, limit = 100, offset = 0 } = opts;
  const conditions = [];
  if (sessionId !== undefined) conditions.push(eq(smallParcelAuditLog.sessionId, sessionId));
  if (eventType) conditions.push(eq(smallParcelAuditLog.eventType, eventType));
  if (userId) conditions.push(eq(smallParcelAuditLog.userId, userId));
  const query = db
    .select()
    .from(smallParcelAuditLog)
    .orderBy(smallParcelAuditLog.createdAt)
    .limit(limit)
    .offset(offset);
  if (conditions.length > 0) {
    return query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as Promise<SmallParcelAuditLog[]>;
  }
  return query as Promise<SmallParcelAuditLog[]>;
}

export async function countSmallParcelAuditLog(opts: {
  sessionId?: number;
  eventType?: string;
  userId?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { sessionId, eventType, userId } = opts;
  const conditions = [];
  if (sessionId !== undefined) conditions.push(eq(smallParcelAuditLog.sessionId, sessionId));
  if (eventType) conditions.push(eq(smallParcelAuditLog.eventType, eventType));
  if (userId) conditions.push(eq(smallParcelAuditLog.userId, userId));
  const q = db.select({ count: sql<number>`count(*)` }).from(smallParcelAuditLog);
  const rows = conditions.length > 0
    ? await (q.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as ReturnType<typeof q.where>)
    : await q;
  return Number((rows as { count: number }[])[0]?.count ?? 0);
}

// ─── Supervisor PINs ─────────────────────────────────────────────────────────

export async function listSupervisorPins(): Promise<SupervisorPin[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supervisorPins).orderBy(supervisorPins.name);
}

export async function createSupervisorPin(data: InsertSupervisorPin): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(supervisorPins).values(data);
}

export async function updateSupervisorPin(id: number, data: Partial<InsertSupervisorPin>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(supervisorPins).set(data).where(eq(supervisorPins.id, id));
}

export async function deleteSupervisorPin(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(supervisorPins).where(eq(supervisorPins.id, id));
}

/** Returns the supervisor name if the PIN matches any active supervisor, null otherwise */
export async function verifySupervisorPin(pin: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const bcrypt = await import("bcryptjs");
  const rows = await db.select().from(supervisorPins).where(eq(supervisorPins.active, true));
  for (const row of rows) {
    const match = await bcrypt.compare(pin, row.pinHash);
    if (match) return row.name;
  }
  return null;
}

// ─── High-Value SKUs ─────────────────────────────────────────────────────────

export async function listHighValueSkus(): Promise<SmallParcelHighValueSku[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(smallParcelHighValueSkus).orderBy(smallParcelHighValueSkus.sku);
}

export async function addHighValueSku(data: InsertSmallParcelHighValueSku): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(smallParcelHighValueSkus).values(data);
}

export async function removeHighValueSku(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(smallParcelHighValueSkus).where(eq(smallParcelHighValueSkus.id, id));
}

/** Returns true if the given SKU (for the given clientName) is flagged as high-value */
export async function isHighValueSku(sku: string, clientName?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const upper = sku.toUpperCase();
  const rows = await db.select().from(smallParcelHighValueSkus);
  return rows.some(
    (r) =>
      r.sku.toUpperCase() === upper &&
      (r.clientName === null || r.clientName === undefined || r.clientName === clientName)
  );
}

// ─── TechShip Integration ────────────────────────────────────────────────────
export async function listTechshipConfigs(): Promise<TechshipConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(techshipConfigs).orderBy(techshipConfigs.locationName);
}

export async function getTechshipConfig(id: number): Promise<TechshipConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(techshipConfigs).where(eq(techshipConfigs.id, id));
  return rows[0] ?? null;
}

export async function upsertTechshipConfig(
  data: Omit<InsertTechshipConfig, "id" | "createdAt" | "updatedAt">,
  id?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (id) {
    await db.update(techshipConfigs).set({ ...data, updatedAt: new Date() }).where(eq(techshipConfigs.id, id));
  } else {
    await db.insert(techshipConfigs).values(data);
  }
}

export async function deleteTechshipConfig(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(techshipConfigs).where(eq(techshipConfigs.id, id));
}

// ─── Shipping Integration Active Selection ───────────────────────────────────
export async function getActiveShippingIntegration(category: "ltl" | "small_parcel"): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(shippingIntegrationSettings).where(eq(shippingIntegrationSettings.category, category));
  return rows[0]?.activeIntegration ?? null;
}

export async function setActiveShippingIntegration(category: "ltl" | "small_parcel", integration: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(shippingIntegrationSettings)
    .values({ category, activeIntegration: integration })
    .onDuplicateKeyUpdate({ set: { activeIntegration: integration } });
}

export async function getAllShippingIntegrationSettings(): Promise<ShippingIntegrationSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shippingIntegrationSettings);
}
