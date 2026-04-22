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

// ─── Order note parsing ───────────────────────────────────────────────────────

export type SortOverride = "fefo" | "lifo" | "fifo";

export interface OrderNoteRules {
  /** Explicit sort order extracted from notes (overrides FEFO default) */
  sortOverride?: SortOverride;
  /** Minimum remaining shelf life in days extracted from notes (overrides customer rule) */
  minShelfLifeDays?: number;
}

/**
 * Parse free-text order notes for FEFO/LIFO/FIFO overrides and minimum shelf
 * life requirements.
 *
 * Recognised patterns (case-insensitive):
 *   - "LIFO" or "no FEFO"            → sortOverride = "lifo"
 *   - "FIFO" or "no expiry"          → sortOverride = "fifo"
 *   - "min 90 days" / "min 90d"      → minShelfLifeDays = 90
 *   - "min shelf life: 120"          → minShelfLifeDays = 120
 *   - "minimum 60 days remaining"    → minShelfLifeDays = 60
 */
export function parseOrderNoteRules(notes: string | undefined | null): OrderNoteRules {
  if (!notes) return {};
  const result: OrderNoteRules = {};

  // Sort override
  if (/\bLIFO\b/i.test(notes) || /no\s+FEFO/i.test(notes)) {
    result.sortOverride = "lifo";
  } else if (/\bFIFO\b/i.test(notes) || /no\s+expir/i.test(notes)) {
    result.sortOverride = "fifo";
  }

  // Minimum shelf life
  const shelfMatch =
    notes.match(/min(?:imum)?\s+shelf\s+life[:\s]+([\d]+)/i) ||
    notes.match(/min(?:imum)?\s+([\d]+)\s*d(?:ays?)?\s+(?:remaining|shelf)/i) ||
    notes.match(/min\s+([\d]+)\s*d(?:ays?)?/i) ||
    notes.match(/([\d]+)\s*d(?:ays?)?\s+(?:remaining|shelf\s+life)/i);
  if (shelfMatch) {
    const days = parseInt(shelfMatch[1]!, 10);
    if (!isNaN(days) && days > 0) result.minShelfLifeDays = days;
  }

  return result;
}

// ─── Inventory sort helpers ───────────────────────────────────────────────────

function getInventoryPriority(record: ExtensivInventoryRecord, sortOverride?: SortOverride): number {
  if (sortOverride === "lifo") {
    // LIFO: latest expiry first; no-expiry records come last (highest receiveItemId first)
    if (record.expirationDate) {
      return -new Date(record.expirationDate).getTime();
    }
    return 1e15 - (record.receiveItemId ?? 0);
  }
  if (sortOverride === "fifo") {
    // FIFO: ignore expiry, sort by receiveItemId ascending (oldest received first)
    return record.receiveItemId ?? Number.MAX_SAFE_INTEGER;
  }
  // Default: FEFO — earliest expiry first; no-expiry falls back to lowest receiveItemId
  if (record.expirationDate) {
    return new Date(record.expirationDate).getTime();
  }
  // No expiry: fall back to receiveItemId ascending (oldest receive first = FIFO).
  // receiveItemId is a monotonically increasing integer assigned by Extensiv at
  // receive time, so a lower ID means it was received earlier.
  // We add 1e15 to keep no-expiry records after any expiry-dated records.
  return 1e15 + (record.receiveItemId ?? Number.MAX_SAFE_INTEGER);
}

function sortFEFO(records: InventoryPoolRecord[], sortOverride?: SortOverride): InventoryPoolRecord[] {
  return [...records].sort((a, b) => getInventoryPriority(a, sortOverride) - getInventoryPriority(b, sortOverride));
}

/**
 * Filter inventory records that do not meet the minimum remaining shelf life.
 * Records without an expiry date are always kept (they have no known expiry).
 */
