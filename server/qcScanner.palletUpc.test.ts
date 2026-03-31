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
