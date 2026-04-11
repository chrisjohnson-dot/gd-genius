/**
 * pullTracker.test.ts
 * Unit tests for the Warehouse Pull Tracker router procedures.
 *
 * Mock call counts per procedure (when associateName is provided, lookup is skipped):
 *   startSession (new, name provided):  2 calls  — SELECT existing, INSERT
 *   startSession (resume, name provided): 1 call — SELECT existing (returns row)
 *   endSession (success):               4 calls  — SELECT session, COUNT items, UPDATE session, UPDATE opfi_pushed
 *   addItem (success):                  2 calls  — SELECT active session, INSERT item
 *   listSessions:                       1 call   — SELECT sessions
 *   associateStats:                     1 call   — SELECT stats
 *   removeItem:                         1 call   — DELETE item
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
    mockFetch.mockResolvedValue({ ok: true });
  });

  // ── startSession ─────────────────────────────────────────────────────────
  describe("startSession", () => {
    it("creates a new session when none is active (name provided → 2 execute calls)", async () => {
      mockExecute
        .mockResolvedValueOnce([])                    // SELECT existing active session → none
        .mockResolvedValueOnce({ insertId: 42 });     // INSERT new session

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.startSession({
        pickTicket: "PT-001",
        associateId: "EMP-123",
        associateName: "John Doe",
        warehouseId: "COL",
      });

      expect(result.resumed).toBe(false);
    });

    it("creates a new session when none is active (no name → 3 execute calls: lookup + check + insert)", async () => {
      mockExecute
        .mockResolvedValueOnce([])                    // associate lookup → not found
        .mockResolvedValueOnce([])                    // SELECT existing active session → none
        .mockResolvedValueOnce({ insertId: 43 });     // INSERT new session

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.startSession({
        pickTicket: "PT-002",
        associateId: "EMP-456",
        warehouseId: "COL",
      });

      expect(result.resumed).toBe(false);
    });

    it("resumes an existing active session (name provided → 1 execute call)", async () => {
      mockExecute.mockResolvedValueOnce([{ id: 99 }]); // SELECT existing → found

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.startSession({
        pickTicket: "PT-001",
        associateId: "EMP-123",
        associateName: "John Doe",
      });

      expect(result.resumed).toBe(true);
    });

    it("throws a Zod validation error when pickTicket is empty", async () => {
      const caller = appRouterV4.createCaller(makeCtx());
      await expect(
        caller.pullTracker.startSession({ pickTicket: "", associateId: "EMP-123" })
      ).rejects.toThrow();
    });

    it("throws a Zod validation error when associateId is empty", async () => {
      const caller = appRouterV4.createCaller(makeCtx());
      await expect(
        caller.pullTracker.startSession({ pickTicket: "PT-001", associateId: "" })
      ).rejects.toThrow();
    });
  });

  // ── endSession ───────────────────────────────────────────────────────────
  describe("endSession", () => {
    it("completes a session and calculates duration (4 execute calls)", async () => {
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
        }])                                              // SELECT session
        .mockResolvedValueOnce([{ pallets: 5, cases: 20, total: 25 }]) // COUNT items
        .mockResolvedValueOnce({})                       // UPDATE session
        .mockResolvedValueOnce({});                      // UPDATE opfi_pushed

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
    it("adds a scanned item to an active session (2 execute calls)", async () => {
      mockExecute
        .mockResolvedValueOnce([{ id: 1 }])             // SELECT active session
        .mockResolvedValueOnce({ insertId: 10 });        // INSERT item

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.addItem({
        sessionId: 1,
        itemType: "case",
        barcode: "BC-9999",
        quantity: 1,
      });

      expect(result).toHaveProperty("itemId");
    });

    it("throws when session is not active (1 execute call → empty)", async () => {
      mockExecute.mockResolvedValueOnce([]); // no active session

      const caller = appRouterV4.createCaller(makeCtx());
      await expect(
        caller.pullTracker.addItem({ sessionId: 1, itemType: "case", barcode: "BC-001", quantity: 1 })
      ).rejects.toThrow("Session not active");
    });
  });

  // ── listSessions ─────────────────────────────────────────────────────────
  describe("listSessions", () => {
    it("returns mapped session list (1 execute call)", async () => {
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

    it("returns empty array when no sessions match (1 execute call → empty)", async () => {
      mockExecute.mockResolvedValueOnce([]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.listSessions({ status: "active", limit: 10, offset: 0 });
      expect(result).toHaveLength(0);
    });
  });

  // ── associateStats ───────────────────────────────────────────────────────
  describe("associateStats", () => {
    it("returns efficiency stats per associate (1 execute call)", async () => {
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

    it("returns empty array when no completed sessions (1 execute call → empty)", async () => {
      mockExecute.mockResolvedValueOnce([]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.associateStats({});
      expect(result).toHaveLength(0);
    });
  });

  // ── removeItem ───────────────────────────────────────────────────────────
  describe("removeItem", () => {
    it("deletes an item by id (1 execute call)", async () => {
      mockExecute.mockResolvedValueOnce({});

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.removeItem({ itemId: 5 });
      expect(result.success).toBe(true);
    });
  });
});
