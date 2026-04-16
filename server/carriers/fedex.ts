/**
 * FedEx Rate Fetcher — REST API (v1)
 *
 * Uses FedEx REST API with OAuth2 client credentials.
 * Env:
 *   FEDEX_USER_KEY       — REST API client_id
 *   FEDEX_PASSWORD       — REST API client_secret
 *   FEDEX_ACCOUNT_NUMBER — FedEx billing account number (required for negotiated rates)
 *
 * API: https://developer.fedex.com/api/en-us/catalog/rate/v1/docs.html
 */

import type { CarrierRateInput, CarrierRate, CarrierLabelInput, CarrierLabelResult } from "./types";

const FEDEX_BASE = "https://apis.fedex.com";

// FedEx service types → human labels + typical transit days
const FEDEX_SERVICES: Record<string, { label: string; transitDays: number }> = {
  // ── Standard services (YOUR_PACKAGING) ────────────────────────────────────
  FEDEX_GROUND:                         { label: "FedEx Ground",                          transitDays: 5 },
  GROUND_HOME_DELIVERY:                 { label: "FedEx Home Delivery",                   transitDays: 5 },
  FEDEX_EXPRESS_SAVER:                  { label: "FedEx Express Saver",                   transitDays: 3 },
  FEDEX_2_DAY:                          { label: "FedEx 2Day",                            transitDays: 2 },
  FEDEX_2_DAY_AM:                       { label: "FedEx 2Day A.M.",                       transitDays: 2 },
  STANDARD_OVERNIGHT:                   { label: "FedEx Standard Overnight",              transitDays: 1 },
  PRIORITY_OVERNIGHT:                   { label: "FedEx Priority Overnight",              transitDays: 1 },
  FIRST_OVERNIGHT:                      { label: "FedEx First Overnight",                 transitDays: 1 },
  INTERNATIONAL_ECONOMY:                { label: "FedEx International Economy",           transitDays: 5 },
  INTERNATIONAL_PRIORITY:               { label: "FedEx International Priority",          transitDays: 2 },
  FEDEX_INTERNATIONAL_GROUND:           { label: "FedEx International Ground",            transitDays: 5 },
  // ── One Rate services (require FEDEX_SMALL_BOX / MEDIUM_BOX / etc. packaging) ──
  FEDEX_GROUND_HOME_DELIVERY_ONE_RATE:  { label: "FedEx Ground One Rate",                 transitDays: 5 },
  FEDEX_EXPRESS_SAVER_ONE_RATE:         { label: "FedEx Express Saver One Rate",          transitDays: 3 },
  FEDEX_2_DAY_ONE_RATE:                 { label: "FedEx 2Day One Rate",                   transitDays: 2 },
  FEDEX_2_DAY_AM_ONE_RATE:              { label: "FedEx 2Day A.M. One Rate",              transitDays: 2 },
  STANDARD_OVERNIGHT_ONE_RATE:          { label: "FedEx Standard Overnight One Rate",     transitDays: 1 },
  PRIORITY_OVERNIGHT_ONE_RATE:          { label: "FedEx Priority Overnight One Rate",     transitDays: 1 },
  FIRST_OVERNIGHT_ONE_RATE:             { label: "FedEx First Overnight One Rate",        transitDays: 1 },
};

/** One Rate service codes — require a FedEx-supplied box packaging type */
const FEDEX_ONE_RATE_SERVICE_CODES = new Set([
  "FEDEX_GROUND_HOME_DELIVERY_ONE_RATE",
  "FEDEX_EXPRESS_SAVER_ONE_RATE",
  "FEDEX_2_DAY_ONE_RATE",
  "FEDEX_2_DAY_AM_ONE_RATE",
  "STANDARD_OVERNIGHT_ONE_RATE",
  "PRIORITY_OVERNIGHT_ONE_RATE",
  "FIRST_OVERNIGHT_ONE_RATE",
]);

/**
 * FedEx One Rate packaging types to request rates for.
 * We use FEDEX_SMALL_BOX as the representative type — FedEx returns all
 * eligible One Rate service codes regardless of which box size is specified.
 */
const FEDEX_ONE_RATE_PACKAGING_TYPES = ["FEDEX_SMALL_BOX", "FEDEX_MEDIUM_BOX"];

/**
 * FedEx REST Rate API returns the same service codes (e.g. FEDEX_2_DAY) for
 * both standard and One Rate requests — the pricing differs based on packagingType.
 * This map renames standard codes → One Rate codes when a FedEx box is used.
 */
