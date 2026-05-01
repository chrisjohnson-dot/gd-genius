import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useWarehouse } from "@/contexts/WarehouseContext";
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
  Plus, X, FileText, Upload, Trash2, XCircle, Globe, Tag, Loader2, ArrowUpDown,
} from "lucide-react";


// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns elapsed ms since shipReadyAt (0 if null). */
function msInOutbound(shipReadyAt: Date | string | null): number {
  if (!shipReadyAt) return 0;
  return Math.max(0, Date.now() - new Date(shipReadyAt).getTime());
}
/** Returns calendar days elapsed since shipReadyAt.
 *  Apr 27 → May 1 = 4 days regardless of time-of-day.
 */
function daysInOutbound(shipReadyAt: Date | string | null): number {
  if (!shipReadyAt) return 0;
  const start = new Date(shipReadyAt);
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((todayMidnight.getTime() - startMidnight.getTime()) / 86_400_000));
}
/** Human-readable dock age: "< 1 hr", "4 hrs", "1 day", "3 days". */
function formatDockAge(shipReadyAt: Date | string | null): string {
  const ms = msInOutbound(shipReadyAt);
  const hrs = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return days === 1 ? "1 day" : `${days} days`;
  if (hrs < 1) return "< 1 hr";
  return hrs === 1 ? "1 hr" : `${hrs} hrs`;
}

// Matches Dock Manager thresholds: green 0–3 days, yellow 4–7 days, red 8+ days
function daysBadgeClass(days: number) {
  if (days >= 8) return "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30";
  if (days >= 4) return "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30";
  return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30";
}

