/**
 * GD Allocation Engine  v2
 *
 * Core Rules:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. AGGREGATE FIRST: Sum demand for each SKU across ALL selected orders before
 *    deciding where inventory comes from.
 *
 * 2. PALLET LOGIC (per SKU):
 *    a) If the pick face has enough qty → take only from pick face → staging.
 *    b) If the pick face is short (or empty):
 *       - Take every warehouse record for that SKU (each record = one full pallet).
 *       - From the combined pool (pick face + pallets), send exactly what is
 *         needed to staging.
 *       - The remainder (pallet surplus) goes back to the pick face.
 *       Pull list will show two movement types:
 *         • warehouse → staging  (qty needed from that pallet)
 *         • warehouse → pick_face (pallet balance / replenishment)
 *
 * 3. FEFO / FIFO: Within each location tier, pick earliest expiry first
 *    (fall back to received date when no expiry).
 *
 * 4. NO PARTIAL ALLOCATION: if ANY line item cannot be fully satisfied across
 *    the combined pool, the entire order is skipped.
 *
 * 5. NO LOT MIXING (optional): when enabled, each order line must be fulfilled
 *    from a single lot code.
 *
 * 6. EXCLUDE on-hold and quarantined inventory.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ExtensivInventoryRecord, ExtensivOrder } from "../extensiv/api";

export type LocationType = "staging" | "pick_face" | "warehouse";

export interface LocationTypeMap {
  [locationId: number]: LocationType;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface AllocationLineItem {
  sku: string;
  description?: string;
  qtyRequired: number;
  allocations: Array<{
    receiveItemId: number;
    qty: number;
    locationId: number;
    locationName: string;
    locationType: LocationType;
    lotNumber?: string;
    expirationDate?: string;
  }>;
}

/**
 * A single line on the pull list.
 * movement = "to_staging"     → picker moves this qty directly to staging
 * movement = "to_pick_face"   → picker puts pallet surplus back into pick face
 */
export interface PullListItem {
  sku: string;
  description?: string;
  receiveItemId: number;
  qty: number;
  /** Total available qty in the source location at time of allocation */
  sourceQty: number;
  fromLocationId: number;
  fromLocationName: string;
  fromLocationType: LocationType;
  toLocationId: number;
  toLocationName: string;
  movement: "to_staging" | "to_pick_face";
  lotNumber?: string;
  expirationDate?: string;
}

export interface PackListItem {
  orderId: number;
  referenceNum: string;
  sku: string;
  description?: string;
  qty: number;
  lotNumber?: string;
  expirationDate?: string;
  locationName: string; // source location (for reference)
}

export interface OrderAllocationResult {
  orderId: number;
  referenceNum: string;
  poNum?: string;
  status: "allocated" | "skipped";
  skipReason?: string;
  lineItems: AllocationLineItem[];
  pullListItems: PullListItem[];
  packListItems: PackListItem[];
}

export interface AllocationRunResult {
  allocatedOrders: OrderAllocationResult[];
  skippedOrders: OrderAllocationResult[];
  pullList: PullListItem[];
  packList: PackListItem[];
  allocationSummary: AllocationSummaryItem[];
}

