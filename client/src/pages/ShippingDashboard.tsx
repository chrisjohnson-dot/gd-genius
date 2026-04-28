import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Ship, RefreshCw, MapPin, Package, Clock, Search,
  ChevronDown, ChevronRight, Pencil, AlertTriangle, CheckCircle2, Timer, Truck,
  FlaskConical, ArrowRight, ClipboardList, Calendar, Hash, Building2, ExternalLink,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInOutbound(shipReadyAt: Date | string | null): number {
  if (!shipReadyAt) return 0;
  return Math.floor((Date.now() - new Date(shipReadyAt).getTime()) / 86_400_000);
}

function daysBadgeClass(days: number) {
  if (days >= 5) return "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30";
  if (days >= 3) return "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30";
  if (days >= 1) return "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30";
  return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30";
}

function daysBadgeIcon(days: number) {
  if (days >= 5) return <AlertTriangle className="h-3 w-3" />;
  if (days >= 3) return <Timer className="h-3 w-3" />;
  return <CheckCircle2 className="h-3 w-3" />;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d as string);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OutboundOrder = {
  id: number;
  extensivOrderId: number;
  referenceNum: string | null;
  poNum: string | null;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  totalPieces: number | null;
  requiredShipDate: string | null;
  outboundLocation: string | null;
  palletCount: number | null;
  shipReadyAt: Date | string | null;
  shippedAt?: Date | string | null;
  firstSeenAt: Date | string;
  displayStatus?: "ship_ready" | "shipped";
};

// ─── Demo Data ────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const DEMO_ORDERS: OutboundOrder[] = [
  {
    id: 1001, extensivOrderId: 3_290_001, referenceNum: "REF-88201", poNum: "PO-44901",
    clientId: 1, clientName: "Keurig Dr Pepper", facilityId: 1, facilityName: "GD — Brampton",
    shipToName: "Walmart Distribution Center #7042", shipToCity: "Bentonville, AR",
    totalPieces: 1_440, requiredShipDate: fmtDate(daysAgo(-1)),
    outboundLocation: "OB-A3", palletCount: 24, shipReadyAt: daysAgo(0), firstSeenAt: daysAgo(0),
  },
  {
    id: 1002, extensivOrderId: 3_290_002, referenceNum: "REF-88202", poNum: "PO-44902",
    clientId: 1, clientName: "Keurig Dr Pepper", facilityId: 1, facilityName: "GD — Brampton",
    shipToName: "Costco Wholesale — Mississauga DC", shipToCity: "Mississauga, ON",
    totalPieces: 1_080, requiredShipDate: fmtDate(daysAgo(0)),
    outboundLocation: "OB-B1", palletCount: 18, shipReadyAt: daysAgo(3), firstSeenAt: daysAgo(3),
  },
  {
    id: 1003, extensivOrderId: 3_290_003, referenceNum: "REF-88203", poNum: "PO-44903",
    clientId: 1, clientName: "Keurig Dr Pepper", facilityId: 1, facilityName: "GD — Brampton",
    shipToName: "Loblaw Companies — Brampton RDC", shipToCity: "Brampton, ON",
    totalPieces: 1_800, requiredShipDate: fmtDate(daysAgo(2)),
    outboundLocation: "OB-C2", palletCount: 30, shipReadyAt: daysAgo(6), firstSeenAt: daysAgo(6),
  },
  {
    id: 1004, extensivOrderId: 3_290_004, referenceNum: "REF-88204", poNum: "PO-44904",
    clientId: 2, clientName: "Clearwater Seafoods", facilityId: 1, facilityName: "GD — Brampton",
    shipToName: "Amazon Fulfillment Center YYZ4", shipToCity: "Brampton, ON",
    totalPieces: 720, requiredShipDate: fmtDate(daysAgo(-2)),
    outboundLocation: "OB-A1", palletCount: 12, shipReadyAt: daysAgo(1), firstSeenAt: daysAgo(1),
  },
  {
    id: 1005, extensivOrderId: 3_290_005, referenceNum: "REF-88205", poNum: "PO-44905",
    clientId: 2, clientName: "Clearwater Seafoods", facilityId: 1, facilityName: "GD — Brampton",
    shipToName: "Metro Inc. — Laval DC", shipToCity: "Laval, QC",
    totalPieces: 1_200, requiredShipDate: fmtDate(daysAgo(-1)),
    outboundLocation: "OB-D4", palletCount: 20, shipReadyAt: daysAgo(4), firstSeenAt: daysAgo(4),
  },
  {
    id: 1006, extensivOrderId: 3_290_006, referenceNum: "REF-88206", poNum: "PO-44906",
    clientId: 3, clientName: "Nature's Path Organic", facilityId: 2, facilityName: "GD — Mississauga",
    shipToName: "Sobeys Distribution — Vaughan", shipToCity: "Vaughan, ON",
    totalPieces: 960, requiredShipDate: fmtDate(daysAgo(-1)),
    outboundLocation: null, palletCount: 16, shipReadyAt: daysAgo(2), firstSeenAt: daysAgo(2),
  },
  {
    id: 1007, extensivOrderId: 3_290_007, referenceNum: "REF-88207", poNum: "PO-44907",
    clientId: 3, clientName: "Nature's Path Organic", facilityId: 2, facilityName: "GD — Mississauga",
    shipToName: "FreshCo — Hamilton DC", shipToCity: "Hamilton, ON",
    totalPieces: 480, requiredShipDate: fmtDate(daysAgo(1)),
    outboundLocation: "OB-E2", palletCount: 8, shipReadyAt: daysAgo(5), firstSeenAt: daysAgo(5),
  },
  {
    id: 1008, extensivOrderId: 3_290_008, referenceNum: "REF-88208", poNum: "PO-44908",
    clientId: 4, clientName: "Burt's Bees Canada", facilityId: 2, facilityName: "GD — Mississauga",
    shipToName: "Shoppers Drug Mart — Etobicoke DC", shipToCity: "Etobicoke, ON",
    totalPieces: 360, requiredShipDate: fmtDate(daysAgo(-3)),
    outboundLocation: "OB-F1", palletCount: 6, shipReadyAt: daysAgo(0), firstSeenAt: daysAgo(0),
  },
  {
    id: 1009, extensivOrderId: 3_290_009, referenceNum: "REF-88209", poNum: "PO-44909",
    clientId: 1, clientName: "Keurig Dr Pepper", facilityId: 1, facilityName: "GD — Brampton",
    shipToName: "Real Canadian Superstore — Oakville", shipToCity: "Oakville, ON",
    totalPieces: 600, requiredShipDate: fmtDate(daysAgo(1)),
    outboundLocation: "OB-G2", palletCount: 10,
    shipReadyAt: daysAgo(2), shippedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    firstSeenAt: daysAgo(3), displayStatus: "shipped",
  },
];

