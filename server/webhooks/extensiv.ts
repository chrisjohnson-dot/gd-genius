/**
 * Extensiv Webhook Handler — POST /api/webhooks/extensiv
 *
 * Listens for Extensiv 3PL Warehouse Manager webhook events.
 * Currently handles:
 *   - OrderCancel: automatically voids any label_purchased FedEx labels
 *     for the cancelled order AND deallocates any confirmed allocation run
 *     orders for the same Extensiv order ID.
 *
 * Security: Validates the RSA-SHA256 signature in the `Signature` header
 * using Extensiv's public key fetched from https://secure-wms.com/events/webhook/key
 *
 * Payload structure (from Extensiv docs):
 * {
 *   "headers": { "Signature": "<base64>" },
 *   "body": {
 *     "tplId": 2,
 *     "wmsEventId": 2070354,
 *     "eventDateTimeUtc": "2025-01-07T19:54:15.477Z",
 *     "eventType": "OrderCancel",
 *     "data": "{\"OrderId\":\"206568\"}",
 *     ...
 *   }
 * }
 *
 * Note: Extensiv sends the full envelope as the HTTP POST body.
 * The `body` field IS the message body that was RSA-signed.
 */

import type { Express, Request, Response } from "express";
import { createPublicKey, createVerify } from "crypto";
import {
  findSmallParcelSessionsByExtensivOrderId,
  updateSmallParcelSession,
  logSmallParcelAuditEvent,
  findAllocatedRunOrdersByExtensivOrderId,
  updateAllocationRunOrder,
  updateAllocationRun,
  getAllocationRunOrders,
  getExtensivConfigById,
} from "../db";
import { voidFedExLabel } from "../carriers/fedex";
import { deallocateOrder, fetchOrderWithDetail } from "../extensiv/api";

// ─── RSA Public Key Cache ──────────────────────────────────────────────────────
const EXTENSIV_PUBLIC_KEY_URL = "https://secure-wms.com/events/webhook/key";
let cachedPublicKey: string | null = null;
let keyRetrievedAt: Date | null = null;

