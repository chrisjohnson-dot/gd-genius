/**
 * Shipwell TMS API Client
 *
 * Handles authentication (token-based) and purchase order creation
 * for both sandbox and production environments.
 *
 * Docs: https://shipwell.redoc.ly/docs/get-connected/authentication/
 * PO:   https://shipwell.redoc.ly/openapi_pages/backend-core/tag/purchase-orders/paths/~1purchase-orders~1/post/
 */

import axios, { type AxiosInstance } from "axios";

// ─── Environment base URLs ────────────────────────────────────────────────────
const BASE_URLS = {
  sandbox:    "https://sandbox-api.shipwell.com",
  production: "https://api.shipwell.com",
} as const;

export type ShipwellEnvironment = keyof typeof BASE_URLS;

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
}

export interface CreatePurchaseOrderInput {
  order_number: string;
  purchase_order_number?: string | null;
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

// ─── Client class ─────────────────────────────────────────────────────────────
export class ShipwellClient {
  private http: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;

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
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  /** Authenticate and cache the token. Tokens are valid for ~24h; we refresh after 23h. */
  async authenticate(): Promise<string> {
    // Return cached token if still valid (with 5-minute buffer)
    if (this.token && this.tokenExpiresAt && this.tokenExpiresAt > new Date(Date.now() + 5 * 60_000)) {
      return this.token;
    }

    const res = await this.http.post<{ token: string; api_key: string | null }>("/v2/auth/token/", {
      email: this.email,
      password: this.password,
    });

    this.token = res.data.token;
    // Shipwell tokens last ~24h; cache for 23h
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
    const host = this.environment === "production"
      ? "app.shipwell.com"
      : "sandbox.shipwell.com";
    return `https://${host}/purchase-orders/${poId}`;
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
