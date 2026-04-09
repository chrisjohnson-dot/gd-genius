# GD ClearSight — Shipment Intake Integration Setup

This document contains everything needed to wire GD Genius → ClearSight shipment pushes.

---

## How it works

1. **GD Genius** fires a `POST /api/shipments` to ClearSight immediately when:
   - A small-parcel label is purchased (Veeqo or stub)
   - An LTL order is sent to Shipwell
   - A manual tracking number is recorded
2. **GD Genius** fires a `PUT /api/shipments/:geniusShipmentId` to ClearSight when:
   - Shipwell assigns a PRO number, BOL number, or carrier tracking number (every 15-minute sync)
   - A user manually updates tracking info via Shipping History
3. **Retry logic**: if ClearSight is unreachable, GD Genius marks the push as `failed` and retries every 30 minutes, up to 5 attempts.

---

## Step 1 — Configure the ClearSight connection in GD Genius

In the GD Genius **Cortex Connections** settings (Settings → Integrations → Cortex), set:

| Field | Value |
|---|---|
| Platform | `clearsight` |
| Webhook URL | `https://gdclearsight-xcskq7et.manus.space/api/shipments` |
| Outbound API Key | *(generate a random 32-char key, e.g. `cs_live_abc123...`)* |
| Enabled | ✓ |

The **Outbound API Key** you set here must match the `GENIUS_API_KEY` secret in ClearSight.

---

## Step 2 — Add these files to the ClearSight Manus project

### 2a. Database migration

Run this SQL in ClearSight's database (Management UI → Database, or via `webdev_execute_sql`):

```sql
-- GD Genius shipment intake table
CREATE TABLE IF NOT EXISTS `genius_shipments` (
  `id`                    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,

  -- Source identifier from GD Genius
  `genius_shipment_id`    INT          NOT NULL,
  `platform`              VARCHAR(32)  NOT NULL COMMENT 'veeqo | techship | shipwell | manual',
  `mode`                  VARCHAR(32)  NOT NULL DEFAULT 'small_parcel' COMMENT 'small_parcel | ltl | ftl | other',

  -- Order context
  `order_number`          VARCHAR(128),
  `extensiv_order_id`     INT,
  `customer_name`         VARCHAR(255),
  `facility_name`         VARCHAR(128),

  -- Recipient
  `ship_to_name`          VARCHAR(255),
  `ship_to_city`          VARCHAR(128),
  `ship_to_state`         VARCHAR(64),
  `ship_to_zip`           VARCHAR(20),
  `ship_to_country`       VARCHAR(4)   DEFAULT 'US',

  -- Carrier & service
  `carrier`               VARCHAR(128),
  `service_level`         VARCHAR(256),
  `carrier_scac`          VARCHAR(10),

  -- Tracking identifiers
  `tracking_number`       VARCHAR(256),
  `bol_number`            VARCHAR(128),
  `pro_number`            VARCHAR(128),

  -- Status
  `status`                VARCHAR(32)  DEFAULT 'booked',
  `shipwell_status`       VARCHAR(64),
  `estimated_delivery_at` TIMESTAMP    NULL,
  `delivered_at`          TIMESTAMP    NULL,

  -- Cost
  `label_cost_cents`      INT,
  `currency`              VARCHAR(4)   DEFAULT 'USD',
  `label_url`             TEXT,

  -- Timestamps from Genius
  `genius_created_at`     TIMESTAMP    NULL,
  `genius_updated_at`     TIMESTAMP    NULL,

  -- Local timestamps
  `received_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY `uq_genius_shipment_id` (`genius_shipment_id`),
  INDEX `idx_order_number` (`order_number`),
  INDEX `idx_tracking_number` (`tracking_number`),
  INDEX `idx_customer_name` (`customer_name`),
  INDEX `idx_status` (`status`),
  INDEX `idx_received_at` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2b. Drizzle schema addition (`drizzle/schema.ts`)

Add this to the end of `drizzle/schema.ts`:

