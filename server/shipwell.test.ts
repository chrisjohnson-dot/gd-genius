/**
 * Tests for the Shipwell API client and integration helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShipwellClient, createShipwellClient } from "./shipwell/api";

// ─── Mock axios ───────────────────────────────────────────────────────────────
vi.mock("axios", () => {
  const mockPost = vi.fn();
  const mockGet = vi.fn();
  const create = vi.fn(() => ({ post: mockPost, get: mockGet }));
  return { default: { create }, create };
});

import axios from "axios";

function getMockHttp() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (axios.create as any).mock.results[0]?.value ?? (axios.create as any)();
}

// ─── ShipwellClient unit tests ────────────────────────────────────────────────
describe("ShipwellClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an axios instance with the sandbox base URL", () => {
    new ShipwellClient("test@example.com", "secret", "sandbox");
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://sandbox-api.shipwell.com" })
    );
  });

  it("creates an axios instance with the production base URL", () => {
    new ShipwellClient("test@example.com", "secret", "production");
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.shipwell.com" })
    );
  });

  it("authenticates and caches the token", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_abc123", api_key: null } });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const token = await client.authenticate();

    expect(token).toBe("tok_abc123");
    expect(http.post).toHaveBeenCalledWith("/v2/auth/token/", {
      email: "test@example.com",
      password: "secret",
    });
  });

  it("returns cached token on second call without re-authenticating", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_cached", api_key: null } });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    await client.authenticate();
    await client.authenticate(); // second call — should use cache

    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it("verifyCredentials returns valid=true on success", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_verify", api_key: null } });
    http.get.mockResolvedValueOnce({
      data: { email: "test@example.com", first_name: "John", last_name: "Doe" },
    });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const result = await client.verifyCredentials();

    expect(result.valid).toBe(true);
    expect(result.user?.email).toBe("test@example.com");
  });

  it("verifyCredentials returns valid=false on auth failure", async () => {
    const http = getMockHttp();
    http.post.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const client = new ShipwellClient("test@example.com", "wrong", "sandbox");
    const result = await client.verifyCredentials();

    expect(result.valid).toBe(false);
    expect(result.user).toBeUndefined();
  });

  it("createPurchaseOrder sends correct payload and returns PO", async () => {
    const http = getMockHttp();
    http.post
      .mockResolvedValueOnce({ data: { token: "tok_po", api_key: null } }) // auth
      .mockResolvedValueOnce({
        data: {
          id: "po-uuid-123",
          order_number: "3214839",
          purchase_order_number: "PO-001",
          overall_status: "UNASSIGNED",
        },
      }); // create PO

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const po = await client.createPurchaseOrder({
      order_number: "3214839",
      purchase_order_number: "PO-001",
      origin_address: { address_1: "123 Warehouse St", city: "Toronto", country: "CA" },
      destination_address: { address_1: "456 Customer Ave", city: "Columbus", country: "CA" },
      source: "SHIPWELL_WEB",
    });

    expect(po.id).toBe("po-uuid-123");
    expect(po.order_number).toBe("3214839");
    expect(http.post).toHaveBeenCalledWith(
      "/v2/purchase-orders/",
      expect.objectContaining({ order_number: "3214839", source: "SHIPWELL_WEB" }),
      expect.objectContaining({ headers: { Authorization: "Token tok_po" } })
    );
  });

  it("getPoUrl returns sandbox deep link for sandbox environment", () => {
    const client = new ShipwellClient("a@b.com", "x", "sandbox");
    const url = client.getPoUrl("po-uuid-abc");
    expect(url).toBe("https://sandbox.shipwell.com/purchase-orders/po-uuid-abc");
  });

  it("getPoUrl returns production deep link for production environment", () => {
    const client = new ShipwellClient("a@b.com", "x", "production");
    const url = client.getPoUrl("po-uuid-abc");
    expect(url).toBe("https://app.shipwell.com/purchase-orders/po-uuid-abc");
  });
});

// ─── createShipwellClient factory ─────────────────────────────────────────────
describe("createShipwellClient", () => {
  it("returns a ShipwellClient instance", () => {
    const client = createShipwellClient({
      email: "test@example.com",
      password: "secret",
      environment: "sandbox",
    });
    expect(client).toBeInstanceOf(ShipwellClient);
  });
});

// ─── normalizeShipwellStatus ──────────────────────────────────────────────────
import { normalizeShipwellStatus } from "./shipwell/api";

describe("normalizeShipwellStatus", () => {
  it("maps 'DELIVERED' to 'delivered'", () => {
    expect(normalizeShipwellStatus("DELIVERED")).toBe("delivered");
  });

  it("maps 'In Transit' to 'in_transit'", () => {
    expect(normalizeShipwellStatus("In Transit")).toBe("in_transit");
  });

  it("maps 'CARRIER_CONFIRMED' to 'carrier_confirmed'", () => {
    expect(normalizeShipwellStatus("CARRIER_CONFIRMED")).toBe("carrier_confirmed");
  });

  it("maps 'TENDERED' to 'tendered'", () => {
    expect(normalizeShipwellStatus("TENDERED")).toBe("tendered");
  });

  it("maps 'quoting' to 'quoting'", () => {
    expect(normalizeShipwellStatus("quoting")).toBe("quoting");
  });

  it("maps null to 'unknown'", () => {
    expect(normalizeShipwellStatus(null)).toBe("unknown");
  });

  it("maps unknown string to 'unknown'", () => {
    expect(normalizeShipwellStatus("SOME_WEIRD_STATUS")).toBe("unknown");
  });
});

// ─── getShipmentStatus ────────────────────────────────────────────────────────
describe("ShipwellClient.getShipmentStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches shipment status and normalizes it", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_ship", api_key: null } });
    http.get.mockResolvedValueOnce({ data: { id: "ship-123", status: "In Transit" } });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const result = await client.getShipmentStatus("ship-123");

    expect(result.shipmentId).toBe("ship-123");
    expect(result.rawStatus).toBe("In Transit");
    expect(result.normalizedStatus).toBe("in_transit");
    expect(result.isDelivered).toBe(false);
  });

  it("returns isDelivered=true for DELIVERED status", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_del", api_key: null } });
    http.get.mockResolvedValueOnce({ data: { id: "ship-456", status: "DELIVERED" } });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const result = await client.getShipmentStatus("ship-456");

    expect(result.isDelivered).toBe(true);
    expect(result.normalizedStatus).toBe("delivered");
  });

  it("getShipmentUrl returns sandbox URL", () => {
    const client = new ShipwellClient("a@b.com", "x", "sandbox");
    expect(client.getShipmentUrl("ship-abc")).toBe("https://sandbox.shipwell.com/shipments/ship-abc");
  });

  it("getShipmentUrl returns production URL", () => {
    const client = new ShipwellClient("a@b.com", "x", "production");
    expect(client.getShipmentUrl("ship-abc")).toBe("https://app.shipwell.com/shipments/ship-abc");
  });
});

// ─── batchGetShipmentStatuses ─────────────────────────────────────────────────
describe("ShipwellClient.batchGetShipmentStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a map with statuses for all shipment IDs", async () => {
    const http = getMockHttp();
    // auth token
    http.post.mockResolvedValue({ data: { token: "tok_batch", api_key: null } });
    // two shipment GET calls
    http.get
      .mockResolvedValueOnce({ data: { id: "s1", status: "TENDERED" } })
      .mockResolvedValueOnce({ data: { id: "s2", status: "DELIVERED" } });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const map = await client.batchGetShipmentStatuses(["s1", "s2"]);

    expect(map.get("s1")?.normalizedStatus).toBe("tendered");
    expect(map.get("s2")?.isDelivered).toBe(true);
  });

  it("marks failed shipment IDs as unknown without throwing", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValue({ data: { token: "tok_err", api_key: null } });
    http.get.mockRejectedValue(new Error("Network error"));

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const map = await client.batchGetShipmentStatuses(["s-fail"]);

    expect(map.get("s-fail")?.normalizedStatus).toBe("unknown");
    expect(map.get("s-fail")?.isDelivered).toBe(false);
  });
});

// ─── getBidCount ──────────────────────────────────────────────────────────────
describe("ShipwellClient.getBidCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns total_count from the carrier-bids endpoint", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_bids", api_key: null } });
    http.get.mockResolvedValueOnce({
      data: { page_size: 1, results: [], total_count: 5, total_pages: 1 },
    });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const count = await client.getBidCount("ship-uuid-123");

    expect(count).toBe(5);
    expect(http.get).toHaveBeenCalledWith(
      "/v2/quoting/carrier-bids/",
      expect.objectContaining({
        params: { shipment_id: "ship-uuid-123", "page-size": 1 },
      })
    );
  });

  it("returns 0 when total_count is 0", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_zero", api_key: null } });
    http.get.mockResolvedValueOnce({
      data: { page_size: 1, results: [], total_count: 0, total_pages: 0 },
    });

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const count = await client.getBidCount("ship-no-bids");

    expect(count).toBe(0);
  });

  it("returns 0 without throwing when the API call fails", async () => {
    const http = getMockHttp();
    http.post.mockResolvedValueOnce({ data: { token: "tok_fail", api_key: null } });
    http.get.mockRejectedValueOnce(new Error("Network error"));

    const client = new ShipwellClient("test@example.com", "secret", "sandbox");
    const count = await client.getBidCount("ship-error");

    expect(count).toBe(0);
  });
});
