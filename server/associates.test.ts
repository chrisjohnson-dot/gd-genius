/**
 * associates.test.ts
 * Unit tests for the warehouse associates lookup router.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mock the DB ──────────────────────────────────────────────────────────────
const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };
vi.mock("./db", () => ({ getDb: vi.fn(() => Promise.resolve(mockDb)) }));

// ─── Import router after mocks ────────────────────────────────────────────────
import { appRouterV4 } from "./routers";

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

describe("associatesRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── lookupById ────────────────────────────────────────────────────────────
  describe("lookupById", () => {
    it("returns associate when found", async () => {
      const now = Date.now();
      mockExecute.mockResolvedValueOnce([{
        id: 1,
        associate_id: "EMP-001",
        name: "Alice Johnson",
        warehouse_id: "COL",
        role: "Picker",
        active: 1,
        notes: null,
        created_at: now,
        updated_at: now,
      }]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.lookupById({ associateId: "EMP-001" });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Alice Johnson");
      expect(result!.active).toBe(true);
      expect(result!.warehouseId).toBe("COL");
    });

    it("returns null when associate not found", async () => {
      mockExecute.mockResolvedValueOnce([]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.lookupById({ associateId: "UNKNOWN-999" });

      expect(result).toBeNull();
    });

    it("throws on empty associateId", async () => {
      const caller = appRouterV4.createCaller(makeCtx());
      await expect(caller.associates.lookupById({ associateId: "" })).rejects.toThrow();
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns all active associates", async () => {
      const now = Date.now();
      mockExecute.mockResolvedValueOnce([
        { id: 1, associate_id: "EMP-001", name: "Alice", warehouse_id: "COL", role: "Picker", active: 1, notes: null, created_at: now, updated_at: now },
        { id: 2, associate_id: "EMP-002", name: "Bob",   warehouse_id: "TOR", role: "Forklift", active: 1, notes: null, created_at: now, updated_at: now },
      ]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.list({ activeOnly: true });

      expect(result).toHaveLength(2);
      expect(result[0].associateId).toBe("EMP-001");
      expect(result[1].name).toBe("Bob");
    });

    it("returns empty array when no associates", async () => {
      mockExecute.mockResolvedValueOnce([]);
      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.list({});
      expect(result).toHaveLength(0);
    });
  });

  // ── upsert ────────────────────────────────────────────────────────────────
  describe("upsert", () => {
    it("creates a new associate when none exists", async () => {
      mockExecute
        .mockResolvedValueOnce([]) // SELECT existing → none
        .mockResolvedValueOnce({ insertId: 5 }); // INSERT

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.upsert({
        associateId: "EMP-003",
        name: "Carol Smith",
        warehouseId: "COL",
        role: "Picker",
      });

      expect(result.associateId).toBe("EMP-003");
      expect(result.created).toBe(true);
    });

    it("updates an existing associate", async () => {
      mockExecute
        .mockResolvedValueOnce([{ id: 3 }]) // SELECT existing → found
        .mockResolvedValueOnce({}); // UPDATE

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.upsert({
        associateId: "EMP-001",
        name: "Alice Updated",
        warehouseId: "all",
      });

      expect(result.associateId).toBe("EMP-001");
      expect(result.created).toBe(false);
    });

    it("throws on empty name", async () => {
      const caller = appRouterV4.createCaller(makeCtx());
      await expect(
        caller.associates.upsert({ associateId: "EMP-001", name: "" })
      ).rejects.toThrow();
    });
  });

  // ── deactivate ────────────────────────────────────────────────────────────
  describe("deactivate", () => {
    it("deactivates an associate", async () => {
      mockExecute.mockResolvedValueOnce({});
      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.deactivate({ associateId: "EMP-001" });
      expect(result.success).toBe(true);
    });
  });

  // ── reactivate ────────────────────────────────────────────────────────────
  describe("reactivate", () => {
    it("reactivates an associate", async () => {
      mockExecute.mockResolvedValueOnce({});
      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.reactivate({ associateId: "EMP-001" });
      expect(result.success).toBe(true);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("permanently deletes an associate", async () => {
      mockExecute.mockResolvedValueOnce({});
      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.delete({ associateId: "EMP-001" });
      expect(result.success).toBe(true);
    });
  });

  // ── getStats ──────────────────────────────────────────────────────────────
  describe("getStats", () => {
    it("returns aggregated KPIs and session history", async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      // Mock 1: KPI aggregate row
      mockExecute.mockResolvedValueOnce([{
        total_sessions: 5,
        total_items: 120,
        total_pallets: 10,
        total_cases: 110,
        avg_items_per_hour: 60,
        avg_duration_minutes: 45,
      }]);

      // Mock 2: Recent sessions
      mockExecute.mockResolvedValueOnce([{
        id: 1,
        pick_ticket: "PT-001",
        warehouse_id: "COL",
        started_at: oneHourAgo,
        ended_at: now,
        total_items: 24,
        total_pallets: 2,
        total_cases: 22,
        status: "completed",
      }]);

      // Mock 3: Trend data
      mockExecute.mockResolvedValueOnce([{
        day: "2025-01-15",
        items: 24,
        hours: 0.5,
      }]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.getStats({ associateId: "EMP-001" });

      expect(result).not.toBeNull();
      expect(result!.totalSessions).toBe(5);
      expect(result!.totalItems).toBe(120);
      expect(result!.totalPallets).toBe(10);
      expect(result!.totalCases).toBe(110);
      expect(result!.avgItemsPerHour).toBe(60);
      expect(result!.avgDurationMinutes).toBe(45);
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].pickTicket).toBe("PT-001");
      expect(result!.sessions[0].durationMinutes).toBe(60);
      expect(result!.sessions[0].itemsPerHour).toBe(24);
      expect(result!.trend).toHaveLength(1);
      expect(result!.trend[0].day).toBe("2025-01-15");
      expect(result!.trend[0].itemsPerHour).toBe(48);
    });

    it("returns null when DB is unavailable", async () => {
      vi.mocked(await import("./db").then(m => m.getDb)).mockResolvedValueOnce(null as any);
      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.getStats({ associateId: "EMP-001" });
      expect(result).toBeNull();
    });

    it("returns zero KPIs when associate has no sessions", async () => {
      // KPI row with all zeros/nulls
      mockExecute.mockResolvedValueOnce([{
        total_sessions: 0,
        total_items: null,
        total_pallets: null,
        total_cases: null,
        avg_items_per_hour: null,
        avg_duration_minutes: null,
      }]);
      // Empty sessions
      mockExecute.mockResolvedValueOnce([]);
      // Empty trend
      mockExecute.mockResolvedValueOnce([]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.associates.getStats({ associateId: "EMP-NEW" });

      expect(result).not.toBeNull();
      expect(result!.totalSessions).toBe(0);
      expect(result!.totalItems).toBe(0);
      expect(result!.avgItemsPerHour).toBeNull();
      expect(result!.sessions).toHaveLength(0);
      expect(result!.trend).toHaveLength(0);
    });

    it("throws on empty associateId", async () => {
      const caller = appRouterV4.createCaller(makeCtx());
      await expect(caller.associates.getStats({ associateId: "" })).rejects.toThrow();
    });
  });
});
