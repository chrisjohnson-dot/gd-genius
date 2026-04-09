/**
 * Shared types for GD Genius direct carrier rate fetchers and label buyers.
 * Each carrier module exports:
 *   fetchRates(input)  → CarrierRate[]
 *   buyLabel(input)    → CarrierLabelResult
 */

export interface CarrierRateInput {
  /** Origin */
  originName: string;
  originAddress1: string;
  originCity: string;
  originState: string;
  originPostal: string;
  originCountry: string; // "US" | "CA"

  /** Destination */
  destName?: string;
  destAddress1?: string;
  destCity?: string;
  destState?: string;
  destPostal: string;
  destCountry: string; // "US" | "CA"
  isResidential?: boolean;

  /** Package */
  weightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;

  /** Options */
  declaredValue?: number;
  requireSignature?: boolean;
}

export interface CarrierRateSurcharge {
  label: string;
  amount: number;
}

export interface CarrierRate {
  rateId: string;
  carrierCode: string;
  carrierName: string;
  service: string;
  serviceCode: string;
  transitDays: number;
  totalCost: number;
  currency: string;
  surcharges: CarrierRateSurcharge[];
  /** true = live negotiated rate from carrier API; false = estimated/mock */
  isLive: boolean;
  /** Source carrier for display */
  source: "usps" | "fedex" | "ups" | "ontrac" | "dhl";
}

/** Carrier fetcher function signature */
export type CarrierFetcher = (input: CarrierRateInput) => Promise<CarrierRate[]>;

// ─── Label Purchase Types ─────────────────────────────────────────────────────

/** Input for purchasing a shipping label from a direct carrier */
export interface CarrierLabelInput {
  /** Origin */
  originName: string;
  originCompany?: string;
  originAddress1: string;
  originAddress2?: string;
  originCity: string;
  originState: string;
  originPostal: string;
  originCountry: string; // "US" | "CA"
  originPhone?: string;

  /** Destination */
  destName: string;
  destCompany?: string;
  destAddress1: string;
  destAddress2?: string;
  destCity: string;
  destState: string;
  destPostal: string;
  destCountry: string; // "US" | "CA"
  destPhone?: string;
  isResidential?: boolean;

  /** Package */
  weightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;

  /** Service selection — carrier-specific service code from rate response */
  serviceCode: string;

  /** Optional */
  declaredValue?: number;
  requireSignature?: boolean;
  /** Order reference printed on label */
  referenceNum?: string;
  orderNumber?: string;

  /** Carrier-specific account overrides (from carrier_accounts table) */
  accountNumber?: string;   // FedEx / UPS account number
  meterNumber?: string;     // FedEx meter number
  pickupAccount?: string;   // DHL pickup account
  distributionCenter?: string; // DHL distribution center
}

/** Result from purchasing a shipping label */
export interface CarrierLabelResult {
  success: boolean;
  trackingNumber: string;
  carrierCode: string;
  carrierName: string;
  service: string;
  /** Raw ZPL string ready to send to Zebra printer */
  labelZpl?: string;
  /** Base64-encoded label content (ZPL or PDF) */
  labelBase64?: string;
  /** Label format: 'zpl' | 'pdf' | 'png' */
  labelFormat?: string;
  /** Public URL to label PDF if available */
  labelUrl?: string;
  /** Estimated delivery date (ISO string) */
  estimatedDelivery?: string;
  /** Cost charged */
  totalCost?: number;
  currency?: string;
  /** Error message if success=false */
  error?: string;
}

/** Carrier label buyer function signature */
export type CarrierLabelBuyer = (input: CarrierLabelInput) => Promise<CarrierLabelResult>;
