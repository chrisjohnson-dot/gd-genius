/**
 * /api/scan — Unified REST endpoint for the automated conveyor vision system.
 *
 * Supports two modes, selected automatically based on what is active:
 *
 * ── MODE 1: Label-file dispatch (QC Scan & Label) ─────────────────────────────
 * Active when a label scan session is running.
 * Input:  barcode (string) — the carton's manufacturer barcode
 * Output: { success, dispatched, lineStopped, barcode, sessionId, labelFilename }
 *
 * ── MODE 2: Production line verdict (Automated QC Carton Line) ────────────────
 * Active when a production run is active on the given lineId.
 * Input:  Full GS1-128 vision system payload (carton_id, gtin, lot, expiry, etc.)
 * Output: { verdict, fail_reason, placement, tamp_x_mm, tamp_y_mm, label_zpl }
 *
 * Both modes share the same endpoint and API key authentication.
 *
 * Input formats accepted:
 *   POST /api/scan  body: JSON (primary)
 *   POST /api/scan  body: plain text (barcode only — label-file mode)
 *   GET  /api/scan?barcode=...  (label-file mode only)
 *
 * HTTP status codes:
 *   200 — success (pass verdict or label dispatched)
 *   422 — fail/hold verdict, or label not found / dispatch failed (line should stop)
 *   400 — bad request (missing required fields)
 *   401 — invalid API key
 *   503 — no active session/run
 */

import { Router, Request, Response } from "express";
import net from "net";
import {
  getLabelScanSettings,
  getLabelFileByBarcodeScoped,
  getActiveLabelScanSession,
  createLabelScanCarton,
  updateLabelScanSession,
  getActiveProductionRun,
  getProductionRunByRunId,
  createProductionScan,
  updateProductionRun,
  getProductionSkuConfig,
} from "./db";
import { evaluateVerdict } from "./productionLine";
import {
  getActiveQrScanSession,
  createQrScan,
  updateQrScanSession,
} from "./qrScanning.db";
import { processAndForwardQrScan } from "./qrScanning.forward";
import { plcWrite, squareAndTamp, plcDivertOn, plcBeltStop, buildPlcConfig } from "./plcModbus";

