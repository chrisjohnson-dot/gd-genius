/**
 * rateWizard.sessionFallback.test.ts
 *
 * Verifies that getLatestRatedShipmentBySessionId exists and returns the correct
 * row when a rate_wizard_shipments row was saved with a session_id (i.e. when
 * the small-parcel session has no Extensiv order ID).
 *
 * These tests use the real database (same as other server tests in this project).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { rateWizardShipments } from "../drizzle/schema";
import { getLatestRatedShipmentBySessionId, getLatestRatedShipmentForOrder } from "./db";
import { eq } from "drizzle-orm";

const TEST_SESSION_ID = 999_001; // synthetic session ID unlikely to collide with real data
const TEST_ORDER_ID = "TEST_ORDER_FALLBACK_001";

let insertedId: number | null = null;

beforeAll(async () => {
  const db = await getDb();
  if (!db) return;

  // Insert a synthetic rated shipment that has a session_id but no order_id
  const result = await db.insert(rateWizardShipments).values({
    configId: 1,
    sessionId: TEST_SESSION_ID,
    orderId: undefined,
    carrierCode: "fedex",
    serviceCode: "FEDEX_2_DAY_ONE_RATE",
    serviceName: "FedEx 2-Day One Rate",
    rateAmountCents: 1250,
    currency: "USD",
    weightOz: 8,
    status: "rated",
  });
  insertedId = (result as unknown as { insertId: number }).insertId ?? null;
});

afterAll(async () => {
  if (insertedId === null) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(rateWizardShipments).where(eq(rateWizardShipments.id, insertedId));
});

describe("getLatestRatedShipmentBySessionId", () => {
  it("returns the shipment row when looked up by session_id", async () => {
    const row = await getLatestRatedShipmentBySessionId(TEST_SESSION_ID);
    expect(row).not.toBeNull();
    expect(row?.sessionId).toBe(TEST_SESSION_ID);
    expect(row?.carrierCode).toBe("fedex");
    expect(row?.serviceCode).toBe("FEDEX_2_DAY_ONE_RATE");
  });

  it("returns null for a session_id that has no rows", async () => {
    const row = await getLatestRatedShipmentBySessionId(999_999_999);
    expect(row).toBeNull();
  });
});

describe("getLatestRatedShipmentForOrder (primary path still works)", () => {
  let orderId2InsertedId: number | null = null;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    const result = await db.insert(rateWizardShipments).values({
      configId: 1,
      orderId: TEST_ORDER_ID,
      carrierCode: "ups",
      serviceCode: "UPS_GROUND",
      serviceName: "UPS Ground",
      rateAmountCents: 800,
      currency: "USD",
      weightOz: 16,
      status: "rated",
    });
    orderId2InsertedId = (result as unknown as { insertId: number }).insertId ?? null;
  });

  afterAll(async () => {
    if (orderId2InsertedId === null) return;
    const db = await getDb();
    if (!db) return;
    await db.delete(rateWizardShipments).where(eq(rateWizardShipments.id, orderId2InsertedId));
  });

  it("returns the shipment row when looked up by order_id", async () => {
    const row = await getLatestRatedShipmentForOrder(TEST_ORDER_ID);
    expect(row).not.toBeNull();
    expect(row?.orderId).toBe(TEST_ORDER_ID);
    expect(row?.carrierCode).toBe("ups");
  });

  it("returns null for an order_id that has no rows", async () => {
    const row = await getLatestRatedShipmentForOrder("NONEXISTENT_ORDER_XYZ");
    expect(row).toBeNull();
  });
});
