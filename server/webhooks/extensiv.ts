/**
 * Extensiv Webhook Handler — POST /api/webhooks/extensiv
 *
 * Listens for Extensiv 3PL Warehouse Manager webhook events.
 * Currently handles:
 *   - OrderCancel: automatically voids any label_purchased FedEx labels
 *     for the cancelled order.
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
} from "../db";
import { voidFedExLabel } from "../carriers/fedex";

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

            console.log(`[ExtensivWebhook] OrderCancel received for order ${orderId} — checking for label_purchased sessions...`);
            const result = await autoVoidSessionsForOrder(orderId);
            console.log(
              `[ExtensivWebhook] Auto-void complete for order ${orderId}: ` +
              `found=${result.found}, voided=${result.voided}, alreadyVoided=${result.alreadyVoided}, errors=${result.errors.length}`
            );
            if (result.errors.length > 0) {
              console.error("[ExtensivWebhook] Void errors:", result.errors);
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
