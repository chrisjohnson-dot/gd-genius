/**
 * Tests for the decoupled client visibility save + per-row lock logic.
 *
 * Key invariants:
 *  1. Saving visibility does NOT change the lock state.
 *  2. setClientLock toggles only the isLocked field, not isVisible.
 *  3. lockAllHiddenClients only locks rows where isVisible=false.
 *  4. syncClientVisibilityFromOrders never re-enables locked rows.
 */

import { describe, it, expect } from "vitest";

// ─── Pure helpers that mirror the DB logic ────────────────────────────────────

interface ClientVisRow {
  clientId: number;
  clientName: string;
  isVisible: boolean;
  isLocked: boolean;
}

/** Mirror of upsertClientVisibility — saves isVisible only, never touches isLocked */
function applyVisibilitySave(
  rows: ClientVisRow[],
  updates: Array<{ clientId: number; isVisible: boolean }>
): ClientVisRow[] {
  const updateMap = new Map(updates.map((u) => [u.clientId, u.isVisible]));
  return rows.map((r) => {
    if (!updateMap.has(r.clientId)) return r;
    return { ...r, isVisible: updateMap.get(r.clientId)! };
    // isLocked is intentionally NOT changed
  });
}

/** Mirror of setClientLock — toggles isLocked only */
function applySetLock(rows: ClientVisRow[], clientId: number, isLocked: boolean): ClientVisRow[] {
  return rows.map((r) => (r.clientId === clientId ? { ...r, isLocked } : r));
}

/** Mirror of lockAllHiddenClients — locks all rows where isVisible=false */
function applyLockAllHidden(rows: ClientVisRow[]): { rows: ClientVisRow[]; count: number } {
  let count = 0;
  const updated = rows.map((r) => {
    if (!r.isVisible && !r.isLocked) {
      count++;
      return { ...r, isLocked: true };
    }
    return r;
  });
  return { rows: updated, count };
}

