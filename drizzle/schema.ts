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
  uniqueIndex,
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

// Order lifecycle tracking — the live pick schedule
// One row per order. Synced from Extensiv hourly. Removed when shipped/closed.
export const orderTracking = mysqlTable("order_tracking", {
  id: int("id").autoincrement().primaryKey(),
  // Extensiv identifiers
  extensivOrderId: int("extensivOrderId").notNull(),          // readOnly.orderId (Extensiv TX ID)
  referenceNum: varchar("referenceNum", { length: 256 }),     // customer's order ref
  poNum: varchar("poNum", { length: 256 }),
  // Customer / facility
  configId: int("configId").notNull(),
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 256 }).notNull(),
  facilityId: int("facilityId").notNull(),
  facilityName: varchar("facilityName", { length: 256 }),
  // Order details (refreshed on each sync)
  shipToName: varchar("shipToName", { length: 512 }),
  shipToCity: varchar("shipToCity", { length: 256 }),
  totalPieces: int("totalPieces").default(0),
  skuCount: int("skuCount").default(0),
  notes: text("notes"),
  savedElements: text("savedElements"),                       // JSON array of {name, value} from Extensiv savedElements
  extensivStatus: int("extensivStatus").default(0),           // raw Extensiv status code
  creationDate: varchar("creationDate", { length: 64 }),      // ISO string from Extensiv
  requiredShipDate: varchar("requiredShipDate", { length: 64 }), // earliestShipDate from Extensiv (ISO string)
  // Lifecycle status managed by GD Genius
  lifecycleStatus: mysqlEnum("lifecycleStatus", [
    "unallocated",
    "allocated",
    "picking",
    "qc",
    "qc_complete",
    "ship_ready",
  ]).notNull().default("unallocated"),
  // Associate assigned when order moves to Picking
  assignedAssociate: varchar("assignedAssociate", { length: 256 }),
  // Shipwell integration
  shipwellOrderId: varchar("shipwellOrderId", { length: 64 }),   // UUID returned by Shipwell PO
  shipwellShipmentId: varchar("shipwellShipmentId", { length: 64 }), // Shipwell Shipment ID
  shipwellPoUrl: varchar("shipwellPoUrl", { length: 512 }),       // Deep link to Shipwell PO
  shipwellShipmentUrl: varchar("shipwellShipmentUrl", { length: 512 }), // Deep link to Shipwell Shipment
  shipwellStatus: varchar("shipwellStatus", { length: 64 }),      // Live status from Shipwell: quoting, tendered, carrier_confirmed, in_transit, delivered
  shipwellBidCount: int("shipwellBidCount"),                       // Number of carrier bids when in Quoting status
  shipwellQuotingStartedAt: timestamp("shipwellQuotingStartedAt"),  // When order first entered Quoting status
  shipwellZeroBidNotifiedAt: timestamp("shipwellZeroBidNotifiedAt"), // When zero-bid alert was last sent (prevents duplicates)
  lastOverdueAlertSentAt: timestamp("lastOverdueAlertSentAt"),       // When overdue morning alert was last sent for this order
  // Per-order SLA extension (customer-requested later date)
  slaExtensionDays: int("slaExtensionDays").default(0),               // Extra days added to this order's SLA deadline
  slaExtensionNote: text("slaExtensionNote"),                         // Reason for extension (e.g. "Customer requested delay")
  shipwellSentAt: timestamp("shipwellSentAt"),                    // When it was sent to Shipwell
  shipwellStatusUpdatedAt: timestamp("shipwellStatusUpdatedAt"),  // Last time status was polled
  // Timestamps for each stage transition
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSyncedAt: timestamp("lastSyncedAt").defaultNow().notNull(),
  allocatedAt: timestamp("allocatedAt"),
  pickingAt: timestamp("pickingAt"),
  qcAt: timestamp("qcAt"),
  qcCompleteAt: timestamp("qcCompleteAt"),
  shipReadyAt: timestamp("shipReadyAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OrderTracking = typeof orderTracking.$inferSelect;
export type InsertOrderTracking = typeof orderTracking.$inferInsert;

// Shipwell TMS integration configuration
export const shipwellConfigs = mysqlTable("shipwell_configs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().default("Default"),
  email: varchar("email", { length: 320 }).notNull(),
  password: varchar("password", { length: 512 }).notNull(), // stored encrypted/hashed
  environment: mysqlEnum("environment", ["sandbox", "production"]).notNull().default("sandbox"),
  isActive: boolean("isActive").default(true).notNull(),
  // Cached auth token (refreshed on use)
  cachedToken: varchar("cachedToken", { length: 512 }),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShipwellConfig = typeof shipwellConfigs.$inferSelect;
export type InsertShipwellConfig = typeof shipwellConfigs.$inferInsert;

// SLA requirements per customer — default 2 days from Create Date
export const slaRequirements = mysqlTable("sla_requirements", {
  id: int("id").autoincrement().primaryKey(),
  // Extensiv customer (client) identifiers
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 256 }).notNull(),
  // Number of business days allowed from Create Date before SLA is breached
  slaDays: int("slaDays").notNull().default(2),
  // Optional notes / reason for custom SLA
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SlaRequirement = typeof slaRequirements.$inferSelect;
export type InsertSlaRequirement = typeof slaRequirements.$inferInsert;

// Additional named SLA rules per client (e.g. "Labeling", "B2B", "Kitting")
// Each rule overrides the base SLA for a specific order type / service
export const slaRules = mysqlTable("sla_rules", {
  id: int("id").autoincrement().primaryKey(),
  // FK to sla_requirements (the parent client row)
  requirementId: int("requirementId").notNull(),
  // Denormalised for display convenience
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 256 }).notNull(),
  // Human-readable rule label, e.g. "Labeling", "B2B", "Kitting"
  ruleName: varchar("ruleName", { length: 128 }).notNull(),
  // SLA days for this specific rule
  slaDays: int("slaDays").notNull().default(2),
  // Optional notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SlaRule = typeof slaRules.$inferSelect;
export type InsertSlaRule = typeof slaRules.$inferInsert;

// Zero-bid alert thresholds per shipping lane
// A "lane" is identified by origin facility + destination region/state
// Default threshold is 2 hours; can be overridden per lane
export const laneThresholds = mysqlTable("lane_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  // Human-readable lane name (e.g., "TOR → Ontario", "CAL → BC")
  laneName: varchar("laneName", { length: 256 }).notNull(),
  // Optional: origin facility code (e.g., "TOR-Toronto") — null means applies to all facilities
  facilityCode: varchar("facilityCode", { length: 64 }),
  // Optional: destination region/state filter — null means any destination
  destinationRegion: varchar("destinationRegion", { length: 128 }),
  // Hours before zero-bid alert fires (default 2)
  thresholdHours: int("thresholdHours").notNull().default(2),
  // Whether this threshold is active
  isActive: boolean("isActive").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LaneThreshold = typeof laneThresholds.$inferSelect;
export type InsertLaneThreshold = typeof laneThresholds.$inferInsert;

// Configurable notification alert settings (singleton row, key=value store)
export const alertSettings = mysqlTable("alert_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AlertSetting = typeof alertSettings.$inferSelect;
export type InsertAlertSetting = typeof alertSettings.$inferInsert;

// Client visibility settings — controls which clients appear in Open Orders view
// One row per (configId, clientId) pair. isVisible defaults to true.
// Clients not yet in this table are treated as visible.
export const clientVisibility = mysqlTable("client_visibility", {
  id: int("id").autoincrement().primaryKey(),
  // FK to extensiv_configs (warehouse config)
  configId: int("configId").notNull(),
  // Extensiv client ID (integer, matches orderTracking.clientId)
  clientId: int("clientId").notNull(),
  // Human-readable name cached from the last sync
  clientName: varchar("clientName", { length: 256 }).notNull(),
  // Whether this client's orders are shown in the Open Orders view
  isVisible: boolean("isVisible").notNull().default(true),
  // When true, the sync job will never override isVisible back to true
  isLocked: boolean("isLocked").notNull().default(false),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqConfigClient: uniqueIndex("client_visibility_config_client_idx").on(t.configId, t.clientId),
}));
export type ClientVisibility = typeof clientVisibility.$inferSelect;
export type InsertClientVisibility = typeof clientVisibility.$inferInsert;

// ─── Returns ──────────────────────────────────────────────────────────────────
// A returns session is opened when a user starts processing a return for a
// specific warehouse (configId) and customer (clientId). Items are scanned in
// one by one, then the session is closed/confirmed.
export const returnsSessions = mysqlTable("returns_sessions", {
  id: int("id").autoincrement().primaryKey(),
  // FK to extensiv_configs (warehouse)
  configId: int("configId").notNull(),
  warehouseName: varchar("warehouseName", { length: 256 }).notNull(),
  // Extensiv client ID
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 256 }).notNull(),
  // open | closed | cancelled
  status: mysqlEnum("status", ["open", "closed", "cancelled"]).notNull().default("open"),
  // Optional reference number (e.g. RMA number, tracking number)
  referenceNumber: varchar("referenceNumber", { length: 128 }),
  notes: text("notes"),
  // Who created the session
  createdByName: varchar("createdByName", { length: 256 }),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReturnsSession = typeof returnsSessions.$inferSelect;
export type InsertReturnsSession = typeof returnsSessions.$inferInsert;

// Each scanned item within a returns session
export const returnsItems = mysqlTable("returns_items", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  // SKU or barcode scanned
  sku: varchar("sku", { length: 256 }).notNull(),
  // Human-readable description (optional — filled in manually or via lookup)
  description: varchar("description", { length: 512 }),
  quantity: int("quantity").notNull().default(1),
  // Condition grade: new | good | damaged | unsellable
  condition: mysqlEnum("condition", ["new", "good", "damaged", "unsellable"]).notNull().default("good"),
  // Disposition: restock | quarantine | destroy | return_to_vendor
  disposition: mysqlEnum("disposition", ["restock", "quarantine", "destroy", "return_to_vendor"]).notNull().default("restock"),
  // Optional lot / serial number
  lotNumber: varchar("lotNumber", { length: 128 }),
  notes: text("notes"),
  // Scanned by (user name)
  scannedByName: varchar("scannedByName", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReturnsItem = typeof returnsItems.$inferSelect;
export type InsertReturnsItem = typeof returnsItems.$inferInsert;

// ─── GD Cortex Integration ─────────────────────────────────────────────────────
// Stores connection config for each connected Cortex platform (ClearSight, OpFi)
export const cortexConnections = mysqlTable("cortex_connections", {
  id: int("id").autoincrement().primaryKey(),
  // Which platform this connection is for: clearsight | opfi
  platform: varchar("platform", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 256 }).notNull().default(""),
  // Base URL of the remote platform (e.g. https://clearsight.godirectsolutions.com)
  baseUrl: varchar("baseUrl", { length: 512 }).notNull().default(""),
  // API key we use when calling the remote platform
  outboundApiKey: varchar("outboundApiKey", { length: 512 }).notNull().default(""),
  // API key the remote platform must send in X-API-Key when calling us
  inboundApiKey: varchar("inboundApiKey", { length: 512 }).notNull().default(""),
  // Webhook URL on the remote platform to POST events to
  webhookUrl: varchar("webhookUrl", { length: 512 }).notNull().default(""),
  // Polling interval in seconds (default 300 = 5 min)
  syncIntervalSeconds: int("syncIntervalSeconds").notNull().default(300),
  enabled: boolean("enabled").notNull().default(false),
  // Last successful health-check timestamp
  lastHealthCheck: timestamp("lastHealthCheck"),
  lastHealthStatus: varchar("lastHealthStatus", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CortexConnection = typeof cortexConnections.$inferSelect;
export type InsertCortexConnection = typeof cortexConnections.$inferInsert;

// Inbound return requests pushed from ClearSight to Genius
export const cortexReturns = mysqlTable("cortex_returns", {
  id: int("id").autoincrement().primaryKey(),
  // ClearSight's return identifier
  returnNumber: varchar("returnNumber", { length: 128 }).notNull(),
  // ClearSight's order UUID
  orderId: varchar("orderId", { length: 256 }),
  orderNumber: varchar("orderNumber", { length: 128 }),
  // Extensiv customer ID (shared key across all Cortex platforms)
  extensivCustomerId: int("extensivCustomerId"),
  customerId: varchar("customerId", { length: 256 }),
  customerName: varchar("customerName", { length: 256 }).notNull().default(""),
  reason: varchar("reason", { length: 256 }),
  // Full items array from ClearSight payload stored as JSON
  items: json("items"),
  shippingAddress: json("shippingAddress"),
  notes: text("notes"),
  // Status lifecycle: Received | Inspecting | Processed | Refunded | Rejected | Restocked
  status: varchar("status", { length: 64 }).notNull().default("Received"),
  // Inspection result filled in when session is closed
  inspectionResult: text("inspectionResult"),
  // Disposition: Restock | Quarantine | Destroy | Donate | ReturnToVendor
  disposition: varchar("disposition", { length: 64 }),
  refundAmount: decimal("refundAmount", { precision: 10, scale: 2 }),
  refundApproved: boolean("refundApproved"),
  processedBy: varchar("processedBy", { length: 256 }),
  processedAt: timestamp("processedAt"),
  // Link to the returns_sessions row created for this return (if any)
  returnsSessionId: int("returnsSessionId"),
  // Whether the outbound webhook has been fired for the latest status
  webhookSent: boolean("webhookSent").notNull().default(false),
  // ISO timestamp from ClearSight
  clearsightCreatedAt: timestamp("clearsightCreatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CortexReturn = typeof cortexReturns.$inferSelect;
export type InsertCortexReturn = typeof cortexReturns.$inferInsert;
