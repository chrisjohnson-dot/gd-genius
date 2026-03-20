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
