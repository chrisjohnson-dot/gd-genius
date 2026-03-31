import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getQcPallets: vi.fn(),
    updateQcPallet: vi.fn(),
  };
});

import { getQcPallets, updateQcPallet } from "./db";

const mockGetPallets = vi.mocked(getQcPallets);
const mockUpdatePallet = vi.mocked(updateQcPallet);

const makePallet = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  sessionId: 10,
  palletNumber: 1,
  palletUpc: null as string | null,
  items: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─── Logic extracted from the router procedures ───────────────────────────────

async function assignPalletUpcLogic(
  palletId: number,
  sessionId: number,
  upc: string
): Promise<{ success: boolean; palletId: number; upc: string }> {
  const pallets = await getQcPallets(sessionId);
  const duplicate = pallets.find(
    (p) =>
      p.id !== palletId &&
      (p.palletUpc ?? "").trim().toLowerCase() === upc.trim().toLowerCase()
  );
  if (duplicate) {
    throw new Error(
      `UPC "${upc}" is already assigned to Pallet ${duplicate.palletNumber} in this session.`
    );
  }
  await updateQcPallet(palletId, { palletUpc: upc.trim() });
  return { success: true, palletId, upc: upc.trim() };
}

async function generatePalletUpcLogic(
  palletId: number,
  sessionId: number,
  palletNumber: number
): Promise<{ success: boolean; palletId: number; upc: string }> {
  const upc = `GD-${sessionId}-P${palletNumber}`;
  await updateQcPallet(palletId, { palletUpc: upc });
  return { success: true, palletId, upc };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("qcScanner.assignPalletUpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdatePallet.mockResolvedValue(undefined);
  });

  it("assigns a UPC to a pallet when no duplicate exists", async () => {
    mockGetPallets.mockResolvedValue([makePallet()]);
    const result = await assignPalletUpcLogic(1, 10, "UPC-ABC-123");
    expect(result.success).toBe(true);
    expect(result.upc).toBe("UPC-ABC-123");
    expect(mockUpdatePallet).toHaveBeenCalledWith(1, { palletUpc: "UPC-ABC-123" });
  });

  it("trims whitespace from the UPC before saving", async () => {
    mockGetPallets.mockResolvedValue([makePallet()]);
    const result = await assignPalletUpcLogic(1, 10, "  UPC-TRIM  ");
    expect(result.upc).toBe("UPC-TRIM");
    expect(mockUpdatePallet).toHaveBeenCalledWith(1, { palletUpc: "UPC-TRIM" });
  });

  it("rejects duplicate UPC already assigned to another pallet in the same session", async () => {
    mockGetPallets.mockResolvedValue([
      makePallet({ id: 1, palletNumber: 1, palletUpc: null }),
      makePallet({ id: 2, palletNumber: 2, palletUpc: "EXISTING-UPC" }),
    ]);
    await expect(assignPalletUpcLogic(1, 10, "EXISTING-UPC")).rejects.toThrow(
      'UPC "EXISTING-UPC" is already assigned to Pallet 2 in this session.'
    );
    expect(mockUpdatePallet).not.toHaveBeenCalled();
  });

  it("duplicate check is case-insensitive", async () => {
    mockGetPallets.mockResolvedValue([
      makePallet({ id: 1, palletNumber: 1, palletUpc: null }),
      makePallet({ id: 2, palletNumber: 2, palletUpc: "existing-upc" }),
    ]);
    await expect(assignPalletUpcLogic(1, 10, "EXISTING-UPC")).rejects.toThrow(
      'UPC "EXISTING-UPC" is already assigned to Pallet 2 in this session.'
    );
  });

  it("allows re-assigning the same UPC to the same pallet (update)", async () => {
    mockGetPallets.mockResolvedValue([
      makePallet({ id: 1, palletNumber: 1, palletUpc: "SAME-UPC" }),
    ]);
    const result = await assignPalletUpcLogic(1, 10, "SAME-UPC");
    expect(result.success).toBe(true);
    expect(mockUpdatePallet).toHaveBeenCalledWith(1, { palletUpc: "SAME-UPC" });
  });
});

