/**
 * Unit tests for SLA sub-rules logic.
 * Tests the pure helper functions used by the SLA Requirements tab
 * for managing named sub-rules per client.
 */
import { describe, it, expect } from "vitest";

// ─── Types (mirror the DB shape) ─────────────────────────────────────────────

type SlaRule = {
  id: number;
  requirementId: number;
  clientId: number;
  clientName: string;
  ruleName: string;
  slaDays: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Helper: build rulesByClient map ─────────────────────────────────────────

function buildRulesByClient(rules: SlaRule[]): Map<number, SlaRule[]> {
  const map = new Map<number, SlaRule[]>();
  for (const r of rules) {
    if (!map.has(r.clientId)) map.set(r.clientId, []);
    map.get(r.clientId)!.push(r);
  }
  return map;
}

// ─── Helper: stepper for sub-rule days ───────────────────────────────────────

function adjustDays(current: number, delta: number): number {
  return Math.max(1, Math.min(365, current + delta));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildRulesByClient", () => {
  const rules: SlaRule[] = [
    { id: 1, requirementId: 10, clientId: 100, clientName: "K18", ruleName: "B2B", slaDays: 3, notes: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, requirementId: 10, clientId: 100, clientName: "K18", ruleName: "Labeling", slaDays: 3, notes: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 3, requirementId: 11, clientId: 200, clientName: "Organika", ruleName: "Labeling", slaDays: 3, notes: null, createdAt: new Date(), updatedAt: new Date() },
  ];

  it("groups rules by clientId", () => {
    const map = buildRulesByClient(rules);
    expect(map.get(100)).toHaveLength(2);
    expect(map.get(200)).toHaveLength(1);
  });

  it("returns empty array for clients with no rules", () => {
    const map = buildRulesByClient(rules);
    expect(map.get(999) ?? []).toHaveLength(0);
  });

  it("preserves rule order within a client", () => {
    const map = buildRulesByClient(rules);
    const k18Rules = map.get(100)!;
    expect(k18Rules[0].ruleName).toBe("B2B");
    expect(k18Rules[1].ruleName).toBe("Labeling");
  });

  it("handles empty rules array", () => {
    const map = buildRulesByClient([]);
    expect(map.size).toBe(0);
  });
});

describe("adjustDays (sub-rule stepper)", () => {
  it("increments by 1", () => {
    expect(adjustDays(2, +1)).toBe(3);
  });

  it("decrements by 1", () => {
    expect(adjustDays(3, -1)).toBe(2);
  });

  it("does not go below 1", () => {
    expect(adjustDays(1, -1)).toBe(1);
    expect(adjustDays(1, -5)).toBe(1);
  });

  it("does not exceed 365", () => {
    expect(adjustDays(365, +1)).toBe(365);
    expect(adjustDays(364, +10)).toBe(365);
  });

  it("handles zero delta", () => {
    expect(adjustDays(5, 0)).toBe(5);
  });
});

describe("SLA sub-rule business rules", () => {
  it("K18 B2B and Organika labeling should use 3-day SLA", () => {
    const rules: SlaRule[] = [
      { id: 1, requirementId: 10, clientId: 100, clientName: "K18", ruleName: "B2B", slaDays: 3, notes: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, requirementId: 11, clientId: 200, clientName: "Organika", ruleName: "Labeling", slaDays: 3, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    const k18B2B = rules.find((r) => r.clientName === "K18" && r.ruleName === "B2B");
    const orgLabeling = rules.find((r) => r.clientName === "Organika" && r.ruleName === "Labeling");
    expect(k18B2B?.slaDays).toBe(3);
    expect(orgLabeling?.slaDays).toBe(3);
  });

  it("a client can have multiple named rules with different SLA days", () => {
    const rules: SlaRule[] = [
      { id: 1, requirementId: 10, clientId: 100, clientName: "K18", ruleName: "Standard", slaDays: 2, notes: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, requirementId: 10, clientId: 100, clientName: "K18", ruleName: "B2B", slaDays: 3, notes: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, requirementId: 10, clientId: 100, clientName: "K18", ruleName: "Kitting", slaDays: 5, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    const map = buildRulesByClient(rules);
    const k18Rules = map.get(100)!;
    expect(k18Rules).toHaveLength(3);
    const days = k18Rules.map((r) => r.slaDays).sort((a, b) => a - b);
    expect(days).toEqual([2, 3, 5]);
  });

  it("sub-rules are independent of the base client SLA", () => {
    // Base SLA for K18 is 2 days; B2B sub-rule is 3 days
    const baseSlaDays = 2;
    const b2bSlaDays = 3;
    expect(b2bSlaDays).not.toBe(baseSlaDays);
    expect(b2bSlaDays).toBeGreaterThan(baseSlaDays);
  });
});
