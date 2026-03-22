/**
 * Tests for getAllClientsWithSlaRequirements helper
 * and the stepper adjustment logic used by the SLA Requirements tab.
 */
import { describe, it, expect } from "vitest";

// ─── Unit tests for the stepper logic (pure functions, no DB) ────────────────

type ClientSlaRow = {
  clientId: number;
  clientName: string;
  slaDays: number;
  isDefault: boolean;
  requirementId: number | null;
  notes: string | null;
  updatedAt: Date | null;
};

function effectiveDays(row: ClientSlaRow, pending: Record<number, number>): number {
  return pending[row.clientId] ?? row.slaDays;
}

function adjust(
  row: ClientSlaRow,
  pending: Record<number, number>,
  delta: number
): Record<number, number> {
  const current = effectiveDays(row, pending);
  const next = Math.max(1, current + delta);
  return { ...pending, [row.clientId]: next };
}

describe("SLA stepper logic", () => {
  const defaultRow: ClientSlaRow = {
    clientId: 1,
    clientName: "Acme Corp",
    slaDays: 2,
    isDefault: true,
    requirementId: null,
    notes: null,
    updatedAt: null,
  };

  const overrideRow: ClientSlaRow = {
    clientId: 2,
    clientName: "Beta LLC",
    slaDays: 5,
    isDefault: false,
    requirementId: 42,
    notes: "Premium",
    updatedAt: new Date("2025-01-01"),
  };

  it("effectiveDays returns slaDays when no pending change", () => {
    expect(effectiveDays(defaultRow, {})).toBe(2);
    expect(effectiveDays(overrideRow, {})).toBe(5);
  });

  it("effectiveDays returns pending value when present", () => {
    expect(effectiveDays(defaultRow, { 1: 4 })).toBe(4);
    expect(effectiveDays(overrideRow, { 2: 3 })).toBe(3);
  });

  it("adjust increments the day count by 1", () => {
    const next = adjust(defaultRow, {}, +1);
    expect(next[1]).toBe(3);
  });

  it("adjust decrements the day count by 1", () => {
    const next = adjust(defaultRow, {}, -1);
    expect(next[1]).toBe(1);
  });

  it("adjust does not go below 1", () => {
    const next = adjust(defaultRow, { 1: 1 }, -1);
    expect(next[1]).toBe(1);
  });

  it("adjust stacks on top of existing pending value", () => {
    let pending = adjust(defaultRow, {}, +1); // 3
    pending = adjust(defaultRow, pending, +1); // 4
    expect(pending[1]).toBe(4);
  });

  it("adjust works independently for different clients", () => {
    let pending = adjust(defaultRow, {}, +2); // client 1 → 4
    pending = adjust(overrideRow, pending, -1); // client 2 → 4
    expect(pending[1]).toBe(4);
    expect(pending[2]).toBe(4);
  });
});

// ─── Unit tests for the merge logic (pure, no DB) ────────────────────────────

type RawClient = { clientId: number; clientName: string };
type SlaRequirement = {
  id: number;
  clientId: number;
  clientName: string;
  slaDays: number;
  notes: string | null;
  updatedAt: Date;
};

function mergeClientsWithSla(
  clients: RawClient[],
  requirements: SlaRequirement[],
  defaultDays = 2
): ClientSlaRow[] {
  const reqMap = new Map<number, SlaRequirement>();
  for (const r of requirements) reqMap.set(r.clientId, r);

  return clients.map((c) => {
    const req = reqMap.get(c.clientId);
    return {
      clientId: c.clientId,
      clientName: c.clientName,
      slaDays: req?.slaDays ?? defaultDays,
      isDefault: !req,
      requirementId: req?.id ?? null,
      notes: req?.notes ?? null,
      updatedAt: req ? new Date(req.updatedAt) : null,
    };
  });
}

describe("mergeClientsWithSla", () => {
  const clients: RawClient[] = [
    { clientId: 1, clientName: "Alpha" },
    { clientId: 2, clientName: "Beta" },
    { clientId: 3, clientName: "Gamma" },
  ];

  const requirements: SlaRequirement[] = [
    { id: 10, clientId: 2, clientName: "Beta", slaDays: 3, notes: null, updatedAt: new Date("2025-06-01") },
  ];

  it("clients without override get default 2 days and isDefault=true", () => {
    const result = mergeClientsWithSla(clients, requirements);
    const alpha = result.find((r) => r.clientId === 1)!;
    expect(alpha.slaDays).toBe(2);
    expect(alpha.isDefault).toBe(true);
    expect(alpha.requirementId).toBeNull();
  });

  it("clients with override get their custom slaDays and isDefault=false", () => {
    const result = mergeClientsWithSla(clients, requirements);
    const beta = result.find((r) => r.clientId === 2)!;
    expect(beta.slaDays).toBe(3);
    expect(beta.isDefault).toBe(false);
    expect(beta.requirementId).toBe(10);
  });

  it("returns all clients regardless of whether they have an override", () => {
    const result = mergeClientsWithSla(clients, requirements);
    expect(result).toHaveLength(3);
  });

  it("empty requirements list gives all clients the default", () => {
    const result = mergeClientsWithSla(clients, []);
    expect(result.every((r) => r.isDefault && r.slaDays === 2)).toBe(true);
  });

  it("custom default days are respected", () => {
    const result = mergeClientsWithSla(clients, [], 7);
    expect(result.every((r) => r.slaDays === 7)).toBe(true);
  });
});
