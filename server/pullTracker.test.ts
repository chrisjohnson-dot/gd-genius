/**
 * pullTracker.test.ts
 * Unit tests for the Warehouse Pull Tracker router procedures.
 * Uses the appRouter.createCaller pattern consistent with the rest of the project.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mock the DB ──────────────────────────────────────────────────────────────
const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };
vi.mock("./db", () => ({ getDb: vi.fn(() => Promise.resolve(mockDb)) }));

// ─── Mock fetch for OpFi push ─────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

describe("pullTrackerRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── startSession ─────────────────────────────────────────────────────────
  describe("startSession", () => {
    it("creates a new session when none is active", async () => {
      mockExecute
        .mockResolvedValueOnce([]) // SELECT existing active session → none
        .mockResolvedValueOnce({ insertId: 42 }); // INSERT new session

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.startSession({
        pickTicket: "PT-001",
        associateId: "EMP-123",
        associateName: "John Doe",
        warehouseId: "COL",
      });

      expect(result.sessionId).toBe(42);
      expect(result.resumed).toBe(false);
    });

    it("resumes an existing active session", async () => {
      mockExecute.mockResolvedValueOnce([{ id: 99 }]); // existing active session

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.startSession({
        pickTicket: "PT-001",
        associateId: "EMP-123",
      });

      expect(result.sessionId).toBe(99);
      expect(result.resumed).toBe(true);
    });

    it("throws a Zod validation error when pickTicket is empty", async () => {
      const caller = appRouterV4.createCaller(makeCtx());
      await expect(
        caller.pullTracker.startSession({ pickTicket: "", associateId: "EMP-123" })
      ).rejects.toThrow();
    });
  });

  // ── endSession ───────────────────────────────────────────────────────────
  describe("endSession", () => {
    it("completes a session and calculates duration", async () => {
      const startedAt = Date.now() - 3600_000; // 1 hour ago
      mockExecute
        .mockResolvedValueOnce([{
          id: 1,
          pick_ticket: "PT-001",
          associate_id: "EMP-123",
          associate_name: "John",
          warehouse_id: "COL",
          started_at: startedAt,
          status: "active",
        }])
        .mockResolvedValueOnce([{ pallets: 5, cases: 20, total: 25 }]) // countItems
        .mockResolvedValueOnce({}) // UPDATE session
        .mockResolvedValueOnce({}); // UPDATE opfi_pushed

      mockFetch.mockResolvedValueOnce({ ok: true });

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.endSession({ sessionId: 1 });

      expect(result.success).toBe(true);
      expect(result.totalPallets).toBe(5);
      expect(result.totalCases).toBe(20);
      expect(result.totalItems).toBe(25);
      expect(result.durationSeconds).toBeGreaterThan(3500);
    });

    it("throws when session is not found or not active", async () => {
      mockExecute.mockResolvedValueOnce([]); // no active session

      const caller = appRouterV4.createCaller(makeCtx());
      await expect(caller.pullTracker.endSession({ sessionId: 999 })).rejects.toThrow(
        "Session not found or already completed"
      );
    });
  });

  // ── addItem ──────────────────────────────────────────────────────────────
  describe("addItem", () => {
    it("adds a scanned item to an active session", async () => {
      mockExecute
        .mockResolvedValueOnce([{ id: 1 }]) // session is active
        .mockResolvedValueOnce({ insertId: 10 }); // INSERT item

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.addItem({
        sessionId: 1,
        itemType: "case",
        barcode: "BC-9999",
        quantity: 1,
      });

      expect(result.itemId).toBe(10);
    });

    it("throws when session is not active", async () => {
      mockExecute.mockResolvedValueOnce([]); // no active session

      const caller = appRouterV4.createCaller(makeCtx());
      await expect(
        caller.pullTracker.addItem({ sessionId: 1, itemType: "case", barcode: "BC-001", quantity: 1 })
      ).rejects.toThrow("Session not active");
    });
  });

  // ── listSessions ─────────────────────────────────────────────────────────
  describe("listSessions", () => {
    it("returns mapped session list", async () => {
      mockExecute.mockResolvedValueOnce([
        {
          id: 1,
          pick_ticket: "PT-001",
          associate_id: "EMP-1",
          associate_name: "Alice",
          warehouse_id: "COL",
          status: "completed",
          started_at: 1_700_000_000_000,
          ended_at: 1_700_003_600_000,
          duration_seconds: 3600,
          total_pallets: 3,
          total_cases: 12,
          total_items: 15,
          opfi_pushed: 1,
          item_count: 15,
        },
      ]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.listSessions({ status: "completed", limit: 10, offset: 0 });

      expect(result).toHaveLength(1);
      expect(result[0].pickTicket).toBe("PT-001");
      expect(result[0].totalPallets).toBe(3);
      expect(result[0].opfiPushed).toBe(true);
    });

    it("returns empty array when no sessions match", async () => {
      mockExecute.mockResolvedValueOnce([]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.listSessions({ status: "active", limit: 10, offset: 0 });
      expect(result).toHaveLength(0);
    });
  });

  // ── associateStats ───────────────────────────────────────────────────────
  describe("associateStats", () => {
    it("returns efficiency stats per associate", async () => {
      mockExecute.mockResolvedValueOnce([
        {
          associate_id: "EMP-1",
          associate_name: "Alice",
          session_count: 5,
          total_pallets: 10,
          total_cases: 50,
          total_items: 60,
          total_seconds: 18000,
          avg_seconds_per_session: 3600,
          items_per_hour: 12.0,
        },
      ]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.associateStats({});

      expect(result).toHaveLength(1);
      expect(result[0].associateId).toBe("EMP-1");
      expect(result[0].itemsPerHour).toBe(12.0);
      expect(result[0].sessionCount).toBe(5);
    });

    it("returns empty array when no completed sessions", async () => {
      mockExecute.mockResolvedValueOnce([]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.associateStats({});
      expect(result).toHaveLength(0);
    });
  });

  // ── removeItem ───────────────────────────────────────────────────────────
  describe("removeItem", () => {
    it("deletes an item by id", async () => {
      mockExecute.mockResolvedValueOnce({});

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.removeItem({ itemId: 5 });
      expect(result.success).toBe(true);
    });
  });
});