// ─── Demo B2B Shipments (only shown in demo mode) ─────────────────────────────

const DEMO_B2B_SHIPMENTS = [
  { id: "B2B-001", client: "Keurig Dr Pepper", shipTo: "Walmart Distribution Center #7042", shipToAddress: "1050 Walmart Blvd, Bentonville, AR 72712", pallets: 24, outboundLocation: "OB-A3", carrier: "XPO Logistics", proNum: "XPO-8841923", requiredShipDate: "2026-04-09", status: "staged" as const },
  { id: "B2B-002", client: "Keurig Dr Pepper", shipTo: "Costco Wholesale — Mississauga DC", shipToAddress: "5900 Hurontario St, Mississauga, ON L5R 4B3", pallets: 18, outboundLocation: "OB-B1", carrier: "Day & Ross Freight", proNum: "DR-20261104", requiredShipDate: "2026-04-10", status: "staged" as const },
  { id: "B2B-003", client: "Keurig Dr Pepper", shipTo: "Loblaw Companies — Brampton RDC", shipToAddress: "1 Presidents Choice Circle, Brampton, ON L6Y 5S5", pallets: 30, outboundLocation: "OB-C2", carrier: "Challenger Motor Freight", proNum: "CMF-774412", requiredShipDate: "2026-04-08", status: "awaiting_pickup" as const },
  { id: "B2B-004", client: "Keurig Dr Pepper", shipTo: "Amazon Fulfillment Center YYZ4", shipToAddress: "8050 Heritage Rd, Brampton, ON L6Y 0C4", pallets: 12, outboundLocation: "OB-A1", carrier: "FedEx Freight", proNum: "FXF-9920341", requiredShipDate: "2026-04-11", status: "staged" as const },
  { id: "B2B-005", client: "Keurig Dr Pepper", shipTo: "Metro Inc. — Laval DC", shipToAddress: "3050 Boul. Le Carrefour, Laval, QC H7T 2K7", pallets: 20, outboundLocation: "OB-D4", carrier: "Mullen Trucking", proNum: "MUL-330192", requiredShipDate: "2026-04-12", status: "staged" as const },
];

