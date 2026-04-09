/**
 * Veeqo Rate Shopping API client
 *
 * API base: https://app.veeqo.com/shipping/api/v1
 * Auth: x-api-key header (same key as the Veeqo REST API)
 *
 * Flow:
 *   1. POST /rates  → get available carrier rates (returns remote_shipment_id + request_token per rate)
 *   2. POST /shipments  → book a rate (returns tracking_number + label_content as base64 ZPL/PDF)
 */

const RATE_SHOPPING_BASE = "https://app.veeqo.com/shipping/api/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VeeqoAddress {
  name: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string; // ISO 2-letter e.g. "US", "CA"
  phone?: string;
  email?: string;
  is_residential?: boolean;
}

export interface VeeqoPackage {
  weight: number;        // in oz
  length: number;        // in inches
  width: number;         // in inches
  height: number;        // in inches
}

export interface VeeqoRateRequest {
  ship_from: VeeqoAddress;
  ship_to: VeeqoAddress;
  packages: VeeqoPackage[];
  /** Optional: restrict to specific carrier account IDs */
  shipping_configuration_ids?: number[];
}

export interface VeeqoRate {
  code: string;               // rate identifier (used as rate_id when booking)
  carrier: string;            // e.g. "amazon_shipping_v2", "ups", "fedex"
  title: string;              // human-readable service name e.g. "UPS Ground"
  short_title: string;
  total_net_charge: string;   // e.g. "9.80"
  total_gross_charge: string;
  base_rate: string;
  currency: string;           // e.g. "USD"
  remote_shipment_id: string; // opaque token needed to book this rate
  request_token: string;      // request-level token (same for all rates in a response)
  expected_delivery_days: number | null;
  sub_carrier_id: string;     // e.g. "UPS"
  service_carrier: string;    // e.g. "ups"
  charges: Array<{
    price: string;
    charge_id: string;
    charge_title: string;
    charge_type: "MANDATORY" | "OPTIONAL";
  }>;
  cutoff: string | null;
  mailpiece_shapes: string[] | null;
  liability_amount: string | null;
}

export interface VeeqoRatesResponse {
  available: VeeqoRate[];
  request_token: string;
}

export interface VeeqoBookRequest {
  rate_id: string;            // the `code` from the selected rate
  remote_shipment_id: string; // from the selected rate
  request_token: string;      // from the rates response
  /** Optional: Veeqo order allocation_id to link the shipment to an order */
  allocation_id?: number;
  /** Notify customer by email */
  notify_customer?: boolean;
  /** Optional: declared value for insurance */
  declared_value?: number;
  /** Optional: require signature */
  require_signature?: boolean;
}

export interface VeeqoBookResponse {
  id: string;                 // Veeqo shipment ID
  tracking_number: string;
  carrier: string;
  service: string;
  label_content: string;      // base64-encoded label (ZPL or PDF depending on carrier)
  label_format: "zpl" | "pdf" | string;
  status: string;
  created_at: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class VeeqoRateShoppingClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${RATE_SHOPPING_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.message ?? parsed.error ?? JSON.stringify(parsed);
      } catch { /* keep raw text */ }
      throw new Error(`Veeqo API ${method} ${path} → ${res.status}: ${detail}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Veeqo API ${method} ${path} → invalid JSON response: ${text.slice(0, 200)}`);
    }
  }

  /**
   * Get available shipping rates for a shipment.
   * Returns all available rates with their remote_shipment_id and request_token.
   */
  async getRates(req: VeeqoRateRequest): Promise<VeeqoRatesResponse> {
    return this.request<VeeqoRatesResponse>("POST", "/rates", req);
  }

  /**
   * Book a shipping label using a previously fetched rate.
   * Returns the tracking number and base64-encoded label content.
   */
  async bookShipment(req: VeeqoBookRequest): Promise<VeeqoBookResponse> {
    return this.request<VeeqoBookResponse>("POST", "/shipments", {
      rate_id: req.rate_id,
      remote_shipment_id: req.remote_shipment_id,
      request_token: req.request_token,
      allocation_id: req.allocation_id,
      notify_customer: req.notify_customer ?? false,
      declared_value: req.declared_value,
      require_signature: req.require_signature ?? false,
    });
  }
}

/**
 * Create a Veeqo Rate Shopping API client from the environment.
 * Throws if VEEQO_API_KEY is not set.
 */
export function createVeeqoClient(): VeeqoRateShoppingClient {
  const apiKey = process.env.VEEQO_API_KEY;
  if (!apiKey) {
    throw new Error("VEEQO_API_KEY environment variable is not set");
  }
  return new VeeqoRateShoppingClient(apiKey);
}

/**
 * Convert lbs to oz (Veeqo uses oz for weight).
 */
export function lbsToOz(lbs: number): number {
  return Math.round(lbs * 16);
}

/**
 * Map a US/CA state abbreviation to full name (Veeqo may require full names).
 * Returns the input unchanged if not found.
 */
export function normalizeState(state: string): string {
  // Veeqo accepts standard 2-letter state codes — return as-is
  return state.toUpperCase();
}
