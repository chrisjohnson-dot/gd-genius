/**
 * Tests for items.listConfigs, items.getConfig, items.getBySkuList, and items.clearDimsCache.
 *
 * Verifies:
 *  - Requests with a wrong/missing x-api-key are rejected with UNAUTHORIZED
 *  - Requests with the correct x-api-key are accepted (auth middleware passes)
 *  - Input validation rejects empty SKU arrays and oversized lists
 *  - clearDimsCache returns the correct scope response
 *  - listConfigs returns the expected shape when the DB returns configs
 *  - getConfig returns the enriched shape for a valid configId, NOT_FOUND for missing/inactive
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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
  getLastSyncTimeByConfig: vi.fn().mockResolvedValue(new Date("2026-04-17T00:00:00.000Z")),
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
  getExtensivConfigById: vi.fn().mockImplementation((id: number) => {
    if (id === 1)
      return Promise.resolve({
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
      });
    if (id === 2)
      return Promise.resolve({
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
      });
    return Promise.resolve(undefined);
  }),
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
  // Acme Corp (101) belongs to both facilities; Beta LLC (102) only to TOR (10)
  fetchCustomersForFacility: vi.fn().mockImplementation((_config, facilityId: number) => {
    if (facilityId === 10) return Promise.resolve([{ id: 101, name: "Acme Corp" }, { id: 102, name: "Beta LLC" }]);
    if (facilityId === 11) return Promise.resolve([{ id: 101, name: "Acme Corp" }]);
    return Promise.resolve([]);
  }),
  fetchItemDimsBySkus: vi.fn().mockResolvedValue([]),
  clearItemDimsCache: vi.fn(),
}));

// ── Import the router AFTER all mocks are registered ─────────────────────────
import { itemsRouter, invalidateListConfigsCache } from "./routers/items";

// ── Reset the in-memory listConfigs cache before each test ───────────────────
// Without this, the cache populated by the first test leaks into subsequent
// tests that mock fetchCustomers/fetchAllFacilities to throw, causing them to
// receive the cached (non-empty) result instead of the degraded one.
beforeEach(() => {
  invalidateListConfigsCache();
});

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
  it("returns only active configs with customers, facilities, and customerFacilities map", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.listConfigs();

    // Only the active config (id=1) should appear; inactive (id=2) is filtered out
    expect(result.configs).toHaveLength(1);
    const cfg = result.configs[0]!;
    expect(cfg).toMatchObject({ configId: 1, configName: "Main Warehouse" });
    expect(cfg.lastSyncedAt).toEqual(new Date("2026-04-17T00:00:00.000Z"));

    expect(cfg.customers).toEqual([
      { customerId: 101, customerName: "Acme Corp" },
      { customerId: 102, customerName: "Beta LLC" },
    ]);
    expect(cfg.facilities).toEqual([
      { facilityId: 10, facilityName: "TOR-Toronto" },
      { facilityId: 11, facilityName: "CAL-Calgary" },
    ]);

    // Acme (101) → both facilities; Beta (102) → TOR only
    const acme = cfg.customerFacilities.find((cf) => cf.customerId === 101);
    const beta = cfg.customerFacilities.find((cf) => cf.customerId === 102);
    expect(acme?.facilityIds).toEqual([10, 11]);
    expect(beta?.facilityIds).toEqual([10]);
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

// ── getConfig — auth + response tests ───────────────────────────────────────

describe("items.getConfig — API key authentication", () => {
  it("rejects requests with a missing x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx(undefined));
    await expect(caller.getConfig({ configId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx("wrong-key"));
    await expect(caller.getConfig({ configId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("items.getConfig — response shape", () => {
  it("returns the enriched config for a valid active configId", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.getConfig({ configId: 1 });

    expect(result).toMatchObject({ configId: 1, configName: "Main Warehouse" });
    expect(result.customers).toEqual([
      { customerId: 101, customerName: "Acme Corp" },
      { customerId: 102, customerName: "Beta LLC" },
    ]);
    expect(result.facilities).toEqual([
      { facilityId: 10, facilityName: "TOR-Toronto" },
      { facilityId: 11, facilityName: "CAL-Calgary" },
    ]);
    const acme = result.customerFacilities.find((cf) => cf.customerId === 101);
    expect(acme?.facilityIds).toEqual([10, 11]);
    expect(result.lastSyncedAt).toEqual(new Date("2026-04-17T00:00:00.000Z"));
  });

  it("returns null lastSyncedAt when no orders have been synced", async () => {
    const { getLastSyncTimeByConfig } = await import("./db");
    vi.mocked(getLastSyncTimeByConfig).mockResolvedValueOnce(null);

    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const result = await caller.getConfig({ configId: 1 });
    expect(result.lastSyncedAt).toBeNull();
  });

  it("throws NOT_FOUND for an inactive configId", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    await expect(caller.getConfig({ configId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for a non-existent configId", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    await expect(caller.getConfig({ configId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ── refreshConfig — auth + behaviour tests ───────────────────────────────────

describe("items.refreshConfig — API key authentication", () => {
  it("rejects requests with a missing x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx(undefined));
    await expect(caller.refreshConfig({ configId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const caller = itemsRouter.createCaller(makeCtx("wrong-key"));
    await expect(caller.refreshConfig({ configId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("items.refreshConfig — behaviour", () => {
  it("returns the enriched config with a refreshedAt timestamp for a valid active configId", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    const before = new Date();
    const result = await caller.refreshConfig({ configId: 1 });
    const after = new Date();

    expect(result).toMatchObject({ configId: 1, configName: "Main Warehouse" });
    expect(result.refreshedAt).toBeInstanceOf(Date);
    expect(result.refreshedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.refreshedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    // enriched fields should still be present
    expect(result.customers).toHaveLength(2);
    expect(result.facilities).toHaveLength(2);
  });

  it("clears the dims cache for each customer in the config", async () => {
    const { clearItemDimsCache } = await import("./extensiv/api");
    vi.mocked(clearItemDimsCache).mockClear();

    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    await caller.refreshConfig({ configId: 1 });

    // Should have been called once per customer (Acme=101, Beta=102)
    expect(clearItemDimsCache).toHaveBeenCalledTimes(2);
    expect(clearItemDimsCache).toHaveBeenCalledWith("guid-1", 101);
    expect(clearItemDimsCache).toHaveBeenCalledWith("guid-1", 102);
  });

  it("throws NOT_FOUND for an inactive configId", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    await expect(caller.refreshConfig({ configId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for a non-existent configId", async () => {
    const caller = itemsRouter.createCaller(makeCtx(VALID_KEY));
    await expect(caller.refreshConfig({ configId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
