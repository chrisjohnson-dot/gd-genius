/**
 * SLA Performance — Unified Page
 *
 * Tab 1 – Live Dashboard: warehouse cards (Tracker-style) with B2B / D2C split.
 *   • Click any out-of-SLA row → Remove or Waive dialog (mandatory reason, audit trail).
 *   • Waived orders stay visible but are flagged; Removed orders are hidden.
 *   • Restore button undoes either action.
 *
 * Tab 2 – Compliance Snapshots: KPI tiles, breach table, watch list, trend chart, client rules.
 *
 * Tab 3 – SLA Requirements: per-client day settings (from SlaTracker).
 *
 * Tab 4 – Audit Trail: full history of Remove / Waive actions with user + timestamp.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Ban,
  BookOpen,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Eye,
  FileDown,
  History,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  XCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";

// ─── useLocalStorage ──────────────────────────────────────────────────────────
function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {}
    return defaultValue;
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
    },
    [key]
  );
  return [value, set];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}
function complianceColor(pct: number) {
  if (pct >= 98) return "text-green-600 dark:text-green-400";
  if (pct >= 95) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}
function complianceBg(pct: number) {
  if (pct >= 98) return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
  if (pct >= 95) return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800";
  return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
}
function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
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
  orderChannel: "b2b" | "d2c" | "both";
  slaActionStatus: "active" | "waived" | "removed";
};
type LiveSortKey = "clientName" | "referenceNum" | "ageCalendarDays" | "slaStatus" | "shipToName";
type SnapSortKey = "clientName" | "slaDate" | "bizDaysLate" | "creation";
type ChannelFilter = "all" | "b2b" | "d2c";
type SnapshotRow = {
  id: number;
  snapshotDate: string;
  orderId: number | string;
  clientId: number;
  clientName: string;
  poNum: string | null;
  refNum: string | null;
  creation: string | null;
  company: string | null;
  notes: string | null;
  facility: string | null;
  fullyAllocated: boolean;
  rule: string;
  slaDate: string | null;
  outOfSla: boolean;
  alwaysFlag: boolean;
  flagNote: string | null;
  bizDaysLate: number | null;
};

// ─── SLA Sparkline ────────────────────────────────────────────────────────────
type SparkPoint = { snapshotDate: string; slaRate: number };
function SlaSparkline({ points, greenThreshold = 98, yellowThreshold = 95 }: { points: SparkPoint[]; greenThreshold?: number; yellowThreshold?: number }) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  if (!points || points.length < 2) return <span className="text-[10px] text-muted-foreground opacity-50">No trend data</span>;
  const W = 80, H = 28, PAD = 2;
  const rates = points.map((p) => p.slaRate);
  const min = Math.max(0, Math.min(...rates) - 5);
  const max = Math.min(100, Math.max(...rates) + 5);
  const range = max - min || 1;
  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const ys = rates.map((r) => PAD + (1 - (r - min) / range) * (H - PAD * 2));
  const lastRate = rates[rates.length - 1];
  const delta = lastRate - rates[0];
  const trendColor = lastRate >= greenThreshold ? "#16a34a" : lastRate >= yellowThreshold ? "#ca8a04" : "#ef4444";
  const arrowColor = delta > 0.5 ? "#16a34a" : delta < -0.5 ? "#ef4444" : "#6b7280";
  const TrendArrow = delta > 0.5 ? "↑" : delta < -0.5 ? "↓" : "→";
  function fmtSparkDate(d: string) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ position: "relative", width: W, height: H }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", display: "block" }}>
          <polyline points={xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")} fill="none" stroke={trendColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          {xs.map((x, i) => (
            <circle key={i} cx={x} cy={ys[i]} r={hoveredIdx === i ? 4 : i === xs.length - 1 ? 2.5 : 1.5} fill={trendColor} opacity={hoveredIdx === i ? 1 : 0.9} style={{ cursor: "pointer", transition: "r 0.1s" }} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} />
          ))}
        </svg>
        {hoveredIdx !== null && (
          <div style={{ position: "absolute", top: `${ys[hoveredIdx] - 28}px`, ...(xs[hoveredIdx] > W / 2 ? { right: `${W - xs[hoveredIdx] + 6}px` } : { left: `${xs[hoveredIdx] + 6}px` }), background: "#1e293b", color: "#f1f5f9", fontSize: "10px", fontWeight: 600, padding: "3px 6px", borderRadius: "4px", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 50, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>
            {fmtSparkDate(points[hoveredIdx].snapshotDate)} · {points[hoveredIdx].slaRate}%
          </div>
        )}
      </div>
      <span className="text-[10px] font-bold" style={{ color: arrowColor }}>{TrendArrow} {lastRate}%</span>
    </div>
  );
}

// ─── SLA Pill ─────────────────────────────────────────────────────────────────
function SlaPill({ status, daysRemaining, actionStatus }: { status: "in_sla" | "out_of_sla"; daysRemaining: number; actionStatus?: "active" | "waived" | "removed" }) {
  if (actionStatus === "waived") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-purple-100 text-purple-700 border border-purple-200"><CheckSquare className="h-2.5 w-2.5" />Waived</span>;
  if (actionStatus === "removed") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-gray-100 text-gray-500 border border-gray-200"><Ban className="h-2.5 w-2.5" />Removed</span>;
  if (status === "in_sla") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-green-100 text-green-700 border border-green-200"><CheckCircle2 className="h-2.5 w-2.5" />In SLA {daysRemaining > 0 ? `(${daysRemaining}d left)` : "(today)"}</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap bg-red-100 text-red-700 border border-red-200"><AlertTriangle className="h-2.5 w-2.5" />Out of SLA ({Math.abs(daysRemaining)}d overdue)</span>;
}

// ─── Channel Badge ────────────────────────────────────────────────────────────
function ChannelBadge({ channel }: { channel: "b2b" | "d2c" | "both" }) {
  if (channel === "b2b") return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase"><Truck className="h-2 w-2" />B2B</span>;
  if (channel === "d2c") return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200 uppercase"><ShoppingCart className="h-2 w-2" />D2C</span>;
  return null;
}

// ─── Remove / Waive Dialog ────────────────────────────────────────────────────
function SlaActionDialog({ order, onClose, onSuccess }: { order: SlaOrder | null; onClose: () => void; onSuccess: () => void }) {
  const [action, setAction] = useState<"remove" | "waive">("waive");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (order) { setAction("waive"); setReason(""); setSubmitting(false); }
  }, [order?.extensivOrderId]);

  const waiveMut = trpc.sla.waiveOrder.useMutation({
    onSuccess: () => { toast.success(`Order ${order?.referenceNum ?? order?.extensivOrderId} waived`); utils.sla.getStatus.invalidate(); onSuccess(); onClose(); },
    onError: (err) => { toast.error(`Failed: ${err.message}`); setSubmitting(false); },
  });
  const removeMut = trpc.sla.removeOrder.useMutation({
    onSuccess: () => { toast.success(`Order ${order?.referenceNum ?? order?.extensivOrderId} removed from SLA tracking`); utils.sla.getStatus.invalidate(); onSuccess(); onClose(); },
    onError: (err) => { toast.error(`Failed: ${err.message}`); setSubmitting(false); },
  });

  function handleSubmit() {
    if (!order) return;
    if (!reason.trim()) { toast.error("A reason is required before confirming."); return; }
    setSubmitting(true);
    const payload = { extensivOrderId: order.extensivOrderId, referenceNum: order.referenceNum, clientId: order.clientId, clientName: order.clientName, facilityId: order.facilityId, facilityName: order.facilityName, reason: reason.trim() };
    if (action === "waive") waiveMut.mutate(payload);
    else removeMut.mutate(payload);
  }

  return (
    <Dialog open={!!order} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />SLA Action — {order?.referenceNum ?? `#${order?.extensivOrderId}`}</DialogTitle>
          <DialogDescription>{order?.clientName} · {order?.facilityName ?? "Unknown facility"} · {Math.abs(order?.daysRemaining ?? 0)}d overdue</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Action</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAction("waive")} className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm font-medium ${action === "waive" ? "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950/30" : "border-border bg-card text-muted-foreground hover:border-purple-300"}`}>
                <CheckSquare className="h-5 w-5" />Waive
                <span className="text-[10px] font-normal text-center leading-tight">Keep visible, flag as waived. Not counted against compliance.</span>
              </button>
              <button type="button" onClick={() => setAction("remove")} className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm font-medium ${action === "remove" ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30" : "border-border bg-card text-muted-foreground hover:border-red-300"}`}>
                <Ban className="h-5 w-5" />Remove
                <span className="text-[10px] font-normal text-center leading-tight">Hide from SLA dashboard entirely. Not counted against compliance.</span>
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-reason" className="text-sm font-medium">Reason <span className="text-red-500">*</span></Label>
            <textarea id="sla-reason" className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" placeholder={action === "waive" ? "e.g. Customer requested delay, inventory shortage, carrier issue…" : "e.g. Duplicate order, test order, cancelled by client…"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            <p className="text-[10px] text-muted-foreground text-right">{reason.length}/1000</p>
          </div>
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2"><History className="h-3 w-3 inline mr-1 mb-0.5" />This action will be recorded in the SLA audit trail with your name and timestamp.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !reason.trim()} className={action === "remove" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"}>
            {submitting ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : action === "waive" ? <CheckSquare className="h-4 w-4 mr-1" /> : <Ban className="h-4 w-4 mr-1" />}
            {submitting ? "Saving…" : action === "waive" ? "Confirm Waive" : "Confirm Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Restore Dialog ───────────────────────────────────────────────────────────
function RestoreDialog({ order, onClose, onSuccess }: { order: SlaOrder | null; onClose: () => void; onSuccess: () => void }) {
  const utils = trpc.useUtils();
  const restoreMut = trpc.sla.restoreOrder.useMutation({
    onSuccess: () => { toast.success(`Order ${order?.referenceNum ?? order?.extensivOrderId} restored to active SLA tracking`); utils.sla.getStatus.invalidate(); onSuccess(); onClose(); },
    onError: (err) => toast.error(`Failed to restore: ${err.message}`),
  });
  return (
    <Dialog open={!!order} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-blue-500" />Restore SLA Tracking</DialogTitle>
          <DialogDescription>Restore <strong>{order?.referenceNum ?? `#${order?.extensivOrderId}`}</strong> to active SLA tracking? This will undo the {order?.slaActionStatus} action.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => order && restoreMut.mutate({ extensivOrderId: order.extensivOrderId })} disabled={restoreMut.isPending}><RotateCcw className="h-4 w-4 mr-1" />Restore</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Warehouse Card ───────────────────────────────────────────────────────────
function WarehouseSlaCard({ facilityId, facilityName, orders, drillDown = false, onDrillDown, greenThreshold = 98, yellowThreshold = 95 }: {
  facilityId?: number; facilityName: string; orders: SlaOrder[]; drillDown?: boolean; onDrillDown?: () => void; greenThreshold?: number; yellowThreshold?: number;
}) {
  const expandKey = `sla-warehouse-expanded-${facilityId ?? facilityName}`;
  const [expandedStored, setExpandedStored] = useLocalStorage<boolean>(expandKey, false);
  const [expanded, setExpandedLocal] = useState<boolean>(drillDown ? true : expandedStored);
  function setExpanded(v: boolean | ((p: boolean) => boolean)) {
    setExpandedLocal((prev) => { const next = typeof v === "function" ? v(prev) : v; if (!drillDown) setExpandedStored(next); return next; });
  }
  const [sortKey, setSortKey] = useState<LiveSortKey>("slaStatus");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterStatus, setFilterStatus] = useState<"all" | "in_sla" | "out_of_sla">("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionOrder, setActionOrder] = useState<SlaOrder | null>(null);
  const [restoreOrder, setRestoreOrder] = useState<SlaOrder | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const sparkKey = `sla-spark-days-${facilityId ?? "default"}`;
  const [sparkDays, setSparkDays] = useLocalStorage<7 | 14 | 30>(sparkKey, 7);
  const historyQuery = trpc.sla.facilityHistory.useQuery({ facilityId: facilityId ?? 0, days: sparkDays }, { enabled: !!facilityId, staleTime: 5 * 60 * 1000 });
  const sparkPoints = historyQuery.data ?? [];

  // Counts — exclude removed from compliance
  const activeOrders = orders.filter((o) => o.slaActionStatus !== "removed");
  const inSlaCount = activeOrders.filter((o) => o.slaStatus === "in_sla" || o.slaActionStatus === "waived").length;
  const outOfSlaCount = activeOrders.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length;
  const waivedCount = orders.filter((o) => o.slaActionStatus === "waived").length;

  // B2B / D2C split (active only)
  const b2bOrders = activeOrders.filter((o) => o.orderChannel === "b2b" || o.orderChannel === "both");
  const d2cOrders = activeOrders.filter((o) => o.orderChannel === "d2c" || o.orderChannel === "both");
  const b2bOos = b2bOrders.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length;
  const d2cOos = d2cOrders.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length;
  const b2bInSla = b2bOrders.filter((o) => o.slaStatus === "in_sla" || o.slaActionStatus === "waived").length;
  const d2cInSla = d2cOrders.filter((o) => o.slaStatus === "in_sla" || o.slaActionStatus === "waived").length;
  const b2bPct = b2bOrders.length > 0 ? (b2bInSla / b2bOrders.length) * 100 : 100;
  const d2cPct = d2cOrders.length > 0 ? (d2cInSla / d2cOrders.length) * 100 : 100;

  const slaRatePct = activeOrders.length > 0 ? (inSlaCount / activeOrders.length) * 100 : 100;
  const slaHealth: "green" | "yellow" | "red" = slaRatePct >= greenThreshold ? "green" : slaRatePct >= yellowThreshold ? "yellow" : "red";
  const slaStyles = {
    green:  { border: "2px solid #16a34a", shadow: "0 0 0 1px rgba(22,163,74,0.15), 0 4px 16px rgba(22,163,74,0.10)", leftBar: "#16a34a" },
    yellow: { border: "2px solid #ca8a04", shadow: "0 0 0 1px rgba(202,138,4,0.15), 0 4px 16px rgba(202,138,4,0.10)", leftBar: "#ca8a04" },
    red:    { border: "2px solid #ef4444", shadow: "0 0 0 1px rgba(239,68,68,0.15), 0 4px 16px rgba(239,68,68,0.10)", leftBar: "#ef4444" },
  }[slaHealth];

  function handleSort(key: LiveSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    let list = orders;
    if (channelFilter !== "all") list = list.filter((o) => o.orderChannel === channelFilter || o.orderChannel === "both");
    if (filterStatus === "in_sla") list = list.filter((o) => o.slaStatus === "in_sla" && o.slaActionStatus === "active");
    else if (filterStatus === "out_of_sla") list = list.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((o) => (o.referenceNum ?? "").toLowerCase().includes(q) || (o.poNum ?? "").toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q) || (o.shipToName ?? "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ageCalendarDays") cmp = a.ageCalendarDays - b.ageCalendarDays;
      else if (sortKey === "slaStatus") cmp = a.slaStatus === b.slaStatus ? 0 : a.slaStatus === "out_of_sla" ? -1 : 1;
      else cmp = String(a[sortKey as keyof SlaOrder] ?? "").localeCompare(String(b[sortKey as keyof SlaOrder] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [orders, channelFilter, filterStatus, searchQuery, sortKey, sortDir]);

  function SortIcon({ k }: { k: LiveSortKey }) {
    if (sortKey !== k) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function renderTable(rows: SlaOrder[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort("slaStatus")}>Status <SortIcon k="slaStatus" /></th>
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort("referenceNum")}>Transaction ID <SortIcon k="referenceNum" /></th>
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground">PO #</th>
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("clientName")}>Client <SortIcon k="clientName" /></th>
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Channel</th>
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleSort("shipToName")}>Ship To <SortIcon k="shipToName" /></th>
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Create Date</th>
              <th className="px-4 py-2 text-right font-semibold text-muted-foreground cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("ageCalendarDays")}>Age <SortIcon k="ageCalendarDays" /></th>
              <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Stage</th>
              <th className="px-4 py-2 text-center font-semibold text-muted-foreground">SLA</th>
              <th className="px-4 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Overdue</th>
              <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Ext.</th>
              <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Notes</th>
              <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={14} className="px-4 py-8 text-center text-muted-foreground text-xs">No orders match the current filter.</td></tr>
            ) : rows.map((o) => (
              <tr key={o.extensivOrderId} style={
                o.slaActionStatus === "removed" ? { background: "rgba(107,114,128,0.05)", borderLeft: "3px solid #9ca3af", opacity: 0.6 }
                : o.slaActionStatus === "waived" ? { background: "rgba(147,51,234,0.04)", borderLeft: "3px solid #a855f7" }
                : o.slaStatus === "out_of_sla" ? { background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }
                : { borderLeft: "3px solid transparent" }
              } className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setDetailOrderId(o.extensivOrderId)}>
                <td className="px-4 py-2"><SlaPill status={o.slaStatus} daysRemaining={o.daysRemaining} actionStatus={o.slaActionStatus} /></td>
                <td className="px-4 py-2 font-semibold text-foreground">{o.referenceNum || `#${o.extensivOrderId}`}</td>
                <td className="px-4 py-2 text-muted-foreground font-mono">{o.poNum ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{o.clientName}</td>
                <td className="px-4 py-2"><ChannelBadge channel={o.orderChannel} /></td>
                <td className="px-4 py-2 text-muted-foreground max-w-[140px] truncate" title={o.shipToName ?? ""}>{o.shipToName ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{o.creationDate ? new Date(o.creationDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2 text-muted-foreground text-right whitespace-nowrap">{o.ageCalendarDays === 0 ? "Today" : `${o.ageCalendarDays}d`}</td>
                <td className="px-4 py-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">{o.lifecycleStatus.replace("_", " ")}</span></td>
                <td className="px-4 py-2 text-muted-foreground text-center">{o.slaDays}d</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {(() => {
                    if (o.slaStatus !== "out_of_sla" || o.daysRemaining >= 0) return <span className="text-muted-foreground text-xs">—</span>;
                    const d = Math.abs(o.daysRemaining);
                    return d >= 3
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">{d}d</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">{d}d</span>;
                  })()}
                </td>
                <td className="px-4 py-2 text-center">
                  {(o.slaExtensionDays ?? 0) > 0 ? (
                    <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 cursor-default"><CalendarPlus className="h-2.5 w-2.5" />+{o.slaExtensionDays}d</span>
                    </TooltipTrigger><TooltipContent side="left" className="text-xs max-w-[200px]">SLA extended by {o.slaExtensionDays} day{o.slaExtensionDays !== 1 ? "s" : ""}{o.slaExtensionNote ? `: ${o.slaExtensionNote}` : ""}</TooltipContent></Tooltip></TooltipProvider>
                  ) : <span className="text-muted-foreground text-xs">-</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  {o.notes ? (
                    <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><MessageSquare className="h-3.5 w-3.5 text-blue-400 cursor-default inline" /></TooltipTrigger><TooltipContent side="left" className="max-w-[220px] text-xs">{o.notes}</TooltipContent></Tooltip></TooltipProvider>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-center">
                  {o.slaStatus === "out_of_sla" && o.slaActionStatus === "active" && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1 border-red-200 text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); setActionOrder(o); }}>
                      <AlertTriangle className="h-2.5 w-2.5" />Action
                    </Button>
                  )}
                  {(o.slaActionStatus === "waived" || o.slaActionStatus === "removed") && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); setRestoreOrder(o); }}>
                      <RotateCcw className="h-2.5 w-2.5" />Restore
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderChannelSplit() {
    const b2b = filtered.filter((o) => o.orderChannel === "b2b" || o.orderChannel === "both");
    const d2c = filtered.filter((o) => o.orderChannel === "d2c" || o.orderChannel === "both");
    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900">
            <Truck className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">B2B</span>
            <span className="text-[10px] text-blue-500 ml-auto">{b2b.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length} breach(es) · {b2b.length} total</span>
          </div>
          {renderTable(b2b)}
        </div>
        <div>
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-950/20 border-b border-orange-100 dark:border-orange-900">
            <ShoppingCart className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-xs font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wide">D2C</span>
            <span className="text-[10px] text-orange-500 ml-auto">{d2c.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length} breach(es) · {d2c.length} total</span>
          </div>
          {renderTable(d2c)}
        </div>
      </div>
    );
  }

  return (
    <>
      <SlaActionDialog order={actionOrder} onClose={() => setActionOrder(null)} onSuccess={() => {}} />
      <RestoreDialog order={restoreOrder} onClose={() => setRestoreOrder(null)} onSuccess={() => {}} />
      <OrderDetailDrawer orderId={detailOrderId} onClose={() => setDetailOrderId(null)} />
      <div className={`bg-card rounded-2xl overflow-hidden ${isFullScreen ? "fixed inset-4 z-50 overflow-y-auto" : ""}`} style={{ border: slaStyles.border, boxShadow: slaStyles.shadow }}>
        {/* Card header */}
        <div className="px-6 py-5 select-none bg-card border-b border-border cursor-pointer hover:bg-muted/30 transition-colors" style={{ borderLeft: `4px solid ${slaStyles.leftBar}` }} onClick={() => { if (onDrillDown) onDrillDown(); else setExpanded((e) => !e); }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center"><Warehouse className="h-4 w-4 text-muted-foreground" /></div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{facilityName}</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{orders.length} orders tracked</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Sparkline */}
              <div className="hidden lg:block" onClick={(e) => e.stopPropagation()}>
                <SlaSparkline points={sparkPoints} greenThreshold={greenThreshold} yellowThreshold={yellowThreshold} />
                <div className="flex gap-1 mt-1 justify-end">
                  {([7, 14, 30] as const).map((d) => (
                    <button key={d} onClick={(e) => { e.stopPropagation(); setSparkDays(d); }} className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${sparkDays === d ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{d}d</button>
                  ))}
                </div>
              </div>
              {/* Four stat pills: B2B In SLA, B2B OOS, D2C In SLA, D2C OOS — clickable filters */}
              <div className="hidden xl:flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {([
                  { ch: "b2b" as ChannelFilter, st: "in_sla" as const,     bg: "#dcfce7", bdr: "#bbf7d0", tc: "text-green-700", lc: "text-green-600", icon: <Truck       className="h-2.5 w-2.5 text-green-600" />, label: "In SLA",  count: b2bInSla },
                  { ch: "b2b" as ChannelFilter, st: "out_of_sla" as const, bg: "#fee2e2", bdr: "#fecaca", tc: "text-red-700",   lc: "text-red-600",   icon: <Truck       className="h-2.5 w-2.5 text-red-600" />,   label: "OOS",    count: b2bOos },
                  { ch: "d2c" as ChannelFilter, st: "in_sla" as const,     bg: "#dcfce7", bdr: "#bbf7d0", tc: "text-green-700", lc: "text-green-600", icon: <ShoppingCart className="h-2.5 w-2.5 text-green-600" />, label: "In SLA",  count: d2cInSla },
                  { ch: "d2c" as ChannelFilter, st: "out_of_sla" as const, bg: "#fee2e2", bdr: "#fecaca", tc: "text-red-700",   lc: "text-red-600",   icon: <ShoppingCart className="h-2.5 w-2.5 text-red-600" />,   label: "OOS",    count: d2cOos },
                ] as Array<{ ch: ChannelFilter; st: "in_sla" | "out_of_sla"; bg: string; bdr: string; tc: string; lc: string; icon: React.ReactNode; label: string; count: number }>).map(({ ch, st, bg, bdr, tc, lc, icon, label, count }) => {
                  const active = channelFilter === ch && filterStatus === st;
                  return (
                    <button
                      key={`${ch}-${st}`}
                      className={`rounded-md px-2 py-1 text-center border cursor-pointer transition-all select-none flex flex-col items-center gap-0.5 ${
                        active ? "ring-2 ring-offset-1 ring-blue-400" : "hover:shadow-md"
                      }`}
                      style={{ background: bg, border: `1px solid ${bdr}`, minWidth: 52 }}
                      onClick={() => { if (active) { setChannelFilter("all"); setFilterStatus("all"); } else { setChannelFilter(ch); setFilterStatus(st); setExpanded(true); } }}
                      title={active ? "Click to clear filter" : `Filter: ${label} ${ch.toUpperCase()}`}
                    >
                      <div className="flex items-center gap-0.5">{icon}<span className={`text-[8px] font-bold uppercase ${lc}`}>{ch.toUpperCase()}</span></div>
                      <p className={`text-sm font-extrabold leading-none ${tc}`}>{count}</p>
                      <p className={`text-[8px] font-semibold uppercase ${lc}`}>{label}</p>
                    </button>
                  );
                })}
              </div>
              {!onDrillDown && (
                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" onClick={(e) => { e.stopPropagation(); setIsFullScreen((f) => !f); }} title={isFullScreen ? "Exit full screen" : "Full screen"}>
                  {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              )}
              {!onDrillDown && (
                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" onClick={(e) => { e.stopPropagation(); setExpanded((e2) => !e2); }}>
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Expanded content */}
        {(expanded || drillDown) && (
          <div>
            {/* Filter bar */}
            <div className="px-4 py-3 border-b border-border bg-muted/20 flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search orders…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-7 text-xs" />
              </div>
              <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
                {(["all", "b2b", "d2c"] as ChannelFilter[]).map((ch) => (
                  <button key={ch} onClick={() => setChannelFilter(ch)} className={`px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${channelFilter === ch ? ch === "b2b" ? "bg-blue-600 text-white" : ch === "d2c" ? "bg-orange-500 text-white" : "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
                    {ch === "all" ? "All" : ch.toUpperCase()}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} orders shown</span>
            </div>
            {channelFilter === "all" && (b2bOrders.length > 0 || d2cOrders.length > 0) ? renderChannelSplit() : renderTable(filtered)}
          </div>
        )}
      </div>
    </>
  );
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────
function KpiTile({ label, value, icon, sub, colorClass = "", bgClass = "" }: { label: string; value: string | number; icon: React.ReactNode; sub?: string; colorClass?: string; bgClass?: string }) {
  return (
    <Card className={`border ${bgClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="text-muted-foreground mt-0.5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Snapshot Table ───────────────────────────────────────────────────────────
function SnapshotTable({ rows, sortKey, sortDir, onSort, showBizDays }: { rows: SnapshotRow[]; sortKey: SnapSortKey; sortDir: "asc" | "desc"; onSort: (k: SnapSortKey) => void; showBizDays: boolean }) {
  function SortIcon({ k }: { k: SnapSortKey }) {
    if (sortKey !== k) return <Minus className="w-3 h-3 opacity-30 inline ml-1" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort("clientName")}>Client <SortIcon k="clientName" /></TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>PO #</TableHead>
            <TableHead>Ref #</TableHead>
            <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort("creation")}>Created <SortIcon k="creation" /></TableHead>
            <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort("slaDate")}>SLA Due <SortIcon k="slaDate" /></TableHead>
            <TableHead>Facility</TableHead>
            <TableHead>Rule</TableHead>
            {showBizDays && <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort("bizDaysLate")}>Biz Days Late <SortIcon k="bizDaysLate" /></TableHead>}
            <TableHead>Flag</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={showBizDays ? 10 : 9} className="text-center text-muted-foreground py-8">No records found</TableCell></TableRow>
          ) : rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.clientName}</TableCell>
              <TableCell className="font-mono text-xs">{r.orderId}</TableCell>
              <TableCell className="text-muted-foreground">{r.poNum || "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.refNum || "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.creation)}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.slaDate)}</TableCell>
              <TableCell className="text-muted-foreground">{r.facility || "—"}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] font-medium">{r.rule}</Badge></TableCell>
              {showBizDays && (
                <TableCell>
                  {r.bizDaysLate != null && r.bizDaysLate > 0 ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${r.bizDaysLate >= 3 ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>{r.bizDaysLate}d</span>
                  ) : "—"}
                </TableCell>
              )}
              <TableCell>
                {r.flagNote ? (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><AlertTriangle className="w-3.5 h-3.5 text-yellow-500 cursor-default" /></TooltipTrigger><TooltipContent className="text-xs max-w-[200px]">{r.flagNote}</TooltipContent></Tooltip></TooltipProvider>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────
function TrendChart({ clientId }: { clientId: number }) {
  const { data: history = [], isLoading } = trpc.slaPerformance.getClientHistory.useQuery({ clientId }, { enabled: clientId > 0 });
  const chartData = useMemo(() => [...history].reverse().map((h) => ({ date: h.snapshotDate.slice(5), pct: h.compliancePct, total: h.total, oos: h.outOfSla })), [history]);
  if (isLoading) return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  if (chartData.length === 0) return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No history available for this client</div>;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={[80, 100]} tick={{ fontSize: 11 }} unit="%" />
        <RechartTooltip formatter={(v: number) => [`${v}%`, "Compliance"]} labelFormatter={(l) => `Date: ${l}`} />
        <ReferenceLine y={98} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "98%", fontSize: 10, fill: "#22c55e" }} />
        <ReferenceLine y={95} stroke="#eab308" strokeDasharray="4 2" label={{ value: "95%", fontSize: 10, fill: "#eab308" }} />
        <Line type="monotone" dataKey="pct" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── SLA Requirements Tab (from SlaTracker) ───────────────────────────────────
type ClientSlaRow = { clientId: number; clientName: string; slaDays: number; isDefault: boolean; requirementId: number | null; notes: string | null; updatedAt: Date | string | null; };
type SlaRuleRow = { id: number; requirementId: number; clientId: number; clientName: string; ruleName: string; slaDays: number; notes: string | null };
function SlaRequirementsTab() {
  const { data: allClients = [], isLoading } = trpc.sla.allClientsWithRequirements.useQuery();
  const { data: allRules = [] } = trpc.sla.listRules.useQuery();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");
  const upsert = trpc.sla.upsertRequirement.useMutation({
    onSuccess: (_data, vars) => {
      utils.sla.allClientsWithRequirements.invalidate(); utils.sla.listRules.invalidate();
      setSaving((s) => { const n = { ...s }; delete n[vars.clientId]; return n; });
      setPending((p) => { const n = { ...p }; delete n[vars.clientId]; return n; });
      toast.success(`SLA updated for ${vars.clientName}`);
    },
    onError: (_err, vars) => { setSaving((s) => { const n = { ...s }; delete n[vars.clientId]; return n; }); toast.error("Failed to save SLA requirement"); },
  });
  const del = trpc.sla.deleteRequirement.useMutation({ onSuccess: () => { utils.sla.allClientsWithRequirements.invalidate(); toast.success("Requirement removed"); }, onError: () => toast.error("Failed to delete") });
  const delRule = trpc.sla.deleteRule.useMutation({ onSuccess: () => { utils.sla.listRules.invalidate(); toast.success("Rule deleted"); }, onError: () => toast.error("Failed to delete rule") });
  const rulesByClient = useMemo(() => {
    const map = new Map<number, SlaRuleRow[]>();
    for (const r of allRules as SlaRuleRow[]) { if (!map.has(r.clientId)) map.set(r.clientId, []); map.get(r.clientId)!.push(r); }
    return map;
  }, [allRules]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? (allClients as ClientSlaRow[]).filter((c) => c.clientName.toLowerCase().includes(q)) : (allClients as ClientSlaRow[]);
  }, [allClients, search]);
  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><RefreshCw className="h-5 w-5 animate-spin" /><span>Loading…</span></div>;
  return (
    <div className="space-y-4">
      {/* ── General Parameters ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            General Parameters
            <span className="text-sm font-normal text-muted-foreground">— applies to all clients &amp; all SLAs</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {([
              { icon: "📅", label: "Weekend days excluded", desc: "Saturday and Sunday are never counted toward SLA business days" },
              { icon: "🏖️", label: "Staff holidays excluded", desc: "Statutory and GD-observed holidays do not count as SLA days" },
              { icon: "⏰", label: "Day starts at 08:00 local", desc: "SLA clock begins at 08:00 on the first qualifying business day after receipt" },
              { icon: "🌙", label: "Day ends at 17:00 local", desc: "Orders received after 17:00 start their SLA clock the next business day" },
              { icon: "📦", label: "Receipt day is day zero", desc: "The day inventory is received counts as day 0; SLA days begin the following business day" },
              { icon: "✅", label: "SLA met on ship-ready", desc: "An order is considered SLA-compliant once it reaches Ship Ready status" },
            ] as { icon: string; label: string; desc: string }[]).map(({ icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            These parameters are system-wide defaults. Per-client SLA day counts are configured in the table below.
          </p>
        </CardContent>
      </Card>

      {/* ── Per-client SLA table ── */}
      <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />SLA Requirements<span className="text-sm font-normal text-muted-foreground">— {allClients.length} clients</span></CardTitle>
          <div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-border bg-muted/40"><th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Client</th><th className="px-4 py-2.5 text-center font-semibold text-muted-foreground">SLA Days</th><th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Sub-Rules</th><th className="px-4 py-2.5 text-center font-semibold text-muted-foreground">Actions</th></tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => {
                const rules = rulesByClient.get(row.clientId) ?? [];
                return (
                  <tr key={row.clientId}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.clientName}{row.isDefault && <span className="ml-2 text-[10px] text-muted-foreground font-normal">(default)</span>}</td>
                    <td className="px-4 py-2.5 text-center"><Input type="number" min={1} max={365} className="w-16 h-7 text-center text-sm mx-auto" value={pending[row.clientId] ?? row.slaDays} onChange={(e) => setPending((p) => ({ ...p, [row.clientId]: Number(e.target.value) }))} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {rules.map((r) => (
                          <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                            {r.ruleName} ({r.slaDays}d)
                            <button onClick={() => delRule.mutate({ id: r.id })} className="hover:text-red-600 transition-colors ml-0.5"><Trash2 className="h-2.5 w-2.5" /></button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {pending[row.clientId] !== undefined && pending[row.clientId] !== row.slaDays && (
                          <Button size="sm" className="h-6 text-[10px] px-2" disabled={saving[row.clientId]} onClick={() => { setSaving((s) => ({ ...s, [row.clientId]: true })); upsert.mutate({ clientId: row.clientId, clientName: row.clientName, slaDays: pending[row.clientId] }); }}>
                            {saving[row.clientId] ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : "Save"}
                          </Button>
                        )}
                        {!row.isDefault && row.requirementId != null && <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground hover:text-red-600" onClick={() => del.mutate({ id: row.requirementId! })}><Trash2 className="h-2.5 w-2.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No clients match your search.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

// ─── Audit Trail Tab ──────────────────────────────────────────────────────────
function AuditTrailTab() {
  const { data: actions = [], isLoading } = trpc.sla.listOrderActions.useQuery({ extensivOrderId: undefined });
  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><RefreshCw className="h-5 w-5 animate-spin" /><span>Loading…</span></div>;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-primary" />SLA Order Actions — Audit Trail<span className="text-sm font-normal text-muted-foreground">— {actions.length} records</span></CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead><TableHead>Ref #</TableHead><TableHead>Client</TableHead><TableHead>Facility</TableHead><TableHead>Action</TableHead><TableHead>Reason</TableHead><TableHead>Performed By</TableHead><TableHead className="whitespace-nowrap">Performed At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No SLA actions recorded yet.</TableCell></TableRow>
              ) : actions.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.extensivOrderId}</TableCell>
                  <TableCell className="text-muted-foreground">{a.referenceNum || "—"}</TableCell>
                  <TableCell className="font-medium">{a.clientName}</TableCell>
                  <TableCell className="text-muted-foreground">{a.facilityName || "—"}</TableCell>
                  <TableCell>
                    {a.action === "waive"
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200"><CheckSquare className="h-2.5 w-2.5" />Waived</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200"><Ban className="h-2.5 w-2.5" />Removed</span>}
                  </TableCell>
                  <TableCell className="max-w-[200px] text-sm text-muted-foreground truncate" title={a.reason}>{a.reason}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{a.performedByName || a.performedByUserId}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(a.performedAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SlaPerformance() {
  // Live tracker
  const { data: slaOrders = [], isLoading, refetch, isFetching } = trpc.sla.getStatus.useQuery(undefined, { refetchInterval: 5 * 60 * 1000 });
  const { data: facilityThresholds = [] } = trpc.sla.listFacilityThresholds.useQuery();
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Snapshot
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SnapSortKey>("bizDaysLate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [watchSortKey, setWatchSortKey] = useState<SnapSortKey>("slaDate");
  const [watchSortDir, setWatchSortDir] = useState<"asc" | "desc">("asc");
  const [trendClientId, setTrendClientId] = useState<number>(0);
  const [ruleSearch, setRuleSearch] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const { data: dates = [], refetch: refetchDates } = trpc.slaPerformance.listDates.useQuery();
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = trpc.slaPerformance.getSummary.useQuery({ date: selectedDate }, { enabled: !!selectedDate });
  const clientIdNum = clientFilter !== "all" ? Number(clientFilter) : undefined;
  const { data: breaches = [], isLoading: breachLoading, refetch: refetchBreaches } = trpc.slaPerformance.listBreaches.useQuery({ date: selectedDate, clientId: clientIdNum }, { enabled: !!selectedDate });
  const { data: watchItems = [], isLoading: watchLoading, refetch: refetchWatch } = trpc.slaPerformance.listWatch.useQuery({ date: selectedDate, clientId: clientIdNum }, { enabled: !!selectedDate });
  const { data: clientRules = [] } = trpc.slaPerformance.getClientRules.useQuery();
  const { refetch: refetchExport } = trpc.slaPerformance.exportCsv.useQuery({ date: selectedDate, clientId: clientIdNum }, { enabled: false });

  const runSnapshotMut = trpc.slaPerformance.runSnapshot.useMutation({
    onSuccess: (data) => {
      toast.success(`Snapshot complete — ${data.classified} orders classified, ${data.written} rows written`);
      setSelectedDate(data.snapshotDate);
      refetchDates(); refetchSummary(); refetchBreaches(); refetchWatch();
    },
    onError: (err) => toast.error(`Snapshot failed: ${err.message}`),
    onSettled: () => setIsRunning(false),
  });
  const handleRunSnapshot = useCallback(() => { setIsRunning(true); runSnapshotMut.mutate({ date: todayStr() }); }, [runSnapshotMut]);
  const handleExportCsv = useCallback(async () => {
    const result = await refetchExport();
    if (result.data) { downloadCsv(result.data.csv, result.data.filename); toast.success(`Exported ${result.data.totalRows} rows`); }
  }, [refetchExport]);
  const handleSort = useCallback((k: SnapSortKey) => { setSortDir((prev) => (sortKey === k ? (prev === "asc" ? "desc" : "asc") : "desc")); setSortKey(k); }, [sortKey]);
  const handleWatchSort = useCallback((k: SnapSortKey) => { setWatchSortDir((prev) => (watchSortKey === k ? (prev === "asc" ? "desc" : "asc") : "asc")); setWatchSortKey(k); }, [watchSortKey]);

  // Facility groups
  const facilityGroups = useMemo(() => {
    const map = new Map<number, { facilityId: number; facilityName: string; orders: SlaOrder[] }>();
    for (const order of slaOrders as SlaOrder[]) {
      const key = order.facilityId;
      if (!map.has(key)) map.set(key, { facilityId: key, facilityName: order.facilityName ?? `Facility ${key}`, orders: [] });
      map.get(key)!.orders.push(order);
    }
    return Array.from(map.values()).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  }, [slaOrders]);
  const selectedGroup = selectedFacilityId !== null ? facilityGroups.find((g) => g.facilityId === selectedFacilityId) ?? null : null;

  // Live KPIs (exclude removed)
  const activeOrders = (slaOrders as SlaOrder[]).filter((o) => o.slaActionStatus !== "removed");
  const totalInSla = activeOrders.filter((o) => o.slaStatus === "in_sla" || o.slaActionStatus === "waived").length;
  const totalOutOfSla = activeOrders.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length;
  const totalWaived = (slaOrders as SlaOrder[]).filter((o) => o.slaActionStatus === "waived").length;
  const liveCompliancePct = activeOrders.length > 0 ? Math.round((totalInSla / activeOrders.length) * 100) : 100;

  // B2B / D2C company-wide OOS totals
  const totalB2bActive = activeOrders.filter((o) => o.orderChannel === "b2b" || o.orderChannel === "both");
  const totalD2cActive = activeOrders.filter((o) => o.orderChannel === "d2c" || o.orderChannel === "both");
  const totalB2bOos = totalB2bActive.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length;
  const totalD2cOos = totalD2cActive.filter((o) => o.slaStatus === "out_of_sla" && o.slaActionStatus === "active").length;
  const totalB2bInSla = totalB2bActive.filter((o) => o.slaStatus === "in_sla" || o.slaActionStatus === "waived").length;
  const totalD2cInSla = totalD2cActive.filter((o) => o.slaStatus === "in_sla" || o.slaActionStatus === "waived").length;
  const b2bCompliancePct = totalB2bActive.length > 0 ? Math.round((totalB2bInSla / totalB2bActive.length) * 100) : 100;
  const d2cCompliancePct = totalD2cActive.length > 0 ? Math.round((totalD2cInSla / totalD2cActive.length) * 100) : 100;

  // Snapshot compliance
  const compliancePct = summary && summary.total > 0 ? Math.round((summary.inSla / summary.total) * 100) : 0;

  const filteredBreaches = useMemo(() => {
    let rows = breaches as SnapshotRow[];
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); rows = rows.filter((r) => r.clientName.toLowerCase().includes(q) || (r.poNum ?? "").toLowerCase().includes(q) || (r.refNum ?? "").toLowerCase().includes(q) || (r.facility ?? "").toLowerCase().includes(q)); }
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "bizDaysLate") cmp = (a.bizDaysLate ?? 0) - (b.bizDaysLate ?? 0);
      else if (sortKey === "clientName") cmp = a.clientName.localeCompare(b.clientName);
      else if (sortKey === "slaDate") cmp = (a.slaDate ?? "").localeCompare(b.slaDate ?? "");
      else if (sortKey === "creation") cmp = (a.creation ?? "").localeCompare(b.creation ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [breaches, searchQuery, sortKey, sortDir]);

  const filteredWatch = useMemo(() => {
    let rows = watchItems as SnapshotRow[];
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); rows = rows.filter((r) => r.clientName.toLowerCase().includes(q) || (r.poNum ?? "").toLowerCase().includes(q) || (r.refNum ?? "").toLowerCase().includes(q)); }
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (watchSortKey === "bizDaysLate") cmp = (a.bizDaysLate ?? 0) - (b.bizDaysLate ?? 0);
      else if (watchSortKey === "clientName") cmp = a.clientName.localeCompare(b.clientName);
      else if (watchSortKey === "slaDate") cmp = (a.slaDate ?? "").localeCompare(b.slaDate ?? "");
      else if (watchSortKey === "creation") cmp = (a.creation ?? "").localeCompare(b.creation ?? "");
      return watchSortDir === "asc" ? cmp : -cmp;
    });
  }, [watchItems, searchQuery, watchSortKey, watchSortDir]);

  const filteredRules = useMemo(() => {
    if (!ruleSearch.trim()) return clientRules;
    const q = ruleSearch.toLowerCase();
    return clientRules.filter((r) => r.clientName.toLowerCase().includes(q));
  }, [clientRules, ruleSearch]);

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {selectedGroup && (
              <button onClick={() => setSelectedFacilityId(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />All Warehouses
              </button>
            )}
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><Timer className="h-5 w-5 text-blue-500" /></div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{selectedGroup ? selectedGroup.facilityName : "SLA Performance"}</h1>
              <p className="text-sm text-muted-foreground">{selectedGroup ? `SLA Performance › ${selectedGroup.facilityName}` : "Live SLA tracking, compliance snapshots, and order-level actions."}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-2 flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard" className="gap-2"><Timer className="h-3.5 w-3.5" />Live Dashboard</TabsTrigger>
            <TabsTrigger value="snapshots" className="gap-2"><BarChart3 className="h-3.5 w-3.5" />Compliance Snapshots</TabsTrigger>
            <TabsTrigger value="requirements" className="gap-2"><Clock className="h-3.5 w-3.5" />SLA Requirements</TabsTrigger>
            <TabsTrigger value="audit" className="gap-2"><History className="h-3.5 w-3.5" />Audit Trail</TabsTrigger>
          </TabsList>

          {/* ── Live Dashboard ── */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            {/* Company-wide summary removed — only per-warehouse SLA cards shown */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><RefreshCw className="h-5 w-5 animate-spin" /><span>Loading SLA data…</span></div>
            ) : facilityGroups.length === 0 ? (
              <Card><CardContent className="py-16 text-center"><Timer className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-30" /><p className="text-muted-foreground">No tracked orders found.</p><p className="text-xs text-muted-foreground mt-1">Orders sync from Extensiv every hour.</p></CardContent></Card>
            ) : selectedGroup ? (
              <WarehouseSlaCard key={selectedGroup.facilityId} facilityId={selectedGroup.facilityId} facilityName={selectedGroup.facilityName} orders={selectedGroup.orders} drillDown greenThreshold={facilityThresholds.find((t) => t.facilityId === selectedGroup.facilityId)?.greenThreshold ?? 98} yellowThreshold={facilityThresholds.find((t) => t.facilityId === selectedGroup.facilityId)?.yellowThreshold ?? 95} />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {facilityGroups.map((group) => (
                  <WarehouseSlaCard key={group.facilityId} facilityId={group.facilityId} facilityName={group.facilityName} orders={group.orders} onDrillDown={() => setSelectedFacilityId(group.facilityId)} greenThreshold={facilityThresholds.find((t) => t.facilityId === group.facilityId)?.greenThreshold ?? 98} yellowThreshold={facilityThresholds.find((t) => t.facilityId === group.facilityId)?.yellowThreshold ?? 95} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Compliance Snapshots ── */}
          <TabsContent value="snapshots" className="space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Compliance Snapshots</h2>
              <div className="flex flex-wrap items-center gap-2">
                {dates.length > 0 ? (
                  <Select value={selectedDate} onValueChange={setSelectedDate}>
                    <SelectTrigger className="w-44"><Calendar className="w-4 h-4 mr-2 text-muted-foreground" /><SelectValue placeholder="Select date" /></SelectTrigger>
                    <SelectContent>{dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <span className="text-sm text-muted-foreground flex items-center gap-2"><Calendar className="w-4 h-4" />No snapshots yet</span>}
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-44"><Users className="w-4 h-4 mr-2 text-muted-foreground" /><SelectValue placeholder="All clients" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Clients</SelectItem>{clientRules.map((c) => <SelectItem key={c.clientId} value={String(c.clientId)}>{c.clientName}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1"><Download className="w-4 h-4" />Export CSV</Button>
                <Button size="sm" onClick={handleRunSnapshot} disabled={isRunning} className="gap-1"><RefreshCw className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />{isRunning ? "Running…" : "Run Snapshot"}</Button>
              </div>
            </div>

            {summaryLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <Card key={i} className="border animate-pulse"><CardContent className="p-4 h-20" /></Card>)}</div>
            ) : summary ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KpiTile label="Total Orders" value={summary.total} icon={<BarChart3 className="w-5 h-5" />} sub={`Snapshot: ${summary.snapshotDate}`} />
                <KpiTile label="In SLA" value={summary.inSla} icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} colorClass="text-green-600 dark:text-green-400" bgClass="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" />
                <KpiTile label="Breaches" value={summary.outOfSla} icon={<XCircle className="w-5 h-5 text-red-500" />} colorClass={summary.outOfSla > 0 ? "text-red-600 dark:text-red-400" : ""} bgClass={summary.outOfSla > 0 ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" : ""} />
                <KpiTile label="Watch Items" value={summary.alwaysFlag} icon={<AlertCircle className="w-5 h-5 text-yellow-500" />} colorClass={summary.alwaysFlag > 0 ? "text-yellow-600 dark:text-yellow-400" : ""} bgClass={summary.alwaysFlag > 0 ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800" : ""} />
                <KpiTile label="Compliance" value={`${compliancePct}%`} icon={compliancePct >= 98 ? <TrendingUp className="w-5 h-5 text-green-500" /> : compliancePct >= 95 ? <Minus className="w-5 h-5 text-yellow-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />} colorClass={complianceColor(compliancePct)} bgClass={complianceBg(compliancePct)} />
              </div>
            ) : (
              <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground"><BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No snapshot data for {selectedDate}</p><p className="text-sm mt-1">Click <strong>Run Snapshot</strong> to classify all tracked orders now.</p></CardContent></Card>
            )}

            <Tabs defaultValue="breaches">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <TabsList>
                  <TabsTrigger value="breaches" className="gap-1.5"><XCircle className="w-3.5 h-3.5" />Breaches{breaches.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{breaches.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="watch" className="gap-1.5"><Eye className="w-3.5 h-3.5" />Watch List{watchItems.length > 0 && <Badge className="ml-1 text-[10px] px-1.5 py-0 bg-yellow-500">{watchItems.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="trend" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Trend</TabsTrigger>
                  <TabsTrigger value="rules" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" />Client Rules</TabsTrigger>
                </TabsList>
                <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
              </div>
              <TabsContent value="breaches">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" />Out-of-SLA Orders<span className="text-muted-foreground font-normal">— {filteredBreaches.length} records</span></CardTitle></CardHeader>
                  <CardContent className="p-0">{breachLoading ? <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Loading…</div> : <SnapshotTable rows={filteredBreaches} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} showBizDays />}</CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="watch">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-yellow-500" />Watch List<span className="text-muted-foreground font-normal">— {filteredWatch.length} records</span></CardTitle></CardHeader>
                  <CardContent className="p-0">{watchLoading ? <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Loading…</div> : <SnapshotTable rows={filteredWatch} sortKey={watchSortKey} sortDir={watchSortDir} onSort={handleWatchSort} showBizDays={false} />}</CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="trend">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Compliance Trend — 30 Snapshots</CardTitle>
                      <Select value={String(trendClientId)} onValueChange={(v) => setTrendClientId(Number(v))}>
                        <SelectTrigger className="w-52"><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>{clientRules.map((c) => <SelectItem key={c.clientId} value={String(c.clientId)}>{c.clientName}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {trendClientId === 0 ? <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Select a client above to view their compliance trend</div> : <TrendChart clientId={trendClientId} />}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-green-500 inline-block" />≥98% target</span>
                      <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-yellow-500 inline-block" />95% floor</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="rules">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />SLA-Tracked Clients<span className="text-muted-foreground font-normal">— {clientRules.length} clients</span></CardTitle>
                      <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Filter clients…" value={ruleSearch} onChange={(e) => setRuleSearch(e.target.value)} className="pl-9" /></div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Client Name</TableHead><TableHead className="text-right">Client ID</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {filteredRules.map((r) => <TableRow key={r.clientId}><TableCell className="font-medium">{r.clientName}</TableCell><TableCell className="text-right font-mono text-xs text-muted-foreground">{r.clientId}</TableCell></TableRow>)}
                          {filteredRules.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No clients match "{ruleSearch}"</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="text-xs text-muted-foreground border-t pt-4 flex flex-wrap gap-x-6 gap-y-1">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Snapshots run automatically every night at 00:00 UTC</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />Green ≥ 98% · Yellow ≥ 95% · Red &lt; 95%</span>
              <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-yellow-500" />Watch = alwaysFlag orders requiring manual review</span>
            </div>
          </TabsContent>

          {/* ── SLA Requirements ── */}
          <TabsContent value="requirements" className="mt-4"><SlaRequirementsTab /></TabsContent>

          {/* ── Audit Trail ── */}
          <TabsContent value="audit" className="mt-4"><AuditTrailTab /></TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
