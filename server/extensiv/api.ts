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

  // NOTE: Extensiv /orders uses RQL syntax for filtering, NOT simple query params.
  // customerid=X is silently ignored. The correct approach is:
  //   rql=readonly.customerIdentifier.id==X
  // We also do NOT filter by facilityid here — the facilityId in the customer's embedded
  // `facilities` array is often different from the facilityIdentifier.id on order records.
  // Instead we filter client-side after fetching.
  // Filter to open/unallocated orders only (status 0=Open, 1=Complete/Ready, 2=some accounts)
  // This dramatically reduces the payload for customers with many historical orders
  const rql = `readonly.customerIdentifier.id==${customerId};readonly.status=in=(0,1,2);readonly.isClosed==false;readonly.fullyAllocated==false`;
  while (true) {
    const data = (await client.get("/orders", {
      pgsiz,
      pgnum,
      rql,
      detail: "all",
      itemdetail: "all",
    })) as {
      totalResults?: number;
      _embedded?: { "http://api.3plCentral.com/rels/orders/order"?: ExtensivOrder[] };
    };

    const orders = data?._embedded?.["http://api.3plCentral.com/rels/orders/order"] ?? [];
    allOrders.push(...orders);

    if (orders.length < pgsiz) break;
    pgnum++;
  }

  console.log(`[Extensiv] fetchOpenOrders: fetched ${allOrders.length} total orders for customer ${customerId}`);

  // Filter by facility: match on facilityIdentifier.id OR facilityIdentifier.name containing the facility name
  // We also accept orders with no facilityIdentifier (some accounts omit it)
  const facilityOrders = allOrders.filter((o) => {
    const fid = o.readOnly?.facilityIdentifier?.id;
    // Accept if no facility set, or if facility ID matches
    return !fid || fid === facilityId;
  });

  // If the facility filter removed everything, fall back to all orders (ID mismatch — show all and let user see them)
  const ordersToFilter = facilityOrders.length > 0 ? facilityOrders : allOrders;
  if (facilityOrders.length === 0 && allOrders.length > 0) {
    console.warn(`[Extensiv] fetchOpenOrders: facilityId=${facilityId} matched 0 orders out of ${allOrders.length}. Falling back to all orders for customer ${customerId}. Order facility IDs: ${Array.from(new Set(allOrders.map(o => o.readOnly?.facilityIdentifier?.id))).join(', ')}`);
  }

  // Filter: not closed, not fully allocated, status 0 (Open), 1 (Complete/Ready), or 2 (some accounts use this)
  // Note: Extensiv order statuses: 0=Open, 1=Complete(ready for pick), 2=some accounts use for partial, 3=Closed, 4=Cancelled
  const filtered = ordersToFilter.filter(
    (o) =>
      !o.readOnly.isClosed &&
      !o.readOnly.fullyAllocated &&
      o.readOnly.status !== undefined &&
      o.readOnly.status <= 2
  );

  // Log what was excluded so we can diagnose issues
  const excluded = ordersToFilter.filter((o) => !filtered.includes(o));
  if (excluded.length > 0) {
    console.log(`[Extensiv] fetchOpenOrders: excluded ${excluded.length} orders for customer ${customerId}:`,
      excluded.map(o => ({ id: o.readOnly.orderId, status: o.readOnly.status, isClosed: o.readOnly.isClosed, fullyAllocated: o.readOnly.fullyAllocated }))
    );
  }
  console.log(`[Extensiv] fetchOpenOrders: ${filtered.length} open orders for customer ${customerId} (facilityId=${facilityId}, ${allOrders.length} total fetched, ${facilityOrders.length} matched facility)`);

  // DIAGNOSTIC: log raw field values so we can confirm which field is the Extensiv internal ID
  if (filtered.length > 0) {
    console.log(`[Extensiv] fetchOpenOrders FIELD DIAGNOSTIC for customer ${customerId}:`,
      filtered.slice(0, 5).map(o => ({
        "readOnly.orderId": o.readOnly.orderId,
        "referenceNum": o.referenceNum,
        "poNum": (o as unknown as Record<string, unknown>).poNum,
      }))
    );
  }

  // Normalise orderItems from HAL embedded so lineCount/totalPieces are available in the UI.
  // The list endpoint returns items under _embedded HAL keys, not a direct orderItems array.
  const REL_ITEM = "http://api.3plCentral.com/rels/orders/item";
  const REL_ORDERITEM = "http://api.3plCentral.com/rels/orders/orderitem";

  function extractItemsFromOrder(o: ExtensivOrder): ExtensivOrderItem[] {
    const raw = o as ExtensivOrder & { _embedded?: Record<string, unknown>; orderItems?: unknown };
    if (Array.isArray(raw.orderItems) && (raw.orderItems as ExtensivOrderItem[]).length > 0) {
      return raw.orderItems as ExtensivOrderItem[];
    }
    const embedded = (raw._embedded ?? {}) as Record<string, unknown>;
    for (const key of [REL_ITEM, REL_ORDERITEM, "orderItem", "orderItems", "item"]) {
      const candidate = embedded[key];
      if (!candidate) continue;
      if (Array.isArray(candidate) && candidate.length > 0) return candidate as ExtensivOrderItem[];
      const obj = candidate as Record<string, unknown>;
      if (Array.isArray(obj.item) && obj.item.length > 0) return obj.item as ExtensivOrderItem[];
      if (obj.itemIdentifier || obj.readOnly) return [obj as unknown as ExtensivOrderItem];
    }
    return [];
  }

  const normalized = filtered.map((o) => {
    const items = extractItemsFromOrder(o);
    return { ...o, orderItems: items };
  });

  return normalized;
}