async function getExtensivPublicKey(forceRefresh = false): Promise<string | null> {
  // Cache for 24 hours to avoid hammering the endpoint
  const cacheAgeMs = keyRetrievedAt ? Date.now() - keyRetrievedAt.getTime() : Infinity;
  if (!forceRefresh && cachedPublicKey && cacheAgeMs < 24 * 60 * 60 * 1000) {
    return cachedPublicKey;
  }
  try {
    const res = await fetch(EXTENSIV_PUBLIC_KEY_URL);
    if (!res.ok) {
      console.error(`[ExtensivWebhook] Failed to fetch public key: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { publicKey?: string };
    if (!json.publicKey) {
      console.error("[ExtensivWebhook] Public key response missing 'publicKey' field");
      return null;
    }
    cachedPublicKey = json.publicKey;
    keyRetrievedAt = new Date();
    console.log("[ExtensivWebhook] RSA public key refreshed");
    return cachedPublicKey;
  } catch (err) {
    console.error("[ExtensivWebhook] Error fetching public key:", err);
    return null;
  }
}

/**
 * Validate the RSA-SHA256 signature on the raw request body.
 * Per Extensiv docs: signature is base64-encoded SHA256 over the raw body string.
 * Attempts once with cached key, then retries with a fresh key on failure.
 */
async function validateExtensivSignature(
  rawBody: string,
  signature: string
): Promise<boolean> {
  // Attempt 1: use cached key
  const publicKeyPem = await getExtensivPublicKey();
  if (!publicKeyPem) return false;

  const attempt = (pem: string): boolean => {
    try {
      const key = createPublicKey({ key: pem, format: "pem", type: "spki" });
      return createVerify("SHA256").update(rawBody).verify(key, signature, "base64");
    } catch {
      return false;
    }
  };

  if (attempt(publicKeyPem)) return true;

  // Attempt 2: refresh key and retry (handles key rotation)
  console.log("[ExtensivWebhook] Signature validation failed with cached key — refreshing...");
  const freshKey = await getExtensivPublicKey(true);
  if (!freshKey) return false;
  return attempt(freshKey);
}

// ─── Auto-Void Logic ──────────────────────────────────────────────────────────

/**
 * Find all label_purchased sessions for the given Extensiv order ID and void them.
 * Returns a summary of what was voided.
 */
async function autoVoidSessionsForOrder(extensivOrderId: number): Promise<{
  found: number;
  voided: number;
  alreadyVoided: number;
  errors: string[];
}> {
  const sessions = await findSmallParcelSessionsByExtensivOrderId(extensivOrderId);
  const result = { found: sessions.length, voided: 0, alreadyVoided: 0, errors: [] as string[] };

  for (const session of sessions) {
    // Skip sessions that don't have a purchased label
    if (session.status !== "label_purchased") {
      if (session.status === "voided") result.alreadyVoided++;
      continue;
    }

    const trackingNumber = session.veeqoTrackingNumber ?? "";

    // Attempt FedEx void
    let fedexResult: { success: boolean; message: string } = {
      success: false,
      message: "No tracking number stored",
    };
    if (trackingNumber) {
      fedexResult = await voidFedExLabel(trackingNumber);
    }

    const voidReason = `Auto-voided: Extensiv order ${extensivOrderId} was cancelled. FedEx: ${fedexResult.message}`;

    // Mark session as voided in DB regardless of FedEx response
    try {
      await updateSmallParcelSession(session.id, {
        status: "voided",
        voidedAt: new Date(),
        voidReason,
      });

      await logSmallParcelAuditEvent({
        sessionId: session.id,
        extensivOrderId,
        clientName: session.clientName ?? undefined,
        eventType: "label_voided",
        trackingNumber,
        carrier: session.veeqoCarrierService ?? undefined,
        notes: `[AUTO-VOID] Extensiv OrderCancel webhook received for order ${extensivOrderId}. FedEx void: ${fedexResult.success ? "accepted" : "failed"} — ${fedexResult.message}`,
        userId: "system",
        userName: "System (Extensiv Webhook)",
      });

      result.voided++;
      console.log(
        `[ExtensivWebhook] Auto-voided session ${session.id} (tracking: ${trackingNumber}) ` +
        `for cancelled order ${extensivOrderId}. FedEx: ${fedexResult.success ? "OK" : "FAILED"} — ${fedexResult.message}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Session ${session.id}: ${msg}`);
      console.error(`[ExtensivWebhook] Failed to void session ${session.id}:`, err);
    }
  }

  return result;
}

// ─── Auto-Deallocate Logic ────────────────────────────────────────────────────

/**
 * Find all confirmed allocation run orders for the given Extensiv order ID
 * and deallocate them in Extensiv, then mark them as unallocated in the DB.
 */
async function autoDeallocateOrderInExtensiv(extensivOrderId: number): Promise<{
  found: number;
  deallocated: number;
  alreadyUnallocated: number;
  errors: string[];
}> {
  const runOrders = await findAllocatedRunOrdersByExtensivOrderId(extensivOrderId);
  const result = { found: runOrders.length, deallocated: 0, alreadyUnallocated: 0, errors: [] as string[] };

  for (const runOrder of runOrders) {
    // Load the Extensiv config for this run
    const config = await getExtensivConfigById(runOrder.run.configId);
    if (!config) {
      const msg = `Run ${runOrder.runId}: Extensiv config ${runOrder.run.configId} not found`;
      result.errors.push(msg);
      console.error(`[ExtensivWebhook] ${msg}`);
      continue;
    }

    try {
      // Fetch fresh ETag for the order (required by Extensiv's optimistic concurrency)
      const { etag } = await fetchOrderWithDetail(config, runOrder.orderId);
      if (!etag) {
        const msg = `RunOrder ${runOrder.id}: Could not fetch ETag for order ${runOrder.orderId}`;
        result.errors.push(msg);
        console.error(`[ExtensivWebhook] ${msg}`);
        continue;
      }

      // Call Extensiv deallocator
      const deallocResult = await deallocateOrder(config, runOrder.orderId, etag);

      if (!deallocResult.success) {
        const msg = `RunOrder ${runOrder.id}: Extensiv deallocate failed — ${deallocResult.error}`;
        result.errors.push(msg);
        console.error(`[ExtensivWebhook] ${msg}`);
        // Still mark as unallocated in DB so it doesn't block future allocations
        // (the order is cancelled anyway, so the allocation is moot)
      } else {
        console.log(
          `[ExtensivWebhook] Deallocated order ${runOrder.orderId} (runOrder ${runOrder.id}) ` +
          `from run ${runOrder.runId} for cancelled Extensiv order ${extensivOrderId}`
        );
      }

      // Update run order status to unallocated in DB
      await updateAllocationRunOrder(runOrder.id, { status: "unallocated" });

      // Update the run's allocatedCount; if all orders are now unallocated, update run status too
      const allOrders = await getAllocationRunOrders(runOrder.runId);
      const allocatedCount = allOrders.filter((o) => o.status === "allocated").length;
      const runStatusUpdate: { allocatedCount: number; status?: "proposed" | "confirmed" | "cancelled" | "failed" | "unallocated" } = { allocatedCount };
      if (allocatedCount === 0) {
        runStatusUpdate.status = "unallocated";
      }
      await updateAllocationRun(runOrder.runId, runStatusUpdate);

      result.deallocated++;
    } catch (err) {
      const msg = `RunOrder ${runOrder.id}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`[ExtensivWebhook] Deallocation error for runOrder ${runOrder.id}:`, err);
    }
  }

  return result;
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerExtensivWebhookRoutes(app: Express): void {
  /**
   * POST /api/webhooks/extensiv
   *
   * Receives Extensiv webhook events. Responds with 200 immediately after
   * signature validation (per Extensiv's 3-second timeout requirement), then
   * processes the event asynchronously.
   */
  app.post(
    "/api/webhooks/extensiv",
    express_rawBody(),
    async (req: Request & { rawBody?: Buffer }, res: Response) => {
      const rawBody = req.rawBody?.toString("utf-8") ?? "";

      // Parse the outer envelope
      let envelope: {
        headers?: { Signature?: string };
        body?: {
          eventType?: string;
          data?: string;
          wmsEventId?: number;
          eventDateTimeUtc?: string;
          tplId?: number;
        };
      };
      try {
        envelope = JSON.parse(rawBody);
      } catch {
        console.warn("[ExtensivWebhook] Invalid JSON body received");
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }

      const signature = envelope?.headers?.Signature ?? "";
      const bodyStr = envelope?.body ? JSON.stringify(envelope.body) : "";

      // Validate RSA signature
      // Per Extensiv docs: signature is over the body string (not the full envelope)
      if (signature && bodyStr) {
        const valid = await validateExtensivSignature(bodyStr, signature);
        if (!valid) {
          console.warn("[ExtensivWebhook] RSA signature validation FAILED — rejecting request");
          res.status(401).json({ error: "Invalid signature" });
          return;
        }
      } else {
        // If no signature present, allow in dev/test but log a warning
        console.warn("[ExtensivWebhook] No RSA signature present — proceeding without validation (dev/test mode)");
      }

      const eventType = envelope?.body?.eventType ?? "";
      const dataStr = envelope?.body?.data ?? "{}";

      // Respond 200 immediately so Extensiv doesn't retry (3-second timeout)
      res.status(200).json({ received: true, eventType });

      // Process asynchronously after responding
      setImmediate(async () => {
        try {
          if (eventType === "OrderCancel") {
            let parsedData: { OrderId?: string | number } = {};
            try {
              parsedData = JSON.parse(dataStr);
            } catch {
              console.error("[ExtensivWebhook] Failed to parse data field:", dataStr);
              return;
            }

            const orderId = parsedData.OrderId ? Number(parsedData.OrderId) : null;
            if (!orderId || isNaN(orderId)) {
              console.error("[ExtensivWebhook] OrderCancel event missing valid OrderId:", dataStr);
              return;
            }

            console.log(`[ExtensivWebhook] OrderCancel received for order ${orderId} — processing void + deallocation...`);

            // Step 1: Auto-void any purchased FedEx labels
            const voidResult = await autoVoidSessionsForOrder(orderId);
            console.log(
              `[ExtensivWebhook] Auto-void complete for order ${orderId}: ` +
              `found=${voidResult.found}, voided=${voidResult.voided}, alreadyVoided=${voidResult.alreadyVoided}, errors=${voidResult.errors.length}`
            );
            if (voidResult.errors.length > 0) {
              console.error("[ExtensivWebhook] Void errors:", voidResult.errors);
            }

            // Step 2: Auto-deallocate any confirmed allocation run orders
            const deallocResult = await autoDeallocateOrderInExtensiv(orderId);
            console.log(
              `[ExtensivWebhook] Auto-deallocation complete for order ${orderId}: ` +
              `found=${deallocResult.found}, deallocated=${deallocResult.deallocated}, alreadyUnallocated=${deallocResult.alreadyUnallocated}, errors=${deallocResult.errors.length}`
            );
            if (deallocResult.errors.length > 0) {
              console.error("[ExtensivWebhook] Deallocation errors:", deallocResult.errors);
            }
          } else {
            // Log unhandled event types for future reference
            console.log(`[ExtensivWebhook] Unhandled event type: ${eventType}`);
          }
        } catch (err) {
          console.error("[ExtensivWebhook] Async processing error:", err);
        }
      });
    }
  );

  console.log("[ExtensivWebhook] Registered POST /api/webhooks/extensiv");
}

/**
 * Express middleware that captures the raw request body as a Buffer
 * before the JSON body parser runs.
 * Required for RSA signature validation (must use the exact bytes received).
 */
function express_rawBody() {
  return (req: Request & { rawBody?: Buffer }, _res: Response, next: () => void) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      req.rawBody = Buffer.concat(chunks);
      next();
    });
  };
}
