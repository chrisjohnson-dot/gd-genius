/**
 * Cortex Order Sync
 *
 * Fetches open orders from GD Cortex (which pulls from Extensiv every 15 min)
 * instead of hitting Extensiv directly. This eliminates the Extensiv auth
 * overhead on every sync cycle and speeds up the loading pipeline.
 *
 * Called by the /api/scheduled/orderSync Heartbeat handler.
 * Falls back to direct Extensiv sync if Cortex is not configured or errors.
 */

import { getDb } from "../db";
import { cortexHubConfig } from "../../drizzle/schema";
import { upsertTrackedOrders } from "../db";

// Shape of an order record returned by Cortex's getOrders endpoint
export interface CortexOrder {
  extensivOrderId: number;
  referenceNum: string | null;
  poNum: string | null;
  configId: number;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string;
  shipToName: string | null;
  shipToCity: string | null;
  totalPieces: number;
  skuCount: number;
  notes: string | null;
  savedElements: string | null;
  extensivStatus: number;
  fullyAllocated: boolean;
  creationDate: string | null;
  requiredShipDate: string | null;
}

export interface CortexSyncResult {
  source: "cortex" | "extensiv_fallback";
  inserted: number;
  updated: number;
  removed: number;
  message: string;
}

/**
 * Fetch open orders from Cortex and upsert into order_tracking.
 * Returns null if Cortex is not configured (caller should fall back to Extensiv).
 */
export async function syncOrdersFromCortex(): Promise<CortexSyncResult | null> {
  const db = await getDb();
  if (!db) return null;

  // Load Cortex hub config
  const [config] = await db.select().from(cortexHubConfig).limit(1);
  if (!config?.cortexBaseUrl || !config?.cortexApiKey) {
    // Cortex not configured — signal caller to fall back
    return null;
  }

  const baseUrl = config.cortexBaseUrl.replace(/\/$/, "");
  const apiKey = config.cortexApiKey;

  let allOrders: CortexOrder[] = [];
  let page = 0;
  const pageSize = 500;
  let hasMore = true;

  // Paginate through all open orders from Cortex
  while (hasMore) {
    const url = `${baseUrl}/api/trpc/cortexHub.getOrders?input=${encodeURIComponent(
      JSON.stringify({
        json: {
          apiKey,
          status: "open",
          limit: pageSize,
          offset: page * pageSize,
        },
      })
    )}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cortex getOrders returned HTTP ${res.status}: ${body}`);
    }

    const json = await res.json() as {
      result?: { data?: { json?: { orders?: CortexOrder[]; hasMore?: boolean } } };
    };

    const data = json?.result?.data?.json;
    const orders = data?.orders ?? [];
    hasMore = data?.hasMore ?? false;

    allOrders = allOrders.concat(orders);
    page++;

    // Safety cap — Cortex should never return more than 10k open orders
    if (allOrders.length >= 10_000) break;
  }

  if (allOrders.length === 0) {
    return {
      source: "cortex",
      inserted: 0,
      updated: 0,
      removed: 0,
      message: "Cortex returned 0 open orders",
    };
  }

  // Group by (configId, facilityId) for upsert — mirrors the Extensiv sync grouping
  const grouped = new Map<string, { configId: number; facilityId: number; orders: typeof allOrders }>();
  for (const o of allOrders) {
    const key = `${o.configId}:${o.facilityId}`;
    if (!grouped.has(key)) {
      grouped.set(key, { configId: o.configId, facilityId: o.facilityId, orders: [] });
    }
    grouped.get(key)!.orders.push(o);
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalRemoved = 0;

  for (const { configId, facilityId, orders } of grouped.values()) {
    const upsertRows: Parameters<typeof upsertTrackedOrders>[0] = orders.map((o) => ({
      extensivOrderId: o.extensivOrderId,
      referenceNum: o.referenceNum,
      poNum: o.poNum,
      configId: o.configId,
      clientId: o.clientId,
      clientName: o.clientName,
      facilityId: o.facilityId,
      facilityName: o.facilityName,
      shipToName: o.shipToName,
      shipToCity: o.shipToCity,
      totalPieces: o.totalPieces,
      skuCount: o.skuCount,
      notes: o.notes,
      savedElements: o.savedElements,
      extensivStatus: o.extensivStatus,
      fullyAllocated: o.fullyAllocated,
      creationDate: o.creationDate,
      requiredShipDate: o.requiredShipDate,
    }));

    // Retry upsert up to 3 times on transient DB errors
    let result = { inserted: 0, updated: 0, removed: 0 };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await upsertTrackedOrders(upsertRows, configId, facilityId);
        break;
      } catch (dbErr: unknown) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        if (attempt < 3 && (msg.includes("ECONNRESET") || msg.includes("timeout") || msg.includes("ETIMEDOUT"))) {
          console.warn(`[CortexSync] DB upsert attempt ${attempt} failed for facility ${facilityId}, retrying in 3s…`);
          await new Promise((res) => setTimeout(res, 3000));
        } else {
          console.error(`[CortexSync] DB upsert failed for facility ${facilityId} after ${attempt} attempt(s):`, dbErr);
          break;
        }
      }
    }

    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalRemoved += result.removed;
    console.log(
      `[CortexSync] Config ${configId} / Facility ${facilityId}: +${result.inserted} new, ~${result.updated} updated, -${result.removed} removed`
    );
  }

  const summary = `+${totalInserted} new, ~${totalUpdated} updated, -${totalRemoved} removed`;
  console.log(`[CortexSync] Completed: ${summary} (${allOrders.length} orders from Cortex)`);

  return {
    source: "cortex",
    inserted: totalInserted,
    updated: totalUpdated,
    removed: totalRemoved,
    message: summary,
  };
}
