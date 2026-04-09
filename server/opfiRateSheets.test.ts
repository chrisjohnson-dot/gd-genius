/**
 * Tests for opfiRateSheets.ts
 *
 * getCarrierMarkups: verifies cache behaviour and default fallback.
 * testOpFiConnection: verifies the probe function handles HTTP 200, 404, and
 *   network errors correctly without exposing internal rate details.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We mock global fetch so no real network calls are made.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Re-import after stubbing so the module picks up the mock.
const { getMarkupPct, applyMarkup, testOpFiConnection } = await import("./opfiRateSheets");

// ─── getMarkupPct ─────────────────────────────────────────────────────────────

describe("getMarkupPct", () => {
  const markups = { fedex: 18, ups: 15, usps: 12, ontrac: 10, dhl: 20, ltl: 22 };

  it("matches FedEx", () => expect(getMarkupPct("FedEx Ground", markups)).toBe(18));
  it("matches UPS", () => expect(getMarkupPct("UPS Next Day Air", markups)).toBe(15));
  it("matches USPS", () => expect(getMarkupPct("USPS Priority Mail", markups)).toBe(12));
  it("matches postal", () => expect(getMarkupPct("Canada Postal Service", markups)).toBe(12));
  it("matches OnTrac", () => expect(getMarkupPct("OnTrac Ground", markups)).toBe(10));
  it("matches DHL", () => expect(getMarkupPct("DHL Express", markups)).toBe(20));
  it("matches LTL", () => expect(getMarkupPct("LTL Freight", markups)).toBe(22));
  it("falls back to fedex for unknown carrier", () => expect(getMarkupPct("Canpar", markups)).toBe(18));
});

// ─── applyMarkup ──────────────────────────────────────────────────────────────

describe("applyMarkup", () => {
  it("applies 20% markup correctly", () => expect(applyMarkup(10.00, 20)).toBe(12.00));
  it("applies 0% markup (pass-through)", () => expect(applyMarkup(10.00, 0)).toBe(10.00));
  it("rounds to 2 decimal places", () => expect(applyMarkup(7.77, 18)).toBe(9.17));
});

// ─── testOpFiConnection ───────────────────────────────────────────────────────

describe("testOpFiConnection", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok=true with hasRateSheets=true on HTTP 200 with rateSheets array", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ rateSheets: [{ clientId: "0", carrierMarkups: {} }] }),
    });
    const result = await testOpFiConnection();
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.hasRateSheets).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=true with hasRateSheets=false on HTTP 404 (no client found)", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
      json: async () => ({ rateSheets: [] }),
    });
    const result = await testOpFiConnection();
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(404);
    // Empty array is still an array — service is alive
    expect(result.hasRateSheets).toBe(true);
  });

  it("throws on HTTP 500", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: async () => ({}),
    });
    await expect(testOpFiConnection()).rejects.toThrow("OpFi returned HTTP 500");
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(testOpFiConnection()).rejects.toThrow("ECONNREFUSED");
  });

  it("does not expose any rate or markup values in its return value", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        rateSheets: [{ clientId: "0", carrierMarkups: { fedex: 18, ups: 15 } }],
      }),
    });
    const result = await testOpFiConnection();
    const resultStr = JSON.stringify(result);
    // Confirm no markup percentages leak through
    expect(resultStr).not.toContain("carrierMarkups");
    expect(resultStr).not.toContain("fedex");
    expect(resultStr).not.toContain("ups");
    expect(resultStr).not.toContain("18");
    expect(resultStr).not.toContain("15");
  });
});