// ── TCP ZPL dispatch helper ────────────────────────────────────────────────────
async function dispatchZplOverTcp(
  zplContent: string | Buffer,
  printerIp: string,
  printerPort: number
): Promise<void> {
  const buf = typeof zplContent === "string" ? Buffer.from(zplContent, "utf-8") : zplContent;
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Printer connection timed out after 5s"));
    }, 5000);
    socket.connect(printerPort, printerIp, () => {
      socket.write(buf, () => {
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
}

export function registerScanEndpoint(app: Router) {

  async function handleScan(req: Request, res: Response) {
    const settings = await getLabelScanSettings();

    // ── Auth check ─────────────────────────────────────────────────────────────
    const configuredKey = settings?.scanApiKey;
    if (configuredKey) {
      const providedKey =
        (req.headers["x-scan-api-key"] as string) ??
        (req.query.apiKey as string);
      if (providedKey !== configuredKey) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized: invalid or missing X-Scan-Api-Key",
        });
      }
    }

    // ── Parse request body ─────────────────────────────────────────────────────
    const body = req.method === "GET" ? req.query : req.body;
    const isPlainText = typeof body === "string";

    // Detect production line payload (has gtin or carton_id fields)
    const isProductionPayload =
      !isPlainText &&
      body &&
      (body.gtin != null || body.carton_id != null || body.lot != null);

    // ── MODE 2: Production line verdict ────────────────────────────────────────
    if (isProductionPayload) {
      const lineId = (body.line_id as string) ?? "LINE-1";
      const run = await getActiveProductionRun(lineId);

      if (!run) {
        return res.status(503).json({
          verdict: "fail",
          fail_reason: "NO_ACTIVE_RUN",
          error: `No active production run on line ${lineId}. Start a run from the Production Line page.`,
        });
      }

      const cartonId = (body.carton_id as string) ?? crypto.randomUUID();
      // ── QR code data (optional — only present if vision system found a QR on this carton)
      const qrData = (body.qr_data as string) ?? null;
      const qrCamera = (body.qr_camera as string) ?? "unknown";
      const qrParsed: Record<string, unknown> | null =
        body.qr_parsed && typeof body.qr_parsed === "object" ? body.qr_parsed as Record<string, unknown> : null;
      const gtin = (body.gtin as string) ?? null;
      const lot = (body.lot as string) ?? null;
      const expiry = (body.expiry as string) ?? null;
      const serial = (body.serial as string) ?? null;
      const poNumber = (body.po_number as string) ?? null;
      const confidence = body.confidence != null ? Number(body.confidence) : null;
      const camBClear = body.cam_b_clear != null ? Boolean(body.cam_b_clear) : null;
      const skuBbox =
        body.sku_bbox && typeof body.sku_bbox === "object"
          ? {
              x_mm: Number(body.sku_bbox.x_mm ?? 0),
              y_mm: Number(body.sku_bbox.y_mm ?? 0),
              w_mm: Number(body.sku_bbox.w_mm ?? 0),
              h_mm: Number(body.sku_bbox.h_mm ?? 0),
            }
          : null;

      const skuCfg = gtin ? await getProductionSkuConfig(gtin) : null;

      const result = evaluateVerdict(
        { cartonId, gtin, lot, expiry, serial, poNumber, skuBbox, camBClear, confidence },
        {
          runId: run.runId,
          lineId: run.lineId,
          operatorId: run.operatorId,
          expectedGtin: run.expectedGtin,
          expectedLot: run.expectedLot,
          expectedExpiry: run.expectedExpiry,
          confidenceThreshold: Number(run.confidenceThreshold),
          shelfLifeDaysMin: run.shelfLifeDaysMin,
          holdConfidenceMin: run.holdConfidenceMin != null ? Number(run.holdConfidenceMin) : null,
          tampDefaultX: run.tampDefaultX != null ? Number(run.tampDefaultX) : null,
          tampDefaultY: run.tampDefaultY != null ? Number(run.tampDefaultY) : null,
        },
        skuCfg
          ? {
              shelfLifeDaysMin: skuCfg.shelfLifeDaysMin,
              holdConfidenceMin: skuCfg.holdConfidenceMin != null ? Number(skuCfg.holdConfidenceMin) : null,
              lotPattern: skuCfg.lotPattern,
            }
          : null
      );

      // ── tamp_x_mm: use fixed config constant (v3 spec — X is set mechanically)
      const tampXFixed = settings?.tampXMmFixed != null ? Number(settings.tampXMmFixed) : 120;
      const finalTampX = tampXFixed;
      const finalTampY = result.tampYMm;

      // ── Build PLC config from settings ────────────────────────────────────────
      const plcCfg = settings ? buildPlcConfig({
        plcProtocol: settings.plcProtocol ?? "modbus",
        plcIp: settings.plcIp ?? "",
        plcPort: settings.plcPort ?? 502,
        plcUnitId: settings.plcUnitId ?? 1,
        plcStubMode: settings.plcStubMode ?? true,
        modbusCoilDivert: settings.modbusCoilDivert ?? 0,
        modbusCoilBeltStop: settings.modbusCoilBeltStop ?? 1,
        modbusCoilTampFire: settings.modbusCoilTampFire ?? 2,
        modbusCoilStopPlate: settings.modbusCoilStopPlate ?? 3,
        modbusCoilSquareExtend: settings.modbusCoilSquareExtend ?? 4,
        modbusCoilSquareRetract: settings.modbusCoilSquareRetract ?? 5,
        modbusCoilTampReady: settings.modbusCoilTampReady ?? 9,
        modbusCoilBeltRunning: settings.modbusCoilBeltRunning ?? 10,
        modbusCoilSquareConfirmed: settings.modbusCoilSquareConfirmed ?? 11,
        modbusCoilSquareHome: settings.modbusCoilSquareHome ?? 12,
        modbusRegTampX: settings.modbusRegTampX ?? 0,
        modbusRegTampY: settings.modbusRegTampY ?? 1,
        modbusRegEncoderPos: settings.modbusRegEncoderPos ?? 9,
        squaringTimeoutMs: settings.squaringTimeoutMs ?? 2000,
        tampReadyTimeoutMs: settings.tampReadyTimeoutMs ?? 1000,
        enipSlot: settings.enipSlot,
        enipTagBeltStop: settings.enipTagBeltStop,
        enipTagTampFire: settings.enipTagTampFire,
        enipTagDivertOn: settings.enipTagDivertOn,
      }) : null;

      // ── On fail/hold: fire divert solenoid (C1) ───────────────────────────────
      if (result.verdict !== "pass" && plcCfg) {
        try { await plcDivertOn(plcCfg); } catch (e) {
          console.error("[scanEndpoint] PLC divert error:", (e as Error).message);
          // If PLC is unreachable, assert belt stop for safety
          try { await plcBeltStop(plcCfg); } catch { /* best effort */ }
        }
      }

      // ── On pass: dispatch ZPL to printer + squaring+tamp sequence ─────────────
      let printedAt: Date | null = null;
      if (result.verdict === "pass" && result.labelZpl) {
        const printerIp = settings?.zebraIp ?? settings?.printerIp ?? "";
        const printerPort = settings?.printerPort ?? 9100;
        if (printerIp) {
          try {
            await dispatchZplOverTcp(result.labelZpl, printerIp, printerPort);
            printedAt = new Date();
          } catch (err: any) {
            console.error("[scanEndpoint] ZPL dispatch error:", err?.message);
          }
        }
        // Squaring + tamp with overlap optimization (v3 spec §9.5)
        if (plcCfg) {
          try {
            const tampResult = await squareAndTamp(plcCfg, finalTampX, finalTampY);
            if (!tampResult.success) {
              console.error("[scanEndpoint] squareAndTamp failed:", tampResult.failStep);
            }
          } catch (e) {
            console.error("[scanEndpoint] PLC squareAndTamp error:", (e as Error).message);
            try { await plcBeltStop(plcCfg); } catch { /* best effort */ }
          }
        }
      }

      // ── QR code processing (fire-and-forget, non-blocking) ──────────────────
      if (qrData) {
        const qrSession = await getActiveQrScanSession(run.runId);
        if (qrSession) {
          const qrScanId = crypto.randomUUID();
          const newQrScan = {
            qrScanId,
            sessionId: qrSession.sessionId,
            runId: run.runId,
            cartonId,
            qrData,
            qrParsed,
            camera: qrCamera,
            forwarded: false,
            forwardAttempts: 0,
          };
          // Persist QR scan record
          createQrScan(newQrScan).then(async () => {
            // Update session scan counter
            await updateQrScanSession(qrSession.sessionId, {
              totalScanned: qrSession.totalScanned + 1,
            });
            // Forward to customer app asynchronously
            await processAndForwardQrScan(
              { ...newQrScan, id: 0, forwardError: null, forwardedAt: null,
                customerResponseStatus: null, customerResponseBody: null,
                scannedAt: new Date(), createdAt: new Date() },
              qrSession.sessionId
            );
          }).catch((err: Error) => {
            console.error("[scanEndpoint] QR scan persist error:", err.message);
          });
        }
      }

      // Persist scan record
      const scanId = crypto.randomUUID();
      await createProductionScan({
        scanId,
        runId: run.runId,
        cartonId,
        scannedGtin: gtin,
        scannedLot: lot,
        scannedExpiry: expiry,
        scannedSerial: serial,
        poNumber,
        skuBbox,
        camBClear,
        confidence: confidence != null ? String(confidence) as any : null,
        verdict: result.verdict,
        failReason: result.failReason ?? null,
        placement: result.placement,
        tampXMm: String(result.tampXMm) as any,
        tampYMm: String(result.tampYMm) as any,
        zplSent: result.labelZpl ?? null,
        printedAt,
      });

      // Update run counters
      await updateProductionRun(run.runId, {
        totalScanned: run.totalScanned + 1,
        totalPass: run.totalPass + (result.verdict === "pass" ? 1 : 0),
        totalFail: run.totalFail + (result.verdict === "fail" ? 1 : 0),
        totalHold: run.totalHold + (result.verdict === "hold" ? 1 : 0),
      });

      const httpStatus = result.verdict === "pass" ? 200 : 422;
      return res.status(httpStatus).json({
        verdict: result.verdict,
        fail_reason: result.failReason ?? null,
        placement: result.placement,
        tamp_x_mm: finalTampX,
        tamp_y_mm: finalTampY,
        label_zpl: result.labelZpl ?? null,
        scan_id: scanId,
        run_id: run.runId,
      });
    }

    // ── MODE 1: Label-file dispatch ────────────────────────────────────────────
    let barcode: string | undefined;
    if (req.method === "GET") {
      barcode = (req.query.barcode as string) ?? undefined;
    } else if (isPlainText) {
      barcode = (body as string).trim();
    } else if (body) {
      barcode = (body.barcode as string) ?? (body.Barcode as string);
    }

    if (!barcode) {
      return res.status(400).json({
        success: false,
        dispatched: false,
        lineStopped: false,
        error: "Missing barcode. Send POST { barcode } or GET ?barcode=",
      });
    }

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

    const labelFile = await getLabelFileByBarcodeScoped(
      barcode,
      session.extensivTransactionId ?? undefined
    );

    if (!labelFile) {
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

    const printerIp = session.printerIp ?? settings?.printerIp ?? "";
    const printerPort = session.printerPort ?? settings?.printerPort ?? 9100;
    let dispatched = false;
    let dispatchError: string | null = null;

    if (printerIp) {
      try {
        const resp = await fetch(labelFile.s3Url);
        if (!resp.ok) throw new Error(`S3 fetch failed: ${resp.status}`);
        const zplBuffer = Buffer.from(await resp.arrayBuffer());
        await dispatchZplOverTcp(zplBuffer, printerIp, printerPort);
        dispatched = true;
      } catch (err: any) {
        dispatchError = err?.message ?? "Unknown dispatch error";
      }
    } else {
      dispatchError = "No printer IP configured in Label Scan Settings";
    }

    if (!dispatched) {
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

  // Production run lifecycle endpoints (called by vision system edge compute)
  (app as any).post("/api/run/start", async (req: Request, res: Response) => {
    // Lightweight REST wrapper — full validation is in the tRPC procedure
    // This endpoint is for the vision system edge compute to start a run programmatically
    res.status(200).json({ message: "Use POST /api/trpc/productionLine.startRun via tRPC or the dashboard UI." });
  });

  (app as any).post("/api/run/close", async (req: Request, res: Response) => {
    const { run_id, line_id } = req.body ?? {};
    if (!run_id && !line_id) {
      return res.status(400).json({ error: "Provide run_id or line_id" });
    }
    try {
      let run;
      if (run_id) {
        const { getProductionRunByRunId } = await import("./db");
        run = await getProductionRunByRunId(run_id);
      } else {
        run = await getActiveProductionRun(line_id);
      }
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.status !== "active") return res.status(400).json({ error: "Run is not active" });
      await updateProductionRun(run.runId, { status: "closed", closedAt: new Date() });
      return res.status(200).json({
        status: "acknowledged",
        run_id: run.runId,
        total_scanned: run.totalScanned,
        pass_count: run.totalPass,
        fail_count: run.totalFail,
        hold_count: run.totalHold,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? "Internal error" });
    }
  });
}
