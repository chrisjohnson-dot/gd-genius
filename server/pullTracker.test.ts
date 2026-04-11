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

  // ── removeItem ───────────────────────────────────────────────────────────────
  describe("removeItem", () => {
    it("deletes an item by id (1 execute call)", async () => {
      mockExecute.mockResolvedValueOnce({});

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.removeItem({ itemId: 5 });
      expect(result.success).toBe(true);
    });
  });

  // ── exportSessions ───────────────────────────────────────────────────────────
  describe("exportSessions", () => {
    it("returns CSV string with header + data rows", async () => {
      const startedAt = 1_700_000_000_000;
      const endedAt   = 1_700_003_600_000; // 1 hour later

      mockExecute.mockResolvedValueOnce([
        {
          id: 1,
          pick_ticket: "PT-001",
          associate_id: "EMP-1",
          associate_name: "Alice",
          warehouse_id: "COL",
          status: "completed",
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds: 3600,
          total_pallets: 3,
          total_cases: 12,
          total_items: 15,
          opfi_pushed: 1,
          notes: null,
        },
      ]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.exportSessions({ status: "completed" });

      expect(result.rowCount).toBe(1);
      expect(result.csv).toContain("Session ID");
      expect(result.csv).toContain("Pick Ticket");
      expect(result.csv).toContain("PT-001");
      expect(result.csv).toContain("Alice");
      expect(result.csv).toContain("COL");
      expect(result.csv).toContain("Yes"); // opfi_pushed
      // Duration should be 60 minutes
      expect(result.csv).toContain("60");
      // Items/hour: 15 items / 1 hour = 15
      expect(result.csv).toContain("15");
    });

    it("returns empty CSV (header only) when no sessions match", async () => {
      mockExecute.mockResolvedValueOnce([]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.exportSessions({ status: "active" });

      expect(result.rowCount).toBe(0);
      // Should still have the header row
      expect(result.csv).toContain("Session ID");
      const lines = result.csv.split("\n");
      expect(lines).toHaveLength(1); // only header
    });

    it("escapes commas and quotes in CSV cells", async () => {
      mockExecute.mockResolvedValueOnce([
        {
          id: 2,
          pick_ticket: "PT,002",        // contains comma
          associate_id: "EMP-2",
          associate_name: 'Bob "The Builder"', // contains quotes
          warehouse_id: "TOR",
          status: "completed",
          started_at: 1_700_000_000_000,
          ended_at: 1_700_003_600_000,
          duration_seconds: 3600,
          total_pallets: 1,
          total_cases: 5,
          total_items: 6,
          opfi_pushed: 0,
          notes: "Line1\nLine2", // contains newline
        },
      ]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.exportSessions({});

      // Comma in pick ticket should be quoted
      expect(result.csv).toContain('"PT,002"');
      // Quotes in name should be escaped as double-quotes
      expect(result.csv).toContain('"Bob ""The Builder"""');
      // Newline in notes should be quoted
      expect(result.csv).toContain('"Line1\nLine2"');
    });

    it("handles sessions with no end time (active sessions)", async () => {
      mockExecute.mockResolvedValueOnce([
        {
          id: 3,
          pick_ticket: "PT-003",
          associate_id: "EMP-3",
          associate_name: "Carol",
          warehouse_id: "COL",
          status: "active",
          started_at: Date.now() - 1800_000,
          ended_at: null,
          duration_seconds: null,
          total_pallets: 0,
          total_cases: 0,
          total_items: 0,
          opfi_pushed: 0,
          notes: null,
        },
      ]);

      const caller = appRouterV4.createCaller(makeCtx());
      const result = await caller.pullTracker.exportSessions({ status: "active" });

      expect(result.rowCount).toBe(1);
      // Ended At and Duration should be empty for active sessions
      const lines = result.csv.split("\n");
      const dataLine = lines[1];
      // The ended_at and duration_min columns should be empty strings
      expect(dataLine).toContain("active");
    });
  });
});
// ─── getActiveSessions ────────────────────────────────────────────────────────
describe("getActiveSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no active sessions exist", async () => {
    mockExecute
      .mockResolvedValueOnce([])   // session rows (flat array — no nested)
      .mockResolvedValueOnce([]);  // rate settings
    const caller = appRouterV4.createCaller(makeCtx());
    const result = await caller.pullTracker.getActiveSessions();
    expect(result).toHaveLength(0);
  });

  it("computes paceStatus=on_pace when actual matches ghost", async () => {
    const startedAt = Date.now() - 3600_000; // 1 hour ago
    // With default rate 30 items/hr, ghost = 30 after 1 hr
    // If itemsScanned = 30 → paceRatio = 1.0 → on_pace
    mockExecute
      .mockResolvedValueOnce([{
        id: 1,
        pick_ticket: "PT-100",
        associate_id: "EMP-1",
        associate_name: "Alice",
        warehouse_id: "COL",
        started_at: startedAt,
        items_scanned: 30,
      }])
      .mockResolvedValueOnce([]); // no rate settings → use default 30
    const caller = appRouterV4.createCaller(makeCtx());
    const result = await caller.pullTracker.getActiveSessions();
    expect(result).toHaveLength(1);
    expect(result[0].paceStatus).toBe("on_pace");
    expect(result[0].expectedRate).toBe(30);
    expect(result[0].itemsScanned).toBe(30);
  });

  it("computes paceStatus=behind when actual is well below ghost", async () => {
    const startedAt = Date.now() - 3600_000; // 1 hour ago
    // ghost = 30, actual = 10 → ratio = 0.33 → behind
    mockExecute
      .mockResolvedValueOnce([{
        id: 2,
        pick_ticket: "PT-200",
        associate_id: "EMP-2",
        associate_name: "Bob",
        warehouse_id: "LAX",
        started_at: startedAt,
        items_scanned: 10,
      }])
      .mockResolvedValueOnce([]); // no rate settings
    const caller = appRouterV4.createCaller(makeCtx());
    const result = await caller.pullTracker.getActiveSessions();
    expect(result[0].paceStatus).toBe("behind");
    expect(result[0].paceRatio).toBeLessThan(0.85);
  });

  it("uses per-warehouse rate from pull_alert_settings", async () => {
    const startedAt = Date.now() - 3600_000; // 1 hour ago
    // warehouse LAX has rate 60 items/hr → ghost = 60 after 1 hr
    // actual = 65 → ratio = 1.08 → ahead
    mockExecute
      .mockResolvedValueOnce([{
        id: 3,
        pick_ticket: "PT-300",
        associate_id: "EMP-3",
        associate_name: "Carol",
        warehouse_id: "LAX",
        started_at: startedAt,
        items_scanned: 65,
      }])
      .mockResolvedValueOnce([{
        warehouse_id: "LAX",
        expected_items_per_hour: 60,
      }]);
    const caller = appRouterV4.createCaller(makeCtx());
    const result = await caller.pullTracker.getActiveSessions();
    expect(result[0].expectedRate).toBe(60);
    expect(result[0].paceStatus).toBe("ahead");
  });
});
