/**
 * GD Cortex — Outbound webhook helper
 *
 * Fires a POST to the remote platform's webhook URL when a return status changes.
 * Silently logs errors so a webhook failure never blocks the main workflow.
 */

import { getCortexConnection, updateCortexReturn, getPendingWebhookCortexReturns } from "../db";

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
        // Include outbound API key so ClearSight can optionally validate
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
