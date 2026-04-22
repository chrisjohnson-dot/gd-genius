/**
 * Veeqo Rate Shopping API client
 *
 * API base: https://api.veeqo.com/shipping/api/v1
 * Auth: x-api-key header (same key as the Veeqo REST API)
 *
 * Flow:
 *   1. POST /rates  → get available carrier quotes (returns quotes[], remote_shipment_id, request_token)
 *   2. POST /shipments  → book a rate (returns successful[remote_shipment_id].label_content + tracking_number)
 *
 * Spec source: https://developers.veeqo.com/rate-shopping-api/ (archived Feb 7 2026)
 */

const RATE_SHOPPING_BASE = "https://api.veeqo.com/shipping/api/v1";

// ─── Address ──────────────────────────────────────────────────────────────────

export interface VeeqoAddress {
  name: string;
  company?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state_or_region: string;  // 2-letter state code e.g. "CA"
  postal_code: string;
  country_code: string;     // ISO 2-letter e.g. "US", "CA"
  phone_number?: string;
  email?: string;
}

// ─── Parcel ───────────────────────────────────────────────────────────────────

export interface VeeqoParcel {
  weight: number;           // numeric value (unit specified by weight_unit)
  weight_unit: "oz" | "lb" | "g" | "kg";
  height?: number;          // numeric value (unit specified by dimension_unit)
  width?: number;
  length?: number;
  dimension_unit?: "in" | "cm" | "ft" | "m";
  customer_reference?: string;
  contents?: string;
  estimated_value?: string;
  currency_code?: string;
}

// ─── Rates request ────────────────────────────────────────────────────────────

export interface VeeqoRateRequest {
  from_address: VeeqoAddress;
  to_address: VeeqoAddress;
  return_address?: VeeqoAddress;
  parcels: VeeqoParcel[];   // currently only 1 parcel supported
  is_amazon_order?: boolean;
  /** Amazon channel items — required when is_amazon_order is true */
  channel_items?: Array<{
    remote_id: string;      // Amazon order item ID
    quantity?: number;
    value?: string;
    currency_code?: string;
    asin?: string;
  }>;
  shipping_configuration_ids?: string[];
  include_unavailable_quotes?: boolean;
}

// ─── Rates response ───────────────────────────────────────────────────────────

export interface VeeqoShippingServiceOption {
  key: string;
  label: string;
  type: string;
  values?: Array<{ key: string; label: string }>;
}

export interface VeeqoQuote {
  carrier: string;              // e.g. "amazon_shipping_v2"
  carrier_nice_name: string;    // e.g. "Amazon Shipping"
  title: string;                // e.g. "Amazon Shipping Ground"
  code: string;                 // rate_id to use when booking — e.g. "amazon_shipping_v2-8412d3d9-..."
  total_net_charge: string;     // e.g. "9.80"
  currency_code: string;        // e.g. "USD"
  delivery_date: string | null;
  own_account: boolean;
  protected: boolean;
  protections: string[];
  charges: Array<{
    chargeId: string;
    chargeType: string;
    value: number;
  }>;
  shipping_service_options: VeeqoShippingServiceOption[];
}

export interface VeeqoRatesResponse {
  quotes: VeeqoQuote[];
  unavailable_quotes: VeeqoQuote[];
  remote_shipment_id: string;   // opaque token — pass back when booking
  request_token: string;        // validation token — pass back when booking
  expires_at: string;           // ISO datetime
  to_address_id: string;
  from_address_id: string;
}

// ─── Book request ─────────────────────────────────────────────────────────────

export interface VeeqoBookRequest {
  request_token?: string;       // from rates response (optional, for validation)
  label_format?: "PDF" | "PNG" | "ZPL" | "JPEG";
  shipments: Array<{
    remote_shipment_id: string; // from rates response
    rate_id: string;            // the `code` field from the chosen quote
    label_format?: "PDF" | "PNG" | "ZPL" | "JPEG";
    custom_messages?: string[];
    /** Optional services from shipping_service_options */
    [key: string]: unknown;
  }>;
}

// ─── Book response ────────────────────────────────────────────────────────────

export interface VeeqoBookedShipment {
  remote_shipment_id: string | null;
  tracking_number: string;
  carrier_id: string;           // e.g. "USPS"
  service_carrier: string;      // e.g. "usps"
  service_name: string;         // e.g. "USPS Ground Advantage"
  service_id: string;
  signature_type: string | null;
  label_format: string;         // "PDF" | "ZPL" | "PNG" | "JPEG"
  label_content: string;        // base64-encoded label
  total_charge: { value: number; unit: string };
  charges: Array<{ chargeId: string; chargeType: string; value: number }>;
  linked_account: boolean;
  external_shipment_id: string;
  to_address_id: string;
  from_address_id: string;
  customer_reference: string | null;
  inbound: boolean;
}

export interface VeeqoBookResponse {
  successful: Record<string, VeeqoBookedShipment>;
  failed: Record<string, { errors: string[] }>;
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
        detail =
          (Array.isArray(parsed.error_messages)
            ? parsed.error_messages.join("; ")
            : parsed.message ?? parsed.error ?? JSON.stringify(parsed));
      } catch { /* keep raw text */ }
      throw new Error(`Veeqo Rate Shopping API ${method} ${path} → ${res.status}: ${detail}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Veeqo Rate Shopping API ${method} ${path} → invalid JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  /**
   * Step 1 — Get available shipping rates for a shipment.
   *
   * Returns quotes[], remote_shipment_id, and request_token.
   * The remote_shipment_id and request_token must be passed to bookShipment.
   */
  async getRates(req: VeeqoRateRequest): Promise<VeeqoRatesResponse> {
    return this.request<VeeqoRatesResponse>("POST", "/rates", req);
  }

  /**
   * Step 2 — Book a shipping label using a previously fetched rate quote.
   *
   * Pass the remote_shipment_id and request_token from getRates(), plus the
   * `code` field of the chosen quote as rate_id.
   *
   * Returns label_content (base64 PDF/ZPL) and tracking_number.
   */
  async bookShipment(req: VeeqoBookRequest): Promise<VeeqoBookResponse> {
    return this.request<VeeqoBookResponse>("POST", "/shipments", req);
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
 * Convert lbs to oz (Veeqo uses oz for weight by default).
 */
export function lbsToOz(lbs: number): number {
  return Math.round(lbs * 16);
}
