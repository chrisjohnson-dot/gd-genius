/**
 * GD Cortex — Outbound webhook helper
 *
 * Fires a POST to the remote platform's webhook URL when a return status changes
 * or when a shipment is created / updated.
 *
 * Silently logs errors so a webhook failure never blocks the main workflow.
 */

import {
  getCortexConnection,
  updateCortexReturn,
  getPendingWebhookCortexReturns,
  updateShipment,
  getShipmentById,
} from "../db";
import type { Shipment } from "../../drizzle/schema";

// ─── Generic webhook fire ─────────────────────────────────────────────────────

export async function fireCortexWebhook(
  platform: string,
  event: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    const conn = await getCortexConnection(platform);
    if (!conn || !conn.enabled || !conn.webhookUrl) {
      // Webhook not configured — silently skip
      return false;
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const res = await fetch(conn.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Include outbound API key so ClearSight can validate
        "X-API-Key": conn.outboundApiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!res.ok) {
      console.warn(`[Cortex Webhook] ${platform} ${event} → HTTP ${res.status}`);
      return false;
    }

    console.log(`[Cortex Webhook] ${platform} ${event} → OK`);
    return true;
  } catch (err) {
    console.error(`[Cortex Webhook] ${platform} ${event} → Error:`, err);
    return false;
  }
}

// ─── Shipment push to ClearSight ─────────────────────────────────────────────

/**
 * Build the canonical ClearSight shipment payload from a unified shipments row.
 * This is the single source of truth for what GD Genius sends to ClearSight.
 */
