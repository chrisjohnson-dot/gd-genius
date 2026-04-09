/**
 * UPS REST Rating API v2 Rate Fetcher
 *
 * Uses the UPS REST Rating API with an OAuth Bearer token.
 * Env: UPS_REST_TOKEN — the access token from UPS Developer Portal.
 *
 * The token provided (UPSTOKEN_d34dfc04...) is a client credentials token.
 * API docs: https://developer.ups.com/api/reference?loc=en_US#tag/Rating_other
 */

import type { CarrierRateInput, CarrierRate, CarrierLabelInput, CarrierLabelResult } from "./types";

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

/**
 * Purchase a UPS shipping label via the UPS REST Shipments API v1.
 * Returns ZPL label content ready for Zebra printing.
 */
export async function buyUPSLabel(input: CarrierLabelInput): Promise<CarrierLabelResult> {
  const token = process.env.UPS_REST_TOKEN;
  if (!token) {
    return { success: false, trackingNumber: "", carrierCode: "ups", carrierName: "UPS", service: input.serviceCode, error: "UPS_REST_TOKEN not configured" };
  }

  const serviceInfo = UPS_SERVICES[input.serviceCode] ?? { label: `UPS ${input.serviceCode}`, transitDays: 5 };
  const bearerToken = token.startsWith("UPSTOKEN_") ? token.replace("UPSTOKEN_", "") : token;

  try {
    const body = {
      ShipmentRequest: {
        Request: {
          RequestOption: "nonvalidate",
          TransactionReference: { CustomerContext: input.orderNumber ?? input.referenceNum ?? "GD-Genius" },
        },
        Shipment: {
          Description: "Parcel",
          Shipper: {
            Name: input.originName,
            AttentionName: input.originCompany || input.originName,
            Phone: { Number: (input.originPhone ?? "8005551234").replace(/\D/g, "") },
            ShipperNumber: input.accountNumber || "",
            Address: {
              AddressLine: [input.originAddress1, input.originAddress2].filter(Boolean) as string[],
              City: input.originCity,
              StateProvinceCode: input.originState,
              PostalCode: input.originPostal.replace(/\D/g, "").slice(0, 5),
              CountryCode: input.originCountry || "US",
            },
          },
          ShipTo: {
            Name: input.destName,
            AttentionName: input.destCompany || input.destName,
            Phone: { Number: (input.destPhone ?? "8005551234").replace(/\D/g, "") },
            Address: {
              AddressLine: [input.destAddress1, input.destAddress2].filter(Boolean) as string[],
              City: input.destCity,
              StateProvinceCode: input.destState,
              PostalCode: input.destPostal.replace(/\D/g, "").slice(0, 5),
              CountryCode: input.destCountry || "US",
              ...(input.isResidential ? { ResidentialAddressIndicator: "" } : {}),
            },
          },
          ShipFrom: {
            Name: input.originName,
            Address: {
              AddressLine: [input.originAddress1],
              City: input.originCity,
              StateProvinceCode: input.originState,
              PostalCode: input.originPostal.replace(/\D/g, "").slice(0, 5),
              CountryCode: input.originCountry || "US",
            },
          },
          PaymentInformation: {
            ShipmentCharge: {
              Type: "01",
              BillShipper: { AccountNumber: input.accountNumber || "" },
            },
          },
          Service: { Code: input.serviceCode, Description: serviceInfo.label },
          Package: {
            Description: "Parcel",
            Packaging: { Code: "02", Description: "Package" },
            Dimensions: {
              UnitOfMeasurement: { Code: "IN" },
              Length: String(Math.ceil(input.lengthIn)),
              Width: String(Math.ceil(input.widthIn)),
              Height: String(Math.ceil(input.heightIn)),
            },
            PackageWeight: {
              UnitOfMeasurement: { Code: "LBS" },
              Weight: String(Math.max(input.weightLbs, 0.1).toFixed(1)),
            },
            ...(input.orderNumber ? { ReferenceNumber: { Code: "PO", Value: input.orderNumber } } : {}),
          },
        },
        LabelSpecification: {
          LabelImageFormat: { Code: "ZPL" },
          LabelStockSize: { Height: "6", Width: "4" },
        },
      },
    };

    const resp = await fetch(`${UPS_BASE}/api/shipments/v1/ship`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "transId": `gd-${Date.now()}`,
        "transactionSrc": "GD-Genius",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[UPS] Label API error ${resp.status}: ${errText.slice(0, 400)}`);
      return { success: false, trackingNumber: "", carrierCode: "ups", carrierName: "UPS", service: serviceInfo.label, error: `UPS API ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json() as {
      ShipmentResponse?: {
        ShipmentResults?: {
          ShipmentIdentificationNumber?: string;
          PackageResults?: { TrackingNumber?: string; ShippingLabel?: { GraphicImage?: string; ImageFormat?: { Code?: string } } } | Array<{ TrackingNumber?: string; ShippingLabel?: { GraphicImage?: string; ImageFormat?: { Code?: string } } }>;
          ShipmentCharges?: { TotalCharges?: { MonetaryValue?: string; CurrencyCode?: string } };
          ScheduledDeliveryDate?: string;
        };
      };
    };

    const results = data.ShipmentResponse?.ShipmentResults;
    const pkgResults = Array.isArray(results?.PackageResults) ? results?.PackageResults[0] : results?.PackageResults;
    const trackingNumber = pkgResults?.TrackingNumber ?? results?.ShipmentIdentificationNumber ?? "";
    const labelBase64 = pkgResults?.ShippingLabel?.GraphicImage ?? "";
    const labelFormat = ((pkgResults?.ShippingLabel?.ImageFormat?.Code ?? "ZPL").toLowerCase()) as "zpl" | "pdf";
    const labelZpl = labelFormat === "zpl" && labelBase64 ? Buffer.from(labelBase64, "base64").toString("utf-8") : undefined;
    const totalCostStr = results?.ShipmentCharges?.TotalCharges?.MonetaryValue;
    const currency = results?.ShipmentCharges?.TotalCharges?.CurrencyCode ?? "USD";

    console.log(`[UPS] Label purchased: ${trackingNumber} via ${serviceInfo.label}`);
    return { success: true, trackingNumber, carrierCode: "ups", carrierName: "UPS", service: serviceInfo.label, labelZpl, labelBase64, labelFormat, labelUrl: trackingNumber ? `https://www.ups.com/track?tracknum=${trackingNumber}` : undefined, totalCost: totalCostStr ? parseFloat(totalCostStr) : undefined, currency, estimatedDelivery: results?.ScheduledDeliveryDate };
  } catch (err) {
    console.error("[UPS] buyUPSLabel error:", err);
    return { success: false, trackingNumber: "", carrierCode: "ups", carrierName: "UPS", service: serviceInfo.label, error: err instanceof Error ? err.message : String(err) };
  }
}
