/**
 * Tests for items.getBySkuList and items.clearDimsCache tRPC procedures.
 *
 * Verifies:
 *  - Requests with a wrong/missing x-api-key are rejected with UNAUTHORIZED
 *  - Requests with the correct x-api-key are accepted (auth middleware passes)
 *  - Input validation rejects empty SKU arrays and oversized lists
 *  - clearDimsCache returns the correct scope response
 */

import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// ── Mock ENV before importing anything that uses it ───────────────────────────
// NOTE: vi.mock is hoisted to the top of the file by Vitest, so the factory
// cannot reference variables declared in this module. Use a literal value here.
vi.mock("./_core/env", () => ({
  ENV: {
    gdRoboticsApiKey: "test-robotics-api-key-abc123",
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

// ── Import the router AFTER the mock is registered ───────────────────────────
import { itemsRouter } from "./routers/items";

// ── helpers ──────────────────────────────────────────────────────────────────

// Must match the literal value used in the vi.mock factory above
const VALID_KEY = "test-robotics-api-key-abc123";

function makeCtx(apiKey?: string): TrpcContext {
  return {
    user: null,
    req: {
      headers: apiKey ? { "x-api-key": apiKey } : {},
      protocol: "https",
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ── getBySkuList — auth tests ─────────────────────────────────────────────────

describe("items.getBySkuList — API key authentication", () => {
  it("rejects requests with a missing x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx(undefined));
    await expect(
      caller.getBySkuList({ configId: 1, customerId: 1, skus: ["SKU-001"] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx("wrong-key"));
    await expect(
      caller.getBySkuList({ configId: 1, customerId: 1, skus: ["SKU-001"] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ── getBySkuList — input validation ──────────────────────────────────────────

describe("items.getBySkuList — input validation", () => {
  it("rejects an empty skus array", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    await expect(
      caller.getBySkuList({ configId: 1, customerId: 1, skus: [] })
    ).rejects.toThrow();
  });

  it("rejects a skus array with more than 500 items", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const bigList = Array.from({ length: 501 }, (_, i) => `SKU-${i}`);
    await expect(
      caller.getBySkuList({ configId: 1, customerId: 1, skus: bigList })
    ).rejects.toThrow();
  });
});

// ── clearDimsCache — auth tests ───────────────────────────────────────────────

describe("items.clearDimsCache — API key authentication", () => {
  it("rejects requests with a missing x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx(undefined));
    await expect(
      caller.clearDimsCache({})
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx("bad-key"));
    await expect(
      caller.clearDimsCache({})
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("accepts a global clear (no configId/customerId) and returns scope=all", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.clearDimsCache({});
    expect(result).toEqual({ cleared: true, scope: "all" });
  });
});
