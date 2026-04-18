/**
 * Tests for ediRetailersRouter and ediEscalationsRouter.
 *
 * Verifies:
 *  - ediRetailers.list returns all retailers from the DB
 *  - ediRetailers.get returns the retailer by id, throws NOT_FOUND for missing
 *  - ediRetailers.create inserts a retailer and returns the new id
 *  - ediRetailers.update calls updateEdiRetailer and returns { success: true }
 *  - ediRetailers.delete calls deleteEdiRetailer and returns { success: true }
 *  - ediEscalations.list returns escalations (filtered by configId when provided)
 *  - ediEscalations.flag creates an escalation and returns { id }
 *  - ediEscalations.resolve calls resolveEdiEscalation and returns { success: true }
 *  - ediEscalations.dismiss calls dismissEdiEscalation and returns { success: true }
 *
 * All procedures are protectedProcedure — tests use an authenticated context.
 */

import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// ── Mock ENV ──────────────────────────────────────────────────────────────────
// NOTE: vi.mock factories are hoisted — no top-level variables can be referenced.
vi.mock("./_core/env", () => ({
  ENV: {
    gdRoboticsApiKey: "test-robotics-api-key",
    appId: "",
    cookieSecret: "test-secret",
    databaseUrl: "",
    oAuthServerUrl: "",
    ownerOpenId: "",
    isProduction: false,
    forgeApiUrl: "",
    forgeApiKey: "",
    sharedLoginUsername: "",
    sharedLoginPassword: "",
  },
}));

// ── Mock DB helpers ───────────────────────────────────────────────────────────
// All data is inlined inside the factory to avoid hoisting issues.
vi.mock("./db", () => ({
  // ediRetailers
  getEdiRetailers: vi.fn().mockResolvedValue([
    { id: 1, name: "Walmart", requiresEdi: true, aliases: "[]", notes: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") },
    { id: 2, name: "Local Co", requiresEdi: false, aliases: "[]", notes: "Small local retailer", createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02") },
  ]),
  getEdiRetailerById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) return Promise.resolve({ id: 1, name: "Walmart", requiresEdi: true, aliases: "[]", notes: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") });
    if (id === 2) return Promise.resolve({ id: 2, name: "Local Co", requiresEdi: false, aliases: "[]", notes: "Small local retailer", createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02") });
    return Promise.resolve(undefined);
  }),
  createEdiRetailer: vi.fn().mockResolvedValue(42),
  updateEdiRetailer: vi.fn().mockResolvedValue(undefined),
  deleteEdiRetailer: vi.fn().mockResolvedValue(undefined),

  // ediEscalations
  getEdiEscalations: vi.fn().mockImplementation((configId?: number) => {
    const esc = { id: 10, configId: 5, orderNumber: "ORD-001", customerName: "Acme Corp", shipDate: "2026-04-10", trackingNumber: "1Z999AA1", flaggedBy: "Test User", flaggedAt: 1712700000000, notes: "Missing 945", resolvedAt: null, resolvedBy: null, status: "open" };
    if (configId === 5) return Promise.resolve([esc]);
    if (configId !== undefined) return Promise.resolve([]);
    return Promise.resolve([esc]);
  }),
  createEdiEscalation: vi.fn().mockResolvedValue(10),
  resolveEdiEscalation: vi.fn().mockResolvedValue(undefined),
  dismissEdiEscalation: vi.fn().mockResolvedValue(undefined),

  // Other DB helpers used by the broader router (prevent import errors)
  getExtensivConfigs: vi.fn().mockResolvedValue([]),
  getExtensivConfigById: vi.fn().mockResolvedValue(undefined),
  getLastSyncTimeByConfig: vi.fn().mockResolvedValue(null),
}));

// ── Mock notification (non-blocking in the flag handler) ─────────────────────
vi.mock("./_core/notification.js", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ── Import the appRouterV4 AFTER mocks ────────────────────────────────────────
import { appRouterV4 } from "./routers";

// ── Helper: authenticated context ────────────────────────────────────────────
function makeAuthCtx(name = "Test User"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      email: "test@example.com",
      name,
      loginMethod: "shared",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ── ediRetailers tests ────────────────────────────────────────────────────────

describe("ediRetailers.list", () => {
  it("returns all retailers from the DB", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediRetailers.list();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, name: "Walmart" });
    expect(result[1]).toMatchObject({ id: 2, name: "Local Co" });
  });
});

describe("ediRetailers.get", () => {
  it("returns the retailer when found", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediRetailers.get({ id: 1 });
    expect(result).toMatchObject({ id: 1, name: "Walmart", requiresEdi: true });
  });

  it("throws NOT_FOUND when the retailer does not exist", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    await expect(caller.ediRetailers.get({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ediRetailers.create", () => {
  it("creates a retailer and returns the new id", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediRetailers.create({
      name: "Target",
      requiresEdi: true,
      aliases: ["TGT"],
    });
    expect(result).toEqual({ id: 42 });
  });
});

describe("ediRetailers.update", () => {
  it("updates a retailer and returns success", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediRetailers.update({ id: 1, name: "Walmart Inc." });
    expect(result).toEqual({ success: true });
  });
});

describe("ediRetailers.delete", () => {
  it("deletes a retailer and returns success", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediRetailers.delete({ id: 2 });
    expect(result).toEqual({ success: true });
  });
});

// ── ediEscalations tests ──────────────────────────────────────────────────────

describe("ediEscalations.list", () => {
  it("returns all escalations when no configId is provided", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediEscalations.list({});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 10, orderNumber: "ORD-001", status: "open" });
  });

  it("returns escalations filtered by configId", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediEscalations.list({ configId: 5 });
    expect(result).toHaveLength(1);
    expect(result[0]?.configId).toBe(5);
  });

  it("returns empty array for a configId with no escalations", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediEscalations.list({ configId: 99 });
    expect(result).toHaveLength(0);
  });
});

describe("ediEscalations.flag", () => {
  it("creates an escalation with all fields and returns the new id", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediEscalations.flag({
      configId: 5,
      orderNumber: "ORD-002",
      customerName: "Beta LLC",
      shipDate: "2026-04-15",
      trackingNumber: "1Z000AA2",
      notes: "Needs follow-up",
    });
    expect(result).toEqual({ id: 10 });
  });

  it("creates an escalation with only required fields", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediEscalations.flag({
      configId: 5,
      orderNumber: "ORD-003",
    });
    expect(result).toEqual({ id: 10 });
  });
});

describe("ediEscalations.resolve", () => {
  it("resolves an escalation and returns success", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediEscalations.resolve({ id: 10 });
    expect(result).toEqual({ success: true });
  });
});

describe("ediEscalations.dismiss", () => {
  it("dismisses an escalation and returns success", async () => {
    const caller = appRouterV4.createCaller(makeAuthCtx());
    const result = await caller.ediEscalations.dismiss({ id: 10 });
    expect(result).toEqual({ success: true });
  });
});
