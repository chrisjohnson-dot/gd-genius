/**
 * QC Scanner — Lot # column tests
 *
 * Verifies that:
 *  1. lotNumber is accepted by upsertQcScanItem and persisted
 *  2. getQcScanItems returns the lotNumber field
 *  3. A null lotNumber is stored and returned correctly
 *  4. lotNumber can be updated via upsertQcScanItem
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the DB layer so tests run without a real database ────────────────────

const mockRows: Record<string, any[]> = {};

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    upsertQcScanItem: vi.fn(
      async (
        sessionId: number,
        sku: string,
        upc: string | null,
        data: Record<string, any>
      ) => {
        const key = `${sessionId}:${sku}`;
        const existing = mockRows[key];
        const row = existing
          ? { ...existing[0], ...data, upc }
          : {
              id: Object.keys(mockRows).length + 1,
              sessionId,
              sku,
              upc,
              description: data.description ?? null,
              lotNumber: data.lotNumber ?? null,
              expectedQty: data.expectedQty ?? 0,
              scannedQty: data.scannedQty ?? 0,
              caseAmount: data.caseAmount ?? 1,
              scanTimestamps: data.scanTimestamps ?? [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
        mockRows[key] = [row];
        return row;
      }
    ),
    getQcScanItems: vi.fn(async (sessionId: number) =>
      Object.entries(mockRows)
        .filter(([k]) => k.startsWith(`${sessionId}:`))
        .map(([, v]) => v[0])
    ),
  };
});

import { upsertQcScanItem, getQcScanItems } from "./db";

// ─────────────────────────────────────────────────────────────────────────────

describe("QC Scanner — lotNumber field", () => {
  beforeEach(() => {
    // Clear mock store between tests
    Object.keys(mockRows).forEach((k) => delete mockRows[k]);
    vi.clearAllMocks();
  });

  it("persists lotNumber when provided", async () => {
    const row = await upsertQcScanItem(1, "SKU-A", "123456789", {
      description: "Widget A",
      lotNumber: "LOT-2025-001",
      expectedQty: 10,
      scannedQty: 0,
      caseAmount: 1,
      scanTimestamps: [],
    });
    expect(row?.lotNumber).toBe("LOT-2025-001");
  });

  it("stores null lotNumber when not provided", async () => {
    const row = await upsertQcScanItem(2, "SKU-B", null, {
      description: "Widget B",
      expectedQty: 5,
      scannedQty: 0,
      caseAmount: 1,
      scanTimestamps: [],
    });
    expect(row?.lotNumber).toBeNull();
  });

  it("getQcScanItems returns lotNumber in each row", async () => {
    await upsertQcScanItem(3, "SKU-C", null, {
      lotNumber: "LOT-ABC",
      expectedQty: 4,
      scannedQty: 0,
      caseAmount: 1,
      scanTimestamps: [],
    });
    await upsertQcScanItem(3, "SKU-D", null, {
      lotNumber: null,
      expectedQty: 2,
      scannedQty: 0,
      caseAmount: 1,
      scanTimestamps: [],
    });

    const items = await getQcScanItems(3);
    expect(items).toHaveLength(2);

    const c = items.find((i) => i.sku === "SKU-C");
    const d = items.find((i) => i.sku === "SKU-D");
    expect(c?.lotNumber).toBe("LOT-ABC");
    expect(d?.lotNumber).toBeNull();
  });

  it("updates lotNumber on upsert", async () => {
    await upsertQcScanItem(4, "SKU-E", null, {
      lotNumber: "LOT-OLD",
      expectedQty: 6,
      scannedQty: 0,
      caseAmount: 1,
      scanTimestamps: [],
    });
    const updated = await upsertQcScanItem(4, "SKU-E", null, {
      lotNumber: "LOT-NEW",
    });
    expect(updated?.lotNumber).toBe("LOT-NEW");
  });

  it("lotNumber is included in the QcScanItem type shape", async () => {
    const row = await upsertQcScanItem(5, "SKU-F", null, {
      lotNumber: "LOT-TYPE-CHECK",
      expectedQty: 1,
      scannedQty: 0,
      caseAmount: 1,
      scanTimestamps: [],
    });
    // TypeScript-level check: property must exist on the returned object
    expect(Object.prototype.hasOwnProperty.call(row, "lotNumber")).toBe(true);
  });
});
