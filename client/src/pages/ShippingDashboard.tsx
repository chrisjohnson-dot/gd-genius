import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Ship, RefreshCw, MapPin, Package, Clock, Search,
  ChevronDown, ChevronRight, Pencil, AlertTriangle, CheckCircle2, Timer, Truck,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInOutbound(shipReadyAt: Date | string | null): number {
  if (!shipReadyAt) return 0;
  return Math.floor((Date.now() - new Date(shipReadyAt).getTime()) / 86_400_000);
}

function daysBadgeClass(days: number) {
  if (days >= 5) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (days >= 3) return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  if (days >= 1) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
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
  firstSeenAt: Date | string;
};

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

function WarehouseSection({ facilityName, orders, onEdit }: {
  facilityName: string; orders: OutboundOrder[]; onEdit: (o: OutboundOrder) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalPallets = orders.reduce((s, o) => s + (o.palletCount ?? 0), 0);
  const maxDays = Math.max(...orders.map((o) => daysInOutbound(o.shipReadyAt)));
  const urgentCount = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 3).length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.03] transition-colors text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed
          ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-semibold text-[15px] text-white flex-1">{facilityName}</span>
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
              <tr className="border-t border-white/[0.06] bg-white/[0.02]">
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
                  <span className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" />Days Out</span>
                </th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Edit</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => {
                const days = daysInOutbound(order.shipReadyAt);
                return (
                  <tr key={order.id} className={cn("border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors", idx % 2 !== 0 && "bg-white/[0.015]")}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[13px] font-semibold text-white">{order.extensivOrderId}</div>
                      {order.referenceNum && <div className="text-[11px] text-muted-foreground">Ref {order.referenceNum}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-[#e2e8f0] font-medium">{order.clientName}</div>
                      {(order.totalPieces ?? 0) > 0 && <div className="text-[11px] text-muted-foreground">{order.totalPieces!.toLocaleString()} pcs</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-[#cbd5e1]">{order.shipToName ?? "—"}</div>
                      {order.shipToCity && <div className="text-[11px] text-muted-foreground">{order.shipToCity}</div>}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#cbd5e1] whitespace-nowrap">{fmtDate(order.requiredShipDate)}</td>
                    <td className="px-4 py-3">
                      {order.outboundLocation
                        ? <span className="inline-flex items-center gap-1 text-[13px] text-[#93c5fd]"><MapPin className="h-3 w-3 shrink-0" />{order.outboundLocation}</span>
                        : <span className="text-[12px] text-muted-foreground italic">Not set</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(order.palletCount ?? 0) > 0
                        ? <span className="inline-flex items-center justify-center gap-1 text-[13px] font-semibold text-white"><Package className="h-3.5 w-3.5 text-muted-foreground" />{order.palletCount}</span>
                        : <span className="text-[12px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border", daysBadgeClass(days))}>
                        {daysBadgeIcon(days)}
                        {days === 0 ? "Today" : `${days}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-white" onClick={() => onEdit(order)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
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

// ─── B2B Shipments Mock Data ────────────────────────────────────────────────────────────────

const MOCK_B2B_SHIPMENTS = [
  {
    id: "B2B-001",
    client: "Keurig Dr Pepper",
    shipTo: "Walmart Distribution Center #7042",
    shipToAddress: "1050 Walmart Blvd, Bentonville, AR 72712",
    pallets: 24,
    outboundLocation: "OB-A3",
    carrier: "XPO Logistics",
    proNum: "XPO-8841923",
    requiredShipDate: "2026-04-09",
    status: "staged" as const,
  },
  {
    id: "B2B-002",
    client: "Keurig Dr Pepper",
    shipTo: "Costco Wholesale — Mississauga DC",
    shipToAddress: "5900 Hurontario St, Mississauga, ON L5R 4B3",
    pallets: 18,
    outboundLocation: "OB-B1",
    carrier: "Day & Ross Freight",
    proNum: "DR-20261104",
    requiredShipDate: "2026-04-10",
    status: "staged" as const,
  },
  {
    id: "B2B-003",
    client: "Keurig Dr Pepper",
    shipTo: "Loblaw Companies — Brampton RDC",
    shipToAddress: "1 Presidents Choice Circle, Brampton, ON L6Y 5S5",
    pallets: 30,
    outboundLocation: "OB-C2",
    carrier: "Challenger Motor Freight",
    proNum: "CMF-774412",
    requiredShipDate: "2026-04-08",
    status: "awaiting_pickup" as const,
  },
  {
    id: "B2B-004",
    client: "Keurig Dr Pepper",
    shipTo: "Amazon Fulfillment Center YYZ4",
    shipToAddress: "8050 Heritage Rd, Brampton, ON L6Y 0C4",
    pallets: 12,
    outboundLocation: "OB-A1",
    carrier: "FedEx Freight",
    proNum: "FXF-9920341",
    requiredShipDate: "2026-04-11",
    status: "staged" as const,
  },
  {
    id: "B2B-005",
    client: "Keurig Dr Pepper",
    shipTo: "Metro Inc. — Laval DC",
    shipToAddress: "3050 Boul. Le Carrefour, Laval, QC H7T 2K7",
    pallets: 20,
    outboundLocation: "OB-D4",
    carrier: "Mullen Trucking",
    proNum: "MUL-330192",
    requiredShipDate: "2026-04-12",
    status: "staged" as const,
  },
];

function B2BShipmentsSection() {
  const [collapsed, setCollapsed] = useState(false);
  const statusLabel = (s: string) =>
    s === "staged" ? { label: "Staged", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" }
    : { label: "Awaiting Pickup", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.03] transition-colors text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        <Truck className="h-4 w-4 text-blue-400 shrink-0" />
        <span className="font-semibold text-[15px] text-white flex-1">B2B Shipments — Outbound Staging</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Ship className="h-3.5 w-3.5" />{MOCK_B2B_SHIPMENTS.length} shipments</span>
          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{MOCK_B2B_SHIPMENTS.reduce((s, o) => s + o.pallets, 0)} pallets</span>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">Mock Data</Badge>
        </div>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-white/[0.06] bg-white/[0.02]">
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
              {MOCK_B2B_SHIPMENTS.map((s, idx) => {
                const st = statusLabel(s.status);
                return (
                  <tr key={s.id} className={cn("border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors", idx % 2 !== 0 && "bg-white/[0.015]")}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[13px] font-semibold text-white">{s.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-[#e2e8f0] font-medium">{s.client}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-[#cbd5e1]">{s.shipTo}</div>
                      <div className="text-[11px] text-muted-foreground">{s.shipToAddress}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-[#cbd5e1]">{s.carrier}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{s.proNum}</div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#cbd5e1] whitespace-nowrap">{fmtDate(s.requiredShipDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[13px] text-[#93c5fd]"><MapPin className="h-3 w-3 shrink-0" />{s.outboundLocation}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center gap-1 text-[13px] font-semibold text-white"><Package className="h-3.5 w-3.5 text-muted-foreground" />{s.pallets}</span>
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
  const { data: orders = [], isLoading, refetch, isFetching } = trpc.shippingDashboard.listOutbound.useQuery(
    undefined, { refetchInterval: 60_000 }
  );
  const [search, setSearch] = useState("");
  const [editOrder, setEditOrder] = useState<OutboundOrder | null>(null);

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
    for (const list of Array.from(map.values())) list.sort((a: OutboundOrder, b: OutboundOrder) => daysInOutbound(b.shipReadyAt) - daysInOutbound(a.shipReadyAt));
    return map;
  }, [orders, search]);

  const totalOrders = orders.length;
  const totalPallets = orders.reduce((s, o) => s + (o.palletCount ?? 0), 0);
  const agingOrders = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 3).length;
  const criticalOrders = orders.filter((o) => daysInOutbound(o.shipReadyAt) >= 5).length;
  const noLocation = orders.filter((o) => !o.outboundLocation).length;

  return (
    <div className="p-7 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="page-breadcrumb">Shipping</p>
          <h1 className="page-title">Shipping Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All orders staged and ready to ship — outbound locations, pallet counts, and dwell time.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />Refresh
        </Button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {([
          { label: "Orders Ready",      value: totalOrders,    Icon: Ship,          color: "text-blue-400" },
          { label: "Total Pallets",     value: totalPallets,   Icon: Package,       color: "text-purple-400" },
          { label: "Aging (3+ days)",   value: agingOrders,    Icon: Timer,         color: agingOrders   > 0 ? "text-orange-400" : "text-emerald-400" },
          { label: "Critical (5+ days)",value: criticalOrders, Icon: AlertTriangle, color: criticalOrders > 0 ? "text-red-400"    : "text-emerald-400" },
        ] as const).map(({ label, value, Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-3">
            <Icon className={cn("h-8 w-8 shrink-0 opacity-80", color)} />
            <div>
              <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
              <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* No-location warning */}
      {noLocation > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-300">
          <MapPin className="h-4 w-4 shrink-0" />
          <span><strong>{noLocation}</strong> order{noLocation !== 1 ? "s have" : " has"} no outbound location set. Click the edit icon to assign one.</span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input className="pl-8 text-sm h-9" placeholder="Search order, client, location…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* B2B Shipments section */}
      <B2BShipmentsSection />

      {/* Content */}
      {isLoading ? (
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
          <WarehouseSection key={facility} facilityName={facility} orders={facilityOrders} onEdit={setEditOrder} />
        ))
      )}

      {editOrder && <EditOutboundDialog order={editOrder} onClose={() => setEditOrder(null)} />}
    </div>
  );
}
