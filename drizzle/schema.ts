import {
  int,
  bigint,
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
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "partial", "mismatch", "failed"]),
  verificationDetail: json("verificationDetail"), // per-order verification results
  verifiedAt: timestamp("verifiedAt"),
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
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "partial", "mismatch", "failed"]),
  verificationDetail: json("verificationDetail"), // per-SKU verification results from Extensiv
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
  // ClearSight push tracking
  pushStatus: mysqlEnum("pushStatus", ["pending", "sent", "failed"]),
  pushAttempts: int("pushAttempts").notNull().default(0),
  pushError: text("pushError"),
  lastPushedAt: timestamp("lastPushedAt"),
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

// ─── QC Scanner ──────────────────────────────────────────────────────────────
// A QC scan session corresponds to one order/reference number being scanned
export const qcScanSessions = mysqlTable("qc_scan_sessions", {
  id: int("id").autoincrement().primaryKey(),
  referenceNumber: varchar("referenceNumber", { length: 128 }).notNull(),
  // Whether this session was started as a batch order
  isBatch: boolean("isBatch").notNull().default(false),
  // Optional batch — comma-separated reference numbers
  batchIdentifiers: text("batchIdentifiers"),
  warehouseId: int("warehouseId"),
  warehouseName: varchar("warehouseName", { length: 128 }),
  customerId: int("customerId"),
  customerName: varchar("customerName", { length: 256 }),
  destinationAddress: text("destinationAddress"),
  distributionCenter: varchar("distributionCenter", { length: 128 }),
  poNumber: varchar("poNumber", { length: 128 }),
  trackingNumber: varchar("trackingNumber", { length: 256 }),
  // Status: scanning | complete | shipped
  status: varchar("status", { length: 32 }).notNull().default("scanning"),
  // Whether the order was found in Extensiv (false = manual label)
  foundInExtensiv: boolean("foundInExtensiv").notNull().default(true),
  completedAt: timestamp("completedAt"),
  shippedAt: timestamp("shippedAt"),
  createdBy: varchar("createdBy", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QcScanSession = typeof qcScanSessions.$inferSelect;
export type InsertQcScanSession = typeof qcScanSessions.$inferInsert;

// Each expected SKU line item in a QC scan session
export const qcScanItems = mysqlTable("qc_scan_items", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  sku: varchar("sku", { length: 128 }).notNull(),
  upc: varchar("upc", { length: 128 }),
  description: varchar("description", { length: 512 }),
  lotNumber: varchar("lotNumber", { length: 128 }),
  expectedQty: int("expectedQty").notNull().default(0),
  scannedQty: int("scannedQty").notNull().default(0),
  caseAmount: int("caseAmount").notNull().default(1),
  // Individual scan timestamps stored as JSON array
  scanTimestamps: json("scanTimestamps"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QcScanItem = typeof qcScanItems.$inferSelect;
export type InsertQcScanItem = typeof qcScanItems.$inferInsert;

// Pallets created during a QC scan session
export const qcPallets = mysqlTable("qc_pallets", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  palletUpc: varchar("palletUpc", { length: 128 }),
  palletNumber: int("palletNumber").notNull().default(1),
  // JSON array of { sku, upc, qty } items on this pallet
  items: json("items"),
  builtAt: timestamp("builtAt").defaultNow(),
  shippedAt: timestamp("shippedAt"),
  deletedAt: timestamp("deletedAt"),
  // Optional dock photo captured during pallet shipping scan
  photoUrl: varchar("photoUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type QcPallet = typeof qcPallets.$inferSelect;
export type InsertQcPallet = typeof qcPallets.$inferInsert;

// Flagged scans — UPCs/SKUs that didn't match the expected order
export const qcFlaggedScans = mysqlTable("qc_flagged_scans", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId"),
  referenceNumber: varchar("referenceNumber", { length: 128 }),
  upc: varchar("upc", { length: 128 }),
  sku: varchar("sku", { length: 128 }),
  description: text("description"),
  flaggedBy: varchar("flaggedBy", { length: 256 }),
  // resolved | open
  status: varchar("status", { length: 32 }).notNull().default("open"),
  resolvedBy: varchar("resolvedBy", { length: 256 }),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type QcFlaggedScan = typeof qcFlaggedScans.$inferSelect;
export type InsertQcFlaggedScan = typeof qcFlaggedScans.$inferInsert;

// ─── Pallet Scanner (Shipping) ─────────────────────────────────────────────
// Tracks dock-door pallet scans when pallets are loaded onto trucks
export const palletScans = mysqlTable("pallet_scans", {
  id: int("id").autoincrement().primaryKey(),
  trackingNumber: varchar("trackingNumber", { length: 256 }).notNull(),
  doorNumber: varchar("doorNumber", { length: 64 }),
  warehouseName: varchar("warehouseName", { length: 256 }),
  carrierName: varchar("carrierName", { length: 256 }),
  referenceNumber: varchar("referenceNumber", { length: 256 }),
  notes: text("notes"),
  scannedBy: varchar("scannedBy", { length: 256 }),
  // pending | loaded | departed
  status: varchar("status", { length: 32 }).notNull().default("loaded"),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PalletScan = typeof palletScans.$inferSelect;
export type InsertPalletScan = typeof palletScans.$inferInsert;

// ─── SLA Facility Thresholds ──────────────────────────────────────────────────
// Per-warehouse configurable health thresholds for the SLA Tracker colour system.
// One row per facilityId. If no row exists, the global defaults (98/95) apply.
export const slaFacilityThresholds = mysqlTable("sla_facility_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  facilityId: int("facilityId").notNull().unique(),
  facilityName: varchar("facilityName", { length: 256 }).notNull(),
  // Minimum % of orders in SLA to show green (0–100, default 98)
  greenThreshold: int("greenThreshold").notNull().default(98),
  // Minimum % of orders in SLA to show yellow (0–100, default 95); below this is red
  yellowThreshold: int("yellowThreshold").notNull().default(95),
  notes: text("notes"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SlaFacilityThreshold = typeof slaFacilityThresholds.$inferSelect;
export type InsertSlaFacilityThreshold = typeof slaFacilityThresholds.$inferInsert;

// ─── SLA Daily Snapshots ──────────────────────────────────────────────────────
// One row per facility per calendar day. Captured by a nightly scheduler so the
// SLA Tracker can display a 7-day sparkline trend on each warehouse card.
export const slaDailySnapshots = mysqlTable("sla_daily_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  facilityId: int("facilityId").notNull(),
  facilityName: varchar("facilityName", { length: 256 }).notNull(),
  // ISO date string YYYY-MM-DD (UTC) for the snapshot day
  snapshotDate: varchar("snapshotDate", { length: 10 }).notNull(),
  inSlaCount: int("inSlaCount").notNull().default(0),
  totalCount: int("totalCount").notNull().default(0),
  // Stored as integer percentage 0–100 (rounded)
  slaRate: int("slaRate").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SlaDailySnapshot = typeof slaDailySnapshots.$inferSelect;
export type InsertSlaDailySnapshot = typeof slaDailySnapshots.$inferInsert;

// ─── Put Away Assistant ────────────────────────────────────────────────────
// Tracks each scan performed during a put-away session so operators can
// review what was put away and where during a receiving shift.
export const putAwayScans = mysqlTable("put_away_scans", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull(),       // FK to extensiv_configs
  facilityId: int("facilityId").notNull(),
  customerId: int("customerId").notNull(),
  customerName: varchar("customerName", { length: 256 }),
  sku: varchar("sku", { length: 256 }).notNull(),
  description: varchar("description", { length: 512 }),
  lotNumber: varchar("lotNumber", { length: 128 }),
  expirationDate: varchar("expirationDate", { length: 32 }),
  /** The location name the operator confirmed putting the item away to */
  confirmedLocation: varchar("confirmedLocation", { length: 256 }),
  /** The location type: pick_face | warehouse */
  confirmedLocationType: mysqlEnum("confirmedLocationType", ["pick_face", "warehouse", "staging"]),
  /** The top suggestion returned by the engine */
  suggestedLocation: varchar("suggestedLocation", { length: 256 }),
  suggestedLocationType: mysqlEnum("suggestedLocationType", ["pick_face", "warehouse", "staging"]),
  qty: int("qty").default(1).notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(), // client-generated UUID
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
});

export type PutAwayScan = typeof putAwayScans.$inferSelect;
export type InsertPutAwayScan = typeof putAwayScans.$inferInsert;

// ─── MU Labels ───────────────────────────────────────────────────────────────
export const muLabels = mysqlTable("mu_labels", {
  id: int("id").primaryKey().autoincrement(),
  configId: int("config_id").notNull(),
  transactionId: int("transaction_id").notNull(), // Extensiv receiver transactionId
  receiverItemId: int("receiver_item_id").notNull(), // Extensiv receiverItemId
  sku: varchar("sku", { length: 100 }).notNull(),
  muLabel: varchar("mu_label", { length: 100 }).notNull(), // e.g. MU-WH1-20260329-001
  muType: varchar("mu_type", { length: 50 }).notNull().default("Pallet"),
  qty: int("qty").notNull().default(1),
  syncedToExtensiv: boolean("synced_to_extensiv").notNull().default(false),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MuLabel = typeof muLabels.$inferSelect;
export type InsertMuLabel = typeof muLabels.$inferInsert;

// ─── Receipt Item Confirmations ───────────────────────────────────────────────
export const receiptItemConfirmations = mysqlTable("receipt_item_confirmations", {
  id: int("id").primaryKey().autoincrement(),
  configId: int("config_id").notNull(),
  transactionId: int("transaction_id").notNull(),
  receiverItemId: int("receiver_item_id").notNull(),
  sku: varchar("sku", { length: 100 }).notNull(),
  expectedQty: int("expected_qty").notNull(),
  confirmedQty: int("confirmed_qty").notNull(),
  /** "confirmed" | "adjusted" | "flagged" */
  status: varchar("status", { length: 20 }).notNull().default("confirmed"),
  note: text("note"),
  confirmedBy: varchar("confirmed_by", { length: 255 }),
  confirmedAt: bigint("confirmed_at", { mode: "number" }).notNull(),
});
export type ReceiptItemConfirmation = typeof receiptItemConfirmations.$inferSelect;
export type InsertReceiptItemConfirmation = typeof receiptItemConfirmations.$inferInsert;

// ─── Put Away Priority Config ─────────────────────────────────────────────────
export const putAwayPriority = mysqlTable("put_away_priority", {
  id: int("id").primaryKey().autoincrement(),
  configId: int("config_id").notNull(),
  facilityId: int("facility_id").notNull(),
  customerId: int("customer_id").notNull(),
  /** Aisle label extracted from location name, e.g. "A", "B", "HR" */
  aisle: varchar("aisle", { length: 50 }).notNull(),
  /** Level label extracted from location name, e.g. "1", "2", "A", or "*" for all */
  level: varchar("level", { length: 50 }).notNull().default("*"),
  /** Lower number = higher priority (1 = first pick) */
  priorityOrder: int("priority_order").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type PutAwayPriority = typeof putAwayPriority.$inferSelect;
export type InsertPutAwayPriority = typeof putAwayPriority.$inferInsert;

// ─── QC Scan and Label ────────────────────────────────────────────────────────
// Global settings for the label scan module (singleton — one row)
export const labelScanSettings = mysqlTable("label_scan_settings", {
  id: int("id").primaryKey().autoincrement(),
  // Print-and-apply machine network address
  printerIp: varchar("printerIp", { length: 128 }).notNull().default(""),
  printerPort: int("printerPort").notNull().default(9100),
  // GS1 Company Prefix for SSCC-18 generation
  gs1Prefix: varchar("gs1Prefix", { length: 32 }).notNull().default(""),
  // Human-readable label for the network folder path (informational only)
  labelFolderPath: varchar("labelFolderPath", { length: 512 }).notNull().default(""),
  // Optional API key for the /api/scan REST endpoint (vision system auth)
  scanApiKey: varchar("scanApiKey", { length: 256 }),
  // PLC integration settings
  // Protocol: 'modbus' (Modbus TCP, default) or 'enip' (EtherNet/IP, Allen-Bradley)
  plcProtocol: varchar("plcProtocol", { length: 16 }).notNull().default("modbus"),
  plcIp: varchar("plcIp", { length: 128 }).notNull().default(""),
  plcPort: int("plcPort").notNull().default(502),
  plcUnitId: int("plcUnitId").notNull().default(1),
  plcStubMode: boolean("plcStubMode").notNull().default(true),
  // EtherNet/IP specific: slot number (0 for ControlLogix backplane slot) and optional path
  enipSlot: int("enipSlot").notNull().default(0),
  enipPath: varchar("enipPath", { length: 256 }).notNull().default(""),
  // Allen-Bradley tag names for each PLC action (EtherNet/IP mode)
  enipTagBeltStop: varchar("enipTagBeltStop", { length: 128 }).notNull().default("GD_BeltStop"),
  enipTagTampFire: varchar("enipTagTampFire", { length: 128 }).notNull().default("GD_TampFire"),
  enipTagDivertOn: varchar("enipTagDivertOn", { length: 128 }).notNull().default("GD_DivertOn"),
  // Modbus coil addresses — Click! PLC map (v3 spec)
  // App → PLC write coils
  modbusCoilDivert: int("modbusCoilDivert").notNull().default(0),       // C1 DIVERT (auto-reset)
  modbusCoilBeltStop: int("modbusCoilBeltStop").notNull().default(1),   // C2 BELT_STOP
  modbusCoilTampFire: int("modbusCoilTampFire").notNull().default(2),   // C3 TAMP_FIRE
  modbusCoilStopPlate: int("modbusCoilStopPlate").notNull().default(3), // C4 STOP_PLATE
  modbusCoilSquareExtend: int("modbusCoilSquareExtend").notNull().default(4), // C5 SQUARE_EXTEND
  modbusCoilSquareRetract: int("modbusCoilSquareRetract").notNull().default(5), // C6 SQUARE_RETRACT
  // PLC → App read coils
  modbusCoilTampReady: int("modbusCoilTampReady").notNull().default(9),       // C10 TAMP_READY
  modbusCoilBeltRunning: int("modbusCoilBeltRunning").notNull().default(10),  // C11 BELT_RUNNING
  modbusCoilSquareConfirmed: int("modbusCoilSquareConfirmed").notNull().default(11), // C12 SQUARE_CONFIRMED
  modbusCoilSquareHome: int("modbusCoilSquareHome").notNull().default(12),    // C13 SQUARE_HOME
  // Modbus data registers (DS)
  modbusRegTampX: int("modbusRegTampX").notNull().default(0),   // DS1 TAMP_X (tenths of mm)
  modbusRegTampY: int("modbusRegTampY").notNull().default(1),   // DS2 TAMP_Y (tenths of mm)
  modbusRegEncoderPos: int("modbusRegEncoderPos").notNull().default(9), // DS10 ENCODER_POS (read)
  // Network topology — fixed IPs per v3 spec
  qcAppIp: varchar("qcAppIp", { length: 128 }).notNull().default("192.168.1.10"),
  edgeComputeIp: varchar("edgeComputeIp", { length: 128 }).notNull().default("192.168.1.20"),
  zebraIp: varchar("zebraIp", { length: 128 }).notNull().default("192.168.1.30"),
  lpaIp: varchar("lpaIp", { length: 128 }).notNull().default("192.168.1.50"),
  lpaPort: int("lpaPort").notNull().default(9200),
  // Squaring station config
  tampXMmFixed: decimal("tampXMmFixed", { precision: 8, scale: 2 }).notNull().default("120.00"), // fixed constant set at commissioning
  squaringTimeoutMs: int("squaringTimeoutMs").notNull().default(2000), // max ms to wait for SQUARE_CONFIRMED
  tampReadyTimeoutMs: int("tampReadyTimeoutMs").notNull().default(1000), // max ms to wait for TAMP_READY
  // Camera C — post-apply verification camera (downstream of tamp station)
  // Leave camCIp blank until hardware is installed; endpoint returns 503 when unconfigured
  camCIp: varchar("camCIp", { length: 128 }).notNull().default(""),
  camCPort: int("camCPort").notNull().default(8080),
  // Scan image retention policy (days). 0 = never purge.
  scanImageRetentionDays: int("scanImageRetentionDays").notNull().default(60),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LabelScanSettings = typeof labelScanSettings.$inferSelect;
export type InsertLabelScanSettings = typeof labelScanSettings.$inferInsert;

// Pre-uploaded ZPL label files indexed by manufacturer case barcode
export const labelFiles = mysqlTable("label_files", {
  id: int("id").primaryKey().autoincrement(),
  // The manufacturer barcode (ITF-14 or UPC-A) that identifies this carton
  barcode: varchar("barcode", { length: 128 }).notNull(),
  filename: varchar("filename", { length: 512 }).notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: varchar("s3Url", { length: 1024 }).notNull(),
  // Optional grouping: which session/batch these labels belong to
  batchName: varchar("batchName", { length: 256 }),
  // Extensiv transaction ID — used to scope labels to a specific order/session
  extensivTransactionId: varchar("extensivTransactionId", { length: 128 }),
  // Human-readable order reference (e.g. PO number)
  orderRef: varchar("orderRef", { length: 256 }),
  // Client / retailer these labels are for
  clientName: varchar("clientName", { length: 256 }),
  // Label type: ucc128 | fba | other
  labelType: varchar("labelType", { length: 32 }).notNull().default("ucc128"),
  uploadedBy: varchar("uploadedBy", { length: 256 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type LabelFile = typeof labelFiles.$inferSelect;
export type InsertLabelFile = typeof labelFiles.$inferInsert;

// A label scan session — one per production run on the automated line
export const labelScanSessions = mysqlTable("label_scan_sessions", {
  id: int("id").primaryKey().autoincrement(),
  // Extensiv transaction ID from the pack sheet barcode
  extensivTransactionId: varchar("extensivTransactionId", { length: 128 }),
  // Human-readable reference (e.g. order number or batch name)
  orderRef: varchar("orderRef", { length: 256 }).notNull(),
  clientName: varchar("clientName", { length: 256 }),
  expectedCartons: int("expectedCartons"),
  // active | stopped | complete
  status: varchar("status", { length: 32 }).notNull().default("active"),
  // Printer override for this session (falls back to global settings if null)
  printerIp: varchar("printerIp", { length: 128 }),
  printerPort: int("printerPort"),
  // Counts
  scannedCount: int("scannedCount").notNull().default(0),
  dispatchedCount: int("dispatchedCount").notNull().default(0),
  exceptionCount: int("exceptionCount").notNull().default(0),
  createdBy: varchar("createdBy", { length: 256 }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LabelScanSession = typeof labelScanSessions.$inferSelect;
export type InsertLabelScanSession = typeof labelScanSessions.$inferInsert;

// Each carton scanned during a label scan session
export const labelScanCartons = mysqlTable("label_scan_cartons", {
  id: int("id").primaryKey().autoincrement(),
  sessionId: int("sessionId").notNull(),
  // The barcode scanned on the carton (ITF-14 / UPC-A)
  barcode: varchar("barcode", { length: 128 }).notNull(),
  // FK to label_files — null if no matching label was found
  labelFileId: int("labelFileId"),
  // Dispatch result
  dispatched: boolean("dispatched").notNull().default(false),
  dispatchedAt: timestamp("dispatchedAt"),
  // Exception tracking
  hasException: boolean("hasException").notNull().default(false),
  // Reason codes: no_label | dispatch_failed | duplicate
  exceptionReason: varchar("exceptionReason", { length: 64 }),
  exceptionDetail: text("exceptionDetail"),
  exceptionResolvedBy: varchar("exceptionResolvedBy", { length: 256 }),
  exceptionResolvedAt: timestamp("exceptionResolvedAt"),
  // QC verification fields (same depth as existing QC Scanner)
  qcItemCount: int("qcItemCount"),
  qcPhotos: json("qcPhotos").$type<string[]>(),
  qcNotes: text("qcNotes"),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LabelScanCarton = typeof labelScanCartons.$inferSelect;
export type InsertLabelScanCarton = typeof labelScanCartons.$inferInsert;

// ─── Production Line (Automated QC Carton Line) ───────────────────────────────

// A production run defines the expected values for a batch of cartons on the automated line.
// All scans during the run are verified against these expected values.
export const productionRuns = mysqlTable("production_runs", {
  id: int("id").primaryKey().autoincrement(),
  runId: varchar("runId", { length: 64 }).notNull().unique(), // UUID assigned at start
  lineId: varchar("lineId", { length: 64 }).notNull().default("LINE-1"),
  operatorId: varchar("operatorId", { length: 256 }).notNull(),
  // Expected values — all scans verified against these
  expectedGtin: varchar("expectedGtin", { length: 20 }).notNull(),
  expectedLot: varchar("expectedLot", { length: 128 }).notNull(),
  expectedExpiry: varchar("expectedExpiry", { length: 10 }).notNull(), // ISO date YYYY-MM-DD
  // Configurable thresholds
  confidenceThreshold: decimal("confidenceThreshold", { precision: 4, scale: 3 }).notNull().default("0.850"),
  shelfLifeDaysMin: int("shelfLifeDaysMin"), // minimum days remaining before expiry is flagged
  holdConfidenceMin: decimal("holdConfidenceMin", { precision: 4, scale: 3 }), // confidence below this → hold (above fail threshold)
  // Tamp placement config
  tampDefaultX: decimal("tampDefaultX", { precision: 8, scale: 2 }), // mm from belt left edge
  tampDefaultY: decimal("tampDefaultY", { precision: 8, scale: 2 }), // mm from belt front edge
  // Status
  status: mysqlEnum("status", ["active", "closed", "aborted"]).notNull().default("active"),
  // Counters
  totalScanned: int("totalScanned").notNull().default(0),
  totalPass: int("totalPass").notNull().default(0),
  totalFail: int("totalFail").notNull().default(0),
  totalHold: int("totalHold").notNull().default(0),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProductionRun = typeof productionRuns.$inferSelect;
export type InsertProductionRun = typeof productionRuns.$inferInsert;

// Each carton scan event on the automated line — one record per carton
export const productionScans = mysqlTable("production_scans", {
  id: int("id").primaryKey().autoincrement(),
  scanId: varchar("scanId", { length: 64 }).notNull().unique(), // UUID from edge compute
  runId: varchar("runId", { length: 64 }).notNull(), // FK → production_runs.runId
  cartonId: varchar("cartonId", { length: 64 }).notNull(), // UUID from edge compute
  // Decoded barcode fields from GS1-128
  scannedGtin: varchar("scannedGtin", { length: 20 }),
  scannedLot: varchar("scannedLot", { length: 128 }),
  scannedExpiry: varchar("scannedExpiry", { length: 10 }), // YYYYMMDD as received
  scannedSerial: varchar("scannedSerial", { length: 128 }),
  poNumber: varchar("poNumber", { length: 128 }),
  // Vision system metadata
  skuBbox: json("skuBbox").$type<{ x_mm: number; y_mm: number; w_mm: number; h_mm: number } | null>(),
  camBClear: boolean("camBClear"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  // Verdict
  verdict: mysqlEnum("verdict", ["pass", "fail", "hold"]).notNull(),
  failReason: varchar("failReason", { length: 64 }), // GTIN_MISMATCH | LOT_MISMATCH | EXPIRED | EXPIRY_WINDOW | LOW_CONFIDENCE | STRAY_LABEL | NO_ACTIVE_RUN | NO_DECODE
  // Label / tamp output
  placement: mysqlEnum("placement", ["over_sku", "fixed_default"]),
  tampXMm: decimal("tampXMm", { precision: 8, scale: 2 }),
  tampYMm: decimal("tampYMm", { precision: 8, scale: 2 }),
  zplSent: text("zplSent"), // full ZPL string as sent to printer
  printedAt: timestamp("printedAt"),
  // Scan images stored in S3 — URLs populated after edge compute uploads via pre-signed URL
  camAImageUrl: varchar("camAImageUrl", { length: 1024 }), // Camera A: label/barcode face (pre-apply)
  camAImageKey: varchar("camAImageKey", { length: 512 }),  // S3 key for Camera A image
  camBImageUrl: varchar("camBImageUrl", { length: 1024 }), // Camera B: opposite face (pre-apply)
  camBImageKey: varchar("camBImageKey", { length: 512 }),  // S3 key for Camera B image
  // Camera C: post-apply verification (populated by /api/scan/post-apply)
  postApplyImageUrl: varchar("postApplyImageUrl", { length: 1024 }),
  postApplyImageKey: varchar("postApplyImageKey", { length: 512 }),
  postApplyReceivedAt: timestamp("postApplyReceivedAt"), // when Camera C image was received
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProductionScan = typeof productionScans.$inferSelect;
export type InsertProductionScan = typeof productionScans.$inferInsert;

// Per-SKU configuration for shelf-life windows and hold thresholds
export const productionSkuConfigs = mysqlTable("production_sku_configs", {
  id: int("id").primaryKey().autoincrement(),
  gtin: varchar("gtin", { length: 20 }).notNull().unique(),
  skuDescription: varchar("skuDescription", { length: 256 }),
  shelfLifeDaysMin: int("shelfLifeDaysMin").notNull().default(30), // fail if < this many days remaining
  holdConfidenceMin: decimal("holdConfidenceMin", { precision: 4, scale: 3 }).default("0.700"), // hold if confidence between this and fail threshold
  lotPattern: varchar("lotPattern", { length: 256 }), // optional regex for lot matching
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProductionSkuConfig = typeof productionSkuConfigs.$inferSelect;
export type InsertProductionSkuConfig = typeof productionSkuConfigs.$inferInsert;

// ─── QR Scanning Integration (Customer Carton Tracking) ───────────────────────
// Customer app configurations — one row per customer that has a tracking app
export const customerAppConfigs = mysqlTable("customer_app_configs", {
  id: int("id").primaryKey().autoincrement(),
  // Extensiv customer identifier (matches customerName on production runs)
  customerId: varchar("customerId", { length: 256 }).notNull().unique(),
  customerName: varchar("customerName", { length: 256 }).notNull(),
  // The customer's app endpoint that receives QR scan events
  appUrl: varchar("appUrl", { length: 1024 }).notNull(),
  // Optional bearer token or API key sent in Authorization header
  authHeader: varchar("authHeader", { length: 512 }),
  // Whether this customer's QR forwarding is globally active
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerAppConfig = typeof customerAppConfigs.$inferSelect;
export type InsertCustomerAppConfig = typeof customerAppConfigs.$inferInsert;

// A QR scanning session — one per production run (optional, only when QR scanning is enabled)
export const qrScanSessions = mysqlTable("qr_scan_sessions", {
  id: int("id").primaryKey().autoincrement(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique(), // UUID
  // Linked production run
  runId: varchar("runId", { length: 64 }).notNull(),
  lineId: varchar("lineId", { length: 64 }).notNull().default("LINE-1"),
  // Customer this session is forwarding to
  customerId: varchar("customerId", { length: 256 }).notNull(),
  customerName: varchar("customerName", { length: 256 }).notNull(),
  customerAppUrl: varchar("customerAppUrl", { length: 1024 }).notNull(),
  // active | paused | closed
  status: mysqlEnum("qr_session_status", ["active", "paused", "closed"]).notNull().default("active"),
  // Counters
  totalScanned: int("totalScanned").notNull().default(0),
  totalForwarded: int("totalForwarded").notNull().default(0),
  totalErrors: int("totalErrors").notNull().default(0),
  startedBy: varchar("startedBy", { length: 256 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QrScanSession = typeof qrScanSessions.$inferSelect;
export type InsertQrScanSession = typeof qrScanSessions.$inferInsert;

// Each QR code found on a carton during a QR scan session
export const qrScans = mysqlTable("qr_scans", {
  id: int("id").primaryKey().autoincrement(),
  qrScanId: varchar("qrScanId", { length: 64 }).notNull().unique(), // UUID
  sessionId: varchar("sessionId", { length: 64 }).notNull(), // FK → qr_scan_sessions.sessionId
  runId: varchar("runId", { length: 64 }).notNull(),
  // The carton this QR was found on (matches production_scans.cartonId)
  cartonId: varchar("cartonId", { length: 64 }),
  // Raw QR code data as decoded by the vision system
  qrData: text("qrData").notNull(),
  // Parsed fields (if the QR is structured, e.g. JSON or GS1)
  qrParsed: json("qrParsed").$type<Record<string, unknown> | null>(),
  // Camera that captured the QR (cam_a | cam_b | unknown)
  camera: varchar("camera", { length: 32 }).default("unknown"),
  // Forwarding status
  forwarded: boolean("forwarded").notNull().default(false),
  forwardedAt: timestamp("forwardedAt"),
  forwardAttempts: int("forwardAttempts").notNull().default(0),
  forwardError: text("forwardError"),
  // HTTP response from customer app (stored for audit)
  customerResponseStatus: int("customerResponseStatus"),
  customerResponseBody: text("customerResponseBody"),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type QrScan = typeof qrScans.$inferSelect;
export type InsertQrScan = typeof qrScans.$inferInsert;