export interface AllocationSummaryItem {
  sku: string;
  description?: string;
  totalQtyRequired: number;
  totalQtyAllocated: number;
  orderCount: number;
  movements: Array<{
    fromLocation: string;
    toLocation: string;
    qty: number;
    movement: "to_staging" | "to_pick_face";
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type InventoryPoolRecord = ExtensivInventoryRecord & { remainingQty: number };

function getInventoryPriority(record: ExtensivInventoryRecord): number {
  if (record.expirationDate) {
    // Has expiry: sort by expiry date ascending (FEFO)
    return new Date(record.expirationDate).getTime();
  }
  // No expiry: fall back to receiveItemId ascending (oldest receive first = FIFO).
  // receiveItemId is a monotonically increasing integer assigned by Extensiv at
  // receive time, so a lower ID means it was received earlier.
  // We add 1e15 to keep no-expiry records after any expiry-dated records.
  return 1e15 + (record.receiveItemId ?? Number.MAX_SAFE_INTEGER);
}

function sortFEFO(records: InventoryPoolRecord[]): InventoryPoolRecord[] {
  return [...records].sort((a, b) => getInventoryPriority(a) - getInventoryPriority(b));
}

// ─── SKU-level pallet decision ────────────────────────────────────────────────

/**
 * Decide which inventory records to use for a given SKU given the total qty
 * needed across all orders.
 *
 * Returns:
 *   stagingMoves   – records (and qty) to move directly to staging
 *   pickFaceMoves  – records (and qty) to move to pick face (pallet surplus)
 *   satisfied      – true if the full qtyNeeded can be met
 */
/**
 * Plans movements for a SKU given the total qty needed.
 * Always moves ALL available inventory to staging (up to qtyNeeded).
 * Returns satisfied=true only when the full qtyNeeded can be met.
 * Even when not fully satisfied, returns the partial stagingMoves so the
 * per-order assignment step can allocate as many orders as possible.
 */
function applyLocationPriority(
  records: InventoryPoolRecord[],
  patterns: Array<{ pattern: string; label: string }>,
): InventoryPoolRecord[] {
  if (patterns.length === 0) return sortFEFO(records);
  const getTier = (rec: InventoryPoolRecord): number => {
    const locName = rec.locationIdentifier?.nameKey?.name ?? "";
    for (let i = 0; i < patterns.length; i++) {
      try {
        if (new RegExp(patterns[i].pattern, "i").test(locName)) return i;
      } catch {
        if (locName.startsWith(patterns[i].pattern)) return i;
      }
    }
    return patterns.length;
  };
  // Stable composite sort: tier ascending (primary), then FEFO/receiveItemId ascending (secondary).
  // Using a single comparator avoids the instability of chaining two .sort() calls, which can
  // discard the FEFO order when two records share the same tier.
  return [...records].sort((a, b) => {
    const tierDiff = getTier(a) - getTier(b);
    if (tierDiff !== 0) return tierDiff;
    return getInventoryPriority(a) - getInventoryPriority(b);
  });
}

function planSkuMovements(
  qtyNeeded: number,
  pickFaceRecords: InventoryPoolRecord[],
  warehouseRecords: InventoryPoolRecord[],
  pickFaceLocationId: number,
  pickFaceLocationName: string,
  stagingLocationId: number,
  stagingLocationName: string,
  locationPriorityPatterns: Array<{ pattern: string; label: string }> = [],
): {
  stagingMoves: Array<{ record: InventoryPoolRecord; qty: number }>;
  pickFaceMoves: Array<{ record: InventoryPoolRecord; qty: number }>;
  satisfied: boolean;
  totalStaged: number;
} {
  const stagingMoves: Array<{ record: InventoryPoolRecord; qty: number }> = [];
  const pickFaceMoves: Array<{ record: InventoryPoolRecord; qty: number }> = [];

  const pickFaceAvailable = pickFaceRecords.reduce((s, r) => s + r.remainingQty, 0);

  if (pickFaceAvailable >= qtyNeeded) {
    // ── Scenario A: pick face has enough ─────────────────────────────────────
    // Take exactly what we need from pick face → staging. FEFO order.
    let remaining = qtyNeeded;
    for (const rec of sortFEFO(pickFaceRecords)) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, rec.remainingQty);
      stagingMoves.push({ record: rec, qty: take });
      rec.remainingQty -= take;
      remaining -= take;
    }
    return { stagingMoves, pickFaceMoves, satisfied: true, totalStaged: qtyNeeded };
  }

  // ── Scenario B: pick face is short — pull entirely from warehouse ────────
  // Rule: when the pick face cannot satisfy the full demand, do NOT drain the
  // pick face. Instead pull the full qty needed from warehouse pallets (FEFO /
  // location-priority order) and put the pallet surplus back to the pick face.
  // The pick face stock stays untouched so it remains available for future orders.
  let remaining = qtyNeeded;

