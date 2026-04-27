/**
 * SSCC-18 Pallet Label PDF Generator
 *
 * 4in × 6in thermal label per pallet (GS1-128 / SSCC-18 compliant layout):
 *  - Ship From | Ship To  (two-column header)
 *  - GDC# | TYPE | DEPT | ORDER#  (four-field row)
 *  - PRO | PO | B/L  (three-field row)
 *  - Large centre text: customer name / pallet description
 *  - # of cases line
 *  - Large SSCC-18 barcode — bottom half
 *  - (00) formatted SSCC number below barcode
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

function drawCode128(
  doc: PDFKit.PDFDocument,
  data: string,
  x: number,
  y: number,
  targetW: number,
  barH: number
) {
  const bits = encodeCode128B(data);
  const barW = targetW / bits.length;
  let cx = x;
  doc.save().fillColor(BLACK);
  for (const bit of bits) {
    if (bit === "1") {
      doc.rect(cx, y, barW, barH).fill();
    }
    cx += barW;
  }
  doc.restore();
}

// ─── Label data shape ─────────────────────────────────────────────────────────
export interface SsccLabelData {
  // Ship From (always GD)
  shipFromName: string;
  shipFromAddress: string;
  shipFromCityStateZip: string;
  // Ship To (customer)
  shipToName: string;
  shipToAddress: string;
  shipToCityStateZip: string;
  // GS1 fields
  gdcNumber?: string;       // GDC# (company prefix, e.g. "0000")
  typeCode?: string;        // TYPE (e.g. "0033")
  deptCode?: string;        // DEPT (e.g. "00012")
  orderNumber: string;      // ORDER# — Transaction ID or reference
  proNumber?: string;       // PRO
  poNumber?: string;        // PO
  billOfLading?: string;    // B/L
  // Pallet description
  palletDescription: string;  // e.g. customer name or "MIXED PALLET"
  caseCount: number;
  // Pallet info
  palletNumber: number;
  totalPallets: number;
  // SSCC-18 value (18 digits) — used as barcode
  sscc18: string;
}

// ─── Main generator ───────────────────────────────────────────────────────────
export function generateSsccLabel(
  pallets: SsccLabelData[],
  outputStream: NodeJS.WritableStream
): void {
  const doc = new PDFDocument({
    size: [PW, PH],
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
  });
  doc.pipe(outputStream);

  for (const pallet of pallets) {
    doc.addPage({ size: [PW, PH], margin: 0 });
    _drawLabel(doc, pallet);
  }

  doc.end();
}

function _drawLabel(doc: PDFKit.PDFDocument, p: SsccLabelData) {
  // ── Zone heights ──────────────────────────────────────────────────────────
  const ADDR_H   = 76;   // Ship From / Ship To
  const GDC_H    = 36;   // GDC# / TYPE / DEPT / ORDER#
  const REF_H    = 28;   // PRO / PO / B/L
  const DESC_H   = 52;   // Large centre text
  const CASES_H  = 22;   // # of cases
  const BC_H     = PH - ADDR_H - GDC_H - REF_H - DESC_H - CASES_H;

  let y = 0;

  // ── SECTION 1: Ship From / Ship To ─────────────────────────────────────────
  doc.save()
    .moveTo(MID, MARGIN)
    .lineTo(MID, ADDR_H - 3)
    .lineWidth(0.5)
    .strokeColor(DARK_GRAY)
    .stroke()
    .restore();

  doc.fillColor(MID_GRAY).fontSize(6).font("Helvetica");
  doc.text("Ship From:", MARGIN, MARGIN + 2, { lineBreak: false });
  doc.text("Ship To:",   MID + MARGIN, MARGIN + 2, { lineBreak: false });

  doc.fillColor(BLACK).fontSize(9).font("Helvetica-Bold");
  doc.text(p.shipFromName, MARGIN, MARGIN + 12, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipToName,   MID + MARGIN, MARGIN + 12, { lineBreak: false, width: MID - MARGIN * 2 });

  doc.fillColor(DARK_GRAY).fontSize(7).font("Helvetica");
  doc.text(p.shipFromAddress,      MARGIN, MARGIN + 24, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipToAddress,        MID + MARGIN, MARGIN + 24, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipFromCityStateZip, MARGIN, MARGIN + 33, { lineBreak: false, width: MID - MARGIN * 2 });
  doc.text(p.shipToCityStateZip,   MID + MARGIN, MARGIN + 33, { lineBreak: false, width: MID - MARGIN * 2 });

  y = ADDR_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1.5);

  // ── SECTION 2: GDC# / TYPE / DEPT / ORDER# ────────────────────────────────
  const COL_W = (PW - MARGIN * 2) / 4;
  const fields = [
    { label: "GDC#",   value: p.gdcNumber ?? "—" },
    { label: "TYPE",   value: p.typeCode  ?? "—" },
    { label: "DEPT",   value: p.deptCode  ?? "—" },
    { label: "ORDER#", value: p.orderNumber },
  ];
  fields.forEach((f, i) => {
    const fx = MARGIN + i * COL_W;
    doc.fillColor(MID_GRAY).fontSize(6).font("Helvetica");
    doc.text(f.label, fx, y + 4, { lineBreak: false });
    doc.fillColor(BLACK).fontSize(10).font("Helvetica-Bold");
    doc.text(f.value, fx, y + 13, { lineBreak: false, width: COL_W - 2 });
    if (i < 3) {
      doc.save()
        .moveTo(fx + COL_W, y + 3)
        .lineTo(fx + COL_W, y + GDC_H - 3)
        .lineWidth(0.5)
        .strokeColor(LIGHT_GRAY)
        .stroke()
        .restore();
    }
  });

  y += GDC_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1);

  // ── SECTION 3: PRO / PO / B/L ─────────────────────────────────────────────
  const refFields = [
    { label: "PRO:", value: p.proNumber ?? "" },
    { label: "PO:",  value: p.poNumber  ?? "" },
    { label: "B/L:", value: p.billOfLading ?? "" },
  ];
  const refY = y + 5;
  let rx = MARGIN;
  refFields.forEach((f) => {
    doc.fillColor(MID_GRAY).fontSize(7).font("Helvetica");
    doc.text(f.label, rx, refY, { lineBreak: false });
    doc.fillColor(BLACK).fontSize(7).font("Helvetica-Bold");
    doc.text(f.value, rx + 18, refY, { lineBreak: false, width: 60 });
    rx += 90;
  });

  y += REF_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1.5);

  // ── SECTION 4: Large pallet description ───────────────────────────────────
  doc.fillColor(BLACK).fontSize(22).font("Helvetica-Bold");
  doc.text(p.palletDescription.toUpperCase(), MARGIN, y + 8, {
    width: PW - MARGIN * 2,
    align: "center",
    lineBreak: false,
  });

  y += DESC_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 0.5, LIGHT_GRAY);

  // ── SECTION 5: Case count + Pallet X of Y ─────────────────────────────────
  doc.fillColor(BLACK).fontSize(9).font("Helvetica");
  doc.text(`# of cases: ${p.caseCount}`, MARGIN, y + 5, { lineBreak: false });
  doc.text(`Pallet: ${p.palletNumber} of ${p.totalPallets}`, MID, y + 5, { lineBreak: false });

  y += CASES_H;
  _hline(doc, y, MARGIN, PW - MARGIN, 1.5);

  // ── SECTION 6: SSCC-18 barcode ────────────────────────────────────────────
  const BC_DRAW_H = BC_H - 22;
  const BC_Y      = y + 4;
  const BC_W      = PW - MARGIN * 2;

  // Encode with GS1-128 Application Identifier (00) prefix
  const barcodeData = `00${p.sscc18}`;
  drawCode128(doc, barcodeData, MARGIN, BC_Y, BC_W, BC_DRAW_H);

  // SSCC caption in GS1 format
  const ssccDisplay = `(00) ${p.sscc18.replace(/(\d{2})(\d{9})(\d{7})/, "$1 $2 $3")}`;
  doc.fillColor(DARK_GRAY).fontSize(7).font("Helvetica");
  doc.text(ssccDisplay, MARGIN, BC_Y + BC_DRAW_H + 4, {
    width: PW - MARGIN * 2,
    align: "center",
    lineBreak: false,
  });
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