function filterByShelfLife(records: InventoryPoolRecord[], minShelfLifeDays: number | undefined | null): InventoryPoolRecord[] {
  if (!minShelfLifeDays || minShelfLifeDays <= 0) return records;
  const cutoff = Date.now() + minShelfLifeDays * 86_400_000;
  return records.filter((r) => {
    if (!r.expirationDate) return true; // no expiry = always eligible
    return new Date(r.expirationDate).getTime() >= cutoff;
  });
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
  /** Records already in staging — must be consumed BEFORE the pick face */
  stagingAlreadyThere: InventoryPoolRecord[] = [],
  /**
   * Whether a pick face is configured for this SKU.
   * When false, warehouse pallet surplus stays in the warehouse location instead
   * of being routed to a pick face.
   */
  hasPickFace = false,
): {
  stagingMoves: Array<{ record: InventoryPoolRecord; qty: number }>;
  pickFaceMoves: Array<{ record: InventoryPoolRecord; qty: number }>;
  satisfied: boolean;
  totalStaged: number;
} {
  const stagingMoves: Array<{ record: InventoryPoolRecord; qty: number }> = [];
  const pickFaceMoves: Array<{ record: InventoryPoolRecord; qty: number }> = [];

  // ── Step 0: Drain existing staging inventory first (highest priority) ──────
  // Items already moved to staging must be consumed before touching the pick face
  // or pulling any warehouse pallets.
  let remaining = qtyNeeded;
  for (const rec of sortFEFO(stagingAlreadyThere)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, rec.remainingQty);
    stagingMoves.push({ record: rec, qty: take });
    rec.remainingQty -= take;
    remaining -= take;
  }
  if (remaining === 0) {
    return { stagingMoves, pickFaceMoves, satisfied: true, totalStaged: qtyNeeded };
  }

  const pickFaceAvailable = pickFaceRecords.reduce((s, r) => s + r.remainingQty, 0);

  if (pickFaceAvailable >= remaining) {
    // ── Scenario A: pick face has enough for the remainder ───────────────────
    // Take exactly what we still need from pick face → staging. FEFO order.
    for (const rec of sortFEFO(pickFaceRecords)) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, rec.remainingQty);
      stagingMoves.push({ record: rec, qty: take });
      rec.remainingQty -= take;
      remaining -= take;
    }
    return { stagingMoves, pickFaceMoves, satisfied: true, totalStaged: qtyNeeded };
  }

  // ── Scenario B: pick face is short — pull whole warehouse pallets first,
  //                then top up from pick face if still short ─────────────────
  //
  // Rule:
  //   1. Pull warehouse pallets in FEFO / location-priority order.
  //      Each pallet is taken in full (whole pallet move). If a pallet exactly
  //      covers the remaining need, take it all to staging with no surplus.
  //      If a pallet would overshoot, do NOT split it — stop pulling warehouse
  //      pallets and top up the gap from the pick face instead.
  //   2. After all whole pallets have been pulled, if there is still a gap,
  //      take the remainder from the pick face (FEFO).
  //   3. If the pick face also cannot cover the gap, we are short — the
  //      satisfied flag will be false.
  //
  // This avoids pulling a second (or partial) warehouse pallet just to cover
  // a small overage when the pick face already has available stock.
  // Note: the `remaining` variable was declared in Step 0 above; we continue reducing it here.

  for (const rec of applyLocationPriority(warehouseRecords, locationPriorityPatterns)) {
    if (remaining <= 0) break;
    const palletQty = rec.remainingQty; // full pallet

    if (palletQty <= remaining) {
      // Entire pallet fits within what we still need — take it all to staging.
      stagingMoves.push({ record: rec, qty: palletQty });
      rec.remainingQty = 0;
      remaining -= palletQty;
    } else {
      // This pallet would overshoot. Check whether the pick face can cover
      // the remaining gap instead of splitting this pallet.
      const pickFaceAvail = pickFaceRecords.reduce((s, r) => s + r.remainingQty, 0);
      if (pickFaceAvail >= remaining) {
        // Pick face can cover the gap — do NOT pull this warehouse pallet.
        // Break out of the warehouse loop and let the pick-face top-up below
        // handle the remainder.
        break;
      }
      // This pallet overshoots and the pick face cannot cover the gap.
      // Send exactly `remaining` to staging.
      stagingMoves.push({ record: rec, qty: remaining });
      const surplus = palletQty - remaining;
      if (surplus > 0 && hasPickFace) {
        // A real pick face is configured — put the surplus there for replenishment.
        pickFaceMoves.push({ record: rec, qty: surplus });
        rec.remainingQty = 0;
      } else {
        // No pick face configured — leave the surplus in the warehouse location.
        // Only reduce remainingQty by what we actually took.
        rec.remainingQty = surplus;
      }
      remaining = 0;
    }
  }

  // Top up any remaining gap from the pick face (FEFO order).
  // This covers two cases:
  //   a) We stopped pulling warehouse pallets because the pick face could cover
  //      the remainder (the new hybrid rule above).
  //   b) The warehouse was completely exhausted and we are still short.
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
  // Rule 0: any location containing "staging" or ending in "-stage" is always staging,
  // regardless of prefix (e.g. ACR-Staging must NOT be classified as pick face).
  if (/staging/i.test(trimmed) || /-stage$/i.test(trimmed)) return "staging";
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
  /** Optional: list of location name patterns to EXCLUDE from allocation entirely (e.g. Building 1) */
  locationExclusionPatterns: Array<{ pattern: string; label: string }> = [],
  /** Optional: customer-level minimum shelf life in days (can be overridden per order via order notes) */
  customerMinShelfLifeDays?: number | null,
  /**
   * All configured pick face locations for this customer (from location_configs).
   * Used for smart per-SKU pick face routing:
   *   1. SKU-named: location name contains the SKU number → always route there.
   *   2. Client pick face with existing SKU stock → route there.
   *   3. First empty client pick face (zero on-hand in inventory pool) → assign there.
   */
  allPickFaceLocations: Array<{ locationId: number; locationName: string }> = [],
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

  // Helper: test if a location name matches any exclusion pattern
  const isExcludedLocation = (locName: string | undefined): boolean => {
    if (!locName || locationExclusionPatterns.length === 0) return false;
    return locationExclusionPatterns.some(({ pattern }) => {
      try { return new RegExp(pattern, "i").test(locName); }
      catch { return locName.startsWith(pattern); }
    });
  };

  // ── Build per-order note rules map (sort override + per-order shelf life) ──
  const orderNoteRulesMap = new Map<number, OrderNoteRules>();
  for (const order of orders) {
    orderNoteRulesMap.set(order.readOnly.orderId, parseOrderNoteRules(order.notes));
  }

  // Compute effective shelf life floor per SKU across all orders:
  // take the maximum minShelfLifeDays requirement across all orders that need this SKU
  // (most conservative wins — if any order needs 90 days, all inventory for that SKU
  // must meet 90 days when pulling from the global pool).
  const skuShelfLifeFloor = new Map<string, number>();
  for (const order of orders) {
    const noteRules = orderNoteRulesMap.get(order.readOnly.orderId) ?? {};
    const effectiveShelfLife = noteRules.minShelfLifeDays ?? customerMinShelfLifeDays ?? 0;
    if (effectiveShelfLife > 0) {
      for (const item of order.orderItems ?? []) {
        const sku = item.itemIdentifier.sku;
        const current = skuShelfLifeFloor.get(sku) ?? 0;
        if (effectiveShelfLife > current) skuShelfLifeFloor.set(sku, effectiveShelfLife);
      }
    }
  }

  for (const [sku, totalNeeded] of Array.from(skuTotalDemand.entries())) {
    const shelfLifeFloor = skuShelfLifeFloor.get(sku) ?? 0;
    const allSkuRecords = Array.from(inventoryPool.values()).filter(
      (r) => r.itemIdentifier.sku === sku && r.remainingQty > 0
        && !isExcludedLocation(r.locationIdentifier?.nameKey?.name)
    );
    // Apply shelf life filter to all records for this SKU
    const shelfLifeFiltered = shelfLifeFloor > 0 ? filterByShelfLife(allSkuRecords, shelfLifeFloor) : allSkuRecords;

    // Helper: resolve effective location type — use explicit config first, then name-based inference.
    // SAFETY OVERRIDE: if the location name contains "staging" or ends with "-stage", always treat
    // as staging regardless of what the DB says (prevents ACR-Staging being misclassified as pick_face).
    const resolveLocType = (r: InventoryPoolRecord): LocationType => {
      const locName = r.locationIdentifier?.nameKey?.name ?? "";
      // Staging name always wins — even over DB config
      if (/staging/i.test(locName) || /-stage$/i.test(locName)) return "staging";
      const configured = locationTypeMap[r.locationIdentifier?.id ?? -1];
      if (configured) return configured;
      return inferLocationTypeFromName(locName);
    };

    // Separate inventory into three tiers:
    //   1. stagingAlreadyThere — items already in a staging location (consume FIRST)
    //   2. pickFaceRecords     — items in pick face locations (consume second)
    //   3. warehouseRecords    — full pallets in warehouse (pull only when needed)
    const stagingAlreadyThere = shelfLifeFiltered.filter((r) => resolveLocType(r) === "staging");
    const pickFaceRecords = shelfLifeFiltered.filter((r) => resolveLocType(r) === "pick_face");
    const warehouseRecords = shelfLifeFiltered.filter((r) => resolveLocType(r) === "warehouse");

    const allWarehouse = [...warehouseRecords];

    // ── Smart per-SKU pick face routing ─────────────────────────────────────
    // Priority:
    //   1. SKU-named location: any configured pick face whose name contains the SKU number.
    //   2. Client pick face with existing SKU stock: SKU already present in a configured PF.
    //   3. First empty client pick face: configured PF with zero on-hand in the inventory pool.
    //   4. Fallback: legacy pickFaceLocationId/Name from caller (if provided).
    //   5. No pick face: surplus stays in warehouse.
    let pfId = 0;
    let pfName = "Pick Face";

    // Build a set of all inventory record IDs that belong to any configured pick face location
    // so we can check on-hand quickly.
    const configuredPfLocationIds = new Set(allPickFaceLocations.map((l) => l.locationId));

    // 1. SKU-named location: name contains the SKU (case-insensitive)
    //    Check configured pick face locations first, then fall back to inventory pool
    //    (handles the case where a pick face location exists in Extensiv but wasn't
    //    manually added to Location Config).
    const skuNamedPf = allPickFaceLocations.find((l) =>
      l.locationName.toLowerCase().includes(sku.toLowerCase())
    );
    // Also check inventory pool for any pick face record whose location name matches the SKU
    const skuNamedPfFromInventory = !skuNamedPf
      ? pickFaceRecords.find((r) =>
          (r.locationIdentifier?.nameKey?.name ?? "").toLowerCase().includes(sku.toLowerCase())
        )
      : undefined;
    if (skuNamedPf) {
      pfId = skuNamedPf.locationId;
      pfName = skuNamedPf.locationName;
    } else if (skuNamedPfFromInventory) {
      pfId = skuNamedPfFromInventory.locationIdentifier?.id ?? 0;
      pfName = skuNamedPfFromInventory.locationIdentifier?.nameKey?.name ?? "Pick Face";
    } else {
      // 2. Client pick face that already has this SKU in inventory
      const existingPfRecord = pickFaceRecords.find((r) =>
        configuredPfLocationIds.has(r.locationIdentifier?.id ?? -1)
      );
      if (existingPfRecord) {
        pfId = existingPfRecord.locationIdentifier?.id ?? 0;
        pfName = existingPfRecord.locationIdentifier?.nameKey?.name ?? "Pick Face";
      } else {
        // 3. First empty configured pick face (no inventory records for ANY SKU at that location)
        const occupiedPfLocationIds = new Set(
          Array.from(inventoryPool.values())
            .filter((r) => configuredPfLocationIds.has(r.locationIdentifier?.id ?? -1) && r.remainingQty > 0)
            .map((r) => r.locationIdentifier?.id ?? -1)
        );
        const emptyPf = allPickFaceLocations.find((l) => !occupiedPfLocationIds.has(l.locationId));
        if (emptyPf) {
          pfId = emptyPf.locationId;
          pfName = emptyPf.locationName;
        } else if (pickFaceLocationId != null && pickFaceLocationId > 0) {
          // 4. Fallback: legacy customer-level pick face location
          pfId = pickFaceLocationId;
          pfName = pickFaceLocationName ?? "Pick Face";
        }
        // 5. pfId remains 0 → no pick face move
      }
    }

    // A pick face is considered active for this SKU ONLY if there are actual inventory
    // records for this SKU in a pick face location, OR a valid pick face destination was found.
    const hasPf = pickFaceRecords.length > 0 || pfId > 0;

    const { stagingMoves, pickFaceMoves, satisfied } = planSkuMovements(
      totalNeeded,
      pickFaceRecords,
      allWarehouse,
      pfId,
      pfName,
      stagingLocationId,
      stagingLocationName,
      locationPriorityPatterns,
      stagingAlreadyThere,
      hasPf,
    );

    // Always build the staging pool with whatever we could move, even if not fully satisfied.
    // The per-order assignment step will skip individual orders that can't be fully covered.

    // Pre-compute total available qty per source location for accurate On Hand display.
    // A single location may have multiple inventory records (different lots/pallets);
    // the pull list consolidates them into one row per SKU+location, so sourceQty
    // must reflect the sum of all records at that location being moved.
    const stagingLocTotals = new Map<number, number>();
    for (const { record } of stagingMoves) {
      const locId = record.locationIdentifier?.id ?? 0;
      stagingLocTotals.set(locId, (stagingLocTotals.get(locId) ?? 0) + record.available);
    }
    const pickFaceLocTotals = new Map<number, number>();
    for (const { record } of pickFaceMoves) {
      const locId = record.locationIdentifier?.id ?? 0;
      pickFaceLocTotals.set(locId, (pickFaceLocTotals.get(locId) ?? 0) + record.available);
    }

    // Record staging pool for this SKU
    const pool: SkuStagingPool = { records: [], totalQty: 0 };
    for (const { record, qty } of stagingMoves) {
      pool.records.push({ record, qty, lotNumber: record.lotNumber, expirationDate: record.expirationDate });
      pool.totalQty += qty;

      const stagingLocId = record.locationIdentifier?.id ?? 0;
      globalPullList.push({
        sku,
        description: descriptionMap.get(sku),
        receiveItemId: record.receiveItemId,
        qty,
        // Use total available across all records at this location (not just this record)
        sourceQty: stagingLocTotals.get(stagingLocId) ?? record.available,
        fromLocationId: stagingLocId,
        fromLocationName: record.locationIdentifier?.nameKey?.name ?? "Unknown",
        fromLocationType: locationTypeMap[stagingLocId] ?? inferLocationTypeFromName(record.locationIdentifier?.nameKey?.name),
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
      const pfLocId = record.locationIdentifier?.id ?? 0;
      globalPullList.push({
        sku,
        description: descriptionMap.get(sku),
        receiveItemId: record.receiveItemId,
        qty,
        // Use total available across all records at this location (not just this record)
        sourceQty: pickFaceLocTotals.get(pfLocId) ?? record.available,
        fromLocationId: pfLocId,
        fromLocationName: record.locationIdentifier?.nameKey?.name ?? "Unknown",
        fromLocationType: locationTypeMap[pfLocId] ?? inferLocationTypeFromName(record.locationIdentifier?.nameKey?.name),
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