const STANDARD_TO_ONE_RATE: Record<string, string> = {
  GROUND_HOME_DELIVERY:   "FEDEX_GROUND_HOME_DELIVERY_ONE_RATE",
  FEDEX_EXPRESS_SAVER:    "FEDEX_EXPRESS_SAVER_ONE_RATE",
  FEDEX_2_DAY:            "FEDEX_2_DAY_ONE_RATE",
  FEDEX_2_DAY_AM:         "FEDEX_2_DAY_AM_ONE_RATE",
  STANDARD_OVERNIGHT:     "STANDARD_OVERNIGHT_ONE_RATE",
  PRIORITY_OVERNIGHT:     "PRIORITY_OVERNIGHT_ONE_RATE",
  FIRST_OVERNIGHT:        "FIRST_OVERNIGHT_ONE_RATE",
};

// Simple in-memory token cache keyed by clientId (valid for ~55 min)
const _tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  const cached = _tokenCache.get(clientId);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }
  const res = await fetch(`${FEDEX_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FedEx token error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  _tokenCache.set(clientId, { token: data.access_token, expiresAt: now + data.expires_in * 1000 });
  return data.access_token;
}

type FedExRateReply = {
  output?: { rateReplyDetails?: Array<{
    serviceType: string;
    ratedShipmentDetails?: Array<{
      totalNetCharge: number;
      currency?: string;
      shipmentRateDetail?: { surCharges?: Array<{ description: string; amount: { amount: number } }> };
    }>;
    operationalDetail?: { transitDays?: string; deliveryDay?: string };
  }> };
  errors?: Array<{ code: string; message: string }>;
};

const TRANSIT_WORD_MAP: Record<string, number> = {
  ONE_DAY: 1, TWO_DAYS: 2, THREE_DAYS: 3, FOUR_DAYS: 4,
  FIVE_DAYS: 5, SIX_DAYS: 6, SEVEN_DAYS: 7, EIGHT_DAYS: 8,
};

function buildBaseShipment(input: CarrierRateInput, accountNumber: string) {
  return {
    shipper: {
      address: {
        streetLines: ["1 Main St"],
        city: input.originCity,
        stateOrProvinceCode: input.originState,
        postalCode: input.originPostal,
        countryCode: input.originCountry || "US",
      },
    },
    recipient: {
      address: {
        streetLines: ["1 Main St"],
        city: input.destCity ?? "",
        stateOrProvinceCode: input.destState ?? "",
        postalCode: input.destPostal,
        countryCode: input.destCountry || "US",
        residential: input.isResidential ?? false,
      },
    },
    pickupType: "DROPOFF_AT_FEDEX_LOCATION",
    rateRequestType: accountNumber ? ["ACCOUNT", "LIST"] : ["LIST"],
    requestedPackageLineItems: [{
      weight: { units: "LB", value: Math.max(input.weightLbs, 0.1) },
      dimensions: {
        length: Math.ceil(input.lengthIn),
        width: Math.ceil(input.widthIn),
        height: Math.ceil(input.heightIn),
        units: "IN",
      },
    }],
  };
}

const FEDEX_ONE_RATE_PACKAGING_SET = new Set(FEDEX_ONE_RATE_PACKAGING_TYPES);

async function fetchRatesForPackaging(
  token: string,
  accountNumber: string,
  input: CarrierRateInput,
  packagingType?: string,
): Promise<CarrierRate[]> {
  const baseShipment = buildBaseShipment(input, accountNumber);
  let requestedShipment: Record<string, unknown>;
  if (packagingType && FEDEX_ONE_RATE_PACKAGING_SET.has(packagingType)) {
    // One Rate pricing is flat — omit dimensions to prevent dim weight inflation.
    // FedEx One Rate is priced by box type, not by weight or dimensions.
    const { requestedPackageLineItems: _ignored, ...shipmentBase } = baseShipment;
    requestedShipment = {
      ...shipmentBase,
      packagingType,
      requestedPackageLineItems: [{
        weight: { units: "LB", value: Math.max(input.weightLbs, 0.1) },
      }],
    };
  } else {
    requestedShipment = packagingType
      ? { ...baseShipment, packagingType }
      : baseShipment;
  }

  const payload = {
    accountNumber: accountNumber ? { value: accountNumber } : undefined,
    requestedShipment,
  };

  const res = await fetch(`${FEDEX_BASE}/rate/v1/rates/quotes`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-locale": "en_US",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json() as FedExRateReply;

  if (data.errors?.length) {
    // One Rate requests may return errors for ineligible routes — not fatal
    console.warn(`[FedEx] Rate API warnings (${packagingType ?? "YOUR_PACKAGING"}):`,
      data.errors.map(e => `${e.code}: ${e.message}`).join("; "));
    return [];
  }

  const replyDetails = data.output?.rateReplyDetails ?? [];
  const rates: CarrierRate[] = [];

  for (const detail of replyDetails) {
    const serviceType = detail.serviceType;
    const serviceInfo = FEDEX_SERVICES[serviceType];
    if (!serviceInfo) continue;

    const rateDetail = detail.ratedShipmentDetails?.[0];
    if (!rateDetail) continue;

    const totalCost = rateDetail.totalNetCharge;
    if (!isFinite(totalCost) || totalCost <= 0) continue;

    const currency = rateDetail.currency ?? "USD";
    const transitStr = detail.operationalDetail?.transitDays ?? "";
    const transitDays =
      TRANSIT_WORD_MAP[transitStr] !== undefined
        ? TRANSIT_WORD_MAP[transitStr]
        : (isFinite(parseInt(transitStr, 10)) ? parseInt(transitStr, 10) : serviceInfo.transitDays);

    const surcharges = (rateDetail.shipmentRateDetail?.surCharges ?? []).map(s => ({
      label: s.description,
      amount: s.amount?.amount ?? 0,
    })).filter(s => s.amount > 0);

    // When packaging is a FedEx box, remap service code to the One Rate variant
    const isOneRatePackaging = packagingType && FEDEX_ONE_RATE_PACKAGING_TYPES.includes(packagingType);
    const effectiveServiceCode = isOneRatePackaging
      ? (STANDARD_TO_ONE_RATE[serviceType] ?? serviceType)
      : serviceType;
    const effectiveServiceInfo = FEDEX_SERVICES[effectiveServiceCode] ?? serviceInfo;
    const rateIdSuffix = isOneRatePackaging ? "_one_rate" : "";
    rates.push({
      rateId: `fedex_${effectiveServiceCode.toLowerCase()}${rateIdSuffix}`,
      carrierCode: "fedex",
      carrierName: "FedEx",
      service: effectiveServiceInfo.label,
      serviceCode: effectiveServiceCode,
      transitDays: isFinite(transitDays) ? transitDays : serviceInfo.transitDays,
      totalCost: parseFloat(totalCost.toFixed(2)),
      currency,
      surcharges,
      isLive: true,
      source: "fedex",
    });
  }

  return rates;
}

export async function fetchFedExRates(input: CarrierRateInput): Promise<CarrierRate[]> {
  // All FedEx operations use the One Rate account (942412380) exclusively.
  // FEDEX_ONE_RATE_USER_KEY / FEDEX_ONE_RATE_PASSWORD / FEDEX_ONE_RATE_ACCOUNT_NUMBER are the
  // authoritative credentials; the legacy FEDEX_USER_KEY / FEDEX_PASSWORD are NOT used.
  const clientId = process.env.FEDEX_ONE_RATE_USER_KEY;
  const clientSecret = process.env.FEDEX_ONE_RATE_PASSWORD;
  const accountNumber = process.env.FEDEX_ONE_RATE_ACCOUNT_NUMBER ?? "";

  if (!clientId || !clientSecret) {
    console.warn("[FedEx] FEDEX_ONE_RATE_USER_KEY or FEDEX_ONE_RATE_PASSWORD not configured — skipping FedEx rates");
    return [];
  }

  // One Rate and standard rates both use the same account (942412380)
  const oneRateClientId = clientId;
  const oneRateClientSecret = clientSecret;
  const oneRateAccountNumber = accountNumber;

  try {
    const token = await getAccessToken(clientId, clientSecret);

    // ── 1. Standard rates (YOUR_PACKAGING) ──────────────────────────────────
    const standardRates = await fetchRatesForPackaging(token, accountNumber, input);

    // ── 2. One Rate rates — same account, different packaging types ──────────
    const oneRateToken = token;
    const oneRateRequests = FEDEX_ONE_RATE_PACKAGING_TYPES.map(pkg =>
      fetchRatesForPackaging(oneRateToken, oneRateAccountNumber, input, pkg).catch(() => [] as CarrierRate[])
    );
    const oneRateResults = await Promise.all(oneRateRequests);

    // Flatten and deduplicate One Rate results by serviceCode (keep cheapest)
    const oneRateByService = new Map<string, CarrierRate>();
    for (const batch of oneRateResults) {
      for (const rate of batch) {
        if (!FEDEX_ONE_RATE_SERVICE_CODES.has(rate.serviceCode)) continue;
        const existing = oneRateByService.get(rate.serviceCode);
        if (!existing || rate.totalCost < existing.totalCost) {
          // Normalise rateId — strip the _one_rate suffix added in fetchRatesForPackaging
          oneRateByService.set(rate.serviceCode, {
            ...rate,
            rateId: `fedex_${rate.serviceCode.toLowerCase()}`,
          });
        }
      }
    }

    const allRates = [...standardRates, ...Array.from(oneRateByService.values())];
    console.log(`[FedEx] ${allRates.length} live REST rates for ${input.destPostal} (${standardRates.length} standard + ${oneRateByService.size} One Rate)`);
    return allRates;
  } catch (err) {
    console.error("[FedEx] fetchFedExRates error:", err);
    return [];
  }
}

/**
 * Purchase a FedEx shipping label via FedEx REST API Ship v1.
 * Returns ZPL label content ready for Zebra printing.
 * Automatically uses the correct packagingType for One Rate services.
 */
export async function buyFedExLabel(input: CarrierLabelInput): Promise<CarrierLabelResult> {
  const serviceCode = input.serviceCode ?? "FEDEX_GROUND";
  const isOneRate = FEDEX_ONE_RATE_SERVICE_CODES.has(serviceCode);

  // Use dedicated One Rate credentials when available and the service is One Rate
  const stdClientId = process.env.FEDEX_USER_KEY;
  const stdClientSecret = process.env.FEDEX_PASSWORD;
  const stdAccountNumber = process.env.FEDEX_ACCOUNT_NUMBER ?? "";

  // All FedEx label purchases use account 942412380 (One Rate credentials) exclusively.
  // The standard 620 account is only for non-FedEx carriers.
  const clientId = process.env.FEDEX_ONE_RATE_USER_KEY || stdClientId;
  const clientSecret = process.env.FEDEX_ONE_RATE_PASSWORD || stdClientSecret;
  const accountNumber = process.env.FEDEX_ONE_RATE_ACCOUNT_NUMBER || stdAccountNumber;

  if (!clientId || !clientSecret || !accountNumber) {
    return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: "", error: "FedEx REST credentials not configured (FEDEX_USER_KEY, FEDEX_PASSWORD, FEDEX_ACCOUNT_NUMBER required)" };
  }

  console.log(`[FedEx] buyFedExLabel: service=${serviceCode} isOneRate=${isOneRate} account=${accountNumber} clientId=${clientId?.slice(0,8)}...`);

  // One Rate services require a FedEx-supplied box packaging type.
  // Default to FEDEX_SMALL_BOX for One Rate; use YOUR_PACKAGING for standard services.
  const packagingType = isOneRate ? "FEDEX_SMALL_BOX" : "YOUR_PACKAGING";

  try {
    const token = await getAccessToken(clientId, clientSecret);

    const shipPayload = {
      labelResponseOptions: "LABEL",
      requestedShipment: {
        shipper: {
          contact: { personName: input.originName ?? "Shipper", phoneNumber: input.originPhone ?? "5555555555" },
          address: {
            streetLines: [input.originAddress1 ?? "1 Main St"],
            city: input.originCity ?? "",
            stateOrProvinceCode: input.originState ?? "",
            postalCode: input.originPostal ?? "",
            countryCode: input.originCountry ?? "US",
          },
        },
        recipients: [{
          contact: { personName: input.destName ?? "Recipient", phoneNumber: input.destPhone ?? "5555555555" },
          address: {
            streetLines: [input.destAddress1 ?? "1 Main St"],
            city: input.destCity ?? "",
            stateOrProvinceCode: input.destState ?? "",
            postalCode: input.destPostal ?? "",
            countryCode: input.destCountry ?? "US",
            residential: input.isResidential ?? false,
          },
        }],
        shipDatestamp: new Date().toISOString().split("T")[0],
        serviceType: serviceCode,
        packagingType,
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        shippingChargesPayment: {
          paymentType: "SENDER",
          payor: { responsibleParty: { accountNumber: { value: accountNumber } } },
        },
        labelSpecification: { labelFormatType: "COMMON2D", imageType: "ZPLII", labelStockType: "PAPER_4X6" },
        requestedPackageLineItems: [{
          weight: { units: "LB", value: Math.max(input.weightLbs, 0.1) },
          // One Rate does not require dimensions, but we include them for accuracy
          dimensions: {
            length: Math.ceil(input.lengthIn),
            width: Math.ceil(input.widthIn),
            height: Math.ceil(input.heightIn),
            units: "IN",
          },
        }],
      },
      accountNumber: { value: accountNumber },
    };

    const res = await fetch(`${FEDEX_BASE}/ship/v1/shipments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-locale": "en_US",
      },
      body: JSON.stringify(shipPayload),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json() as {
      output?: { transactionShipments?: Array<{
        masterTrackingNumber?: string;
        pieceResponses?: Array<{ packageDocuments?: Array<{ encodedLabel?: string }> }>;
      }> };
      errors?: Array<{ code: string; message: string }>;
    };

    console.log(`[FedEx] ship API response status=${res.status} body=`, JSON.stringify(data).slice(0, 1000));

    if (data.errors?.length) {
      const msg = data.errors.map(e => `${e.code}: ${e.message}`).join("; ");
      console.error(`[FedEx] label purchase failed: ${msg}`);
      return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: serviceCode, error: msg };
    }

    const shipment = data.output?.transactionShipments?.[0];
    const trackingNumber = shipment?.masterTrackingNumber ?? "";
    const encodedLabel = shipment?.pieceResponses?.[0]?.packageDocuments?.[0]?.encodedLabel ?? "";

    if (!encodedLabel) {
      return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: serviceCode, error: "No label returned from FedEx REST API" };
    }

    return {
      success: true,
      trackingNumber,
      carrierCode: "fedex",
      carrierName: "FedEx",
      service: serviceCode,
      labelBase64: encodedLabel,
      labelFormat: "ZPL",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, trackingNumber: "", carrierCode: "fedex", carrierName: "FedEx", service: serviceCode, error: `FedEx label error: ${msg}` };
  }
}

