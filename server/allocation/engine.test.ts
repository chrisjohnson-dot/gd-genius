import { describe, expect, it } from "vitest";
import { runAllocationEngine, LocationTypeMap } from "./engine";
import type { ExtensivInventoryRecord, ExtensivOrder } from "../extensiv/api";

function makeInventory(
  overrides: Partial<ExtensivInventoryRecord> & {
    receiveItemId: number;
    sku: string;
    available: number;
    locationId: number;
  }
): ExtensivInventoryRecord {
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

function makeOrder(
  orderId: number,
  referenceNum: string,
  items: Array<{ sku: string; qty: number }>
): ExtensivOrder {
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
const WAREHOUSE_LOC_ID_2 = 301;

const locationTypeMap: LocationTypeMap = {
  [STAGING_LOC_ID]: "staging",
  [PICK_FACE_LOC_ID]: "pick_face",
  [WAREHOUSE_LOC_ID]: "warehouse",
  [WAREHOUSE_LOC_ID_2]: "warehouse",
};

// ─── Core allocation scenarios ────────────────────────────────────────────────

describe("Allocation Engine — Core", () => {
  it("allocates from pick face when pick face has enough (no warehouse pull)", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);
    expect(result.skippedOrders).toHaveLength(0);
    // Pull list: pick face → staging (1 move)
    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");
    expect(toStaging).toHaveLength(1);
    expect(toStaging[0]!.qty).toBe(10);
    expect(toPickFace).toHaveLength(0); // no pallet surplus
  });

  it("skips order when total inventory is insufficient (no partial allocation)", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 50 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 30, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(0);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.skippedOrders[0]!.skipReason).toContain("Insufficient");
  });

  it("skips order when a line item has no inventory at all", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 10 }, { sku: "SKU-B", qty: 5 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: PICK_FACE_LOC_ID }),
      // SKU-B has no inventory
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(0);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.skippedOrders[0]!.skipReason).toContain("SKU-B");
  });

  it("excludes on-hold inventory", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: PICK_FACE_LOC_ID, isOnHold: true }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(0);
  });

  it("excludes quarantined inventory", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 20, locationId: PICK_FACE_LOC_ID, quarantined: true }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(0);
  });

  it("applies FEFO: picks earliest expiry first", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID, expirationDate: "2026-06-01" }),
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID, expirationDate: "2026-03-01" }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    // The staging pool was built from pick face records sorted FEFO
    // The pack list should reference the earlier expiry lot
    expect(result.allocatedOrders).toHaveLength(1);
    const alloc = result.allocatedOrders[0]!.lineItems[0]!.allocations[0]!;
    expect(alloc.receiveItemId).toBe(1); // earlier expiry
  });

  it("builds pack list with correct order references", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 5 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.packList).toHaveLength(1);
    expect(result.packList[0]!.referenceNum).toBe("1001");  // referenceNum = order.referenceNum = "1001"
    expect(result.packList[0]!.qty).toBe(5);
    expect(result.packList[0]!.locationName).toBe("STAGING-1");
  });
});

// ─── Pallet logic ─────────────────────────────────────────────────────────────

