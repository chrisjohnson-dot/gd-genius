import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Package, MapPin, Truck, FileText, ChevronDown, ChevronRight, Calendar, User } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ─── Pipeline stages ──────────────────────────────────────────────────────────
// Stage 1 (red)    = Not started / in warehouse (unallocated → qc_complete)
// Stage 2 (yellow) = Ready to ship (ship_ready)
// Stage 3 (green)  = Shipping information sent / shipped

type DisplayStatus = "not_started" | "ship_ready" | "shipped";

function getDisplayStatus(lifecycleStatus: string): DisplayStatus {
  if (lifecycleStatus === "shipped") return "shipped";
  if (lifecycleStatus === "ship_ready") return "ship_ready";
  return "not_started";
}

const STAGE_LABELS: Record<DisplayStatus, string> = {
  not_started: "In Warehouse",
  ship_ready: "Ready to Ship",
  shipped: "Shipped",
};

const STAGE_COLORS: Record<DisplayStatus, { bar: string; badge: string; dot: string }> = {
  not_started: {
    bar: "bg-red-500",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    dot: "bg-red-500",
  },
  ship_ready: {
    bar: "bg-yellow-400",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    dot: "bg-yellow-400",
  },
  shipped: {
    bar: "bg-green-500",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    dot: "bg-green-500",
  },
};

