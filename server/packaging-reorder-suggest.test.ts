/**
 * Unit tests for the 4-week replenishment auto-suggest formula.
 * The pure function is duplicated here for server-side testability.
 */
import { describe, it, expect } from "vitest";

// ─── Pure helper (mirrors suggestedReorderQty in PackagingInventory.tsx) ─────

function suggestedReorderQty(item: {
  onHandQty: number;
  weeklyConsumption: number;
  minStockLevel: number;
}): { qty: number; hasBurnRate: boolean } {
  if (item.weeklyConsumption > 0) {
    const target = item.weeklyConsumption * 4;
    const needed = target - item.onHandQty;
    return { qty: Math.max(1, needed), hasBurnRate: true };
  }
  const needed = item.minStockLevel - item.onHandQty;
  return { qty: Math.max(1, needed), hasBurnRate: false };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("suggestedReorderQty — burn rate path", () => {
  it("uses hasBurnRate=true when weeklyConsumption > 0", () => {
    const result = suggestedReorderQty({ onHandQty: 0, weeklyConsumption: 50, minStockLevel: 100 });
    expect(result.hasBurnRate).toBe(true);
  });

  it("calculates 4-week target minus on-hand", () => {
    // 50/wk × 4 = 200 target − 50 on hand = 150 to order
    const result = suggestedReorderQty({ onHandQty: 50, weeklyConsumption: 50, minStockLevel: 0 });
    expect(result.qty).toBe(150);
  });

  it("returns 1 minimum when on-hand already exceeds 4-week target", () => {
    // 10/wk × 4 = 40 target − 200 on hand = −160 → clamped to 1
    const result = suggestedReorderQty({ onHandQty: 200, weeklyConsumption: 10, minStockLevel: 0 });
    expect(result.qty).toBe(1);
  });

  it("returns 1 minimum when on-hand exactly equals 4-week target", () => {
    // 25/wk × 4 = 100 − 100 on hand = 0 → clamped to 1
    const result = suggestedReorderQty({ onHandQty: 100, weeklyConsumption: 25, minStockLevel: 0 });
    expect(result.qty).toBe(1);
  });

  it("handles zero on-hand correctly", () => {
    // 30/wk × 4 = 120 − 0 = 120
    const result = suggestedReorderQty({ onHandQty: 0, weeklyConsumption: 30, minStockLevel: 0 });
    expect(result.qty).toBe(120);
  });

  it("ignores minStockLevel when burn rate is known", () => {
    // Should use burn rate formula, not minStockLevel
    const result = suggestedReorderQty({ onHandQty: 10, weeklyConsumption: 20, minStockLevel: 500 });
    // 20 × 4 = 80 − 10 = 70
    expect(result.qty).toBe(70);
    expect(result.hasBurnRate).toBe(true);
  });

  it("works with fractional-like integers", () => {
    // 7/wk × 4 = 28 − 5 = 23
    const result = suggestedReorderQty({ onHandQty: 5, weeklyConsumption: 7, minStockLevel: 0 });
    expect(result.qty).toBe(23);
  });
});

describe("suggestedReorderQty — fallback (no burn rate)", () => {
  it("uses hasBurnRate=false when weeklyConsumption is 0", () => {
    const result = suggestedReorderQty({ onHandQty: 10, weeklyConsumption: 0, minStockLevel: 50 });
    expect(result.hasBurnRate).toBe(false);
  });

  it("suggests top-up to minStockLevel when below min", () => {
    // min 100 − on hand 40 = 60
    const result = suggestedReorderQty({ onHandQty: 40, weeklyConsumption: 0, minStockLevel: 100 });
    expect(result.qty).toBe(60);
  });

  it("returns 1 minimum when on-hand already meets or exceeds minStockLevel", () => {
    const result = suggestedReorderQty({ onHandQty: 150, weeklyConsumption: 0, minStockLevel: 100 });
    expect(result.qty).toBe(1);
  });

  it("returns 1 when both onHandQty and minStockLevel are 0", () => {
    const result = suggestedReorderQty({ onHandQty: 0, weeklyConsumption: 0, minStockLevel: 0 });
    expect(result.qty).toBe(1);
  });

  it("returns 1 when on-hand equals minStockLevel exactly", () => {
    const result = suggestedReorderQty({ onHandQty: 50, weeklyConsumption: 0, minStockLevel: 50 });
    expect(result.qty).toBe(1);
  });
});

describe("suggestedReorderQty — edge cases", () => {
  it("handles very high weekly consumption", () => {
    // 1000/wk × 4 = 4000 − 500 = 3500
    const result = suggestedReorderQty({ onHandQty: 500, weeklyConsumption: 1000, minStockLevel: 0 });
    expect(result.qty).toBe(3500);
    expect(result.hasBurnRate).toBe(true);
  });

  it("handles single-unit items", () => {
    // 1/wk × 4 = 4 − 1 = 3
    const result = suggestedReorderQty({ onHandQty: 1, weeklyConsumption: 1, minStockLevel: 0 });
    expect(result.qty).toBe(3);
  });
});
