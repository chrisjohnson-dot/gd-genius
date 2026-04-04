/**
 * QR Scan Forwarding Service
 *
 * Sends each QR scan event to the customer's app endpoint.
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
 * On permanent failure the scan is marked with forwardError for audit.
 */

import {
  getQrScanSession,
  updateQrScan,
  updateQrScanSession,
} from "./qrScanning.db";
import type { QrScan, QrScanSession } from "../drizzle/schema";

export interface QrForwardPayload {
  event: "qr_scan";
  qr_scan_id: string;
  session_id: string;
  run_id: string;
  carton_id: string | null;
  qr_data: string;
  qr_parsed: Record<string, unknown> | null;
  camera: string;
  scanned_at: string; // ISO-8601
  customer_id: string;
  customer_name: string;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Forward a single QR scan to the customer's app.
 * Updates the qr_scans row with forwarding result.
 */
export async function forwardQrScan(
  scan: QrScan,
  session: QrScanSession
): Promise<boolean> {
  const payload: QrForwardPayload = {
    event: "qr_scan",
    qr_scan_id: scan.qrScanId,
    session_id: scan.sessionId,
    run_id: scan.runId,
    carton_id: scan.cartonId ?? null,
    qr_data: scan.qrData,
    qr_parsed: (scan.qrParsed as Record<string, unknown> | null) ?? null,
    camera: scan.camera ?? "unknown",
    scanned_at: scan.scannedAt.toISOString(),
    customer_id: session.customerId,
    customer_name: session.customerName,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-GD-Source": "gd-allocation-agent",
  };
  if (session.customerAppUrl && session.customerAppUrl.trim()) {
    // authHeader stored on session (copied from customer_app_configs at session creation)
  }

  // Get auth header from session — stored as JSON string "Bearer xxx" or "ApiKey xxx"
  const authHeader = (session as any).authHeader as string | null | undefined;
  if (authHeader) headers["Authorization"] = authHeader;

  const maxAttempts = 3;
  let lastError = "";
  let lastStatus: number | null = null;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(session.customerAppUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      lastStatus = resp.status;
      lastBody = await resp.text().catch(() => "");

      if (resp.ok) {
        // Success
        await updateQrScan(scan.qrScanId, {
          forwarded: true,
          forwardedAt: new Date(),
          forwardAttempts: attempt,
          forwardError: null,
          customerResponseStatus: lastStatus,
          customerResponseBody: lastBody.substring(0, 1024),
        });
        // Increment session forwarded counter
        await updateQrScanSession(session.sessionId, {
          totalForwarded: session.totalForwarded + 1,
        });
        return true;
      }
      lastError = `HTTP ${lastStatus}: ${lastBody.substring(0, 256)}`;
    } catch (err: any) {
      lastError = err?.message ?? "Network error";
    }

    if (attempt < maxAttempts) {
      await sleep(1000 * Math.pow(2, attempt - 1)); // 1s, 2s
    }
  }

  // All attempts failed — mark as error
  await updateQrScan(scan.qrScanId, {
    forwarded: false,
    forwardAttempts: maxAttempts,
    forwardError: lastError,
    customerResponseStatus: lastStatus ?? undefined,
    customerResponseBody: lastBody.substring(0, 1024),
  });
  // Increment session error counter
  await updateQrScanSession(session.sessionId, {
    totalErrors: session.totalErrors + 1,
  });
  return false;
}

/**
 * Process a new QR scan: persist it, then fire-and-forget forward.
 * Returns the qrScanId for the response.
 */
export async function processAndForwardQrScan(
  scan: QrScan,
  sessionId: string
): Promise<void> {
  const session = await getQrScanSession(sessionId);
  if (!session || session.status !== "active") return;
  // Fire-and-forget — don't block the /api/scan response
  forwardQrScan(scan, session).catch((err) => {
    console.error("[QR Forward] Unhandled error:", err?.message);
  });
}