function PipelineBar({ status }: { status: DisplayStatus }) {
  const stages: DisplayStatus[] = ["not_started", "ship_ready", "shipped"];
  const currentIdx = stages.indexOf(status);
  return (
    <div className="flex items-center gap-1 w-full max-w-xs">
      {stages.map((s, i) => (
        <div key={s} className="flex items-center gap-1 flex-1">
          <div
            className={`h-2 rounded-full flex-1 transition-all ${i <= currentIdx ? STAGE_COLORS[status].bar : "bg-muted"}`}
          />
          {i < stages.length - 1 && (
            <div className={`w-1.5 h-1.5 rounded-full ${i < currentIdx ? STAGE_COLORS[status].dot : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type OutboundOrder = {
  id: number;
  extensivOrderId: number;
  referenceNum: string | null;
  poNum: string | null;
  clientName: string;
  shipToName: string | null;
  shipToCity: string | null;
  totalPieces: number | null;
  requiredShipDate: string | null;
  outboundLocation: string | null;
  palletCount: number | null;
  shipReadyAt: Date | null;
  shippedAt: Date | null;
  displayStatus: "ship_ready" | "shipped";
  lifecycleStatus?: string;
};

function OrderRow({ order }: { order: OutboundOrder }) {
  const [open, setOpen] = useState(false);
  const status = getDisplayStatus(order.displayStatus);
  const colors = STAGE_COLORS[status];

  // Carrier pickup info
  const { data: appointment } = trpc.carrierAppointments.getByOrder.useQuery(
    { extensivOrderId: order.extensivOrderId },
    { enabled: open, refetchOnWindowFocus: false }
  );

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
            {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}

            {/* Pipeline bar */}
            <div className="w-28 shrink-0">
              <PipelineBar status={status} />
            </div>

            {/* Order info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">TX {order.extensivOrderId}</span>
                {order.referenceNum && <span className="text-xs text-muted-foreground">{order.referenceNum}</span>}
                <Badge className={`text-xs ${colors.badge}`}>{STAGE_LABELS[status]}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                <span>{order.clientName}</span>
                {order.shipToName && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{order.shipToName}{order.shipToCity ? `, ${order.shipToCity}` : ""}</span>}
              </div>
            </div>

            {/* Right summary */}
            <div className="shrink-0 text-right text-xs text-muted-foreground space-y-0.5">
              {order.palletCount ? <div className="flex items-center gap-1 justify-end"><Package className="w-3 h-3" />{order.palletCount} pallet{order.palletCount !== 1 ? "s" : ""}</div> : null}
              {order.requiredShipDate && <div className="flex items-center gap-1 justify-end"><Calendar className="w-3 h-3" />Ship by {formatDate(order.requiredShipDate)}</div>}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-5 py-4 space-y-4 bg-muted/10">

            {/* Order details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-0.5">Transaction ID</p>
                <p className="font-semibold">{order.extensivOrderId}</p>
              </div>
              {order.poNum && (
                <div>
                  <p className="text-muted-foreground mb-0.5">PO Number</p>
                  <p className="font-semibold">{order.poNum}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground mb-0.5">Customer</p>
                <p className="font-semibold">{order.clientName}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Total Pieces</p>
                <p className="font-semibold">{order.totalPieces ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Pallets</p>
                <p className="font-semibold">{order.palletCount ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Staging Location</p>
                <p className="font-semibold">{order.outboundLocation ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Required Ship Date</p>
                <p className="font-semibold">{formatDate(order.requiredShipDate)}</p>
              </div>
              {order.shippedAt && (
                <div>
                  <p className="text-muted-foreground mb-0.5">Shipped At</p>
                  <p className="font-semibold">{formatDate(order.shippedAt)}</p>
                </div>
              )}
            </div>

            {/* Ship-to address */}
            {order.shipToName && (
              <div className="rounded-lg border border-border p-3 text-xs space-y-0.5">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Ship To</p>
                <p className="font-semibold">{order.shipToName}</p>
                {order.shipToCity && <p className="text-muted-foreground">{order.shipToCity}</p>}
              </div>
            )}

            {/* Carrier appointment */}
            {appointment && (
              <div className="rounded-lg border border-border p-3 text-xs space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1 flex items-center gap-1"><Truck className="w-3 h-3" /> Carrier Appointment</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(appointment as any).carrierName && <div><p className="text-muted-foreground">Carrier</p><p className="font-semibold">{(appointment as any).carrierName}</p></div>}
                  {(appointment as any).driverName && <div><p className="text-muted-foreground">Driver</p><p className="font-semibold">{(appointment as any).driverName}</p></div>}
                  {(appointment as any).trailerNumber && <div><p className="text-muted-foreground">Trailer</p><p className="font-semibold">{(appointment as any).trailerNumber}</p></div>}
                  {(appointment as any).proNumber && <div><p className="text-muted-foreground">PRO #</p><p className="font-semibold">{(appointment as any).proNumber}</p></div>}
                  {(appointment as any).sealNumber && <div><p className="text-muted-foreground">Seal #</p><p className="font-semibold">{(appointment as any).sealNumber}</p></div>}
                  {(appointment as any).scheduledDate && <div><p className="text-muted-foreground">Scheduled</p><p className="font-semibold">{formatDate((appointment as any).scheduledDate)}</p></div>}
                </div>
              </div>
            )}

            {/* BOL / Labels */}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => window.open(`/api/pdf/qc-gd-labels/${order.extensivOrderId}?type=gd`, "_blank")}
              >
                <FileText className="w-3.5 h-3.5" /> GD Labels
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => window.open(`/api/pdf/qc-gd-labels/${order.extensivOrderId}?type=sscc`, "_blank")}
              >
                <FileText className="w-3.5 h-3.5" /> SSCC Labels
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function ShippingClerkDashboard() {
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading, refetch, isFetching } = trpc.shippingDashboard.listOutbound.useQuery(
    undefined,
    { refetchOnWindowFocus: false, refetchInterval: 60000 }
  );

  const filtered = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(o.extensivOrderId).includes(q) ||
      (o.clientName ?? "").toLowerCase().includes(q) ||
      (o.referenceNum ?? "").toLowerCase().includes(q) ||
      (o.poNum ?? "").toLowerCase().includes(q) ||
      (o.shipToName ?? "").toLowerCase().includes(q)
    );
  });

  // Group by status for summary counts
  const counts = {
    not_started: orders.filter(o => getDisplayStatus(o.displayStatus) === "not_started").length,
    ship_ready: orders.filter(o => getDisplayStatus(o.displayStatus) === "ship_ready").length,
    shipped: orders.filter(o => getDisplayStatus(o.displayStatus) === "shipped").length,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6" /> Shipping Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track outbound orders — click any row to see full details
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-xs font-medium">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          {counts.not_started} In Warehouse
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-xs font-medium">
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          {counts.ship_ready} Ready to Ship
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-xs font-medium">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          {counts.shipped} Shipped
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 h-9 text-sm"
          placeholder="Search TX ID, customer, PO…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Order list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No orders found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <OrderRow key={order.id} order={order as OutboundOrder} />
          ))}
        </div>
      )}
    </div>
  );
}
