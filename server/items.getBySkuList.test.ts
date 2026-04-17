/**
 * Tests for items.listConfigs, items.getBySkuList, and items.clearDimsCache.
 *
 * Verifies:
 *  - Requests with a wrong/missing x-api-key are rejected with UNAUTHORIZED
 *  - Requests with the correct x-api-key are accepted (auth middleware passes)
 *  - Input validation rejects empty SKU arrays and oversized lists
 *  - clearDimsCache returns the correct scope response
 *  - listConfigs returns the expected shape when the DB returns configs
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

// ── Mock DB and Extensiv API for listConfigs tests ────────────────────────────
vi.mock("./db", () => ({
  getExtensivConfigs: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Main Warehouse",
      clientId: "client-1",
      clientSecret: "secret-1",
      tplGuid: "guid-1",
      userLoginId: 42,
      baseUrl: "https://secure-wms.com",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: "Inactive Config",
      clientId: "client-2",
      clientSecret: "secret-2",
      tplGuid: "guid-2",
      userLoginId: 43,
      baseUrl: "https://secure-wms.com",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getExtensivConfigById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./extensiv/api", () => ({
  fetchCustomers: vi.fn().mockResolvedValue([
    { id: 101, name: "Acme Corp" },
    { id: 102, name: "Beta LLC" },
  ]),
  fetchAllFacilities: vi.fn().mockResolvedValue([
    { id: 10, name: "TOR-Toronto" },
    { id: 11, name: "CAL-Calgary" },
  ]),
  fetchItemDimsBySkus: vi.fn().mockResolvedValue([]),
  clearItemDimsCache: vi.fn(),
}));

// ── Import the router AFTER all mocks are registered ─────────────────────────
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

// ── listConfigs — auth tests ──────────────────────────────────────────────────

describe("items.listConfigs — API key authentication", () => {
  it("rejects requests with a missing x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx(undefined));
    await expect(caller.listConfigs()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx("wrong-key"));
    await expect(caller.listConfigs()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ── listConfigs — response shape ──────────────────────────────────────────────

describe("items.listConfigs — response shape", () => {
  it("returns only active configs with their customers and facilities", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.listConfigs();

    // Only the active config (id=1) should appear; inactive (id=2) is filtered out
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0]).toMatchObject({
      configId: 1,
      configName: "Main Warehouse",
    });
    expect(result.configs[0]!.customers).toEqual([
      { customerId: 101, customerName: "Acme Corp" },
      { customerId: 102, customerName: "Beta LLC" },
    ]);
    expect(result.configs[0]!.facilities).toEqual([
      { facilityId: 10, facilityName: "TOR-Toronto" },
      { facilityId: 11, facilityName: "CAL-Calgary" },
    ]);
  });

  it("returns an empty customers array when fetchCustomers throws", async () => {
    const { fetchCustomers } = await import("./extensiv/api");
    vi.mocked(fetchCustomers).mockRejectedValueOnce(new Error("Network error"));

    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.listConfigs();

    expect(result.configs[0]!.customers).toEqual([]);
    // facilities should still be populated even when customers fails
    expect(result.configs[0]!.facilities).toHaveLength(2);
  });

  it("returns an empty facilities array when fetchAllFacilities throws", async () => {
    const { fetchAllFacilities } = await import("./extensiv/api");
    vi.mocked(fetchAllFacilities).mockRejectedValueOnce(new Error("Network error"));

    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.listConfigs();

    expect(result.configs[0]!.facilities).toEqual([]);
    // customers should still be populated even when facilities fails
    expect(result.configs[0]!.customers).toHaveLength(2);
  });
});

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
    await expect(caller.clearDimsCache({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx("bad-key"));
    await expect(caller.clearDimsCache({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("accepts a global clear (no configId/customerId) and returns scope=all", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.clearDimsCache({});
    expect(result).toEqual({ cleared: true, scope: "all" });
  });
});
