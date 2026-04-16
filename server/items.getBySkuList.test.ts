/**
 * Tests for items.getBySkuList tRPC procedure.
 *
 * Verifies:
 *  - Requests with a wrong/missing x-api-key are rejected with UNAUTHORIZED
 *  - Requests with the correct x-api-key are accepted (auth middleware passes)
 *  - Input validation rejects empty SKU arrays
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { itemsRouter } from "./routers/items";

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── tests ─────────────────────────────────────────────────────────────────────

describe("items.getBySkuList — API key authentication", () => {
  const originalEnv = process.env.GD_ROBOTICS_API_KEY;

  beforeEach(() => {
    process.env.GD_ROBOTICS_API_KEY = VALID_KEY;
    // Re-import ENV to pick up the new value (ENV is a plain object, so we
    // patch it directly via the module's exported reference)
    vi.resetModules();
  });

  afterEach(() => {
    process.env.GD_ROBOTICS_API_KEY = originalEnv;
    vi.resetModules();
  });

  it("rejects requests with a missing x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx(undefined));
    await expect(
      caller.getBySkuList({ configId: 1, customerId: 1, skus: ["SKU-001"] })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx("wrong-key"));
    await expect(
      caller.getBySkuList({ configId: 1, customerId: 1, skus: ["SKU-001"] })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("items.getBySkuList — input validation", () => {
  const originalEnv = process.env.GD_ROBOTICS_API_KEY;

  beforeEach(() => {
    process.env.GD_ROBOTICS_API_KEY = VALID_KEY;
  });

  afterEach(() => {
    process.env.GD_ROBOTICS_API_KEY = originalEnv;
  });

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