describe("Allocation Engine — Pallet Logic", () => {
  it("takes full pallet from warehouse when pick face is empty; sends needed qty to staging, surplus to pick face", () => {
    // Pallet has 48 units, order needs 20
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 20 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");

    expect(toStaging).toHaveLength(1);
    expect(toStaging[0]!.qty).toBe(20); // exactly what's needed
    expect(toPickFace).toHaveLength(1);
    expect(toPickFace[0]!.qty).toBe(28); // 48 - 20 = surplus back to pick face
  });

  it("takes whole pallet when order needs exactly the full pallet qty (no surplus)", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 48 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");

    expect(toStaging[0]!.qty).toBe(48);
    expect(toPickFace).toHaveLength(0); // no surplus
  });

  it("when pick face is insufficient, skips pick face and pulls full qty from warehouse; surplus goes to pick face", () => {
    // Pick face has 5 (insufficient for order of 20), warehouse pallet has 48.
    // Rule: skip pick face entirely, pull full 20 from warehouse, surplus 28 to pick face.
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 20 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 5, locationId: PICK_FACE_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");

    // All 20 come from warehouse (pick face skipped when insufficient)
    const stagingQty = toStaging.reduce((s, p) => s + p.qty, 0);
    expect(stagingQty).toBe(20);

    // Surplus: 48 - 20 = 28 back to pick face
    const pickFaceQty = toPickFace.reduce((s, p) => s + p.qty, 0);
    expect(pickFaceQty).toBe(28);
  });

  it("aggregates demand across multiple orders before deciding pallet pull", () => {
    // Two orders each needing 15 = 30 total. Pick face has 0. Pallet has 48.
    const orders = [
      makeOrder(1, "1001", [{ sku: "SKU-A", qty: 15 }]),
      makeOrder(2, "1002", [{ sku: "SKU-A", qty: 15 }]),
    ];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(2);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");

    // 30 total needed → staging
    const stagingQty = toStaging.reduce((s, p) => s + p.qty, 0);
    expect(stagingQty).toBe(30);

    // 48 - 30 = 18 surplus → pick face
    const pickFaceQty = toPickFace.reduce((s, p) => s + p.qty, 0);
    expect(pickFaceQty).toBe(18);
  });

  it("pulls multiple pallets when demand exceeds one pallet", () => {
    // Need 90 units. Two pallets of 48 each. Pick face empty.
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 90 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID_2 }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");

    const stagingQty = toStaging.reduce((s, p) => s + p.qty, 0);
    expect(stagingQty).toBe(90);

    // First pallet fully consumed (48), second pallet: 90-48=42 needed, 48-42=6 surplus
    const pickFaceQty = toPickFace.reduce((s, p) => s + p.qty, 0);
    expect(pickFaceQty).toBe(6);
  });

  it("skips second order if staging pool is exhausted after first order assignment", () => {
    // Staging pool = 15 (from pick face). Two orders each need 10.
    // First order gets 10, second needs 10 but only 5 remain → skipped.
    const orders = [
      makeOrder(1, "1001", [{ sku: "SKU-A", qty: 10 }]),
      makeOrder(2, "1002", [{ sku: "SKU-A", qty: 10 }]),
    ];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 15, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.allocatedOrders[0]!.orderId).toBe(1);  // readOnly.orderId = 1
    expect(result.skippedOrders[0]!.orderId).toBe(2);  // readOnly.orderId = 2
  });

  it("rolls back staging pool on failed order so subsequent orders can use it", () => {
    // ORD-001 needs SKU-A (10) + SKU-B (5) — SKU-B doesn't exist → fails
    // ORD-002 needs SKU-A (10) — should succeed using the rolled-back staging pool
    const orders = [
      makeOrder(1, "1001", [{ sku: "SKU-A", qty: 10 }, { sku: "SKU-B", qty: 5 }]),
      makeOrder(2, "1002", [{ sku: "SKU-A", qty: 10 }]),
    ];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.skippedOrders[0]!.orderId).toBe(1);  // readOnly.orderId = 1
    expect(result.allocatedOrders[0]!.orderId).toBe(2);  // readOnly.orderId = 2
  });
});

// ─── No Lot Mixing Rule ───────────────────────────────────────────────────────

