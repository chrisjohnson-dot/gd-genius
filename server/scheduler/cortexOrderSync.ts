/**
 * Cortex Order Sync — Fast Path
 *
 * Fetches open orders directly from Genius's local order_tracking cache
 * instead of hitting Extensiv on every sync cycle. This eliminates the
 * Extensiv auth overhead and speeds up the 15-minute Heartbeat refresh.
 *
 * Architecture:
 *   Heartbeat (15 min) → /api/scheduled/orderSync
 *     → syncOrdersFromCortex()   ← this file (fast: local DB query)
 *     → syncOrdersNow()          ← fallback (slow: Extensiv API)
 *
 * The "Cortex" in the name reflects that this is the Cortex-hub-managed
 * fast path. When a remote Cortex URL is configured, it calls that endpoint;
 * when no remote is configured (or the remote is the same host), it queries
 * the local DB directly — no HTTP round-trip needed.
 */

import { getDb } from "../db";
import { cortexHubConfig, orderTracking } from "../../drizzle/schema";
import { upsertTrackedOrders } from "../db";
import { desc, inArray, and, eq } from "drizzle-orm";

// Shape of an order record in the fast-path sync
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
 * Fetch open orders from the local DB cache (fast path) or from a remote
 * Cortex endpoint if configured. Returns null if neither is available,
 * signalling the caller to fall back to direct Extensiv sync.
 */
export async function syncOrdersFromCortex(): Promise<CortexSyncResult | null> {
  const db = await getDb();
  if (!db) return null;

  // Load Cortex hub config
  const [config] = await db.select().from(cortexHubConfig).limit(1);

  // Determine whether to use local fast path or remote Cortex endpoint
  const useRemote =
    config?.cortexBaseUrl &&
    config?.cortexApiKey &&
    !isLocalHost(config.cortexBaseUrl);

  let allOrders: CortexOrder[];

  if (useRemote) {
    // ── Remote Cortex endpoint (e.g. a separate Cortex project) ──────────────
    allOrders = await fetchOrdersFromRemoteCortex(
      config!.cortexBaseUrl!,
      config!.cortexApiKey!
    );
  } else {
    // ── Local fast path: query order_tracking directly ───────────────────────
    // This is the primary path when Genius IS the Cortex hub.
    // No HTTP round-trip, no Extensiv auth — just a DB read.
    console.log("[CortexSync] Using local fast path (no remote Cortex configured)");
    allOrders = await fetchOrdersFromLocalDb(db);
  }

  if (allOrders.length === 0) {
    return {
      source: "cortex",
      inserted: 0,
      updated: 0,
      removed: 0,
      message: "Fast-path cache returned 0 open orders",
    };
  }

  // Group by (configId, facilityId) for upsert — mirrors the Extensiv sync grouping
  const grouped = new Map<
    string,
    { configId: number; facilityId: number; orders: CortexOrder[] }
  >();
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
    const upsertRows: Parameters<typeof upsertTrackedOrders>[0] = orders.map(
      (o) => ({
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
      })
    );

    let result = { inserted: 0, updated: 0, removed: 0 };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await upsertTrackedOrders(upsertRows, configId, facilityId);
        break;
      } catch (dbErr: unknown) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        if (
          attempt < 3 &&
          (msg.includes("ECONNRESET") ||
            msg.includes("timeout") ||
            msg.includes("ETIMEDOUT"))
        ) {
          console.warn(
            `[CortexSync] DB upsert attempt ${attempt} failed for facility ${facilityId}, retrying in 3s…`
          );
          await new Promise((res) => setTimeout(res, 3000));
        } else {
          console.error(
            `[CortexSync] DB upsert failed for facility ${facilityId} after ${attempt} attempt(s):`,
            dbErr
          );
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
  console.log(
    `[CortexSync] Completed: ${summary} (${allOrders.length} orders from fast-path cache)`
  );

  return {
    source: "cortex",
    inserted: totalInserted,
    updated: totalUpdated,
    removed: totalRemoved,
    message: summary,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Query open orders from the local order_tracking table.
 * "Open" = lifecycle status is unallocated, allocated, confirmed, or in_progress.
 */
async function fetchOrdersFromLocalDb(db: Awaited<ReturnType<typeof getDb>>): Promise<CortexOrder[]> {
  if (!db) return [];

  const rows = await db
    .select({
      extensivOrderId: orderTracking.extensivOrderId,
      referenceNum: orderTracking.referenceNum,
      poNum: orderTracking.poNum,
      configId: orderTracking.configId,
      clientId: orderTracking.clientId,
      clientName: orderTracking.clientName,
      facilityId: orderTracking.facilityId,
      facilityName: orderTracking.facilityName,
      shipToName: orderTracking.shipToName,
      shipToCity: orderTracking.shipToCity,
      totalPieces: orderTracking.totalPieces,
      skuCount: orderTracking.skuCount,
      notes: orderTracking.notes,
      savedElements: orderTracking.savedElements,
      extensivStatus: orderTracking.extensivStatus,
      creationDate: orderTracking.creationDate,
      requiredShipDate: orderTracking.requiredShipDate,
    })
    .from(orderTracking)
    .where(
      inArray(orderTracking.lifecycleStatus, [
        "unallocated",
        "allocated",
        "picking",
        "qc",
        "qc_complete",
        "ship_ready",
      ])
    )
    .orderBy(desc(orderTracking.id));

  return rows.map((o) => ({
    ...o,
    fullyAllocated: false as boolean,
    totalPieces: Number(o.totalPieces ?? 0),
    skuCount: Number(o.skuCount ?? 0),
    extensivStatus: Number(o.extensivStatus ?? 0),
    facilityName: o.facilityName ?? "",
  }));
}

/**
 * Fetch open orders from a remote Cortex endpoint (paginated).
 */
async function fetchOrdersFromRemoteCortex(
  baseUrl: string,
  apiKey: string
): Promise<CortexOrder[]> {
  const cleanBase = baseUrl.replace(/\/$/, "");
  let allOrders: CortexOrder[] = [];
  let page = 0;
  const pageSize = 500;
  let hasMore = true;

  while (hasMore) {
    const url = `${cleanBase}/api/trpc/cortexHub.getOrders?input=${encodeURIComponent(
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
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cortex getOrders returned HTTP ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      result?: {
        data?: { json?: { orders?: CortexOrder[]; hasMore?: boolean } };
      };
    };

    const data = json?.result?.data?.json;
    const orders = data?.orders ?? [];
    hasMore = data?.hasMore ?? false;

    allOrders = allOrders.concat(orders);
    page++;

    if (allOrders.length >= 10_000) break;
  }

  return allOrders;
}

/**
 * Returns true if the URL points to localhost or the same Genius instance.
 */
function isLocalHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".manus.computer") ||
      hostname.endsWith(".manus.space")
    );
  } catch {
    return false;
  }
}
