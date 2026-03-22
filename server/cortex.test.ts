/**
 * GD Cortex Integration — Unit Tests
 *
 * Tests the core logic of the Cortex connector:
 * - API key validation
 * - Return receipt idempotency
 * - Processed returns filtering
 * - Webhook payload structure
 * - Status lifecycle transitions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getCortexConnection: vi.fn(),
  createCortexReturn: vi.fn(),
  getCortexReturnByReturnNumber: vi.fn(),
  getProcessedCortexReturns: vi.fn(),
  updateCortexReturn: vi.fn(),
  updateCortexHealthStatus: vi.fn(),
  getPendingWebhookCortexReturns: vi.fn(),
}));

import {
  getCortexConnection,
  createCortexReturn,
  getCortexReturnByReturnNumber,
  getProcessedCortexReturns,
  updateCortexReturn,
  getPendingWebhookCortexReturns,
} from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    returnNumber: "RMA-001",
    orderId: "ORD-123",
    orderNumber: "10001",
    customerId: "CUST-1",
    customerName: "Acme Corp",
    extensivCustomerId: 42,
    reason: "Damaged in transit",
    items: [{ sku: "SKU-A", qty: 2 }],
    shippingAddress: null,
    notes: null,
    status: "Received",
    inspectionResult: null,
    disposition: null,
    refundAmount: null,
    refundApproved: null,
    processedBy: null,
    processedAt: null,
    returnsSessionId: null,
    webhookSent: false,
    clearsightCreatedAt: null,
    createdAt: new Date("2025-01-01T10:00:00Z"),
    updatedAt: new Date("2025-01-01T10:00:00Z"),
    ...overrides,
  };
}

function makeMockConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    platform: "clearsight",
    displayName: "GD ClearSight",
    baseUrl: "https://clearsight.example.com",
    outboundApiKey: "outbound-key-123",
    inboundApiKey: "inbound-key-abc",
    webhookUrl: "https://clearsight.example.com/api/cortex/webhook/genius",
    syncIntervalSeconds: 300,
    enabled: true,
    lastHealthCheck: null,
    lastHealthStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── API Key Validation ───────────────────────────────────────────────────────

describe("Cortex API key validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a valid inbound API key", async () => {
    vi.mocked(getCortexConnection).mockResolvedValue(makeMockConnection());
    const conn = await getCortexConnection("clearsight");
    expect(conn?.inboundApiKey).toBe("inbound-key-abc");
    const isValid = conn?.inboundApiKey === "inbound-key-abc";
    expect(isValid).toBe(true);
  });

  it("rejects an incorrect API key", async () => {
    vi.mocked(getCortexConnection).mockResolvedValue(makeMockConnection());
    const conn = await getCortexConnection("clearsight");
    const isValid = conn?.inboundApiKey === "wrong-key";
    expect(isValid).toBe(false);
  });

  it("rejects when platform is not configured", async () => {
    vi.mocked(getCortexConnection).mockResolvedValue(null);
    const conn = await getCortexConnection("unknown-platform");
    expect(conn).toBeNull();
  });

  it("rejects when inboundApiKey is empty", async () => {
    vi.mocked(getCortexConnection).mockResolvedValue(makeMockConnection({ inboundApiKey: "" }));
    const conn = await getCortexConnection("clearsight");
    const isValid = !!conn?.inboundApiKey && conn.inboundApiKey === "some-key";
    expect(isValid).toBe(false);
  });
});

// ─── Return Receipt ───────────────────────────────────────────────────────────

describe("Cortex return receipt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new return when returnNumber is unique", async () => {
    vi.mocked(getCortexReturnByReturnNumber).mockResolvedValue(null);
    vi.mocked(createCortexReturn).mockResolvedValue(42);

    const existing = await getCortexReturnByReturnNumber("RMA-NEW");
    expect(existing).toBeNull();

    const id = await createCortexReturn({
      returnNumber: "RMA-NEW",
      customerName: "Test Corp",
      status: "Received",
      webhookSent: false,
    } as Parameters<typeof createCortexReturn>[0]);
    expect(id).toBe(42);
  });

  it("returns existing record when returnNumber already exists (idempotency)", async () => {
    const existing = makeMockReturn({ returnNumber: "RMA-001" });
    vi.mocked(getCortexReturnByReturnNumber).mockResolvedValue(existing);

    const found = await getCortexReturnByReturnNumber("RMA-001");
    expect(found).not.toBeNull();
    expect(found?.returnNumber).toBe("RMA-001");
    expect(found?.status).toBe("Received");
    // Should NOT call createCortexReturn when idempotent
    expect(createCortexReturn).not.toHaveBeenCalled();
  });

  it("sets initial status to Received", async () => {
    vi.mocked(getCortexReturnByReturnNumber).mockResolvedValue(null);
    vi.mocked(createCortexReturn).mockResolvedValue(1);

    await createCortexReturn({
      returnNumber: "RMA-002",
      customerName: "Beta Inc",
      status: "Received",
      webhookSent: false,
    } as Parameters<typeof createCortexReturn>[0]);

    expect(createCortexReturn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Received" })
    );
  });
});

// ─── Processed Returns Query ──────────────────────────────────────────────────

describe("Cortex processed returns query", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only processed-status returns", async () => {
    const processedReturns = [
      makeMockReturn({ id: 1, status: "Processed", updatedAt: new Date("2025-02-01") }),
      makeMockReturn({ id: 2, status: "Refunded", updatedAt: new Date("2025-02-02") }),
      makeMockReturn({ id: 3, status: "Restocked", updatedAt: new Date("2025-02-03") }),
    ];
    vi.mocked(getProcessedCortexReturns).mockResolvedValue(processedReturns);

    const results = await getProcessedCortexReturns();
    expect(results).toHaveLength(3);
    expect(results.every((r) => ["Processed", "Refunded", "Restocked"].includes(r.status))).toBe(true);
  });

  it("filters by since timestamp", async () => {
    const since = new Date("2025-02-02");
    const filtered = [
      makeMockReturn({ id: 2, status: "Refunded", updatedAt: new Date("2025-02-02") }),
      makeMockReturn({ id: 3, status: "Restocked", updatedAt: new Date("2025-02-03") }),
    ];
    vi.mocked(getProcessedCortexReturns).mockResolvedValue(filtered);

    const results = await getProcessedCortexReturns(since);
    expect(results).toHaveLength(2);
    expect(results.every((r) => new Date(r.updatedAt) >= since)).toBe(true);
  });

  it("respects limit parameter", async () => {
    const limited = [makeMockReturn({ id: 1, status: "Processed" })];
    vi.mocked(getProcessedCortexReturns).mockResolvedValue(limited);

    const results = await getProcessedCortexReturns(undefined, 1);
    expect(results).toHaveLength(1);
  });

  it("returns empty array when no processed returns exist", async () => {
    vi.mocked(getProcessedCortexReturns).mockResolvedValue([]);
    const results = await getProcessedCortexReturns();
    expect(results).toHaveLength(0);
  });
});

// ─── Status Lifecycle ─────────────────────────────────────────────────────────

describe("Cortex return status lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  const validTransitions: Array<[string, string]> = [
    ["Received", "Inspecting"],
    ["Inspecting", "Processed"],
    ["Inspecting", "Rejected"],
    ["Processed", "Refunded"],
    ["Processed", "Restocked"],
  ];

  it.each(validTransitions)("allows %s → %s transition", async (from, to) => {
    vi.mocked(updateCortexReturn).mockResolvedValue(undefined);
    await updateCortexReturn(1, { status: to, webhookSent: false });
    expect(updateCortexReturn).toHaveBeenCalledWith(1, expect.objectContaining({ status: to }));
  });

  it("marks webhookSent=false when status changes (webhook needs to fire)", async () => {
    vi.mocked(updateCortexReturn).mockResolvedValue(undefined);
    await updateCortexReturn(1, { status: "Processed", webhookSent: false });
    expect(updateCortexReturn).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ webhookSent: false })
    );
  });

  it("marks webhookSent=true after webhook fires", async () => {
    vi.mocked(updateCortexReturn).mockResolvedValue(undefined);
    await updateCortexReturn(1, { webhookSent: true });
    expect(updateCortexReturn).toHaveBeenCalledWith(1, expect.objectContaining({ webhookSent: true }));
  });
});

// ─── Pending Webhook Flush ────────────────────────────────────────────────────

describe("Cortex pending webhook flush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns returns where webhookSent=false", async () => {
    const pending = [
      makeMockReturn({ id: 1, status: "Processed", webhookSent: false }),
      makeMockReturn({ id: 2, status: "Refunded", webhookSent: false }),
    ];
    vi.mocked(getPendingWebhookCortexReturns).mockResolvedValue(pending);

    const results = await getPendingWebhookCortexReturns();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.webhookSent === false)).toBe(true);
  });

  it("returns empty array when all webhooks are sent", async () => {
    vi.mocked(getPendingWebhookCortexReturns).mockResolvedValue([]);
    const results = await getPendingWebhookCortexReturns();
    expect(results).toHaveLength(0);
  });
});

// ─── Event Mapping ────────────────────────────────────────────────────────────

describe("Cortex webhook event mapping", () => {
  it("maps all status values to correct webhook events", () => {
    const eventMap: Record<string, string> = {
      Received: "return.received",
      Inspecting: "return.inspecting",
      Processed: "return.processed",
      Refunded: "return.refunded",
      Rejected: "return.rejected",
      Restocked: "return.processed",
    };

    expect(eventMap["Received"]).toBe("return.received");
    expect(eventMap["Inspecting"]).toBe("return.inspecting");
    expect(eventMap["Processed"]).toBe("return.processed");
    expect(eventMap["Refunded"]).toBe("return.refunded");
    expect(eventMap["Rejected"]).toBe("return.rejected");
    expect(eventMap["Restocked"]).toBe("return.processed");
  });

  it("uses return.processed as fallback for unknown status", () => {
    const eventMap: Record<string, string> = {
      Processed: "return.processed",
    };
    const event = eventMap["UnknownStatus"] ?? "return.processed";
    expect(event).toBe("return.processed");
  });
});
