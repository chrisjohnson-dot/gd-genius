/**
 * Extensiv WMS API data fetching helpers.
 * All functions accept a configured ExtensivClient instance.
 */

import { createExtensivClient, ExtensivClientConfig } from "./client";

export interface ExtensivCustomer {
  id: number;
  name: string;
}

export interface ExtensivFacility {
  id: number;
  name: string;
}

export interface ExtensivOrderItem {
  itemIdentifier: { sku: string; id: number };
  qty: number;
  lotNumber?: string;
  serialNumber?: string;
  expirationDate?: string;
  proposedAllocations?: Array<{ receivedItemId: number; qty: number }>;
}

export interface ExtensivOrder {
  readOnly: {
    orderId: number;
    status: number;
    fullyAllocated: boolean;
    isClosed: boolean;
    customerIdentifier: { id: number; name: string };
    facilityIdentifier: { id: number; name: string };
    creationDate: string;
  };
  referenceNum: string;
  poNum?: string;
  notes?: string;
  orderItems?: ExtensivOrderItem[];
  _links?: Record<string, unknown>;
}

export interface ExtensivInventoryRecord {
  receiveItemId: number;
  itemIdentifier: { sku: string; id: number };
  description?: string;
  available: number;
  onHand: number;
  isOnHold: boolean;
  quarantined: boolean;
  lotNumber?: string;
  serialNumber?: string;
  expirationDate?: string;
  receivedDate?: string;
  locationIdentifier?: {
    id: number;
    nameKey?: { name: string; facilityIdentifier?: { name: string; id: number } };
  };
  palletIdentifier?: { id: number; nameKey?: { name: string } };
}

export interface ExtensivItemDescription {
  id: number;
  sku: string;
  description?: string;
}

// Fetch all customers for a config
export async function fetchCustomers(config: ExtensivClientConfig): Promise<ExtensivCustomer[]> {
  const client = createExtensivClient(config);
  const data = (await client.get("/customers", { pgsiz: 500 })) as {
    _embedded?: { "http://api.3plCentral.com/rels/customers/customer"?: ExtensivCustomer[] };
  };
  return data?._embedded?.["http://api.3plCentral.com/rels/customers/customer"] ?? [];
}

// Fetch all facilities for a customer
export async function fetchFacilities(
  config: ExtensivClientConfig,
  customerId: number
): Promise<ExtensivFacility[]> {
  const client = createExtensivClient(config);
  const data = (await client.get(`/customers/${customerId}/facilities`, { pgsiz: 100 })) as {
    _embedded?: { "http://api.3plCentral.com/rels/customers/facility"?: ExtensivFacility[] };
  };
  return data?._embedded?.["http://api.3plCentral.com/rels/customers/facility"] ?? [];
}

// Fetch all facilities across all customers (deduplicated by facilityId)
export async function fetchAllFacilities(
  config: ExtensivClientConfig
): Promise<ExtensivFacility[]> {
  const customers = await fetchCustomers(config);
  const facilityMap = new Map<number, ExtensivFacility>();
  for (const customer of customers) {
    const facilities = await fetchFacilities(config, customer.id);
    for (const f of facilities) {
      if (!facilityMap.has(f.id)) facilityMap.set(f.id, f);
    }
  }
  return Array.from(facilityMap.values());
}

// Fetch customers that have orders in a specific facility
export async function fetchCustomersForFacility(
  config: ExtensivClientConfig,
  facilityId: number
): Promise<ExtensivCustomer[]> {
  // Fetch all customers then filter to those with the given facility
  const customers = await fetchCustomers(config);
  const results: ExtensivCustomer[] = [];
  for (const customer of customers) {
    const facilities = await fetchFacilities(config, customer.id);
    if (facilities.some((f) => f.id === facilityId)) {
      results.push(customer);
    }
  }
  return results;
}

// Fetch open, unallocated orders for a customer (client-side filtered)
export async function fetchOpenOrders(
  config: ExtensivClientConfig,
  customerId: number,
  facilityId: number
): Promise<ExtensivOrder[]> {
  const client = createExtensivClient(config);
  const allOrders: ExtensivOrder[] = [];
  let pgnum = 1;
  const pgsiz = 1000;

  while (true) {
    const data = (await client.get("/orders/summaries", {
      pgsiz,
      pgnum,
      customerid: customerId,
      facilityid: facilityId,
    })) as {
      totalResults?: number;
      _embedded?: { "http://api.3plCentral.com/rels/orders/order"?: ExtensivOrder[] };
    };

    const orders = data?._embedded?.["http://api.3plCentral.com/rels/orders/order"] ?? [];
    allOrders.push(...orders);

    if (orders.length < pgsiz) break;
    pgnum++;
  }

  // Filter: not closed, not fully allocated, status 0 (entered) or 1 (started)
  return allOrders.filter(
    (o) =>
      !o.readOnly.isClosed &&
      !o.readOnly.fullyAllocated &&
      o.readOnly.status !== undefined &&
      o.readOnly.status <= 1
  );
}

