import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
  decimal,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Extensiv WMS API configuration per warehouse/client setup
export const extensivConfigs = mysqlTable("extensiv_configs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(), // friendly name e.g. "Main Warehouse"
  clientId: varchar("clientId", { length: 128 }).notNull(),
  clientSecret: varchar("clientSecret", { length: 256 }).notNull(),
  tplGuid: varchar("tplGuid", { length: 128 }).notNull(),
  userLoginId: int("userLoginId").notNull(),
  baseUrl: varchar("baseUrl", { length: 256 }).notNull().default("https://secure-wms.com"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExtensivConfig = typeof extensivConfigs.$inferSelect;
export type InsertExtensivConfig = typeof extensivConfigs.$inferInsert;

// Location type mapping: maps Extensiv location IDs to staging/pick_face/warehouse
export const locationConfigs = mysqlTable("location_configs", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull(), // FK to extensiv_configs
  customerId: int("customerId").notNull(),
  customerName: varchar("customerName", { length: 256 }),
  facilityId: int("facilityId").notNull(),
  facilityName: varchar("facilityName", { length: 256 }),
  locationId: int("locationId").notNull(),
  locationName: varchar("locationName", { length: 256 }).notNull(),
  locationType: mysqlEnum("locationType", ["staging", "pick_face", "warehouse"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LocationConfig = typeof locationConfigs.$inferSelect;
export type InsertLocationConfig = typeof locationConfigs.$inferInsert;

// Per-customer allocation rules (one row per customer per config)
export const customerRules = mysqlTable("customer_rules", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull(),
  customerId: int("customerId").notNull(),
  customerName: varchar("customerName", { length: 256 }),
  facilityId: int("facilityId"),          // facility this customer belongs to
  facilityName: varchar("facilityName", { length: 256 }),
  noLotMixing: boolean("noLotMixing").default(false).notNull(), // Prevent multiple lot codes on the same order line
  autoRun: boolean("autoRun").default(false).notNull(),         // Include in scheduled auto-run
  /**
   * Ordered list of location-name prefix/substring patterns.
   * Locations whose names match an earlier pattern are sorted before those
   * matching a later pattern. Locations not matching any pattern come last.
   * Example: [{"pattern":"12","label":"Building 12"},{"pattern":"RCV12","label":"Receiving 12"}]
   */
  locationPriorityPatterns: json("locationPriorityPatterns").$type<Array<{ pattern: string; label: string }>>().default([]),
  /**
   * Patterns for locations to EXCLUDE from allocation entirely.
   * Any inventory record whose location name matches one of these patterns
   * is filtered out before FEFO sorting. Used to exclude a building or zone.
   * Example: [{"pattern":"^1[01]","label":"Building 1 (exclude)"}]
   */
  locationExclusionPatterns: json("locationExclusionPatterns").$type<Array<{ pattern: string; label: string }>>().default([]),
  notes: text("notes"),                                         // Free-form allocation notes / instructions
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerRule = typeof customerRules.$inferSelect;
export type InsertCustomerRule = typeof customerRules.$inferInsert;

// Allocation run header
export const allocationRuns = mysqlTable("allocation_runs", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull(),
  customerId: int("customerId"),  // nullable for multi-customer runs; use customerNames instead
  customerName: varchar("customerName", { length: 256 }),
  customerNames: text("customerNames"),  // JSON array of customer names for multi-customer runs
  facilityId: int("facilityId").notNull(),
  facilityName: varchar("facilityName", { length: 256 }),
  status: mysqlEnum("status", ["proposed", "confirmed", "cancelled", "failed", "unallocated"]).notNull().default("proposed"),
  orderCount: int("orderCount").default(0),
  allocatedCount: int("allocatedCount").default(0),
  skippedCount: int("skippedCount").default(0),
  notes: text("notes"),
  pullList: json("pullList"),  // global pull list (SKU-level movements) for this run
  createdBy: int("createdBy"), // FK to users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  confirmedAt: timestamp("confirmedAt"),
  documentsPrintedAt: timestamp("documentsPrintedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AllocationRun = typeof allocationRuns.$inferSelect;
export type InsertAllocationRun = typeof allocationRuns.$inferInsert;

// Per-order allocation detail within a run
export const allocationRunOrders = mysqlTable("allocation_run_orders", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  orderId: int("orderId").notNull(),
  referenceNum: varchar("referenceNum", { length: 256 }),
  poNum: varchar("poNum", { length: 256 }),
  shipToName: varchar("shipToName", { length: 512 }),
  status: mysqlEnum("status", ["allocated", "skipped", "failed", "unallocated"]).notNull(),
  skipReason: text("skipReason"),
  allocationDetail: json("allocationDetail"), // full proposed allocation JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AllocationRunOrder = typeof allocationRunOrders.$inferSelect;
export type InsertAllocationRunOrder = typeof allocationRunOrders.$inferInsert;

// Audit log for all significant actions
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 64 }),
  entityId: varchar("entityId", { length: 64 }),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Schedule configuration for auto-run
export const scheduleConfigs = mysqlTable("schedule_configs", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull(),     // FK to extensiv_configs
  isEnabled: boolean("isEnabled").default(false).notNull(),
  cronExpression: varchar("cronExpression", { length: 128 }).notNull().default("0 0 8,12,16 * * *"), // default: 8am, noon, 4pm
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/New_York"),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 32 }),
  lastRunSummary: text("lastRunSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduleConfig = typeof scheduleConfigs.$inferSelect;
export type InsertScheduleConfig = typeof scheduleConfigs.$inferInsert;
