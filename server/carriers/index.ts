/**
 * GD Genius Direct Carrier Rate Engine
 *
 * Runs all configured carrier fetchers in parallel and returns merged results.
 * Each fetcher is independent — a failure in one does not block others.
 */

import type { CarrierRateInput, CarrierRate } from "./types";
import { fetchUSPSRates } from "./usps";
import { fetchFedExRates } from "./fedex";
import { fetchUPSRates } from "./ups";
import { fetchOnTracRates } from "./ontrac";
import { fetchDHLRates } from "./dhl";

export type { CarrierRateInput, CarrierRate } from "./types";

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
      label: "FedEx",
      connected: !!(process.env.FEDEX_USER_KEY && process.env.FEDEX_PASSWORD),
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