// Fetch a single order with full detail (includes orderItems and ETag)
export async function fetchOrderWithDetail(
  config: ExtensivClientConfig,
  orderId: number
): Promise<{ order: ExtensivOrder; etag: string }> {
  const client = createExtensivClient(config);
  // We need the ETag - fetch with axios directly to get headers
  const { getExtensivToken } = await import("./client");
  const token = await getExtensivToken(config);
  const baseUrl = config.baseUrl || "https://secure-wms.com";

  const axios = (await import("axios")).default;
  const response = await axios.get(`${baseUrl}/orders/${orderId}`, {
    params: { detail: "all", itemdetail: "all" },
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/hal+json",
      "Accept-Language": "en-US,en;q=0.8",
    },
  });

  const etag = (response.headers["etag"] || "").replace(/"/g, "");
  return { order: response.data as ExtensivOrder, etag };
}

// Fetch inventory stock details for a customer/facility (all pages)
export async function fetchInventory(
  config: ExtensivClientConfig,
  customerId: number,
  facilityId: number
): Promise<ExtensivInventoryRecord[]> {
  const client = createExtensivClient(config);
  const allRecords: ExtensivInventoryRecord[] = [];
  let pgnum = 1;
  const pgsiz = 500;

  while (true) {
    const data = (await client.get("/inventory/stockdetails", {
      customerid: customerId,
      facilityid: facilityId,
      pgsiz,
      pgnum,
    })) as {
      totalResults?: number;
      _embedded?: { item?: ExtensivInventoryRecord[] };
    };

    const records = data?._embedded?.item ?? [];
    allRecords.push(...records);

    if (records.length < pgsiz) break;
    pgnum++;
  }

  return allRecords;
}

// Fetch item descriptions for a customer (paginated, max 100 per page)
export async function fetchItemDescriptions(
  config: ExtensivClientConfig,
  customerId: number
): Promise<Map<string, string>> {
  const client = createExtensivClient(config);
  const descMap = new Map<string, string>();
  let pgnum = 1;
  const pgsiz = 100;

  while (true) {
    const data = (await client.get(`/customers/${customerId}/items`, {
      pgsiz,
      pgnum,
    })) as {
      _embedded?: { "http://api.3plCentral.com/rels/customers/item"?: ExtensivItemDescription[] };
    };

    const items = data?._embedded?.["http://api.3plCentral.com/rels/customers/item"] ?? [];
    for (const item of items) {
      if (item.sku && item.description) {
        descMap.set(item.sku, item.description);
      }
    }

    if (items.length < pgsiz) break;
    pgnum++;
  }

  return descMap;
}

// Move inventory to staging location
export async function moveInventory(
  config: ExtensivClientConfig,
  destinationLocationId: number,
  moveItems: Array<{ receiveItemId: number; quantity: number }>
): Promise<{ success: boolean; error?: string }> {
  const client = createExtensivClient(config);
  const result = await client.post("/inventory/mover", {
    destination: { id: destinationLocationId },
    moveItems,
  });

  if (result.status === 200 || result.status === 201) {
    return { success: true };
  }
  return { success: false, error: JSON.stringify(result.data) };
}

// Allocate an order using proposed allocations (requires ETag)
export async function allocateOrder(
  config: ExtensivClientConfig,
  orderId: number,
  etag: string
): Promise<{ success: boolean; error?: string }> {
  const client = createExtensivClient(config);
  const result = await client.put(`/orders/${orderId}/allocator`, {}, etag);

  if (result.status === 200 || result.status === 204) {
    return { success: true };
  }
  return { success: false, error: JSON.stringify(result.data) };
}

// Update order items with proposed allocations before calling allocator
export async function updateOrderProposedAllocations(
  config: ExtensivClientConfig,
  orderId: number,
  etag: string,
  orderItems: ExtensivOrderItem[]
): Promise<{ success: boolean; newEtag: string; error?: string }> {
  const { getExtensivToken } = await import("./client");
  const token = await getExtensivToken(config);
  const baseUrl = config.baseUrl || "https://secure-wms.com";
  const axios = (await import("axios")).default;

  const response = await axios.put(
    `${baseUrl}/orders/${orderId}`,
    { orderItems },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/hal+json",
        "Content-Type": "application/json",
        "If-Match": `"${etag}"`,
      },
      validateStatus: () => true,
    }
  );

  if (response.status === 200) {
    const newEtag = (response.headers["etag"] || "").replace(/"/g, "");
    return { success: true, newEtag };
  }
  return { success: false, newEtag: "", error: JSON.stringify(response.data) };
}
