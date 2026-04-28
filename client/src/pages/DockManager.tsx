import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Package, MapPin, Truck, CheckCircle2, Search, X, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────
const POSITIONS = Array.from({ length: 26 }, (_, i) => i + 1); // 1–26
const LEVELS = ["A", "B", "C", "D", "E"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Parse an outboundLocation string into { position, level }.
 * Accepts formats: "A3", "OB-A3", "A-3", "3A", "3-A", "OB-3-A"
 * Level is a single letter A–D; position is 1–26.
 */
function parseDockLocation(raw: string | null): { position: number; level: string } | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/^(OB[-\s]?|DOCK[-\s]?)/i, "");
  let m = cleaned.match(/^([A-E])[-\s]?(\d{1,2})$/);
  if (m) {
    const pos = parseInt(m[2], 10);
    if (pos >= 1 && pos <= 26) return { level: m[1], position: pos };
  }
  m = cleaned.match(/^(\d{1,2})[-\s]?([A-E])$/);
  if (m) {
    const pos = parseInt(m[1], 10);
    if (pos >= 1 && pos <= 26) return { level: m[2], position: pos };
  }
  return null;
}

function cellKey(position: number, level: string) {
  return `${level}${position}`;
}

/** Returns true if the order matches the search query */
function matchesSearch(o: OutboundOrder, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    o.clientName.toLowerCase().includes(lower) ||
    String(o.extensivOrderId).includes(lower) ||
    (o.referenceNum ?? "").toLowerCase().includes(lower) ||
    (o.poNum ?? "").toLowerCase().includes(lower) ||
    (o.shipToName ?? "").toLowerCase().includes(lower) ||
    (o.outboundLocation ?? "").toLowerCase().includes(lower)
  );
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
  configId: number;
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
  highlightIds,
}: {
  position: number;
  level: string;
  orders: OutboundOrder[];
  highlightIds: Set<number>;
}) {
  const isEmpty = orders.length === 0;
  const hasShipped = orders.some((o) => o.displayStatus === "shipped");
  const allShipped = orders.length > 0 && orders.every((o) => o.displayStatus === "shipped");
   const hasHighlight = orders.some((o) => highlightIds.has(o.id));
  const searchActive = highlightIds.size > 0;
  // When a search is active and this cell has a match: glow green.
  // When a search is active and this cell has NO match: dim it.
  const bgClass = hasHighlight
    ? "bg-green-500/20 border-green-500/60"
    : isEmpty
    ? searchActive ? "bg-muted/10 border-border/20 opacity-40" : "bg-muted/20 border-border/30 hover:bg-muted/40"
    : searchActive
    ? "bg-muted/10 border-border/20 opacity-30"
    : allShipped
    ? "bg-emerald-500/10 border-emerald-500/30"
    : hasShipped
    ? "bg-blue-500/10 border-blue-500/30"
    : "bg-amber-500/10 border-amber-500/40";
  const highlightRing = hasHighlight ? "ring-2 ring-green-500 ring-offset-1" : "";
  const label = `${level}${position}`;
  return (
    <div
      className={`relative rounded-lg border p-2 min-h-[90px] flex flex-col gap-1 transition-all ${bgClass} ${highlightRing}`}
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
              className={`rounded px-1.5 py-1 text-[9px] leading-tight transition-all ${
                highlightIds.size > 0 && !highlightIds.has(o.id)
                  ? "opacity-30"
                  : highlightIds.has(o.id)
                  ? "ring-1 ring-primary"
                  : ""
              } ${
                o.displayStatus === "shipped"
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
              }`}
            >
              <div className="font-bold truncate max-w-full">{o.clientName}</div>
              <div className="text-[8px] opacity-70 truncate">
                {o.referenceNum ?? o.poNum ?? `#${o.extensivOrderId}`}
              </div>
              <div className="text-[8px] opacity-60 truncate font-mono">
                TXN #{o.extensivOrderId}
              </div>
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

// ─── Find Space Dialog ───────────────────────────────────────────────────────
function FindSpaceDialog({
  order,
  open,
  onClose,
  onAssigned,
}: {
  order: OutboundOrder | null;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const palletCount = order?.palletCount ?? 1;

  const { data: rec, isLoading, refetch } = trpc.shippingDashboard.recommendDockLocation.useQuery(
    {
      configId: order?.configId,
      palletCount: palletCount > 0 ? palletCount : 1,
    },
    { enabled: open && !!order }
  );

  const assignDock = trpc.shippingDashboard.updateOutbound.useMutation({
    onSuccess: () => {
      toast.success(`Assigned to ${rec?.label}`);
      onAssigned();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const isOverflow = rec?.overflow === true;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Find Dock Space
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {order && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{order.clientName}</span>
              {" — "}{palletCount} pallet{palletCount !== 1 ? "s" : ""}
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" /> Scanning available positions…
            </div>
          ) : isOverflow ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-28 h-20 rounded-2xl bg-amber-500/10 border-2 border-amber-500">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">Overflow</span>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Still no lane with {palletCount} contiguous free positions.
              </p>
              <p className="text-xs text-muted-foreground">
                {rec?.occupiedCount} of {rec?.totalCells} cells occupied
              </p>
            </div>
          ) : rec?.recommended ? (
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-28 h-20 rounded-2xl bg-primary/10 border-2 border-primary">
                <span className="text-3xl font-black text-primary">{rec.label}</span>
              </div>
              {rec.positions && rec.positions.length > 1 ? (
                <p className="text-sm text-muted-foreground">
                  Lane {rec.lane} · Positions {rec.positions.join(", ")}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Lane {rec.lane} · Position {rec.position}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {rec.occupiedCount} of {rec.totalCells} cells occupied
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {rec?.recommended && order && (
            <Button
              size="sm"
              className={isOverflow ? "bg-amber-600 hover:bg-amber-700" : "bg-primary"}
              disabled={assignDock.isPending}
              onClick={() => assignDock.mutate({ id: order.id, outboundLocation: rec.label ?? undefined })}
            >
              {assignDock.isPending
                ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Assign {rec.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DockManager() {
  const [selectedFacility, setSelectedFacility] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [findSpaceOrder, setFindSpaceOrder] = useState<OutboundOrder | null>(null);
  const utils = trpc.useUtils();

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
  const facilityOrders: OutboundOrder[] = useMemo(() => {
    if (selectedFacility === "__all__") return rawOrders;
    const fid = parseInt(selectedFacility, 10);
    return rawOrders.filter((o) => o.facilityId === fid);
  }, [rawOrders, selectedFacility]);

  // IDs of orders that match the search query (used for highlighting)
  const matchedIds = useMemo<Set<number>>(() => {
    const q = search.trim();
    if (!q) return new Set();
    return new Set(facilityOrders.filter((o) => matchesSearch(o, q)).map((o) => o.id));
  }, [facilityOrders, search]);

  // Build a map: cellKey → orders[] (all facility-filtered orders, not just matches)
  const cellMap = useMemo(() => {
    const map = new Map<string, OutboundOrder[]>();
    for (const o of facilityOrders) {
      const parsed = parseDockLocation(o.outboundLocation);
      if (!parsed) continue;
      const key = cellKey(parsed.position, parsed.level);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [facilityOrders]);

  // Summary stats (based on all facility orders, not search-filtered)
  const activeOrders = facilityOrders.filter((o) => o.displayStatus === "ship_ready");
  // Orders assigned to the Overflow location
  const overflowOrders = facilityOrders.filter(
    (o) => o.displayStatus === "ship_ready" && o.outboundLocation?.trim().toLowerCase() === "overflow"
  );
  // Orders with no dock position AND not in Overflow
  const unlocatedOrders = facilityOrders.filter(
    (o) =>
      o.displayStatus === "ship_ready" &&
      !parseDockLocation(o.outboundLocation) &&
      o.outboundLocation?.trim().toLowerCase() !== "overflow"
  );
  const occupiedCells = new Set(
    facilityOrders
      .filter((o) => o.displayStatus === "ship_ready")
      .map((o) => {
        const p = parseDockLocation(o.outboundLocation);
        return p ? cellKey(p.position, p.level) : null;
      })
      .filter(Boolean)
  ).size;
  const totalCells = POSITIONS.length * LEVELS.length;

  const searchActive = search.trim().length > 0;
  const matchCount = matchedIds.size;

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
            Visual map of all pallets currently on the dock — lanes 1–26, positions A–E.
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

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, transaction #, reference / BOL…"
            className="pl-9 pr-9"
          />
          {searchActive && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {searchActive && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {matchCount === 0
              ? "No matches"
              : `${matchCount} order${matchCount !== 1 ? "s" : ""} highlighted`}
          </span>
        )}
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
        {searchActive && matchCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-primary" />
            <span>Search match</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading dock data…</span>
        </div>
      ) : (
        <>
          {/* Search results list (shown when searching, above the grid) */}
          {searchActive && matchCount > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Search Results — {matchCount} order{matchCount !== 1 ? "s" : ""} found
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {facilityOrders.filter((o) => matchedIds.has(o.id)).map((o) => {
                  const parsed = parseDockLocation(o.outboundLocation);
                  const dockPos = parsed ? `${parsed.level}${parsed.position}` : null;
                  return (
                    <div
                      key={o.id}
                      className="flex items-start gap-2 rounded-lg bg-card border border-border px-3 py-2.5"
                    >
                      <Package className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{o.clientName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          TXN #{o.extensivOrderId}
                          {o.referenceNum ? ` · Ref: ${o.referenceNum}` : ""}
                          {o.poNum ? ` · BOL: ${o.poNum}` : ""}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {dockPos ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-primary/10 text-primary rounded px-1.5 py-0.5">
                              <MapPin className="h-2.5 w-2.5" />
                              Dock {dockPos}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded px-1.5 py-0.5">
                              <MapPin className="h-2.5 w-2.5" />
                              No position
                            </span>
                          )}
                          {o.palletCount ? (
                            <span className="text-[9px] text-muted-foreground">{o.palletCount} plt</span>
                          ) : null}
                          <span className={`text-[9px] font-medium ${o.displayStatus === "shipped" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {o.displayStatus === "shipped" ? "Shipped" : "Awaiting pickup"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {searchActive && matchCount === 0 && (
            <div className="rounded-xl border border-border/60 bg-muted/10 p-6 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No orders match "<strong>{search}</strong>"</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try searching by customer name, transaction number, reference, or BOL</p>
            </div>
          )}

          {/* Dock Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Column headers */}
              <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `48px repeat(26, minmax(0, 1fr))` }}>
                <div />
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
                  <div className="flex items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground bg-muted/30 rounded px-2 py-0.5">
                      {level}
                    </span>
                  </div>
                  {POSITIONS.map((pos) => {
                    const key = cellKey(pos, level);
                    const cellOrders = cellMap.get(key) ?? [];
                    return (
                      <DockCell
                        key={key}
                        position={pos}
                        level={level}
                        orders={cellOrders}
                        highlightIds={matchedIds}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Overflow Orders */}
          {overflowOrders.length > 0 && (
            <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                  Overflow ({overflowOrders.length})
                </h3>
                <span className="text-xs text-muted-foreground ml-1">— no contiguous lane space available</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {overflowOrders.map((o) => (
                  <div
                    key={o.id}
                    className={`flex items-start gap-2 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 transition-all ${
                      searchActive && !matchedIds.has(o.id) ? "opacity-30" : ""
                    } ${searchActive && matchedIds.has(o.id) ? "ring-2 ring-primary" : ""}`}
                  >
                    <Package className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{o.clientName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        TXN #{o.extensivOrderId}
                        {o.referenceNum ? ` · ${o.referenceNum}` : o.poNum ? ` · ${o.poNum}` : ""}
                        {o.palletCount ? ` · ${o.palletCount} plt` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-6 px-2 text-[10px] border-orange-400 text-orange-700 dark:text-orange-400 hover:bg-orange-500/10"
                      onClick={() => setFindSpaceOrder(o)}
                    >
                      <Wand2 className="w-3 h-3 mr-1" />
                      Find Space
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    className={`flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 transition-all ${
                      searchActive && !matchedIds.has(o.id) ? "opacity-30" : ""
                    } ${searchActive && matchedIds.has(o.id) ? "ring-2 ring-primary" : ""}`}
                  >
                    <Package className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{o.clientName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        TXN #{o.extensivOrderId}
                        {o.referenceNum ? ` · ${o.referenceNum}` : o.poNum ? ` · ${o.poNum}` : ""}
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

      {/* Find Space Dialog */}
      <FindSpaceDialog
        order={findSpaceOrder}
        open={!!findSpaceOrder}
        onClose={() => setFindSpaceOrder(null)}
        onAssigned={() => utils.shippingDashboard.listOutbound.invalidate()}
      />
    </div>
  );
}
