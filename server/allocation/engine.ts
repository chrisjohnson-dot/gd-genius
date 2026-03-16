/**
 * Go Direct Allocation Engine
 *
 * Rules:
 * 1. FEFO: First Expired First Out (fall back to FIFO by receivedDate if no expiry)
 * 2. Location Priority:
 *    - Tier 1: Staging + Pick Face locations (try to fulfill entirely from here first)
 *    - Tier 2: If Tier 1 insufficient, take ALL from staging, then fill from warehouse
 * 3. No Partial Allocation: if ANY line item cannot be fully satisfied, skip the entire order
 * 4. Exclude on-hold and quarantined inventory
 */

import { ExtensivInventoryRecord, ExtensivOrder, ExtensivOrderItem } from "../extensiv/api";

export type LocationType = "staging" | "pick_face" | "warehouse";

export interface LocationTypeMap {
  [locationId: number]: LocationType;
}

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

export interface PullListItem {
  sku: string;
  description?: string;
  receiveItemId: number;
  qty: number;
  fromLocationId: number;
  fromLocationName: string;
  fromLocationType: LocationType;
  toLocationId: number; // staging location
  toLocationName: string;
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
  locationName: string;
}

export interface OrderAllocationResult {
  orderId: number;
  referenceNum: string;
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
    locationType: LocationType;
  }>;
}

function getInventoryPriority(record: ExtensivInventoryRecord): number {
  // Lower number = higher priority (pick first)
  // Sort by expiration date (FEFO), then by received date (FIFO)
  if (record.expirationDate) {
    return new Date(record.expirationDate).getTime();
  }
  if (record.receivedDate) {
    return new Date(record.receivedDate).getTime() + 1e15; // push FIFO after FEFO
  }
  return 2e15; // no date = last
}

type InventoryPoolRecord = ExtensivInventoryRecord & { remainingQty: number };

function sortInventoryFEFO(records: InventoryPoolRecord[]): InventoryPoolRecord[] {
  return [...records].sort((a, b) => getInventoryPriority(a) - getInventoryPriority(b));
}

/**
 * Main allocation function.
 * Takes a list of orders and available inventory, returns allocation results.
 */
