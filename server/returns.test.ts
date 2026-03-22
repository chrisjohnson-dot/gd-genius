import { describe, it, expect } from "vitest";

// ─── Returns business logic unit tests ───────────────────────────────────────
// These tests validate the pure logic around returns sessions and items
// without hitting the database.

type Condition = "new" | "good" | "damaged" | "unsellable";
type Disposition = "restock" | "quarantine" | "destroy" | "return_to_vendor";

type ReturnItem = {
  sku: string;
  quantity: number;
  condition: Condition;
  disposition: Disposition;
};

// ─── Helpers (mirrors server logic) ──────────────────────────────────────────
function totalUnits(items: ReturnItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

function conditionBreakdown(items: ReturnItem[]): Record<Condition, number> {
  const result: Record<Condition, number> = { new: 0, good: 0, damaged: 0, unsellable: 0 };
  for (const item of items) {
    result[item.condition] += item.quantity;
  }
  return result;
}

function dispositionBreakdown(items: ReturnItem[]): Record<Disposition, number> {
  const result: Record<Disposition, number> = { restock: 0, quarantine: 0, destroy: 0, return_to_vendor: 0 };
  for (const item of items) {
    result[item.disposition] += item.quantity;
  }
  return result;
}

function validateSku(sku: string): boolean {
  return sku.trim().length > 0;
}

function validateQuantity(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Returns — totalUnits", () => {
  it("returns 0 for empty items list", () => {
    expect(totalUnits([])).toBe(0);
  });

  it("sums quantities correctly", () => {
    const items: ReturnItem[] = [
      { sku: "SKU-A", quantity: 3, condition: "good", disposition: "restock" },
      { sku: "SKU-B", quantity: 7, condition: "damaged", disposition: "quarantine" },
    ];
    expect(totalUnits(items)).toBe(10);
  });

  it("handles single item", () => {
    const items: ReturnItem[] = [
      { sku: "SKU-X", quantity: 1, condition: "new", disposition: "restock" },
    ];
    expect(totalUnits(items)).toBe(1);
  });
});

describe("Returns — conditionBreakdown", () => {
  it("returns zeroed breakdown for empty list", () => {
    const bd = conditionBreakdown([]);
    expect(bd.new).toBe(0);
    expect(bd.good).toBe(0);
    expect(bd.damaged).toBe(0);
    expect(bd.unsellable).toBe(0);
  });

  it("correctly buckets items by condition", () => {
    const items: ReturnItem[] = [
      { sku: "A", quantity: 2, condition: "new", disposition: "restock" },
      { sku: "B", quantity: 5, condition: "damaged", disposition: "quarantine" },
      { sku: "C", quantity: 1, condition: "new", disposition: "restock" },
      { sku: "D", quantity: 3, condition: "unsellable", disposition: "destroy" },
    ];
    const bd = conditionBreakdown(items);
    expect(bd.new).toBe(3);
    expect(bd.good).toBe(0);
    expect(bd.damaged).toBe(5);
    expect(bd.unsellable).toBe(3);
  });
});

describe("Returns — dispositionBreakdown", () => {
  it("returns zeroed breakdown for empty list", () => {
    const bd = dispositionBreakdown([]);
    expect(bd.restock).toBe(0);
    expect(bd.quarantine).toBe(0);
    expect(bd.destroy).toBe(0);
    expect(bd.return_to_vendor).toBe(0);
  });

  it("correctly buckets items by disposition", () => {
    const items: ReturnItem[] = [
      { sku: "A", quantity: 4, condition: "good", disposition: "restock" },
      { sku: "B", quantity: 2, condition: "damaged", disposition: "quarantine" },
      { sku: "C", quantity: 1, condition: "unsellable", disposition: "destroy" },
      { sku: "D", quantity: 3, condition: "damaged", disposition: "return_to_vendor" },
      { sku: "E", quantity: 1, condition: "good", disposition: "restock" },
    ];
    const bd = dispositionBreakdown(items);
    expect(bd.restock).toBe(5);
    expect(bd.quarantine).toBe(2);
    expect(bd.destroy).toBe(1);
    expect(bd.return_to_vendor).toBe(3);
  });
});

describe("Returns — input validation", () => {
  it("rejects empty SKU", () => {
    expect(validateSku("")).toBe(false);
    expect(validateSku("   ")).toBe(false);
  });

  it("accepts valid SKU", () => {
    expect(validateSku("ABC-123")).toBe(true);
    expect(validateSku("  SKU  ")).toBe(true); // trim is applied
  });

  it("rejects quantity < 1", () => {
    expect(validateQuantity(0)).toBe(false);
    expect(validateQuantity(-5)).toBe(false);
  });

  it("rejects non-integer quantity", () => {
    expect(validateQuantity(1.5)).toBe(false);
    expect(validateQuantity(2.9)).toBe(false);
  });

  it("accepts valid quantity", () => {
    expect(validateQuantity(1)).toBe(true);
    expect(validateQuantity(100)).toBe(true);
  });
});

describe("Returns — session status transitions", () => {
  type Status = "open" | "closed" | "cancelled";

  function canClose(status: Status): boolean {
    return status === "open";
  }

  function canCancel(status: Status): boolean {
    return status === "open";
  }

  it("open session can be closed", () => {
    expect(canClose("open")).toBe(true);
  });

  it("closed session cannot be closed again", () => {
    expect(canClose("closed")).toBe(false);
  });

  it("cancelled session cannot be closed", () => {
    expect(canClose("cancelled")).toBe(false);
  });

  it("open session can be cancelled", () => {
    expect(canCancel("open")).toBe(true);
  });

  it("closed session cannot be cancelled", () => {
    expect(canCancel("closed")).toBe(false);
  });
});
