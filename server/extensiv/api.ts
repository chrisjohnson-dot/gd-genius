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
        "http://api.3plCentral.com/rels/properties/facility"?: Array<{ id: number; name: string; facilityId?: number; [key: string]: unknown }>;
      };
      // Some Extensiv accounts return a flat array
      [key: string]: unknown;
    };

    // Try HAL embedded format first
    const embedded = data?._embedded?.["http://api.3plCentral.com/rels/properties/facility"];
    if (embedded && embedded.length > 0) {
      // Some accounts use facilityId instead of id at the top level
      return embedded.map((f) => ({ id: f.id ?? f.facilityId ?? 0, name: f.name })).filter(f => f.id > 0);
    }

    // Fallback: some accounts return a direct array at root
    if (Array.isArray(data)) {
      return (data as Array<{ id?: number; facilityId?: number; name: string }>).map((f) => ({ id: f.id ?? f.facilityId ?? 0, name: f.name })).filter(f => f.id > 0);
    }

    console.warn("[Extensiv] /properties/facilities returned no usable data, falling back to customer-embedded facilities");
  } catch (err) {
    console.warn("[Extensiv] /properties/facilities failed, falling back:", err);
  }

  // Fallback 1: Extract unique facilities from the embedded facilities array on customer records
  // This is reliable because each customer record includes a `facilities` array with {id, name}
  try {
    const allRaw: RawExtensivCustomer[] = [];
    let pgnum = 1;
    const pgsiz = 500;
    while (true) {
      const data = (await client.get("/customers", { pgsiz, pgnum })) as {
        _embedded?: { "http://api.3plCentral.com/rels/customers/customer"?: RawExtensivCustomer[] };
      };
      const page = data?._embedded?.["http://api.3plCentral.com/rels/customers/customer"] ?? [];
      allRaw.push(...page);
      if (page.length < pgsiz) break;
      pgnum++;
    }
    const facilityMap = new Map<number, ExtensivFacility>();
    for (const c of allRaw) {
      for (const f of (c.facilities ?? [])) {
        if (f.id && !facilityMap.has(f.id)) facilityMap.set(f.id, { id: f.id, name: f.name });
      }
    }
    if (facilityMap.size > 0) {
      console.log(`[Extensiv] fetchAllFacilities: extracted ${facilityMap.size} unique facilities from customer records`);
      return Array.from(facilityMap.values());
    }
  } catch (err) {
    console.warn("[Extensiv] customer-embedded facilities fallback failed:", err);
  }

  // Fallback 2: loop through customers and call /customers/{id}/facilities per customer
  const customers = await fetchCustomers(config);
  const facilityMap2 = new Map<number, ExtensivFacility>();
  for (const customer of customers) {
    const facilities = await fetchFacilities(config, customer.id);
    for (const f of facilities) {
      if (!facilityMap2.has(f.id)) facilityMap2.set(f.id, f);
    }
  }
  return Array.from(facilityMap2.values());
}

// Fetch customers that belong to a specific facility
export async function fetchCustomersForFacility(
  config: ExtensivClientConfig,
  facilityId: number
): Promise<ExtensivCustomer[]> {
  const client = createExtensivClient(config);

  // Fetch all customers (paginated) and filter client-side by the embedded facilities array.
  // NOTE: The Extensiv API's facilityid query param is not reliably supported — it returns all
  // customers regardless of the filter. We rely on the embedded `facilities` array on each
  // customer record to determine facility membership.
  const allRaw: RawExtensivCustomer[] = [];
  let pgnum = 1;
  const pgsiz = 500;

  try {
    while (true) {
      const data = (await client.get("/customers", { pgsiz, pgnum })) as {
        totalResults?: number;
        _embedded?: { "http://api.3plCentral.com/rels/customers/customer"?: RawExtensivCustomer[] };
      };
      const page = (data?._embedded?.["http://api.3plCentral.com/rels/customers/customer"] ?? []) as RawExtensivCustomer[];
      allRaw.push(...page);
      if (page.length < pgsiz) break;
      pgnum++;
    }
  } catch (err) {
    console.warn("[Extensiv] fetchCustomersForFacility: failed to fetch customers:", err);
  }

  console.log(`[Extensiv] fetchCustomersForFacility: fetched ${allRaw.length} total customers, filtering for facilityId=${facilityId}`);

  // Filter by embedded facilities array (each customer has a `facilities` array with {id, name})
  const filtered = allRaw.filter((c) => {
    if (!c.facilities || c.facilities.length === 0) return false;
    return c.facilities.some((f) => f.id === facilityId);
  });

  // Also include deactivated=false customers only
  const active = filtered.filter((c) => !c.readOnly?.deactivated);

  const mapped = active.map(mapRawCustomer).filter((c) => c.id > 0);
  console.log(`[Extensiv] fetchCustomersForFacility: found ${mapped.length} active customers for facilityId=${facilityId}`);
  return mapped;
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

  // Filter: not closed, not fully allocated, status 0 (Open), 1 (Complete/Ready), or 2 (some accounts use this)
  // Note: Extensiv order statuses: 0=Open, 1=Complete(ready for pick), 2=some accounts use for partial, 3=Closed, 4=Cancelled
  const filtered = allOrders.filter(
    (o) =>
      !o.readOnly.isClosed &&
      !o.readOnly.fullyAllocated &&
      o.readOnly.status !== undefined &&
      o.readOnly.status <= 2
  );

  // Log what was excluded so we can diagnose issues
  const excluded = allOrders.filter((o) => !filtered.includes(o));
  if (excluded.length > 0) {
    console.log(`[Extensiv] fetchOpenOrders: excluded ${excluded.length} orders for customer ${customerId}:`,
      excluded.map(o => ({ id: o.readOnly.orderId, status: o.readOnly.status, isClosed: o.readOnly.isClosed, fullyAllocated: o.readOnly.fullyAllocated }))
    );
  }
  console.log(`[Extensiv] fetchOpenOrders: ${filtered.length} open orders for customer ${customerId} (${allOrders.length} total fetched)`);

  return filtered;
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