  // Pull warehouse pallets (priority + FEFO) until we have enough.
  // Each warehouse record is treated as a full pallet — we take the whole record.
  for (const rec of applyLocationPriority(warehouseRecords, locationPriorityPatterns)) {
    if (remaining <= 0) break;
    const palletQty = rec.remainingQty; // full pallet

    if (palletQty <= remaining) {
      // Entire pallet goes to staging
      stagingMoves.push({ record: rec, qty: palletQty });
      rec.remainingQty = 0;
      remaining -= palletQty;
    } else {
      // Pallet is bigger than what we still need.
      // Send exactly `remaining` to staging, surplus to pick face.
      stagingMoves.push({ record: rec, qty: remaining });
      const surplus = palletQty - remaining;
      pickFaceMoves.push({ record: rec, qty: surplus });
      rec.remainingQty = 0;
      remaining = 0;
    }
  }

  // If warehouse alone wasn't enough, fall back to draining pick face for the
  // residual (this handles edge cases where warehouse is also short).
  if (remaining > 0) {
    for (const rec of sortFEFO(pickFaceRecords)) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, rec.remainingQty);
      stagingMoves.push({ record: rec, qty: take });
      rec.remainingQty -= take;
      remaining -= take;
    }
  }

  const totalStaged = stagingMoves.reduce((s, m) => s + m.qty, 0);
  // satisfied only if we could fully cover qtyNeeded
  return { stagingMoves, pickFaceMoves, satisfied: remaining === 0, totalStaged };
}

// ─── Location type helpers ───────────────────────────────────────────────────

/**
 * Infer location type from name when not explicitly configured.
 *
 * Rules (in priority order):
 *  1. Locations whose name starts with "ACR" (case-insensitive) → pick_face
 *     (these are the ACR-Staging / ACR pick face locations used in Calgary)
 *  2. Locations named exactly "Pick face" (case-insensitive) → pick_face
 *  3. Locations matching two letters then digits (e.g. HR400, PF001) → pick_face
 *  4. Everything else → warehouse
 */