describe("Allocation Engine — No Lot Mixing Rule", () => {
  it("allocates from a single lot when noLotMixing=true and one lot has enough qty", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 5 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-A" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-B" }),
    ];
    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), true
    );
    expect(result.allocatedOrders).toHaveLength(1);
    const lots = new Set(result.allocatedOrders[0]!.lineItems[0]!.allocations.map((a) => a.lotNumber));
    expect(lots.size).toBe(1);
  });

  it("skips order when noLotMixing=true and no single lot has enough qty", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 15 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 8, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-A" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 8, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-B" }),
    ];
    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), true
    );
    expect(result.allocatedOrders).toHaveLength(0);
    expect(result.skippedOrders).toHaveLength(1);
    expect(result.skippedOrders[0]!.skipReason).toContain("Lot Mixing rule");
  });

  it("allows lot mixing when noLotMixing=false (default)", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 15 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 8, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-A" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 8, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-B" }),
    ];
    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), false
    );
    expect(result.allocatedOrders).toHaveLength(1);
    const lots = new Set(result.allocatedOrders[0]!.lineItems[0]!.allocations.map((a) => a.lotNumber));
    expect(lots.size).toBe(2);
  });

  it("picks the earliest-expiry lot when multiple lots qualify under noLotMixing", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 5 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-LATE", expirationDate: "2027-12-01" }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID, lotNumber: "LOT-EARLY", expirationDate: "2026-06-01" }),
    ];
    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map(), true
    );
    expect(result.allocatedOrders).toHaveLength(1);
    const usedLot = result.allocatedOrders[0]!.lineItems[0]!.allocations[0]!.lotNumber;
    expect(usedLot).toBe("LOT-EARLY");
  });
});

// ─── Location Priority Patterns ───────────────────────────────────────────────