function daysBadgeIcon(days: number) {
  if (days >= 8) return <AlertTriangle className="h-3 w-3" />;
  if (days >= 4) return <Timer className="h-3 w-3" />;
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
  customsRequiredSet,
}: {
  order: OutboundOrder;
  isDemo: boolean;
  onClose: () => void;
  onEdit: (o: OutboundOrder) => void;
  customsRequiredSet: Set<number>;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const days = daysInOutbound(order.shipReadyAt);
  const isShipped = order.displayStatus === "shipped";
  const [assigningDock, setAssigningDock] = useState(false);
  const [dockInput, setDockInput] = useState(order.outboundLocation ?? "");
  const [dockSaving, setDockSaving] = useState(false);

   const updateLocation = trpc.shippingDashboard.updateOutbound.useMutation({
    onSuccess: () => { utils.shippingDashboard.listOutbound.invalidate(); setAssigningDock(false); },
    onSettled: () => setDockSaving(false),
  });

  // Docs completeness gate
  const { data: drawerDocs = [] } = trpc.shippingDashboard.listDocuments.useQuery(
    { orderTrackingId: order.id },
    { enabled: !isDemo && !isShipped }
  );
  const drawerHasBol = drawerDocs.some((d) => d.docType === "bol");
  const drawerHasPalletLabel = drawerDocs.some((d) => d.docType === "pallet_label");
  const drawerHasCustoms = drawerDocs.some((d) => d.docType === "customs");
  const drawerNeedsCustoms = !isDemo && customsRequiredSet.has(order.clientId);
  const docsComplete = isDemo || (drawerHasBol && drawerHasPalletLabel && (!drawerNeedsCustoms || drawerHasCustoms));
  const missingDocTypes: string[] = [
    ...(!drawerHasBol ? ["BOL"] : []),
    ...(!drawerHasPalletLabel ? ["Pallet Labels"] : []),
    ...(drawerNeedsCustoms && !drawerHasCustoms ? ["Customs"] : []),
  ];

  // Appointment check — warn if a scheduled/confirmed appointment exists but docs are incomplete
  const { data: appointment } = trpc.carrierAppointments.getByOrder.useQuery(
    { extensivOrderId: order.extensivOrderId },
    { enabled: !isDemo && !isShipped }
  );
  const hasActiveAppointment = !!appointment && appointment.status !== "cancelled" && appointment.status !== "completed";

  function startCarrierPickup() {
    onClose();
    navigate(`/shipping/carrier-pickup?orderId=${order.extensivOrderId}`);
  }

  function saveLocation() {
    setDockSaving(true);
    updateLocation.mutate({ id: order.id, outboundLocation: dockInput.trim() || undefined });
  }

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="!w-[min(90vw,720px)] overflow-y-auto px-6">
        <SheetHeader className="pb-6 pt-2 border-b border-border px-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-xl font-bold">
                Order {order.extensivOrderId}
              </SheetTitle>
              {order.referenceNum && (
                <p className="text-sm text-muted-foreground mt-1">Ref: {order.referenceNum}</p>
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

        <div className="py-8 space-y-8 px-0">
          {/* Key details — 2-col grid with generous spacing */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-7">
            <DetailField icon={<Building2 className="h-4 w-4" />} label="Client" value={order.clientName} />
            <DetailField icon={<MapPin className="h-4 w-4" />} label="Facility" value={order.facilityName ?? "—"} />
            <DetailField icon={<Hash className="h-4 w-4" />} label="PO Number" value={order.poNum ?? "—"} />
            <DetailField icon={<Calendar className="h-4 w-4" />} label="Req. Ship Date" value={fmtDate(order.requiredShipDate)} />
            <DetailField icon={<Package className="h-4 w-4" />} label="Pallets" value={order.palletCount ? String(order.palletCount) : "—"} />
            <DetailField icon={<ClipboardList className="h-4 w-4" />} label="Total Pieces" value={order.totalPieces ? order.totalPieces.toLocaleString() : "—"} />
          </div>

          {/* Ship To */}
          <div className="rounded-xl border border-border bg-muted/30 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ship To</p>
            <p className="text-lg font-semibold text-foreground leading-snug">{order.shipToName ?? "—"}</p>
            {order.shipToCity && <p className="text-sm text-muted-foreground mt-2">{order.shipToCity}</p>}
          </div>

          {/* Outbound Location */}
          <div className={`rounded-xl border px-6 py-5 ${
            order.outboundLocation
              ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800"
              : "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outbound Location</p>
              {!isShipped && !isDemo && !assigningDock && (
                <button
                  onClick={() => { setDockInput(order.outboundLocation ?? ""); setAssigningDock(true); }}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {order.outboundLocation ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {order.outboundLocation ? "Change" : "Assign"}
                </button>
              )}
            </div>
            {assigningDock ? (
              <div className="space-y-3">
                <Input
                  autoFocus
                  value={dockInput}
                  onChange={(e) => setDockInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveLocation(); if (e.key === "Escape") setAssigningDock(false); }}
                  placeholder="e.g. Door 3, Staging-A, Overflow"
                  className="text-base h-11"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={saveLocation} disabled={dockSaving}>
                    {dockSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Save Location
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAssigningDock(false)} disabled={dockSaving}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {order.outboundLocation && (
                  <button
                    className="text-xs text-red-500 hover:underline w-full text-center"
                    onClick={() => { setDockSaving(true); updateLocation.mutate({ id: order.id, outboundLocation: undefined }); }}
                  >
                    Clear location
                  </button>
                )}
              </div>
            ) : order.outboundLocation ? (
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400 flex items-center gap-2.5">
                <MapPin className="h-5 w-5 shrink-0" />{order.outboundLocation}
              </p>
            ) : (
              <p className="text-base text-amber-700 dark:text-amber-400 font-medium">Not assigned — tap Assign to set a dock position</p>
            )}
          </div>

          {/* Shipped info */}
          {isShipped && order.shippedAt && (
            <div className="rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400 mb-3">Shipped</p>
              <p className="text-lg font-semibold text-green-800 dark:text-green-300">{fmtDateTime(order.shippedAt)}</p>
            </div>
          )}

          {/* Shipping Documents */}
          <ShippingDocumentsPanel order={order} isDemo={isDemo} requiresCustomsDocs={customsRequiredSet.has(order.clientId)} />

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Ship Ready</p>
              <p className="text-sm text-foreground">{fmtDateTime(order.shipReadyAt)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">First Seen</p>
              <p className="text-sm text-foreground">{fmtDateTime(order.firstSeenAt)}</p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {!isShipped && (
          <div className="border-t border-border pt-6 space-y-3">
            {/* Appointment + missing docs warning */}
            {!isDemo && hasActiveAppointment && !docsComplete && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-400 bg-red-50 dark:bg-red-950/20 dark:border-red-700 px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-red-700 dark:text-red-400">
                    Pickup appointment scheduled — documents missing
                  </p>
                  <p className="text-red-600 dark:text-red-400 text-xs mt-0.5">
                    {appointment?.scheduledDate && `Appointment: ${fmtDate(appointment.scheduledDate)}${appointment.scheduledTimeStart ? ` at ${appointment.scheduledTimeStart}` : ""}. `}
                    Upload {missingDocTypes.join(" and ")} before the carrier arrives.
                  </p>
                </div>
              </div>
            )}

            {/* Missing docs warning (no appointment yet) */}
            {!isDemo && !docsComplete && !hasActiveAppointment && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <span className="font-semibold">Missing: {missingDocTypes.join(", ")}.</span>{" "}
                  Upload required documents before starting carrier pickup.
                </p>
              </div>
            )}

            <Button
              size="lg"
              className={cn(
                "w-full gap-2 h-14 text-base",
                docsComplete
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              )}
              onClick={isDemo || !docsComplete ? undefined : startCarrierPickup}
              disabled={isDemo || !docsComplete}
              title={
                isDemo ? "Carrier pickup is disabled in demo mode"
                  : !docsComplete ? `Upload ${missingDocTypes.join(" and ")} before starting carrier pickup`
                  : undefined
              }
            >
              <Truck className="h-5 w-5" />
              Start Carrier Pickup
              {docsComplete && <ArrowRight className="h-5 w-5 ml-auto" />}
            </Button>
            {!isDemo && (
              <Button
                variant="outline"
                size="lg"
                className="w-full gap-2 h-12"
                onClick={() => { onClose(); onEdit(order); }}
              >
                <Pencil className="h-4 w-4" />
                Edit Location / Pallet Count
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full gap-2 text-muted-foreground h-10"
              onClick={() => window.open(`https://app.3plcentral.com/ware/orders/${order.extensivOrderId}`, "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
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
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        {icon}{label}
      </p>
      <p className="text-lg text-foreground font-bold leading-snug">{value}</p>
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

// ─── Shipping Documents ─────────────────────────────────────────────────────

type ShippingDoc = {
  id: number;
  orderTrackingId: number;
  docType: "bol" | "customs" | "pallet_label" | "other";
  fileName: string;
  fileUrl: string;
  fileKey: string;
  mimeType: string;
  fileSizeBytes: number | null;
  note: string | null;
  uploadedBy: string | null;
  createdAt: Date | string;
};

const DOC_TYPE_LABELS: Record<ShippingDoc["docType"], string> = {
  bol: "BOL",
  customs: "Customs",
  pallet_label: "Pallet Labels",
  other: "Other",
};

const DOC_TYPE_ICONS: Record<ShippingDoc["docType"], React.ReactNode> = {
  bol: <FileText className="h-3.5 w-3.5" />,
  customs: <Globe className="h-3.5 w-3.5" />,
  pallet_label: <Tag className="h-3.5 w-3.5" />,
  other: <FileText className="h-3.5 w-3.5" />,
};

/**
 * Compact green/red status pill for the dashboard table column.
 * hasBol + hasPalletLabel = green. Missing either = red.
 * Customs is only required if isCustomsOrder is true (future: detect from order).
 */
function DocStatusPill({ docs, onClick }: { docs: ShippingDoc[]; onClick?: () => void }) {
  const hasBol = docs.some((d) => d.docType === "bol");
  const hasPalletLabel = docs.some((d) => d.docType === "pallet_label");
  const complete = hasBol && hasPalletLabel;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors",
        complete
          ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
          : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/60"
      )}
    >
      {complete ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {complete ? "Docs OK" : "Missing"}
    </button>
  );
}

/**
 * Full shipping documents panel shown inside the ShipmentDetailDrawer.
 * Allows upload and deletion of BOL, customs, and pallet label files.
 */
function ShippingDocumentsPanel({ order, isDemo, requiresCustomsDocs = false }: { order: OutboundOrder; isDemo: boolean; requiresCustomsDocs?: boolean }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<ShippingDoc["docType"]>("bol");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: docs = [], isLoading } = trpc.shippingDashboard.listDocuments.useQuery(
    { orderTrackingId: order.id },
    { enabled: !isDemo }
  );

  const uploadMutation = trpc.shippingDashboard.uploadDocument.useMutation({
    onSuccess: () => utils.shippingDashboard.listDocuments.invalidate({ orderTrackingId: order.id }),
    onSettled: () => setUploading(false),
  });

  const deleteMutation = trpc.shippingDashboard.deleteDocument.useMutation({
    onSuccess: () => utils.shippingDashboard.listDocuments.invalidate({ orderTrackingId: order.id }),
    onSettled: () => setDeletingId(null),
  });
  const [resending, setResending] = useState(false);
  const resendMutation = trpc.shippingDashboard.resendToClearsight.useMutation({
    onSuccess: (data) => {
      setResending(false);
      toast.success(`BOL resent to Clearsight — ${data.fileName}`);
    },
    onError: (err) => {
      setResending(false);
      toast.error("Resend failed: " + err.message);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({
        orderTrackingId: order.id,
        docType: uploadType,
        fileName: file.name,
        dataUrl: reader.result as string,
        mimeType: file.type || "application/pdf",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const hasBol = docs.some((d) => d.docType === "bol");
  const hasPalletLabel = docs.some((d) => d.docType === "pallet_label");
  const hasCustoms = docs.some((d) => d.docType === "customs");
  const complete = hasBol && hasPalletLabel && (!requiresCustomsDocs || hasCustoms);

  return (
    <div className={cn(
      "rounded-xl border px-6 py-5 space-y-4",
      complete
        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"
        : "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className={cn("h-4 w-4", complete ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")} />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shipping Documents</p>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border",
          complete
            ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700"
            : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700"
        )}>
          {complete ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {complete ? "Complete" : "Incomplete"}
        </span>
      </div>

      {/* Required checklist */}
      <div className="flex gap-4 text-[12px]">
        {(["bol", "pallet_label"] as const).map((type) => {
          const present = docs.some((d) => d.docType === type);
          return (
            <span key={type} className={cn(
              "flex items-center gap-1 font-medium",
              present ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            )}>
              {present ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {DOC_TYPE_LABELS[type]}
            </span>
          );
        })}
        {requiresCustomsDocs && (
          <span className={cn(
            "flex items-center gap-1 font-medium",
            hasCustoms ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          )}>
            {hasCustoms ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            Customs
          </span>
        )}
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
              <span className="text-muted-foreground">{DOC_TYPE_ICONS[doc.docType]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate">{doc.fileName}</p>
                <p className="text-[10px] text-muted-foreground">{DOC_TYPE_LABELS[doc.docType]}{doc.fileSizeBytes ? ` · ${(doc.fileSizeBytes / 1024).toFixed(0)} KB` : ""}</p>
              </div>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-medium shrink-0">View</a>
              {!isDemo && (
                <button
                  onClick={() => { setDeletingId(doc.id); deleteMutation.mutate({ id: doc.id }); }}
                  disabled={deletingId === doc.id}
                  className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                >
                  {deletingId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload control */}
      {!isDemo && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value as ShippingDoc["docType"])}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground h-8"
          >
            <option value="bol">BOL</option>
            <option value="customs">Customs</option>
            <option value="pallet_label">Pallet Labels</option>
            <option value="other">Other</option>
          </select>
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition-colors h-8"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}
      {/* Resend to Clearsight */}
      {!isDemo && hasBol && (
        <button
          onClick={() => {
            setResending(true);
            resendMutation.mutate({
              orderTrackingId: order.id,
              extensivOrderId: order.extensivOrderId,
              referenceNum: order.referenceNum ?? null,
              clientName: order.clientName,
            });
          }}
          disabled={resending || resendMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-violet-400 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-60 transition-colors h-8 w-full justify-center mt-1"
          title="Manually resend the BOL to Clearsight via Cortex webhook"
        >
          {resending || resendMutation.isPending
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending to Clearsight…</>
            : <><Globe className="h-3.5 w-3.5" /> Resend BOL to Clearsight</>
          }
        </button>
      )}
    </div>
  );
}

// ─── Warehouse Section ────────────────────────────────────────────────────────

function WarehouseSection({ facilityName, orders, onEdit, onSelect, isDemo, onSelectForDocs }: {
  facilityName: string;
  orders: OutboundOrder[];
  onEdit: (o: OutboundOrder) => void;
  onSelect: (o: OutboundOrder) => void;
  isDemo?: boolean;
  onSelectForDocs?: (o: OutboundOrder) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalPallets = orders.reduce((s, o) => s + (o.palletCount ?? 0), 0);
  const maxDays = Math.max(...orders.map((o) => daysInOutbound(o.shipReadyAt)));
  const urgentCount = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 4 && o.displayStatus !== "shipped").length;

  // Bulk-fetch document presence for all orders in this section
  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const { data: allDocs = [] } = trpc.shippingDashboard.listDocumentsByOrders.useQuery(
    { orderTrackingIds: orderIds },
    { enabled: !isDemo && orderIds.length > 0 }
  );
  const docsByOrder = useMemo(() => {
    const map = new Map<number, ShippingDoc[]>();
    for (const doc of allDocs) {
      if (!map.has(doc.orderTrackingId)) map.set(doc.orderTrackingId, []);
      map.get(doc.orderTrackingId)!.push(doc as ShippingDoc);
    }
    return map;
  }, [allDocs]);

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
          {maxDays >= 8 && (
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
                  <span className="flex items-center justify-center gap-1"><FileText className="h-3 w-3" />Docs</span>
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
                      {isDemo ? (
                        <span className="text-[11px] text-muted-foreground italic">Demo</span>
                      ) : (
                        <DocStatusPill
                          docs={docsByOrder.get(order.id) ?? []}
                          onClick={() => onSelectForDocs ? onSelectForDocs(order) : onSelect(order)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isShipped ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700">
                          <CheckCircle2 className="h-3 w-3" />Shipped
                        </span>
                      ) : (
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border", daysBadgeClass(days))}>
                          {daysBadgeIcon(days)}
                          {formatDockAge(order.shipReadyAt)}
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
  const { selectedFacilityId: globalFacilityId } = useWarehouse();
  const [demoMode, setDemoMode] = useState(false);
  const { data: liveOrders = [], isLoading, refetch, isFetching } = trpc.shippingDashboard.listOutbound.useQuery(
    undefined, { refetchInterval: demoMode ? false : 300_000 }
  );
   // Tick every minute so the dock-age badges update without a full refetch
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"green" | "yellow" | "red" | null>(null);
  const [sortBy, setSortBy] = useState<"age" | "docs">("age");  // default: age (existing behaviour)
  const [editOrder, setEditOrder] = useState<OutboundOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OutboundOrder | null>(null);
  // Reset filters/selection whenever global warehouse changes
  useEffect(() => { setSearch(""); setTierFilter(null); setSelectedOrder(null); setEditOrder(null); }, [globalFacilityId]);

  // In demo mode use synthetic data, otherwise use live data; apply global facility filter
  const orders: OutboundOrder[] = useMemo(() => {
    const base = demoMode ? DEMO_ORDERS : liveOrders;
    if (!globalFacilityId) return base;
    return base.filter((o) => o.facilityId === globalFacilityId);
  }, [demoMode, liveOrders, globalFacilityId]);

  // Bulk-fetch all docs for the KPI tile and sort (only active ship-ready orders, not demo)
  // NOTE: declared before `grouped` so the sort can reference it
  const activeOrderIds = useMemo(() => orders.filter((o) => o.displayStatus !== "shipped").map((o) => o.id), [orders]);
  const { data: allDocsForKpi = [] } = trpc.shippingDashboard.listDocumentsByOrders.useQuery(
    { orderTrackingIds: activeOrderIds },
    { enabled: !demoMode && activeOrderIds.length > 0, refetchInterval: 300_000 }
  );

  // Fetch which clients require customs documents (per-customer toggle in Client Profiles)
  const uniqueClientIds = useMemo(() => [...new Set(orders.map((o) => o.clientId))], [orders]);
  const { data: customsRequiredClientIds = [] } = trpc.clientProfiles.getCustomsRequiredClients.useQuery(
    { clientIds: uniqueClientIds },
    { enabled: !demoMode && uniqueClientIds.length > 0, staleTime: 60_000 }
  );
  const customsRequiredSet = useMemo(() => new Set(customsRequiredClientIds), [customsRequiredClientIds]);
    const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    let filtered = q
      ? orders.filter((o) =>
          String(o.extensivOrderId).includes(q) ||
          (o.referenceNum ?? "").toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          (o.shipToName ?? "").toLowerCase().includes(q) ||
          (o.outboundLocation ?? "").toLowerCase().includes(q))
      : orders;
    if (tierFilter) {
      filtered = filtered.filter((o) => {
        const d = daysInOutbound(o.shipReadyAt);
        if (tierFilter === "green") return d < 4;
        if (tierFilter === "yellow") return d >= 4 && d < 8;
        return d >= 8;
      });
    }
    const map = new Map<string, OutboundOrder[]>();
    for (const o of filtered) {
      const key = o.facilityName ?? `Facility ${o.facilityId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    // Build a Set of order IDs that have complete docs (for sort)
    const docsByOrderIdForSort = new Map<number, Set<string>>();
    for (const doc of allDocsForKpi) {
      if (!docsByOrderIdForSort.has(doc.orderTrackingId)) docsByOrderIdForSort.set(doc.orderTrackingId, new Set());
      docsByOrderIdForSort.get(doc.orderTrackingId)!.add(doc.docType);
    }
    const hasCompleteDocs = (id: number, clientId: number) => {
      const types = docsByOrderIdForSort.get(id);
      const needsCustoms = customsRequiredSet.has(clientId);
      return types?.has("bol") && types?.has("pallet_label") && (!needsCustoms || types?.has("customs"));
    };
    for (const list of Array.from(map.values())) list.sort((a: OutboundOrder, b: OutboundOrder) => {
      const aShipped = a.displayStatus === "shipped" ? 1 : 0;
      const bShipped = b.displayStatus === "shipped" ? 1 : 0;
      if (aShipped !== bShipped) return aShipped - bShipped;
      if (sortBy === "docs") {
        // Missing docs first, then complete docs; within each group sort by age
        const aMissing = hasCompleteDocs(a.id, a.clientId) ? 1 : 0;
        const bMissing = hasCompleteDocs(b.id, b.clientId) ? 1 : 0;
        if (aMissing !== bMissing) return aMissing - bMissing;
      }
      return daysInOutbound(b.shipReadyAt) - daysInOutbound(a.shipReadyAt);
    });
    return map;
  }, [orders, search, tierFilter, sortBy, allDocsForKpi, customsRequiredSet]);

  const totalOrders = orders.filter((o) => o.displayStatus !== "shipped").length;
  const totalPallets = orders.filter((o) => o.displayStatus !== "shipped").reduce((s, o) => s + (o.palletCount ?? 0), 0);
  const agingOrders = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 4 && o.displayStatus !== "shipped").length;
  const criticalOrders = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 8 && o.displayStatus !== "shipped").length;
  const noLocation = orders.filter((o) => !o.outboundLocation && o.displayStatus !== "shipped").length;;
  const missingDocsOrders = useMemo(() => {
    if (demoMode) return [];
    const docsByOrderId = new Map<number, Set<string>>();
    for (const doc of allDocsForKpi) {
      if (!docsByOrderId.has(doc.orderTrackingId)) docsByOrderId.set(doc.orderTrackingId, new Set());
      docsByOrderId.get(doc.orderTrackingId)!.add(doc.docType);
    }
    return orders.filter((o) => {
      if (o.displayStatus === "shipped") return false;
      const types = docsByOrderId.get(o.id);
      const needsCustoms = customsRequiredSet.has(o.clientId);
      return !types || !types.has("bol") || !types.has("pallet_label") || (needsCustoms && !types.has("customs"));
    }).map((o) => ({
      id: o.id,
      label: o.referenceNum ?? String(o.extensivOrderId),
      client: o.clientName,
      missingTypes: [
        ...(!docsByOrderId.get(o.id)?.has("bol") ? ["BOL"] : []),
        ...(!docsByOrderId.get(o.id)?.has("pallet_label") ? ["Pallet Labels"] : []),
        ...(customsRequiredSet.has(o.clientId) && !docsByOrderId.get(o.id)?.has("customs") ? ["Customs"] : []),
      ],
    }));
  }, [allDocsForKpi, orders, demoMode, customsRequiredSet]);
  const missingDocs = missingDocsOrders.length;
  const [missingDocsBannerExpanded, setMissingDocsBannerExpanded] = useState(false);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {([
          { label: "Orders Ready",       value: totalOrders,    Icon: Ship,          color: "text-blue-600 dark:text-blue-400" },
          { label: "Total Pallets",      value: totalPallets,   Icon: Package,       color: "text-purple-600 dark:text-purple-400" },
          { label: "Aging (4+ days)",    value: agingOrders,    Icon: Timer,         color: agingOrders   > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-emerald-600 dark:text-emerald-400" },
          { label: "Critical (8+ days)", value: criticalOrders, Icon: AlertTriangle, color: criticalOrders > 0 ? "text-red-600 dark:text-red-400"    : "text-emerald-600 dark:text-emerald-400" },
        ] as const).map(({ label, value, Icon, color }) => (
          <div key={label} className={cn("rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-3", demoMode && "border-amber-500/20")}>
            <Icon className={cn("h-8 w-8 shrink-0 opacity-80", color)} />
            <div>
              <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
              <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
            </div>
          </div>
        ))}
        {/* Missing Docs tile */}
        <div className={cn(
          "rounded-xl border bg-card px-5 py-4 flex items-center gap-3",
          demoMode
            ? "border-amber-500/20"
            : missingDocs > 0
              ? "border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/20"
              : "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
        )}>
          <FileText className={cn(
            "h-8 w-8 shrink-0 opacity-80",
            demoMode ? "text-muted-foreground" : missingDocs > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
          )} />
          <div>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {demoMode ? "—" : missingDocs}
            </div>
            <div className="text-[11px] text-muted-foreground font-medium">Missing Docs</div>
          </div>
        </div>
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

      {/* Search + Tier Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 text-sm h-9" placeholder="Search order, client, location…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          {(
            [
              { tier: "green" as const, bg: "#22c55e", label: "0–3 days" },
              { tier: "yellow" as const, bg: "#eab308", label: "4–7 days" },
              { tier: "red" as const, bg: "#ef4444", label: "8+ days" },
            ] as const
          ).map(({ tier, bg, label }) => {
            const active = tierFilter === tier;
            return (
              <button
                key={tier}
                onClick={() => setTierFilter(active ? null : tier)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all"
                style={{
                  backgroundColor: active ? bg : "transparent",
                  borderColor: bg,
                  color: active ? (tier === "yellow" ? "#000" : "#fff") : "inherit",
                  fontWeight: active ? 700 : 400,
                }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: bg }} />
                {label}
              </button>
            );
          })}
          {tierFilter && (
            <button onClick={() => setTierFilter(null)} className="text-xs text-muted-foreground underline">
              Clear
            </button>
          )}
        </div>
        {/* Sort by Docs toggle */}
        <button
          onClick={() => setSortBy((s) => s === "docs" ? "age" : "docs")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all",
            sortBy === "docs"
              ? "bg-red-100 dark:bg-red-950/40 border-red-400 text-red-700 dark:text-red-300 font-semibold"
              : "border-border text-muted-foreground hover:border-foreground/40"
          )}
          title={sortBy === "docs" ? "Sorting: missing docs first — click to sort by age" : "Click to sort by missing docs first"}
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortBy === "docs" ? "Sorted: missing docs first" : "Sort by docs"}
        </button>
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
            onSelectForDocs={setSelectedOrder}
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
          customsRequiredSet={customsRequiredSet}
        />
      )}

      {!demoMode && editOrder && <EditOutboundDialog order={editOrder} onClose={() => setEditOrder(null)} />}
    </div>
  );
}
