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

// Carrier routing table — ZIP-level pre-computed routing guide
// Tells the Rate Wizard which carrier/service to use (priority A=best) for each warehouse + ZIP
export const carrierRoutingTable = mysqlTable("carrier_routing_table", {
  id: int("id").autoincrement().primaryKey(),
  warehouse: varchar("warehouse", { length: 64 }).notNull(),   // e.g. "COL-Columbus"
  shippingMethod: varchar("shipping_method", { length: 64 }), // e.g. "Ground"
  carrier: varchar("carrier", { length: 64 }).notNull(),       // e.g. "FEDEX ONE RATE"
  serviceLevel: varchar("service_level", { length: 128 }),     // e.g. "Two Day One Rate"
  zipCode: int("zip_code").notNull(),                          // 5-digit ZIP as integer
  cost: decimal("cost", { precision: 8, scale: 2 }),           // pre-computed rate
  priority: varchar("priority", { length: 4 }).notNull(),      // "A" | "B" | "C" | "D"
  clientName: varchar("client_name", { length: 128 }),         // null = applies to all clients
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CarrierRoutingEntry = typeof carrierRoutingTable.$inferSelect;
export type InsertCarrierRoutingEntry = typeof carrierRoutingTable.$inferInsert;

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
  // Outbound staging details (set when order moves to ship_ready)
  outboundLocation: varchar("outboundLocation", { length: 256 }),  // e.g. "Door 3", "Staging-A"
  palletCount: int("palletCount").default(0),                       // number of pallets for this order
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

// Ship-to-specific SLA overrides per client
// Each row defines a custom SLA day count for a specific ship-to customer name
export const slaShipToRules = mysqlTable("sla_ship_to_rules", {
  id: int("id").autoincrement().primaryKey(),
  // Parent client (Extensiv customer)
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 256 }).notNull(),
  // Ship-to customer name (free-text, matched against order shipTo.companyName)
  shipToName: varchar("shipToName", { length: 256 }).notNull(),
  // SLA days for this specific ship-to
  slaDays: int("slaDays").notNull().default(2),
  // Optional notes / reason
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SlaShipToRule = typeof slaShipToRules.$inferSelect;
export type InsertSlaShipToRule = typeof slaShipToRules.$inferInsert;

// Zero-bid alert thresholds per shipping lanee
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
  // Channel classification: b2b = wholesale/retail, d2c = direct-to-consumer, both = show in both views
  orderChannel: mysqlEnum("orderChannel", ["b2b", "d2c", "both"]).notNull().default("both"),
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
  // Extensiv facility (physical warehouse location)
  facilityId: int("facilityId"),
  facilityName: varchar("facilityName", { length: 256 }),
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
  // Client approval — only populated for restock items sent to ClearSight for approval
  // pending = awaiting client response | approved = client approved restock
  // rejected = client rejected restock | questioned = client has a question
  // flagged = client flagged for follow-up
  clientApprovalStatus: mysqlEnum("clientApprovalStatus", [
    "pending",
    "approved",
    "rejected",
    "questioned",
    "flagged",
  ]),
  // Free-text note from the client alongside their approval decision
  clientApprovalNote: text("clientApprovalNote"),
  // Timestamp when ClearSight last updated the approval status
  clientApprovalUpdatedAt: timestamp("clientApprovalUpdatedAt"),
  // UPC barcode auto-detected by the scan station camera
  upcCode: varchar("upcCode", { length: 64 }),
  // JSON array of S3 photo URLs captured by the scan station (all angles)
  photos: text("photos"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReturnsItem = typeof returnsItems.$inferSelect;
export type InsertReturnsItem = typeof returnsItems.$inferInsert;

/**
 * Client instructions sent from ClearSight back to GD Genius associates.
 * Each row is a single message from the client about a specific return item
 * (or the session as a whole when itemId is null).
 * Associates see a red badge counter for unread instructions in the Returns section.
 */
export const returnClientInstructions = mysqlTable("return_client_instructions", {
  id: int("id").autoincrement().primaryKey(),
  // The returns session this instruction belongs to
  sessionId: int("sessionId").notNull(),
  // The specific item this instruction is about (null = session-level instruction)
  itemId: int("itemId"),
  // Extensiv client ID (so we can filter by client)
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 256 }).notNull().default(""),
  // The instruction message from the client
  message: text("message").notNull(),
  // The approval decision that triggered this instruction (if any)
  approvalStatus: mysqlEnum("approvalStatus", [
    "approved",
    "rejected",
    "questioned",
    "flagged",
  ]),
  // Whether the associate has read/acknowledged this instruction
  isRead: boolean("isRead").notNull().default(false),
  readAt: timestamp("readAt"),
  readByName: varchar("readByName", { length: 256 }),
  // Source identifier from ClearSight (for idempotency)
  clearsightInstructionId: varchar("clearsightInstructionId", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReturnClientInstruction = typeof returnClientInstructions.$inferSelect;
export type InsertReturnClientInstruction = typeof returnClientInstructions.$inferInsert;

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
  // Pallet ownership type: customer_owned | gd_owned | chep
  palletType: varchar("palletType", { length: 32 }),
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
  /** Extensiv receiver transactionId — used to join with mu_labels */
  transactionId: int("transactionId"),
  /** Human-readable warehouse name (cached) */
  facilityName: varchar("facilityName", { length: 256 }),
  /** How the put-away was committed: 'extensiv' = Genius moved it, 'scan' = operator will scan */
  commitMode: mysqlEnum("commitMode", ["extensiv", "scan"]).default("scan"),
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
  /** Name of the supervisor who last saved this priority config */
  updatedBy: varchar("updated_by", { length: 255 }),
});
export type PutAwayPriority = typeof putAwayPriority.$inferSelect;
export type InsertPutAwayPriority = typeof putAwayPriority.$inferInsert;

// ─── WH Location Config ───────────────────────────────────────────────────────
// Stores the aisle/level numbering structure for each warehouse (facility).
// One row per configId+facilityId combination; aisleRules stored as JSON.
export const whLocationConfigs = mysqlTable("wh_location_configs", {
  id: int("id").primaryKey().autoincrement(),
  /** Extensiv config ID this belongs to */
  configId: int("config_id").notNull(),
  /** Extensiv facility ID */
  facilityId: int("facility_id").notNull(),
  /** Human-readable warehouse name (cached for display) */
  facilityName: varchar("facility_name", { length: 255 }).notNull().default(""),
  /**
   * JSON array of aisle rules:
   * [{ aislePrefix: string, levels: string[], description?: string }]
   */
  aisleRules: text("aisle_rules").notNull(),
  /** Optional free-text notes about this warehouse's numbering scheme */
  notes: text("notes"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  updatedBy: varchar("updated_by", { length: 255 }),
});
export type WhLocationConfig = typeof whLocationConfigs.$inferSelect;
export type InsertWhLocationConfig = typeof whLocationConfigs.$inferInsert;

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

// ── SLA Snapshots ─────────────────────────────────────────────────────────────
export const slaSnapshots = mysqlTable("sla_snapshots", {
  id: int("id").primaryKey().autoincrement(),
  snapshotDate: varchar("snapshotDate", { length: 10 }).notNull(), // YYYY-MM-DD
  orderId: int("orderId").notNull(),
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 120 }).notNull(),
  poNum: varchar("poNum", { length: 80 }).default(""),
  refNum: varchar("refNum", { length: 80 }).default(""),
  creation: varchar("creation", { length: 10 }).default(""), // YYYY-MM-DD
  company: varchar("company", { length: 160 }).default(""),
  notes: text("notes"),
  facility: varchar("facility", { length: 80 }).default(""),
  fullyAllocated: boolean("fullyAllocated").notNull().default(false),
  rule: varchar("rule", { length: 255 }).notNull(),
  slaDate: varchar("slaDate", { length: 10 }), // YYYY-MM-DD or null
  outOfSla: boolean("outOfSla").notNull().default(false),
  alwaysFlag: boolean("alwaysFlag").notNull().default(false),
  flagNote: varchar("flagNote", { length: 255 }),
  bizDaysLate: int("bizDaysLate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SlaSnapshot = typeof slaSnapshots.$inferSelect;
export type InsertSlaSnapshot = typeof slaSnapshots.$inferInsert;

// ── SLA Order Actions (Remove / Waive) ────────────────────────────────────────
// Tracks every Remove or Waive action taken on an out-of-SLA order, with the
// user who made the change and the mandatory reason they entered.
export const slaOrderActions = mysqlTable("sla_order_actions", {
  id: int("id").primaryKey().autoincrement(),
  extensivOrderId: int("extensivOrderId").notNull(),          // FK → order_tracking.extensivOrderId
  referenceNum: varchar("referenceNum", { length: 256 }),     // denormalised for display
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 256 }).notNull(),
  facilityId: int("facilityId").notNull(),
  facilityName: varchar("facilityName", { length: 256 }),
  action: mysqlEnum("action", ["remove", "waive"]).notNull(),
  reason: text("reason").notNull(),
  performedByUserId: varchar("performedByUserId", { length: 128 }).notNull(),
  performedByName: varchar("performedByName", { length: 256 }),
  performedAt: timestamp("performedAt").defaultNow().notNull(),
});
export type SlaOrderAction = typeof slaOrderActions.$inferSelect;
export type InsertSlaOrderAction = typeof slaOrderActions.$inferInsert;

// ── Small Parcel Sessions ─────────────────────────────────────────────────────
// Tracks each pack-and-ship session in the Small Parcel workflow.
// A session is created when a pick ticket is scanned and closed when the label
// is purchased and printed.
export const smallParcelSessions = mysqlTable("small_parcel_sessions", {
  id: int("id").primaryKey().autoincrement(),
  configId: int("configId").notNull(),
  facilityId: int("facilityId").notNull(),
  facilityName: varchar("facilityName", { length: 256 }),
  // Extensiv order fields
  extensivOrderId: int("extensivOrderId"),
  referenceNum: varchar("referenceNum", { length: 256 }),
  pickTicketNum: varchar("pickTicketNum", { length: 256 }),
  clientId: int("clientId"),
  clientName: varchar("clientName", { length: 256 }),
  // Ship-to address (denormalised from Extensiv at scan time)
  shipToName: varchar("shipToName", { length: 256 }),
  shipToAddress1: varchar("shipToAddress1", { length: 512 }),
  shipToCity: varchar("shipToCity", { length: 128 }),
  shipToState: varchar("shipToState", { length: 64 }),
  shipToZip: varchar("shipToZip", { length: 32 }),
  shipToCountry: varchar("shipToCountry", { length: 64 }),
  // Scanned items (JSON array of { sku, qty, scanned })
  scannedItems: json("scannedItems"),
  // Veeqo label result (populated after Pack & Ship)
  veeqoShipmentId: int("veeqoShipmentId"),
  veeqoCarrierService: varchar("veeqoCarrierService", { length: 256 }),
  veeqoLabelUrl: varchar("veeqoLabelUrl", { length: 1024 }),
  veeqoTrackingNumber: varchar("veeqoTrackingNumber", { length: 256 }),
  veeqoLabelCost: decimal("veeqoLabelCost", { precision: 10, scale: 2 }),
  // ZPL label content for direct Zebra printer reprint
  labelZpl: text("labelZpl"),
  // Selected package size (from per-client package size config)
  selectedPackageSizeId: int("selectedPackageSizeId"),
  selectedPackageSizeName: varchar("selectedPackageSizeName", { length: 128 }),
  // Package dimensions (optional, for rate shopping)
  weightKg: decimal("weightKg", { precision: 8, scale: 3 }),
  lengthCm: decimal("lengthCm", { precision: 8, scale: 2 }),
  widthCm: decimal("widthCm", { precision: 8, scale: 2 }),
  heightCm: decimal("heightCm", { precision: 8, scale: 2 }),
  // Session lifecycle
  status: mysqlEnum("status", ["scanning", "ready", "label_purchased", "cancelled", "voided"]).notNull().default("scanning"),
  packedAt: timestamp("packedAt"),
  labelPurchasedAt: timestamp("labelPurchasedAt"),
  // Void tracking — populated when a purchased label is voided at the carrier
  voidedAt: timestamp("voidedAt"),
  voidReason: varchar("voidReason", { length: 512 }),
  // Extensiv write-back status
  extensivPackedAt: timestamp("extensivPackedAt"),
  extensivShippedAt: timestamp("extensivShippedAt"),
  createdByUserId: varchar("createdByUserId", { length: 128 }),
  createdByName: varchar("createdByName", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SmallParcelSession = typeof smallParcelSessions.$inferSelect;
export type InsertSmallParcelSession = typeof smallParcelSessions.$inferInsert;

// ─── Small Parcel Package Sizes ───────────────────────────────────────────────
// Per-client configurable package sizes shown as buttons in the Pack & Ship flow.
// clientId = 0 means "all clients" (global default).
export const smallParcelPackageSizes = mysqlTable("small_parcel_package_sizes", {
  id: int("id").primaryKey().autoincrement(),
  /** Extensiv customer ID — 0 means global default for all clients */
  clientId: int("clientId").notNull().default(0),
  clientName: varchar("clientName", { length: 256 }).notNull().default("All Clients"),
  /** Display label shown on the button */
  name: varchar("name", { length: 128 }).notNull(),
  /** Optional: dimensions in cm for auto-fill */
  lengthCm: decimal("lengthCm", { precision: 8, scale: 2 }),
  widthCm: decimal("widthCm", { precision: 8, scale: 2 }),
  heightCm: decimal("heightCm", { precision: 8, scale: 2 }),
  /** Optional: weight in kg for auto-fill */
  weightKg: decimal("weightKg", { precision: 8, scale: 3 }),
  /** Sort order for button display */
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SmallParcelPackageSize = typeof smallParcelPackageSizes.$inferSelect;
export type InsertSmallParcelPackageSize = typeof smallParcelPackageSizes.$inferInsert;

// ─── Small Parcel Audit Log ───────────────────────────────────────────────────
// Tracks all notable events during the Small Parcel Pack & Ship workflow,
// including manual item overrides, label purchases, reprints, and carrier changes.
export const smallParcelAuditLog = mysqlTable("small_parcel_audit_log", {
  id: int("id").primaryKey().autoincrement(),
  /** FK to small_parcel_sessions */
  sessionId: int("sessionId").notNull(),
  /** Extensiv Transaction ID */
  extensivOrderId: int("extensivOrderId"),
  /** Client / customer name for display */
  clientName: varchar("clientName", { length: 256 }),
  /**
   * Event type:
   *   manual_override  — operator confirmed item without scanning
   *   label_purchased  — label was purchased (stub or real)
   *   reprint          — label was reprinted
   *   carrier_changed  — operator changed carrier/service from the default
   *   scan_error       — barcode scan returned an unknown SKU
   */
  eventType: varchar("eventType", { length: 64 }).notNull(),
  /** SKU involved (for manual_override, scan_error) */
  sku: varchar("sku", { length: 128 }),
  /** Quantity involved */
  qty: int("qty"),
  /** Tracking number (for label_purchased, reprint) */
  trackingNumber: varchar("trackingNumber", { length: 256 }),
  /** Carrier name (for carrier_changed) */
  carrier: varchar("carrier", { length: 128 }),
  /** Manus user ID */
  userId: varchar("userId", { length: 128 }),
  /** Display name of the user */
  userName: varchar("userName", { length: 256 }),
  /** Optional freeform notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SmallParcelAuditLog = typeof smallParcelAuditLog.$inferSelect;
export type InsertSmallParcelAuditLog = typeof smallParcelAuditLog.$inferInsert;

// ─── Small Parcel: Supervisor PINs ───────────────────────────────────────────
// Stores bcrypt-hashed PINs for supervisors who can approve manual overrides.
export const supervisorPins = mysqlTable("supervisor_pins", {
  id: int("id").autoincrement().primaryKey(),
  /** Display name of the supervisor */
  name: varchar("name", { length: 256 }).notNull(),
  /** bcrypt hash of the 4–8 digit PIN */
  pinHash: varchar("pinHash", { length: 256 }).notNull(),
  /** Optional Manus user ID to link to a logged-in user */
  userId: varchar("userId", { length: 128 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupervisorPin = typeof supervisorPins.$inferSelect;
export type InsertSupervisorPin = typeof supervisorPins.$inferInsert;

// ─── Small Parcel: High-Value SKUs ───────────────────────────────────────────
// SKUs that require supervisor PIN approval before a manual override is accepted.
export const smallParcelHighValueSkus = mysqlTable("small_parcel_high_value_skus", {
  id: int("id").autoincrement().primaryKey(),
  /** SKU identifier (uppercase) */
  sku: varchar("sku", { length: 128 }).notNull(),
  /** Optional: restrict to a specific client (null = all clients) */
  clientName: varchar("clientName", { length: 256 }),
  /** Optional description / reason for flagging */
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SmallParcelHighValueSku = typeof smallParcelHighValueSkus.$inferSelect;
export type InsertSmallParcelHighValueSku = typeof smallParcelHighValueSkus.$inferInsert;

// ─── TechShip Integration ────────────────────────────────────────────────────
export const techshipConfigs = mysqlTable("techship_configs", {
  id: int("id").autoincrement().primaryKey(),
  locationName: varchar("location_name", { length: 100 }).notNull(),
  baseUrl: varchar("base_url", { length: 255 }).notNull(),
  apiKey: varchar("api_key", { length: 255 }).notNull(),
  apiSecret: varchar("api_secret", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type TechshipConfig = typeof techshipConfigs.$inferSelect;
export type InsertTechshipConfig = typeof techshipConfigs.$inferInsert;

// ─── Shipping Integration Active Selection ───────────────────────────────────
export const shippingIntegrationSettings = mysqlTable("shipping_integration_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** 'ltl' or 'small_parcel' */
  category: varchar("category", { length: 50 }).notNull().unique(),
  /** e.g. 'shipwell' for LTL, 'techship' or 'veeqo' for small parcel */
  activeIntegration: varchar("active_integration", { length: 50 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ShippingIntegrationSetting = typeof shippingIntegrationSettings.$inferSelect;

// ─── Small Parcel Settings ────────────────────────────────────────────────────
export const smallParcelSettings = mysqlTable("small_parcel_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: varchar("setting_value", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type SmallParcelSetting = typeof smallParcelSettings.$inferSelect;

// ─── Client Packaging Enabled Types ──────────────────────────────────────────
// Stores which Extensiv packaging types (PackageUnit / Pallet) are enabled per
// client for use in Pack & Ship and QC workflows.
export const clientPackagingEnabled = mysqlTable(
  "client_packaging_enabled",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Extensiv config ID */
    configId: int("configId").notNull(),
    /** Extensiv customer ID */
    clientId: int("clientId").notNull(),
    /** Customer display name (denormalised for convenience) */
    clientName: varchar("clientName", { length: 256 }).notNull(),
    /** 'package_unit' or 'pallet' */
    category: varchar("category", { length: 32 }).notNull(),
    /** Extensiv type name, e.g. "Carton", "Master carton", "Pallet" */
    typeName: varchar("typeName", { length: 128 }).notNull(),
    /** Whether this type is enabled (shown as a button) */
    enabled: boolean("enabled").notNull().default(true),
    /** Sort order for button display */
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqConfigClientType: uniqueIndex("cpe_config_client_cat_type_idx").on(
      t.configId,
      t.clientId,
      t.category,
      t.typeName
    ),
  })
);
export type ClientPackagingEnabled = typeof clientPackagingEnabled.$inferSelect;
export type InsertClientPackagingEnabled = typeof clientPackagingEnabled.$inferInsert;

// ─── Packaging Inventory ──────────────────────────────────────────────────────
export const packagingInventory = mysqlTable("packaging_inventory", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull(),
  facilityId: int("facilityId").notNull().default(0),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["envelope", "box", "pallet"]).notNull(),
  unit: varchar("unit", { length: 64 }).notNull().default("each"),
  onHandQty: int("onHandQty").notNull().default(0),
  minStockLevel: int("minStockLevel").notNull().default(0),
  weeklyConsumption: int("weeklyConsumption").notNull().default(0),
  notes: text("notes"),
  isCustom: boolean("isCustom").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PackagingInventoryItem = typeof packagingInventory.$inferSelect;
export type InsertPackagingInventoryItem = typeof packagingInventory.$inferInsert;

export const packagingReorderRequests = mysqlTable("packaging_reorder_requests", {
  id: int("id").autoincrement().primaryKey(),
  inventoryItemId: int("inventoryItemId").notNull(),
  configId: int("configId").notNull(),
  requestedQty: int("requestedQty").notNull(),
  notes: text("notes"),
  requestedByUserId: int("requestedByUserId").notNull(),
  requestedByName: varchar("requestedByName", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "ordered", "received", "cancelled"]).notNull().default("pending"),
  fulfilledAt: timestamp("fulfilledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PackagingReorderRequest = typeof packagingReorderRequests.$inferSelect;
export type InsertPackagingReorderRequest = typeof packagingReorderRequests.$inferInsert;

// ─── Rate Wizard ─────────────────────────────────────────────────────────────
// Supported carrier codes. US-only carriers are marked; CA carriers include
// Canadian-specific options (Canpar, Purolator, Canada Post, GLS Canada).
export const rateWizardCarrierEnum = mysqlEnum("carrier_code", [
  "usps", "fedex", "ups", "ontrac", "dhl_express",
  "canpar", "purolator", "canada_post", "gls_canada",
  "other",
]);

/**
 * Carrier accounts — one row per carrier per warehouse location.
 * Credentials are stored encrypted-at-rest by the DB; never returned to the
 * frontend in plain text (the tRPC procedure masks them).
 */
export const rateWizardCarrierAccounts = mysqlTable("rate_wizard_carrier_accounts", {
  id: int("id").autoincrement().primaryKey(),
  /** Human-readable name, e.g. "FedEx — Calgary" */
  name: varchar("name", { length: 120 }).notNull(),
  /** Warehouse location identifier matching techship_configs.location_name */
  locationId: varchar("location_id", { length: 100 }).notNull(),
  /** ISO 3166-1 alpha-2 country of the origin address, e.g. "US" or "CA" */
  country: varchar("country", { length: 2 }).notNull().default("US"),
  carrierCode: varchar("carrier_code", { length: 30 }).notNull(),
  /** JSON blob of carrier-specific credentials (account number, API key, etc.) */
  credentials: text("credentials").notNull().default("{}"),
  /** Origin address used for rate requests */
  originName: varchar("origin_name", { length: 120 }),
  originAddress1: varchar("origin_address1", { length: 255 }),
  originCity: varchar("origin_city", { length: 100 }),
  originState: varchar("origin_state", { length: 50 }),
  originPostal: varchar("origin_postal", { length: 20 }),
  originCountry: varchar("origin_country", { length: 2 }).default("US"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type RateWizardCarrierAccount = typeof rateWizardCarrierAccounts.$inferSelect;
export type InsertRateWizardCarrierAccount = typeof rateWizardCarrierAccounts.$inferInsert;

/**
 * Per-customer shipping integration routing.
 * Determines whether a customer's orders go through Rate Wizard, Veeqo, or
 * Techship. Defaults to Rate Wizard when no row exists.
 */
export const customerShippingRules = mysqlTable("customer_shipping_rules", {
  id: int("id").autoincrement().primaryKey(),
  /** Extensiv config ID */
  configId: int("config_id").notNull(),
  /** Extensiv customer ID */
  customerId: int("customer_id").notNull(),
  /** Customer display name (denormalised) */
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  /** 'rate_wizard' | 'veeqo' | 'techship' */
  integration: varchar("integration", { length: 30 }).notNull().default("rate_wizard"),
  /** Optional: preferred carrier code for this customer (null = rate shop all) */
  preferredCarrier: varchar("preferred_carrier", { length: 30 }),
  /** Optional: max transit days allowed for this customer */
  maxTransitDays: int("max_transit_days"),
  /** Optional: carriers explicitly excluded for this customer (JSON array of codes) */
  excludedCarriers: text("excluded_carriers").default("[]"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type CustomerShippingRule = typeof customerShippingRules.$inferSelect;
export type InsertCustomerShippingRule = typeof customerShippingRules.$inferInsert;

/**
 * Rate Wizard shipment log — records every rate request and label booking
 * for reporting, billing, and audit purposes.
 */
export const rateWizardShipments = mysqlTable("rate_wizard_shipments", {
  id: int("id").autoincrement().primaryKey(),
  /** Extensiv order ID */
  orderId: varchar("order_id", { length: 100 }),
  /** Extensiv config ID */
  configId: int("config_id"),
  /** Extensiv customer ID */
  customerId: int("customer_id"),
  customerName: varchar("customer_name", { length: 255 }),
  locationId: varchar("location_id", { length: 100 }),
  /** Carrier account used */
  carrierAccountId: int("carrier_account_id"),
  carrierCode: varchar("carrier_code", { length: 30 }),
  serviceCode: varchar("service_code", { length: 60 }),
  serviceName: varchar("service_name", { length: 120 }),
  /** Quoted rate in cents */
  rateAmountCents: int("rate_amount_cents"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  transitDays: int("transit_days"),
  /** Tracking number after label is booked */
  trackingNumber: varchar("tracking_number", { length: 100 }),
  /** Label URL or S3 key */
  labelUrl: text("label_url"),
  /** 'rated' | 'booked' | 'voided' | 'error' */
  status: varchar("status", { length: 20 }).notNull().default("rated"),
  /** Package weight in oz */
  weightOz: int("weight_oz"),
  /** Package dimensions in inches */
  lengthIn: int("length_in"),
  widthIn: int("width_in"),
  heightIn: int("height_in"),
  /** Small parcel session ID — fallback lookup key when orderId is null */
  sessionId: int("session_id"),
  /** Veeqo Rate Shopping API: remote_shipment_id from rates response (needed to book) */
  remoteShipmentId: varchar("remote_shipment_id", { length: 100 }),
  /** Veeqo Rate Shopping API: request_token from rates response (for validation) */
  requestToken: varchar("request_token", { length: 255 }),
  /** User who booked the label */
  bookedByUserId: int("booked_by_user_id"),
  bookedByName: varchar("booked_by_name", { length: 255 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type RateWizardShipment = typeof rateWizardShipments.$inferSelect;
export type InsertRateWizardShipment = typeof rateWizardShipments.$inferInsert;

// ─── Unified Shipments ────────────────────────────────────────────────────────
/**
 * Central tracking number registry for all GD shipping platforms.
 *
 * Every label purchase — regardless of platform — writes one row here so that
 * Shipping History, OpFi reconciliation, and customer service all have a single
 * source of truth.
 *
 * Platform values:
 *   "veeqo"       — Veeqo Rate Shopping API (small parcel)
 *   "techship"    — TechShip carrier API (small parcel)
 *   "shipwell"    — Shipwell LTL (freight)
 *   "manual"      — Manually entered tracking number
 */
export const shipmentPlatformEnum = mysqlEnum("shipment_platform", [
  "veeqo",
  "techship",
  "shipwell",
  "manual",
]);

export const shipmentModeEnum = mysqlEnum("shipment_mode", [
  "small_parcel",
  "ltl",
  "ftl",
  "other",
]);

export const shipments = mysqlTable("shipments", {
  id: int("id").primaryKey().autoincrement(),

  // ── Platform source ──────────────────────────────────────────────────────
  /** Which shipping platform generated this shipment */
  platform: mysqlEnum("platform", ["veeqo", "techship", "shipwell", "manual", "rate_wizard"]).notNull(),
  /** Shipping mode */
  mode: mysqlEnum("mode", ["small_parcel", "ltl", "ftl", "other"]).notNull().default("small_parcel"),

  // ── Order / customer context ─────────────────────────────────────────────
  /** Extensiv config ID (which GD warehouse account) */
  configId: int("config_id"),
  /** Extensiv Transaction ID (readOnly.orderId) */
  extensivOrderId: int("extensiv_order_id"),
  /** Customer-facing order reference number */
  orderNumber: varchar("order_number", { length: 128 }),
  /** GD customer/client ID */
  customerId: int("customer_id"),
  /** GD customer/client name */
  customerName: varchar("customer_name", { length: 255 }),
  /** Warehouse / facility name */
  facilityName: varchar("facility_name", { length: 128 }),

  // ── Recipient ────────────────────────────────────────────────────────────
  shipToName: varchar("ship_to_name", { length: 255 }),
  shipToAddress1: varchar("ship_to_address1", { length: 255 }),
  shipToCity: varchar("ship_to_city", { length: 128 }),
  shipToState: varchar("ship_to_state", { length: 64 }),
  shipToZip: varchar("ship_to_zip", { length: 20 }),
  shipToCountry: varchar("ship_to_country", { length: 4 }).default("US"),

  // ── Carrier & service ────────────────────────────────────────────────────
  carrier: varchar("carrier", { length: 128 }),
  serviceLevel: varchar("service_level", { length: 256 }),
  /** Carrier SCAC code for LTL (e.g. "ODFL", "FXFE") */
  carrierScac: varchar("carrier_scac", { length: 10 }),

  // ── Tracking identifiers ─────────────────────────────────────────────────
  /** Primary tracking number (parcel) or PRO number (LTL) */
  trackingNumber: varchar("tracking_number", { length: 256 }),
  /** BOL number (LTL) */
  bolNumber: varchar("bol_number", { length: 128 }),
  /** PRO number (LTL — assigned by carrier after pickup) */
  proNumber: varchar("pro_number", { length: 128 }),
  /** Shipwell PO / order ID */
  shipwellOrderId: varchar("shipwell_order_id", { length: 128 }),
  /** Shipwell Shipment ID */
  shipwellShipmentId: varchar("shipwell_shipment_id", { length: 128 }),
  /** Veeqo shipment ID (from bookShipment response) */
  veeqoShipmentId: varchar("veeqo_shipment_id", { length: 128 }),
  /** Rate Wizard shipment row ID (FK to rate_wizard_shipments) */
  rateWizardShipmentId: int("rate_wizard_shipment_id"),
  /** Small parcel session ID (FK to small_parcel_sessions) */
  smallParcelSessionId: int("small_parcel_session_id"),

  // ── Package / cost ───────────────────────────────────────────────────────
  /** Charged weight in lbs (parcel) or total weight in lbs (LTL) */
  weightLbs: decimal("weight_lbs", { precision: 8, scale: 2 }),
  /** Marked-up label cost in cents (what GD charges) */
  labelCostCents: int("label_cost_cents"),
  /** Raw carrier cost in cents (what GD pays) */
  rawCostCents: int("raw_cost_cents"),
  /** Currency code */
  currency: varchar("currency", { length: 4 }).default("USD"),

  // ── Label ────────────────────────────────────────────────────────────────
  labelUrl: text("label_url"),
  /** ZPL label content (small parcel) */
  labelZpl: text("label_zpl"),

  // ── Status ───────────────────────────────────────────────────────────────
  /**
   * Lifecycle status:
   *   "booked"      — label purchased, not yet picked up
   *   "in_transit"  — carrier has scanned / picked up
   *   "delivered"   — delivered to recipient
   *   "exception"   — carrier exception / delay
   *   "voided"      — label voided / cancelled
   */
  status: varchar("status", { length: 32 }).default("booked"),
  /** Shipwell status string (quoting, tendered, carrier_confirmed, in_transit, delivered) */
  shipwellStatus: varchar("shipwell_status", { length: 64 }),
  /** Estimated delivery date (UTC) */
  estimatedDeliveryAt: timestamp("estimated_delivery_at"),
  /** Actual delivery date (UTC) */
  deliveredAt: timestamp("delivered_at"),

  // ── Audit ────────────────────────────────────────────────────────────────
  bookedByUserId: varchar("booked_by_user_id", { length: 128 }),
  bookedByName: varchar("booked_by_name", { length: 255 }),
  /** Free-text notes (manual entry reason, exception notes, etc.) */
  notes: text("notes"),

  // ── ClearSight push tracking ─────────────────────────────────────────────
  /**
   * Status of the last push attempt to ClearSight.
   * "pending"  — not yet pushed (ClearSight not configured, or first attempt queued)
   * "sent"     — successfully delivered to ClearSight
   * "failed"   — last attempt failed; will be retried up to 5 times
   */
  clearSightPushStatus: mysqlEnum("clear_sight_push_status", ["pending", "sent", "failed"]),
  /** Number of push attempts made so far */
  clearSightPushAttempts: int("clear_sight_push_attempts").notNull().default(0),
  /** Error message from the last failed push attempt */
  clearSightPushError: varchar("clear_sight_push_error", { length: 512 }),
  /** Timestamp of the last successful push */
  clearSightLastPushedAt: timestamp("clear_sight_last_pushed_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = typeof shipments.$inferInsert;

// ─── Receiving Pallet Capture ───────────────────────────────────────────────
// One session per receiving transaction (ASN/PO receipt from Extensiv).
// A session is "open" while pallets are being logged; "completed" once the
// supervisor clicks Complete Session (which triggers the OpFi push).
export const receivePalletSessions = mysqlTable("receive_pallet_sessions", {
  id:                  int("id").primaryKey().autoincrement(),
  // Extensiv transaction ID (readOnly.transactionId on the receiver)
  transactionId:       int("transactionId").notNull(),
  // Extensiv facility / customer identifiers for display
  facilityId:          int("facilityId").notNull(),
  facilityName:        varchar("facilityName", { length: 128 }).notNull().default(""),
  customerId:          int("customerId").notNull(),
  customerName:        varchar("customerName", { length: 128 }).notNull().default(""),
  // PO / reference for display
  poNum:               varchar("poNum", { length: 128 }),
  referenceNum:        varchar("referenceNum", { length: 128 }),
  // Session lifecycle
  status:              mysqlEnum("rps_status", ["open", "completed"]).notNull().default("open"),
  // Non-conforming hours: hours outside standard receiving window that were required
  nonConformingHours:  decimal("nonConformingHours", { precision: 5, scale: 2 }),
  nonConformingReason: varchar("nonConformingReason", { length: 512 }),
  // Aggregate counts (denormalised for quick display)
  totalPallets:        int("totalPallets").notNull().default(0),
  standardPallets:     int("standardPallets").notNull().default(0),
  oversizePallets:     int("oversizePallets").notNull().default(0),
  otherPallets:        int("otherPallets").notNull().default(0),
  // OpFi push tracking
  opfiPushStatus:      mysqlEnum("rps_opfi_status", ["pending", "sent", "failed", "skipped"]).default("pending"),
  opfiPushedAt:        timestamp("opfiPushedAt"),
  opfiError:           varchar("opfiError", { length: 512 }),
  // Who started / completed the session
  startedBy:           varchar("startedBy", { length: 128 }),
  completedBy:         varchar("completedBy", { length: 128 }),
  startedAt:           timestamp("startedAt").notNull().defaultNow(),
  completedAt:         timestamp("completedAt"),
  createdAt:           timestamp("rps_createdAt").notNull().defaultNow(),
  updatedAt:           timestamp("rps_updatedAt").notNull().defaultNow().onUpdateNow(),
});

export type ReceivePalletSession = typeof receivePalletSessions.$inferSelect;
export type InsertReceivePalletSession = typeof receivePalletSessions.$inferInsert;

// One row per physical pallet captured during a receiving session.
export const receivePallets = mysqlTable("receive_pallets", {
  id:           int("id").primaryKey().autoincrement(),
  sessionId:    int("sessionId").notNull(),
  // Sequential pallet number within the session (1, 2, 3 …)
  palletNumber: int("palletNumber").notNull(),
  // Pallet type confirmed by the receiver
  palletType:   mysqlEnum("rp_palletType", ["standard", "oversize", "other"]).notNull(),
  // Optional free-text description (required when palletType = "other")
  description:  varchar("description", { length: 256 }),
  // Optional photo URL (S3) captured at dock
  photoUrl:     varchar("photoUrl", { length: 512 }),
  // Weight (optional)
  weightLbs:    decimal("weightLbs", { precision: 8, scale: 2 }),
  notes:        varchar("notes", { length: 512 }),
  capturedAt:   timestamp("capturedAt").notNull().defaultNow(),
  createdAt:    timestamp("rp_createdAt").notNull().defaultNow(),
});

export type ReceivePallet = typeof receivePallets.$inferSelect;
export type InsertReceivePallet = typeof receivePallets.$inferInsert;

// ─── Purchase Orders ──────────────────────────────────────────────────────────
// Stores GD Genius purchase orders created by staff and pushed to OpFi.
export const purchaseOrders = mysqlTable("purchase_orders", {
  id:                int("id").primaryKey().autoincrement(),
  poNumber:          varchar("po_number", { length: 64 }).notNull().unique(),
  // PO category: kitting | labor | materials
  poType:            mysqlEnum("po_type", ["kitting", "labor", "materials"]).notNull().default("kitting"),
  // Approval/workflow status
  poStatus:          mysqlEnum("po_status", ["pending", "approved", "invoiced", "rejected", "received", "ordered"]).notNull().default("pending"),
  customerId:        varchar("customer_id", { length: 64 }).notNull(),
  customerName:      varchar("customer_name", { length: 255 }).notNull(),
  warehouse:         mysqlEnum("warehouse", ["Columbus", "Reno", "Toronto", "Calgary"]).notNull(),
  poDate:            varchar("po_date", { length: 10 }).notNull(),
  billingPeriod:     varchar("billing_period", { length: 7 }).notNull(),
  // Legacy combined-charge fields (kept for backward compat)
  kittingCharge:     decimal("kitting_charge", { precision: 10, scale: 2 }).notNull().default("0.00"),
  labourCharge:      decimal("labour_charge", { precision: 10, scale: 2 }).notNull().default("0.00"),
  materialCharge:    decimal("material_charge", { precision: 10, scale: 2 }).notNull().default("0.00"),
  totalCharge:       decimal("total_charge", { precision: 10, scale: 2 }).notNull().default("0.00"),
  currency:          mysqlEnum("currency", ["USD", "CAD"]).notNull().default("CAD"),
  // Kitting-specific fields
  sku:               varchar("sku", { length: 128 }),
  skuDescription:    varchar("sku_description", { length: 255 }),
  qty:               int("qty"),
  unitCost:          decimal("unit_cost", { precision: 10, scale: 4 }),
  // Labor-specific fields
  employeeName:      varchar("employee_name", { length: 128 }),
  employeeRole:      varchar("employee_role", { length: 128 }),
  hoursWorked:       decimal("hours_worked", { precision: 8, scale: 2 }),
  hourlyRate:        decimal("hourly_rate", { precision: 10, scale: 2 }),
  // Materials-specific fields
  itemName:          varchar("item_name", { length: 255 }),
  vendorName:        varchar("vendor_name", { length: 255 }),
  notes:             text("notes"),
  opfiPushStatus:    mysqlEnum("opfi_push_status", ["pending", "sent", "failed", "skipped"]).notNull().default("pending"),
  opfiPushError:     text("opfi_push_error"),
  opfiPushAttempts:  int("opfi_push_attempts").notNull().default(0),
  opfiLastPushedAt:  bigint("opfi_last_pushed_at", { mode: "number" }),
  createdBy:         varchar("created_by", { length: 128 }),
  createdAt:         bigint("created_at", { mode: "number" }).notNull().default(0),
});
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// =============================================================================
// DIRECTLY + GOPHER — Messenger & AI assistant tables
// Shared across GD Cortex (Genius, ClearSight, OpFi)
// =============================================================================

export const directlyConversations = mysqlTable("directly_conversations", {
  id:         varchar("id", { length: 36 }).primaryKey(),
  type:       varchar("type", { length: 32 }).notNull(), // "dm" | "group" | "entity" | "gopher_dm"
  name:       varchar("name", { length: 255 }),
  entityType: varchar("entityType", { length: 64 }),
  entityId:   varchar("entityId", { length: 128 }),
  createdAt:  timestamp("createdAt").defaultNow().notNull(),
  updatedAt:  timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DirectlyConversation = typeof directlyConversations.$inferSelect;
export type InsertDirectlyConversation = typeof directlyConversations.$inferInsert;

export const directlyParticipants = mysqlTable("directly_participants", {
  id:             varchar("id", { length: 36 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 36 }).notNull(),
  userId:         int("userId").notNull(),
  joinedAt:       timestamp("joinedAt").defaultNow().notNull(),
  lastReadAt:     timestamp("lastReadAt").defaultNow().notNull(),
});
export type DirectlyParticipant = typeof directlyParticipants.$inferSelect;
export type InsertDirectlyParticipant = typeof directlyParticipants.$inferInsert;

export const directlyMessages = mysqlTable("directly_messages", {
  id:                   varchar("id", { length: 36 }).primaryKey(),
  conversationId:       varchar("conversationId", { length: 36 }).notNull(),
  senderId:             int("senderId").notNull(),
  body:                 text("body").notNull(),
  isGopherMessage:      boolean("isGopherMessage").default(false).notNull(),
  gopherInterceptionId: varchar("gopherInterceptionId", { length: 36 }),
  editedAt:             timestamp("editedAt"),
  deletedAt:            timestamp("deletedAt"),
  createdAt:            timestamp("createdAt").defaultNow().notNull(),
});
export type DirectlyMessage = typeof directlyMessages.$inferSelect;
export type InsertDirectlyMessage = typeof directlyMessages.$inferInsert;

export const directlyPresence = mysqlTable("directly_presence", {
  id:            varchar("id", { length: 36 }).primaryKey(),
  userId:        int("userId").notNull().unique(),
  status:        varchar("status", { length: 16 }).default("offline").notNull(),
  lastSeenAt:    timestamp("lastSeenAt").defaultNow().notNull(),
  currentApp:    varchar("currentApp", { length: 32 }).default("genius"),
  statusMessage: varchar("statusMessage", { length: 255 }),
});
export type DirectlyPresence = typeof directlyPresence.$inferSelect;
export type InsertDirectlyPresence = typeof directlyPresence.$inferInsert;

export const directlyGopherLogs = mysqlTable("directly_gopher_logs", {
  id:               varchar("id", { length: 36 }).primaryKey(),
  conversationId:   varchar("conversationId", { length: 36 }).notNull(),
  userId:           int("userId").notNull(),
  questionCategory: varchar("questionCategory", { length: 64 }),
  confidence:       int("confidence").default(0),
  accepted:         boolean("accepted"),
  walkthroughShown: varchar("walkthroughShown", { length: 128 }),
  repeatCount:      int("repeatCount").default(0).notNull(),
  createdAt:        timestamp("createdAt").defaultNow().notNull(),
});
export type DirectlyGopherLog = typeof directlyGopherLogs.$inferSelect;
export type InsertDirectlyGopherLog = typeof directlyGopherLogs.$inferInsert;

// ---------------------------------------------------------------------------
// GD Cortex Hub Integration Tables
// ---------------------------------------------------------------------------

export const cortexHubConfig = mysqlTable("cortex_hub_config", {
  id: int("id").autoincrement().primaryKey(),
  cortexBaseUrl: varchar("cortexBaseUrl", { length: 512 }),
  cortexApiKey: varchar("cortexApiKey", { length: 256 }),
  geniusApiKey: varchar("geniusApiKey", { length: 256 }),
  status: mysqlEnum("status", ["connected", "disconnected", "error"]).default("disconnected"),
  syncIntervalMinutes: int("syncIntervalMinutes").default(5),
  lastHealthCheck: timestamp("lastHealthCheck"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CortexHubConfig = typeof cortexHubConfig.$inferSelect;
export type InsertCortexHubConfig = typeof cortexHubConfig.$inferInsert;

export const geniusProductionJobs = mysqlTable("genius_production_jobs", {
  id: int("id").autoincrement().primaryKey(),
  extensivCustomerId: int("extensivCustomerId").notNull(),
  jobNumber: varchar("jobNumber", { length: 64 }).notNull(),
  jobType: mysqlEnum("jobType", ["returns_processing", "kitting", "labeling", "repackaging", "inspection", "other"]).notNull(),
  status: mysqlEnum("status", ["queued", "in_progress", "completed", "on_hold", "cancelled"]).default("queued").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal"),
  unitCount: int("unitCount").default(0),
  completedUnits: int("completedUnits").default(0),
  assignedTo: varchar("assignedTo", { length: 255 }),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  cortexNotified: boolean("cortexNotified").default(false),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GeniusProductionJob = typeof geniusProductionJobs.$inferSelect;
export type InsertGeniusProductionJob = typeof geniusProductionJobs.$inferInsert;

export const geniusMaterialsInventory = mysqlTable("genius_materials_inventory", {
  id: int("id").autoincrement().primaryKey(),
  extensivCustomerId: int("extensivCustomerId").notNull(),
  sku: varchar("sku", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  category: varchar("category", { length: 128 }),
  quantityOnHand: int("quantityOnHand").default(0).notNull(),
  quantityAllocated: int("quantityAllocated").default(0),
  quantityAvailable: int("quantityAvailable").default(0),
  unitOfMeasure: varchar("unitOfMeasure", { length: 32 }).default("each"),
  reorderPoint: int("reorderPoint"),
  reorderQuantity: int("reorderQuantity"),
  location: varchar("location", { length: 128 }),
  warehouseId: varchar("warehouseId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GeniusMaterialsInventory = typeof geniusMaterialsInventory.$inferSelect;
export type InsertGeniusMaterialsInventory = typeof geniusMaterialsInventory.$inferInsert;

export const geniusCortexEvents = mysqlTable("genius_cortex_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  sourcePlatform: mysqlEnum("sourcePlatform", ["cortex", "clearsight", "opfi"]).notNull(),
  payload: json("payload").notNull(),
  status: mysqlEnum("status", ["received", "processed", "failed"]).default("received").notNull(),
  processedAt: timestamp("processedAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GeniusCortexEvent = typeof geniusCortexEvents.$inferSelect;
export type InsertGeniusCortexEvent = typeof geniusCortexEvents.$inferInsert;

// ─── Feature 9: Order Notes ───────────────────────────────────────────────────
export const entityNoteTypeEnum = mysqlEnum("entity_note_type", [
  "internal",
  "client",
  "system",
  "decision",
]);

export const entityNotes = mysqlTable("entity_notes", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 64 }).notNull(), // "order" | "exception" | "return" | "allocation_run"
  entityId: varchar("entityId", { length: 128 }).notNull(),
  noteType: entityNoteTypeEnum.notNull().default("internal"),
  authorId: int("authorId"), // null for system notes
  authorName: varchar("authorName", { length: 128 }), // denormalized for display
  bodyText: text("bodyText").notNull(),
  editedAt: timestamp("editedAt"),
  originalBodyText: text("originalBodyText"), // preserved on edit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EntityNote = typeof entityNotes.$inferSelect;
export type InsertEntityNote = typeof entityNotes.$inferInsert;

export const entityNoteMentions = mysqlTable("entity_note_mentions", {
  id: int("id").autoincrement().primaryKey(),
  noteId: int("noteId").notNull(),
  mentionedUserId: int("mentionedUserId").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EntityNoteMention = typeof entityNoteMentions.$inferSelect;
export type InsertEntityNoteMention = typeof entityNoteMentions.$inferInsert;

// ─── Feature 5: Exceptions Queue ─────────────────────────────────────────────
export const exceptionPriorityEnum = mysqlEnum("exception_priority", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const exceptionStatusEnum = mysqlEnum("exception_status", [
  "open",
  "in_progress",
  "resolved",
  "dismissed",
]);

export const exceptions = mysqlTable("exceptions", {
  id: int("id").autoincrement().primaryKey(),
  exceptionType: varchar("exceptionType", { length: 64 }).notNull(),
  priority: exceptionPriorityEnum.notNull().default("medium"),
  status: exceptionStatusEnum.notNull().default("open"),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  entityType: varchar("entityType", { length: 64 }),
  entityId: varchar("entityId", { length: 128 }),
  warehouseId: varchar("warehouseId", { length: 64 }),
  clientName: varchar("clientName", { length: 128 }),
  assignedToId: int("assignedToId"),
  assignedToName: varchar("assignedToName", { length: 128 }),
  resolvedAt: timestamp("resolvedAt"),
  resolvedById: int("resolvedById"),
  resolvedByName: varchar("resolvedByName", { length: 128 }),
  resolutionNote: text("resolutionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Exception = typeof exceptions.$inferSelect;
export type InsertException = typeof exceptions.$inferInsert;

export const exceptionEvents = mysqlTable("exception_events", {
  id: int("id").autoincrement().primaryKey(),
  exceptionId: int("exceptionId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  actorId: int("actorId"),
  actorName: varchar("actorName", { length: 128 }),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ExceptionEvent = typeof exceptionEvents.$inferSelect;
export type InsertExceptionEvent = typeof exceptionEvents.$inferInsert;

// ── Client Profiles ──────────────────────────────────────────────────────────
export const clientProfiles = mysqlTable("client_profiles", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  configId: int("configId").notNull(),
  customerName: varchar("customerName", { length: 256 }).notNull(),
  brandColor: varchar("brandColor", { length: 16 }).default("#3B82F6"),
  logoUrl: varchar("logoUrl", { length: 512 }),
  contactName: varchar("contactName", { length: 256 }),
  contactEmail: varchar("contactEmail", { length: 256 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  orderChannel: mysqlEnum("orderChannel", ["b2b", "d2c", "both"]).default("b2b"),
  slaStandardHours: int("slaStandardHours").default(48),
  slaExpeditedHours: int("slaExpeditedHours").default(24),
  slaCutoffTime: varchar("slaCutoffTime", { length: 8 }).default("15:00"),
  qcScanType: mysqlEnum("qcScanType", ["standard", "enhanced", "visual"]).default("standard"),
  qcDamageThresholdPct: int("qcDamageThresholdPct").default(0),
  qcItemCountRequired: int("qcItemCountRequired").default(0),
  qcPhotoRequirement: mysqlEnum("qcPhotoRequirement", ["none", "exceptions_only", "per_order", "per_item"]).default("none"),
  packagingBoxType: varchar("packagingBoxType", { length: 128 }),
  packagingVoidFill: int("packagingVoidFill").default(0),
  packagingInsertSheets: int("packagingInsertSheets").default(0),
  packagingTissueWrap: int("packagingTissueWrap").default(0),
  packagingGiftMessaging: int("packagingGiftMessaging").default(0),
  lotTrackingRequired: int("lotTrackingRequired").default(0),
  billingPerOrderFee: decimal("billingPerOrderFee", { precision: 10, scale: 2 }).default("0"),
  billingPerItemFee: decimal("billingPerItemFee", { precision: 10, scale: 2 }).default("0"),
  billingStorageFee: decimal("billingStorageFee", { precision: 10, scale: 2 }).default("0"),
  billingFrequency: mysqlEnum("billingFrequency", ["weekly", "biweekly", "monthly"]).default("monthly"),
  billingPoRequired: int("billingPoRequired").default(0),
  specialInstructions: text("specialInstructions"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const clientProfileAudit = mysqlTable("client_profile_audit", {
  id: int("id").autoincrement().primaryKey(),
  clientProfileId: int("clientProfileId").notNull(),
  customerId: int("customerId").notNull(),
  userId: varchar("userId", { length: 128 }),
  userName: varchar("userName", { length: 256 }),
  fieldName: varchar("fieldName", { length: 128 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  changedAt: timestamp("changedAt").defaultNow(),
});

export type ClientProfile = typeof clientProfiles.$inferSelect;
export type NewClientProfile = typeof clientProfiles.$inferInsert;

// ── Media Attachments (Photo Capture) ─────────────────────────────────────────
export const mediaAttachments = mysqlTable('media_attachments', {
  id: int('id').autoincrement().primaryKey(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: varchar('entity_id', { length: 128 }).notNull(),
  category: mysqlEnum('category', ['item_condition', 'packaging', 'damage', 'label', 'other']).notNull().default('other'),
  fileKey: varchar('file_key', { length: 512 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileSizeBytes: int('file_size_bytes').notNull().default(0),
  mimeType: varchar('mime_type', { length: 64 }).notNull().default('image/jpeg'),
  width: int('width'),
  height: int('height'),
  note: text('note'),
  capturedBy: int('captured_by'),
  capturedAt: bigint('captured_at', { mode: 'number' }).notNull(),
});

export type MediaAttachment = typeof mediaAttachments.$inferSelect;
export type InsertMediaAttachment = typeof mediaAttachments.$inferInsert;

// ── Throughput Snapshots (Predictive Workload) ────────────────────────────────
export const throughputSnapshots = mysqlTable('throughput_snapshots', {
  id: int('id').autoincrement().primaryKey(),
  warehouseId: varchar('warehouse_id', { length: 64 }).notNull(),
  stage: varchar('stage', { length: 64 }).notNull(),
  hourBucket: bigint('hour_bucket', { mode: 'number' }).notNull(),
  ordersProcessed: int('orders_processed').notNull().default(0),
  workerCount: int('worker_count').notNull().default(0),
  avgTimeSeconds: int('avg_time_seconds').notNull().default(0),
  recordedAt: bigint('recorded_at', { mode: 'number' }).notNull(),
});

// ── Workload Forecasts (Predictive Workload) ──────────────────────────────────
export const workloadForecasts = mysqlTable('workload_forecasts', {
  id: int('id').autoincrement().primaryKey(),
  warehouseId: varchar('warehouse_id', { length: 64 }).notNull(),
  forecastAt: bigint('forecast_at', { mode: 'number' }).notNull(),
  stage: varchar('stage', { length: 64 }).notNull(),
  currentQueue: int('current_queue').notNull().default(0),
  projectedCompletionAt: bigint('projected_completion_at', { mode: 'number' }),
  slaBreachCount: int('sla_breach_count').notNull().default(0),
  throughputPerHour: decimal('throughput_per_hour', { precision: 8, scale: 2 }).notNull().default('0'),
  requiredThroughput: decimal('required_throughput', { precision: 8, scale: 2 }).notNull().default('0'),
  bottleneck: int('bottleneck').notNull().default(0),
  actualBreachCount: int('actual_breach_count'),
});

// ── Onboarding Steps (Guided Onboarding) ─────────────────────────────────────
export const onboardingSteps = mysqlTable('onboarding_steps', {
  id: int('id').autoincrement().primaryKey(),
  role: varchar('role', { length: 64 }).notNull(),
  stepOrder: int('step_order').notNull(),
  stepKey: varchar('step_key', { length: 128 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  targetRoute: varchar('target_route', { length: 255 }),
  targetSelector: varchar('target_selector', { length: 255 }),
  actionType: mysqlEnum('action_type', ['navigate', 'highlight', 'interact', 'read']).notNull().default('navigate'),
});

// ── Onboarding Progress (Guided Onboarding) ───────────────────────────────────
export const onboardingProgress = mysqlTable('onboarding_progress', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id').notNull(),
  stepKey: varchar('step_key', { length: 128 }).notNull(),
  completedAt: bigint('completed_at', { mode: 'number' }),
  skipped: int('skipped').notNull().default(0),
});

// ── Routing Guides ────────────────────────────────────────────────────────────
// Per-customer, per-destination shipping routing requirements
export const routingGuides = mysqlTable('routing_guides', {
  id: int('id').autoincrement().primaryKey(),
  configId: int('config_id').notNull(),
  customerId: int('customer_id').notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  // Destination scope — any field left null means "any"
  destCountry: varchar('dest_country', { length: 2 }),          // e.g. "US", "CA"
  destState: varchar('dest_state', { length: 64 }),             // e.g. "CA", "TX"
  destZipFrom: varchar('dest_zip_from', { length: 16 }),        // ZIP range start
  destZipTo: varchar('dest_zip_to', { length: 16 }),            // ZIP range end
  destCity: varchar('dest_city', { length: 128 }),
  // Routing requirements
  requiredCarrier: varchar('required_carrier', { length: 64 }), // e.g. "fedex"
  requiredService: varchar('required_service', { length: 128 }), // e.g. "GROUND"
  requiredAccount: varchar('required_account', { length: 128 }), // carrier account #
  maxTransitDays: int('max_transit_days'),
  requiresResidential: boolean('requires_residential').notNull().default(false),
  requiresSignature: boolean('requires_signature').notNull().default(false),
  requiresAdultSignature: boolean('requires_adult_signature').notNull().default(false),
  requiresSaturdayDelivery: boolean('requires_saturday_delivery').notNull().default(false),
  labelInstructions: text('label_instructions'),
  notes: text('notes'),
  priority: int('priority').notNull().default(0), // higher = evaluated first
  isActive: boolean('is_active').notNull().default(true),
  createdAt: bigint('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
});

export type RoutingGuide = typeof routingGuides.$inferSelect;
export type InsertRoutingGuide = typeof routingGuides.$inferInsert;

// EDI Retailers — which retailers require 945 EDI transmissions
export const ediRetailers = mysqlTable('edi_retailers', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  requiresEdi: boolean('requires_edi').notNull().default(true),
  aliases: json('aliases').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
});
export type EdiRetailer = typeof ediRetailers.$inferSelect;
export type InsertEdiRetailer = typeof ediRetailers.$inferInsert;

// EDI Escalations — ops flagging a Missing 945 order for manual follow-up
export const ediEscalations = mysqlTable('edi_escalations', {
  id: int('id').primaryKey().autoincrement(),
  configId: int('config_id').notNull(),
  orderNumber: varchar('order_number', { length: 128 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }),
  shipDate: varchar('ship_date', { length: 32 }),
  trackingNumber: varchar('tracking_number', { length: 128 }),
  flaggedBy: varchar('flagged_by', { length: 255 }).notNull(),
  flaggedAt: bigint('flagged_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  notes: text('notes'),
  resolvedAt: bigint('resolved_at', { mode: 'number' }),
  resolvedBy: varchar('resolved_by', { length: 255 }),
  status: mysqlEnum('status', ['open', 'resolved', 'dismissed']).notNull().default('open'),
});
export type EdiEscalation = typeof ediEscalations.$inferSelect;
export type InsertEdiEscalation = typeof ediEscalations.$inferInsert;
