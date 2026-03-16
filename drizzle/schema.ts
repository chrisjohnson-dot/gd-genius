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

// Allocation run header
export const allocationRuns = mysqlTable("allocation_runs", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull(),
  customerId: int("customerId").notNull(),
  customerName: varchar("customerName", { length: 256 }),
  facilityId: int("facilityId").notNull(),
  facilityName: varchar("facilityName", { length: 256 }),
  status: mysqlEnum("status", ["proposed", "confirmed", "cancelled", "failed"]).notNull().default("proposed"),
  orderCount: int("orderCount").default(0),
  allocatedCount: int("allocatedCount").default(0),
  skippedCount: int("skippedCount").default(0),
  notes: text("notes"),
  createdBy: int("createdBy"), // FK to users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  confirmedAt: timestamp("confirmedAt"),
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
  status: mysqlEnum("status", ["allocated", "skipped", "failed"]).notNull(),
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