```typescript
// ─── GD Genius Shipment Intake ────────────────────────────────────────────────
/**
 * Shipments pushed from GD Genius in real time.
 * Each row represents one shipment event; upserted on geniusShipmentId.
 */
export const geniusShipments = mysqlTable("genius_shipments", {
  id: int("id").primaryKey().autoincrement(),

  // Source identifier from GD Genius
  geniusShipmentId: int("genius_shipment_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  mode: varchar("mode", { length: 32 }).notNull().default("small_parcel"),

  // Order context
  orderNumber: varchar("order_number", { length: 128 }),
  extensivOrderId: int("extensiv_order_id"),
  customerName: varchar("customer_name", { length: 255 }),
  facilityName: varchar("facility_name", { length: 128 }),

  // Recipient
  shipToName: varchar("ship_to_name", { length: 255 }),
  shipToCity: varchar("ship_to_city", { length: 128 }),
  shipToState: varchar("ship_to_state", { length: 64 }),
  shipToZip: varchar("ship_to_zip", { length: 20 }),
  shipToCountry: varchar("ship_to_country", { length: 4 }).default("US"),

  // Carrier & service
  carrier: varchar("carrier", { length: 128 }),
  serviceLevel: varchar("service_level", { length: 256 }),
  carrierScac: varchar("carrier_scac", { length: 10 }),

  // Tracking identifiers
  trackingNumber: varchar("tracking_number", { length: 256 }),
  bolNumber: varchar("bol_number", { length: 128 }),
  proNumber: varchar("pro_number", { length: 128 }),

  // Status
  status: varchar("status", { length: 32 }).default("booked"),
  shipwellStatus: varchar("shipwell_status", { length: 64 }),
  estimatedDeliveryAt: timestamp("estimated_delivery_at"),
  deliveredAt: timestamp("delivered_at"),

  // Cost
  labelCostCents: int("label_cost_cents"),
  currency: varchar("currency", { length: 4 }).default("USD"),
  labelUrl: text("label_url"),

  // Timestamps from Genius
  geniusCreatedAt: timestamp("genius_created_at"),
  geniusUpdatedAt: timestamp("genius_updated_at"),

  // Local timestamps
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type GeniusShipment = typeof geniusShipments.$inferSelect;
export type InsertGeniusShipment = typeof geniusShipments.$inferInsert;
```

### 2c. REST intake endpoint (`server/cortex/geniusShipments.ts`)

Create this new file:

