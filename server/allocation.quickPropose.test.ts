import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Mock the db module so we don't need a real database
vi.mock("./db", () => ({
  getExtensivConfigById: vi.fn(),
  getLocationConfigs: vi.fn(),
  getLocationConfigsByCustomer: vi.fn(),
  getCustomerRule: vi.fn(),
  createAllocationRun: vi.fn(),
  createAllocationRunOrders: vi.fn(),
  createAuditLog: vi.fn(),
  getExtensivConfigs: vi.fn(),
  upsertExtensivConfig: vi.fn(),
  deleteExtensivConfig: vi.fn(),
  upsertLocationConfig: vi.fn(),
  deleteLocationConfig: vi.fn(),
  deleteLocationConfigsByConfigAndCustomer: vi.fn(),
  updateAllocationRun: vi.fn(),
  getAllocationRuns: vi.fn(),
  getAllocationRunById: vi.fn(),
  getAllocationRunOrders: vi.fn(),
  getAuditLogs: vi.fn(),
  getCustomerRules: vi.fn(),
  upsertCustomerRule: vi.fn(),
  getScheduleConfig: vi.fn(),
  upsertScheduleConfig: vi.fn(),
  getAutoRunCustomers: vi.fn(),
}));

// Mock Extensiv API
vi.mock("./extensiv/api", () => ({
  fetchCustomers: vi.fn(),
  fetchOpenOrders: vi.fn(),
  fetchInventory: vi.fn(),
  fetchItemDescriptions: vi.fn(),
  fetchOrderWithDetail: vi.fn(),
  moveInventory: vi.fn(),
  allocateOrder: vi.fn(),
  updateOrderProposedAllocations: vi.fn(),
  fetchAllFacilities: vi.fn(),
  fetchCustomersForFacility: vi.fn(),
  fetchExtensivLocations: vi.fn(),
}));

vi.mock("./extensiv/client", () => ({
  getExtensivToken: vi.fn(),
  invalidateToken: vi.fn(),
}));

vi.mock("./scheduler/autoRun", () => ({
  startSchedule: vi.fn(),
  stopSchedule: vi.fn(),
  triggerManualRun: vi.fn(),
}));

import { appRouter } from "./routers";
import * as db from "./db";
import * as api from "./extensiv/api";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("allocation.quickPropose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when config does not exist", async () => {
    vi.mocked(db.getExtensivConfigById).mockResolvedValue(null);

    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.allocation.quickPropose({
        configId: 999,
        facilityId: 1,
        facilityName: "Reno",
      })
    ).rejects.toThrow("Config not found");
  });

  it("throws BAD_REQUEST when no customers have staging locations configured", async () => {
    vi.mocked(db.getExtensivConfigById).mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Test",
      tplGuid: "test-guid",
      customerGuid: "cust-guid",
      baseUrl: "https://secure-wms.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // No location configs at all
    vi.mocked(db.getLocationConfigs).mockResolvedValue([]);

    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.allocation.quickPropose({
        configId: 1,
        facilityId: 3,
        facilityName: "Reno",
      })
    ).rejects.toThrow("No customers with staging locations configured");
  });

  it("throws BAD_REQUEST when no open orders found for any customer", async () => {
    vi.mocked(db.getExtensivConfigById).mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Test",
      tplGuid: "test-guid",
      customerGuid: "cust-guid",
      baseUrl: "https://secure-wms.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // One customer with a staging location
    vi.mocked(db.getLocationConfigs).mockResolvedValue([
      {
        id: 1,
        configId: 1,
        customerId: 42,
        customerName: "OncOpa",
        facilityId: 3,
        locationType: "staging",
        locationId: 100,
        locationName: "HR001-Stage",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    // No open orders
    vi.mocked(api.fetchOpenOrders).mockResolvedValue([]);

    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.allocation.quickPropose({
        configId: 1,
        facilityId: 3,
        facilityName: "Reno",
      })
    ).rejects.toThrow("No open orders found");
  });

  it("filters to requested customerIds when provided", async () => {
    vi.mocked(db.getExtensivConfigById).mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Test",
      tplGuid: "test-guid",
      customerGuid: "cust-guid",
      baseUrl: "https://secure-wms.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Two customers with staging locations
    vi.mocked(db.getLocationConfigs).mockResolvedValue([
      {
        id: 1, configId: 1, customerId: 42, customerName: "OncOpa", facilityId: 3,
        locationType: "staging", locationId: 100, locationName: "HR001-Stage",
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 2, configId: 1, customerId: 55, customerName: "BigBoi", facilityId: 3,
        locationType: "staging", locationId: 200, locationName: "BIG001-Stage",
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    // No open orders for either (will throw BAD_REQUEST)
    vi.mocked(api.fetchOpenOrders).mockResolvedValue([]);

    const caller = appRouter.createCaller(createAuthContext());
    // When filtering to only customer 42, fetchOpenOrders should only be called once
    await expect(
      caller.allocation.quickPropose({
        configId: 1,
        facilityId: 3,
        facilityName: "Reno",
        customerIds: [42],
      })
    ).rejects.toThrow("No open orders found");

    // fetchOpenOrders should only have been called for customer 42, not 55
    expect(api.fetchOpenOrders).toHaveBeenCalledTimes(1);
    expect(api.fetchOpenOrders).toHaveBeenCalledWith(
      expect.anything(),
      42,
      3
    );
  });
});
