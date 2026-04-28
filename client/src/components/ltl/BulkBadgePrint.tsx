/**
 * BulkBadgePrint.tsx
 * Renders all selected associates as printable badge labels in a hidden
 * print-only container. Each badge is separated by a CSS page break.
 *
 * Usage:
 *   <BulkBadgePrint associates={selected} onClose={() => {}} />
 *
 * Clicking "Print All" triggers window.print(). @media print CSS hides
 * all UI and shows only the badge grid.
 */
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X } from "lucide-react";
import type { AssociateBadgeData } from "./AssociateBadge";

interface Props {
  associates: AssociateBadgeData[];
  open: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  picker: "Picker",
  packer: "Packer",
  receiver: "Receiver",
  supervisor: "Supervisor",
  driver: "Driver",
};

export function BulkBadgePrint({ associates, open, onClose }: Props) {
  const handlePrint = () => window.print();

  return (
    <>
      {/* ── Print-only styles ── */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #bulk-badge-print-root { display: block !important; }
          @page { margin: 0.25in; size: 3.375in 2.125in; }
          .bulk-badge-page { page-break-after: always; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
          .bulk-badge-page:last-child { page-break-after: avoid; }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print {associates.length} Badge{associates.length !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>

          {/* Preview grid — scrollable */}
          <div className="max-h-72 overflow-y-auto space-y-3 py-1 pr-1">
            {associates.map((a) => (
              <PreviewBadge key={a.associateId} associate={a} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Each badge prints on its own page (CR80 card stock, 3.375″ × 2.125″).
          </p>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print All {associates.length} Badge{associates.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Hidden print-only container ── */}
      <div id="bulk-badge-print-root" style={{ display: "none" }}>
        {associates.map((a) => (
          <div key={a.associateId} className="bulk-badge-page">
            <PrintBadgeCard associate={a} roleLabel={a.role ? (ROLE_LABEL[a.role] ?? a.role) : null} />
          </div>
        ))}
      </div>
    </>
  );
}

// ── Small preview card shown in the dialog ────────────────────────────────────
function PreviewBadge({ associate }: { associate: AssociateBadgeData }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, associate.associateId, {
        format: "CODE128",
        width: 1.5,
        height: 40,
        displayValue: true,
        fontSize: 11,
        textMargin: 3,
        margin: 6,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch { /* ignore */ }
  }, [associate.associateId]);

  const roleLabel = associate.role ? (ROLE_LABEL[associate.role] ?? associate.role) : null;

  return (
    <div className="bg-white border-2 border-gray-700 rounded-lg overflow-hidden flex-shrink-0" style={{ width: "100%" }}>
      <div className="bg-gray-900 px-3 py-1 flex items-center justify-between">
        <span className="text-white text-xs font-bold tracking-widest uppercase">Go Direct Solutions</span>
        {roleLabel && <span className="text-yellow-300 text-xs font-semibold uppercase">{roleLabel}</span>}
      </div>
      <div className="px-3 pt-1.5 pb-1">
        <p className="text-gray-900 font-bold text-base leading-tight truncate">{associate.name}</p>
        {associate.warehouseId && (
          <p className="text-gray-500 text-xs uppercase tracking-wide">Warehouse: {associate.warehouseId}</p>
        )}
        <div className="flex justify-center mt-1">
          <svg ref={svgRef} />
        </div>
      </div>
    </div>
  );
}

// ── Full-size badge for actual printing ───────────────────────────────────────
function PrintBadgeCard({ associate, roleLabel }: { associate: AssociateBadgeData; roleLabel: string | null }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, associate.associateId, {
        format: "CODE128",
        width: 2,
        height: 55,
        displayValue: true,
        fontSize: 12,
        fontOptions: "bold",
        textMargin: 3,
        margin: 6,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch { /* ignore */ }
  }, [associate.associateId]);

  return (
    <div style={{
      width: "3.375in", height: "2.125in",
      border: "2px solid #1a1a1a", borderRadius: "8px",
      overflow: "hidden", fontFamily: "Arial, sans-serif",
      backgroundColor: "#ffffff", display: "flex", flexDirection: "column",
    }}>
      <div style={{ backgroundColor: "#111827", padding: "4px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontSize: "9px", fontWeight: "bold", letterSpacing: "2px", textTransform: "uppercase" }}>Go Direct Solutions</span>
        {roleLabel && <span style={{ color: "#fde047", fontSize: "9px", fontWeight: "bold", textTransform: "uppercase" }}>{roleLabel}</span>}
      </div>
      <div style={{ padding: "6px 10px 4px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#111827", lineHeight: 1.2 }}>{associate.name}</p>
        {associate.warehouseId && (
          <p style={{ margin: "2px 0 0", fontSize: "9px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "1px" }}>
            Warehouse: {associate.warehouseId}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "4px" }}>
          <svg ref={svgRef} />
        </div>
      </div>
    </div>
  );
}
