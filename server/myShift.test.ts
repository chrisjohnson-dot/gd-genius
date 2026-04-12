/**
 * myShift.test.ts
 * Unit tests for the myShift router (warehouses, startShift, endShift).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };
vi.mock("./db", () => ({ getDb: vi.fn(() => Promise.resolve(mockDb)) }));

// ─── Import router after mocks ────────────────────────────────────────────────
import { appRouterV4 as appRouter } from "./routers";

// ─── Context factory ──────────────────────────────────────────────────────────
function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-oid",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue([]);
});

// ─── warehouses ───────────────────────────────────────────────────────────────
describe("myShift.warehouses", () => {
  it("returns a list of warehouse IDs from the UNION query", async () => {
    mockExecute.mockResolvedValueOnce([
      { warehouseId: "CAL" },
      { warehouseId: "COL" },
      { warehouseId: "TOR" },
    ]);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.myShift.warehouses();
    expect(result).toEqual(["CAL", "COL", "TOR"]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no warehouses exist", async () => {
    mockExecute.mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.myShift.warehouses();
    expect(result).toEqual([]);
  });

  it("returns empty array when DB is unavailable", async () => {
    const { getDb } = await import("./db");
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.myShift.warehouses();
    expect(result).toEqual([]);
  });
});