describe("qcScanner.generatePalletUpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdatePallet.mockResolvedValue(undefined);
  });

  it("generates a UPC in the format GD-{sessionId}-P{palletNumber}", async () => {
    const result = await generatePalletUpcLogic(1, 10, 1);
    expect(result.upc).toBe("GD-10-P1");
    expect(result.palletId).toBe(1);
    expect(result.success).toBe(true);
  });

  it("saves the generated UPC to the database", async () => {
    await generatePalletUpcLogic(3, 42, 5);
    expect(mockUpdatePallet).toHaveBeenCalledWith(3, { palletUpc: "GD-42-P5" });
  });

  it("generates unique UPCs for different pallets in the same session", async () => {
    const r1 = await generatePalletUpcLogic(1, 10, 1);
    const r2 = await generatePalletUpcLogic(2, 10, 2);
    expect(r1.upc).not.toBe(r2.upc);
    expect(r1.upc).toBe("GD-10-P1");
    expect(r2.upc).toBe("GD-10-P2");
  });

  it("generates unique UPCs for same pallet number across different sessions", async () => {
    const r1 = await generatePalletUpcLogic(1, 10, 1);
    const r2 = await generatePalletUpcLogic(2, 20, 1);
    expect(r1.upc).toBe("GD-10-P1");
    expect(r2.upc).toBe("GD-20-P1");
  });
});

// ─── bulkGeneratePalletUpcs logic ─────────────────────────────────────────────

async function bulkGeneratePalletUpcsLogic(
  sessionId: number
): Promise<{ assigned: Array<{ palletId: number; palletNumber: number; upc: string }>; skipped: number }> {
  const pallets = await getQcPallets(sessionId);
  const unassigned = pallets.filter((p) => !(p.palletUpc ?? "").trim());
  const results: Array<{ palletId: number; palletNumber: number; upc: string }> = [];
  for (const pallet of unassigned) {
    const upc = `GD-${sessionId}-P${pallet.palletNumber}`;
    await updateQcPallet(pallet.id, { palletUpc: upc });
    results.push({ palletId: pallet.id, palletNumber: pallet.palletNumber, upc });
  }
  return { assigned: results, skipped: pallets.length - unassigned.length };
}

describe("qcScanner.bulkGeneratePalletUpcs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdatePallet.mockResolvedValue(undefined);
  });

  it("assigns UPCs to all pallets that have none", async () => {
    mockGetPallets.mockResolvedValue([
      makePallet({ id: 1, palletNumber: 1, palletUpc: null }),
      makePallet({ id: 2, palletNumber: 2, palletUpc: null }),
      makePallet({ id: 3, palletNumber: 3, palletUpc: null }),
    ]);
    const result = await bulkGeneratePalletUpcsLogic(10);
    expect(result.assigned).toHaveLength(3);
    expect(result.skipped).toBe(0);
    expect(result.assigned[0].upc).toBe("GD-10-P1");
    expect(result.assigned[1].upc).toBe("GD-10-P2");
    expect(result.assigned[2].upc).toBe("GD-10-P3");
    expect(mockUpdatePallet).toHaveBeenCalledTimes(3);
  });

  it("skips pallets that already have a UPC", async () => {
    mockGetPallets.mockResolvedValue([
      makePallet({ id: 1, palletNumber: 1, palletUpc: "EXISTING-UPC" }),
      makePallet({ id: 2, palletNumber: 2, palletUpc: null }),
    ]);
    const result = await bulkGeneratePalletUpcsLogic(10);
    expect(result.assigned).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.assigned[0].palletId).toBe(2);
    expect(result.assigned[0].upc).toBe("GD-10-P2");
    expect(mockUpdatePallet).toHaveBeenCalledTimes(1);
    expect(mockUpdatePallet).toHaveBeenCalledWith(2, { palletUpc: "GD-10-P2" });
  });

  it("returns assigned=[] and skipped=N when all pallets already have UPCs", async () => {
    mockGetPallets.mockResolvedValue([
      makePallet({ id: 1, palletNumber: 1, palletUpc: "UPC-1" }),
      makePallet({ id: 2, palletNumber: 2, palletUpc: "UPC-2" }),
    ]);
    const result = await bulkGeneratePalletUpcsLogic(10);
    expect(result.assigned).toHaveLength(0);
    expect(result.skipped).toBe(2);
    expect(mockUpdatePallet).not.toHaveBeenCalled();
  });

  it("treats whitespace-only UPC as unassigned", async () => {
    mockGetPallets.mockResolvedValue([
      makePallet({ id: 1, palletNumber: 1, palletUpc: "   " }),
    ]);
    const result = await bulkGeneratePalletUpcsLogic(10);
    expect(result.assigned).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  it("returns empty assigned list when session has no pallets", async () => {
    mockGetPallets.mockResolvedValue([]);
    const result = await bulkGeneratePalletUpcsLogic(10);
    expect(result.assigned).toHaveLength(0);
    expect(result.skipped).toBe(0);
    expect(mockUpdatePallet).not.toHaveBeenCalled();
  });
});
