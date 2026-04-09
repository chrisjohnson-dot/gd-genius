/**
 * UPS REST Rating API v2 Rate Fetcher
 *
 * Uses the UPS REST Rating API with an OAuth Bearer token.
 * Env: UPS_REST_TOKEN — the access token from UPS Developer Portal.
 *
 * The token provided (UPSTOKEN_d34dfc04...) is a client credentials token.
 * API docs: https://developer.ups.com/api/reference?loc=en_US#tag/Rating_other
 */

import type { CarrierRateInput, CarrierRate } from "./types";

const UPS_BASE = "https://onlinetools.ups.com";

// UPS service codes → human labels + typical transit days
const UPS_SERVICES: Record<string, { label: string; transitDays: number }> = {
  "03": { label: "UPS Ground", transitDays: 5 },
  "12": { label: "UPS 3 Day Select", transitDays: 3 },
  "02": { label: "UPS 2nd Day Air", transitDays: 2 },
  "59": { label: "UPS 2nd Day Air A.M.", transitDays: 2 },
  "01": { label: "UPS Next Day Air", transitDays: 1 },
  "14": { label: "UPS Next Day Air Early", transitDays: 1 },
  "13": { label: "UPS Next Day Air Saver", transitDays: 1 },
  "11": { label: "UPS Standard (Canada)", transitDays: 5 },
  "07": { label: "UPS Worldwide Express", transitDays: 2 },
  "08": { label: "UPS Worldwide Expedited", transitDays: 4 },
};

// Country code → UPS country code
function upsCountry(code: string): string {
  return code === "CA" ? "CA" : "US";
}

export async function fetchUPSRates(input: CarrierRateInput): Promise<CarrierRate[]> {
  const token = process.env.UPS_REST_TOKEN;
  if (!token) {
    console.warn("[UPS] UPS_REST_TOKEN not configured — skipping UPS rates");
    return [];
  }

  // Strip the UPSTOKEN_ prefix if present (it's a client ID prefix, not part of the bearer token)
  const bearerToken = token.startsWith("UPSTOKEN_") ? token.slice("UPSTOKEN_".length) : token;

  const weightLbs = Math.max(input.weightLbs, 0.1);

  try {
    const requestBody = {
      RateRequest: {
        Request: {
          RequestOption: "Shop", // Get all available services
          TransactionReference: { CustomerContext: "GD Genius Rate Wizard" },
        },
        Shipment: {
          Shipper: {
            Name: input.originName,
            ShipperNumber: "", // Account number — will use token auth
            Address: {
              AddressLine: [input.originAddress1],
              City: input.originCity,
              StateProvinceCode: input.originState,
              PostalCode: input.originPostal,
              CountryCode: upsCountry(input.originCountry),
            },
          },
          ShipTo: {
            Name: input.destName ?? "Recipient",
            Address: {
              AddressLine: [input.destAddress1 ?? ""],
              City: input.destCity ?? "",
              StateProvinceCode: input.destState ?? "",
              PostalCode: input.destPostal,
              CountryCode: upsCountry(input.destCountry),
              ResidentialAddressIndicator: input.isResidential ? "" : undefined,
            },
          },
          ShipFrom: {
            Name: input.originName,
            Address: {
              AddressLine: [input.originAddress1],
              City: input.originCity,
              StateProvinceCode: input.originState,
              PostalCode: input.originPostal,
              CountryCode: upsCountry(input.originCountry),
            },
          },
          Package: {
            PackagingType: { Code: "02" }, // Customer Supplied Package
            Dimensions: {
              UnitOfMeasurement: { Code: "IN" },
              Length: String(Math.ceil(input.lengthIn)),
              Width: String(Math.ceil(input.widthIn)),
              Height: String(Math.ceil(input.heightIn)),
            },
            PackageWeight: {
              UnitOfMeasurement: { Code: "LBS" },
              Weight: String(Math.ceil(weightLbs)),
            },
          },
        },
      },
    };

    const resp = await fetch(`${UPS_BASE}/api/rating/v2409/Shop`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "transId": `gdgenius-${Date.now()}`,
        "transactionSrc": "GDGenius",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(12_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[UPS] Rate API error ${resp.status}: ${errText.slice(0, 300)}`);
      return [];
    }

    const data = await resp.json() as {
      RateResponse?: {
        RatedShipment?: Array<{
          Service: { Code: string };
          TotalCharges: { MonetaryValue: string; CurrencyCode: string };
          ItemizedCharges?: Array<{ Code: string; MonetaryValue: string; Description?: string }>;
          GuaranteedDelivery?: { BusinessDaysInTransit: string };
        }>;
      };
    };

    const rates: CarrierRate[] = [];

    for (const shipment of data.RateResponse?.RatedShipment ?? []) {
      const serviceCode = shipment.Service.Code;
      const serviceInfo = UPS_SERVICES[serviceCode];
      if (!serviceInfo) continue;

      const totalCost = parseFloat(shipment.TotalCharges.MonetaryValue);
      if (!isFinite(totalCost)) continue;

      const currency = shipment.TotalCharges.CurrencyCode ?? (input.destCountry === "CA" ? "CAD" : "USD");

      const surcharges = (shipment.ItemizedCharges ?? [])
        .filter((c) => parseFloat(c.MonetaryValue) > 0)
        .map((c) => ({ label: c.Description ?? `Code ${c.Code}`, amount: parseFloat(c.MonetaryValue) }));

      const transitDays = shipment.GuaranteedDelivery?.BusinessDaysInTransit
        ? parseInt(shipment.GuaranteedDelivery.BusinessDaysInTransit, 10)
        : serviceInfo.transitDays;

      rates.push({
        rateId: `ups_${serviceCode}`,
        carrierCode: "ups",
        carrierName: "UPS",
        service: serviceInfo.label,
        serviceCode,
        transitDays: isFinite(transitDays) ? transitDays : serviceInfo.transitDays,
        totalCost: parseFloat(totalCost.toFixed(2)),
        currency,
        surcharges,
        isLive: true,
        source: "ups",
      });
    }

    console.log(`[UPS] ${rates.length} live rates for ${input.destPostal}`);
    return rates;
  } catch (err) {
    console.error("[UPS] fetchUPSRates error:", err);
    return [];
  }
}
