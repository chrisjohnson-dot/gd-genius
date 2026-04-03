/**
 * /api/scan — Dedicated REST endpoint for the automated conveyor vision system.
 *
 * Accepts a carton barcode via:
 *   POST /api/scan          body: { "barcode": "012345678901" }  (JSON)
 *   POST /api/scan          body: "012345678901"                 (plain text)
 *   GET  /api/scan?barcode=012345678901
 *
 * Looks up the active label scan session, finds the matching ZPL label file,
 * dispatches it to the print-and-apply machine over TCP, and returns a
 * structured JSON response the vision system can use to trigger line stop logic.
 *
 * Response schema:
 *   { success: true,  dispatched: true,  barcode, sessionId, labelFilename }
 *   { success: false, dispatched: false, barcode, sessionId, error, lineStopped: true }
 *   { success: false, dispatched: false, barcode, error, lineStopped: false }  (no active session)
 *
 * HTTP status codes:
 *   200 — label dispatched successfully
 *   422 — label not found or dispatch failed (line should stop)
 *   400 — missing or invalid barcode
 *   503 — no active session or no Extensiv config
 *
 * Authentication: API key via X-Scan-Api-Key header or ?apiKey= query param.
 * The key is stored in the label_scan_settings table (scanApiKey field).
 * If no key is configured, the endpoint is open (for initial setup convenience).
 */

import { Router, Request, Response } from "express";
import net from "net";
import {
  getLabelScanSettings,
  getLabelFileByBarcodeScoped,
  getActiveLabelScanSession,
  createLabelScanCarton,
  updateLabelScanSession,
  getLabelScanSessionById,
} from "./db";

export function registerScanEndpoint(app: Router) {
  // Handle all three input formats
  async function handleScan(req: Request, res: Response) {
    // ── Extract barcode ──────────────────────────────────────────────────────
    let barcode: string | undefined;

    if (req.method === "GET") {
      barcode = (req.query.barcode as string) ?? undefined;
    } else {
      // POST: JSON body or plain text
      const body = req.body;
      if (typeof body === "string") {
        barcode = body.trim();
      } else if (body && typeof body.barcode === "string") {
        barcode = body.barcode.trim();
      } else if (body && typeof body.Barcode === "string") {
        barcode = body.Barcode.trim();
      }
    }

    if (!barcode) {
      return res.status(400).json({
        success: false,
        dispatched: false,
        lineStopped: false,
        error: "Missing barcode. Send POST { barcode } or GET ?barcode=",
      });
    }

    // ── Auth check ───────────────────────────────────────────────────────────
    const settings = await getLabelScanSettings();
    const configuredKey = settings?.scanApiKey;
    if (configuredKey) {
      const providedKey =
        (req.headers["x-scan-api-key"] as string) ??
        (req.query.apiKey as string);
      if (providedKey !== configuredKey) {
        return res.status(401).json({
          success: false,
          dispatched: false,
          lineStopped: false,
          error: "Unauthorized: invalid or missing X-Scan-Api-Key",
        });
      }
    }

    // ── Find active session ──────────────────────────────────────────────────
    const session = await getActiveLabelScanSession();
    if (!session) {
      return res.status(503).json({
        success: false,
        dispatched: false,
        lineStopped: false,
        barcode,
        error: "No active label scan session. Start a session from the QC Scan & Label page first.",
      });
    }

    // ── Look up label file scoped to this session's transaction ID ───────────
    const labelFile = await getLabelFileByBarcodeScoped(
      barcode,
      session.extensivTransactionId ?? undefined
    );

    if (!labelFile) {
      // Stop the line
      await updateLabelScanSession(session.id, {
        status: "stopped",
        scannedCount: (session.scannedCount ?? 0) + 1,
        exceptionCount: (session.exceptionCount ?? 0) + 1,
      });
      await createLabelScanCarton({
        sessionId: session.id,
        barcode,
        labelFileId: null,
        dispatched: false,
        hasException: true,
        exceptionReason: "no_label",
        exceptionDetail: `No label file found for barcode "${barcode}". Upload the ZPL label file and resume the session.`,
        qcItemCount: null,
        qcNotes: null,
      });
      return res.status(422).json({
        success: false,
        dispatched: false,
        lineStopped: true,
        barcode,
        sessionId: session.id,
        error: `No label file found for barcode "${barcode}". Line stopped — supervisor required.`,
      });
    }

    // ── Dispatch ZPL over TCP ────────────────────────────────────────────────
    const printerIp = session.printerIp ?? settings?.printerIp ?? "";
    const printerPort = session.printerPort ?? settings?.printerPort ?? 9100;

    let dispatched = false;
    let dispatchError: string | null = null;

    if (printerIp) {
      try {
        const resp = await fetch(labelFile.s3Url);
        if (!resp.ok) throw new Error(`S3 fetch failed: ${resp.status}`);
        const zplBuffer = Buffer.from(await resp.arrayBuffer());

        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          const timeout = setTimeout(() => {
            socket.destroy();
            reject(new Error("Printer connection timed out after 5s"));
          }, 5000);
          socket.connect(printerPort, printerIp, () => {
            socket.write(zplBuffer, () => {
              clearTimeout(timeout);
              socket.end();
              resolve();
            });
          });
          socket.on("error", (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
        dispatched = true;
      } catch (err: any) {
        dispatchError = err?.message ?? "Unknown dispatch error";
      }
    } else {
      dispatchError = "No printer IP configured in Label Scan Settings";
    }

    if (!dispatched) {
      // Dispatch failed — stop the line
      await updateLabelScanSession(session.id, {
        status: "stopped",
        scannedCount: (session.scannedCount ?? 0) + 1,
        exceptionCount: (session.exceptionCount ?? 0) + 1,
      });
      await createLabelScanCarton({
        sessionId: session.id,
        barcode,
        labelFileId: labelFile.id,
        dispatched: false,
        hasException: true,
        exceptionReason: "dispatch_failed",
        exceptionDetail: dispatchError ?? "Label dispatch failed",
        qcItemCount: null,
        qcNotes: null,
      });
      return res.status(422).json({
        success: false,
        dispatched: false,
        lineStopped: true,
        barcode,
        sessionId: session.id,
        error: `Label dispatch failed: ${dispatchError}. Line stopped — supervisor required.`,
      });
    }

    // ── Success ──────────────────────────────────────────────────────────────
    await createLabelScanCarton({
      sessionId: session.id,
      barcode,
      labelFileId: labelFile.id,
      dispatched: true,
      dispatchedAt: new Date(),
      hasException: false,
      qcItemCount: null,
      qcNotes: null,
    });
    await updateLabelScanSession(session.id, {
      scannedCount: (session.scannedCount ?? 0) + 1,
      dispatchedCount: (session.dispatchedCount ?? 0) + 1,
    });

    return res.status(200).json({
      success: true,
      dispatched: true,
      lineStopped: false,
      barcode,
      sessionId: session.id,
      labelFilename: labelFile.filename,
      labelType: labelFile.labelType,
    });
  }

  (app as any).get("/api/scan", handleScan);
  (app as any).post("/api/scan", handleScan);
}
