/**
 * Tests for the Production Line verdict engine and tRPC procedures.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock db helpers ────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  createProductionRun: vi.fn(),
  getActiveProductionRun: vi.fn(),
  getProductionRunById: vi.fn(),
  updateProductionRun: vi.fn(),
  createProductionScan: vi.fn(),
  listProductionScans: vi.fn(),
  getProductionSkuConfig: vi.fn(),
  getLabelScanSettings: vi.fn(),
}));

import {
  createProductionRun,
  getActiveProductionRun,
  getProductionRunById,
  updateProductionRun,
  createProductionScan,
  listProductionScans,
  getProductionSkuConfig,
  getLabelScanSettings,
} from "./db";

// ── Import the verdict engine ──────────────────────────────────────────────────
import {
  evaluateVerdict,
  generateQcPassZpl,
  type ScanPayload,
  type RunConfig,
} from "./productionLine";

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeRun(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    runId: "run-001",
    lineId: "LINE-1",
    operatorId: "OP-001",
    expectedGtin: "00012345678901",
    expectedLot: "LOT-A",
    expectedExpiry: "2027-01-01",
    confidenceThreshold: 0.85,
    shelfLifeDaysMin: 30,
    holdConfidenceMin: 0.70,
    tampDefaultX: 50,
    tampDefaultY: 20,
    gs1CompanyPrefix: "0614141",
    ...overrides,
  };
}

function makeScan(overrides: Partial<ScanPayload> = {}): ScanPayload {
  return {
    cartonId: "carton-001",
    gtin: "00012345678901",
    lot: "LOT-A",
    expiry: "20270101",
    serial: "SN-001",
    poNumber: "PO-001",
    confidence: 0.95,
    camBClear: true,
    skuBbox: null,
    ...overrides,
  };
}

// ── Verdict engine tests ───────────────────────────────────────────────────────
describe("evaluateVerdict", () => {
  it("returns pass for a fully matching scan", () => {
    const result = evaluateVerdict(makeScan(), makeRun());
    expect(result.verdict).toBe("pass");
    expect(result.failReason).toBeUndefined();
  });

  it("returns fail with GTIN_MISMATCH when GTIN does not match", () => {
    const result = evaluateVerdict(makeScan({ gtin: "99999999999999" }), makeRun());
    expect(result.verdict).toBe("fail");
    expect(result.failReason).toBe("GTIN_MISMATCH");
  });

  it("returns fail with LOT_MISMATCH when lot does not match", () => {
    const result = evaluateVerdict(makeScan({ lot: "LOT-WRONG" }), makeRun());
    expect(result.verdict).toBe("fail");
    expect(result.failReason).toBe("LOT_MISMATCH");
  });

  it("returns fail with EXPIRED when expiry date is in the past", () => {
    const result = evaluateVerdict(makeScan({ expiry: "20200101" }), makeRun());
    expect(result.verdict).toBe("fail");
    expect(result.failReason).toBe("EXPIRED");
  });

  it("returns fail with EXPIRY_WINDOW when shelf life is below minimum", () => {
    // Set min shelf life to 365 days and expiry to 10 days from now
    const soon = new Date();
    soon.setDate(soon.getDate() + 10);
    const expiryStr = soon.toISOString().slice(0, 10).replace(/-/g, "");
    const result = evaluateVerdict(makeScan({ expiry: expiryStr }), makeRun({ shelfLifeDaysMin: 365 }));
    expect(result.verdict).toBe("fail");
    expect(result.failReason).toBe("EXPIRY_WINDOW");
  });

  it("returns fail with LOW_CONFIDENCE when confidence is below threshold", () => {
    const result = evaluateVerdict(makeScan({ confidence: 0.50 }), makeRun());
    expect(result.verdict).toBe("fail");
    expect(result.failReason).toBe("LOW_CONFIDENCE");
  });

  it("returns hold when confidence is between holdConfidenceMin and confidenceThreshold", () => {
    const result = evaluateVerdict(makeScan({ confidence: 0.75 }), makeRun());
    expect(result.verdict).toBe("hold");
    // hold verdict still carries LOW_CONFIDENCE as the reason for supervisor review
    expect(result.failReason).toBe("LOW_CONFIDENCE");
  });

  it("returns fail with STRAY_LABEL when camBClear is false", () => {
    const result = evaluateVerdict(makeScan({ camBClear: false }), makeRun());
    expect(result.verdict).toBe("fail");
    expect(result.failReason).toBe("STRAY_LABEL");
  });

  it("returns fail with NO_DECODE when GTIN is missing", () => {
    const result = evaluateVerdict(makeScan({ gtin: undefined, lot: undefined, expiry: undefined }), makeRun());
    expect(result.verdict).toBe("fail");
    expect(result.failReason).toBe("NO_DECODE");
  });

  it("uses over_sku placement when skuBbox is provided", () => {
    const result = evaluateVerdict(
      makeScan({ skuBbox: { x_mm: 10, y_mm: 5, w_mm: 40, h_mm: 20 } }),
      makeRun()
    );
    expect(result.verdict).toBe("pass");
    expect(result.placement).toBe("over_sku");
    // tamp coordinates are center of bbox: x + w/2 = 10 + 40/2 = 30, y + h/2 = 5 + 20/2 = 15
    expect(result.tampXMm).toBe(30);
    expect(result.tampYMm).toBe(15);
  });

  it("uses fixed_default placement when skuBbox is null", () => {
    const result = evaluateVerdict(makeScan({ skuBbox: null }), makeRun({ tampDefaultX: 50, tampDefaultY: 20 }));
    expect(result.verdict).toBe("pass");
    expect(result.placement).toBe("fixed_default");
    expect(result.tampXMm).toBe(50);
    expect(result.tampYMm).toBe(20);
  });
});

// ── ZPL generation tests ───────────────────────────────────────────────────────
describe("generateQcPassZpl", () => {
  const baseParams = {
    gtin: "00012345678901",
    lot: "LOT-A",
    expiry: "20270101",
    runId: "run-001",
    lineId: "LINE-1",
    operatorId: "OP-001",
    timestamp: new Date("2026-01-01T10:00:00Z"),
  };

  it("returns a ZPL string starting with ^XA", () => {
    const zpl = generateQcPassZpl(baseParams);
    expect(zpl).toMatch(/^\^XA/);
  });

  it("includes the GTIN in the ZPL output", () => {
    const zpl = generateQcPassZpl(baseParams);
    expect(zpl).toContain("00012345678901");
  });

  it("includes the lot number in the ZPL output", () => {
    const zpl = generateQcPassZpl(baseParams);
    expect(zpl).toContain("LOT-A");
  });

  it("includes QC PASS stamp", () => {
    const zpl = generateQcPassZpl(baseParams);
    expect(zpl).toContain("QC PASS");
  });

  it("ends with ^XZ", () => {
    const zpl = generateQcPassZpl(baseParams);
    expect(zpl).toMatch(/\^XZ\s*$/);
  });

  it("includes PO number when provided", () => {
    const zpl = generateQcPassZpl({ ...baseParams, poNumber: "PO-9999" });
    expect(zpl).toContain("PO-9999");
  });

  it("includes serial when provided", () => {
    const zpl = generateQcPassZpl({ ...baseParams, serial: "SN-12345" });
    expect(zpl).toContain("SN-12345");
  });
});

// ── plcModbus stub tests ───────────────────────────────────────────────────────
describe("plcWrite (stub mode)", () => {
  it("resolves without error in stub mode for belt_stop", async () => {
    const { plcWrite } = await import("./plcModbus");
    const result = await plcWrite(
      { ip: "192.168.1.100", port: 502, unitId: 1, stubMode: true },
      "belt_stop"
    );
    expect(result.stubbed).toBe(true);
  });

  it("resolves without error in stub mode for tamp_fire", async () => {
    const { plcWrite } = await import("./plcModbus");
    const result = await plcWrite(
      { ip: "192.168.1.100", port: 502, unitId: 1, stubMode: true },
      "tamp_fire"
    );
    expect(result.stubbed).toBe(true);
  });

  it("resolves without error in stub mode for divert_on", async () => {
    const { plcWrite } = await import("./plcModbus");
    const result = await plcWrite(
      { ip: "192.168.1.100", port: 502, unitId: 1, stubMode: true },
      "divert_on"
    );
    expect(result.stubbed).toBe(true);
  });

  it("throws for unknown action", async () => {
    const { plcWrite } = await import("./plcModbus");
    await expect(
      plcWrite(
        { ip: "192.168.1.100", port: 502, unitId: 1, stubMode: true },
        "unknown_action" as any
      )
    ).rejects.toThrow("Unknown PLC action");
  });
});
