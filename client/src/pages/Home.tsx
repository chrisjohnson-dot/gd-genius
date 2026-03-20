import AppLayout from "@/components/AppLayout";
import { CheckCircle2, Clock, Package, ShipIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderRow = {
  orderId: number;
  referenceNum: string;
  poNum: string | null;
  clientId: number;
  clientName: string;
  facilityId: number;
  facilityName: string;
  creationDate: string;
  ageDays: number;
  priority: "urgent" | "high" | "normal";
  lineCount: number;
  totalPieces: number;
  skuCount: number;
  shipToName: string | null;
  shipToCity: string | null;
  notes: string | null;
  configId: number;
  orderStatus: number;
};

type FacilityGroup = {
  facilityId: number;
  facilityName: string;
  orders: OrderRow[];
  total: number;
  urgent: number;
  high: number;
  normal: number;
  unallocated: number;
  inProduction: number;
  shipReady: number;
  outOfSla: number;
  byClient: Array<{ clientId: number; clientName: string; count: number; urgent: number }>;
};

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ orderStatus, ageDays }: { orderStatus: number; ageDays: number }) {
  if (ageDays >= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
        <ShieldAlert className="h-2.5 w-2.5" /> Out of SLA
      </span>
    );
  }
  if (orderStatus === 2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        <CheckCircle2 className="h-2.5 w-2.5" /> Ship Ready
      </span>
    );
  }
  if (orderStatus === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
        <Clock className="h-2.5 w-2.5" /> In Production
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">
      <Package className="h-2.5 w-2.5" /> Unallocated
    </span>
  );
}