// ─── Shipment Detail Drawer ───────────────────────────────────────────────────

function ShipmentDetailDrawer({
  order,
  isDemo,
  onClose,
  onEdit,
}: {
  order: OutboundOrder;
  isDemo: boolean;
  onClose: () => void;
  onEdit: (o: OutboundOrder) => void;
}) {
  const [, navigate] = useLocation();
  const days = daysInOutbound(order.shipReadyAt);
  const isShipped = order.displayStatus === "shipped";

  function startCarrierPickup() {
    onClose();
    navigate(`/shipping/carrier-pickup?orderId=${order.extensivOrderId}`);
  }

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-base font-semibold">
                Order {order.extensivOrderId}
              </SheetTitle>
              {order.referenceNum && (
                <p className="text-xs text-muted-foreground mt-0.5">Ref: {order.referenceNum}</p>
              )}
            </div>
            {isShipped ? (
              <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700 shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />Shipped
              </Badge>
            ) : (
              <Badge variant="outline" className={cn("shrink-0", daysBadgeClass(days))}>
                {daysBadgeIcon(days)}
                <span className="ml-1">{days === 0 ? "Today" : `${days}d in outbound`}</span>
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="py-5 space-y-5">
          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-4">
            <DetailField icon={<Building2 className="h-3.5 w-3.5" />} label="Client" value={order.clientName} />
            <DetailField icon={<MapPin className="h-3.5 w-3.5" />} label="Facility" value={order.facilityName ?? "—"} />
            <DetailField icon={<Hash className="h-3.5 w-3.5" />} label="PO Number" value={order.poNum ?? "—"} />
            <DetailField icon={<Calendar className="h-3.5 w-3.5" />} label="Req. Ship Date" value={fmtDate(order.requiredShipDate)} />
            <DetailField icon={<Package className="h-3.5 w-3.5" />} label="Pallets" value={order.palletCount ? String(order.palletCount) : "—"} />
            <DetailField icon={<ClipboardList className="h-3.5 w-3.5" />} label="Total Pieces" value={order.totalPieces ? order.totalPieces.toLocaleString() : "—"} />
          </div>

          {/* Ship To */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Ship To</p>
            <p className="text-sm font-medium text-foreground">{order.shipToName ?? "—"}</p>
            {order.shipToCity && <p className="text-xs text-muted-foreground mt-0.5">{order.shipToCity}</p>}
          </div>

          {/* Outbound Location */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Outbound Location</p>
            {order.outboundLocation ? (
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />{order.outboundLocation}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not assigned</p>
            )}
          </div>

          {/* Shipped info */}
          {isShipped && order.shippedAt && (
            <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-400 mb-1">Shipped</p>
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{fmtDateTime(order.shippedAt)}</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border">
            <p>Ship Ready: {fmtDateTime(order.shipReadyAt)}</p>
            <p>First Seen: {fmtDateTime(order.firstSeenAt)}</p>
          </div>
        </div>

        {/* Action buttons */}
        {!isShipped && (
          <div className="border-t border-border pt-4 space-y-2">
            <Button
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={isDemo ? undefined : startCarrierPickup}
              disabled={isDemo}
              title={isDemo ? "Carrier pickup is disabled in demo mode" : undefined}
            >
              <Truck className="h-4 w-4" />
              Start Carrier Pickup
              <ArrowRight className="h-4 w-4 ml-auto" />
            </Button>
            {!isDemo && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => { onClose(); onEdit(order); }}
              >
                <Pencil className="h-4 w-4" />
                Edit Location / Pallet Count
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full gap-2 text-muted-foreground"
              onClick={() => window.open(`https://app.3plcentral.com/ware/orders/${order.extensivOrderId}`, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View in Extensiv
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5 flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="text-sm text-foreground font-medium">{value}</p>
    </div>
  );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

function EditOutboundDialog({ order, onClose }: { order: OutboundOrder; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [location, setLocation] = useState(order.outboundLocation ?? "");
  const [pallets, setPallets] = useState(String(order.palletCount ?? 0));
  const [saving, setSaving] = useState(false);

  const update = trpc.shippingDashboard.updateOutbound.useMutation({
    onSuccess: () => { utils.shippingDashboard.listOutbound.invalidate(); onClose(); },
    onSettled: () => setSaving(false),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Update Outbound Details</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Order {order.extensivOrderId}{order.referenceNum ? ` · Ref ${order.referenceNum}` : ""}
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Outbound Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Door 3, Staging-A, Bay 12" className="text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Number of Pallets</label>
            <Input type="number" min={0} value={pallets} onChange={(e) => setPallets(e.target.value)} placeholder="0" className="text-sm w-28" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={() => {
            setSaving(true);
            update.mutate({ id: order.id, outboundLocation: location.trim() || undefined, palletCount: parseInt(pallets) || 0 });
          }}>
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Warehouse Section ────────────────────────────────────────────────────────

function WarehouseSection({ facilityName, orders, onEdit, onSelect, isDemo }: {
  facilityName: string;
  orders: OutboundOrder[];
  onEdit: (o: OutboundOrder) => void;
  onSelect: (o: OutboundOrder) => void;
  isDemo?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalPallets = orders.reduce((s, o) => s + (o.palletCount ?? 0), 0);
  const maxDays = Math.max(...orders.map((o) => daysInOutbound(o.shipReadyAt)));
  const urgentCount = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 3 && o.displayStatus !== "shipped").length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed
          ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-semibold text-[15px] text-foreground flex-1">{facilityName}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Ship className="h-3.5 w-3.5" />{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{totalPallets} pallet{totalPallets !== 1 ? "s" : ""}</span>
          {urgentCount > 0 && (
            <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-[10px] px-1.5 py-0">{urgentCount} aging</Badge>
          )}
          {maxDays >= 5 && (
            <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">{maxDays}d max</Badge>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/30">
                {["Order ID", "Client", "Ship To", "Req. Ship Date"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />Location</span>
                </th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center gap-1"><Package className="h-3 w-3" />Pallets</span>
                </th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" />Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => {
                const days = daysInOutbound(order.shipReadyAt);
                const isShipped = order.displayStatus === "shipped";
                return (
                  <tr
                    key={order.id}
                    className={cn(
                      "border-t border-border transition-colors cursor-pointer",
                      isShipped
                        ? "bg-green-50/60 dark:bg-green-950/20 hover:bg-green-100/60 dark:hover:bg-green-950/30"
                        : idx % 2 !== 0
                          ? "bg-muted/10 hover:bg-muted/30"
                          : "hover:bg-muted/20"
                    )}
                    onClick={() => onSelect(order)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-[13px] font-semibold text-foreground">{order.extensivOrderId}</div>
                      {order.referenceNum && <div className="text-[11px] text-muted-foreground">Ref {order.referenceNum}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-foreground font-medium">{order.clientName}</div>
                      {(order.totalPieces ?? 0) > 0 && <div className="text-[11px] text-muted-foreground">{order.totalPieces!.toLocaleString()} pcs</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-foreground/80">{order.shipToName ?? "—"}</div>
                      {order.shipToCity && <div className="text-[11px] text-muted-foreground">{order.shipToCity}</div>}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground/80 whitespace-nowrap">{fmtDate(order.requiredShipDate)}</td>
                    <td className="px-4 py-3">
                      {order.outboundLocation
                        ? <span className="inline-flex items-center gap-1 text-[13px] text-blue-600 dark:text-blue-400"><MapPin className="h-3 w-3 shrink-0" />{order.outboundLocation}</span>
                        : <span className="text-[12px] text-muted-foreground italic">Not set</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(order.palletCount ?? 0) > 0
                        ? <span className="inline-flex items-center justify-center gap-1 text-[13px] font-semibold text-foreground"><Package className="h-3.5 w-3.5 text-muted-foreground" />{order.palletCount}</span>
                        : <span className="text-[12px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isShipped ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700">
                          <CheckCircle2 className="h-3 w-3" />Shipped
                        </span>
                      ) : (
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border", daysBadgeClass(days))}>
                          {daysBadgeIcon(days)}
                          {days === 0 ? "Today" : `${days}d`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-muted-foreground italic border-t border-border">
            Click any row to open shipment details and start the outbound process.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Demo B2B Section (demo mode only) ───────────────────────────────────────

function DemoB2BSection() {
  const [collapsed, setCollapsed] = useState(false);
  const statusLabel = (s: string) =>
    s === "staged"
      ? { label: "Staged", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" }
      : { label: "Awaiting Pickup", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return (
    <div className="rounded-xl border border-amber-400/40 bg-card overflow-hidden mb-4">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="font-semibold text-[15px] text-foreground flex-1">B2B Shipments — Outbound Staging</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Ship className="h-3.5 w-3.5" />{DEMO_B2B_SHIPMENTS.length} shipments</span>
          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{DEMO_B2B_SHIPMENTS.reduce((s, o) => s + o.pallets, 0)} pallets</span>
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px] px-1.5 py-0">Demo Data</Badge>
        </div>
      </button>
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/30">
                {["Shipment ID", "Client", "Ship-To Address", "Carrier / PRO#", "Req. Ship Date"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center gap-1"><MapPin className="h-3 w-3" />Location</span>
                </th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center gap-1"><Package className="h-3 w-3" />Pallets</span>
                </th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_B2B_SHIPMENTS.map((s, idx) => {
                const st = statusLabel(s.status);
                return (
                  <tr key={s.id} className={cn("border-t border-border hover:bg-muted/30 transition-colors", idx % 2 !== 0 && "bg-muted/10")}>
                    <td className="px-4 py-3"><div className="font-mono text-[13px] font-semibold text-foreground">{s.id}</div></td>
                    <td className="px-4 py-3"><div className="text-[13px] text-foreground font-medium">{s.client}</div></td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-foreground/80">{s.shipTo}</div>
                      <div className="text-[11px] text-muted-foreground">{s.shipToAddress}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-foreground/80">{s.carrier}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{s.proNum}</div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground/80 whitespace-nowrap">{fmtDate(s.requiredShipDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[13px] text-blue-600 dark:text-blue-400"><MapPin className="h-3 w-3 shrink-0" />{s.outboundLocation}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center gap-1 text-[13px] font-semibold text-foreground"><Package className="h-3.5 w-3.5 text-muted-foreground" />{s.pallets}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", st.cls)}>{st.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShippingDashboard() {
  const [, navigate] = useLocation();
  const [demoMode, setDemoMode] = useState(false);

  const { data: liveOrders = [], isLoading, refetch, isFetching } = trpc.shippingDashboard.listOutbound.useQuery(
    undefined, { refetchInterval: demoMode ? false : 60_000 }
  );

  const [search, setSearch] = useState("");
  const [editOrder, setEditOrder] = useState<OutboundOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OutboundOrder | null>(null);

  // In demo mode use synthetic data, otherwise use live data
  const orders: OutboundOrder[] = demoMode ? DEMO_ORDERS : liveOrders;

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? orders.filter((o) =>
          String(o.extensivOrderId).includes(q) ||
          (o.referenceNum ?? "").toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          (o.shipToName ?? "").toLowerCase().includes(q) ||
          (o.outboundLocation ?? "").toLowerCase().includes(q))
      : orders;
    const map = new Map<string, OutboundOrder[]>();
    for (const o of filtered) {
      const key = o.facilityName ?? `Facility ${o.facilityId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    for (const list of Array.from(map.values())) list.sort((a: OutboundOrder, b: OutboundOrder) => {
      const aShipped = a.displayStatus === "shipped" ? 1 : 0;
      const bShipped = b.displayStatus === "shipped" ? 1 : 0;
      if (aShipped !== bShipped) return aShipped - bShipped;
      return daysInOutbound(b.shipReadyAt) - daysInOutbound(a.shipReadyAt);
    });
    return map;
  }, [orders, search]);

  const totalOrders = orders.filter((o) => o.displayStatus !== "shipped").length;
  const totalPallets = orders.filter((o) => o.displayStatus !== "shipped").reduce((s, o) => s + (o.palletCount ?? 0), 0);
  const agingOrders = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 3 && o.displayStatus !== "shipped").length;
  const criticalOrders = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 5 && o.displayStatus !== "shipped").length;
  const noLocation = orders.filter((o) => !o.outboundLocation && o.displayStatus !== "shipped").length;

  return (
    <div className="p-7 page-enter">
      {/* Demo Mode Banner */}
      {demoMode && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <FlaskConical className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1">
            <strong>Demo Mode is active.</strong> All data shown is synthetic and does not reflect live warehouse operations.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/15 h-7 text-xs"
            onClick={() => setDemoMode(false)}
          >
            Exit Demo
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="page-breadcrumb">Shipping</p>
          <h1 className="page-title flex items-center gap-2">
            Shipping Dashboard
            {demoMode && (
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-400 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 text-[11px] px-2 py-0.5 font-semibold">
                <FlaskConical className="h-3 w-3 mr-1" />Demo
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {demoMode
              ? "Showing synthetic demo data — safe to share in presentations."
              : "All orders staged and ready to ship. Click any row to open the shipment and start the outbound process."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!demoMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDemoMode(true)}
              className="gap-1.5 border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            >
              <FlaskConical className="h-3.5 w-3.5" />Demo Mode
            </Button>
          )}
          {!demoMode && (
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />Refresh
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/shipping/dock-manager")}
            className="gap-1.5"
          >
            <Building2 className="h-3.5 w-3.5" />
            Dock Manager
          </Button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {([
          { label: "Orders Ready",       value: totalOrders,    Icon: Ship,          color: "text-blue-600 dark:text-blue-400" },
          { label: "Total Pallets",      value: totalPallets,   Icon: Package,       color: "text-purple-600 dark:text-purple-400" },
          { label: "Aging (3+ days)",    value: agingOrders,    Icon: Timer,         color: agingOrders   > 0 ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400" },
          { label: "Critical (5+ days)", value: criticalOrders, Icon: AlertTriangle, color: criticalOrders > 0 ? "text-red-600 dark:text-red-400"    : "text-emerald-600 dark:text-emerald-400" },
        ] as const).map(({ label, value, Icon, color }) => (
          <div key={label} className={cn("rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-3", demoMode && "border-amber-500/20")}>
            <Icon className={cn("h-8 w-8 shrink-0 opacity-80", color)} />
            <div>
              <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
              <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* No-location warning */}
      {noLocation > 0 && !demoMode && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 dark:border-yellow-500/30 px-4 py-2.5 text-sm text-yellow-800 dark:text-yellow-300">
          <MapPin className="h-4 w-4 shrink-0" />
          <span><strong>{noLocation}</strong> order{noLocation !== 1 ? "s have" : " has"} no outbound location set. Click the row to assign one.</span>
        </div>
      )}
      {demoMode && noLocation > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 dark:border-yellow-500/30 px-4 py-2.5 text-sm text-yellow-800 dark:text-yellow-300">
          <MapPin className="h-4 w-4 shrink-0" />
          <span><strong>{noLocation}</strong> order{noLocation !== 1 ? "s have" : " has"} no outbound location set. <span className="opacity-60">(Demo example)</span></span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input className="pl-8 text-sm h-9" placeholder="Search order, client, location…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Demo B2B section — only visible in demo mode */}
      {demoMode && <DemoB2BSection />}

      {/* Content */}
      {!demoMode && isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-sm">Loading outbound orders…</span>
        </div>
      ) : grouped.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Ship className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm font-medium">{search ? "No orders match your search." : "No orders are currently staged for shipment."}</p>
          <p className="text-xs mt-1 opacity-60">Orders appear here once they reach the Ship Ready stage.</p>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([facility, facilityOrders]: [string, OutboundOrder[]]) => (
          <WarehouseSection
            key={facility}
            facilityName={facility}
            orders={facilityOrders}
            onEdit={setEditOrder}
            onSelect={setSelectedOrder}
            isDemo={demoMode}
          />
        ))
      )}

      {/* Shipment detail drawer */}
      {selectedOrder && (
        <ShipmentDetailDrawer
          order={selectedOrder}
          isDemo={demoMode}
          onClose={() => setSelectedOrder(null)}
          onEdit={(o) => { setSelectedOrder(null); setEditOrder(o); }}
        />
      )}

      {!demoMode && editOrder && <EditOutboundDialog order={editOrder} onClose={() => setEditOrder(null)} />}
    </div>
  );
}
