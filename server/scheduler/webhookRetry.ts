/**
 * Webhook Retry Scheduler
 *
 * Runs every minute and retries failed ClearSight webhook pushes using
 * exponential backoff:
 *   Attempt 1 → retry after 1 min
 *   Attempt 2 → retry after 5 min
 *   Attempt 3 → retry after 15 min
 *   After 3 attempts → no more auto-retries (manual retry only)
 */

import { getFailedReturnSessions, getReturnsItems, updateReturnsSession } from "../db";
import { fireCortexWebhook } from "../cortex/webhook";

const BACKOFF_MINUTES = [1, 5, 15]; // delay before each retry attempt (1-indexed)

function minutesAgo(date: Date | null | undefined, minutes: number): boolean {
  if (!date) return true; // no previous attempt — eligible immediately
  return Date.now() - date.getTime() >= minutes * 60 * 1000;
}

export async function retryFailedWebhooks(): Promise<void> {
  let sessions: Awaited<ReturnType<typeof getFailedReturnSessions>>;
  try {
    sessions = await getFailedReturnSessions();
  } catch {
    return; // DB not ready
  }

  for (const session of sessions) {
    const attempts = session.pushAttempts ?? 0;
    if (attempts >= 3) continue; // exhausted — skip

    const requiredDelay = BACKOFF_MINUTES[attempts - 1] ?? 1; // attempts is 1-based after first failure
    if (!minutesAgo(session.lastPushedAt, requiredDelay)) continue; // too soon

    const items = await getReturnsItems(session.id);
    const payload = {
      geniusSessionId: `genius-session-${session.id}`,
      referenceNumber: session.referenceNumber ?? null,
      warehouseName: session.warehouseName,
      clientName: session.clientName,
      closedAt: session.closedAt ? session.closedAt.toISOString() : null,
      closedBy: session.createdByName ?? null,
      notes: session.notes ?? null,
      items: items.map((item) => ({
        sku: item.sku,
        description: item.description ?? null,
        quantity: item.quantity,
        condition: item.condition,
        disposition: item.disposition,
        lotNumber: item.lotNumber ?? null,
        notes: item.notes ?? null,
      })),
      totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
      totalSkus: items.length,
    };

    const newAttempts = attempts + 1;
    let sent = false;
    let pushError: string | null = null;
    try {
      sent = await fireCortexWebhook("clearsight", "return.session.closed", payload);
      if (!sent) pushError = "Webhook returned failure (no active ClearSight connection or non-2xx response)";
    } catch (err: unknown) {
      pushError = err instanceof Error ? err.message : String(err);
    }

    await updateReturnsSession(session.id, {
      pushStatus: sent ? "sent" : "failed",
      pushAttempts: newAttempts,
      pushError: sent ? null : pushError,
      lastPushedAt: new Date(),
    });

    if (sent) {
      console.log(`[WebhookRetry] Session ${session.id} pushed successfully on attempt ${newAttempts}`);
    } else {
      console.warn(`[WebhookRetry] Session ${session.id} attempt ${newAttempts} failed: ${pushError}`);
    }
  }
}

export function startWebhookRetryScheduler(): void {
  // Run immediately on startup to catch any sessions that failed before the last restart
  retryFailedWebhooks().catch((err) => console.error("[WebhookRetry] Initial run failed:", err));
  // Then run every minute
  setInterval(() => {
    retryFailedWebhooks().catch((err) => console.error("[WebhookRetry] Retry run failed:", err));
  }, 60 * 1000);
  console.log("[WebhookRetry] Retry scheduler started — checks every 60s");
}
