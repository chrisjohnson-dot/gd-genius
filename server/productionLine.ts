/**
 * Production Line — Verdict Engine & ZPL Generator
 *
 * Implements the 6 pass conditions and 8 fail reason codes defined in the
 * Automated QC Carton Line System Process Description v1.0.
 */

export type Verdict = "pass" | "fail" | "hold";
export type FailReason =
  | "GTIN_MISMATCH"
  | "LOT_MISMATCH"
  | "EXPIRED"
  | "EXPIRY_WINDOW"
  | "LOW_CONFIDENCE"
  | "STRAY_LABEL"
  | "NO_ACTIVE_RUN"
  | "NO_DECODE";

export type Placement = "over_sku" | "fixed_default";

export interface ScanPayload {
  cartonId: string;
  gtin?: string | null;
  lot?: string | null;
  expiry?: string | null; // YYYYMMDD
  serial?: string | null;
  poNumber?: string | null;
  skuBbox?: { x_mm: number; y_mm: number; w_mm: number; h_mm: number } | null;
  camBClear?: boolean | null;
  confidence?: number | null;
}

export interface RunConfig {
  runId: string;
  lineId: string;
  operatorId: string;
  expectedGtin: string;
  expectedLot: string;
  expectedExpiry: string; // ISO YYYY-MM-DD
  confidenceThreshold: number; // default 0.85
  shelfLifeDaysMin?: number | null;
  holdConfidenceMin?: number | null;
  tampDefaultX?: number | null;
  tampDefaultY?: number | null;
}

export interface SkuConfig {
  shelfLifeDaysMin?: number | null;
  holdConfidenceMin?: number | null;
  lotPattern?: string | null;
}

export interface VerdictResult {
  verdict: Verdict;
  failReason?: FailReason;
  placement: Placement;
  tampXMm: number;
  tampYMm: number;
  labelZpl?: string;
}

/**
 * Parse YYYYMMDD expiry string to a Date (midnight UTC).
 */
function parseExpiry(yyyymmdd: string): Date | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  const dt = new Date(Date.UTC(y, m, d));
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Evaluate all 6 pass conditions and return a verdict + reason.
 */
export function evaluateVerdict(
  payload: ScanPayload,
  run: RunConfig,
  skuCfg?: SkuConfig | null,
  now: Date = new Date()
): VerdictResult {
  const confidenceThreshold = run.confidenceThreshold ?? 0.85;
  const holdConfidenceMin =
    skuCfg?.holdConfidenceMin != null
      ? Number(skuCfg.holdConfidenceMin)
      : run.holdConfidenceMin != null
      ? Number(run.holdConfidenceMin)
      : 0.7;
  const shelfLifeDaysMin =
    skuCfg?.shelfLifeDaysMin != null
      ? skuCfg.shelfLifeDaysMin
      : run.shelfLifeDaysMin ?? null;

  // Determine tamp placement and coordinates
  const hasSkuBbox = payload.skuBbox != null;
  const placement: Placement = hasSkuBbox ? "over_sku" : "fixed_default";
  const tampXMm = hasSkuBbox
    ? payload.skuBbox!.x_mm + payload.skuBbox!.w_mm / 2
    : Number(run.tampDefaultX ?? 50);
  const tampYMm = hasSkuBbox
    ? payload.skuBbox!.y_mm + payload.skuBbox!.h_mm / 2
    : Number(run.tampDefaultY ?? 100);

  // Condition 1: GTIN must be present and match
  if (!payload.gtin) {
    return { verdict: "fail", failReason: "NO_DECODE", placement, tampXMm, tampYMm };
  }
  if (payload.gtin !== run.expectedGtin) {
    return { verdict: "fail", failReason: "GTIN_MISMATCH", placement, tampXMm, tampYMm };
  }

  // Condition 2: Lot must match (exact or regex if skuCfg.lotPattern set)
  if (!payload.lot) {
    return { verdict: "fail", failReason: "LOT_MISMATCH", placement, tampXMm, tampYMm };
  }
  if (skuCfg?.lotPattern) {
    try {
      const re = new RegExp(skuCfg.lotPattern);
      if (!re.test(payload.lot)) {
        // Partial match → hold if lot is at least partially recognisable
        return { verdict: "hold", failReason: "LOT_MISMATCH", placement, tampXMm, tampYMm };
      }
    } catch {
      // Invalid regex — fall back to exact match
      if (payload.lot !== run.expectedLot) {
        return { verdict: "fail", failReason: "LOT_MISMATCH", placement, tampXMm, tampYMm };
      }
    }
  } else {
    if (payload.lot !== run.expectedLot) {
      return { verdict: "fail", failReason: "LOT_MISMATCH", placement, tampXMm, tampYMm };
    }
  }

  // Condition 3 & 4: Expiry checks
  if (!payload.expiry) {
    return { verdict: "fail", failReason: "EXPIRED", placement, tampXMm, tampYMm };
  }
  const expiryDate = parseExpiry(payload.expiry);
  if (!expiryDate) {
    return { verdict: "fail", failReason: "EXPIRED", placement, tampXMm, tampYMm };
  }
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (expiryDate < todayUtc) {
    return { verdict: "fail", failReason: "EXPIRED", placement, tampXMm, tampYMm };
  }
  if (shelfLifeDaysMin != null) {
    const daysRemaining = Math.floor((expiryDate.getTime() - todayUtc.getTime()) / 86_400_000);
    if (daysRemaining < shelfLifeDaysMin) {
      return { verdict: "fail", failReason: "EXPIRY_WINDOW", placement, tampXMm, tampYMm };
    }
  }

  // Condition 5: Confidence score
  const confidence = payload.confidence ?? 1.0;
  if (confidence < confidenceThreshold) {
    // Hold if between holdConfidenceMin and confidenceThreshold
    if (confidence >= holdConfidenceMin) {
      return { verdict: "hold", failReason: "LOW_CONFIDENCE", placement, tampXMm, tampYMm };
    }
    return { verdict: "fail", failReason: "LOW_CONFIDENCE", placement, tampXMm, tampYMm };
  }

  // Condition 6: No stray label on opposite face
  if (payload.camBClear === false) {
    return { verdict: "fail", failReason: "STRAY_LABEL", placement, tampXMm, tampYMm };
  }

  // All conditions passed — generate ZPL label
  const labelZpl = generateQcPassZpl({
    gtin: payload.gtin,
    lot: payload.lot,
    expiry: payload.expiry,
    runId: run.runId,
    lineId: run.lineId,
    operatorId: run.operatorId,
    poNumber: payload.poNumber ?? undefined,
    serial: payload.serial ?? undefined,
    timestamp: now,
  });

  return { verdict: "pass", placement, tampXMm, tampYMm, labelZpl };
}

