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

import type { CarrierRateInput, CarrierRate, CarrierLabelInput, CarrierLabelResult } from "./types";

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

/**
 * Purchase an OnTrac shipping label via the OnTrac REST API v2.
 * Returns ZPL label content ready for Zebra printing.
 * Docs: https://www.ontrac.com/api-documentation/
 */
export async function buyOnTracLabel(input: CarrierLabelInput): Promise<CarrierLabelResult> {
  const account = process.env.ONTRAC_ACCOUNT;
  const password = process.env.ONTRAC_PASSWORD;
  if (!account || !password) {
    return { success: false, trackingNumber: "", carrierCode: "ontrac", carrierName: "OnTrac", service: input.serviceCode, error: "ONTRAC_ACCOUNT or ONTRAC_PASSWORD not configured" };
  }

  const serviceInfo = ONTRAC_SERVICES[input.serviceCode] ?? { label: `OnTrac ${input.serviceCode}`, transitDays: 3 };
  const basicAuth = Buffer.from(`${account}:${password}`).toString("base64");
  const weightOz = Math.max(Math.ceil(input.weightLbs * 16), 1);

  try {
    const body = {
      Shipment: {
        Account: account,
        Shipper: input.originName,
        ShipDate: new Date().toISOString().slice(0, 10),
        ServiceCode: input.serviceCode,
        PackageType: "PACKAGE",
        Residential: input.isResidential ?? false,
        COD: false,
        CODAmount: 0,
        Saturday: false,
        Declared: input.declaredValue ?? 0,
        Reference1: input.orderNumber ?? input.referenceNum ?? "",
        Reference2: "",
        Instructions: "",
        Weight: weightOz,
        Dims: {
          Length: Math.ceil(input.lengthIn),
          Width: Math.ceil(input.widthIn),
          Height: Math.ceil(input.heightIn),
        },
        Sender: {
          Name: input.originName,
          Addr1: input.originAddress1,
          Addr2: input.originAddress2 ?? "",
          City: input.originCity,
          State: input.originState,
          Zip: input.originPostal.slice(0, 5),
          Phone: (input.originPhone ?? "8005551234").replace(/\D/g, ""),
        },
        Recipient: {
          Name: input.destName,
          Addr1: input.destAddress1,
          Addr2: input.destAddress2 ?? "",
          City: input.destCity,
          State: input.destState,
          Zip: input.destPostal.slice(0, 5),
          Phone: (input.destPhone ?? "8005551234").replace(/\D/g, ""),
        },
        LabelType: "ZPL",
      },
    };

    const resp = await fetch(`${ONTRAC_BASE}/v2/shipments`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[OnTrac] Label API error ${resp.status}: ${errText.slice(0, 400)}`);
      return { success: false, trackingNumber: "", carrierCode: "ontrac", carrierName: "OnTrac", service: serviceInfo.label, error: `OnTrac API ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json() as {
      Shipment?: {
        Tracking?: string;
        Label?: string;
        Postage?: number;
        Error?: string;
      };
      Error?: string;
    };

    if (data.Error || data.Shipment?.Error) {
      const errMsg = data.Error ?? data.Shipment?.Error ?? "OnTrac error";
      console.error(`[OnTrac] Label error: ${errMsg}`);
      return { success: false, trackingNumber: "", carrierCode: "ontrac", carrierName: "OnTrac", service: serviceInfo.label, error: errMsg };
    }

    const trackingNumber = data.Shipment?.Tracking ?? "";
    const labelBase64 = data.Shipment?.Label ?? "";
    // OnTrac returns ZPL as base64
    const labelZpl = labelBase64 ? Buffer.from(labelBase64, "base64").toString("utf-8") : undefined;

    console.log(`[OnTrac] Label purchased: ${trackingNumber} via ${serviceInfo.label}`);
    return {
      success: true,
      trackingNumber,
      carrierCode: "ontrac",
      carrierName: "OnTrac",
      service: serviceInfo.label,
      labelZpl,
      labelBase64,
      labelFormat: "zpl",
      labelUrl: trackingNumber ? `https://www.ontrac.com/trackingdetail.asp?tracking=${trackingNumber}` : undefined,
      totalCost: data.Shipment?.Postage,
      currency: "USD",
    };
  } catch (err) {
    console.error("[OnTrac] buyOnTracLabel error:", err);
    return { success: false, trackingNumber: "", carrierCode: "ontrac", carrierName: "OnTrac", service: serviceInfo.label, error: err instanceof Error ? err.message : String(err) };
  }
}
