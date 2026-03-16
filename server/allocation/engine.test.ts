import { describe, expect, it } from "vitest";
import { runAllocationEngine, LocationTypeMap } from "./engine";
import type { ExtensivInventoryRecord, ExtensivOrder } from "../extensiv/api";

function makeInventory(overrides: Partial<ExtensivInventoryRecord> & { receiveItemId: number; sku: string; available: number; locationId: number }): ExtensivInventoryRecord {
  return {
    receiveItemId: overrides.receiveItemId,
    itemIdentifier: { sku: overrides.sku, id: overrides.receiveItemId },
    available: overrides.available,
    onHand: overrides.available,
    isOnHold: overrides.isOnHold ?? false,
    quarantined: overrides.quarantined ?? false,
    lotNumber: overrides.lotNumber,
    expirationDate: overrides.expirationDate,
    receivedDate: overrides.receivedDate,
    locationIdentifier: {
      id: overrides.locationId,
      nameKey: { name: `LOC-${overrides.locationId}` },
    },
    description: overrides.description,
  };
}

function makeOrder(orderId: number, referenceNum: string, items: Array<{ sku: string; qty: number }>): ExtensivOrder {
  return {
    readOnly: {
      orderId,
      status: 0,
      fullyAllocated: false,
      isClosed: false,
      customerIdentifier: { id: 1, name: "Test Customer" },
      facilityIdentifier: { id: 1, name: "Test Facility" },
      creationDate: new Date().toISOString(),
    },
    referenceNum,
    orderItems: items.map((item) => ({
      itemIdentifier: { sku: item.sku, id: 0 },
      qty: item.qty,
    })),
  };
}

const STAGING_LOC_ID = 100;
const PICK_FACE_LOC_ID = 200;
const WAREHOUSE_LOC_ID = 300;

const locationTypeMap: LocationTypeMap = {
  [STAGING_LOC_ID]: "staging",
  [PICK_FACE_LOC_ID]: "pick_face",
  [WAREHOUSE_LOC_ID]: "warehouse",
};

describe("Allocation Engine", () => {
  it("allocates a simple order from staging inventory", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: STAGING_LOC_ID })];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.allocatedOrders).toHaveLength(1);
    expect(result.skippedOrders).toHaveLength(0);
    expect(result.allocatedOrders[0]!.lineItems[0]!.allocations[0]!.qty).toBe(10);
    expect(result.pullList).toHaveLength(0); // no movement needed from staging
  });

  it("skips order when inventory is insufficient (no partial allocation)", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 50 }])];
    const inventory = [makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 30, locationId: STAGING_LOC_ID })];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.allocatedOrders).toHaveLength(0);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.skippedOrders[0]!.skipReason).toContain("Insufficient inventory");
  });

  it("skips order when a line item has no inventory at all", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }, { sku: "SKU-B", qty: 5 }])];
    const inventory = [makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: STAGING_LOC_ID })];
    // SKU-B has no inventory

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.allocatedOrders).toHaveLength(0);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.skippedOrders[0]!.skipReason).toContain("SKU-B");
  });

  it("excludes on-hold inventory", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: STAGING_LOC_ID, isOnHold: true }),
    ];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.allocatedOrders).toHaveLength(0);
    expect(result.skippedOrders[0]!.skipReason).toContain("No available inventory");
  });

  it("excludes quarantined inventory", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: STAGING_LOC_ID, quarantined: true }),
    ];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.allocatedOrders).toHaveLength(0);
  });

  it("applies FEFO: picks earliest expiry first", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID, expirationDate: "2026-06-01" }),
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID, expirationDate: "2026-03-01" }),
    ];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.allocatedOrders[0]!.lineItems[0]!.allocations[0]!.receiveItemId).toBe(1); // earlier expiry
  });

  it("prefers staging/pick_face over warehouse (Tier 1 first)", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: WAREHOUSE_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 20, locationId: STAGING_LOC_ID }),
    ];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    const alloc = result.allocatedOrders[0]!.lineItems[0]!.allocations[0]!;
    expect(alloc.receiveItemId).toBe(2); // staging preferred
    expect(alloc.locationType).toBe("staging");
    expect(result.pullList).toHaveLength(0); // no movement needed
  });

  it("generates pull list when warehouse inventory is used", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 15 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 5, locationId: STAGING_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 20, locationId: WAREHOUSE_LOC_ID }),
    ];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.allocatedOrders).toHaveLength(1);
    expect(result.pullList).toHaveLength(1); // warehouse → staging movement
    expect(result.pullList[0]!.qty).toBe(10); // 15 - 5 from staging = 10 from warehouse
  });

  it("allocates multiple orders independently, respecting inventory pool", () => {
    const orders = [
      makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }]),
      makeOrder(2, "ORD-002", [{ sku: "SKU-A", qty: 10 }]),
    ];
    const inventory = [makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 15, locationId: STAGING_LOC_ID })];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    // First order gets allocated, second is skipped (only 5 left)
    expect(result.allocatedOrders).toHaveLength(1);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.allocatedOrders[0]!.orderId).toBe(1);
  });

  it("rolls back inventory pool on failed order so subsequent orders can use it", () => {
    const orders = [
      makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 10 }, { sku: "SKU-B", qty: 5 }]), // will fail (no SKU-B)
      makeOrder(2, "ORD-002", [{ sku: "SKU-A", qty: 10 }]), // should succeed using rolled-back inventory
    ];
    const inventory = [makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID })];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.skippedOrders[0]!.orderId).toBe(1);
    expect(result.allocatedOrders[0]!.orderId).toBe(2); // got the rolled-back inventory
  });

  it("builds pack list with correct order references", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 5 }])];
    const inventory = [makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID })];

    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map());

    expect(result.packList).toHaveLength(1);
    expect(result.packList[0]!.referenceNum).toBe("ORD-001");
    expect(result.packList[0]!.qty).toBe(5);
  });
});

