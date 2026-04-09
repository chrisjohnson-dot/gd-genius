/**
 * Tests for the Veeqo Rate Shopping API client (server/veeqo.ts)
 *
 * These tests use vi.mock to intercept fetch calls so no real network
 * traffic is generated.  They verify:
 *   1. getRates — builds the correct request body and parses the response
 *   2. bookShipment — builds the correct request body and parses the response
 *   3. Error handling — throws a descriptive error on non-2xx responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVeeqoClient, type VeeqoAddress } from "./veeqo.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SHIP_FROM: VeeqoAddress = {
  name: "Go Direct Logistics",
  address1: "123 Warehouse Blvd",
  city: "Calgary",
  state: "AB",
  zip: "T2P 1J9",
  country: "CA",
  is_residential: false,
};

const SHIP_TO: VeeqoAddress = {
  name: "Test Customer",
  address1: "456 Main St",
  city: "Toronto",
  state: "ON",
  zip: "M5V 2T6",
  country: "CA",
  is_residential: false,
};

const MOCK_RATES_RESPONSE = {
  request_token: "tok_abc123",
  available: [
    {
      remote_shipment_id: "ship_001",
      code: "canada_post-regular_parcel",
      carrier: "canada_post",
      title: "Regular Parcel",
      short_title: "Regular Parcel",
      total_net_charge: "12.50",
      total_gross_charge: "12.50",
      base_rate: "10.00",
      currency: "CAD",
      request_token: "tok_abc123",
      expected_delivery_days: 5,
      sub_carrier_id: "CANADA_POST",
      service_carrier: "canada_post",
      charges: [
        { price: "2.50", charge_id: "fuel", charge_title: "Fuel Surcharge", charge_type: "OPTIONAL" },
      ],
      cutoff: null,
      mailpiece_shapes: null,
      liability_amount: null,
    },
    {
      remote_shipment_id: "ship_002",
      code: "purolator-ground",
      carrier: "purolator",
      title: "Ground",
      short_title: "Ground",
      total_net_charge: "18.75",
      total_gross_charge: "18.75",
      base_rate: "16.00",
      currency: "CAD",
      request_token: "tok_abc123",
      expected_delivery_days: 3,
      sub_carrier_id: "PUROLATOR",
      service_carrier: "purolator",
      charges: [],
      cutoff: null,
      mailpiece_shapes: null,
      liability_amount: null,
    },
  ],
};

const MOCK_BOOK_RESPONSE = {
  id: "shipment_xyz",
  tracking_number: "1234567890CA",
  carrier: "canada_post",
  service: "Regular Parcel",
  label_format: "zpl",
  label_content: Buffer.from("^XA^FDTest Label^XZ").toString("base64"),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createVeeqoClient", () => {
  const originalEnv = process.env.VEEQO_API_KEY;

  beforeEach(() => {
    process.env.VEEQO_API_KEY = "test-api-key-12345";
  });

  afterEach(() => {
    process.env.VEEQO_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  // ── getRates ────────────────────────────────────────────────────────────────

  describe("getRates", () => {
    it("calls the correct endpoint with the correct body", async () => {
      const fetchSpy = mockFetch(MOCK_RATES_RESPONSE);
      vi.stubGlobal("fetch", fetchSpy);

      const client = createVeeqoClient();
      await client.getRates({
        ship_from: SHIP_FROM,
        ship_to: SHIP_TO,
        packages: [{ weight: 40, length: 12, width: 9, height: 6 }],
        shipping_configuration_ids: [12345],
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain("/shipping/api/v1/rates");
      expect(opts.method).toBe("POST");
      expect(opts.headers["x-api-key"]).toBe("test-api-key-12345");

      const body = JSON.parse(opts.body);
      expect(body.ship_from.zip).toBe("T2P 1J9");
      expect(body.ship_to.zip).toBe("M5V 2T6");
      expect(body.packages[0].weight).toBe(40);
      expect(body.shipping_configuration_ids[0]).toBe(12345);
    });

    it("returns parsed rates with request_token", async () => {
      vi.stubGlobal("fetch", mockFetch(MOCK_RATES_RESPONSE));

      const client = createVeeqoClient();
      const result = await client.getRates({
        ship_from: SHIP_FROM,
        ship_to: SHIP_TO,
        packages: [{ weight: 16, length: 10, width: 8, height: 4 }],
        shipping_configuration_ids: [12345],
      });

      expect(result.request_token).toBe("tok_abc123");
      expect(result.available).toHaveLength(2);
      expect(result.available[0].code).toBe("canada_post-regular_parcel");
      expect(result.available[0].total_net_charge).toBe("12.50");
      expect(result.available[0].charges[0].charge_title).toBe("Fuel Surcharge");
    });

    it("throws a descriptive error on non-2xx response", async () => {
      vi.stubGlobal("fetch", mockFetch({ error: "Unauthorized" }, 401));

      const client = createVeeqoClient();
      await expect(
        client.getRates({
          ship_from: SHIP_FROM,
          ship_to: SHIP_TO,
          packages: [{ weight: 16, length: 10, width: 8, height: 4 }],
          shipping_configuration_ids: [12345],
        })
      ).rejects.toThrow(/401/);
    });
  });

  // ── bookShipment ────────────────────────────────────────────────────────────

  describe("bookShipment", () => {
    it("calls the correct endpoint with the correct body", async () => {
      const fetchSpy = mockFetch(MOCK_BOOK_RESPONSE);
      vi.stubGlobal("fetch", fetchSpy);

      const client = createVeeqoClient();
      await client.bookShipment({
        rate_id: "canada_post-regular_parcel",
        remote_shipment_id: "ship_001",
        request_token: "tok_abc123",
        notify_customer: false,
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain("/shipping/api/v1/shipments");
      expect(opts.method).toBe("POST");
      expect(opts.headers["x-api-key"]).toBe("test-api-key-12345");

      const body = JSON.parse(opts.body);
      expect(body.rate_id).toBe("canada_post-regular_parcel");
      expect(body.remote_shipment_id).toBe("ship_001");
      expect(body.request_token).toBe("tok_abc123");
      expect(body.notify_customer).toBe(false);
    });

    it("returns tracking number and label content", async () => {
      vi.stubGlobal("fetch", mockFetch(MOCK_BOOK_RESPONSE));

      const client = createVeeqoClient();
      const result = await client.bookShipment({
        rate_id: "canada_post-regular_parcel",
        remote_shipment_id: "ship_001",
        request_token: "tok_abc123",
        notify_customer: false,
      });

      expect(result.tracking_number).toBe("1234567890CA");
      expect(result.label_format).toBe("zpl");
      expect(result.label_content).toBeTruthy();
      // Verify the base64 decodes to the expected ZPL
      const decoded = Buffer.from(result.label_content!, "base64").toString("utf-8");
      expect(decoded).toContain("^XA");
    });

    it("throws a descriptive error on non-2xx response", async () => {
      vi.stubGlobal("fetch", mockFetch({ error: "Rate expired" }, 422));

      const client = createVeeqoClient();
      await expect(
        client.bookShipment({
          rate_id: "canada_post-regular_parcel",
          remote_shipment_id: "ship_001",
          request_token: "tok_abc123",
          notify_customer: false,
        })
      ).rejects.toThrow(/422/);
    });
  });

  // ── API key handling ────────────────────────────────────────────────────────

  describe("API key handling", () => {
    it("throws if VEEQO_API_KEY is not set", () => {
      delete process.env.VEEQO_API_KEY;
      expect(() => createVeeqoClient()).toThrow(/VEEQO_API_KEY/);
    });
  });
});