// ─── ZPL Generator ────────────────────────────────────────────────────────────

interface ZplParams {
  gtin: string;
  lot: string;
  expiry: string; // YYYYMMDD
  runId: string;
  lineId: string;
  operatorId: string;
  poNumber?: string;
  serial?: string;
  timestamp: Date;
}

/**
 * Generate a 4×6" ZPL II label for a QC-passed carton.
 *
 * Layout (203 DPI, 4"×6" = 812×1218 dots):
 *   - QC PASS header (large bold)
 *   - Date/time of inspection
 *   - GS1-128 barcode encoding GTIN + lot + expiry
 *   - Human-readable GTIN, lot, expiry fields
 *   - Operator ID and run/line reference
 */
export function generateQcPassZpl(params: ZplParams): string {
  const { gtin, lot, expiry, runId, lineId, operatorId, poNumber, serial, timestamp } = params;

  // Format expiry for human display: YYYYMMDD → YYYY-MM-DD
  const expiryDisplay =
    expiry.length === 8
      ? `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}`
      : expiry;

  // Format timestamp
  const ts = timestamp.toISOString().replace("T", " ").slice(0, 19);

  // Build GS1-128 data string with application identifiers
  // (01)GTIN(10)LOT(17)EXPIRY
  const gs1Data = `(01)${gtin}(10)${lot}(17)${expiry.slice(2)}`;

  const lines: string[] = [
    "^XA",
    "^CI28", // UTF-8 encoding
    // Label dimensions: 4" × 6" at 203 DPI
    "^PW812",
    "^LL1218",
    // ── QC PASS header ──────────────────────────────────────
    "^FO20,20^A0N,80,80^FD✓ QC PASS^FS",
    `^FO20,110^A0N,28,28^FD${ts}^FS`,
    // Separator line
    "^FO20,150^GB772,3,3^FS",
    // ── GS1-128 barcode ─────────────────────────────────────
    // Encode as Code 128 with GS1 flag
    `^FO20,165^BY2,3,80^BCN,80,Y,N,N^FD>:${gs1Data}^FS`,
    // ── Human-readable fields ────────────────────────────────
    "^FO20,310^A0N,24,24^FDGTIN:^FS",
    `^FO120,310^A0N,24,24^FD${gtin}^FS`,
    "^FO20,345^A0N,24,24^FDLot:^FS",
    `^FO120,345^A0N,24,24^FD${lot}^FS`,
    "^FO20,380^A0N,24,24^FDExpiry:^FS",
    `^FO120,380^A0N,24,24^FD${expiryDisplay}^FS`,
    ...(serial ? [`^FO20,415^A0N,24,24^FDSerial:^FS`, `^FO120,415^A0N,24,24^FD${serial}^FS`] : []),
    ...(poNumber ? [`^FO20,450^A0N,24,24^FDPO:^FS`, `^FO120,450^A0N,24,24^FD${poNumber}^FS`] : []),
    // Separator
    "^FO20,490^GB772,2,2^FS",
    // ── Run / operator reference ─────────────────────────────
    `^FO20,500^A0N,22,22^FDLine: ${lineId}   Operator: ${operatorId}^FS`,
    `^FO20,530^A0N,22,22^FDRun: ${runId.slice(0, 16)}^FS`,
    "^XZ",
  ];

  return lines.join("\n");
}
