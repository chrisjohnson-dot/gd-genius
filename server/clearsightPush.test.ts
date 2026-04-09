/**
 * Tests for the ClearSight shipment push service.
 *
 * Tests the pushShipmentToClearSight function and buildShipmentPayload logic
 * using mocked DB helpers and fetch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB helpers ──────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getCortexConnection: vi.fn(),
  updateShipment: vi.fn().mockResolvedValue(undefined),
  getShipmentById: vi.fn(),
  getPendingWebhookCortexReturns: vi.fn().mockResolvedValue([]),
  updateCortexReturn: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock global fetch ────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Import after mocks ───────────────────────────────────────────────────────
import { pushShipmentToClearSight, flushPendingShipmentPushes } from "./cortex/webhook";
import { getCortexConnection, updateShipment, getShipmentById } from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    platform: "veeqo",
    mode: "small_parcel",
    orderNumber: "ORD-001",
    extensivOrderId: 1001,
    customerName: "Acme Corp",
    facilityName: "TOR-Toronto",
    shipToName: "Jane Doe",
    shipToCity: "Toronto",
    shipToState: "ON",
    shipToZip: "M5V 3A8",
    shipToCountry: "CA",
    carrier: "FedEx",
    serviceLevel: "Ground",
    carrierScac: "FXFE",
    trackingNumber: "1234567890",
    bolNumber: null,
    proNumber: null,
    status: "booked",
    shipwellStatus: null,
    estimatedDeliveryAt: null,
    deliveredAt: null,
    labelCostCents: 1250,
    currency: "USD",
    labelUrl: "https://example.com/label.pdf",
    clearSightPushStatus: null,
    clearSightPushAttempts: 0,
    clearSightPushError: null,
    clearSightLastPushedAt: null,
    createdAt: new Date("2026-04-09T10:00:00Z"),
    updatedAt: new Date("2026-04-09T10:00:00Z"),
    ...overrides,
  };
}

function makeCortexConn(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    platform: "clearsight",
    enabled: true,
    webhookUrl: "https://gdclearsight-xcskq7et.manus.space/api/shipments",
    outboundApiKey: "cs_test_key_abc123",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("pushShipmentToClearSight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks shipment as 'pending' when ClearSight is not configured", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(makeShipment() as any);
    vi.mocked(getCortexConnection).mockResolvedValue(null);

    await pushShipmentToClearSight(42, "shipment.created");

    expect(updateShipment).toHaveBeenCalledWith(42, {
      clearSightPushStatus: "pending",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("marks shipment as 'pending' when ClearSight connection is disabled", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(makeShipment() as any);
    vi.mocked(getCortexConnection).mockResolvedValue(makeCortexConn({ enabled: false }) as any);

    await pushShipmentToClearSight(42, "shipment.created");

    expect(updateShipment).toHaveBeenCalledWith(42, {
      clearSightPushStatus: "pending",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("marks shipment as 'sent' on successful push", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(makeShipment() as any);
    vi.mocked(getCortexConnection).mockResolvedValue(makeCortexConn() as any);
    mockFetch.mockResolvedValue({ ok: true });

    await pushShipmentToClearSight(42, "shipment.created");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://gdclearsight-xcskq7et.manus.space/api/shipments");
    expect(opts.method).toBe("POST");
    expect(opts.headers["X-API-Key"]).toBe("cs_test_key_abc123");

    const body = JSON.parse(opts.body);
    expect(body.event).toBe("shipment.created");
    expect(body.data.geniusShipmentId).toBe(42);
    expect(body.data.orderNumber).toBe("ORD-001");
    expect(body.data.trackingNumber).toBe("1234567890");

    expect(updateShipment).toHaveBeenCalledWith(42, expect.objectContaining({
      clearSightPushStatus: "sent",
      clearSightPushAttempts: 1,
    }));
  });

  it("marks shipment as 'failed' on HTTP error response", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(makeShipment() as any);
    vi.mocked(getCortexConnection).mockResolvedValue(makeCortexConn() as any);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await pushShipmentToClearSight(42, "shipment.created");

    expect(updateShipment).toHaveBeenCalledWith(42, expect.objectContaining({
      clearSightPushStatus: "failed",
      clearSightPushAttempts: 1,
      clearSightPushError: expect.stringContaining("401"),
    }));
  });

  it("marks shipment as 'failed' on network error", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(makeShipment() as any);
    vi.mocked(getCortexConnection).mockResolvedValue(makeCortexConn() as any);
    mockFetch.mockRejectedValue(new Error("Network timeout"));

    await pushShipmentToClearSight(42, "shipment.created");

    expect(updateShipment).toHaveBeenCalledWith(42, expect.objectContaining({
      clearSightPushStatus: "failed",
      clearSightPushError: "Network timeout",
    }));
  });

  it("skips gracefully when shipment does not exist", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(null);

    await pushShipmentToClearSight(999, "shipment.created");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(updateShipment).not.toHaveBeenCalled();
  });

  it("increments attempt count correctly on retry", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(
      makeShipment({ clearSightPushAttempts: 3 }) as any
    );
    vi.mocked(getCortexConnection).mockResolvedValue(makeCortexConn() as any);
    mockFetch.mockResolvedValue({ ok: true });

    await pushShipmentToClearSight(42, "shipment.updated");

    expect(updateShipment).toHaveBeenCalledWith(42, expect.objectContaining({
      clearSightPushStatus: "sent",
      clearSightPushAttempts: 4,
    }));
  });

  it("sends correct payload for LTL shipment with BOL and PRO", async () => {
    vi.mocked(getShipmentById).mockResolvedValue(
      makeShipment({
        platform: "shipwell",
        mode: "ltl",
        bolNumber: "BOL-2026-001",
        proNumber: "PRO-98765",
        trackingNumber: null,
        carrier: "XPO Logistics",
        carrierScac: "XPOL",
      }) as any
    );
    vi.mocked(getCortexConnection).mockResolvedValue(makeCortexConn() as any);
    mockFetch.mockResolvedValue({ ok: true });

    await pushShipmentToClearSight(42, "shipment.updated");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("shipment.updated");
    expect(body.data.platform).toBe("shipwell");
    expect(body.data.mode).toBe("ltl");
    expect(body.data.bolNumber).toBe("BOL-2026-001");
    expect(body.data.proNumber).toBe("PRO-98765");
    expect(body.data.trackingNumber).toBeNull();
    expect(body.data.carrierScac).toBe("XPOL");
  });
});

describe("flushPendingShipmentPushes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw when no pending shipments exist", async () => {
    // Mock getDb to return a fake db that returns empty array
    vi.doMock("./db", async () => ({
      getCortexConnection: vi.fn().mockResolvedValue(null),
      updateShipment: vi.fn().mockResolvedValue(undefined),
      getShipmentById: vi.fn().mockResolvedValue(null),
      getPendingWebhookCortexReturns: vi.fn().mockResolvedValue([]),
      updateCortexReturn: vi.fn().mockResolvedValue(undefined),
      getDb: vi.fn().mockResolvedValue(null),
    }));

    await expect(flushPendingShipmentPushes()).resolves.not.toThrow();
  });
});
