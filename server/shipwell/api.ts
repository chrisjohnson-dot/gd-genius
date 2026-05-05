/**
 * Shipwell TMS API Client
 *
 * Handles authentication (token-based), purchase order creation,
 * shipment creation, and live status polling.
 *
 * Docs: https://shipwell.redoc.ly/docs/get-connected/authentication/
 * PO:   https://shipwell.redoc.ly/openapi_pages/backend-core/tag/purchase-orders/
 * Shipments: https://shipwell.redoc.ly/openapi_pages/backend-core/tag/shipments/
 */

import axios, { type AxiosInstance } from "axios";

// ─── Environment base URLs ────────────────────────────────────────────────────
const BASE_URLS = {
  sandbox:    "https://sandbox-api.shipwell.com",
  production: "https://api.shipwell.com",
} as const;

export type ShipwellEnvironment = keyof typeof BASE_URLS;

// ─── Shipwell status values (normalized to lowercase) ─────────────────────────
export type ShipwellShipmentStatus =
  | "quoting"
  | "tendered"
  | "carrier_confirmed"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "unknown";

/** Normalize raw Shipwell status strings to our canonical set */
export function normalizeShipwellStatus(raw: string | null | undefined): ShipwellShipmentStatus {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().replace(/[\s-]/g, "_");
  if (s.includes("delivered")) return "delivered";
  if (s.includes("in_transit") || s.includes("intransit") || s.includes("picked_up")) return "in_transit";
  if (s.includes("carrier_confirmed") || s.includes("confirmed")) return "carrier_confirmed";
  if (s.includes("tendered")) return "tendered";
  if (s.includes("quoting") || s.includes("quote")) return "quoting";
  if (s.includes("cancel")) return "cancelled";
  return "unknown";
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ShipwellAddress {
  address_1: string;
  address_2?: string | null;
  city: string;
  state_province?: string | null;
  postal_code?: string | null;
  country?: string;
}

export interface ShipwellLineItem {
  description?: string | null;
  quantity?: number | null;
  unit_of_measure?: string | null;
  weight?: number | null;
  weight_unit?: string | null;
  package_type?: string | null;
  total_packages?: number | null;
  freight_class?: string | null;
}

export interface CreatePurchaseOrderInput {
  order_number: string;
  purchase_order_number?: string | null;
  /** Extensiv order reference number — written to customer_reference_number so Genius can match shipments on sync */
  customer_reference_number?: string | null;
  origin_address: ShipwellAddress;
  destination_address: ShipwellAddress;
  customer_name?: string | null;
  description?: string | null;
  source: "SHIPWELL_WEB" | "IMPORT" | "TENDER" | "SHIPWELL_WEB_UNAUTH";
  line_items?: ShipwellLineItem[] | null;
  planned_pickup_start_datetime?: string | null;
  planned_delivery_start_datetime?: string | null;
  custom_data?: Record<string, unknown> | null;
}

export interface ShipwellPurchaseOrder {
  id: string;          // UUID
  order_number: string;
  purchase_order_number?: string | null;
  overall_status?: string | null;
  created_at?: string | null;
}

export interface ShipwellStop {
  stop_type?: string | null;          // 'pickup' | 'delivery'
  planned_date?: string | null;
  planned_time_window_start?: string | null;
  location?: {
    location_name?: string | null;
    location_type?: string | null;
    address?: {
      address_1?: string | null;
      city?: string | null;
      state_province?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
  } | null;
}

export interface ShipwellShipment {
  id: string;
  status?: string | null;
  reference_id?: string | null;
  customer_reference_number?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Customer info
  customer_name?: string | null;
  // Stop info — the API returns an array of stops
  stops?: ShipwellStop[] | null;
  // Convenience aliases sometimes returned by the API
  origin_stop?: ShipwellStop | null;
  destination_stop?: ShipwellStop | null;
  // Tracking & carrier assignment fields
  pro_number?: string | null;
  bol_number?: string | null;
  tracking_number?: string | null;
  pickup_number?: string | null;
  carrier_name?: string | null;
}

export interface ShipwellShipmentStatusResult {
  shipmentId: string;
  rawStatus: string | null;
  normalizedStatus: ShipwellShipmentStatus;
  isDelivered: boolean;
  // Carrier assignment fields (populated when available)
  proNumber?: string | null;
  bolNumber?: string | null;
  trackingNumber?: string | null;
  pickupNumber?: string | null;
  carrierName?: string | null;
}

// ─── Carrier Bid types ───────────────────────────────────────────────────────
// Fields match the actual Shipwell API response for GET /quoting/carrier-bids/
export interface ShipwellCarrierBid {
  id: string | null;                          // UUID
  shipment: string | null;                    // Shipwell shipment UUID
  bid_amount: number | null;                  // Rate (float)
  available_date: string | null;              // Carrier availability date (ISO date)
  available_time: string | null;              // Carrier availability time
  carrier_relationship: string | null;        // Carrier relationship UUID
  contact_first_name: string | null;          // Carrier contact first name
  contact_last_name: string | null;           // Carrier contact last name
  contact_email: string | null;
  contact_phone_number: string | null;
  mc_number: string | null;                   // MC number
  usdot_number: string | null;                // USDOT number
  distance_from_pickup_miles: number | null;
  equipment_type: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by_user_full_name: string | null;   // Who submitted the bid
  // Raw extra fields from Shipwell — kept for display purposes
  [key: string]: unknown;
}

// ─── Client class ─────────────────────────────────────────────────────────────
export class ShipwellClient {
  private http: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;
  /** If set, this API key is used directly as a Bearer token (no email/password auth needed) */
  private apiKey: string | null = null;

  constructor(
    private email: string,
    private password: string,
    private environment: ShipwellEnvironment = "sandbox"
  ) {
    this.http = axios.create({
      baseURL: BASE_URLS[environment],
      timeout: 30_000,
      headers: { "Content-Type": "application/json" },
    });
    // If the "password" field looks like an API key (32-char hex), use it directly
    if (/^[0-9a-f]{32}$/.test(password)) {
      this.apiKey = password;
      this.token = password;
      this.tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000);
    }
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  /** Authenticate and cache the token. Tokens are valid for ~24h; we refresh after 23h. */
  async authenticate(): Promise<string> {
    if (this.token && this.tokenExpiresAt && this.tokenExpiresAt > new Date(Date.now() + 5 * 60_000)) {
      return this.token;
    }
    // API key mode — no email/password auth needed
    if (this.apiKey) {
      this.token = this.apiKey;
      this.tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000);
      return this.token;
    }
    const res = await this.http.post<{ token: string; api_key: string | null }>("/v2/auth/token/", {
      email: this.email,
      password: this.password,
    });
    this.token = res.data.token;
    this.tokenExpiresAt = new Date(Date.now() + 23 * 60 * 60_000);
    return this.token;
  }

  /** Verify the token works by calling /v2/auth/me/ */
  async verifyCredentials(): Promise<{ valid: boolean; user?: { email: string; first_name: string; last_name: string } }> {
    try {
      const token = await this.authenticate();
      const res = await this.http.get<{ email: string; first_name: string; last_name: string }>("/v2/auth/me/", {
        headers: { Authorization: `Token ${token}` },
      });
      return { valid: true, user: res.data };
    } catch {
      return { valid: false };
    }
  }

  // ─── Purchase Orders ────────────────────────────────────────────────────────

  /** Create a new purchase order in Shipwell */
  async createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<ShipwellPurchaseOrder> {
    const token = await this.authenticate();
    const res = await this.http.post<ShipwellPurchaseOrder>("/v2/purchase-orders/", input, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  }

  /** Get the deep-link URL to view the PO in Shipwell's web UI */
  getPoUrl(poId: string): string {
    const host = this.environment === "production" ? "app.shipwell.com" : "sandbox.shipwell.com";
    return `https://${host}/purchase-orders/${poId}`;
  }

  // ─── Shipments ──────────────────────────────────────────────────────────────

  /** Get a shipment by ID and return its live status, PRO number, BOL, and tracking info */
  async getShipmentStatus(shipmentId: string): Promise<ShipwellShipmentStatusResult> {
    const token = await this.authenticate();
    const res = await this.http.get<ShipwellShipment>(`/v2/shipments/${shipmentId}/`, {
      headers: { Authorization: `Token ${token}` },
    });
    const data = res.data;
    const rawStatus = data.status ?? null;
    const normalizedStatus = normalizeShipwellStatus(rawStatus);
    return {
      shipmentId,
      rawStatus,
      normalizedStatus,
      isDelivered: normalizedStatus === "delivered",
      proNumber: data.pro_number ?? null,
      bolNumber: data.bol_number ?? null,
      trackingNumber: data.tracking_number ?? null,
      pickupNumber: data.pickup_number ?? null,
      carrierName: data.carrier_name ?? null,
    };
  }

  /** Get the deep-link URL to view a shipment in Shipwell's web UI */
  getShipmentUrl(shipmentId: string): string {
    const host = this.environment === "production" ? "app.shipwell.com" : "sandbox.shipwell.com";
    return `https://${host}/shipments/${shipmentId}`;
  }

  // ─── Carrier Bids ─────────────────────────────────────────────────────────

  /**
   * Get the number of carrier bids for a shipment.
   * Uses GET /v2/quoting/carrier-bids/?shipment_id={uuid}&page-size=1
   * and reads total_count from the paginated response.
   * Returns 0 if the call fails (non-fatal).
   */
  async getBidCount(shipmentId: string): Promise<number> {
    try {
      const token = await this.authenticate();
      const res = await this.http.get<{ total_count: number }>("/v2/quoting/carrier-bids/", {
        headers: { Authorization: `Token ${token}` },
        params: { shipment_id: shipmentId, "page-size": 1 },
      });
      return res.data.total_count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * List all shipments with optional status filter.
   * Returns up to `limit` results (default 100).
   */
  async listShipments(opts?: {
    status?: string;
    limit?: number;
    page?: number;
  }): Promise<{ results: ShipwellShipment[]; count: number }> {
    const token = await this.authenticate();
    const params: Record<string, string | number> = {
      page_size: opts?.limit ?? 100,
      page: opts?.page ?? 1,
    };
    if (opts?.status) params.status = opts.status;

    const res = await this.http.get<{ results: ShipwellShipment[]; count: number }>("/v2/shipments/", {
      headers: { Authorization: `Token ${token}` },
      params,
    });
    return res.data;
  }

  /**
   * Fetches ALL shipments by auto-paginating through every page.
   * Uses page_size=200 (Shipwell's max) to minimise round-trips.
   * Optionally filters by status.
   */
  async listAllShipments(opts?: { status?: string }): Promise<ShipwellShipment[]> {
    const token = await this.authenticate();
    const PAGE_SIZE = 200;
    const all: ShipwellShipment[] = [];
    let page = 1;
    let totalCount = 0;

    do {
      const params: Record<string, string | number> = { page_size: PAGE_SIZE, page };
      if (opts?.status) params.status = opts.status;

      const res = await this.http.get<{ results: ShipwellShipment[]; count: number }>("/v2/shipments/", {
        headers: { Authorization: `Token ${token}` },
        params,
      });

      const { results, count } = res.data;
      totalCount = count ?? 0;
      all.push(...results);

      // Stop if we've received everything or got an empty page
      if (results.length === 0 || all.length >= totalCount) break;
      page++;

      // Safety cap: never fetch more than 20 pages (~4000 shipments)
      if (page > 20) break;
    } while (true);

    return all;
  }

  /**
   * Batch-poll status for multiple shipment IDs.
   * Returns a map of shipmentId → status result.
   */
  async batchGetShipmentStatuses(
    shipmentIds: string[]
  ): Promise<Map<string, ShipwellShipmentStatusResult>> {
    const results = new Map<string, ShipwellShipmentStatusResult>();
    // Process in parallel with a concurrency limit of 5
    const chunks: string[][] = [];
    for (let i = 0; i < shipmentIds.length; i += 5) {
      chunks.push(shipmentIds.slice(i, i + 5));
    }
    for (const chunk of chunks) {
      const settled = await Promise.allSettled(
        chunk.map((id) => this.getShipmentStatus(id))
      );
      for (let i = 0; i < chunk.length; i++) {
        const result = settled[i];
        if (result.status === "fulfilled") {
          results.set(chunk[i], result.value);
        } else {
          // On error, mark as unknown so we don't remove the order
          results.set(chunk[i], {
            shipmentId: chunk[i],
            rawStatus: null,
            normalizedStatus: "unknown",
            isDelivered: false,
          });
        }
      }
    }
    return results;
  }

  /**
   * List all carrier bids for a shipment.
   * GET /quoting/carrier-bids/?shipment={shipmentId}
   */
  async getCarrierBids(
    shipmentId: string,
    pageSize = 50
  ): Promise<{ results: ShipwellCarrierBid[]; total_count: number }> {
    const token = await this.authenticate();
    const res = await this.http.get<{ results: ShipwellCarrierBid[]; total_count: number }>(
      "/quoting/carrier-bids/",
      {
        headers: { Authorization: `Token ${token}` },
        params: { shipment: shipmentId, "page-size": pageSize },
      }
    );
    return {
      results: res.data.results ?? [],
      total_count: res.data.total_count ?? (res.data.results?.length ?? 0),
    };
  }

  /**
   * Retrieve a single carrier bid by ID.
   * GET /v2/carrier-bids/{bidId}
   */
  async getCarrierBid(bidId: string): Promise<ShipwellCarrierBid> {
    const token = await this.authenticate();
    const res = await this.http.get<ShipwellCarrierBid>(
      `/v2/carrier-bids/${bidId}`,
      { headers: { Authorization: `Token ${token}` } }
    );
    return res.data;
  }

  /**
   * Tender a shipment to a specific carrier bid.
   * POST /v2/shipments/{shipmentId}/tender/
   */
  async tenderShipment(shipmentId: string, carrierBidId: string): Promise<void> {
    const token = await this.authenticate();
    const res = await this.http.post(
      `/v2/shipments/${shipmentId}/tender/`,
      { carrier_bid_id: carrierBidId },
      { headers: { Authorization: `Token ${token}` } }
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Shipwell tender failed (${res.status})`);
    }
  }
}

// ─── Factory: build client from stored config ─────────────────────────────────
export function createShipwellClient(config: {
  email: string;
  password: string;
  environment: ShipwellEnvironment;
}): ShipwellClient {
  return new ShipwellClient(config.email, config.password, config.environment);
}
