/**
 * Shared types for GD Genius direct carrier rate fetchers.
 * Each carrier module exports a fetchRates(input) function that returns CarrierRate[].
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
