/**
 * OnTrac Rate Fetcher
 *
 * Uses the OnTrac REST API v2 with account number + password (Basic Auth).
 * Env:
 *   ONTRAC_ACCOUNT  — account number (e.g. 222873)
 *   ONTRAC_PASSWORD — API password (e.g. "a8532b71-24e9-46d6-97a7-358d421d29c2")
 *
 * OnTrac serves the Western US only (CA, AZ, CO, ID, NV, OR, UT, WA, NM, WY).
 * API docs: https://www.ontrac.com/api-documentation/
 */

import type { CarrierRateInput, CarrierRate } from "./types";

const ONTRAC_BASE = "https://www.ontrac.com/restapi";

// OnTrac service codes → human labels + typical transit days
const ONTRAC_SERVICES: Record<string, { label: string; transitDays: number }> = {
  "C": { label: "OnTrac Ground", transitDays: 3 },
  "S": { label: "OnTrac Sunrise", transitDays: 1 },
  "G": { label: "OnTrac Gold", transitDays: 2 },
};

// OnTrac only covers Western US states
const ONTRAC_STATES = new Set([
  "CA", "AZ", "CO", "ID", "NV", "OR", "UT", "WA", "NM", "WY",
]);

export async function fetchOnTracRates(input: CarrierRateInput): Promise<CarrierRate[]> {
  const account = process.env.ONTRAC_ACCOUNT;
  const password = process.env.ONTRAC_PASSWORD;

  if (!account || !password) {
    console.warn("[OnTrac] ONTRAC_ACCOUNT or ONTRAC_PASSWORD not configured — skipping OnTrac rates");
    return [];
  }

  // OnTrac only ships within the Western US
  if (input.destCountry !== "US") return [];
  if (input.destState && !ONTRAC_STATES.has(input.destState.toUpperCase())) {
    return [];
  }

  const weightOz = Math.max(Math.ceil(input.weightLbs * 16), 1);
  const basicAuth = Buffer.from(`${account}:${password}`).toString("base64");

  try {
    const params = new URLSearchParams({
      pw: password,
      packages: "1",
      weight: String(weightOz),
      from: input.originPostal.slice(0, 5),
      to: input.destPostal.slice(0, 5),
      residential: input.isResidential ? "true" : "false",
      cod: "false",
      saturday: "false",
      declared: String(input.declaredValue ?? 0),
    });

    const resp = await fetch(`${ONTRAC_BASE}/v2/rates?${params.toString()}`, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[OnTrac] Rate API error ${resp.status}: ${errText.slice(0, 200)}`);
      return [];
    }

    const data = await resp.json() as {
      Shipment?: Array<{
        ServiceCode: string;
        ServiceDescription: string;
        TotalCharge: number;
        Fuel: number;
        Residential: number;
      }>;
      Error?: string;
    };

    if (data.Error) {
      console.error(`[OnTrac] API error: ${data.Error}`);
      return [];
    }

    const rates: CarrierRate[] = [];

    for (const shipment of data.Shipment ?? []) {
      const serviceInfo = ONTRAC_SERVICES[shipment.ServiceCode] ?? {
        label: shipment.ServiceDescription ?? shipment.ServiceCode,
        transitDays: 3,
      };

      const totalCost = shipment.TotalCharge;
      if (!isFinite(totalCost) || totalCost <= 0) continue;

      const surcharges: Array<{ label: string; amount: number }> = [];
      if (shipment.Fuel > 0) surcharges.push({ label: "Fuel Surcharge", amount: shipment.Fuel });
      if (shipment.Residential > 0) surcharges.push({ label: "Residential", amount: shipment.Residential });

      rates.push({
        rateId: `ontrac_${shipment.ServiceCode.toLowerCase()}`,
        carrierCode: "ontrac",
        carrierName: "OnTrac",
        service: serviceInfo.label,
        serviceCode: shipment.ServiceCode,
        transitDays: serviceInfo.transitDays,
        totalCost: parseFloat(totalCost.toFixed(2)),
        currency: "USD",
        surcharges,
        isLive: true,
        source: "ontrac",
      });
    }

    console.log(`[OnTrac] ${rates.length} live rates for ${input.destPostal}`);
    return rates;
  } catch (err) {
    console.error("[OnTrac] fetchOnTracRates error:", err);
    return [];
  }
}
