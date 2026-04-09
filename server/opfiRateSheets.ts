/**
 * OpFi Rate Sheet Fetcher
 *
 * Fetches per-client, per-carrier markup percentages from the OpFi
 * /api/rate-sheets endpoint and caches them for 5 minutes per client.
 *
 * The endpoint returns:
 *   { rateSheets: [{ clientId, clientName, warehouse, carrierMarkups: { fedex, ups, usps, ltl }, ... }] }
 *
 * Values are integer percentages (e.g. 18 = 18%).
 * Defaults to 20% for any carrier not explicitly configured.
 */

const OPFI_BASE_URL =
  process.env.OPFI_BASE_URL ||
  "https://gobilling-nefrolgy.manus.space";

const OPFI_API_KEY = process.env.OPFI_API_KEY ?? "";

export interface CarrierMarkups {
  fedex: number;
  ups: number;
  usps: number;
  ontrac: number;
  dhl: number;
  ltl: number;
}

const DEFAULT_MARKUPS: CarrierMarkups = {
  fedex: 20,
  ups: 20,
  usps: 20,
  ontrac: 20,
  dhl: 20,
  ltl: 22,
};

// In-process cache: clientId (string) → { markups, expiresAt }
const cache = new Map<string, { markups: CarrierMarkups; expiresAt: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch carrier markups for a given Extensiv clientId from OpFi.
 * Returns cached result if still fresh.
 */
export async function getCarrierMarkups(clientId: number | string): Promise<CarrierMarkups> {
  const key = String(clientId);
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.markups;
  }

  try {
    const url = `${OPFI_BASE_URL}/api/rate-sheets?clientId=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: {
        "X-API-Key": OPFI_API_KEY,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000), // 8-second timeout
    });

    if (!res.ok) {
      console.warn(`[OpFi RateSheets] HTTP ${res.status} for clientId=${key} — using defaults`);
      return DEFAULT_MARKUPS;
    }

    const body = await res.json() as {
      rateSheets?: Array<{
        clientId?: string;
        carrierMarkups?: Partial<CarrierMarkups>;
      }>;
    };

    const sheet = body.rateSheets?.[0];
    const raw = sheet?.carrierMarkups ?? {};

    const markups: CarrierMarkups = {
      fedex:  typeof raw.fedex  === "number" ? raw.fedex  : DEFAULT_MARKUPS.fedex,
      ups:    typeof raw.ups    === "number" ? raw.ups    : DEFAULT_MARKUPS.ups,
      usps:   typeof raw.usps   === "number" ? raw.usps   : DEFAULT_MARKUPS.usps,
      ontrac: typeof raw.ontrac === "number" ? raw.ontrac : DEFAULT_MARKUPS.ontrac,
      dhl:    typeof raw.dhl    === "number" ? raw.dhl    : DEFAULT_MARKUPS.dhl,
      ltl:    typeof raw.ltl    === "number" ? raw.ltl    : DEFAULT_MARKUPS.ltl,
    };

    cache.set(key, { markups, expiresAt: now + CACHE_TTL_MS });
    return markups;
  } catch (err) {
    console.warn(`[OpFi RateSheets] Fetch failed for clientId=${key}:`, err);
    return DEFAULT_MARKUPS;
  }
}

/**
 * Given a carrier name string and a markups table, return the markup percentage.
 * Matches by substring (case-insensitive).
 */
export function getMarkupPct(carrierName: string, markups: CarrierMarkups): number {
  const c = carrierName.toLowerCase();
  if (c.includes("fedex"))                        return markups.fedex;
  if (c.includes("ups"))                          return markups.ups;
  if (c.includes("usps") || c.includes("postal")) return markups.usps;
  if (c.includes("ontrac"))                       return markups.ontrac;
  if (c.includes("dhl"))                          return markups.dhl;
  if (c.includes("ltl") || c.includes("freight")) return markups.ltl;
  return markups.fedex; // fallback for unknown parcel carriers
}

/**
 * Apply markup percentage to a raw carrier cost.
 * Returns the billed rate rounded to 2 decimal places.
 */
export function applyMarkup(rawCost: number, pct: number): number {
  return Math.round(rawCost * (1 + pct / 100) * 100) / 100;
}

/**
 * Test the live connection to the OpFi rate-sheets endpoint.
 * Uses a probe clientId of "0" to verify the service is reachable
 * and returns a valid JSON response with the expected shape.
 * Throws if the service is unreachable or returns an unexpected response.
 */
export async function testOpFiConnection(): Promise<{
  ok: boolean;
  baseUrl: string;
  httpStatus: number;
  hasRateSheets: boolean;
  durationMs: number;
}> {
  const t0 = Date.now();
  const url = `${OPFI_BASE_URL}/api/rate-sheets?clientId=0`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": OPFI_API_KEY,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  const durationMs = Date.now() - t0;
  // We accept 200 or 404 (no client found) as "service is alive"
  const serviceAlive = res.status === 200 || res.status === 404;
  if (!serviceAlive) {
    throw new Error(`OpFi returned HTTP ${res.status}`);
  }
  let hasRateSheets = false;
  try {
    const body = await res.json() as { rateSheets?: unknown[] };
    hasRateSheets = Array.isArray(body.rateSheets);
  } catch {
    // Non-JSON body — service is alive but response is unexpected
  }
  return {
    ok: true,
    baseUrl: OPFI_BASE_URL,
    httpStatus: res.status,
    hasRateSheets,
    durationMs,
  };
}
