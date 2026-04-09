/**
 * USPS eHub Rate Fetcher
 *
 * Uses the USPS eHub REST API (api.usps.com) with a Bearer JWT token.
 * Env: USPS_EHUB_API_KEY — the JWT token from the USPS eHub portal.
 *
 * API docs: https://developer.usps.com/api/68
 */

import type { CarrierRateInput, CarrierRate } from "./types";

const USPS_BASE = "https://api.usps.com";

// USPS service codes → human labels + typical transit days
const USPS_SERVICES: Record<string, { label: string; transitDays: number }> = {
  "PRIORITY_MAIL": { label: "Priority Mail", transitDays: 2 },
  "PRIORITY_MAIL_EXPRESS": { label: "Priority Mail Express", transitDays: 1 },
  "GROUND_ADVANTAGE": { label: "Ground Advantage", transitDays: 4 },
  "FIRST_CLASS_PACKAGE": { label: "First-Class Package", transitDays: 3 },
  "PARCEL_SELECT": { label: "Parcel Select", transitDays: 5 },
  "LIBRARY_MAIL": { label: "Library Mail", transitDays: 7 },
  "MEDIA_MAIL": { label: "Media Mail", transitDays: 7 },
};

function ozToLbs(oz: number): number {
  return oz / 16;
}

function lbsToOz(lbs: number): number {
  return Math.round(lbs * 16);
}

export async function fetchUSPSRates(input: CarrierRateInput): Promise<CarrierRate[]> {
  const apiKey = process.env.USPS_EHUB_API_KEY;
  if (!apiKey) {
    console.warn("[USPS] USPS_EHUB_API_KEY not configured — skipping USPS rates");
    return [];
  }

  // USPS only ships within US
  if (input.destCountry !== "US" && input.destCountry !== "") {
    return [];
  }

  const weightOz = lbsToOz(input.weightLbs);

  try {
    const body = {
      originZIPCode: input.originPostal.replace(/\D/g, "").slice(0, 5),
      destinationZIPCode: input.destPostal.replace(/\D/g, "").slice(0, 5),
      weight: ozToLbs(weightOz),
      length: input.lengthIn,
      width: input.widthIn,
      height: input.heightIn,
      mailClass: "ALL",
      processingCategory: "NON_MACHINABLE",
      destinationEntryFacilityType: "NONE",
      rateIndicator: "DR",
      priceType: "COMMERCIAL",
    };

    const resp = await fetch(`${USPS_BASE}/prices/v3/base-rates/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[USPS] Rate API error ${resp.status}: ${errText.slice(0, 200)}`);
      return [];
    }

    const data = await resp.json() as {
      rateOptions?: Array<{
        mailClass: string;
        totalBasePrice: number;
        fees?: Array<{ name: string; price: number }>;
        commitment?: { name: string; scheduleDeliveryDate: string };
      }>;
    };

    const rates: CarrierRate[] = [];

    for (const option of data.rateOptions ?? []) {
      const serviceInfo = USPS_SERVICES[option.mailClass];
      if (!serviceInfo) continue;

      const surcharges = (option.fees ?? [])
        .filter((f) => f.price > 0)
        .map((f) => ({ label: f.name, amount: f.price }));

      const totalCost = option.totalBasePrice + surcharges.reduce((s, x) => s + x.amount, 0);

      rates.push({
        rateId: `usps_${option.mailClass.toLowerCase()}`,
        carrierCode: "usps",
        carrierName: "USPS",
        service: serviceInfo.label,
        serviceCode: option.mailClass,
        transitDays: serviceInfo.transitDays,
        totalCost: parseFloat(totalCost.toFixed(2)),
        currency: "USD",
        surcharges,
        isLive: true,
        source: "usps",
      });
    }

    console.log(`[USPS] ${rates.length} live rates for ${input.destPostal}`);
    return rates;
  } catch (err) {
    console.error("[USPS] fetchUSPSRates error:", err);
    return [];
  }
}
