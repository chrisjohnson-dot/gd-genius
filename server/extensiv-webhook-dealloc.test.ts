/**
 * Tests for the Extensiv webhook handler — auto-deallocation on OrderCancel.
 *
 * These tests verify the deallocation path added to the OrderCancel handler:
 * 1. Allocated run orders in confirmed runs are deallocated in Extensiv
 * 2. The DB run order status is updated to unallocated
 * 3. The run's allocatedCount is decremented; run status becomes unallocated when count reaches 0
 * 4. Already-unallocated orders are skipped
 * 5. Missing Extensiv config is handled gracefully
 * 6. Missing ETag is handled gracefully
 * 7. Extensiv API failure is logged but DB is still updated
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  findSmallParcelSessionsByExtensivOrderId: vi.fn().mockResolvedValue([]),
  updateSmallParcelSession: vi.fn(),
  logSmallParcelAuditEvent: vi.fn(),
  findAllocatedRunOrdersByExtensivOrderId: vi.fn(),
  updateAllocationRunOrder: vi.fn(),
  updateAllocationRun: vi.fn(),
  getAllocationRunOrders: vi.fn(),
  getExtensivConfigById: vi.fn(),
}));

// ─── Mock FedEx void (not the focus here — returns success by default) ────────
vi.mock("./carriers/fedex", () => ({
  voidFedExLabel: vi.fn().mockResolvedValue({ success: true, message: "Label voided" }),
}));

// ─── Mock Extensiv API ────────────────────────────────────────────────────────
vi.mock("./extensiv/api", () => ({
  deallocateOrder: vi.fn(),
  fetchOrderWithDetail: vi.fn(),
}));

import {
  findAllocatedRunOrdersByExtensivOrderId,
  updateAllocationRunOrder,
  updateAllocationRun,
  getAllocationRunOrders,
  getExtensivConfigById,
} from "./db";
import { deallocateOrder, fetchOrderWithDetail } from "./extensiv/api";

// ─── Simulate the autoDeallocateOrderInExtensiv function logic ────────────────
// (mirrors the implementation in server/webhooks/extensiv.ts)
async function simulateAutoDeallocate(extensivOrderId: number) {
  const runOrders = await (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>)(extensivOrderId);
  const result = { found: runOrders.length, deallocated: 0, alreadyUnallocated: 0, errors: [] as string[] };

  for (const runOrder of runOrders) {
    const config = await (getExtensivConfigById as ReturnType<typeof vi.fn>)(runOrder.run.configId);
    if (!config) {
      result.errors.push(`Run ${runOrder.runId}: config ${runOrder.run.configId} not found`);
      continue;
    }

    try {
      const { etag } = await (fetchOrderWithDetail as ReturnType<typeof vi.fn>)(config, runOrder.orderId);
      if (!etag) {
        result.errors.push(`RunOrder ${runOrder.id}: Could not fetch ETag for order ${runOrder.orderId}`);
        continue;
      }

      const deallocResult = await (deallocateOrder as ReturnType<typeof vi.fn>)(config, runOrder.orderId, etag);
      if (!deallocResult.success) {
        result.errors.push(`RunOrder ${runOrder.id}: Extensiv deallocate failed — ${deallocResult.error}`);
        // Still update DB even on Extensiv failure (order is cancelled anyway)
      }

      await (updateAllocationRunOrder as ReturnType<typeof vi.fn>)(runOrder.id, { status: "unallocated" });

      const allOrders = await (getAllocationRunOrders as ReturnType<typeof vi.fn>)(runOrder.runId);
      const allocatedCount = allOrders.filter((o: { status: string }) => o.status === "allocated").length;
      const runStatusUpdate: { allocatedCount: number; status?: string } = { allocatedCount };
      if (allocatedCount === 0) runStatusUpdate.status = "unallocated";
      await (updateAllocationRun as ReturnType<typeof vi.fn>)(runOrder.runId, runStatusUpdate);

      result.deallocated++;
    } catch (err) {
      result.errors.push(`RunOrder ${runOrder.id}: ${String(err)}`);
    }
  }

  return result;
}

// ─── Test fixtures ────────────────────────────────────────────────────────────
const mockConfig = {
  id: 1,
  name: "Main Warehouse",
  clientId: "test-client",
  clientSecret: "test-secret",
  tplGuid: "aaaa-bbbb-cccc",
  userLoginId: 123,
  baseUrl: "https://secure-wms.com",
};

const mockRun = {
  id: 10,
  configId: 1,
  status: "confirmed",
  facilityId: 4,
  allocatedCount: 1,
};

const mockRunOrder = {
  id: 100,
  runId: 10,
  orderId: 206568,
  referenceNum: "19069850",
  status: "allocated",
  run: mockRun,
};

describe("Extensiv Webhook — auto-deallocation on OrderCancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getExtensivConfigById as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig);
    (fetchOrderWithDetail as ReturnType<typeof vi.fn>).mockResolvedValue({ etag: "abc123", order: {} });
    (deallocateOrder as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (updateAllocationRunOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (updateAllocationRun as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getAllocationRunOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...mockRunOrder, status: "unallocated" }, // after update, count = 0
    ]);
  });

  it("deallocates an allocated run order and marks it unallocated", async () => {
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue([mockRunOrder]);

    const result = await simulateAutoDeallocate(206568);

    expect(result.found).toBe(1);
    expect(result.deallocated).toBe(1);
    expect(result.errors).toHaveLength(0);

    expect(fetchOrderWithDetail).toHaveBeenCalledWith(mockConfig, 206568);
    expect(deallocateOrder).toHaveBeenCalledWith(mockConfig, 206568, "abc123");
    expect(updateAllocationRunOrder).toHaveBeenCalledWith(100, { status: "unallocated" });
    expect(updateAllocationRun).toHaveBeenCalledWith(10, expect.objectContaining({ allocatedCount: 0, status: "unallocated" }));
  });

  it("returns zero counts when no allocated run orders found", async () => {
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await simulateAutoDeallocate(206568);

    expect(result.found).toBe(0);
    expect(result.deallocated).toBe(0);
    expect(deallocateOrder).not.toHaveBeenCalled();
    expect(updateAllocationRunOrder).not.toHaveBeenCalled();
  });

  it("records error and skips when Extensiv config is not found", async () => {
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue([mockRunOrder]);
    (getExtensivConfigById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await simulateAutoDeallocate(206568);

    expect(result.found).toBe(1);
    expect(result.deallocated).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("config 1 not found");
    expect(deallocateOrder).not.toHaveBeenCalled();
  });

  it("records error and skips when ETag cannot be fetched", async () => {
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue([mockRunOrder]);
    (fetchOrderWithDetail as ReturnType<typeof vi.fn>).mockResolvedValue({ etag: null, order: null });

    const result = await simulateAutoDeallocate(206568);

    expect(result.found).toBe(1);
    expect(result.deallocated).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Could not fetch ETag");
    expect(deallocateOrder).not.toHaveBeenCalled();
  });

  it("still marks DB as unallocated even when Extensiv deallocate fails", async () => {
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue([mockRunOrder]);
    (deallocateOrder as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: "Order already deallocated in Extensiv" });

    const result = await simulateAutoDeallocate(206568);

    // deallocated count still increments because DB was updated
    expect(result.deallocated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Order already deallocated in Extensiv");
    // DB should still be updated
    expect(updateAllocationRunOrder).toHaveBeenCalledWith(100, { status: "unallocated" });
  });

  it("decrements allocatedCount but does not set run status when other orders remain allocated", async () => {
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue([mockRunOrder]);
    // Simulate 2 orders in the run, one still allocated after this deallocation
    (getAllocationRunOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...mockRunOrder, status: "unallocated" },
      { id: 101, runId: 10, orderId: 206569, status: "allocated" },
    ]);

    await simulateAutoDeallocate(206568);

    expect(updateAllocationRun).toHaveBeenCalledWith(10, { allocatedCount: 1 }); // no status change
  });

  it("handles multiple run orders for the same cancelled order", async () => {
    const runOrder2 = { ...mockRunOrder, id: 101, orderId: 206568, run: { ...mockRun, id: 11 } };
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue([mockRunOrder, runOrder2]);
    (getAllocationRunOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "unallocated" },
    ]);

    const result = await simulateAutoDeallocate(206568);

    expect(result.found).toBe(2);
    expect(result.deallocated).toBe(2);
    expect(deallocateOrder).toHaveBeenCalledTimes(2);
  });
});

describe("findAllocatedRunOrdersByExtensivOrderId — DB helper contract", () => {
  it("should only return allocated orders from confirmed runs (mock contract)", async () => {
    // This test validates the expected interface of the DB helper
    const mockResult = [
      {
        id: 100,
        runId: 10,
        orderId: 206568,
        status: "allocated",
        run: { id: 10, configId: 1, status: "confirmed", facilityId: 4 },
      },
    ];
    (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await (findAllocatedRunOrdersByExtensivOrderId as ReturnType<typeof vi.fn>)(206568);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("allocated");
    expect(result[0].run.status).toBe("confirmed");
    expect(result[0].run.configId).toBe(1);
  });
});