/** Mirror of syncClientVisibilityFromOrders — never re-enables locked rows */
function applySync(
  existing: ClientVisRow[],
  incoming: Array<{ clientId: number; clientName: string }>
): ClientVisRow[] {
  const existingMap = new Map(existing.map((r) => [r.clientId, r]));
  const result: ClientVisRow[] = [...existing];

  for (const inc of incoming) {
    const ex = existingMap.get(inc.clientId);
    if (!ex) {
      // New client — insert as visible, unlocked
      result.push({ clientId: inc.clientId, clientName: inc.clientName, isVisible: true, isLocked: false });
    } else {
      // Existing client — only update name; if locked, keep isVisible as-is; if unlocked, set visible
      const idx = result.findIndex((r) => r.clientId === inc.clientId);
      if (idx >= 0) {
        result[idx] = {
          ...result[idx],
          clientName: inc.clientName,
          isVisible: ex.isLocked ? ex.isVisible : true,
        };
      }
    }
  }
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const INITIAL_ROWS: ClientVisRow[] = [
  { clientId: 1, clientName: "Acme Corp", isVisible: true, isLocked: false },
  { clientId: 2, clientName: "Beta Ltd", isVisible: true, isLocked: false },
  { clientId: 3, clientName: "Gamma Inc", isVisible: false, isLocked: false },
  { clientId: 4, clientName: "Delta Co", isVisible: false, isLocked: true },
];

describe("applyVisibilitySave — decoupled from lock", () => {
  it("saves isVisible without touching isLocked", () => {
    const rows = applyVisibilitySave(INITIAL_ROWS, [{ clientId: 1, isVisible: false }]);
    const r = rows.find((r) => r.clientId === 1)!;
    expect(r.isVisible).toBe(false);
    expect(r.isLocked).toBe(false); // lock unchanged
  });

  it("showing a hidden locked client does NOT unlock it", () => {
    const rows = applyVisibilitySave(INITIAL_ROWS, [{ clientId: 4, isVisible: true }]);
    const r = rows.find((r) => r.clientId === 4)!;
    expect(r.isVisible).toBe(true);
    expect(r.isLocked).toBe(true); // still locked — lock is independent
  });

  it("hiding a visible unlocked client does NOT lock it", () => {
    const rows = applyVisibilitySave(INITIAL_ROWS, [{ clientId: 2, isVisible: false }]);
    const r = rows.find((r) => r.clientId === 2)!;
    expect(r.isVisible).toBe(false);
    expect(r.isLocked).toBe(false); // still unlocked
  });

  it("batch save updates multiple clients independently", () => {
    const rows = applyVisibilitySave(INITIAL_ROWS, [
      { clientId: 1, isVisible: false },
      { clientId: 3, isVisible: true },
    ]);
    expect(rows.find((r) => r.clientId === 1)!.isVisible).toBe(false);
    expect(rows.find((r) => r.clientId === 3)!.isVisible).toBe(true);
    // Untouched rows unchanged
    expect(rows.find((r) => r.clientId === 2)!.isVisible).toBe(true);
  });
});

describe("applySetLock — per-row lock toggle", () => {
  it("locks an unlocked client", () => {
    const rows = applySetLock(INITIAL_ROWS, 1, true);
    const r = rows.find((r) => r.clientId === 1)!;
    expect(r.isLocked).toBe(true);
    expect(r.isVisible).toBe(true); // visibility unchanged
  });

  it("unlocks a locked client", () => {
    const rows = applySetLock(INITIAL_ROWS, 4, false);
    const r = rows.find((r) => r.clientId === 4)!;
    expect(r.isLocked).toBe(false);
    expect(r.isVisible).toBe(false); // visibility unchanged
  });

  it("does not affect other rows", () => {
    const rows = applySetLock(INITIAL_ROWS, 1, true);
    expect(rows.find((r) => r.clientId === 2)!.isLocked).toBe(false);
    expect(rows.find((r) => r.clientId === 4)!.isLocked).toBe(true);
  });
});

describe("applyLockAllHidden — bulk lock hidden clients", () => {
  it("locks all hidden unlocked clients", () => {
    const { rows, count } = applyLockAllHidden(INITIAL_ROWS);
    // clientId 3 is hidden+unlocked → should be locked
    expect(rows.find((r) => r.clientId === 3)!.isLocked).toBe(true);
    expect(count).toBe(1); // only 1 newly locked (clientId 4 was already locked)
  });

  it("does not change visibility", () => {
    const { rows } = applyLockAllHidden(INITIAL_ROWS);
    for (const r of rows) {
      const original = INITIAL_ROWS.find((o) => o.clientId === r.clientId)!;
      expect(r.isVisible).toBe(original.isVisible);
    }
  });

  it("does not re-lock already locked clients (count excludes them)", () => {
    const { count } = applyLockAllHidden(INITIAL_ROWS);
    // clientId 4 is already locked — should not be counted again
    expect(count).toBe(1);
  });

  it("returns count=0 when no hidden unlocked clients exist", () => {
    const allVisible: ClientVisRow[] = [
      { clientId: 1, clientName: "A", isVisible: true, isLocked: false },
      { clientId: 2, clientName: "B", isVisible: true, isLocked: false },
    ];
    const { count } = applyLockAllHidden(allVisible);
    expect(count).toBe(0);
  });
});

describe("applySync — sync never re-enables locked rows", () => {
  it("new clients are added as visible+unlocked", () => {
    const result = applySync(INITIAL_ROWS, [{ clientId: 99, clientName: "New Client" }]);
    const r = result.find((r) => r.clientId === 99)!;
    expect(r).toBeDefined();
    expect(r.isVisible).toBe(true);
    expect(r.isLocked).toBe(false);
  });

  it("sync re-enables an unlocked hidden client", () => {
    // clientId 3 is hidden+unlocked — sync should re-enable it
    const result = applySync(INITIAL_ROWS, [{ clientId: 3, clientName: "Gamma Inc" }]);
    expect(result.find((r) => r.clientId === 3)!.isVisible).toBe(true);
  });

  it("sync does NOT re-enable a locked hidden client", () => {
    // clientId 4 is hidden+locked — sync must leave it hidden
    const result = applySync(INITIAL_ROWS, [{ clientId: 4, clientName: "Delta Co" }]);
    expect(result.find((r) => r.clientId === 4)!.isVisible).toBe(false);
    expect(result.find((r) => r.clientId === 4)!.isLocked).toBe(true);
  });

  it("sync updates client name without changing visibility or lock", () => {
    const result = applySync(INITIAL_ROWS, [{ clientId: 4, clientName: "Delta Co (Renamed)" }]);
    const r = result.find((r) => r.clientId === 4)!;
    expect(r.clientName).toBe("Delta Co (Renamed)");
    expect(r.isVisible).toBe(false);
    expect(r.isLocked).toBe(true);
  });
});
