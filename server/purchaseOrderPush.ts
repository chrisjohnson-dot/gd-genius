/**
 * purchaseOrderPush.ts
 * Sends a GD Genius Purchase Order to OpFi via HMAC-SHA256 signed webhook.
 * Endpoint: POST https://gobilling-nefrolgy.manus.space/api/genius/purchase-order
 *
 * Auth strategy:
 *   1. If OPFI_WEBHOOK_SECRET is set → HMAC-SHA256 signature in X-Genius-Signature header
 *   2. Otherwise → apiKey field in the JSON body (fallback / setup mode)
 */

import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { purchaseOrders } from "../drizzle/schema";

const OPFI_PO_URL =
  process.env.OPFI_PO_WEBHOOK_URL ||
  "https://gobilling-nefrolgy.manus.space/api/genius/purchase-order";

const OPFI_WEBHOOK_SECRET = process.env.OPFI_WEBHOOK_SECRET;
const OPFI_API_KEY = process.env.OPFI_API_KEY;

export interface PurchaseOrderPayload {
  poNumber: string;
  customerId: string;
  customerName: string;
  warehouse: "Columbus" | "Reno" | "Toronto" | "Calgary";
  poDate: string;        // YYYY-MM-DD
  billingPeriod: string; // YYYY-MM
  kittingCharge?: number;
  labourCharge?: number;
  materialCharge?: number;
  currency?: "USD" | "CAD";
}

function buildHeaders(body: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (OPFI_WEBHOOK_SECRET) {
    const sig =
      "sha256=" +
      crypto
        .createHmac("sha256", OPFI_WEBHOOK_SECRET)
        .update(Buffer.from(body, "utf8"))
        .digest("hex");
    headers["X-Genius-Signature"] = sig;
  }
  return headers;
}

/**
 * Push a single PO to OpFi.
 * Returns { success: true } on 201/409; { success: false, error } otherwise.
 */
export async function pushPurchaseOrderToOpFi(
  poId: number,
  payload: PurchaseOrderPayload
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const bodyObj: Record<string, unknown> = { ...payload };
  if (!OPFI_WEBHOOK_SECRET && OPFI_API_KEY) {
    bodyObj.apiKey = OPFI_API_KEY;
  }

  const body = JSON.stringify(bodyObj);
  const headers = buildHeaders(body);

  try {
    const res = await fetch(OPFI_PO_URL, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    // 201 = created, 409 = duplicate — both treated as success
    if (res.status === 201 || res.status === 409) {
      await db
        .update(purchaseOrders)
        .set({
          opfiPushStatus: "sent",
          opfiPushError: null,
          opfiLastPushedAt: Date.now(),
        })
        .where(eq(purchaseOrders.id, poId));
      return { success: true };
    }

    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    await db
      .update(purchaseOrders)
      .set({
        opfiPushStatus: "failed",
        opfiPushError: `HTTP ${res.status}: ${errText.slice(0, 512)}`,
        opfiPushAttempts: sql`opfi_push_attempts + 1`,
        opfiLastPushedAt: Date.now(),
      })
      .where(eq(purchaseOrders.id, poId));

    return { success: false, error: `HTTP ${res.status}: ${errText.slice(0, 256)}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(purchaseOrders)
      .set({
        opfiPushStatus: "failed",
        opfiPushError: msg.slice(0, 512),
        opfiPushAttempts: sql`opfi_push_attempts + 1`,
        opfiLastPushedAt: Date.now(),
      })
      .where(eq(purchaseOrders.id, poId));
    return { success: false, error: msg };
  }
}

/**
 * Retry all failed/pending POs (up to 5 attempts each).
 * Called by the 30-minute scheduler.
 */
export async function flushPendingPurchaseOrderPushes(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select()
    .from(purchaseOrders)
    .where(
      sql`opfi_push_status IN ('pending', 'failed') AND opfi_push_attempts < 5`
    );

  for (const po of rows) {
    await pushPurchaseOrderToOpFi(po.id, {
      poNumber: po.poNumber,
      customerId: po.customerId,
      customerName: po.customerName,
      warehouse: po.warehouse as "Columbus" | "Reno" | "Toronto" | "Calgary",
      poDate: po.poDate,
      billingPeriod: po.billingPeriod,
      kittingCharge: parseFloat(po.kittingCharge ?? "0"),
      labourCharge: parseFloat(po.labourCharge ?? "0"),
      materialCharge: parseFloat(po.materialCharge ?? "0"),
      currency: (po.currency ?? "CAD") as "USD" | "CAD",
    });
  }
}