// ─── Priority pill ────────────────────────────────────────────────────────────
function PriorityPill({ priority }: { priority: "urgent" | "high" | "normal" }) {
  const map = {
    urgent: { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444", label: "Urgent" },
    high:   { bg: "#fef3c7", text: "#d97706", dot: "#f59e0b", label: "High" },
    normal: { bg: "#d1fae5", text: "#059669", dot: "#059669", label: "Normal" },
  };
  const s = map[priority];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
type SortKey = "clientName" | "referenceNum" | "ageDays" | "priority" | "totalPieces" | "shipToName" | "shipToCity" | "poNum";
type SortDir = "asc" | "desc";
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 inline" />
    : <ChevronDown className="h-3 w-3 ml-1 inline" />;
}

// ─── Per-warehouse card ───────────────────────────────────────────────────────
function WarehouseCard({ facility }: { facility: FacilityGroup }) {
  const [search, setSearch]             = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortKey, setSortKey]           = useState<SortKey>("ageDays");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");
  const [expanded, setExpanded]         = useState(false);
  const [groupByClient, setGroupByClient] = useState(true);

  const clientOptions = useMemo(
    () => Array.from(new Map(facility.orders.map((o) => [o.clientId, o.clientName])).entries()),
    [facility.orders]
  );

  const filteredOrders = useMemo(() => {
    let rows = facility.orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (o) =>
          o.referenceNum.toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          (o.shipToName ?? "").toLowerCase().includes(q) ||
          (o.poNum ?? "").toLowerCase().includes(q) ||
          (o.shipToCity ?? "").toLowerCase().includes(q) ||
          (o.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (clientFilter !== "all") rows = rows.filter((o) => String(o.clientId) === clientFilter);
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageDays")        cmp = a.ageDays - b.ageDays;
      else if (sortKey === "priority")  cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      else if (sortKey === "totalPieces") cmp = a.totalPieces - b.totalPieces;
      else cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [facility.orders, search, clientFilter, sortKey, sortDir]);

  // Group orders by client for the spreadsheet-style view
  const groupedByClient = useMemo(() => {
    const map = new Map<number, { clientId: number; clientName: string; orders: OrderRow[] }>();
    for (const o of filteredOrders) {
      if (!map.has(o.clientId)) {
        map.set(o.clientId, { clientId: o.clientId, clientName: o.clientName, orders: [] });
      }
      map.get(o.clientId)!.orders.push(o);
    }
    // Sort client groups: urgent clients first, then by name
    return Array.from(map.values()).sort((a, b) => {
      const aUrgent = a.orders.some(o => o.priority === "urgent");
      const bUrgent = b.orders.some(o => o.priority === "urgent");
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      const aHigh = a.orders.some(o => o.priority === "high");
      const bHigh = b.orders.some(o => o.priority === "high");
      if (aHigh && !bHigh) return -1;
      if (!aHigh && bHigh) return 1;
      return a.clientName.localeCompare(b.clientName);
    });
  }, [filteredOrders]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const hasFilters = search || clientFilter !== "all";

  // Format date to short form
  function fmtDate(d: string) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div
      className="bg-card rounded-2xl overflow-hidden"
      style={{
        border:
          facility.urgent > 0
            ? "2px solid #ef4444"
            : facility.high > 0
            ? "2px solid #f59e0b"
            : "1px solid hsl(var(--border))",
        boxShadow:
          facility.urgent > 0
            ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 16px rgba(239,68,68,0.10)"
            : facility.high > 0
            ? "0 0 0 1px rgba(245,158,11,0.15), 0 4px 16px rgba(245,158,11,0.10)"
            : undefined,
      }}
    >
      {/* Warehouse header */}
      <div
        className="px-6 py-5 cursor-pointer select-none bg-card border-b border-border"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Warehouse className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">{facility.facilityName}</h3>
                {facility.high > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {facility.high} HIGH
                  </span>
                )}
                {facility.urgent > 0 && (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 cursor-default">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          {facility.urgent} URGENT
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="p-3 min-w-[160px]">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Priority Breakdown</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-red-600 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                              Urgent (&ge;7d)
                            </span>
                            <span className="text-xs font-bold">{facility.urgent}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                              High (3–6d)
                            </span>
                            <span className="text-xs font-bold">{facility.high}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              Normal (&lt;3d)
                            </span>
                            <span className="text-xs font-bold">{facility.normal}</span>
                          </div>
                          <div className="border-t border-border pt-1.5 mt-1 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Total</span>
                            <span className="text-xs font-bold">{facility.total}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{facility.total} order{facility.total !== 1 ? "s" : ""} · {facility.byClient.length} client{facility.byClient.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-xl px-4 py-3 text-center border border-blue-100">
            <p className="text-[22px] font-extrabold text-blue-600 leading-none">{facility.unallocated}</p>
            <p className="text-[10px] text-blue-400 mt-1 font-medium uppercase tracking-wide">Unallocated</p>
          </div>
          <div className="bg-amber-50 rounded-xl px-4 py-3 text-center border border-amber-100">
            <p className="text-[22px] font-extrabold text-amber-600 leading-none">{facility.inProduction}</p>
            <p className="text-[10px] text-amber-400 mt-1 font-medium uppercase tracking-wide">In Production</p>
          </div>
          <div className="bg-emerald-50 rounded-xl px-4 py-3 text-center border border-emerald-100">
            <p className="text-[22px] font-extrabold text-emerald-600 leading-none">{facility.shipReady}</p>
            <p className="text-[10px] text-emerald-400 mt-1 font-medium uppercase tracking-wide">Ship Ready</p>
          </div>
          <div className="bg-red-50 rounded-xl px-4 py-3 text-center border border-red-100">
            <p className="text-[22px] font-extrabold text-red-600 leading-none">{facility.outOfSla}</p>
            <p className="text-[10px] text-red-400 mt-1 font-medium uppercase tracking-wide">Out of SLA</p>
          </div>
        </div>
      </div>

      {/* Collapsible order table */}
      {expanded && (
        <>
          {/* Filters row */}
          <div className="px-5 py-2.5 border-b border-border flex flex-wrap items-center gap-2 bg-muted/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search order, client, PO, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Clients</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </select>

            {/* Group by client toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); setGroupByClient((g) => !g); }}
              className={`py-1.5 px-2.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
                groupByClient
                  ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Users className="h-3 w-3" />
              Group by Client
            </button>

            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setClientFilter("all"); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}

            <span className="text-xs text-muted-foreground ml-auto">
              {hasFilters ? `${filteredOrders.length} of ${facility.orders.length}` : facility.orders.length} orders
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              {facility.orders.length === 0 ? (
                <p className="text-sm font-medium">No orders.</p>
              ) : (
                <>
                  <p className="text-sm font-medium">No orders match your filters.</p>
                  <button
                    onClick={() => { setSearch(""); setClientFilter("all"); }}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : groupByClient ? (
            /* ── Grouped by client (spreadsheet-style) ── */
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th className="w-[110px]">Status</th>
                    <th onClick={() => toggleSort("referenceNum")} className="cursor-pointer select-none">
                      TX # <SortIcon col="referenceNum" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("poNum")} className="cursor-pointer select-none">
                      PO # <SortIcon col="poNum" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("shipToName")} className="cursor-pointer select-none">
                      Ship To <SortIcon col="shipToName" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("shipToCity")} className="cursor-pointer select-none">
                      City <SortIcon col="shipToCity" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("ageDays")} className="cursor-pointer select-none text-right">
                      Age <SortIcon col="ageDays" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("totalPieces")} className="cursor-pointer select-none text-right">
                      Pcs <SortIcon col="totalPieces" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="text-right">SKUs</th>
                    <th className="w-8"></th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByClient.map((group) => {
                    const groupUrgent = group.orders.some(o => o.priority === "urgent");
                    const groupHigh   = !groupUrgent && group.orders.some(o => o.priority === "high");
                    const groupPieces = group.orders.reduce((s, o) => s + (o.totalPieces ?? 0), 0);
                    return [
                      /* Client header row */
                      <tr
                        key={`hdr-${group.clientId}`}
                        style={{
                          background: groupUrgent ? "#1a0a0a" : groupHigh ? "#1a1200" : "#111827",
                          borderLeft: groupUrgent ? "3px solid #ef4444" : groupHigh ? "3px solid #f59e0b" : "3px solid #374151",
                        }}
                      >
                        <td colSpan={2} className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-white uppercase tracking-wider">{group.clientName}</span>
                            {groupUrgent && <span className="text-[9px] font-bold text-red-400 bg-red-900/40 px-1.5 py-0.5 rounded">URGENT</span>}
                            {!groupUrgent && groupHigh && <span className="text-[9px] font-bold text-amber-400 bg-amber-900/40 px-1.5 py-0.5 rounded">HIGH</span>}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">PO #</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">Ship To</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium">City</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">Age</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">{groupPieces > 0 ? groupPieces.toLocaleString() : ""}</td>
                        <td className="py-2 px-3 text-[10px] text-gray-400 font-medium text-right">{group.orders.length} ord</td>
                        <td colSpan={2}></td>
                      </tr>,
                      /* Order rows */
                      ...group.orders.map((o) => {
                        const isUrgent = o.priority === "urgent";
                        const isHigh   = o.priority === "high";
                        return (
                          <tr
                            key={o.orderId}
                            style={
                              isUrgent
                                ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
                                : isHigh
                                ? { background: "rgba(245,158,11,0.04)", borderLeft: "3px solid #f59e0b" }
                                : { borderLeft: "3px solid transparent" }
                            }
                          >
                            <td className="py-2">
                              <StatusPill orderStatus={o.orderStatus} ageDays={o.ageDays} />
                            </td>
                            <td className="font-semibold text-foreground text-xs">
                              {o.referenceNum || `#${o.orderId}`}
                            </td>
                            <td className="text-muted-foreground text-xs font-mono">
                              {o.poNum ?? "—"}
                            </td>
                            <td className="text-muted-foreground text-xs max-w-[160px] truncate" title={o.shipToName ?? ""}>
                              {o.shipToName ?? "—"}
                            </td>
                            <td className="text-muted-foreground text-xs">
                              {o.shipToCity ?? "—"}
                            </td>
                            <td className="text-muted-foreground text-xs text-right">
                              {o.ageDays === 0 ? "Today" : `${o.ageDays}d`}
                            </td>
                            <td className="text-muted-foreground text-xs text-right">
                              {(o.totalPieces ?? 0) > 0 ? (o.totalPieces ?? 0).toLocaleString() : "—"}
                            </td>
                            <td className="text-muted-foreground text-xs text-right">
                              {(o.skuCount ?? 0) > 0 ? o.skuCount : "—"}
                            </td>
                            <td className="text-center">
                              {o.notes ? (
                                <TooltipProvider delayDuration={100}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <MessageSquare className="h-3.5 w-3.5 text-blue-400 cursor-default inline" />
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-[220px] text-xs">
                                      {o.notes}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : null}
                            </td>
                            <td className="text-right">
                              <Link href="/allocate">
                                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs h-7 px-2">
                                  Allocate
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      }),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── Flat table (no grouping) ── */
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th className="w-[110px]">Status</th>
                    <th onClick={() => toggleSort("referenceNum")} className="cursor-pointer select-none">
                      TX # <SortIcon col="referenceNum" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("poNum")} className="cursor-pointer select-none">
                      PO # <SortIcon col="poNum" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("clientName")} className="cursor-pointer select-none">
                      Client <SortIcon col="clientName" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("shipToName")} className="cursor-pointer select-none">
                      Ship To <SortIcon col="shipToName" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("shipToCity")} className="cursor-pointer select-none">
                      City <SortIcon col="shipToCity" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("ageDays")} className="cursor-pointer select-none text-right">
                      Age <SortIcon col="ageDays" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort("totalPieces")} className="cursor-pointer select-none text-right">
                      Pcs <SortIcon col="totalPieces" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="text-right">SKUs</th>
                    <th className="w-8"></th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const isUrgent = o.priority === "urgent";
                    const isHigh   = o.priority === "high";
                    return (
                      <tr
                        key={o.orderId}
                        style={
                          isUrgent
                            ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
                            : isHigh
                            ? { background: "rgba(245,158,11,0.04)", borderLeft: "3px solid #f59e0b" }
                            : { borderLeft: "3px solid transparent" }
                        }
                      >
                        <td className="py-2">
                          <StatusPill orderStatus={o.orderStatus} ageDays={o.ageDays} />
                        </td>
                        <td className="font-semibold text-foreground text-xs">
                          {o.referenceNum || `#${o.orderId}`}
                        </td>
                        <td className="text-muted-foreground text-xs font-mono">
                          {o.poNum ?? "—"}
                        </td>
                        <td className="text-muted-foreground text-xs">{o.clientName}</td>
                        <td className="text-muted-foreground text-xs max-w-[140px] truncate" title={o.shipToName ?? ""}>
                          {o.shipToName ?? "—"}
                        </td>
                        <td className="text-muted-foreground text-xs">
                          {o.shipToCity ?? "—"}
                        </td>
                        <td className="text-muted-foreground text-xs text-right">
                          {o.ageDays === 0 ? "Today" : `${o.ageDays}d`}
                        </td>
                        <td className="text-muted-foreground text-xs text-right">
                          {(o.totalPieces ?? 0) > 0 ? (o.totalPieces ?? 0).toLocaleString() : "—"}
                        </td>
                        <td className="text-muted-foreground text-xs text-right">
                          {(o.skuCount ?? 0) > 0 ? o.skuCount : "—"}
                        </td>
                        <td className="text-center">
                          {o.notes ? (
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <MessageSquare className="h-3.5 w-3.5 text-blue-400 cursor-default inline" />
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-[220px] text-xs">
                                  {o.notes}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}
                        </td>
                        <td className="text-right">
                          <Link href="/allocate">
                            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs h-7 px-2">
                              Allocate
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { data, isLoading, refetch, isFetching } = trpc.allocation.openOrders.useQuery({});

  const facilities: FacilityGroup[] = (data as { facilities?: FacilityGroup[] })?.facilities ?? [];
  const summary = data?.summary ?? { total: 0, unallocated: 0, inProduction: 0, shipReady: 0, outOfSla: 0, byClient: [] };

  return (
    <AppLayout>
      <div className="p-7 space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="page-breadcrumb">Overview</p>
            <h1 className="page-title">Open Orders Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button asChild className="shadow-sm">
              <Link href="/allocate" className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4" />
                Run Allocation Tool
              </Link>
            </Button>
          </div>
        </div>

        {/* Global KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <Package className="h-3.5 w-3.5 text-blue-500" /> Unallocated
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-blue-600">
              {isLoading ? "—" : summary.unallocated}
            </p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <Clock className="h-3.5 w-3.5 text-amber-500" /> In Production
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-amber-600">
              {isLoading ? "—" : summary.inProduction}
            </p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Ship Ready
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-emerald-600">
              {isLoading ? "—" : summary.shipReady}
            </p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <ShieldAlert className="h-3.5 w-3.5 text-red-500" /> Out of SLA
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none text-red-600">
              {isLoading ? "—" : summary.outOfSla}
            </p>
          </div>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="h-36 bg-muted animate-pulse" />
                <div className="p-5 space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-10 bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No config state */}
        {!isLoading && facilities.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No warehouses found.</p>
            <p className="text-xs mt-1 opacity-70">
              Configure an Extensiv connection in{" "}
              <Link href="/settings" className="text-primary hover:underline">API Settings</Link>{" "}
              to see open orders here.
            </p>
          </div>
        )}

        {/* Warehouse cards — 2-column grid on large screens */}
        {!isLoading && facilities.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {facilities.map((f) => (
              <WarehouseCard key={f.facilityId} facility={f} />
            ))}
          </div>
        )}

        {/* Recent Allocation Runs — compact secondary section */}
        {!isLoading && <RecentRunsSection />}
      </div>
    </AppLayout>
  );
}

// ─── Recent runs mini-table ───────────────────────────────────────────────────
function RecentRunsSection() {
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 5 });
  if (isLoading || !runs || runs.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-[15px] font-bold">Recent Allocation Runs</h3>
        <Link href="/history">
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs font-medium">
            View All →
          </Button>
        </Link>
      </div>
      <table className="w-full data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Date</th>
            <th>Allocated</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="font-semibold text-foreground">
                {run.customerName ?? `Customer ${run.customerId}`}
              </td>
              <td className="text-muted-foreground text-xs">
                {new Date(run.createdAt).toLocaleString()}
              </td>
              <td className="text-muted-foreground">
                {run.allocatedCount}/{run.orderCount} allocated
              </td>
              <td>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{
                    background: run.status === "confirmed" ? "#d1fae5" : run.status === "cancelled" ? "#fee2e2" : "#dbeafe",
                    color: run.status === "confirmed" ? "#059669" : run.status === "cancelled" ? "#ef4444" : "#1d4ed8",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: run.status === "confirmed" ? "#059669" : run.status === "cancelled" ? "#ef4444" : "#3b82f6" }}
                  />
                  {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                </span>
              </td>
              <td className="text-right">
                <Link href={`/history/${run.id}`}>
                  <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs">
                    View
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
