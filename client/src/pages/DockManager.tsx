import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, MapPin, Truck, CheckCircle2 } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const POSITIONS = Array.from({ length: 26 }, (_, i) => i + 1); // 1–26
const LEVELS = ["A", "B", "C", "D"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Parse an outboundLocation string into { position, level }.
 * Accepts formats: "A3", "OB-A3", "A-3", "3A", "3-A", "OB-3-A"
 * Level is a single letter A–D; position is 1–26.
 */
function parseDockLocation(raw: string | null): { position: number; level: string } | null {
  if (!raw) return null;
  // Strip common prefixes like "OB-", "OB ", "DOCK-"
  const cleaned = raw.trim().toUpperCase().replace(/^(OB[-\s]?|DOCK[-\s]?)/i, "");
  // Try: letter then digits  e.g. "A3", "A-3"
  let m = cleaned.match(/^([A-D])[-\s]?(\d{1,2})$/);
  if (m) {
    const pos = parseInt(m[2], 10);
    if (pos >= 1 && pos <= 26) return { level: m[1], position: pos };
  }
  // Try: digits then letter  e.g. "3A", "3-A"
  m = cleaned.match(/^(\d{1,2})[-\s]?([A-D])$/);
  if (m) {
    const pos = parseInt(m[1], 10);
    if (pos >= 1 && pos <= 26) return { level: m[2], position: pos };
  }
  return null;
}

function cellKey(position: number, level: string) {
  return `${level}${position}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type OutboundOrder = {
  id: number;
  extensivOrderId: number;
  referenceNum: string | null;
  poNum: string | null;
  clientName: string;
  facilityId: number;
  facilityName: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  palletCount: number | null;
  outboundLocation: string | null;
  displayStatus: "ship_ready" | "shipped";
};

// ─── Cell Component ───────────────────────────────────────────────────────────
function DockCell({
  position,
  level,
  orders,
}: {
  position: number;
  level: string;
  orders: OutboundOrder[];
}) {
  const isEmpty = orders.length === 0;
  const hasShipped = orders.some((o) => o.displayStatus === "shipped");
  const allShipped = orders.length > 0 && orders.every((o) => o.displayStatus === "shipped");

  const bgClass = isEmpty
    ? "bg-muted/20 border-border/30 hover:bg-muted/40"
    : allShipped
    ? "bg-emerald-500/10 border-emerald-500/30"
    : hasShipped
    ? "bg-blue-500/10 border-blue-500/30"
    : "bg-amber-500/10 border-amber-500/40";

  const label = `${level}${position}`;

  return (
    <div
      className={`relative rounded-lg border p-2 min-h-[90px] flex flex-col gap-1 transition-colors ${bgClass}`}
    >
      {/* Position label */}
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-bold text-muted-foreground tracking-wider">{label}</span>
        {!isEmpty && (
          <span className="text-[9px] font-semibold text-muted-foreground">
            {orders.reduce((s, o) => s + (o.palletCount ?? 0), 0)} plt
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest">Empty</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {orders.map((o) => (
            <div
              key={o.id}
              className={`rounded px-1.5 py-1 text-[9px] leading-tight ${
                o.displayStatus === "shipped"
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
              }`}
            >
              <div className="font-bold truncate max-w-full">{o.clientName}</div>
              <div className="text-[8px] opacity-70 truncate">{o.referenceNum ?? o.poNum ?? `#${o.extensivOrderId}`}</div>
              {o.displayStatus === "shipped" && (
                <div className="flex items-center gap-0.5 mt-0.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span className="text-[8px]">Shipped</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DockManager() {
  const [selectedFacility, setSelectedFacility] = useState<string>("__all__");

  const { data: rawOrders = [], isLoading } = trpc.shippingDashboard.listOutbound.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  // Build facility list from orders
  const facilities = useMemo(() => {
    const map = new Map<number, string>();
    for (const o of rawOrders) {
      if (!map.has(o.facilityId)) {
        map.set(o.facilityId, o.facilityName ?? `Facility ${o.facilityId}`);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rawOrders]);

  // Filter by facility
  const orders: OutboundOrder[] = useMemo(() => {
    if (selectedFacility === "__all__") return rawOrders;
    const fid = parseInt(selectedFacility, 10);
    return rawOrders.filter((o) => o.facilityId === fid);
  }, [rawOrders, selectedFacility]);

  // Build a map: cellKey → orders[]
  const cellMap = useMemo(() => {
    const map = new Map<string, OutboundOrder[]>();
    for (const o of orders) {
      const parsed = parseDockLocation(o.outboundLocation);
      if (!parsed) continue;
      const key = cellKey(parsed.position, parsed.level);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [orders]);

  // Summary stats
  const activeOrders = orders.filter((o) => o.displayStatus === "ship_ready");
  const shippedOrders = orders.filter((o) => o.displayStatus === "shipped");
  const unlocatedOrders = orders.filter(
    (o) => o.displayStatus === "ship_ready" && !parseDockLocation(o.outboundLocation)
  );
  const occupiedCells = new Set(
    orders
      .filter((o) => o.displayStatus === "ship_ready")
      .map((o) => {
        const p = parseDockLocation(o.outboundLocation);
        return p ? cellKey(p.position, p.level) : null;
      })
      .filter(Boolean)
  ).size;
  const totalCells = POSITIONS.length * LEVELS.length;

  return (
    <div className="p-6 space-y-5 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="page-breadcrumb">Shipping</p>
          <h1 className="page-title flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Dock Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visual map of all pallets currently on the dock — positions 1–26, levels A–D.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {facilities.length > 1 && (
            <Select value={selectedFacility} onValueChange={setSelectedFacility}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Facilities</SelectItem>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">Active on Dock</p>
          <p className="text-2xl font-extrabold text-foreground">{activeOrders.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">orders awaiting pickup</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">Total Pallets</p>
          <p className="text-2xl font-extrabold text-foreground">
            {activeOrders.reduce((s, o) => s + (o.palletCount ?? 0), 0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">pallets staged</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">Cells Occupied</p>
          <p className="text-2xl font-extrabold text-foreground">
            {occupiedCells}
            <span className="text-sm font-normal text-muted-foreground"> / {totalCells}</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">dock positions in use</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">No Location</p>
          <p className={`text-2xl font-extrabold ${unlocatedOrders.length > 0 ? "text-amber-500" : "text-foreground"}`}>
            {unlocatedOrders.length}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">orders without dock position</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" />
          <span>Awaiting Pickup</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
          <span>Shipped (last 48h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-muted/20 border border-border/30" />
          <span>Empty</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading dock data…</span>
        </div>
      ) : (
        <>
          {/* Dock Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Column headers */}
              <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `48px repeat(26, minmax(0, 1fr))` }}>
                <div /> {/* spacer for level label column */}
                {POSITIONS.map((pos) => (
                  <div key={pos} className="text-center text-[10px] font-bold text-muted-foreground py-1">
                    {pos}
                  </div>
                ))}
              </div>

              {/* Rows by level */}
              {LEVELS.map((level) => (
                <div
                  key={level}
                  className="grid gap-1 mb-1"
                  style={{ gridTemplateColumns: `48px repeat(26, minmax(0, 1fr))` }}
                >
                  {/* Level label */}
                  <div className="flex items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground bg-muted/30 rounded px-2 py-0.5">
                      {level}
                    </span>
                  </div>
                  {POSITIONS.map((pos) => {
                    const key = cellKey(pos, level);
                    const cellOrders = cellMap.get(key) ?? [];
                    return (
                      <DockCell key={key} position={pos} level={level} orders={cellOrders} />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Unlocated Orders */}
          {unlocatedOrders.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Orders Without Dock Position ({unlocatedOrders.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {unlocatedOrders.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2"
                  >
                    <Package className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{o.clientName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {o.referenceNum ?? o.poNum ?? `#${o.extensivOrderId}`}
                        {o.palletCount ? ` · ${o.palletCount} plt` : ""}
                      </p>
                      {o.outboundLocation && (
                        <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">
                          Location "{o.outboundLocation}" not parsed
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