// Fetch a single order with full detail (includes orderItems and ETag)
export async function fetchOrderWithDetail(
  config: ExtensivClientConfig,
  orderId: number
): Promise<{ order: ExtensivOrder; etag: string }> {
  const client = createExtensivClient(config);
  // Use client.getWithHeaders so the correct tplGuid/userLoginId auth context is included
  const baseUrl = config.baseUrl || "https://secure-wms.com";
  console.log(`[fetchOrderWithDetail] Calling GET ${baseUrl}/orders/${orderId} (via authenticated client)`);
  const { data: rawData, headers: responseHeaders } = await client.getWithHeaders(
    `/orders/${orderId}`,
    { detail: "all", itemdetail: "all" }
  );

  const etag = ((responseHeaders["etag"] || responseHeaders["ETag"]) ?? "").replace(/"/g, "");
  const raw = rawData as ExtensivOrder & { _embedded?: Record<string, unknown>; orderItems?: unknown };

  // Helper: extract an array of order items from any HAL variant Extensiv may return.
  // Handles: direct array, object with .item array, object with ._embedded.item array,
  // and the canonical HAL rel key as well as shorthand keys.
  function extractItemArray(candidate: unknown): ExtensivOrderItem[] {
    if (!candidate) return [];
    if (Array.isArray(candidate)) return candidate as ExtensivOrderItem[];
    const obj = candidate as Record<string, unknown>;
    // HAL: { item: [...] } or { _embedded: { item: [...] } }
    if (Array.isArray(obj.item)) return obj.item as ExtensivOrderItem[];
    const nested = obj._embedded as Record<string, unknown> | undefined;
    if (nested && Array.isArray(nested.item)) return nested.item as ExtensivOrderItem[];
    // Single-item HAL: Extensiv sometimes returns a single object instead of array
    if (obj.itemIdentifier || obj.readOnly) return [obj as unknown as ExtensivOrderItem];
    return [];
  }

  // Normalise orderItems — check direct field first, then all _embedded variants
  let resolvedItems: ExtensivOrderItem[] = [];
  if (Array.isArray(raw.orderItems) && (raw.orderItems as ExtensivOrderItem[]).length > 0) {
    resolvedItems = raw.orderItems as ExtensivOrderItem[];
  } else {
    const embedded = (raw._embedded ?? {}) as Record<string, unknown>;
    // Extensiv HAL rel key for order items is /orders/item (NOT /orders/orderitem)
    const REL_ITEM = "http://api.3plCentral.com/rels/orders/item";
    const REL_ORDERITEM = "http://api.3plCentral.com/rels/orders/orderitem";
    // Try the confirmed HAL key first, then fallbacks
    for (const key of [REL_ITEM, REL_ORDERITEM, "orderItem", "orderItems", "item"]) {
      const candidate = embedded[key];
      if (candidate) {
        resolvedItems = extractItemArray(candidate);
        if (resolvedItems.length > 0) break;
      }
    }
    // Also check if orderItems on the raw object is a non-array (single object or wrapped)
    if (resolvedItems.length === 0 && raw.orderItems && !Array.isArray(raw.orderItems)) {
      resolvedItems = extractItemArray(raw.orderItems);
    }
  }
  raw.orderItems = resolvedItems;

  // DIAGNOSTIC: log what was found
  const embeddedKeyList = Object.keys((raw._embedded ?? {}) as Record<string, unknown>);
  console.log(`[fetchOrderWithDetail] orderId=${orderId} itemCount=${resolvedItems.length} embeddedKeys=[${embeddedKeyList.join(",")}] rawOrderItemsType=${Array.isArray(rawData && (rawData as Record<string,unknown>).orderItems)?"array":typeof (rawData as Record<string,unknown>)?.orderItems}`);
  if (resolvedItems.length > 0) {
    const firstItem = resolvedItems[0] as unknown as Record<string, unknown>;
    console.log(`[fetchOrderWithDetail] orderId=${orderId} firstItemKeys=${Object.keys(firstItem).join(",")} sku=${(firstItem.itemIdentifier as {sku?:string})?.sku ?? "?"}`);
  } else {
    // Log the full raw response structure to help diagnose
    const topKeys = Object.keys(raw as unknown as Record<string, unknown>);
    const rawOrderItems = (rawData as Record<string,unknown>)?.orderItems;
    console.log(`[fetchOrderWithDetail] orderId=${orderId} NO ITEMS FOUND. topKeys=[${topKeys.join(",")}] rawOrderItems=${JSON.stringify(rawOrderItems)?.slice(0,200)}`);
  }
  return { order: raw as ExtensivOrder, etag };
}

// Fetch inventory stock details for a customer/facility (all pages)
// Helper: paginated fetch from a given inventory endpoint path
async function fetchInventoryFromPath(
  client: ReturnType<typeof createExtensivClient>,
  path: string,
  baseParams: Record<string, unknown>
): Promise<ExtensivInventoryRecord[]> {
  const allRecords: ExtensivInventoryRecord[] = [];
  let pgnum = 1;
  const pgsiz = 500;

  while (true) {
    const data = (await client.get(path, { ...baseParams, pgsiz, pgnum })) as {
      totalResults?: number;
      _embedded?: Record<string, unknown>;
    };

    // The embedded key varies by endpoint — try common keys
    const embedded = data?._embedded ?? {};
    const records = (
      (embedded["item"] as ExtensivInventoryRecord[] | undefined) ??
      (embedded["http://api.3plCentral.com/rels/inventory/stockdetail"] as ExtensivInventoryRecord[] | undefined) ??
      (embedded["http://api.3plCentral.com/rels/customers/itemsummary"] as ExtensivInventoryRecord[] | undefined) ??
      []
    );
    allRecords.push(...records);

    if (records.length < pgsiz) break;
    pgnum++;
  }

  return allRecords;
}

export async function fetchInventory(
  config: ExtensivClientConfig,
  customerId: number,
  facilityId: number
): Promise<ExtensivInventoryRecord[]> {
  const client = createExtensivClient(config);

  // Try endpoints in order of preference (most specific first)
  const endpointAttempts: Array<{ path: string; params: Record<string, unknown> }> = [
    // 1. Documented: customer-scoped itemsummaries with facility RQL filter
    {
      path: `/customers/${customerId}/itemsummaries`,
      params: { rql: `facilityIdentifier.id==${facilityId}` },
    },
    // 2. Customer itemsummaries without facility filter (fallback)
    {
      path: `/customers/${customerId}/itemsummaries`,
      params: {},
    },
    // 3. Undocumented but widely used stockdetails with RQL
    {
      path: "/inventory/stockdetails",
      params: { rql: `customerIdentifier.id==${customerId};facilityIdentifier.id==${facilityId}` },
    },
    // 4. Original approach (query params) as last resort
    {
      path: "/inventory/stockdetails",
      params: { customerid: customerId, facilityid: facilityId },
    },
  ];

  for (const attempt of endpointAttempts) {
    try {
      const records = await fetchInventoryFromPath(client, attempt.path, attempt.params);
      // If we got records, return them (even 0 is valid — customer may have no stock)
      // Only skip to next attempt if we got an error (caught below)
      return records;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      // 503 = service unavailable (wrong endpoint), 404 = not found — try next
      // 401/403 = auth error — stop trying
      if (status === 401 || status === 403) throw err;
      // Otherwise try next endpoint
      console.warn(`[fetchInventory] Attempt failed (${status}) for ${attempt.path}, trying next...`);
    }
  }

  // All attempts failed — return empty array so allocation can still proceed
  console.error(`[fetchInventory] All inventory endpoints failed for customer ${customerId}, facility ${facilityId}`);
  return [];
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
// NOTE: Extensiv requires destination.nameKey.name — sending only id causes 400 ModelValidationException.
export async function moveInventory(
  config: ExtensivClientConfig,
  destinationLocationId: number,
  destinationLocationName: string,
  moveItems: Array<{ receiveItemId: number; quantity: number }>
): Promise<{ success: boolean; error?: string }> {
  const client = createExtensivClient(config);
  const result = await client.post("/inventory/mover", {
    destination: {
      id: destinationLocationId,
      nameKey: { name: destinationLocationName },
    },
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

// Deallocate an order (requires a fresh ETag from GET on the order)
export async function deallocateOrder(
  config: ExtensivClientConfig,
  orderId: number,
  etag: string
): Promise<{ success: boolean; error?: string }> {
  const client = createExtensivClient(config);
  const result = await client.put(`/orders/${orderId}/deallocator`, {}, etag);
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

export interface ExtensivLocation {
  locationId: number;
  name: string;
  facilityId: number;
  facilityName?: string;
}

// Fetch all locations for a facility from Extensiv
export async function fetchExtensivLocations(
  config: ExtensivClientConfig,
  facilityId: number
): Promise<ExtensivLocation[]> {
  const client = createExtensivClient(config);
  const allLocations: ExtensivLocation[] = [];
  let pgnum = 1;
  const pgsiz = 500;

  while (true) {
    // Try facility-scoped URL first: /properties/facilities/{id}/locations
    // Fall back to global collection if that fails
    let data: {
      totalResults?: number;
      _embedded?: {
        "http://api.3plCentral.com/rels/properties/location"?: Array<{
          locationId?: number;
          id?: number;
          name?: string;
          field1?: string;
          nameKey?: { name?: string };
          facilityIdentifier?: { id: number; name?: string };
          allocationPriority?: number;
        }>;
      };
    };
    type LocationsResponse = typeof data;
    try {
      data = (await client.get(`/properties/facilities/${facilityId}/locations`, { pgsiz, pgnum })) as LocationsResponse;
    } catch {
      // Fall back to global collection endpoint, filter client-side
      data = (await client.get("/properties/facilities/locations", { pgsiz, pgnum })) as LocationsResponse;
    }

    const items =
      data?._embedded?.["http://api.3plCentral.com/rels/properties/location"] ?? [];

    for (const item of items) {
      const id = item.locationId ?? item.id;
      // Official docs: field1 is the location name (e.g. "D-017-C")
      const name = item.field1 ?? item.name ?? item.nameKey?.name ?? "";
      const fId = item.facilityIdentifier?.id ?? facilityId;
      const fName = item.facilityIdentifier?.name;
      // Filter client-side by facilityId (RQL filter causes 400)
      if (id && name && fId === facilityId) {
        allLocations.push({ locationId: id, name, facilityId: fId, facilityName: fName });
      }
    }

    if (items.length < pgsiz) break;
    pgnum++;
  }

  console.log(`[Extensiv] fetchExtensivLocations: ${allLocations.length} locations for facilityId=${facilityId}`);
  return allLocations;
}
