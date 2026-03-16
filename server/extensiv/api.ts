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

// Raw customer shape from Extensiv API
interface RawExtensivCustomer {
  readOnly?: { customerId?: number; deactivated?: boolean };
  companyInfo?: { companyName?: string };
  facilities?: Array<{ id: number; name: string }>;
  // Some older responses may have top-level id/name
  id?: number;
  name?: string;
}

function mapRawCustomer(c: RawExtensivCustomer): ExtensivCustomer {
  const id = c.readOnly?.customerId ?? c.id ?? 0;
  const name = c.companyInfo?.companyName ?? c.name ?? `Customer ${id}`;
  return { id, name };
}

// Fetch all customers for a config
export async function fetchCustomers(config: ExtensivClientConfig): Promise<ExtensivCustomer[]> {
  const client = createExtensivClient(config);
  const data = (await client.get("/customers", { pgsiz: 500 })) as {
    _embedded?: { "http://api.3plCentral.com/rels/customers/customer"?: RawExtensivCustomer[] };
  };
  const raw = data?._embedded?.["http://api.3plCentral.com/rels/customers/customer"] ?? [];
  return raw.map(mapRawCustomer);
}

// Fetch all facilities for a customer (used for customer-facility membership checks)
export async function fetchFacilities(
  config: ExtensivClientConfig,
  customerId: number
): Promise<ExtensivFacility[]> {
  const client = createExtensivClient(config);
  try {
    const data = (await client.get(`/customers/${customerId}/facilities`, { pgsiz: 100 })) as {
      _embedded?: { "http://api.3plCentral.com/rels/customers/facility"?: ExtensivFacility[] };
    };
    return data?._embedded?.["http://api.3plCentral.com/rels/customers/facility"] ?? [];
  } catch {
    return [];
  }
}

// Fetch all facilities using the direct /properties/facilities endpoint
export async function fetchAllFacilities(
  config: ExtensivClientConfig
): Promise<ExtensivFacility[]> {
  const client = createExtensivClient(config);

  // Primary: use the dedicated properties/facilities endpoint
  try {
    const data = (await client.get("/properties/facilities", { pgsiz: 500 })) as {
      _embedded?: {
        "http://api.3plCentral.com/rels/properties/facility"?: Array<{ id: number; name: string; [key: string]: unknown }>;
      };
      // Some Extensiv accounts return a flat array
      [key: string]: unknown;
    };

    // Try HAL embedded format first
    const embedded = data?._embedded?.["http://api.3plCentral.com/rels/properties/facility"];
    if (embedded && embedded.length > 0) {
      return embedded.map((f) => ({ id: f.id, name: f.name }));
    }

    // Fallback: some accounts return a direct array at root
    if (Array.isArray(data)) {
      return (data as Array<{ id: number; name: string }>).map((f) => ({ id: f.id, name: f.name }));
    }
  } catch (err) {
    console.warn("[Extensiv] /properties/facilities failed, falling back to customer loop:", err);
  }

  // Fallback: loop through customers and collect their facilities
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

// Fetch customers that belong to a specific facility
export async function fetchCustomersForFacility(
  config: ExtensivClientConfig,
  facilityId: number
): Promise<ExtensivCustomer[]> {
  const client = createExtensivClient(config);

  // Primary: use facilityid query param to get customers directly (paginated)
  try {
    const allRaw: RawExtensivCustomer[] = [];
    let pgnum = 1;
    const pgsiz = 500;
    while (true) {
      const data = (await client.get("/customers", { pgsiz, pgnum, facilityid: facilityId })) as {
        totalResults?: number;
        _embedded?: { "http://api.3plCentral.com/rels/customers/customer"?: RawExtensivCustomer[] };
      };
      const page = (data?._embedded?.["http://api.3plCentral.com/rels/customers/customer"] ?? []) as RawExtensivCustomer[];
      allRaw.push(...page);
      if (page.length < pgsiz) break;
      pgnum++;
    }
    console.log(`[Extensiv] fetchCustomersForFacility facilityId=${facilityId} raw count=${allRaw.length}`);
    if (allRaw.length > 0) {
      const mapped = allRaw.map(mapRawCustomer).filter((c) => c.id > 0);
      console.log(`[Extensiv] fetchCustomersForFacility mapped ${mapped.length} customers with valid IDs`);
      if (mapped.length > 0) return mapped;
    }
  } catch (err) {
    console.warn("[Extensiv] /customers?facilityid failed, falling back to loop:", err);
  }

  // Fallback: fetch all customers and filter by embedded facilities array
  console.log("[Extensiv] fetchCustomersForFacility falling back to all-customers filter");
  const allRaw2: RawExtensivCustomer[] = [];
  const clientFb = createExtensivClient(config);
  let pgnum2 = 1;
  const pgsiz2 = 500;
  while (true) {
    const data2 = (await clientFb.get("/customers", { pgsiz: pgsiz2, pgnum: pgnum2 })) as {
      _embedded?: { "http://api.3plCentral.com/rels/customers/customer"?: RawExtensivCustomer[] };
    };
    const page2 = (data2?._embedded?.["http://api.3plCentral.com/rels/customers/customer"] ?? []) as RawExtensivCustomer[];
    allRaw2.push(...page2);
    if (page2.length < pgsiz2) break;
    pgnum2++;
  }
  console.log(`[Extensiv] fetchCustomersForFacility fallback total=${allRaw2.length}`);
  const results = allRaw2
    .filter((c) => c.facilities?.some((f) => f.id === facilityId))
    .map(mapRawCustomer)
    .filter((c) => c.id > 0);
  console.log(`[Extensiv] fetchCustomersForFacility fallback found ${results.length} customers for facility ${facilityId}`);
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