```typescript
/**
 * GD Genius → ClearSight Shipment Intake
 *
 * Receives real-time shipment pushes from GD Genius.
 * Authentication: X-API-Key header matched against GENIUS_API_KEY env var.
 *
 * Endpoints:
 *   POST /api/shipments        — Create or update a shipment (upsert on geniusShipmentId)
 *   GET  /api/shipments        — List shipments (paginated, filterable)
 *   GET  /api/shipments/:id    — Get a single shipment by geniusShipmentId
 */

import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { geniusShipments } from "../../drizzle/schema";
import { eq, desc, and, like, SQL } from "drizzle-orm";

// ─── API Key auth ─────────────────────────────────────────────────────────────

function requireGeniusApiKey(req: Request, res: Response): boolean {
  const key = req.headers["x-api-key"];
  const expected = process.env.GENIUS_API_KEY;
  if (!expected) {
    console.error("[GeniusShipments] GENIUS_API_KEY not configured");
    res.status(500).json({ error: "Server misconfiguration" });
    return false;
  }
  if (!key || key !== expected) {
    res.status(401).json({ error: "Invalid or missing X-API-Key" });
    return false;
  }
  return true;
}

// ─── Payload type (matches GD Genius buildShipmentPayload) ───────────────────

interface GeniusShipmentPayload {
  event: "shipment.created" | "shipment.updated";
  timestamp: string;
  data: {
    geniusShipmentId: number;
    platform: string;
    mode: string;
    orderNumber?: string | null;
    extensivOrderId?: number | null;
    customerName?: string | null;
    facilityName?: string | null;
    shipToName?: string | null;
    shipToCity?: string | null;
    shipToState?: string | null;
    shipToZip?: string | null;
    shipToCountry?: string | null;
    carrier?: string | null;
    serviceLevel?: string | null;
    carrierScac?: string | null;
    trackingNumber?: string | null;
    bolNumber?: string | null;
    proNumber?: string | null;
    status?: string | null;
    shipwellStatus?: string | null;
    estimatedDeliveryAt?: string | null;
    deliveredAt?: string | null;
    labelCostCents?: number | null;
    currency?: string | null;
    labelUrl?: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerGeniusShipmentRoutes(app: Express): void {

  // ── POST /api/shipments — upsert shipment from Genius ────────────────────
  app.post("/api/shipments", async (req: Request, res: Response) => {
    if (!requireGeniusApiKey(req, res)) return;

    const body = req.body as GeniusShipmentPayload;
    if (!body?.data?.geniusShipmentId) {
      res.status(400).json({ error: "data.geniusShipmentId is required" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const d = body.data;
      const values = {
        geniusShipmentId: d.geniusShipmentId,
        platform: d.platform,
        mode: d.mode,
        orderNumber: d.orderNumber ?? null,
        extensivOrderId: d.extensivOrderId ?? null,
        customerName: d.customerName ?? null,
        facilityName: d.facilityName ?? null,
        shipToName: d.shipToName ?? null,
        shipToCity: d.shipToCity ?? null,
        shipToState: d.shipToState ?? null,
        shipToZip: d.shipToZip ?? null,
        shipToCountry: d.shipToCountry ?? "US",
        carrier: d.carrier ?? null,
        serviceLevel: d.serviceLevel ?? null,
        carrierScac: d.carrierScac ?? null,
        trackingNumber: d.trackingNumber ?? null,
        bolNumber: d.bolNumber ?? null,
        proNumber: d.proNumber ?? null,
        status: d.status ?? "booked",
        shipwellStatus: d.shipwellStatus ?? null,
        estimatedDeliveryAt: d.estimatedDeliveryAt ? new Date(d.estimatedDeliveryAt) : null,
        deliveredAt: d.deliveredAt ? new Date(d.deliveredAt) : null,
        labelCostCents: d.labelCostCents ?? null,
        currency: d.currency ?? "USD",
        labelUrl: d.labelUrl ?? null,
        geniusCreatedAt: d.createdAt ? new Date(d.createdAt) : null,
        geniusUpdatedAt: d.updatedAt ? new Date(d.updatedAt) : null,
      };

      // Upsert: insert or update on duplicate geniusShipmentId
      await db
        .insert(geniusShipments)
        .values(values)
        .onDuplicateKeyUpdate({ set: { ...values } });

      console.log(
        `[GeniusShipments] ${body.event} — geniusShipmentId=${d.geniusShipmentId} ` +
        `order=${d.orderNumber ?? "—"} tracking=${d.trackingNumber ?? "—"}`
      );

      res.json({ success: true, geniusShipmentId: d.geniusShipmentId });
    } catch (err) {
      console.error("[GeniusShipments] POST /api/shipments error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /api/shipments — list with filters ────────────────────────────────
  app.get("/api/shipments", async (req: Request, res: Response) => {
    if (!requireGeniusApiKey(req, res)) return;

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { customer, facility, tracking, status, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(limitStr || "50", 10) || 50, 500);
      const offset = parseInt(offsetStr || "0", 10) || 0;

      const conditions: SQL[] = [];
      if (customer) conditions.push(like(geniusShipments.customerName, `%${customer}%`));
      if (facility) conditions.push(eq(geniusShipments.facilityName, facility));
      if (tracking) conditions.push(like(geniusShipments.trackingNumber, `%${tracking}%`));
      if (status) conditions.push(eq(geniusShipments.status, status));

      const rows = await db
        .select()
        .from(geniusShipments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(geniusShipments.receivedAt))
        .limit(limit)
        .offset(offset);

      res.json({ shipments: rows, count: rows.length });
    } catch (err) {
      console.error("[GeniusShipments] GET /api/shipments error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /api/shipments/:id — single shipment ──────────────────────────────
  app.get("/api/shipments/:id", async (req: Request, res: Response) => {
    if (!requireGeniusApiKey(req, res)) return;

    const geniusId = parseInt(req.params.id, 10);
    if (isNaN(geniusId)) {
      res.status(400).json({ error: "Invalid shipment ID" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [row] = await db
        .select()
        .from(geniusShipments)
        .where(eq(geniusShipments.geniusShipmentId, geniusId))
        .limit(1);

      if (!row) {
        res.status(404).json({ error: "Shipment not found" });
        return;
      }

      res.json(row);
    } catch (err) {
      console.error("[GeniusShipments] GET /api/shipments/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
```

