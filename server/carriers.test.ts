/**
 * Carrier Rate Fetcher Tests
 *
 * Tests validate:
 * 1. Credential configuration — all secrets are present in the environment
 * 2. Module exports — all fetcher functions are exported correctly
 * 3. getCarrierConnectionStatus — returns correct connected state based on env vars
 * 4. hasAnyCarrierCredentials — returns true when at least one carrier is configured
 * 5. fetchAllCarrierRates — returns an array (may be empty if APIs are unreachable in test env)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── 1. Credential presence tests ─────────────────────────────────────────────
describe("Carrier API credentials", () => {
  it("USPS_EHUB_API_KEY is set", () => {
    expect(process.env.USPS_EHUB_API_KEY).toBeTruthy();
    expect(process.env.USPS_EHUB_API_KEY!.length).toBeGreaterThan(20);
  });

  it("FEDEX_USER_KEY is set", () => {
    expect(process.env.FEDEX_USER_KEY).toBeTruthy();
    expect(process.env.FEDEX_USER_KEY!.length).toBeGreaterThan(4);
  });

  it("FEDEX_PASSWORD is set", () => {
    expect(process.env.FEDEX_PASSWORD).toBeTruthy();
    expect(process.env.FEDEX_PASSWORD!.length).toBeGreaterThan(4);
  });

  it("UPS_REST_TOKEN is set", () => {
    expect(process.env.UPS_REST_TOKEN).toBeTruthy();
    expect(process.env.UPS_REST_TOKEN!.length).toBeGreaterThan(10);
  });

  it("ONTRAC_ACCOUNT is set", () => {
    expect(process.env.ONTRAC_ACCOUNT).toBeTruthy();
  });

  it("ONTRAC_PASSWORD is set", () => {
    expect(process.env.ONTRAC_PASSWORD).toBeTruthy();
    expect(process.env.ONTRAC_PASSWORD!.length).toBeGreaterThan(4);
  });

  it("DHL_USER_KEY is set", () => {
    expect(process.env.DHL_USER_KEY).toBeTruthy();
  });

  it("DHL_PASSWORD is set", () => {
    expect(process.env.DHL_PASSWORD).toBeTruthy();
    expect(process.env.DHL_PASSWORD!.length).toBeGreaterThan(4);
  });
});

// ── 2. Module export tests ────────────────────────────────────────────────────
describe("Carrier index module exports", () => {
  it("exports fetchAllCarrierRates function", async () => {
    const mod = await import("./carriers/index");
    expect(typeof mod.fetchAllCarrierRates).toBe("function");
  });

  it("exports getCarrierConnectionStatus function", async () => {
    const mod = await import("./carriers/index");
    expect(typeof mod.getCarrierConnectionStatus).toBe("function");
  });

  it("exports hasAnyCarrierCredentials function", async () => {
    const mod = await import("./carriers/index");
    expect(typeof mod.hasAnyCarrierCredentials).toBe("function");
  });
});

// ── 3. getCarrierConnectionStatus tests ──────────────────────────────────────
describe("getCarrierConnectionStatus", () => {
  it("returns connected=true for all five carriers when credentials are set", async () => {
    const { getCarrierConnectionStatus } = await import("./carriers/index");
    const status = getCarrierConnectionStatus();

    expect(status.usps.connected).toBe(true);
    expect(status.fedex.connected).toBe(true);
    expect(status.ups.connected).toBe(true);
    expect(status.ontrac.connected).toBe(true);
    expect(status.dhl.connected).toBe(true);
  });

  it("returns human-readable labels for each carrier", async () => {
    const { getCarrierConnectionStatus } = await import("./carriers/index");
    const status = getCarrierConnectionStatus();

    expect(status.usps.label).toContain("USPS");
    expect(status.fedex.label).toContain("FedEx");
    expect(status.ups.label).toContain("UPS");
    expect(status.ontrac.label).toContain("OnTrac");
    expect(status.dhl.label).toContain("DHL");
  });
});

// ── 4. hasAnyCarrierCredentials tests ────────────────────────────────────────
describe("hasAnyCarrierCredentials", () => {
  it("returns true when credentials are configured", async () => {
    const { hasAnyCarrierCredentials } = await import("./carriers/index");
    expect(hasAnyCarrierCredentials()).toBe(true);
  });
});

// ── 5. fetchAllCarrierRates smoke test ───────────────────────────────────────
describe("fetchAllCarrierRates", () => {
  it("returns an array (may be empty in test environment without live API access)", async () => {
    const { fetchAllCarrierRates } = await import("./carriers/index");
    const input = {
      originName: "Go Direct Logistics",
      originAddress1: "3450 Depot Rd",
      originCity: "Hayward",
      originState: "CA",
      originPostal: "94545",
      originCountry: "US",
      destPostal: "90210",
      destCountry: "US",
      destState: "CA",
      isResidential: false,
      weightLbs: 2.5,
      lengthIn: 12,
      widthIn: 8,
      heightIn: 6,
    };

    // This may return [] if carrier APIs are unreachable from test env
    // The important thing is it doesn't throw
    const rates = await fetchAllCarrierRates(input);
    expect(Array.isArray(rates)).toBe(true);

    // If rates are returned, validate their shape
    for (const rate of rates) {
      expect(rate.rateId).toBeTruthy();
      expect(rate.carrierCode).toBeTruthy();
      expect(rate.carrierName).toBeTruthy();
      expect(rate.service).toBeTruthy();
      expect(typeof rate.totalCost).toBe("number");
      expect(rate.totalCost).toBeGreaterThan(0);
      expect(typeof rate.transitDays).toBe("number");
      expect(rate.isLive).toBe(true);
      expect(["usps", "fedex", "ups", "ontrac", "dhl"]).toContain(rate.source);
    }
  }, 30_000); // 30s timeout for live API calls
});
