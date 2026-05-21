/**
 * GD Pallet Label PDF Generator
 *
 * 4in × 6in thermal label per pallet:
 *  - Ship From | Ship To  (two-column)
 *  - Transaction ID (large) | Weight & Dims
 *  - Packing slip: SKU / Description / Qty table with filler ruled lines
 *  - Total QTY + Pallet X of Y
 *  - Large Code128 barcode (pallet-specific UPC) — bottom quarter
 *  - SSCC caption below barcode
 */
import PDFDocument from "pdfkit";

// ─── Page constants: 4in × 6in at 72pt/in ────────────────────────────────────
const PW     = 4 * 72;   // 288 pt
const PH     = 6 * 72;   // 432 pt
const MARGIN = 10;
const MID    = PW / 2;

// ─── Colours ──────────────────────────────────────────────────────────────────
const BLACK      = "#000000";
const DARK_GRAY  = "#333333";
const MID_GRAY   = "#888888";
const LIGHT_GRAY = "#CCCCCC";

// ─── Code128 B encoder ────────────────────────────────────────────────────────
const CODE128_PATTERNS: string[] = [
  "11011001100","11001101100","11001100110","10010011000","10010001100",
  "10001001100","10011001000","10011000100","10001100100","11001001000",
  "11001000100","11000100100","10110011100","10011011100","10011001110",
  "10111001100","10011101100","10011100110","11001110010","11001011100",
  "11001001110","11011100100","11001110100","11101101110","11101001100",
  "11100101100","11100100110","11101100100","11100110100","11100110010",
  "11011011000","11011000110","11000110110","10100011000","10001011000",
  "10001000110","10110001000","10001101000","10001100010","11010001000",
  "11000101000","11000100010","10110111000","10110001110","10001101110",
  "10111011000","10111000110","10001110110","11101110110","11010001110",
  "11000101110","11011101000","11011100010","11011101110","11101011000",
  "11101000110","11100010110","11010111000","11010001110","11000101110",
  "11101101000","11101100010","11100011010","11101111010","11001000010",
  "11110001010","10100110000","10100001100","10010110000","10010000110",
  "10000101100","10000100110","10110010000","10110000100","10011010000",
  "10011000010","10000110100","10000110010","11000010010","11001010000",
  "11110111010","11000010100","10001111010","10100111100","10010111100",
  "10010011110","10111100100","10011110100","10011110010","11110100100",
  "11110010100","11110010010","11011011110","11011110110","11110110110",
  "10101111000","10100011110","10001011110","10111101000","10111100010",
  "11110101000","11110100010","10111011110","10111101110","11101011110",
  "11110101110","11010000100","11010010000","11010011100","1100011101011",
];

function encodeCode128B(data: string): string {
  const start = 104;
  const codes: number[] = [start];
  let chk = start;
  for (let i = 0; i < data.length; i++) {
    const v = data.charCodeAt(i) - 32;
    codes.push(v);
    chk += v * (i + 1);
  }
  codes.push(chk % 103);
  codes.push(106); // stop
  return codes.map((c) => CODE128_PATTERNS[c]).join("");
}

// ─── 203 DPI barcode optimisation ────────────────────────────────────────────
// At 203 DPI, 1 dot = 72/203 ≈ 0.3547 pt.
// Fractional bar widths cause uneven dot rounding when the PDF is rasterised by
// the thermal printer driver, producing bars that are 1 dot too wide or narrow.
// Fix: snap every module to the nearest integer number of dots, accumulate the
// sub-dot remainder, and flush it into the next module (error-diffusion).
// This guarantees every printed bar is an exact integer number of dots wide.
const DOTS_PER_INCH = 203;
const PT_PER_DOT    = 72 / DOTS_PER_INCH;   // ≈ 0.35468 pt