describe("Allocation Engine — Location Priority Patterns", () => {
  // Helper that creates inventory with an explicit location name
  function makeInventoryNamed(
    receiveItemId: number,
    sku: string,
    available: number,
    locationId: number,
    locationName: string,
    extra: Partial<ExtensivInventoryRecord> = {}
  ): ExtensivInventoryRecord {
    return {
      receiveItemId,
      itemIdentifier: { sku, id: receiveItemId },
      available,
      onHand: available,
      isOnHold: false,
      quarantined: false,
      locationIdentifier: { id: locationId, nameKey: { name: locationName } },
      ...extra,
    };
  }

  const STAGING_ID = 100;
  const WH_12_ID = 201;   // location name "12050101" — matches ^12
  const WH_RCV12_ID = 202; // location name "RCV12001" — matches ^RCV12
  const WH_OTHER_ID = 203; // location name "11050101" — no pattern match

  const ltMap: LocationTypeMap = {
    [STAGING_ID]: "staging",
    [WH_12_ID]: "warehouse",
    [WH_RCV12_ID]: "warehouse",
    [WH_OTHER_ID]: "warehouse",
  };

  const amercarePatterns = [
    { pattern: "^12", label: "Building 2 – 12xxxx locations" },
    { pattern: "^RCV12", label: "Building 2 – RCV12 locations" },
  ];

  it("prefers ^12 location over unmatched warehouse when patterns are set", () => {
    const orders = [makeOrder(1, "REF-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventoryNamed(1, "SKU-A", 50, WH_OTHER_ID, "11050101"),  // no match
      makeInventoryNamed(2, "SKU-A", 50, WH_12_ID, "12050101"),      // matches ^12
    ];

    const result = runAllocationEngine(
      orders, inventory, ltMap, STAGING_ID, "ACR-Staging", new Map(),
      false, undefined, undefined, amercarePatterns
    );

    expect(result.allocatedOrders).toHaveLength(1);
    // The pull list entry should come from the ^12 location, not the 11xxxxxx location
    const stagingMoves = result.pullList.filter((p) => p.movement === "to_staging");
    expect(stagingMoves.length).toBeGreaterThan(0);
    expect(stagingMoves[0]!.fromLocationName).toBe("12050101");
  });

  it("prefers ^12 over ^RCV12 (first pattern wins)", () => {
    const orders = [makeOrder(1, "REF-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventoryNamed(1, "SKU-A", 50, WH_RCV12_ID, "RCV12001"),  // matches ^RCV12 (rank 1)
      makeInventoryNamed(2, "SKU-A", 50, WH_12_ID, "12050101"),      // matches ^12 (rank 0)
    ];

    const result = runAllocationEngine(
      orders, inventory, ltMap, STAGING_ID, "ACR-Staging", new Map(),
      false, undefined, undefined, amercarePatterns
    );

    expect(result.allocatedOrders).toHaveLength(1);
    const stagingMoves = result.pullList.filter((p) => p.movement === "to_staging");
    expect(stagingMoves[0]!.fromLocationName).toBe("12050101");
  });

  it("falls back to unmatched location when pattern locations have no stock", () => {
    const orders = [makeOrder(1, "REF-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventoryNamed(1, "SKU-A", 50, WH_OTHER_ID, "11050101"),  // no match — only stock
    ];

    const result = runAllocationEngine(
      orders, inventory, ltMap, STAGING_ID, "ACR-Staging", new Map(),
      false, undefined, undefined, amercarePatterns
    );

    // Should still allocate using the unmatched location
    expect(result.allocatedOrders).toHaveLength(1);
    const stagingMoves = result.pullList.filter((p) => p.movement === "to_staging");
    expect(stagingMoves[0]!.fromLocationName).toBe("11050101");
  });

  it("behaves identically to no-patterns when patterns array is empty", () => {
    const orders = [makeOrder(1, "REF-001", [{ sku: "SKU-A", qty: 10 }])];
    const inventory = [
      makeInventoryNamed(1, "SKU-A", 50, WH_12_ID, "12050101"),
    ];

    const withPatterns = runAllocationEngine(
      orders, inventory, ltMap, STAGING_ID, "ACR-Staging", new Map(),
      false, undefined, undefined, amercarePatterns
    );
    const withoutPatterns = runAllocationEngine(
      orders, inventory, ltMap, STAGING_ID, "ACR-Staging", new Map(),
      false, undefined, undefined, []
    );

    expect(withPatterns.allocatedOrders).toHaveLength(1);
    expect(withoutPatterns.allocatedOrders).toHaveLength(1);
  });

  it("invalid regex pattern falls back to string startsWith without throwing", () => {
    const badPatterns = [{ pattern: "[invalid", label: "Bad regex" }];
    const orders = [makeOrder(1, "REF-001", [{ sku: "SKU-A", qty: 5 }])];
    const inventory = [
      makeInventoryNamed(1, "SKU-A", 20, WH_12_ID, "[invalid-match"),
    ];

    expect(() =>
      runAllocationEngine(
        orders, inventory, ltMap, STAGING_ID, "ACR-Staging", new Map(),
        false, undefined, undefined, badPatterns
      )
    ).not.toThrow();
  });
});

// ─── Hybrid warehouse + pick-face top-up ───────────────────────────────────────────────────────────────────

describe("Allocation Engine — Hybrid Warehouse + Pick-Face Top-Up", () => {
  /**
   * Scenario: Order needs 60 units.
   *   Warehouse pallet A: 48 units (full pallet)
   *   Pick face:          20 units
   *
   * Expected behaviour:
   *   1. Pull full pallet A (48) to staging.
   *   2. Remaining gap = 60 - 48 = 12. Pick face has 20 ≥ 12, so do NOT pull
   *      another warehouse pallet. Top up 12 from pick face.
   *   3. Pull list: warehouse → staging (48), pick face → staging (12).
   *   4. No pick-face replenishment move (no warehouse surplus).
   */
  it("tops up from pick face after whole warehouse pallets instead of pulling another pallet", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 60 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 20, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");

    const stagingQty = toStaging.reduce((s, p) => s + p.qty, 0);
    expect(stagingQty).toBe(60);

    // Warehouse pallet (48) goes to staging
    const warehouseMove = toStaging.find((p) => p.fromLocationId === WAREHOUSE_LOC_ID);
    expect(warehouseMove).toBeDefined();
    expect(warehouseMove!.qty).toBe(48);

    // Pick face tops up the remaining 12
    const pickFaceMove = toStaging.find((p) => p.fromLocationId === PICK_FACE_LOC_ID);
    expect(pickFaceMove).toBeDefined();
    expect(pickFaceMove!.qty).toBe(12);

    // No pick-face replenishment (no warehouse surplus)
    expect(toPickFace).toHaveLength(0);
  });

  /**
   * Scenario: Order needs 60 units.
   *   Warehouse pallet A: 48 units
   *   Warehouse pallet B: 48 units
   *   Pick face:           5 units (NOT enough to cover the gap after pallet A)
   *
   * Expected behaviour:
   *   1. Pull full pallet A (48). Remaining = 12.
   *   2. Pick face has only 5 < 12, so it cannot cover the gap.
   *   3. Pull pallet B: need 12, pallet has 48 → send 12 to staging, 36 surplus to pick face.
   *   4. Pull list: WH-A → staging (48), WH-B → staging (12), WH-B → pick face (36).
   */
  it("falls back to splitting a second warehouse pallet when pick face cannot cover the gap", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 60 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID_2 }),
      makeInventory({ receiveItemId: 3, sku: "SKU-A", available: 5,  locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");

    const stagingQty = toStaging.reduce((s, p) => s + p.qty, 0);
    expect(stagingQty).toBe(60);

    // Surplus from second pallet back to pick face
    const pickFaceQty = toPickFace.reduce((s, p) => s + p.qty, 0);
    expect(pickFaceQty).toBe(36); // 48 - 12 = 36
  });

  /**
   * Scenario: Order needs 50 units.
   *   Warehouse pallet A: 48 units
   *   Pick face:          10 units
   *
   * Expected behaviour:
   *   1. Pull full pallet A (48). Remaining = 2.
   *   2. Pick face has 10 ≥ 2, so top up 2 from pick face.
   *   3. Total staged = 50. No pick-face replenishment.
   */
  it("handles small top-up from pick face (remainder < pick face qty)", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 50 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const stagingQty = toStaging.reduce((s, p) => s + p.qty, 0);
    expect(stagingQty).toBe(50);

    const pickFaceTopUp = toStaging.find((p) => p.fromLocationId === PICK_FACE_LOC_ID);
    expect(pickFaceTopUp).toBeDefined();
    expect(pickFaceTopUp!.qty).toBe(2);

    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");
    expect(toPickFace).toHaveLength(0);
  });

  /**
   * Scenario: Order needs 100 units.
   *   Two warehouse pallets: 48 each = 96 total.
   *   Pick face: 10 units.
   *
   * Expected behaviour:
   *   1. Pull pallet A (48). Remaining = 52.
   *   2. Pull pallet B (48). Remaining = 4.
   *   3. Pick face has 10 ≥ 4 → top up 4 from pick face.
   *   4. Total staged = 100. No pick-face replenishment.
   */
  it("tops up from pick face after exhausting multiple full warehouse pallets", () => {
    const orders = [makeOrder(1, "1001", [{ sku: "SKU-A", qty: 100 }])];
    const inventory = [
      makeInventory({ receiveItemId: 1, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID }),
      makeInventory({ receiveItemId: 2, sku: "SKU-A", available: 48, locationId: WAREHOUSE_LOC_ID_2 }),
      makeInventory({ receiveItemId: 3, sku: "SKU-A", available: 10, locationId: PICK_FACE_LOC_ID }),
    ];

    const result = runAllocationEngine(
      orders, inventory, locationTypeMap, STAGING_LOC_ID, "STAGING-1", new Map()
    );

    expect(result.allocatedOrders).toHaveLength(1);

    const toStaging = result.pullList.filter((p) => p.movement === "to_staging");
    const stagingQty = toStaging.reduce((s, p) => s + p.qty, 0);
    expect(stagingQty).toBe(100);

    const pickFaceTopUp = toStaging.find((p) => p.fromLocationId === PICK_FACE_LOC_ID);
    expect(pickFaceTopUp).toBeDefined();
    expect(pickFaceTopUp!.qty).toBe(4);

    const toPickFace = result.pullList.filter((p) => p.movement === "to_pick_face");
    expect(toPickFace).toHaveLength(0);
  });
});