export function inferLocationTypeFromName(name: string | undefined): LocationType {
  if (!name) return "warehouse";
  const trimmed = name.trim();
  // Rule 1: ACR prefix → pick face
  if (/^ACR/i.test(trimmed)) return "pick_face";
  // Rule 2: explicit "Pick face" name
  if (/^pick\s*face$/i.test(trimmed)) return "pick_face";
  // Rule 3: two-letter prefix + digits pattern
  if (/^[A-Za-z]{2}\d+/.test(trimmed)) return "pick_face";
  return "warehouse";
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function runAllocationEngine(
  orders: ExtensivOrder[],
  inventory: ExtensivInventoryRecord[],
  locationTypeMap: LocationTypeMap,
  stagingLocationId: number,
  stagingLocationName: string,
  descriptionMap: Map<string, string>,
  noLotMixing = false,
  /** Optional: the pick face location to replenish surplus pallets into */
  pickFaceLocationId?: number,
  pickFaceLocationName?: string,
  /** Optional: ordered list of location name patterns to prioritise when pulling warehouse pallets */
  locationPriorityPatterns: Array<{ pattern: string; label: string }> = [],
): AllocationRunResult {
  // ── Build mutable inventory pool ─────────────────────────────────────────
  const inventoryPool = new Map<number, InventoryPoolRecord>();
  for (const rec of inventory) {
    if (!rec.isOnHold && !rec.quarantined && rec.available > 0) {
      inventoryPool.set(rec.receiveItemId, { ...rec, remainingQty: rec.available });
    }
  }

  // ── Step 1: Aggregate total demand per SKU across all orders ─────────────
  // We also need to know which orders need which SKUs so we can assign
  // allocations back to individual orders after the SKU-level decision.
  interface OrderDemand {
    orderId: number;
    referenceNum: string;
    poNum?: string;
    sku: string;
    qtyRequired: number;
    itemIndex: number; // index into order.orderItems
  }

  const orderDemands: OrderDemand[] = [];
  const skuTotalDemand = new Map<string, number>();

  for (const order of orders) {
    // In Extensiv API: readOnly.orderId = Extensiv Transaction ID (e.g. 3214839) — used in API URLs
    //                  referenceNum = client's internal order number (e.g. "19069850") — display only
    const orderId = order.readOnly.orderId;
    const referenceNum = order.referenceNum;
    const poNum = order.poNum;
    for (let i = 0; i < (order.orderItems ?? []).length; i++) {
      const item = order.orderItems![i]!;
      const sku = item.itemIdentifier.sku;
      const qty = item.qty;
      orderDemands.push({ orderId, referenceNum, poNum, sku, qtyRequired: qty, itemIndex: i });
      skuTotalDemand.set(sku, (skuTotalDemand.get(sku) ?? 0) + qty);
    }
  }

  // ── Step 2: Per-SKU pallet decision ──────────────────────────────────────
  // For each SKU, decide what moves where (staging vs pick face replenishment).
  // We build a "staging pool" per SKU — the qty that has been moved to staging
  // and is available for order assignment.

  interface SkuStagingPool {
    records: Array<{ record: InventoryPoolRecord; qty: number; lotNumber?: string; expirationDate?: string }>;
    totalQty: number;
  }

  const skuStagingPool = new Map<string, SkuStagingPool>();
  const globalPullList: PullListItem[] = [];

  // Snapshot pool for rollback if anything fails
  const poolSnapshot = new Map<number, number>();
  inventoryPool.forEach((v, k) => poolSnapshot.set(k, v.remainingQty));

  for (const [sku, totalNeeded] of Array.from(skuTotalDemand.entries())) {
    const allSkuRecords = Array.from(inventoryPool.values()).filter(
      (r) => r.itemIdentifier.sku === sku && r.remainingQty > 0
    );

    // Helper: resolve effective location type — use explicit config first, then name-based inference
    const resolveLocType = (r: InventoryPoolRecord): LocationType => {
      const configured = locationTypeMap[r.locationIdentifier?.id ?? -1];
      if (configured) return configured;
      return inferLocationTypeFromName(r.locationIdentifier?.nameKey?.name);
    };

    const pickFaceRecords = allSkuRecords.filter((r) => {
      const t = resolveLocType(r);
      return t === "pick_face" || t === "staging"; // staging already there counts as pick face tier
    });

    const warehouseRecords = allSkuRecords.filter((r) => {
      return resolveLocType(r) === "warehouse";
    });

    const allWarehouse = [...warehouseRecords];

    // Resolve pick face location for replenishment
    const pfId = pickFaceLocationId ?? (pickFaceRecords[0]?.locationIdentifier?.id ?? 0);
    const pfName = pickFaceLocationName ?? (pickFaceRecords[0]?.locationIdentifier?.nameKey?.name ?? "Pick Face");

    const { stagingMoves, pickFaceMoves, satisfied } = planSkuMovements(
      totalNeeded,
      pickFaceRecords,
      allWarehouse,
      pfId,
      pfName,
      stagingLocationId,
      stagingLocationName,
      locationPriorityPatterns,
    );

    // Always build the staging pool with whatever we could move, even if not fully satisfied.
    // The per-order assignment step will skip individual orders that can't be fully covered.

    // Record staging pool for this SKU
    const pool: SkuStagingPool = { records: [], totalQty: 0 };
    for (const { record, qty } of stagingMoves) {
      pool.records.push({ record, qty, lotNumber: record.lotNumber, expirationDate: record.expirationDate });
      pool.totalQty += qty;

      globalPullList.push({
        sku,
        description: descriptionMap.get(sku),
        receiveItemId: record.receiveItemId,
        qty,
        sourceQty: record.available, // total available in source location at allocation time
        fromLocationId: record.locationIdentifier?.id ?? 0,
        fromLocationName: record.locationIdentifier?.nameKey?.name ?? "Unknown",
        fromLocationType: locationTypeMap[record.locationIdentifier?.id ?? -1] ?? inferLocationTypeFromName(record.locationIdentifier?.nameKey?.name),
        toLocationId: stagingLocationId,
        toLocationName: stagingLocationName,
        movement: "to_staging",
        lotNumber: record.lotNumber,
        expirationDate: record.expirationDate,
      });
    }
    skuStagingPool.set(sku, pool);

    // Record pick face replenishment moves
    for (const { record, qty } of pickFaceMoves) {
      globalPullList.push({
        sku,
        description: descriptionMap.get(sku),
        receiveItemId: record.receiveItemId,
        qty,
        sourceQty: record.available,
        fromLocationId: record.locationIdentifier?.id ?? 0,
        fromLocationName: record.locationIdentifier?.nameKey?.name ?? "Unknown",
        fromLocationType: locationTypeMap[record.locationIdentifier?.id ?? -1] ?? inferLocationTypeFromName(record.locationIdentifier?.nameKey?.name),
        toLocationId: pfId,
        toLocationName: pfName,
        movement: "to_pick_face",
        lotNumber: record.lotNumber,
        expirationDate: record.expirationDate,
      });
    }
  }

  // ── Step 3: Assign staging pool back to individual orders ─────────────────
  // Now that we know what's in staging, assign it to orders in the order they
  // were submitted. No partial allocation: if staging pool can't cover an order
  // line, skip the entire order and return its qty to the pool.

  // Build a mutable staging assignment pool per SKU
  interface StagingAssignPool {
    records: Array<{ record: InventoryPoolRecord; qty: number; lotNumber?: string; expirationDate?: string; remaining: number }>;
  }
  const stagingAssignPool = new Map<string, StagingAssignPool>();
  for (const [sku, pool] of Array.from(skuStagingPool.entries())) {
    stagingAssignPool.set(sku, {
      records: pool.records.map((r: { record: InventoryPoolRecord; qty: number; lotNumber?: string; expirationDate?: string }) => ({ ...r, remaining: r.qty })),
    });
  }

  const allocatedOrders: OrderAllocationResult[] = [];
  const skippedOrders: OrderAllocationResult[] = [];

  for (const order of orders) {
    // In Extensiv API: readOnly.orderId = Extensiv Transaction ID (e.g. 3214839) — used in API URLs
    //                  referenceNum = client's internal order number (e.g. "19069850") — display only
    const orderId = order.readOnly.orderId;
    const referenceNum = order.referenceNum;
    const poNum = order.poNum;
    const orderItems = order.orderItems ?? [];

    if (orderItems.length === 0) {
      skippedOrders.push({ orderId, referenceNum, poNum, status: "skipped", skipReason: "Order has no line items", lineItems: [], pullListItems: [], packListItems: [] });
      continue;
    }

    // Snapshot staging pool for rollback
    const stagingSnapshot = new Map<string, Array<number>>();
    for (const [sku, pool] of Array.from(stagingAssignPool.entries())) {
      stagingSnapshot.set(sku, pool.records.map((r: { remaining: number }) => r.remaining));
    }

    let orderCanBeFullyAllocated = true;
    let skipReason = "";
    const lineItems: AllocationLineItem[] = [];

    for (const item of orderItems) {
      const sku = item.itemIdentifier.sku;
      const qtyRequired = item.qty;
      const description = descriptionMap.get(sku);

      const pool = stagingAssignPool.get(sku);
      if (!pool || pool.records.reduce((s, r) => s + r.remaining, 0) < qtyRequired) {
        orderCanBeFullyAllocated = false;
        const available = pool?.records.reduce((s, r) => s + r.remaining, 0) ?? 0;
        skipReason = `Insufficient staged inventory for SKU ${sku}: need ${qtyRequired}, staged ${available}`;
        break;
      }

      // Apply lot mixing rule if enabled
      let eligibleRecords = pool.records.filter((r) => r.remaining > 0);
      if (noLotMixing) {
        const lotQtyMap = new Map<string, number>();
        for (const r of eligibleRecords) {
          const lot = r.lotNumber ?? "";
          lotQtyMap.set(lot, (lotQtyMap.get(lot) ?? 0) + r.remaining);
        }
        const eligibleLots = Array.from(lotQtyMap.entries())
          .filter(([, qty]) => qty >= qtyRequired)
          .map(([lot]) => lot);

        if (eligibleLots.length === 0) {
          orderCanBeFullyAllocated = false;
          skipReason = `No single lot code has sufficient staged qty for SKU ${sku} (Lot Mixing rule active)`;
          break;
        }

        // Pick earliest expiry lot
        const bestLot = eligibleLots.sort((a, b) => {
          const aRec = eligibleRecords.find((r) => (r.lotNumber ?? "") === a);
          const bRec = eligibleRecords.find((r) => (r.lotNumber ?? "") === b);
          return getInventoryPriority(aRec?.record ?? ({} as InventoryPoolRecord)) -
                 getInventoryPriority(bRec?.record ?? ({} as InventoryPoolRecord));
        })[0]!;

        eligibleRecords = eligibleRecords.filter((r) => (r.lotNumber ?? "") === bestLot);
      }

      // Assign from staging pool (FEFO)
      const sortedEligible = [...eligibleRecords].sort(
        (a, b) => getInventoryPriority(a.record) - getInventoryPriority(b.record)
      );

      const lineAllocations: AllocationLineItem["allocations"] = [];
      let remaining = qtyRequired;
      for (const r of sortedEligible) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, r.remaining);
        lineAllocations.push({
          receiveItemId: r.record.receiveItemId,
          qty: take,
          locationId: stagingLocationId,
          locationName: stagingLocationName,
          locationType: "staging",
          lotNumber: r.lotNumber,
          expirationDate: r.expirationDate,
        });
        r.remaining -= take;
        remaining -= take;
      }

      lineItems.push({ sku, description, qtyRequired, allocations: lineAllocations });
    }

    if (!orderCanBeFullyAllocated) {
      // Rollback staging pool for this order
      for (const [sku, snapshots] of Array.from(stagingSnapshot.entries())) {
        const pool = stagingAssignPool.get(sku);
        if (pool) {
          pool.records.forEach((r, i) => { r.remaining = snapshots[i] ?? r.remaining; });
        }
      }
      skippedOrders.push({ orderId, referenceNum, poNum, status: "skipped", skipReason, lineItems: [], pullListItems: [], packListItems: [] });
      continue;
    }

    // Build pack list for this order (everything comes from staging)
    const packListItems: PackListItem[] = [];
    for (const lineItem of lineItems) {
      for (const alloc of lineItem.allocations) {
        packListItems.push({
          orderId,
          referenceNum,
          sku: lineItem.sku,
          description: lineItem.description,
          qty: alloc.qty,
          lotNumber: alloc.lotNumber,
          expirationDate: alloc.expirationDate,
          locationName: stagingLocationName,
        });
      }
    }

    allocatedOrders.push({
      orderId,
      referenceNum,
      poNum,
      status: "allocated",
      lineItems,
      pullListItems: [], // pull list is global (SKU-level), not per order
      packListItems,
    });
  }

  // ── Step 4: Build global pack list and summary ────────────────────────────
  const packList = allocatedOrders.flatMap((o) => o.packListItems);

  const summaryMap = new Map<string, AllocationSummaryItem>();
  for (const order of allocatedOrders) {
    for (const lineItem of order.lineItems) {
      const existing = summaryMap.get(lineItem.sku) ?? {
        sku: lineItem.sku,
        description: lineItem.description,
        totalQtyRequired: 0,
        totalQtyAllocated: 0,
        orderCount: 0,
        movements: [],
      };
      existing.totalQtyRequired += lineItem.qtyRequired;
      existing.totalQtyAllocated += lineItem.qtyRequired;
      existing.orderCount += 1;
      summaryMap.set(lineItem.sku, existing);
    }
  }

  // Add movement details from pull list to summary
  for (const pull of globalPullList) {
    const existing = summaryMap.get(pull.sku);
    if (existing) {
      existing.movements.push({
        fromLocation: pull.fromLocationName,
        toLocation: pull.toLocationName,
        qty: pull.qty,
        movement: pull.movement,
      });
    }
  }

  return {
    allocatedOrders,
    skippedOrders,
    pullList: globalPullList,
    packList,
    allocationSummary: Array.from(summaryMap.values()),
  };
}