export function runAllocationEngine(
  orders: ExtensivOrder[],
  inventory: ExtensivInventoryRecord[],
  locationTypeMap: LocationTypeMap,
  stagingLocationId: number,
  stagingLocationName: string,
  descriptionMap: Map<string, string>
): AllocationRunResult {
  // Build a mutable inventory pool keyed by receiveItemId
  // Only include available (not on hold, not quarantined) inventory
  const inventoryPool = new Map<number, ExtensivInventoryRecord & { remainingQty: number }>();
  for (const rec of inventory) {
    if (!rec.isOnHold && !rec.quarantined && rec.available > 0) {
      inventoryPool.set(rec.receiveItemId, { ...rec, remainingQty: rec.available });
    }
  }

  const allocatedOrders: OrderAllocationResult[] = [];
  const skippedOrders: OrderAllocationResult[] = [];

  for (const order of orders) {
    const orderId = order.readOnly.orderId;
    const referenceNum = order.referenceNum;
    const orderItems = order.orderItems ?? [];

    if (orderItems.length === 0) {
      skippedOrders.push({
        orderId,
        referenceNum,
        status: "skipped",
        skipReason: "Order has no line items",
        lineItems: [],
        pullListItems: [],
        packListItems: [],
      });
      continue;
    }

    // Simulate allocation for this order without committing to the pool
    const simulatedAllocations: Array<{
      receiveItemId: number;
      qty: number;
      record: InventoryPoolRecord;
    }> = [];

    let orderCanBeFullyAllocated = true;
    const lineItems: AllocationLineItem[] = [];
    let skipReason = "";

    // Snapshot pool state for rollback
    const poolSnapshot = new Map<number, number>();
    inventoryPool.forEach((v, k) => poolSnapshot.set(k, v.remainingQty));

    for (const item of orderItems) {
      const sku = item.itemIdentifier.sku;
      const qtyRequired = item.qty;
      const description = descriptionMap.get(sku);

      // Get all available inventory for this SKU
      const skuInventory = Array.from(inventoryPool.values()).filter(
        (r) => r.itemIdentifier.sku === sku && r.remainingQty > 0
      );

      if (skuInventory.length === 0) {
        orderCanBeFullyAllocated = false;
        skipReason = `No available inventory for SKU ${sku}`;
        break;
      }

      // Separate by location type
      const stagingAndPickFace = sortInventoryFEFO(
        skuInventory.filter((r) => {
          const locType = locationTypeMap[r.locationIdentifier?.id ?? -1];
          return locType === "staging" || locType === "pick_face";
        })
      );
      const warehouseInventory = sortInventoryFEFO(
        skuInventory.filter((r) => {
          const locType = locationTypeMap[r.locationIdentifier?.id ?? -1];
          return locType === "warehouse";
        })
      );
      const unmappedInventory = sortInventoryFEFO(
        skuInventory.filter((r) => {
          const locType = locationTypeMap[r.locationIdentifier?.id ?? -1];
          return !locType;
        })
      );

      const lineAllocations: AllocationLineItem["allocations"] = [];
      let remaining = qtyRequired;

      // Tier 1: Try to satisfy entirely from staging + pick face
      const tier1TotalAvailable = stagingAndPickFace.reduce((s, r) => s + r.remainingQty, 0);

      if (tier1TotalAvailable >= qtyRequired) {
        // Fully satisfy from staging/pick face
        for (const rec of stagingAndPickFace) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, rec.remainingQty);
          lineAllocations.push({
            receiveItemId: rec.receiveItemId,
            qty: take,
            locationId: rec.locationIdentifier?.id ?? 0,
            locationName: rec.locationIdentifier?.nameKey?.name ?? "Unknown",
            locationType: locationTypeMap[rec.locationIdentifier?.id ?? -1] ?? "warehouse",
            lotNumber: rec.lotNumber,
            expirationDate: rec.expirationDate,
          });
          simulatedAllocations.push({ receiveItemId: rec.receiveItemId, qty: take, record: rec });
          rec.remainingQty -= take;
          remaining -= take;
        }
      } else {
        // Tier 2: Take all from staging/pick face, then fill from warehouse
        for (const rec of stagingAndPickFace) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, rec.remainingQty);
          lineAllocations.push({
            receiveItemId: rec.receiveItemId,
            qty: take,
            locationId: rec.locationIdentifier?.id ?? 0,
            locationName: rec.locationIdentifier?.nameKey?.name ?? "Unknown",
            locationType: locationTypeMap[rec.locationIdentifier?.id ?? -1] ?? "warehouse",
            lotNumber: rec.lotNumber,
            expirationDate: rec.expirationDate,
          });
          simulatedAllocations.push({ receiveItemId: rec.receiveItemId, qty: take, record: rec });
          rec.remainingQty -= take;
          remaining -= take;
        }

        // Fill from warehouse (FEFO)
        for (const rec of warehouseInventory) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, rec.remainingQty);
          lineAllocations.push({
            receiveItemId: rec.receiveItemId,
            qty: take,
            locationId: rec.locationIdentifier?.id ?? 0,
            locationName: rec.locationIdentifier?.nameKey?.name ?? "Unknown",
            locationType: "warehouse",
            lotNumber: rec.lotNumber,
            expirationDate: rec.expirationDate,
          });
          simulatedAllocations.push({ receiveItemId: rec.receiveItemId, qty: take, record: rec });
          rec.remainingQty -= take;
          remaining -= take;
        }

        // Fill from unmapped locations as last resort
        for (const rec of unmappedInventory) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, rec.remainingQty);
          lineAllocations.push({
            receiveItemId: rec.receiveItemId,
            qty: take,
            locationId: rec.locationIdentifier?.id ?? 0,
            locationName: rec.locationIdentifier?.nameKey?.name ?? "Unknown",
            locationType: "warehouse",
            lotNumber: rec.lotNumber,
            expirationDate: rec.expirationDate,
          });
          simulatedAllocations.push({ receiveItemId: rec.receiveItemId, qty: take, record: rec });
          rec.remainingQty -= take;
          remaining -= take;
        }
      }

      if (remaining > 0) {
        // Cannot fully satisfy this line item — no partial allocation
        orderCanBeFullyAllocated = false;
        skipReason = `Insufficient inventory for SKU ${sku}: need ${qtyRequired}, available ${qtyRequired - remaining}`;
        break;
      }

      lineItems.push({ sku, description, qtyRequired, allocations: lineAllocations });
    }

    if (!orderCanBeFullyAllocated) {
      // Rollback pool changes for this order
      poolSnapshot.forEach((remainingQty, k) => {
        const current = inventoryPool.get(k);
        if (current) current.remainingQty = remainingQty;
      });
      skippedOrders.push({
        orderId,
        referenceNum,
        status: "skipped",
        skipReason,
        lineItems: [],
        pullListItems: [],
        packListItems: [],
      });
      continue;
    }

    // Build pull list (warehouse/pick_face → staging) and pack list
    const pullListItems: PullListItem[] = [];
    const packListItems: PackListItem[] = [];

    for (const lineItem of lineItems) {
      for (const alloc of lineItem.allocations) {
        // Pack list: everything going to the order
        packListItems.push({
          orderId,
          referenceNum,
          sku: lineItem.sku,
          description: lineItem.description,
          qty: alloc.qty,
          lotNumber: alloc.lotNumber,
          expirationDate: alloc.expirationDate,
          locationName: alloc.locationName,
        });

        // Pull list: only items that need to be moved to staging (non-staging sources)
        if (alloc.locationType !== "staging") {
          pullListItems.push({
            sku: lineItem.sku,
            description: lineItem.description,
            receiveItemId: alloc.receiveItemId,
            qty: alloc.qty,
            fromLocationId: alloc.locationId,
            fromLocationName: alloc.locationName,
            fromLocationType: alloc.locationType,
            toLocationId: stagingLocationId,
            toLocationName: stagingLocationName,
            lotNumber: alloc.lotNumber,
            expirationDate: alloc.expirationDate,
          });
        }
      }
    }

    allocatedOrders.push({
      orderId,
      referenceNum,
      status: "allocated",
      lineItems,
      pullListItems,
      packListItems,
    });
  }

  // Build global pull list and pack list
  const pullList = allocatedOrders.flatMap((o) => o.pullListItems);
  const packList = allocatedOrders.flatMap((o) => o.packListItems);

  // Build allocation summary by SKU
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
      for (const alloc of lineItem.allocations) {
        if (alloc.locationType !== "staging") {
          existing.movements.push({
            fromLocation: alloc.locationName,
            toLocation: stagingLocationName,
            qty: alloc.qty,
            locationType: alloc.locationType,
          });
        }
      }
      summaryMap.set(lineItem.sku, existing);
    }
  }

  return {
    allocatedOrders,
    skippedOrders,
    pullList,
    packList,
    allocationSummary: Array.from(summaryMap.values()),
  };
}
