import { useState, useMemo, useEffect } from "react";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Package, MapPin, Truck, CheckCircle2, Search, X, RefreshCw, Wand2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────
const POSITIONS = Array.from({ length: 26 }, (_, i) => i + 1); // 1–26
const LEVELS = ["A", "B", "C", "D", "E"] as const;

// Age-based color coding: green 0–3 days, yellow 4–7 days, red 8+ days
function getAgeColor(shipReadyAt: Date | string | null): { bg: string; text: string } {
  const days = daysOnDock(shipReadyAt);
  if (days >= 8) return { bg: "#ef4444", text: "#fff" }; // red
  if (days >= 4) return { bg: "#eab308", text: "#000" }; // yellow
  return { bg: "#22c55e", text: "#fff" };                 // green
}

function formatDockAge(shipReadyAt: Date | string | null): string {
  if (!shipReadyAt) return "";
  const ms = Math.max(0, Date.now() - new Date(shipReadyAt).getTime());
  const hrs = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}D`;
  if (hrs < 1) return "< 1h";
  return `${hrs}h`;
}

function daysOnDock(shipReadyAt: Date | string | null): number {
  if (!shipReadyAt) return 0;
  return Math.floor(Math.max(0, Date.now() - new Date(shipReadyAt).getTime()) / 86_400_000);
}


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
  clientId: number;
  facilityId: number;
  facilityName: string | null;
  configId: number;
  shipToName: string | null;
  shipToCity: string | null;
  palletCount: number | null;
  outboundLocation: string | null;
  displayStatus: "ship_ready" | "shipped";
  shipReadyAt: Date | string | null;
};

// Returns the first "word" of a client name (split on space, dash, or comma)
function shortClientName(name: string): string {
  return name.split(/[\s\-,]+/)[0];
}
// ─── Cell Component ───────────────────────────────────────────────────────────
function DockCell({
  position,
  level,
  orders,
  highlightIds,
  allClientIds,
  onOrderClick,
}: {
  position: number;
  level: string;
  orders: OutboundOrder[];
  highlightIds: Set<number>;
  allClientIds: number[];
  onOrderClick: (o: OutboundOrder) => void;
}) {
  // Only show awaiting-pickup — skip shipped orders
  const activeOrders = orders.filter((o) => o.displayStatus !== "shipped");
  const isEmpty = activeOrders.length === 0;
  const hasHighlight = activeOrders.some((o) => highlightIds.has(o.id));
  const searchActive = highlightIds.size > 0;
  const label = `${level}${position}`;

  const borderStyle =
    !isEmpty && activeOrders.length === 1
      ? { borderColor: getAgeColor(activeOrders[0].shipReadyAt).bg, borderWidth: 2 }
      : {};

  const wrapperClass = [
    "relative rounded-lg border p-1.5 min-h-[90px] flex flex-col gap-1 transition-all bg-card",
    hasHighlight ? "ring-2 ring-green-500 ring-offset-1 border-green-500/60" : "",
    isEmpty && searchActive ? "opacity-40" : "",
    !isEmpty && searchActive && !hasHighlight ? "opacity-30" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass} style={borderStyle}>
      {/* Position label */}
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-bold text-muted-foreground tracking-wider">{label}</span>
        {!isEmpty && (
          <span className="text-[9px] font-semibold text-muted-foreground">
            {activeOrders.reduce((s, o) => s + (o.palletCount ?? 0), 0)} plt
          </span>
        )}
      </div>
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[9px] text-muted-foreground/30">—</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {activeOrders.map((o) => {
            const color = getAgeColor(o.shipReadyAt);
            const age = formatDockAge(o.shipReadyAt);
            const dimmed = searchActive && !highlightIds.has(o.id);
            return (
              <div
                key={o.id}
                onClick={() => onOrderClick(o)}
                className={`rounded cursor-pointer transition-all hover:opacity-90 active:scale-95 ${dimmed ? "opacity-20" : ""}`}
                style={{ backgroundColor: color.bg }}
              >
                <div
                  className="px-1 pt-1 pb-0 text-[8px] font-bold leading-tight truncate text-center"
                  style={{ color: color.text }}
                >
                  {shortClientName(o.clientName)}
                </div>
                {age && (
                  <div
                    className="px-1 pb-1 text-[11px] font-black leading-tight tabular-nums text-center"
                    style={{ color: color.text }}
                  >
                    {age}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssignDockDialog({
  order,
  open,
  onClose,
  onAssigned,
  onFindSpace,
}: {
  order: OutboundOrder | null;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
  onFindSpace: () => void;
}) {
  const [selectedLevel, setSelectedLevel] = useState<string>("A");
  const [selectedPosition, setSelectedPosition] = useState<number>(1);
  const [mode, setMode] = useState<"dock" | "overflow">("dock");

  const assignDock = trpc.shippingDashboard.updateOutbound.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.outboundLocation === "OVERFLOW" ? "Assigned to Overflow" : `Assigned to ${vars.outboundLocation}`);
      onAssigned();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const clearLocation = trpc.shippingDashboard.updateOutbound.useMutation({
    onSuccess: () => {
      toast.success("Dock position cleared");
      onAssigned();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const currentParsed = order ? parseDockLocation(order.outboundLocation) : null;
  const isCurrentOverflow = order?.outboundLocation?.trim().toLowerCase() === "overflow";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Assign Dock Position
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-4">
          {order && (
            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs">
              <p className="font-semibold text-foreground">{order.clientName}</p>
              <p className="text-muted-foreground">
                TXN #{order.extensivOrderId}
                {order.referenceNum ? ` · ${order.referenceNum}` : order.poNum ? ` · ${order.poNum}` : ""}
                {order.palletCount ? ` · ${order.palletCount} plt` : ""}
              </p>
              {(currentParsed || isCurrentOverflow) && (
                <p className="text-amber-600 dark:text-amber-400 mt-1 font-medium">
                  Current: {isCurrentOverflow ? "Overflow" : `${currentParsed!.level}${currentParsed!.position}`}
                </p>
              )}
              {order.shipReadyAt && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5">
                    {formatDockAge(order.shipReadyAt)} on dock
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    placed {new Date(order.shipReadyAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("dock")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                mode === "dock"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              <MapPin className="w-3 h-3 inline mr-1" />
              Dock Position
            </button>
            <button
              onClick={() => setMode("overflow")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                mode === "overflow"
                  ? "bg-orange-600 text-white border-orange-600"
                  : "bg-background text-muted-foreground border-border hover:border-orange-400/50"
              }`}
            >
              <Truck className="w-3 h-3 inline mr-1" />
              Overflow
            </button>
          </div>
          {mode === "dock" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Level</label>
                  <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => <SelectItem key={l} value={l}>Level {l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Position</label>
                  <Select value={String(selectedPosition)} onValueChange={(v) => setSelectedPosition(parseInt(v, 10))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => <SelectItem key={p} value={String(p)}>Position {p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border-2 border-primary">
                  <span className="text-2xl font-black text-primary">{selectedLevel}{selectedPosition}</span>
                </div>
              </div>
            </div>
          )}
          {mode === "overflow" && (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-center justify-center w-full h-16 rounded-xl bg-orange-500/10 border-2 border-orange-500">
                <Truck className="w-5 h-5 text-orange-600 mr-2" />
                <span className="text-lg font-black text-orange-600">OVERFLOW</span>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Order will be staged in the overflow area when no contiguous dock space is available.
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={onClose}>Cancel</Button>
            {(currentParsed || isCurrentOverflow) && order && (
              <Button
                variant="outline" size="sm"
                className="flex-1 sm:flex-none text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950"
                disabled={clearLocation.isPending}
                onClick={() => clearLocation.mutate({ id: order.id, outboundLocation: "" })}
              >
                Clear
              </Button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline" size="sm"
              className="flex-1 sm:flex-none text-primary border-primary/40 hover:bg-primary/5"
              onClick={() => { onClose(); onFindSpace(); }}
            >
              <Wand2 className="w-3 h-3 mr-1" /> Auto-Find
            </Button>
            <Button
              size="sm"
              className={`flex-1 sm:flex-none ${mode === "overflow" ? "bg-orange-600 hover:bg-orange-700" : ""}`}
              disabled={assignDock.isPending || clearLocation.isPending}
              onClick={() => {
                if (!order) return;
                if (mode === "overflow") {
                  assignDock.mutate({ id: order.id, outboundLocation: "OVERFLOW" });
                } else {
                  assignDock.mutate({ id: order.id, outboundLocation: `${selectedLevel}${selectedPosition}` });
                }
              }}
            >
              {assignDock.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Assign {mode === "overflow" ? "Overflow" : `${selectedLevel}${selectedPosition}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{order.clientName}</span>
                {" — "}{palletCount} pallet{palletCount !== 1 ? "s" : ""}
              </div>
              {order.shipReadyAt && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-2 py-0.5">
                    {formatDockAge(order.shipReadyAt)} on dock
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    since {new Date(order.shipReadyAt).toLocaleString()}
                  </span>
                </div>
              )}
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
  const { selectedFacilityId: globalFacilityId } = useWarehouse();
  const [selectedFacility, setSelectedFacility] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"green" | "yellow" | "red" | null>(null);
  const [findSpaceOrder, setFindSpaceOrder] = useState<OutboundOrder | null>(null);
  const [assignDockOrder, setAssignDockOrder] = useState<OutboundOrder | null>(null);
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

  // Filter by facility — global selector takes precedence, then local dropdown
  const facilityOrders: OutboundOrder[] = useMemo(() => {
    let base = rawOrders;
    if (globalFacilityId != null) {
      base = base.filter((o) => o.facilityId === globalFacilityId);
    } else if (selectedFacility !== "__all__") {
      const fid = parseInt(selectedFacility, 10);
      base = base.filter((o) => o.facilityId === fid);
    }
    return base;
  }, [rawOrders, selectedFacility, globalFacilityId]);

  // IDs of orders that match the search query OR the tier filter (used for highlighting)
  const matchedIds = useMemo<Set<number>>(() => {
    const q = search.trim();
    const tierIds = tierFilter
      ? new Set(
          facilityOrders
            .filter((o) => {
              const days = daysOnDock(o.shipReadyAt ?? null);
              if (tierFilter === "green") return days < 4;
              if (tierFilter === "yellow") return days >= 4 && days < 8;
              return days >= 8;
            })
            .map((o) => o.id)
        )
      : null;
    if (!q && !tierIds) return new Set();
    const searchIds = q
      ? new Set(facilityOrders.filter((o) => matchesSearch(o, q)).map((o) => o.id))
      : null;
    if (searchIds && tierIds) return new Set([...searchIds].filter((id) => tierIds.has(id)));
    return searchIds ?? tierIds ?? new Set();
  }, [facilityOrders, search, tierFilter]);

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
  const allClientIds = useMemo(
    () => facilityOrders.filter((o) => o.displayStatus === "ship_ready").map((o) => o.clientId),
    [facilityOrders]
  );

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

  const searchActive = search.trim().length > 0 || tierFilter !== null;
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

      {/* Legend + tier filter buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="text-muted-foreground mr-1">Filter:</span>
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
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: bg }}
              />
              {label}
            </button>
          );
        })}
        {tierFilter && (
          <button
            onClick={() => setTierFilter(null)}
            className="ml-1 text-xs text-muted-foreground underline"
          >
            Clear
          </button>
        )}
        {searchActive && matchCount > 0 && (
          <div className="flex items-center gap-1.5 ml-2">
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
                        allClientIds={allClientIds}
                        onOrderClick={setAssignDockOrder}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Overflow Orders — always visible */}
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
                    onClick={() => setAssignDockOrder(o)}
                    className={`flex items-start gap-2 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 transition-all cursor-pointer hover:border-orange-500/50 ${
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
                      onClick={(e) => { e.stopPropagation(); setFindSpaceOrder(o); }}
                    >
                      <Wand2 className="w-3 h-3 mr-1" />
                      Find Space
                    </Button>
                  </div>
                ))}
              </div>
            {overflowOrders.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2">No orders currently in overflow.</p>
            )}
          </div>

          {/* Unlocated Orders */}
          {unlocatedOrders.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Orders Without Dock Position ({unlocatedOrders.length})
                </h3>
                <span className="text-xs text-muted-foreground ml-1">— click to assign a position</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {unlocatedOrders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setAssignDockOrder(o)}
                    className={`flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 transition-all cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/15 ${
                      searchActive && !matchedIds.has(o.id) ? "opacity-30" : ""
                    } ${searchActive && matchedIds.has(o.id) ? "ring-2 ring-primary" : ""}`}
                  >
                    <Package className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{o.clientName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        TXN #{o.extensivOrderId}
                        {o.referenceNum ? ` · ${o.referenceNum}` : o.poNum ? ` · ${o.poNum}` : ""}
                        {o.palletCount ? ` · ${o.palletCount} plt` : ""}
                      </p>
                      {o.outboundLocation && (
                        <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">
                          Prev: "{o.outboundLocation}" — reassign below
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm" variant="outline"
                      className="shrink-0 h-6 px-2 text-[10px] border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                      onClick={(e) => { e.stopPropagation(); setAssignDockOrder(o); }}
                    >
                      <MapPin className="w-3 h-3 mr-1" /> Assign
                    </Button>
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
      {/* Assign Dock Dialog */}
      <AssignDockDialog
        order={assignDockOrder}
        open={!!assignDockOrder}
        onClose={() => setAssignDockOrder(null)}
        onAssigned={() => utils.shippingDashboard.listOutbound.invalidate()}
        onFindSpace={() => {
          const o = assignDockOrder;
          setAssignDockOrder(null);
          setFindSpaceOrder(o);
        }}
      />
    </div>
  );
}
