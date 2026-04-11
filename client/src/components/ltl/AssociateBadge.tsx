/**
 * AssociateBadge.tsx
 * Renders a printable badge label for a warehouse associate.
 * Uses JsBarcode to generate a Code 128 barcode from the associate ID.
 *
 * Usage:
 *   <AssociateBadge associate={...} onClose={() => {}} />
 *
 * Clicking "Print" triggers window.print() which uses @media print CSS
 * to show only the badge and hide all other UI.
 */
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X } from "lucide-react";

export interface AssociateBadgeData {
  associateId: string;
  name: string;
  warehouseId?: string | null;
  role?: string | null;
}

interface Props {
  associate: AssociateBadgeData;
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

export function AssociateBadge({ associate, open, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, associate.associateId, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 13,
        fontOptions: "bold",
        textMargin: 4,
        margin: 8,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // JsBarcode throws on invalid input — silently ignore
    }
  }, [open, associate.associateId]);

  const handlePrint = () => {
    window.print();
  };

  const roleLabel = associate.role ? (ROLE_LABEL[associate.role] ?? associate.role) : null;

  return (
    <>
      {/* ── Print-only styles injected into <head> ── */}
      <style>{`
        @media print {
          /* Hide everything */
          body > * { display: none !important; }
          /* Show only the badge */
          #associate-badge-print-root { display: flex !important; }
          /* Reset page margins */
          @page { margin: 0.25in; size: 3.375in 2.125in; }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print Associate Badge
            </DialogTitle>
          </DialogHeader>

          {/* Badge preview */}
          <div className="flex justify-center py-2">
            <BadgeCard associate={associate} svgRef={svgRef} roleLabel={roleLabel} />
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Badge sized for CR80 credit-card stock (3.375″ × 2.125″).
            Set your printer to "Fit to page" for best results.
          </p>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Hidden print-only root (shown only during window.print()) ── */}
      <div
        id="associate-badge-print-root"
        style={{ display: "none", justifyContent: "center", alignItems: "center", width: "100vw", height: "100vh" }}
      >
        <BadgeCardPrint associate={associate} roleLabel={roleLabel} />
      </div>
    </>
  );
}

// ── Badge card shown in the dialog preview ────────────────────────────────────
function BadgeCard({
  associate,
  svgRef,
  roleLabel,
}: {
  associate: AssociateBadgeData;
  svgRef: React.RefObject<SVGSVGElement | null>;
  roleLabel: string | null;
}) {
  return (
    <div
      className="bg-white border-2 border-gray-800 rounded-lg overflow-hidden shadow-lg"
      style={{ width: 270, minHeight: 170 }}
    >
      {/* Header strip */}
      <div className="bg-gray-900 px-3 py-1.5 flex items-center justify-between">
        <span className="text-white text-xs font-bold tracking-widest uppercase">Go Direct Logistics</span>
        {roleLabel && (
          <span className="text-yellow-300 text-xs font-semibold uppercase tracking-wide">{roleLabel}</span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-gray-900 font-bold text-lg leading-tight truncate">{associate.name}</p>
        {associate.warehouseId && (
          <p className="text-gray-500 text-xs mt-0.5 uppercase tracking-wide">
            Warehouse: {associate.warehouseId}
          </p>
        )}
        {/* Barcode */}
        <div className="flex justify-center mt-1">
          <svg ref={svgRef} />
        </div>
      </div>
    </div>
  );
}

// ── Badge card rendered only for printing (no ref needed — uses a fresh SVG) ──
function BadgeCardPrint({
  associate,
  roleLabel,
}: {
  associate: AssociateBadgeData;
  roleLabel: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

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
    } catch {
      // ignore
    }
  }, [associate.associateId]);

  return (
    <div
      style={{
        width: "3.375in",
        height: "2.125in",
        border: "2px solid #1a1a1a",
        borderRadius: "8px",
        overflow: "hidden",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: "#111827",
          padding: "4px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "#ffffff", fontSize: "9px", fontWeight: "bold", letterSpacing: "2px", textTransform: "uppercase" }}>
          Go Direct Logistics
        </span>
        {roleLabel && (
          <span style={{ color: "#fde047", fontSize: "9px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>
            {roleLabel}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "6px 10px 4px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#111827", lineHeight: 1.2 }}>
          {associate.name}
        </p>
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
