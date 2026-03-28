import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getQcSessionById: vi.fn(),
    getQcScanItems: vi.fn(),
  };
});

import { getQcSessionById, getQcScanItems } from "./db";

const mockGetSession = vi.mocked(getQcSessionById);
const mockGetItems = vi.mocked(getQcScanItems);

const makeSession = (overrides = {}) => ({
  id: 1,
  referenceNumber: "REF-001",
  batchIdentifiers: null,
  warehouseId: null,
  warehouseName: "WH-A",
  customerId: null,
  customerName: "Test Customer",
  destinationAddress: null,
  distributionCenter: null,
  poNumber: "PO-123",
  trackingNumber: null,
  status: "complete",
  foundInExtensiv: true,
  completedAt: new Date(2026, 2, 27),
  shippedAt: null,
  createdBy: "admin",
  createdAt: new Date(2026, 2, 27),
  updatedAt: new Date(2026, 2, 27),
  ...overrides,
});

const makeItem = (overrides = {}) => ({
  id: 1,
  sessionId: 1,
  sku: "SKU-A",
  upc: null,
  description: "Test Item",
  lotNumber: "LOT-001",
  expectedQty: 10,
  scannedQty: 10,
  caseAmount: 1,
  scanTimestamps: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("qcScanner.sessionSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session and items when session exists", async () => {
    const session = makeSession();
    const items = [makeItem(), makeItem({ id: 2, sku: "SKU-B", lotNumber: "LOT-002" })];
    mockGetSession.mockResolvedValue(session);
    mockGetItems.mockResolvedValue(items);

    const s = await getQcSessionById(1);
    const i = await getQcScanItems(1);

    expect(s).toEqual(session);
    expect(i).toHaveLength(2);
    expect(i[0].lotNumber).toBe("LOT-001");
    expect(i[1].lotNumber).toBe("LOT-002");
  });

  it("returns null when session does not exist", async () => {
    mockGetSession.mockResolvedValue(null);
    const s = await getQcSessionById(999);
    expect(s).toBeNull();
  });

  it("returns empty items array for a session with no items", async () => {
    mockGetSession.mockResolvedValue(makeSession());
    mockGetItems.mockResolvedValue([]);
    const items = await getQcScanItems(1);
    expect(items).toEqual([]);
  });

  it("exposes lotNumber on each item", async () => {
    mockGetSession.mockResolvedValue(makeSession());
    mockGetItems.mockResolvedValue([
      makeItem({ lotNumber: "LOT-XYZ" }),
      makeItem({ id: 2, sku: "SKU-B", lotNumber: null }),
    ]);
    const items = await getQcScanItems(1);
    expect(items[0].lotNumber).toBe("LOT-XYZ");
    expect(items[1].lotNumber).toBeNull();
  });

  it("exposes scannedQty and expectedQty for each item", async () => {
    mockGetSession.mockResolvedValue(makeSession());
    mockGetItems.mockResolvedValue([
      makeItem({ expectedQty: 5, scannedQty: 3 }),
    ]);
    const items = await getQcScanItems(1);
    expect(items[0].expectedQty).toBe(5);
    expect(items[0].scannedQty).toBe(3);
  });
});