describe("Allocation Engine — No Lot Mixing Rule", () => {
  it("allocates from a single lot when noLotMixing=true and one lot has enough qty", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 5 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID, lotNumber: "LOT-A" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID, lotNumber: "LOT-B" }),
    ];
    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), true);
    expect(result.allocatedOrders).toHaveLength(1);
    // All allocations must use the same lot code
    const lots = new Set(result.allocatedOrders[0]!.lineItems[0]!.allocations.map((a) => a.lotNumber));
    expect(lots.size).toBe(1);
  });

  it("skips order when noLotMixing=true and no single lot has enough qty", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 15 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 8, locationId: STAGING_LOC_ID, lotNumber: "LOT-A" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 8, locationId: STAGING_LOC_ID, lotNumber: "LOT-B" }),
    ];
    // Combined qty is 16 (enough) but no single lot has 15
    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), true);
    expect(result.allocatedOrders).toHaveLength(0);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.skippedOrders[0]!.skipReason).toContain("Lot Mixing rule");
  });

  it("allows lot mixing when noLotMixing=false (default)", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 15 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 8, locationId: STAGING_LOC_ID, lotNumber: "LOT-A" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 8, locationId: STAGING_LOC_ID, lotNumber: "LOT-B" }),
    ];
    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), false);
    expect(result.allocatedOrders).toHaveLength(1);
    const lots = new Set(result.allocatedOrders[0]!.lineItems[0]!.allocations.map((a) => a.lotNumber));
    expect(lots.size).toBe(2); // mixed lots allowed
  });

  it("picks the earliest-expiry lot when multiple lots qualify under noLotMixing", () => {
    const orders = [makeOrder(1, "ORD-001", [{ sku: "SKU-A", qty: 5 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID, lotNumber: "LOT-LATE", expirationDate: "2027-12-01" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 10, locationId: STAGING_LOC_ID, lotNumber: "LOT-EARLY", expirationDate: "2026-06-01" }),
    ];
    const result = runAllocationEngine(orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), true);
    expect(result.allocatedOrders).toHaveLength(1);
    const usedLot = result.allocatedOrders[0]!.lineItems[0]!.allocations[0]!.lotNumber;
    expect(usedLot).toBe("LOT-EARLY");
  });
});