function drawCode128(
  doc: PDFKit.PDFDocument,
  data: string,
  x: number,
  y: number,
  targetW: number,
  barH: number
) {
  const bits = encodeCode128B(data);

  // Ideal module width in dots (may be fractional)
  const idealDotsPerModule = (targetW / PT_PER_DOT) / bits.length;

  // Build an array of integer dot-widths using error-diffusion rounding
  // so the total always sums to exactly targetW in dots.
  let accumErr = 0;
  const dotWidths: number[] = [];
  for (let i = 0; i < bits.length; i++) {
    const exact = idealDotsPerModule + accumErr;
    const rounded = Math.round(exact);
    accumErr = exact - rounded;
    dotWidths.push(Math.max(1, rounded));  // minimum 1 dot per module
  }

  // Draw — convert dot widths back to points for PDFKit
  let cx = x;
  doc.save().fillColor(BLACK);
  for (let i = 0; i < bits.length; i++) {
    const ptW = dotWidths[i] * PT_PER_DOT;
    if (bits[i] === "1") {
      doc.rect(cx, y, ptW, barH).fill();
    }
    cx += ptW;
  }
  doc.restore();
}

// ─── Label data shape ─────────────────────────────────────────────────────────
export interface GdPalletLabelData {
  // Ship From (always GD)
  shipFromName: string;
  shipFromAddress: string;
  shipFromCityStateZip: string;
  // Ship To (customer)
  shipToName: string;
  shipToAddress: string;
  shipToCityStateZip: string;
  // Order info
  transactionId: string | number;
  referenceNumber?: string;
  poNumber?: string;
  weightLbs?: number;
  dimL?: number;
  dimW?: number;
  dimH?: number;
  // Pallet info
  palletNumber: number;
  totalPallets: number;
  palletUpc: string;   // used as barcode value
  // Items on this pallet
  items: Array<{ sku: string; description?: string | null; qty: number; caseAmount?: number }>;
}

// ─── Main generator ───────────────────────────────────────────────────────────
export function generateGdPalletLabel(
  pallets: GdPalletLabelData[],
  outputStream: NodeJS.WritableStream
): void {
  const doc = new PDFDocument({
    size: [PW, PH],
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
  });
  doc.pipe(outputStream);

  // Print 2 copies of each pallet label
  for (const pallet of pallets) {
    doc.addPage({ size: [PW, PH], margin: 0 });
    _drawLabel(doc, pallet);
    doc.addPage({ size: [PW, PH], margin: 0 });
    _drawLabel(doc, pallet);
  }

  doc.end();
}

