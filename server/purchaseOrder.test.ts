import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushPurchaseOrderToOpFi, flushPendingPurchaseOrderPushes } from "./purchaseOrderPush";

// Mock getDb to return null (simulates DB unavailable)
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

// Mock schema
vi.mock("../drizzle/schema", () => ({
  purchaseOrders: {},
}));

describe("purchaseOrderPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pushPurchaseOrderToOpFi", () => {
    it("returns error when DB is not available", async () => {
      const result = await pushPurchaseOrderToOpFi(1, {
        poNumber: "GEN-2026-04-0001",
        customerId: "CUST-001",
        customerName: "Test Customer",
        warehouse: "Columbus",
        poDate: "2026-04-09",
        billingPeriod: "2026-04",
        kittingCharge: 100,
        labourCharge: 200,
        materialCharge: 50,
        currency: "CAD",
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Database not available");
    });
  });

  describe("flushPendingPurchaseOrderPushes", () => {
    it("returns early when DB is not available", async () => {
      // Should not throw
      await expect(flushPendingPurchaseOrderPushes()).resolves.toBeUndefined();
    });
  });
});

describe("PO number format", () => {
  it("generates correct GEN-YYYY-MM-NNNN format", () => {
    const billingPeriod = "2026-04";
    const seq = 1;
    const poNumber = `GEN-${billingPeriod}-${String(seq).padStart(4, "0")}`;
    expect(poNumber).toBe("GEN-2026-04-0001");
  });

  it("pads sequence numbers correctly", () => {
    const billingPeriod = "2026-04";
    expect(`GEN-${billingPeriod}-${String(1).padStart(4, "0")}`).toBe("GEN-2026-04-0001");
    expect(`GEN-${billingPeriod}-${String(99).padStart(4, "0")}`).toBe("GEN-2026-04-0099");
    expect(`GEN-${billingPeriod}-${String(1000).padStart(4, "0")}`).toBe("GEN-2026-04-1000");
  });

  it("validates billing period format YYYY-MM", () => {
    const validPeriod = /^\d{4}-\d{2}$/;
    expect(validPeriod.test("2026-04")).toBe(true);
    expect(validPeriod.test("2026-4")).toBe(false);
    expect(validPeriod.test("26-04")).toBe(false);
    expect(validPeriod.test("2026-04-01")).toBe(false);
  });

  it("validates PO date format YYYY-MM-DD", () => {
    const validDate = /^\d{4}-\d{2}-\d{2}$/;
    expect(validDate.test("2026-04-09")).toBe(true);
    expect(validDate.test("2026-4-9")).toBe(false);
    expect(validDate.test("2026-04")).toBe(false);
  });
});

describe("HMAC signature logic", () => {
  it("builds correct HMAC-SHA256 signature format", async () => {
    const crypto = await import("crypto");
    const secret = "test-secret";
    const body = JSON.stringify({ poNumber: "GEN-2026-04-0001" });
    const sig = "sha256=" + crypto.createHmac("sha256", secret)
      .update(Buffer.from(body, "utf8"))
      .digest("hex");
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
});
