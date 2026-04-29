import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  MessageSquare,
  Plus,
  RefreshCw,
  Timer,
  Trash2,
  Warehouse,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  Users,
  ArrowLeft,
  ChevronRight,
  Search,
  CalendarPlus,
  CalendarX,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { toast } from "sonner";
import { FileDown, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── useLocalStorage hook ────────────────────────────────────────────────────
function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {}
    return defaultValue;
  });

  const set = useCallback((v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);

  return [value, set];
}

// ─── SLA Sparkline ───────────────────────────────────────────────────────────
type SparkPoint = { snapshotDate: string; slaRate: number };

function SlaSparkline({ points, greenThreshold = 98, yellowThreshold = 95 }: {
  points: SparkPoint[];
  greenThreshold?: number;
  yellowThreshold?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  if (!points || points.length < 2) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="opacity-50">No trend data yet</span>
      </div>
    );
  }

  const W = 80, H = 28, PAD = 2;
  const rates = points.map((p) => p.slaRate);
  const min = Math.max(0, Math.min(...rates) - 5);
  const max = Math.min(100, Math.max(...rates) + 5);
  const range = max - min || 1;

  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const ys = rates.map((r) => PAD + (1 - (r - min) / range) * (H - PAD * 2));

  const lastRate = rates[rates.length - 1];
  const firstRate = rates[0];
  const delta = lastRate - firstRate;
  const trendColor = lastRate >= greenThreshold ? "#16a34a" : lastRate >= yellowThreshold ? "#ca8a04" : "#ef4444";
  const TrendArrow = delta > 0.5 ? "↑" : delta < -0.5 ? "↓" : "→";
  const arrowColor = delta > 0.5 ? "#16a34a" : delta < -0.5 ? "#ef4444" : "#6b7280";

  // Format snapshotDate (YYYY-MM-DD) as a short human-readable label e.g. "Mar 22"
  function fmtDate(d: string): string {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Tooltip: pin to left or right depending on dot position to avoid overflow
  function tooltipStyle(i: number): React.CSSProperties {
    const isRight = xs[i] > W / 2;
    return {
      position: "absolute",
      top: `${ys[i] - 28}px`,
      ...(isRight
        ? { right: `${W - xs[i] + 6}px` }
        : { left: `${xs[i] + 6}px` }),
      background: "#1e293b",
      color: "#f1f5f9",
      fontSize: "10px",
      fontWeight: 600,
      padding: "3px 6px",
      borderRadius: "4px",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: 50,
      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    };
  }

  return (
    <div className="flex items-center gap-1.5">
      <div style={{ position: "relative", width: W, height: H }}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ overflow: "visible", display: "block" }}
        >
          <polyline
            points={xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")}
            fill="none"
            stroke={trendColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />
          {/* Regular dots */}
          {xs.map((x, i) => (
            <circle
              key={i}
              cx={x}
              cy={ys[i]}
              r={hoveredIdx === i ? 4 : i === xs.length - 1 ? 2.5 : 1.5}
              fill={trendColor}
              opacity={hoveredIdx === i ? 1 : 0.9}
              style={{ cursor: "pointer", transition: "r 0.1s" }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Tooltip overlay */}
        {hoveredIdx !== null && (
          <div style={tooltipStyle(hoveredIdx)}>
            {fmtDate(points[hoveredIdx].snapshotDate)} · {points[hoveredIdx].slaRate}%
          </div>
        )}
      </div>

      <span className="text-[10px] font-bold" style={{ color: arrowColor }}>
        {TrendArrow} {lastRate}%
      </span>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SlaOrder = {
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
  creationDate: string | null;
  lifecycleStatus: string;
  notes: string | null;
  assignedAssociate: string | null;
  slaDays: number;
  ageCalendarDays: number;
  slaStatus: "in_sla" | "out_of_sla";
  daysRemaining: number;
  matchedRuleName: string | null;
  savedElements: string | null;
  slaExtensionDays: number | null;
  slaExtensionNote: string | null;
  requiredShipDate: string | null;
};

type SlaRequirement = {
  id: number;
  clientId: number;
  clientName: string;
  slaDays: number;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

// ─── SLA pill ─────────────────────────────────────────────────────────────────
function SlaPill({ status, daysRemaining }: { status: "in_sla" | "out_of_sla"; daysRemaining: number }) {
  if (status === "in_sla") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-green-100 text-green-700 border border-green-200">
        <CheckCircle2 className="h-2.5 w-2.5" />
        In SLA {daysRemaining > 0 ? `(${daysRemaining}d left)` : "(today)"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-red-100 text-red-700 border border-red-200">
      <AlertTriangle className="h-2.5 w-2.5" />
      Out of SLA ({Math.abs(daysRemaining)}d overdue)
    </span>
  );
}

// ─── Warehouse card ───────────────────────────────────────────────────────────
type SortKey = "clientName" | "referenceNum" | "ageCalendarDays" | "slaStatus" | "shipToName";
type SortDir = "asc" | "desc";

function WarehouseSlaCard({
  facilityId,
  facilityName,
  orders,
  drillDown = false,
  onDrillDown,
  greenThreshold = 98,
  yellowThreshold = 95,
}: {
  facilityId?: number;
  facilityName: string;
  orders: SlaOrder[];
  drillDown?: boolean;
  onDrillDown?: () => void;
  greenThreshold?: number;
  yellowThreshold?: number;
}) {
  // Persist expanded state per facility in localStorage (drillDown always starts open)
  const expandStorageKey = `sla-warehouse-expanded-${facilityId ?? facilityName}`;
  const [expandedStored, setExpandedStored] = useLocalStorage<boolean>(expandStorageKey, false);
  const [expanded, setExpandedLocal] = useState<boolean>(drillDown ? true : expandedStored);
  function setExpanded(v: boolean | ((prev: boolean) => boolean)) {
    setExpandedLocal((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (!drillDown) setExpandedStored(next);
      return next;
    });
  }
  const [sortKey, setSortKey] = useState<SortKey>("slaStatus");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterStatus, setFilterStatus] = useState<"all" | "in_sla" | "out_of_sla">("all");
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Sparkline window toggle — persisted per facility in localStorage
  const storageKey = `sla-spark-days-${facilityId ?? "default"}`;
  const [sparkDays, setSparkDays] = useLocalStorage<7 | 14 | 30>(storageKey, 7);
  const historyQuery = trpc.sla.facilityHistory.useQuery(
    { facilityId: facilityId ?? 0, days: sparkDays },
    { enabled: !!facilityId, staleTime: 5 * 60 * 1000 }
  );
  const sparkPoints = historyQuery.data ?? [];

  const inSlaCount = orders.filter((o) => o.slaStatus === "in_sla").length;
  const outOfSlaCount = orders.filter((o) => o.slaStatus === "out_of_sla").length;

  // Three-tier SLA health using per-warehouse configurable thresholds
  const slaRate = orders.length > 0 ? inSlaCount / orders.length : 1;
  const slaRatePct = slaRate * 100;
  const slaHealth: "green" | "yellow" | "red" =
    slaRatePct >= greenThreshold ? "green" : slaRatePct >= yellowThreshold ? "yellow" : "red";
  const slaHealthStyles = {
    green:  { border: "2px solid #16a34a", shadow: "0 0 0 1px rgba(22,163,74,0.15), 0 4px 16px rgba(22,163,74,0.10)",  leftBar: "#16a34a" },
    yellow: { border: "2px solid #ca8a04", shadow: "0 0 0 1px rgba(202,138,4,0.15), 0 4px 16px rgba(202,138,4,0.10)",   leftBar: "#ca8a04" },
    red:    { border: "2px solid #ef4444", shadow: "0 0 0 1px rgba(239,68,68,0.15), 0 4px 16px rgba(239,68,68,0.10)",   leftBar: "#ef4444" },
  }[slaHealth];
  const hasBreaches = outOfSlaCount > 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    let list = filterStatus === "all" ? orders : orders.filter((o) => o.slaStatus === filterStatus);
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageCalendarDays") cmp = a.ageCalendarDays - b.ageCalendarDays;
      else if (sortKey === "slaStatus") {
        // out_of_sla first when asc
        cmp = a.slaStatus === b.slaStatus ? 0 : a.slaStatus === "out_of_sla" ? -1 : 1;
      } else {
        cmp = String(a[sortKey as keyof SlaOrder] ?? "").localeCompare(String(b[sortKey as keyof SlaOrder] ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [orders, filterStatus, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 ml-1 text-blue-500 inline" />
      : <ChevronDown className="h-3 w-3 ml-1 text-blue-500 inline" />;
  }

  // ── Full-screen overlay ──
  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ overflow: "hidden" }}>
        {/* Full-screen header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0"
          style={{ borderLeft: `4px solid ${slaHealthStyles.leftBar}` }}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">{facilityName}</h2>
                {slaHealth === "green" && (
                  <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold">
                    {Math.round(slaRate * 100)}% In SLA
                  </Badge>
                )}
                {slaHealth === "yellow" && (
                  <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200 text-[10px] font-bold">
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                    {Math.round(slaRate * 100)}% In SLA
                  </Badge>
                )}
                {slaHealth === "red" && (
                  <Badge className="bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold">
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                    {Math.round(slaRate * 100)}% In SLA
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{orders.length} orders tracked</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* KPI pills in header */}
            <div className="hidden md:flex items-center gap-2">
              <button
                className={`rounded-lg px-3 py-1.5 text-center border cursor-pointer transition-all ${filterStatus === "in_sla" ? "ring-2 ring-green-400" : ""}`}
                style={{ background: "#dcfce7", border: "1px solid #bbf7d0" }}
                onClick={() => setFilterStatus(filterStatus === "in_sla" ? "all" : "in_sla")}
              >
                <p className="text-[15px] font-extrabold leading-none text-green-700">{inSlaCount}</p>
                <p className="text-[8px] mt-0.5 font-semibold uppercase tracking-wide text-green-600">In SLA</p>
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-center border cursor-pointer transition-all ${filterStatus === "out_of_sla" ? "ring-2 ring-red-400" : ""}`}
                style={{ background: "#fee2e2", border: "1px solid #fecaca" }}
                onClick={() => setFilterStatus(filterStatus === "out_of_sla" ? "all" : "out_of_sla")}
              >
                <p className="text-[15px] font-extrabold leading-none text-red-700">{outOfSlaCount}</p>
                <p className="text-[8px] mt-0.5 font-semibold uppercase tracking-wide text-red-600">Out of SLA</p>
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const header = ["SLA Status","Transaction ID","PO #","Client","Ship To","Create Date","Age","Stage","SLA Days","Notes"];
                const rows = filtered.map((o) => [
                  o.slaStatus === "in_sla" ? "In SLA" : "Out of SLA",
                  o.referenceNum ?? "",
                  o.poNum ?? "",
                  o.clientName,
                  o.shipToName ?? "",
                  o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "",
                  o.ageCalendarDays === 0 ? "Today" : `${o.ageCalendarDays}d`,
                  o.lifecycleStatus.replace("_", " "),
                  `${o.slaDays}d`,
                  o.notes ?? "",
                ]);
                const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${facilityName.replace(/[^a-z0-9]/gi, "_")}_sla.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
                toast.success("CSV exported");
              }}
            >
              <FileDown className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
                doc.setFontSize(14);
                doc.text(`${facilityName} — SLA Tracker`, 40, 36);
                doc.setFontSize(9);
                doc.text(`Exported ${new Date().toLocaleString()} · ${filtered.length} orders`, 40, 52);
                autoTable(doc, {
                  startY: 64,
                  head: [["SLA Status","Transaction ID","PO #","Client","Ship To","Create Date","Age","Stage","SLA Days"]],
                  body: filtered.map((o) => [
                    o.slaStatus === "in_sla" ? "In SLA" : "Out of SLA",
                    o.referenceNum ?? "",
                    o.poNum ?? "",
                    o.clientName,
                    o.shipToName ?? "",
                    o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "",
                    o.ageCalendarDays === 0 ? "Today" : `${o.ageCalendarDays}d`,
                    o.lifecycleStatus.replace("_", " "),
                    `${o.slaDays}d`,
                  ]),
                  styles: { fontSize: 7, cellPadding: 3 },
                  headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
                  alternateRowStyles: { fillColor: [248, 250, 252] },
                  didDrawCell: (data) => {
                    if (data.section === "body" && data.column.index === 0) {
                      const val = data.cell.text[0];
                      if (val === "Out of SLA") {
                        doc.setFillColor(254, 226, 226);
                        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
                        doc.setTextColor(185, 28, 28);
                        doc.setFontSize(7);
                        doc.text(val, data.cell.x + 3, data.cell.y + data.cell.height / 2 + 2.5);
                        doc.setTextColor(0);
                      }
                    }
                  },
                  margin: { left: 40, right: 40 },
                });
                doc.save(`${facilityName.replace(/[^a-z0-9]/gi, "_")}_sla.pdf`);
                toast.success("PDF exported");
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setIsFullScreen(false)}>
              <Minimize2 className="h-3.5 w-3.5" />
              Exit Full Screen
            </Button>
          </div>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("slaStatus")}>SLA Status <SortIcon col="slaStatus" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("referenceNum")}>Transaction ID <SortIcon col="referenceNum" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">PO #</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("clientName")}>Client <SortIcon col="clientName" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("shipToName")}>Ship To <SortIcon col="shipToName" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Create Date</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("ageCalendarDays")}>Age <SortIcon col="ageCalendarDays" /></th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Stage</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">SLA Days</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Rule Applied</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Overdue</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Extension</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground text-xs">No orders match the current filter.</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.extensivOrderId} style={o.slaStatus === "out_of_sla" ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" } : { borderLeft: "3px solid transparent" }}>
                    <td className="px-4 py-2"><SlaPill status={o.slaStatus} daysRemaining={o.daysRemaining} /></td>
                    <td className="px-4 py-2 font-semibold text-foreground">{o.referenceNum || `#${o.extensivOrderId}`}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono">{o.poNum ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{o.clientName}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[140px] truncate" title={o.shipToName ?? ""}>{o.shipToName ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground text-right whitespace-nowrap">{o.ageCalendarDays === 0 ? "Today" : `${o.ageCalendarDays}d`}</td>
                    <td className="px-4 py-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">{o.lifecycleStatus.replace("_", " ")}</span></td>
                    <td className="px-4 py-2 text-muted-foreground text-center">{o.slaDays}d</td>
                    <td className="px-4 py-2">
                      {o.matchedRuleName ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">
                          {o.matchedRuleName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">Base</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {(() => {
                        if (o.slaStatus !== "out_of_sla" || o.daysRemaining >= 0) return <span className="text-muted-foreground text-xs">—</span>;
                        const d = Math.abs(o.daysRemaining);
                        if (d >= 3) return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">{d}d</span>;
                        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">{d}d</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {(o.slaExtensionDays ?? 0) > 0 ? (
                        <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 cursor-default">
                            <CalendarPlus className="h-2.5 w-2.5" />+{o.slaExtensionDays}d
                          </span>
                        </TooltipTrigger><TooltipContent side="left" className="text-xs max-w-[200px]">
                          SLA extended by {o.slaExtensionDays} day{o.slaExtensionDays !== 1 ? "s" : ""}{o.slaExtensionNote ? `: ${o.slaExtensionNote}` : ""}
                        </TooltipContent></Tooltip></TooltipProvider>
                      ) : <span className="text-muted-foreground text-xs">-</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {o.notes ? (
                        <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><MessageSquare className="h-3.5 w-3.5 text-blue-400 cursor-default inline" /></TooltipTrigger><TooltipContent side="left" className="max-w-[220px] text-xs">{o.notes}</TooltipContent></Tooltip></TooltipProvider>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-card rounded-2xl overflow-hidden"
      style={{
        border: slaHealthStyles.border,
        boxShadow: slaHealthStyles.shadow,
      }}
    >
      {/* Card header */}
      <div
        className={`px-6 py-5 select-none bg-card border-b border-border ${onDrillDown ? "cursor-pointer hover:bg-muted/30 transition-colors" : "cursor-pointer"}`}
        onClick={() => {
          if (onDrillDown) {
            onDrillDown();
          } else {
            setExpanded((e) => !e);
          }
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-[15px] leading-tight">{facilityName}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{orders.length} orders tracked</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* SLA % health badge */}
            {slaHealth === "green" && (
              <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold">
                {Math.round(slaRate * 100)}% In SLA
              </Badge>
            )}
            {slaHealth === "yellow" && (
              <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200 text-[10px] font-bold">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {Math.round(slaRate * 100)}% In SLA
              </Badge>
            )}
            {slaHealth === "red" && (
              <Badge className="bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {Math.round(slaRate * 100)}% In SLA
              </Badge>
            )}
            {!drillDown && !onDrillDown && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullScreen(true); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Expand to full screen"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
            {onDrillDown
              ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
              : expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3">
          <button
            className={`rounded-xl p-3 text-center transition-all border cursor-pointer ${filterStatus === "in_sla" ? "ring-2 ring-green-400" : ""}`}
            style={{ background: "#dcfce7", border: "1px solid #bbf7d0" }}
            onClick={(e) => { e.stopPropagation(); setFilterStatus(filterStatus === "in_sla" ? "all" : "in_sla"); if (!expanded) setExpanded(true); }}
          >
            <p className="text-2xl font-bold text-green-700">{inSlaCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-green-600 mt-0.5">In SLA</p>
          </button>
          <button
            className={`rounded-xl p-3 text-center transition-all border cursor-pointer ${filterStatus === "out_of_sla" ? "ring-2 ring-red-400" : ""}`}
            style={{ background: "#fee2e2", border: "1px solid #fecaca" }}
            onClick={(e) => { e.stopPropagation(); setFilterStatus(filterStatus === "out_of_sla" ? "all" : "out_of_sla"); if (!expanded) setExpanded(true); }}
          >
            <p className="text-2xl font-bold text-red-700">{outOfSlaCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600 mt-0.5">Out of SLA</p>
          </button>
        </div>

        {/* Sparkline with window toggle */}
        {facilityId && (
          <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* Day toggle buttons */}
            <div className="flex items-center gap-0.5 shrink-0">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={(e) => { e.stopPropagation(); setSparkDays(d); }}
                  className={[
                    "px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none transition-colors",
                    sparkDays === d
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {d}d
                </button>
              ))}
            </div>
            <SlaSparkline
              points={sparkPoints}
              greenThreshold={greenThreshold}
              yellowThreshold={yellowThreshold}
            />
          </div>
        )}
      </div>

      {/* Order table */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("slaStatus")}>
                  SLA Status <SortIcon col="slaStatus" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("referenceNum")}>
                  Transaction ID <SortIcon col="referenceNum" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">PO #</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("clientName")}>
                  Client <SortIcon col="clientName" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("shipToName")}>
                  Ship To <SortIcon col="shipToName" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Create Date</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px] cursor-pointer whitespace-nowrap" onClick={() => handleSort("ageCalendarDays")}>
                  Age <SortIcon col="ageCalendarDays" />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Stage</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">SLA Days</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Rule Applied</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Overdue</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Extension</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No orders match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.extensivOrderId}
                    style={
                      o.slaStatus === "out_of_sla"
                        ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
                        : { borderLeft: "3px solid transparent" }
                    }
                  >
                    <td className="px-4 py-2">
                      <SlaPill status={o.slaStatus} daysRemaining={o.daysRemaining} />
                    </td>
                    <td className="px-4 py-2 font-semibold text-foreground">
                      {o.referenceNum || `#${o.extensivOrderId}`}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground font-mono">
                      {o.poNum ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{o.clientName}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[140px] truncate" title={o.shipToName ?? ""}>
                      {o.shipToName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-right whitespace-nowrap">
                      {o.ageCalendarDays === 0 ? "Today" : `${o.ageCalendarDays}d`}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                        {o.lifecycleStatus.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-center">
                      {o.slaDays}d
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {(() => {
                        if (o.slaStatus !== "out_of_sla" || o.daysRemaining >= 0) return <span className="text-muted-foreground text-xs">—</span>;
                        const d = Math.abs(o.daysRemaining);
                        if (d >= 3) return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">{d}d</span>;
                        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">{d}d</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {(o.slaExtensionDays ?? 0) > 0 ? (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 cursor-default">
                                <CalendarPlus className="h-2.5 w-2.5" />
                                +{o.slaExtensionDays}d
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs max-w-[200px]">
                              SLA extended by {o.slaExtensionDays} day{o.slaExtensionDays !== 1 ? "s" : ""}
                              {o.slaExtensionNote ? `: ${o.slaExtensionNote}` : ""}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── SLA Requirements tab ─────────────────────────────────────────────────────
type ClientSlaRow = {
  clientId: number;
  clientName: string;
  slaDays: number;
  isDefault: boolean;
  requirementId: number | null;
  notes: string | null;
  updatedAt: Date | null;
};

type SlaRule = {
  id: number;
  requirementId: number;
  clientId: number;
  clientName: string;
  ruleName: string;
  slaDays: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Sub-rule inline editor ───────────────────────────────────────────────────
function SubRuleRow({
  rule,
  onDelete,
  onSaved,
}: {
  rule: SlaRule;
  onDelete: (id: number) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rule.ruleName);
  const [days, setDays] = useState(rule.slaDays);
  const utils = trpc.useUtils();

  const save = trpc.sla.upsertRule.useMutation({
    onSuccess: () => {
      toast.success(`Rule saved: ${name} → ${days}d`);
      utils.sla.listRules.invalidate();
      setEditing(false);
      onSaved();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (editing) {
    return (
      <tr className="bg-blue-50/30 dark:bg-blue-950/10">
        <td className="pl-10 pr-2 py-2">
          <input
            className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name (e.g. Labeling, B2B)"
            autoFocus
          />
        </td>
        <td className="px-2 py-2 text-center">
          <div className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setDays((d) => Math.max(1, d - 1))}
              className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
            >−</button>
            <span className="w-7 text-center text-xs font-mono text-foreground">{days}</span>
            <button
              type="button"
              onClick={() => setDays((d) => Math.min(365, d + 1))}
              className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
            >+</button>
          </div>
        </td>
        <td className="px-2 py-2" colSpan={2} />
        <td className="px-4 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs gap-1"
              disabled={!name.trim() || save.isPending}
              onClick={() =>
                save.mutate({
                  id: rule.id,
                  requirementId: rule.requirementId,
                  clientId: rule.clientId,
                  clientName: rule.clientName,
                  ruleName: name.trim(),
                  slaDays: days,
                })
              }
            >
              {save.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => { setName(rule.ruleName); setDays(rule.slaDays); setEditing(false); }}
            >
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-muted/10 hover:bg-muted/20 transition-colors">
      <td className="pl-10 pr-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">↳</span>
          <span className="text-xs font-medium text-foreground">{rule.ruleName}</span>
        </div>
      </td>
      <td className="px-4 py-2 text-center">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border bg-purple-100 text-purple-700 border-purple-200">
          <Clock className="h-3 w-3" />
          {rule.slaDays}d
        </span>
      </td>
      <td className="px-4 py-2 text-center" />
      <td className="px-4 py-2">
        <span className="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded font-semibold">
          Rule · {new Date(rule.updatedAt).toLocaleDateString()}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600"
            onClick={() => setEditing(true)}
            title="Edit rule"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
            onClick={() => onDelete(rule.id)}
            title="Delete rule"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Add-rule inline row ──────────────────────────────────────────────────────
function AddSubRuleRow({
  row,
  onDone,
}: {
  row: ClientSlaRow;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [days, setDays] = useState(2);
  const utils = trpc.useUtils();

  const save = trpc.sla.upsertRule.useMutation({
    onSuccess: () => {
      toast.success(`Rule added: ${name} → ${days}d`);
      utils.sla.listRules.invalidate();
      setName("");
      setDays(2);
      onDone();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  // If client has no requirementId yet, we need to create the base requirement first
  const upsertReq = trpc.sla.upsertRequirement.useMutation({
    onSuccess: () => {
      utils.sla.allClientsWithRequirements.invalidate();
    },
  });

  async function handleSave() {
    let reqId = row.requirementId;
    if (!reqId) {
      // Auto-create the base requirement at default 2 days so we have a parent row
      await upsertReq.mutateAsync({ clientId: row.clientId, clientName: row.clientName, slaDays: row.slaDays });
      // Re-fetch to get the new requirementId
      const refreshed = await utils.sla.allClientsWithRequirements.fetch();
      const found = refreshed.find((c: ClientSlaRow) => c.clientId === row.clientId);
      reqId = found?.requirementId ?? null;
    }
    if (!reqId) { toast.error("Could not create parent SLA record"); return; }
    save.mutate({
      requirementId: reqId,
      clientId: row.clientId,
      clientName: row.clientName,
      ruleName: name.trim(),
      slaDays: days,
    });
  }

  return (
    <tr className="bg-green-50/20 dark:bg-green-950/10">
      <td className="pl-10 pr-2 py-2">
        <input
          className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule name (e.g. Labeling, B2B, Kitting)"
          autoFocus
        />
      </td>
      <td className="px-2 py-2 text-center">
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setDays((d) => Math.max(1, d - 1))}
            className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
          >−</button>
          <span className="w-7 text-center text-xs font-mono text-foreground">{days}</span>
          <button
            type="button"
            onClick={() => setDays((d) => Math.min(365, d + 1))}
            className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
          >+</button>
        </div>
      </td>
      <td className="px-2 py-2" colSpan={2} />
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs gap-1"
            disabled={!name.trim() || save.isPending || upsertReq.isPending}
            onClick={handleSave}
          >
            {(save.isPending || upsertReq.isPending) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onDone}
          >
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main SlaRequirementsTab ──────────────────────────────────────────────────
function SlaRequirementsTab() {
  const { data: allClients = [], isLoading } = trpc.sla.allClientsWithRequirements.useQuery();
  const { data: allRules = [] } = trpc.sla.listRules.useQuery();
  const utils = trpc.useUtils();

  // Local pending changes: clientId -> new slaDays value (before save)
  const [pending, setPending] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");
  // Which client rows are expanded (showing sub-rules)
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Which client is showing the "add rule" inline form
  const [addingRule, setAddingRule] = useState<number | null>(null);

  const upsert = trpc.sla.upsertRequirement.useMutation({
    onSuccess: (_data: unknown, vars: { clientId: number; clientName: string; slaDays: number }) => {
      toast.success(`SLA saved: ${vars.clientName} → ${vars.slaDays}d`);
      utils.sla.allClientsWithRequirements.invalidate();
      utils.sla.listRequirements.invalidate();
      setSaving((s) => { const n = { ...s }; delete n[vars.clientId]; return n; });
      setPending((p) => { const n = { ...p }; delete n[vars.clientId]; return n; });
    },
    onError: (err: { message: string }, vars: { clientId: number }) => {
      toast.error(err.message);
      setSaving((s) => { const n = { ...s }; delete n[vars.clientId]; return n; });
    },
  });

  const del = trpc.sla.deleteRequirement.useMutation({
    onSuccess: () => {
      toast.success("SLA override removed. Client reverts to 2-day default.");
      utils.sla.allClientsWithRequirements.invalidate();
      utils.sla.listRequirements.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const delRule = trpc.sla.deleteRule.useMutation({
    onSuccess: () => {
      toast.success("Rule deleted.");
      utils.sla.listRules.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  function effectiveDays(row: ClientSlaRow): number {
    return pending[row.clientId] ?? row.slaDays;
  }

  function adjust(row: ClientSlaRow, delta: number) {
    const current = effectiveDays(row);
    const next = Math.max(1, current + delta);
    setPending((p) => ({ ...p, [row.clientId]: next }));
  }

  function save(row: ClientSlaRow) {
    const days = effectiveDays(row);
    setSaving((s) => ({ ...s, [row.clientId]: true }));
    upsert.mutate({ clientId: row.clientId, clientName: row.clientName, slaDays: days });
  }

  function reset(row: ClientSlaRow) {
    if (!row.requirementId) return;
    if (confirm(`Remove SLA override for ${row.clientName}? They will revert to the default 2-day SLA.`)) {
      del.mutate({ id: row.requirementId });
      setPending((p) => { const n = { ...p }; delete n[row.clientId]; return n; });
    }
  }

  function toggleExpand(clientId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function handleDeleteRule(id: number) {
    if (confirm("Delete this SLA rule?")) delRule.mutate({ id });
  }

  // Build a map: clientId → rules[]
  const rulesByClient = useMemo(() => {
    const map = new Map<number, SlaRule[]>();
    for (const r of allRules as SlaRule[]) {
      if (!map.has(r.clientId)) map.set(r.clientId, []);
      map.get(r.clientId)!.push(r);
    }
    return map;
  }, [allRules]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allClients;
    return allClients.filter((c) => c.clientName.toLowerCase().includes(q));
  }, [allClients, search]);

  const customCount = allClients.filter((c) => !c.isDefault).length;
  const totalRules = allRules.length;

  return (
    <div className="space-y-4">
      <FacilityThresholdsSection />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground">SLA Requirements</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            All clients are listed below. Default is <strong>2 days</strong> from Create Date.
            Use <strong>+/−</strong> to adjust by one day, then click <strong>Save</strong>.
            Click the <strong>expand arrow</strong> to add named sub-rules (e.g. Labeling, B2B).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 w-44 text-sm"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {customCount > 0 && (
            <span className="text-xs text-muted-foreground">{customCount} override{customCount !== 1 ? "s" : ""}</span>
          )}
          {totalRules > 0 && (
            <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded font-semibold">
              {totalRules} sub-rule{totalRules !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Info card */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-blue-500 shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-medium">System Default: 2 days.</span>{" "}
              Day 1 begins the day after the order is created in Extensiv.
              Clients in <span className="font-semibold">blue</span> have a base override;{" "}
              <span className="text-purple-700 font-semibold">purple</span> rows are named sub-rules (e.g. Labeling, B2B).
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading clients…</span>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Client</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">SLA Days</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Adjust</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No clients match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const days = effectiveDays(row);
                    const isDirty = row.clientId in pending;
                    const isSaving = saving[row.clientId];
                    const isCustom = !row.isDefault || isDirty;
                    const clientRules = rulesByClient.get(row.clientId) ?? [];
                    const isExpanded = expanded.has(row.clientId);
                    const isAddingRule = addingRule === row.clientId;

                    return (
                      <>
                        {/* ── Client base row ── */}
                        <tr
                          key={`client-${row.clientId}`}
                          className={`hover:bg-muted/20 transition-colors ${isDirty ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                        >
                          {/* Client name + expand toggle */}
                          <td className="px-4 py-2.5 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleExpand(row.clientId)}
                                className="h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
                                title={isExpanded ? "Collapse sub-rules" : "Expand sub-rules"}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <span>{row.clientName}</span>
                              {clientRules.length > 0 && (
                                <span className="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-1 py-0.5 rounded font-semibold">
                                  {clientRules.length} rule{clientRules.length !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* SLA days badge */}
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                              isCustom
                                ? "bg-blue-100 text-blue-700 border-blue-200"
                                : "bg-muted/50 text-muted-foreground border-border"
                            }`}>
                              <Clock className="h-3 w-3" />
                              {days}d
                            </span>
                          </td>

                          {/* +/- stepper */}
                          <td className="px-4 py-2.5 text-center">
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => adjust(row, -1)}
                                disabled={days <= 1 || !!isSaving}
                                className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xs font-bold transition-colors"
                                title="Decrease by 1 day"
                              >−</button>
                              <span className="w-7 text-center text-xs font-mono text-foreground">{days}</span>
                              <button
                                type="button"
                                onClick={() => adjust(row, +1)}
                                disabled={days >= 365 || !!isSaving}
                                className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xs font-bold transition-colors"
                                title="Increase by 1 day"
                              >+</button>
                            </div>
                          </td>

                          {/* Status chip */}
                          <td className="px-4 py-2.5">
                            {isDirty ? (
                              <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">Unsaved</span>
                            ) : row.isDefault ? (
                              <span className="text-[10px] text-muted-foreground">Default</span>
                            ) : (
                              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                Override{row.updatedAt ? ` · ${new Date(row.updatedAt).toLocaleDateString()}` : ""}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isDirty && (
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 text-xs gap-1"
                                  onClick={() => save(row)}
                                  disabled={!!isSaving}
                                >
                                  {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Timer className="h-3 w-3" />}
                                  Save
                                </Button>
                              )}
                              {/* Add sub-rule button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-purple-600"
                                onClick={() => {
                                  setExpanded((prev) => new Set(Array.from(prev).concat(row.clientId)));
                                  setAddingRule(row.clientId);
                                }}
                                title="Add sub-rule (e.g. Labeling, B2B)"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                              {!row.isDefault && !isDirty && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                  onClick={() => reset(row)}
                                  title="Remove override (revert to 2-day default)"
                                  disabled={del.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* ── Sub-rules (expanded) ── */}
                        {isExpanded && clientRules.map((rule) => (
                          <SubRuleRow
                            key={`rule-${rule.id}`}
                            rule={rule}
                            onDelete={handleDeleteRule}
                            onSaved={() => utils.sla.listRules.invalidate()}
                          />
                        ))}

                        {/* ── Add rule inline form ── */}
                        {isExpanded && isAddingRule && (
                          <AddSubRuleRow
                            key={`add-${row.clientId}`}
                            row={row}
                            onDone={() => setAddingRule(null)}
                          />
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}


// ─── Facility Health Thresholds section ─────────────────────────────────────
type FacilityThresholdRow = {
  id?: number;
  facilityId: number;
  facilityName: string;
  greenThreshold: number;
  yellowThreshold: number;
  notes?: string | null;
};

function FacilityThresholdsSection() {
  const utils = trpc.useUtils();
  const { data: thresholds = [], isLoading } = trpc.sla.listFacilityThresholds.useQuery();
  // Fetch all facilities from the SLA orders to know which facilityIds exist
  const { data: slaOrders = [] } = trpc.sla.getStatus.useQuery();

  // Build a list of known facilities from SLA orders
  const knownFacilities = useMemo(() => {
    const map = new Map<number, string>();
    for (const o of slaOrders as SlaOrder[]) {
      if (!map.has(o.facilityId)) map.set(o.facilityId, o.facilityName ?? `Facility ${o.facilityId}`);
    }
    return Array.from(map.entries()).map(([facilityId, facilityName]) => ({ facilityId, facilityName })).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  }, [slaOrders]);

  // Local pending edits: facilityId -> {green, yellow}
  const [pending, setPending] = useState<Record<number, { green: number; yellow: number }>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const upsert = trpc.sla.upsertFacilityThreshold.useMutation({
    onSuccess: (_data: unknown, vars: { facilityId: number }) => {
      toast.success("Thresholds saved");
      utils.sla.listFacilityThresholds.invalidate();
      setSaving((s) => { const n = { ...s }; delete n[vars.facilityId]; return n; });
      setPending((p) => { const n = { ...p }; delete n[vars.facilityId]; return n; });
    },
    onError: (err: { message: string }, vars: { facilityId: number }) => {
      toast.error(err.message);
      setSaving((s) => { const n = { ...s }; delete n[vars.facilityId]; return n; });
    },
  });

  function getRow(facilityId: number, facilityName: string): FacilityThresholdRow {
    const saved = thresholds.find((t) => t.facilityId === facilityId);
    const p = pending[facilityId];
    return {
      id: saved?.id,
      facilityId,
      facilityName,
      greenThreshold: p?.green ?? saved?.greenThreshold ?? 98,
      yellowThreshold: p?.yellow ?? saved?.yellowThreshold ?? 95,
      notes: saved?.notes,
    };
  }

  function isDirty(facilityId: number) {
    return !!pending[facilityId];
  }

  function handleChange(facilityId: number, field: "green" | "yellow", value: number) {
    setPending((p) => ({
      ...p,
      [facilityId]: {
        green: p[facilityId]?.green ?? (thresholds.find((t) => t.facilityId === facilityId)?.greenThreshold ?? 98),
        yellow: p[facilityId]?.yellow ?? (thresholds.find((t) => t.facilityId === facilityId)?.yellowThreshold ?? 95),
        [field]: value,
      },
    }));
  }

  function handleSave(facilityId: number, facilityName: string) {
    const row = getRow(facilityId, facilityName);
    if (row.greenThreshold <= row.yellowThreshold) {
      toast.error("Green threshold must be higher than yellow threshold.");
      return;
    }
    setSaving((s) => ({ ...s, [facilityId]: true }));
    upsert.mutate({
      facilityId,
      facilityName,
      greenThreshold: row.greenThreshold,
      yellowThreshold: row.yellowThreshold,
    });
  }

  if (isLoading || knownFacilities.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 pt-4 px-4">
        <div>
          <CardTitle className="text-sm font-semibold">Warehouse Health Thresholds</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set the minimum % of orders within SLA to display green or yellow on each warehouse card.
            Below the yellow threshold is shown as red.
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "#15527f" }}>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-white">Warehouse</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-white">Green ≥ (%)</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-white">Yellow ≥ (%)</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-white">Red &lt; (%)</th>
                <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-white">Action</th>
              </tr>
            </thead>
            <tbody>
              {knownFacilities.map((fac, idx) => {
                const row = getRow(fac.facilityId, fac.facilityName);
                const dirty = isDirty(fac.facilityId);
                const isSaving = saving[fac.facilityId];
                const rowBg = idx % 2 === 0 ? "#ffffff" : "#eaf4fb";
                return (
                  <tr key={fac.facilityId} style={{ background: rowBg }}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{fac.facilityName}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleChange(fac.facilityId, "green", Math.max(0, row.greenThreshold - 1))}
                          className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
                        >−</button>
                        <span className="w-10 text-center font-mono text-sm font-semibold text-green-700">{row.greenThreshold}%</span>
                        <button
                          onClick={() => handleChange(fac.facilityId, "green", Math.min(100, row.greenThreshold + 1))}
                          className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
                        >+</button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleChange(fac.facilityId, "yellow", Math.max(0, row.yellowThreshold - 1))}
                          className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
                        >−</button>
                        <span className="w-10 text-center font-mono text-sm font-semibold text-yellow-700">{row.yellowThreshold}%</span>
                        <button
                          onClick={() => handleChange(fac.facilityId, "yellow", Math.min(100, row.yellowThreshold + 1))}
                          className="h-6 w-6 rounded border border-border bg-background text-muted-foreground hover:bg-muted flex items-center justify-center text-xs font-bold"
                        >+</button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-sm font-semibold text-red-600">
                      &lt;{row.yellowThreshold}%
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {dirty ? (
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs gap-1"
                          onClick={() => handleSave(fac.facilityId, fac.facilityName)}
                          disabled={!!isSaving}
                        >
                          {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Timer className="h-3 w-3" />}
                          Save
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {thresholds.find((t) => t.facilityId === fac.facilityId) ? "Saved" : "Default"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main SLA Tracker page ────────────────────────────────────────────────────
export default function SlaTracker() {
  const { selectedFacilityId: globalFacilityId } = useWarehouse();
  const { data: slaOrders = [], isLoading, refetch, isFetching } = trpc.sla.getStatus.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
  });
  const { data: facilityThresholds = [] } = trpc.sla.listFacilityThresholds.useQuery();
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  // Reset drill-down whenever global warehouse changes
  useEffect(() => { setSelectedFacilityId(null); }, [globalFacilityId]);
  // Group orders by facility — apply global warehouse filter
  const facilityGroups = useMemo(() => {
    const map = new Map<number, { facilityId: number; facilityName: string; orders: SlaOrder[] }>();
    for (const order of slaOrders as SlaOrder[]) {
      if (globalFacilityId != null && order.facilityId !== globalFacilityId) continue;
      const key = order.facilityId;
      if (!map.has(key)) {
        map.set(key, { facilityId: key, facilityName: order.facilityName ?? `Facility ${key}`, orders: [] });
      }
      map.get(key)!.orders.push(order);
    }
    return Array.from(map.values()).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  }, [slaOrders]);

  const selectedGroup = selectedFacilityId !== null
    ? facilityGroups.find((g) => g.facilityId === selectedFacilityId) ?? null
    : null;

  const totalInSla = (slaOrders as SlaOrder[]).filter((o) => o.slaStatus === "in_sla").length;
  const totalOutOfSla = (slaOrders as SlaOrder[]).filter((o) => o.slaStatus === "out_of_sla").length;

  return (

      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {selectedGroup && (
              <button
                onClick={() => setSelectedFacilityId(null)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                All Warehouses
              </button>
            )}
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Timer className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {selectedGroup ? selectedGroup.facilityName : "SLA Tracker"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {selectedGroup
                  ? `SLA Tracker › ${selectedGroup.facilityName}`
                  : "Tracks all open orders against SLA thresholds (default: 2 days from Create Date)."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-2">
            <TabsTrigger value="dashboard" className="gap-2">
              <Timer className="h-3.5 w-3.5" />
              SLA Dashboard
            </TabsTrigger>
            <TabsTrigger value="requirements" className="gap-2">
              <Clock className="h-3.5 w-3.5" />
              SLA Requirements
            </TabsTrigger>
          </TabsList>

          {/* ── Dashboard Tab ── */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            {/* Global KPI row */}
            {!isLoading && (
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In SLA</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-3xl font-bold text-green-600">{totalInSla}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">orders on track</p>
                  </CardContent>
                </Card>
                <Card style={{ border: totalOutOfSla > 0 ? "2px solid #ef4444" : undefined }}>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Out of SLA</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className={`text-3xl font-bold ${totalOutOfSla > 0 ? "text-red-600" : "text-muted-foreground"}`}>{totalOutOfSla}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">orders breached</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Loading SLA data…</span>
              </div>
            ) : facilityGroups.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Timer className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-30" />
                  <p className="text-muted-foreground">No tracked orders found.</p>
                  <p className="text-xs text-muted-foreground mt-1">Orders sync from Extensiv every hour.</p>
                </CardContent>
              </Card>
            ) : selectedGroup ? (
              <WarehouseSlaCard
                key={selectedGroup.facilityId}
                facilityId={selectedGroup.facilityId}
                facilityName={selectedGroup.facilityName}
                orders={selectedGroup.orders}
                drillDown
                greenThreshold={facilityThresholds.find((t) => t.facilityId === selectedGroup.facilityId)?.greenThreshold ?? 98}
                yellowThreshold={facilityThresholds.find((t) => t.facilityId === selectedGroup.facilityId)?.yellowThreshold ?? 95}
              />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {facilityGroups.map((group) => (
                  <WarehouseSlaCard
                    key={group.facilityId}
                    facilityId={group.facilityId}
                    facilityName={group.facilityName}
                    orders={group.orders}
                    onDrillDown={() => setSelectedFacilityId(group.facilityId)}
                    greenThreshold={facilityThresholds.find((t) => t.facilityId === group.facilityId)?.greenThreshold ?? 98}
                    yellowThreshold={facilityThresholds.find((t) => t.facilityId === group.facilityId)?.yellowThreshold ?? 95}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── SLA Requirements Tab ── */}
          <TabsContent value="requirements" className="mt-4">
            <SlaRequirementsTab />
          </TabsContent>
        </Tabs>
      </div>

  );
}