function buildShipmentPayload(s: Shipment): Record<string, unknown> {
  return {
    // Identifiers
    geniusShipmentId: s.id,
    platform: s.platform,
    mode: s.mode,

    // Order context
    orderNumber: s.orderNumber ?? null,
    extensivOrderId: s.extensivOrderId ?? null,
    customerName: s.customerName ?? null,
    facilityName: s.facilityName ?? null,

    // Recipient
    shipToName: s.shipToName ?? null,
    shipToCity: s.shipToCity ?? null,
    shipToState: s.shipToState ?? null,
    shipToZip: s.shipToZip ?? null,
    shipToCountry: s.shipToCountry ?? null,

    // Carrier & service
    carrier: s.carrier ?? null,
    serviceLevel: s.serviceLevel ?? null,
    carrierScac: s.carrierScac ?? null,

    // Tracking identifiers
    trackingNumber: s.trackingNumber ?? null,
    bolNumber: s.bolNumber ?? null,
    proNumber: s.proNumber ?? null,

    // Status & dates
    status: s.status ?? "booked",
    shipwellStatus: s.shipwellStatus ?? null,
    estimatedDeliveryAt: s.estimatedDeliveryAt ? s.estimatedDeliveryAt.toISOString() : null,
    deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString() : null,

    // Cost
    labelCostCents: s.labelCostCents ?? null,
    currency: s.currency ?? "USD",

    // Label
    labelUrl: s.labelUrl ?? null,

    // Timestamps
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * Push a shipment event to ClearSight.
 *
 * Event types:
 *   "shipment.created"  — fired immediately when a label is purchased or a
 *                         Shipwell LTL order is sent
 *   "shipment.updated"  — fired when PRO/BOL/tracking numbers are assigned or
 *                         status changes (e.g. delivered)
 *
 * The function updates the shipment row's push status columns so the Shipping
 * History UI can show push state (pending / sent / failed).
 *
 * Non-fatal: errors are logged but never thrown.
 */
export async function pushShipmentToClearSight(
  shipmentId: number,
  event: "shipment.created" | "shipment.updated"
): Promise<void> {
  let shipment: Shipment | null = null;

  try {
    shipment = await getShipmentById(shipmentId);
    if (!shipment) {
      console.warn(`[ClearSight Push] Shipment #${shipmentId} not found — skipping push`);
      return;
    }

    const conn = await getCortexConnection("clearsight");
    if (!conn || !conn.enabled || !conn.webhookUrl) {
      // ClearSight not configured — mark as pending so it can be retried later
      await updateShipment(shipmentId, {
        clearSightPushStatus: "pending",
      });
      return;
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data: buildShipmentPayload(shipment),
    };

    const res = await fetch(conn.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": conn.outboundApiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      await updateShipment(shipmentId, {
        clearSightPushStatus: "sent",
        clearSightPushAttempts: (shipment.clearSightPushAttempts ?? 0) + 1,
        clearSightLastPushedAt: new Date(),
        clearSightPushError: null,
      });
      console.log(`[ClearSight Push] Shipment #${shipmentId} ${event} → OK`);
    } else {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      await updateShipment(shipmentId, {
        clearSightPushStatus: "failed",
        clearSightPushAttempts: (shipment.clearSightPushAttempts ?? 0) + 1,
        clearSightPushError: `HTTP ${res.status}: ${errText.slice(0, 255)}`,
      });
      console.warn(`[ClearSight Push] Shipment #${shipmentId} ${event} → HTTP ${res.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ClearSight Push] Shipment #${shipmentId} ${event} → Error:`, msg);
    if (shipment) {
      await updateShipment(shipmentId, {
        clearSightPushStatus: "failed",
        clearSightPushAttempts: (shipment.clearSightPushAttempts ?? 0) + 1,
        clearSightPushError: msg.slice(0, 255),
      }).catch(() => {});
    }
  }
}

/**
 * Retry any shipments where clearSightPushStatus = 'failed' or 'pending'
 * and clearSightPushAttempts < 5.
 * Called periodically by the scheduler (every 30 min).
 */
export async function flushPendingShipmentPushes(): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const { shipments } = await import("../../drizzle/schema");
    const { and, or, eq, lt } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) return;

    const pending = await db
      .select()
      .from(shipments)
      .where(
        and(
          or(
            eq(shipments.clearSightPushStatus, "failed"),
            eq(shipments.clearSightPushStatus, "pending")
          ),
          lt(shipments.clearSightPushAttempts, 5)
        )
      )
      .limit(50);

    for (const s of pending) {
      await pushShipmentToClearSight(s.id, "shipment.updated");
    }

    if (pending.length > 0) {
      console.log(`[ClearSight Push] Flushed ${pending.length} pending shipment pushes`);
    }
  } catch (err) {
    console.error("[ClearSight Push] flushPendingShipmentPushes error:", err);
  }
}

// ─── Returns webhook flush (existing) ────────────────────────────────────────

/**
 * Retry any cortex_returns rows where webhookSent = false.
 * Called periodically by the scheduler.
 */
export async function flushPendingWebhooks(): Promise<void> {
  try {
    const pending = await getPendingWebhookCortexReturns();
    for (const r of pending) {
      const eventMap: Record<string, string> = {
        Received: "return.received",
        Inspecting: "return.inspecting",
        Processed: "return.processed",
        Refunded: "return.refunded",
        Rejected: "return.rejected",
        Restocked: "return.processed",
      };
      const event = eventMap[r.status] ?? "return.processed";
      const sent = await fireCortexWebhook("clearsight", event, {
        geniusReturnId: `genius-${r.id}`,
        returnNumber: r.returnNumber,
        status: r.status,
        disposition: r.disposition ?? null,
        refundAmount: r.refundAmount != null ? Number(r.refundAmount) : null,
        refundApproved: r.refundApproved ?? null,
        processedBy: r.processedBy ?? null,
        processedAt: r.processedAt ? r.processedAt.toISOString() : null,
        notes: r.notes ?? null,
      });
      if (sent) {
        await updateCortexReturn(r.id, { webhookSent: true });
      }
    }
  } catch (err) {
    console.error("[Cortex Webhook] flushPendingWebhooks error:", err);
  }
}