### 2d. Register the routes in `server/_core/index.ts`

Add these two lines to `server/_core/index.ts`:

```typescript
// At the top, with other imports:
import { registerGeniusShipmentRoutes } from "../cortex/geniusShipments";

// Inside startServer(), after registerCortexRoutes(app):
registerGeniusShipmentRoutes(app);
```

### 2e. Add the `GENIUS_API_KEY` secret

In the ClearSight Manus project, add a secret:

| Key | Value |
|---|---|
| `GENIUS_API_KEY` | *(same value as the Outbound API Key you set in GD Genius Cortex Connections)* |

---

## Step 3 — Verify the connection

Once both sides are configured, you can test the connection from GD Genius:

1. Go to **Settings → Integrations → Cortex** in GD Genius
2. Click **Test Connection** next to the ClearSight entry
3. You should see a `200 OK` response

Or test manually with curl:

```bash
curl -X POST https://gdclearsight-xcskq7et.manus.space/api/shipments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -d '{
    "event": "shipment.created",
    "timestamp": "2026-04-09T15:00:00.000Z",
    "data": {
      "geniusShipmentId": 999,
      "platform": "manual",
      "mode": "small_parcel",
      "orderNumber": "TEST-001",
      "customerName": "Test Customer",
      "facilityName": "TOR-Toronto",
      "trackingNumber": "1Z999AA10123456784",
      "carrier": "UPS",
      "serviceLevel": "Ground",
      "status": "booked",
      "createdAt": "2026-04-09T15:00:00.000Z",
      "updatedAt": "2026-04-09T15:00:00.000Z"
    }
  }'
```

Expected response: `{"success": true, "geniusShipmentId": 999}`

---

## Payload reference

Every push from GD Genius includes this payload structure:

```json
{
  "event": "shipment.created | shipment.updated",
  "timestamp": "ISO 8601 UTC",
  "data": {
    "geniusShipmentId": 123,
    "platform": "veeqo | techship | shipwell | manual",
    "mode": "small_parcel | ltl | ftl | other",
    "orderNumber": "143356175",
    "extensivOrderId": 3276501,
    "customerName": "Acme Corp",
    "facilityName": "TOR-Toronto",
    "shipToName": "John Smith",
    "shipToCity": "Toronto",
    "shipToState": "ON",
    "shipToZip": "M5V 3A8",
    "shipToCountry": "CA",
    "carrier": "FedEx",
    "serviceLevel": "Ground",
    "carrierScac": "FXFE",
    "trackingNumber": "1234567890",
    "bolNumber": "BOL-2026-001",
    "proNumber": "PRO-98765",
    "status": "booked | in_transit | delivered | exception | voided",
    "shipwellStatus": "quoting | tendered | carrier_confirmed | in_transit | delivered",
    "estimatedDeliveryAt": "2026-04-12T00:00:00.000Z",
    "deliveredAt": null,
    "labelCostCents": 1250,
    "currency": "USD",
    "labelUrl": "https://app.veeqo.com/shipments/123",
    "createdAt": "2026-04-09T15:00:00.000Z",
    "updatedAt": "2026-04-09T15:00:00.000Z"
  }
}
```

---

## Push timing

| Event | When |
|---|---|
| `shipment.created` | Immediately when a label is purchased or LTL order sent to Shipwell |
| `shipment.created` | Immediately when a manual tracking number is recorded |
| `shipment.updated` | Every 15 minutes when Shipwell assigns PRO/BOL/tracking numbers |
| `shipment.updated` | Immediately when a user updates tracking info in Shipping History |
| Retry | Every 30 minutes for failed pushes (up to 5 attempts) |
