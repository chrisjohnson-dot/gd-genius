/**
 * GD Genius Direct Carrier Rate Engine
 *
 * Runs all configured carrier fetchers in parallel and returns merged results.
 * Each fetcher is independent — a failure in one does not block others.
 */

import type { CarrierRateInput, CarrierRate, CarrierLabelInput, CarrierLabelResult } from "./types";
import { fetchUSPSRates, buyUSPSLabel } from "./usps";
import { fetchFedExRates, buyFedExLabel } from "./fedex";
import { fetchUPSRates, buyUPSLabel } from "./ups";
import { fetchOnTracRates, buyOnTracLabel } from "./ontrac";
import { fetchDHLRates, buyDHLLabel } from "./dhl";

export type { CarrierRateInput, CarrierRate, CarrierLabelInput, CarrierLabelResult } from "./types";

/**
 * Returns true if at least one carrier API credential is configured.
 * Used to decide whether to show live vs. mock rates in the UI.
 */
export function hasAnyCarrierCredentials(): boolean {
  return !!(
    process.env.USPS_EHUB_API_KEY ||
    (process.env.FEDEX_USER_KEY && process.env.FEDEX_PASSWORD) ||
    process.env.UPS_REST_TOKEN ||
    (process.env.ONTRAC_ACCOUNT && process.env.ONTRAC_PASSWORD) ||
    (process.env.DHL_USER_KEY && process.env.DHL_PASSWORD)
  );
}

/**
 * Returns the connection status of each carrier for the settings UI.
 */
export function getCarrierConnectionStatus(): Record<string, { connected: boolean; label: string }> {
  return {
    usps: {
      label: "USPS eHub",
      connected: !!process.env.USPS_EHUB_API_KEY,
    },
    fedex: {
      label: "FedEx (REST)",
      connected: !!(process.env.FEDEX_USER_KEY && process.env.FEDEX_PASSWORD && process.env.FEDEX_ACCOUNT_NUMBER),
    },
    ups: {
      label: "UPS",
      connected: !!process.env.UPS_REST_TOKEN,
    },
    ontrac: {
      label: "OnTrac",
      connected: !!(process.env.ONTRAC_ACCOUNT && process.env.ONTRAC_PASSWORD),
    },
    dhl: {
      label: "DHL eCommerce",
      connected: !!(process.env.DHL_USER_KEY && process.env.DHL_PASSWORD),
    },
  };
}

/**
 * Fetch live rates from all configured carriers in parallel.
 * Returns an empty array if no credentials are configured.
 */
export async function fetchAllCarrierRates(input: CarrierRateInput): Promise<CarrierRate[]> {
  const fetchers: Array<() => Promise<CarrierRate[]>> = [
    () => fetchUSPSRates(input),
    () => fetchFedExRates(input),
    () => fetchUPSRates(input),
    () => fetchOnTracRates(input),
    () => fetchDHLRates(input),
  ];

  const results = await Promise.allSettled(fetchers.map((f) => f()));

  const rates: CarrierRate[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      rates.push(...result.value);
    }
    // Rejections are already logged inside each fetcher
  }

  return rates;
}

/**
 * Purchase a shipping label from a specific carrier.
 * Routes to the correct carrier buyLabel function based on carrierCode.
 * @param carrierCode  The carrier to use: 'usps' | 'fedex' | 'ups' | 'ontrac' | 'dhl' | 'dhl_express'
 */
export async function buyCarrierLabel(carrierCode: string, input: CarrierLabelInput): Promise<CarrierLabelResult> {
  const code = carrierCode.toLowerCase();

  if (code === "usps") return buyUSPSLabel(input);
  if (code === "fedex") return buyFedExLabel(input);
  if (code === "ups") return buyUPSLabel(input);
  if (code === "ontrac") return buyOnTracLabel(input);
  if (code === "dhl_express" || code === "dhl") return buyDHLLabel(input);

  return {
    success: false,
    trackingNumber: "",
    carrierCode: code,
    carrierName: code,
    service: input.serviceCode,
    error: `Unknown carrier code: ${code}`,
  };
}
