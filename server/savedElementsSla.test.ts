/**
 * Tests for savedElements → SLA sub-rule matching logic.
 *
 * The matching algorithm in getOrderSlaStatuses:
 *   1. Parse order.savedElements as JSON array of {name, value}
 *   2. For each element, check if its value (case-insensitive) matches any
 *      sub-rule name for that client
 *   3. If matched, use the sub-rule's slaDays instead of the base SLA days
 *   4. Expose matchedRuleName on the result
 */

import { describe, it, expect } from "vitest";

// ─── Pure helper extracted from the engine logic ─────────────────────────────

type SubRule = { ruleName: string; slaDays: number };

function resolveSlaDays(
  baseSla: number,
  savedElementsJson: string | null,
  clientRules: SubRule[]
): { slaDays: number; matchedRuleName: string | null } {
  if (!savedElementsJson || clientRules.length === 0) {
    return { slaDays: baseSla, matchedRuleName: null };
  }
  try {
    const elements = JSON.parse(savedElementsJson) as Array<{ name: string; value: string }>;
    for (const el of elements) {
      const matched = clientRules.find(
        (r) => r.ruleName.toLowerCase() === el.value.toLowerCase()
      );
      if (matched) {
        return { slaDays: matched.slaDays, matchedRuleName: matched.ruleName };
      }
    }
  } catch {
    // Malformed JSON — fall back to base
  }
  return { slaDays: baseSla, matchedRuleName: null };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("resolveSlaDays — savedElements SLA matching", () => {
  const rules: SubRule[] = [
    { ruleName: "Labeling", slaDays: 3 },
    { ruleName: "B2B", slaDays: 3 },
    { ruleName: "Kitting", slaDays: 4 },
  ];

  it("returns base SLA when savedElements is null", () => {
    const result = resolveSlaDays(2, null, rules);
    expect(result.slaDays).toBe(2);
    expect(result.matchedRuleName).toBeNull();
  });

  it("returns base SLA when savedElements is empty array", () => {
    const result = resolveSlaDays(2, "[]", rules);
    expect(result.slaDays).toBe(2);
    expect(result.matchedRuleName).toBeNull();
  });

  it("returns base SLA when no client rules exist", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "Labeling" }]);
    const result = resolveSlaDays(2, json, []);
    expect(result.slaDays).toBe(2);
    expect(result.matchedRuleName).toBeNull();
  });

  it("matches Labeling rule and returns 3 days", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "Labeling" }]);
    const result = resolveSlaDays(2, json, rules);
    expect(result.slaDays).toBe(3);
    expect(result.matchedRuleName).toBe("Labeling");
  });

  it("matches B2B rule and returns 3 days", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "B2B" }]);
    const result = resolveSlaDays(2, json, rules);
    expect(result.slaDays).toBe(3);
    expect(result.matchedRuleName).toBe("B2B");
  });

  it("matches Kitting rule and returns 4 days", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "Kitting" }]);
    const result = resolveSlaDays(2, json, rules);
    expect(result.slaDays).toBe(4);
    expect(result.matchedRuleName).toBe("Kitting");
  });

  it("is case-insensitive for matching (labeling → Labeling)", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "labeling" }]);
    const result = resolveSlaDays(2, json, rules);
    expect(result.slaDays).toBe(3);
    expect(result.matchedRuleName).toBe("Labeling");
  });

  it("is case-insensitive for matching (LABELING → Labeling)", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "LABELING" }]);
    const result = resolveSlaDays(2, json, rules);
    expect(result.slaDays).toBe(3);
    expect(result.matchedRuleName).toBe("Labeling");
  });

  it("returns base SLA when value does not match any rule", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "DTC" }]);
    const result = resolveSlaDays(2, json, rules);
    expect(result.slaDays).toBe(2);
    expect(result.matchedRuleName).toBeNull();
  });

  it("matches first rule when multiple elements are present", () => {
    const json = JSON.stringify([
      { name: "Channel", value: "DTC" },
      { name: "Order Type", value: "Kitting" },
    ]);
    const result = resolveSlaDays(2, json, rules);
    expect(result.slaDays).toBe(4);
    expect(result.matchedRuleName).toBe("Kitting");
  });

  it("returns base SLA when savedElements JSON is malformed", () => {
    const result = resolveSlaDays(2, "not-valid-json", rules);
    expect(result.slaDays).toBe(2);
    expect(result.matchedRuleName).toBeNull();
  });

  it("respects custom base SLA when no rule matches", () => {
    const json = JSON.stringify([{ name: "Order Type", value: "Unknown" }]);
    const result = resolveSlaDays(5, json, rules);
    expect(result.slaDays).toBe(5);
    expect(result.matchedRuleName).toBeNull();
  });
});