function _drawLabel(doc: PDFKit.PDFDocument, p: GdPalletLabelData) {
  // ── Zone heights (pt) ──────────────────────────────────────────────────────
  const ADDR_H  = 62;   // Ship From / Ship To (compact — extra lines for packing slip)
  const INFO_H  = 54;   // Trans ID + dims
  const FOOT_H  = 44;   // Total QTY + Pallet row — extra height so text is visually centered
  const BC_H    = PH * 0.18;  // reduced from 25% to 18% for better scannability
  const SLIP_H  = PH - ADDR_H - INFO_H - FOOT_H - BC_H;

  let y = 0;

  // ── SECTION 1: Ship From / Ship To ─────────────────────────────────────────
  // Vertical divider
  doc.save()
    .moveTo(MID, MARGIN)
    .lineTo(MID, ADDR_H - 3)
    .lineWidth(0.5)
    .strokeColor(DARK_GRAY)
    .stroke()
    .restore();

  // Labels
  doc.fillColor(MID_GRAY).fontSize(6).font("Helvetica");
  doc.text("Ship From:", MARGIN, MARGIN + 2, { lineBreak: false });
  doc.text("Ship To:", MID + MARGIN, MARGIN + 2, { lineBreak: false });

  // Names (bold)
  doc.fillColor(BLACK).fontSize(9).font("Helvetica-Bold");
  doc.text(p.shipFromName, MARGIN, MARGIN + 12, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipToName,   MID + MARGIN, MARGIN + 12, { lineBreak: false, width: MID - MARGIN * 2 });

  // Addresses
  doc.fillColor(DARK_GRAY).fontSize(7).font("Helvetica");
  doc.text(p.shipFromAddress,      MARGIN, MARGIN + 24, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipToAddress,        MID + MARGIN, MARGIN + 24, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipFromCityStateZip, MARGIN, MARGIN + 33, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipToCityStateZip,   MID + MARGIN, MARGIN + 33, { lineBreak: false, width: MID - MARGIN * 2 });

  y = ADDR_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1.5);

  // ── SECTION 2: Transaction ID | Weight & Dims ──────────────────────────────
  // Vertically center content within INFO_H band.
  // Left column: label (6pt) + 26pt TX ID — total content ~34pt, center in 54pt band
  // Right column: label (6pt) + 11pt weight + 4pt gap + 11pt dims — total ~38pt
  const INFO_LABEL_Y = y + 5;                       // tiny "Transaction ID" / "Weight & Dims" label
  const INFO_TX_Y    = y + Math.round((INFO_H - 26) / 2) + 2; // 26pt TX ID vertically centered
  // Right column: weight + dims block height = 6(label)+4+11(weight)+4+11(dims)=36pt; center in 54pt
  const INFO_WT_Y    = y + Math.round((INFO_H - 30) / 2) + 4; // weight line
  const INFO_DIM_Y   = INFO_WT_Y + 15;              // dims line, 15pt below weight

  doc.fillColor(MID_GRAY).fontSize(6).font("Helvetica");
  doc.text("Transaction ID", MARGIN, INFO_LABEL_Y, { lineBreak: false });
  doc.text("Weight & Dims",  MID + MARGIN, INFO_LABEL_Y, { lineBreak: false });

  doc.fillColor(BLACK).fontSize(18).font("Helvetica-Bold");
  doc.text(String(p.transactionId), MARGIN, INFO_TX_Y, { lineBreak: false, width: MID - MARGIN * 2 });

  const weightStr = p.weightLbs != null ? `${p.weightLbs} LBS` : "—";
  const dimStr    = (p.dimL != null && p.dimW != null && p.dimH != null)
    ? `${p.dimL} × ${p.dimW} × ${p.dimH} in`
    : "";

  doc.fillColor(BLACK).fontSize(11).font("Helvetica-Bold");
  doc.text(weightStr, MID + MARGIN, INFO_WT_Y, { lineBreak: false });
  if (dimStr) {
    doc.fillColor(BLACK).fontSize(11).font("Helvetica-Bold");
    doc.text(dimStr, MID + MARGIN, INFO_DIM_Y, { lineBreak: false });
  }

  doc.save()
    .moveTo(MID, y + 4)
    .lineTo(MID, y + INFO_H - 4)
    .lineWidth(0.5)
    .strokeColor(DARK_GRAY)
    .stroke()
    .restore();

  y += INFO_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1.5);

  // ── SECTION 3: Packing slip ────────────────────────────────────────────────
  // Four columns: SKU | Description | Units | Cases
  const COL_SKU   = MARGIN;
  const COL_DESC  = MARGIN + 90;
  const COL_CASES = PW - MARGIN - 22;          // right-most: Cases
  const COL_UNITS = COL_CASES - 36;            // second from right: Units
  const HDR_Y     = y + 5;
  const ROW_H     = 17;  // pt per row

  doc.fillColor(BLACK).fontSize(7).font("Helvetica-Bold");
  doc.text("SKU",         COL_SKU,   HDR_Y, { lineBreak: false });
  doc.text("Description", COL_DESC,  HDR_Y, { lineBreak: false });
  doc.text("Units",       COL_UNITS, HDR_Y, { lineBreak: false });
  doc.text("Cases",       COL_CASES, HDR_Y, { lineBreak: false });
  _hline(doc, HDR_Y + 11, MARGIN, PW - MARGIN, 0.5);

  const maxRows = Math.floor((SLIP_H - 20) / ROW_H);

  for (let i = 0; i < maxRows; i++) {
    const ry = HDR_Y + 14 + i * ROW_H;
    if (i < p.items.length) {
      const item  = p.items[i];
      const units = item.qty;                                          // qty is already in eaches
      const cases = Math.floor(item.qty / Math.max(item.caseAmount ?? 1, 1)); // cases = eaches ÷ pack size
      doc.fillColor(BLACK).fontSize(7).font("Helvetica");
      doc.text(item.sku,              COL_SKU,   ry + 2, { lineBreak: false, width: COL_DESC  - COL_SKU  - 4 });
      doc.text(item.description ?? "", COL_DESC, ry + 2, { lineBreak: false, width: COL_UNITS - COL_DESC - 4 });
      doc.text(String(units),         COL_UNITS, ry + 2, { lineBreak: false });
      doc.text(String(cases),         COL_CASES, ry + 2, { lineBreak: false });
    }
    // Ruled line after each row
    _hline(doc, ry + ROW_H - 1, MARGIN, PW - MARGIN, 0.25, LIGHT_GRAY);
  }

  y += SLIP_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1.5);

  // ── SECTION 4: Pallet X of Y | N Units | N Cases ─────────────────────────
  const totalUnits = p.items.reduce((s, i) => s + i.qty, 0);                                                          // qty is eaches
  const totalCases = p.items.reduce((s, i) => s + Math.floor(i.qty / Math.max(i.caseAmount ?? 1, 1)), 0); // cases = eaches ÷ pack size
  // Use 14pt font so all three items fit on one line comfortably
  const FOOT_FONT = 14;
  // FOOT_H = 44pt. 14pt Helvetica Bold rendered cap-height ≈ 10pt.
  // Visual center offset = (44 - 10) / 2 ≈ 17pt from top of band.
  const footY = y + 17;
  const palletStr  = `Pallet: ${p.palletNumber} of ${p.totalPallets}`;
  const unitsStr   = `${totalUnits} Units`;
  const casesStr   = `${totalCases} Cases`;
  doc.fillColor(BLACK).fontSize(FOOT_FONT).font("Helvetica-Bold");
  // Left: Pallet X of Y
  doc.text(palletStr, MARGIN, footY, { lineBreak: false });
  // Right: Cases (right-justified)
  const casesWidth = doc.widthOfString(casesStr);
  doc.text(casesStr, PW - MARGIN - casesWidth, footY, { lineBreak: false });
  // Middle: Units — centered between left text end and right text start
  const palletWidth = doc.widthOfString(palletStr);
  const leftEdge  = MARGIN + palletWidth + 6;
  const rightEdge = PW - MARGIN - casesWidth - 6;
  const unitsWidth = doc.widthOfString(unitsStr);
  const unitsMidX  = leftEdge + (rightEdge - leftEdge - unitsWidth) / 2;
  doc.text(unitsStr, Math.max(leftEdge, unitsMidX), footY, { lineBreak: false });

  y += FOOT_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1.5);

  // ── SECTION 5: Barcode ─────────────────────────────────────────────────────
  // 203 DPI optimisation: constrain barcode width so the X-dimension (narrow bar)
  // is exactly 2 dots = 9.85 mils — the GS1/Code128 sweet spot for 203 DPI scanners.
  // Formula: maxW = numModules * 2 dots * PT_PER_DOT
  // We calculate numModules from the actual encoded bit string, then cap at label width.
  const BC_DRAW_H = BC_H - 20;
  const BC_Y      = y + 6;
  {
    const { bits: _bits } = (() => {
      // Encode to get exact module count
      function _enc(data: string): string {
        const start = 104;
        const codes: number[] = [start];
        let chk = start;
        for (let i = 0; i < data.length; i++) {
          const v = data.charCodeAt(i) - 32;
          codes.push(v);
          chk += v * (i + 1);
        }
        codes.push(chk % 103);
        codes.push(106);
        return codes.map((c) => CODE128_PATTERNS[c]).join("");
      }
      return { bits: _enc(p.palletUpc) };
    })();
    const TARGET_X_DOTS = 2;                              // 2 dots per narrow module = 9.85 mils
    const idealW  = _bits.length * TARGET_X_DOTS * PT_PER_DOT;
    const maxW    = PW - MARGIN * 2;
    const BC_W    = Math.min(idealW, maxW);
    const BC_X    = MARGIN + (maxW - BC_W) / 2;          // center on label

    drawCode128(doc, p.palletUpc, BC_X, BC_Y, BC_W, BC_DRAW_H);

    // SSCC caption — centered under barcode
    doc.fillColor(DARK_GRAY).fontSize(6).font("Helvetica");
    const captionW = doc.widthOfString(p.palletUpc);
    doc.text(p.palletUpc, BC_X + (BC_W - captionW) / 2, BC_Y + BC_DRAW_H + 4, { lineBreak: false });
  }
}

function _hline(
  doc: PDFKit.PDFDocument,
  y: number,
  x1 = MARGIN,
  x2 = PW - MARGIN,
  thick = 0.5,
  color = BLACK
) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(thick).strokeColor(color).stroke().restore();
}
