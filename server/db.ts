import { eq, desc, and } from "drizzle-orm";
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
  auditLogs,
  InsertAuditLog,
  customerRules,
  InsertCustomerRule,
  CustomerRule,
  scheduleConfigs,
  InsertScheduleConfig,
  ScheduleConfig,
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
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateAllocationRun(
  id: number,
  updates: Partial<AllocationRun>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(allocationRuns).set(updates).where(eq(allocationRuns.id, id));
}

export async function getAllocationRuns(limit = 50): Promise<AllocationRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(allocationRuns).orderBy(desc(allocationRuns.createdAt)).limit(limit);
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
  await db.insert(allocationRunOrders).values(items);
}

export async function getAllocationRunOrders(runId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(allocationRunOrders).where(eq(allocationRunOrders.runId, runId));
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