/**
 * Void a FedEx shipment via the FedEx REST Cancel Shipment API.
 * Must be called before carrier pickup (typically same business day).
 *
 * @param trackingNumber  - Master tracking number returned at label creation
 * @returns { success, message } — success=true means FedEx accepted the void
 */
export async function voidFedExLabel(
  trackingNumber: string,
): Promise<{ success: boolean; message: string }> {
  const clientId = process.env.FEDEX_USER_KEY;
  const clientSecret = process.env.FEDEX_PASSWORD;
  const accountNumber = process.env.FEDEX_ACCOUNT_NUMBER ?? "";

  if (!clientId || !clientSecret || !accountNumber) {
    return { success: false, message: "FedEx REST credentials not configured (FEDEX_USER_KEY, FEDEX_PASSWORD, FEDEX_ACCOUNT_NUMBER required)" };
  }

  if (!trackingNumber) {
    return { success: false, message: "No tracking number provided" };
  }

  try {
    const token = await getAccessToken(clientId, clientSecret);

    const payload = {
      accountNumber: { value: accountNumber },
      trackingNumber,
      scheduledDate: new Date().toISOString().split("T")[0],
      comments: "Voided by GD Genius",
    };

    const res = await fetch(`${FEDEX_BASE}/ship/v1/shipments/cancel`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-locale": "en_US",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json() as {
      output?: { cancelledShipment?: boolean; successMessage?: string };
      errors?: Array<{ code: string; message: string }>;
    };

    if (data.errors?.length) {
      const msg = data.errors.map(e => `${e.code}: ${e.message}`).join("; ");
      return { success: false, message: msg };
    }

    const cancelled = data.output?.cancelledShipment ?? false;
    const successMsg = data.output?.successMessage ?? (cancelled ? "Shipment voided successfully" : "Void request submitted");

    console.log(`[FedEx] Void ${cancelled ? "accepted" : "submitted"} for tracking ${trackingNumber}: ${successMsg}`);
    return { success: true, message: successMsg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `FedEx void error: ${msg}` };
  }
}

/** Quick connectivity check — returns true if we can get a token. */
export async function checkFedExConnection(): Promise<{ connected: boolean; label: string; error?: string }> {
  const clientId = process.env.FEDEX_USER_KEY;
  const clientSecret = process.env.FEDEX_PASSWORD;
  if (!clientId || !clientSecret) {
    return { connected: false, label: "FedEx (REST)", error: "Credentials not configured" };
  }
  try {
    await getAccessToken(clientId, clientSecret);
    return { connected: true, label: "FedEx (REST)" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { connected: false, label: "FedEx (REST)", error: msg };
  }
}
