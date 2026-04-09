/**
 * DHL eCommerce Rate Fetcher
 *
 * Uses the DHL eCommerce Solutions API with client ID + secret (OAuth2).
 * Env:
 *   DHL_USER_KEY  — client ID / user key (e.g. "GND_XXXXXXXX")
 *   DHL_PASSWORD  — client secret / password
 *
 * API docs: https://developer.dhl.com/api-reference/dhl-ecommerce-solutions-americas
 */

import type { CarrierRateInput, CarrierRate } from "./types";

const DHL_BASE = "https://api.dhlecs.com";

// DHL eCommerce service codes → human labels + typical transit days
const DHL_SERVICES: Record<string, { label: string; transitDays: number }> = {
  "GND": { label: "DHL eCommerce Ground", transitDays: 5 },
  "EXP": { label: "DHL eCommerce Expedited", transitDays: 3 },
  "EXP2": { label: "DHL eCommerce Expedited Max", transitDays: 2 },
  "PLT": { label: "DHL eCommerce Parcel Plus Ground", transitDays: 5 },
  "PLTE": { label: "DHL eCommerce Parcel Plus Expedited", transitDays: 3 },
  "PLTE2": { label: "DHL eCommerce Parcel Plus Expedited Max", transitDays: 2 },
  "BPM": { label: "DHL eCommerce BPM Ground", transitDays: 7 },
  "BPME": { label: "DHL eCommerce BPM Expedited", transitDays: 5 },
};

let _dhlToken: { token: string; expiresAt: number } | null = null;

async function getDHLToken(clientId: string, clientSecret: string): Promise<string | null> {
  // Reuse cached token if still valid (with 60s buffer)
  if (_dhlToken && Date.now() < _dhlToken.expiresAt - 60_000) {
    return _dhlToken.token;
  }

  try {
    const resp = await fetch(`${DHL_BASE}/auth/v4/accesstoken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[DHL] Token error ${resp.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json() as {
      access_token: string;
      expires_in: number;
    };

    _dhlToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    return _dhlToken.token;
  } catch (err) {
    console.error("[DHL] getDHLToken error:", err);
    return null;
  }
}

export async function fetchDHLRates(input: CarrierRateInput): Promise<CarrierRate[]> {
  const clientId = process.env.DHL_USER_KEY;
  const clientSecret = process.env.DHL_PASSWORD;

  if (!clientId || !clientSecret) {
    console.warn("[DHL] DHL_USER_KEY or DHL_PASSWORD not configured — skipping DHL rates");
    return [];
  }

  const token = await getDHLToken(clientId, clientSecret);
  if (!token) return [];

  const weightOz = Math.max(Math.ceil(input.weightLbs * 16), 1);

  try {
    const body = {
      pickupAccount: clientId,
      distributionCenter: "USRDU1",
      originCountry: input.originCountry || "US",
      originPostalCode: input.originPostal.slice(0, 5),
      destinationCountry: input.destCountry || "US",
      destinationPostalCode: input.destPostal.slice(0, 5),
      weight: weightOz,
      weightUom: "oz",
      length: Math.ceil(input.lengthIn),
      width: Math.ceil(input.widthIn),
      height: Math.ceil(input.heightIn),
      dimensionUom: "in",
      packageDescription: "Package",
      mailClass: "ALL",
    };

    const resp = await fetch(`${DHL_BASE}/shipping/v4/rates`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[DHL] Rate API error ${resp.status}: ${errText.slice(0, 300)}`);
      return [];
    }

    const data = await resp.json() as {
      rates?: Array<{
        mailClass: string;
        totalPrice: number;
        currency: string;
        transitDays?: number;
        fees?: Array<{ name: string; price: number }>;
      }>;
    };

    const rates: CarrierRate[] = [];

    for (const rate of data.rates ?? []) {
      const serviceInfo = DHL_SERVICES[rate.mailClass] ?? {
        label: `DHL ${rate.mailClass}`,
        transitDays: 5,
      };

      const totalCost = rate.totalPrice;
      if (!isFinite(totalCost) || totalCost <= 0) continue;

      const surcharges = (rate.fees ?? [])
        .filter((f) => f.price > 0)
        .map((f) => ({ label: f.name, amount: f.price }));

      rates.push({
        rateId: `dhl_${rate.mailClass.toLowerCase()}`,
        carrierCode: "dhl_express",
        carrierName: "DHL eCommerce",
        service: serviceInfo.label,
        serviceCode: rate.mailClass,
        transitDays: rate.transitDays ?? serviceInfo.transitDays,
        totalCost: parseFloat(totalCost.toFixed(2)),
        currency: rate.currency ?? "USD",
        surcharges,
        isLive: true,
        source: "dhl",
      });
    }

    console.log(`[DHL] ${rates.length} live rates for ${input.destPostal}`);
    return rates;
  } catch (err) {
    console.error("[DHL] fetchDHLRates error:", err);
    return [];
  }
}
