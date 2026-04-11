import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock the notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { getDb } from "./db";
import { checkOverdueSessions } from "./routers/pullAlerts";

const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };

beforeEach(() => {
  vi.clearAllMocks();
  (getDb as any).mockResolvedValue(mockDb);
});

describe("checkOverdueSessions", () => {
  it("returns 0 when no enabled settings exist", async () => {
    mockExecute.mockResolvedValueOnce([[]]); // settings query returns empty nested array
    const fired = await checkOverdueSessions();
    expect(fired).toBe(0);
  });

  it("returns 0 when no active sessions exist", async () => {
    mockExecute
      .mockResolvedValueOnce([[{ warehouse_id: "all", threshold_minutes: 120 }]]) // settings
      .mockResolvedValueOnce([[]]); // active sessions
    const fired = await checkOverdueSessions();
    expect(fired).toBe(0);
  });

  it("returns 0 when session is under threshold", async () => {
    const now = Date.now();
    mockExecute
      .mockResolvedValueOnce([[{ warehouse_id: "all", threshold_minutes: 120 }]]) // settings
      .mockResolvedValueOnce([[{ // active sessions
        id: 1,
        pick_ticket: "PT-001",
        associate_id: "A001",
        associate_name: "John",
        warehouse_id: "LAX",
        started_at: now - 30 * 60 * 1000, // 30 min ago — under threshold
      }]]);
    const fired = await checkOverdueSessions();
    expect(fired).toBe(0);
  });

  it("fires an alert when session exceeds threshold", async () => {
    const now = Date.now();
    mockExecute
      .mockResolvedValueOnce([[{ warehouse_id: "all", threshold_minutes: 120 }]]) // settings
      .mockResolvedValueOnce([[{ // active sessions
        id: 1,
        pick_ticket: "PT-001",
        associate_id: "A001",
        associate_name: "John",
        warehouse_id: "LAX",
        started_at: now - 150 * 60 * 1000, // 150 min ago — over threshold
      }]])
      .mockResolvedValueOnce([[]]) // no existing alert
      .mockResolvedValueOnce(undefined); // insert alert
    const fired = await checkOverdueSessions();
    expect(fired).toBe(1);
  });

  it("skips session that already has an alert", async () => {
    const now = Date.now();
    mockExecute
      .mockResolvedValueOnce([[{ warehouse_id: "all", threshold_minutes: 120 }]]) // settings
      .mockResolvedValueOnce([[{ // active sessions
        id: 1,
        pick_ticket: "PT-001",
        associate_id: "A001",
        associate_name: "John",
        warehouse_id: "LAX",
        started_at: now - 150 * 60 * 1000,
      }]])
      .mockResolvedValueOnce([[{ id: 99, alert_level: 1 }]]); // existing alert found (level 1 already fired)
    const fired = await checkOverdueSessions();
    expect(fired).toBe(0);
  });

  it("uses per-warehouse threshold override when available", async () => {
    const now = Date.now();
    mockExecute
      .mockResolvedValueOnce([[ // settings — global 120min, LAX override 60min
        { warehouse_id: "all", threshold_minutes: 120 },
        { warehouse_id: "LAX", threshold_minutes: 60 },
      ]])
      .mockResolvedValueOnce([[{ // active session at LAX, 90 min elapsed
        id: 2,
        pick_ticket: "PT-002",
        associate_id: "A002",
        associate_name: "Jane",
        warehouse_id: "LAX",
        started_at: now - 90 * 60 * 1000, // 90 min > 60 min LAX threshold
      }]])
      .mockResolvedValueOnce([[]]) // no existing alert
      .mockResolvedValueOnce(undefined); // insert
    const fired = await checkOverdueSessions();
    expect(fired).toBe(1);
  });
});
