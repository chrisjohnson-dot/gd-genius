/**
 * SLA Performance Page
 *
 * Provides a full compliance dashboard driven by the slaPerformance tRPC router:
 *  - Compliance KPI tiles (total, in-SLA, breaches, watch items, compliance %)
 *  - Breach table (orders out of SLA, sortable by biz-days late)
 *  - Watch list (alwaysFlag orders not yet breached)
 *  - 30-day compliance trend sparkline (per-client history)
 *  - Client rule reference (all 50+ SLA-tracked clients)
 *  - Run snapshot on demand, date picker, CSV export
 */
import React, { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Minus,
  BookOpen,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Calendar,
  Users,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function complianceColor(pct: number): string {
  if (pct >= 98) return "text-green-600 dark:text-green-400";
  if (pct >= 95) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function complianceBg(pct: number): string {
  if (pct >= 98) return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
  if (pct >= 95) return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800";
  return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
  colorClass?: string;
  bgClass?: string;
}

function KpiTile({ label, value, icon, sub, colorClass = "", bgClass = "" }: KpiTileProps) {
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

// ─── Breach / Watch row ───────────────────────────────────────────────────────

type SlaRow = {
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

type SortKey = "clientName" | "slaDate" | "bizDaysLate" | "creation";

function SlaTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  showBizDays,
}: {
  rows: SlaRow[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  showBizDays: boolean;
}) {
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <Minus className="w-3 h-3 opacity-30 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer select-none whitespace-nowrap"
              onClick={() => onSort("clientName")}
            >
              Client <SortIcon k="clientName" />
            </TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>PO #</TableHead>
            <TableHead>Ref #</TableHead>
            <TableHead
              className="cursor-pointer select-none whitespace-nowrap"
              onClick={() => onSort("creation")}
            >
              Created <SortIcon k="creation" />
            </TableHead>
            <TableHead
              className="cursor-pointer select-none whitespace-nowrap"
              onClick={() => onSort("slaDate")}
            >
              SLA Date <SortIcon k="slaDate" />
            </TableHead>
            {showBizDays && (
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => onSort("bizDaysLate")}
              >
                Biz Days Late <SortIcon k="bizDaysLate" />
              </TableHead>
            )}
            <TableHead>Facility</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showBizDays ? 10 : 9} className="text-center text-muted-foreground py-8">
                No records found
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id} className={r.outOfSla ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
              <TableCell className="font-medium whitespace-nowrap">{r.clientName}</TableCell>
              <TableCell className="font-mono text-xs">{r.orderId}</TableCell>
              <TableCell className="text-xs">{r.poNum || "—"}</TableCell>
              <TableCell className="text-xs">{r.refNum || "—"}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.creation)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                <span className={r.outOfSla ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                  {fmtDate(r.slaDate)}
                </span>
              </TableCell>
              {showBizDays && (
                <TableCell className="text-center">
                  {r.bizDaysLate != null ? (
                    <Badge variant="destructive" className="text-xs">
                      +{r.bizDaysLate}d
                    </Badge>
                  ) : "—"}
                </TableCell>
              )}
              <TableCell className="text-xs">{r.facility || "—"}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate" title={r.rule}>
                {r.rule}
              </TableCell>
              <TableCell>
                {r.outOfSla ? (
                  <Badge variant="destructive" className="text-xs">Breach</Badge>
                ) : r.alwaysFlag ? (
                  <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700 dark:text-yellow-400">Watch</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs border-green-400 text-green-700 dark:text-green-400">In SLA</Badge>
                )}
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
  const { data: history = [], isLoading } = trpc.slaPerformance.getClientHistory.useQuery(
    { clientId },
    { enabled: clientId > 0 }
  );

  const chartData = useMemo(
    () =>
      [...history]
        .reverse()
        .map((h) => ({
          date: h.snapshotDate.slice(5), // MM-DD
          pct: h.compliancePct,
          total: h.total,
          oos: h.outOfSla,
        })),
    [history]
  );

  if (isLoading) return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  if (chartData.length === 0) return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No history available for this client</div>;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={[80, 100]} tick={{ fontSize: 11 }} unit="%" />
        <RechartTooltip
          formatter={(v: number) => [`${v}%`, "Compliance"]}
          labelFormatter={(l) => `Date: ${l}`}
        />
        <ReferenceLine y={98} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "98%", fontSize: 10, fill: "#22c55e" }} />
        <ReferenceLine y={95} stroke="#eab308" strokeDasharray="4 2" label={{ value: "95%", fontSize: 10, fill: "#eab308" }} />
        <Line
          type="monotone"
          dataKey="pct"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SlaPerformance() {
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("bizDaysLate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [watchSortKey, setWatchSortKey] = useState<SortKey>("slaDate");
  const [watchSortDir, setWatchSortDir] = useState<"asc" | "desc">("asc");
  const [trendClientId, setTrendClientId] = useState<number>(0);
  const [ruleSearch, setRuleSearch] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: dates = [], refetch: refetchDates } = trpc.slaPerformance.listDates.useQuery();

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } =
    trpc.slaPerformance.getSummary.useQuery(
      { date: selectedDate },
      { enabled: !!selectedDate }
    );

  const clientIdNum = clientFilter !== "all" ? Number(clientFilter) : undefined;

  const { data: breaches = [], isLoading: breachLoading, refetch: refetchBreaches } =
    trpc.slaPerformance.listBreaches.useQuery(
      { date: selectedDate, clientId: clientIdNum },
      { enabled: !!selectedDate }
    );

  const { data: watchItems = [], isLoading: watchLoading, refetch: refetchWatch } =
    trpc.slaPerformance.listWatch.useQuery(
      { date: selectedDate, clientId: clientIdNum },
      { enabled: !!selectedDate }
    );

  const { data: clientRules = [] } = trpc.slaPerformance.getClientRules.useQuery();

  const { data: exportData, refetch: refetchExport } =
    trpc.slaPerformance.exportCsv.useQuery(
      { date: selectedDate, clientId: clientIdNum },
      { enabled: false }
    );

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const runSnapshotMut = trpc.slaPerformance.runSnapshot.useMutation({
    onSuccess: (data) => {
      toast.success(`Snapshot complete — ${data.classified} orders classified, ${data.written} rows written`);
      setSelectedDate(data.snapshotDate);
      refetchDates();
      refetchSummary();
      refetchBreaches();
      refetchWatch();
    },
    onError: (err) => {
      toast.error(`Snapshot failed: ${err.message}`);
    },
    onSettled: () => setIsRunning(false),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleRunSnapshot = useCallback(() => {
    setIsRunning(true);
    runSnapshotMut.mutate({ date: todayStr() });
  }, [runSnapshotMut]);

  const handleExportCsv = useCallback(async () => {
    const result = await refetchExport();
    if (result.data) {
      downloadCsv(result.data.csv, result.data.filename);
      toast.success(`Exported ${result.data.totalRows} rows`);
    }
  }, [refetchExport]);

  const handleSort = useCallback((k: SortKey) => {
    setSortDir((prev) => (sortKey === k ? (prev === "asc" ? "desc" : "asc") : "desc"));
    setSortKey(k);
  }, [sortKey]);

  const handleWatchSort = useCallback((k: SortKey) => {
    setWatchSortDir((prev) => (watchSortKey === k ? (prev === "asc" ? "desc" : "asc") : "asc"));
    setWatchSortKey(k);
  }, [watchSortKey]);

  // ── Sorted / filtered data ────────────────────────────────────────────────────

  const filteredBreaches = useMemo(() => {
    let rows = [...breaches] as unknown as SlaRow[];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.clientName.toLowerCase().includes(q) ||
          String(r.orderId).toLowerCase().includes(q) ||
          (r.poNum ?? "").toLowerCase().includes(q) ||
          (r.refNum ?? "").toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "bizDaysLate") { av = a.bizDaysLate ?? 0; bv = b.bizDaysLate ?? 0; }
      else if (sortKey === "slaDate") { av = a.slaDate ?? ""; bv = b.slaDate ?? ""; }
      else if (sortKey === "creation") { av = a.creation ?? ""; bv = b.creation ?? ""; }
      else { av = a.clientName; bv = b.clientName; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [breaches, searchQuery, sortKey, sortDir]);

  const filteredWatch = useMemo(() => {
    let rows = [...watchItems] as unknown as SlaRow[];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.clientName.toLowerCase().includes(q) ||
          String(r.orderId).toLowerCase().includes(q) ||
          (r.poNum ?? "").toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (watchSortKey === "slaDate") { av = a.slaDate ?? ""; bv = b.slaDate ?? ""; }
      else if (watchSortKey === "creation") { av = a.creation ?? ""; bv = b.creation ?? ""; }
      else { av = a.clientName; bv = b.clientName; }
      if (av < bv) return watchSortDir === "asc" ? -1 : 1;
      if (av > bv) return watchSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [watchItems, searchQuery, watchSortKey, watchSortDir]);

  const filteredRules = useMemo(() => {
    if (!ruleSearch) return clientRules;
    const q = ruleSearch.toLowerCase();
    return clientRules.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        String(r.clientId).includes(q)
    );
  }, [clientRules, ruleSearch]);

  const compliancePct = summary?.compliancePct ?? 100;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              SLA Performance
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compliance dashboard powered by {clientRules.length} client-specific SLA rules
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Date selector */}
            {dates.length > 0 ? (
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger className="w-44">
                  <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Select date" />
                </SelectTrigger>
                <SelectContent>
                  {dates.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>No snapshots yet</span>
              </div>
            )}
            {/* Client filter */}
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-44">
                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clientRules.map((c) => (
                  <SelectItem key={c.clientId} value={String(c.clientId)}>
                    {c.clientName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button
              size="sm"
              onClick={handleRunSnapshot}
              disabled={isRunning}
              className="gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "Running…" : "Run Snapshot"}
            </Button>
          </div>
        </div>

        {/* ── KPI Tiles ── */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="border animate-pulse">
                <CardContent className="p-4 h-20" />
              </Card>
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiTile
              label="Total Orders"
              value={summary.total}
              icon={<BarChart3 className="w-5 h-5" />}
              sub={`Snapshot: ${summary.snapshotDate}`}
            />
            <KpiTile
              label="In SLA"
              value={summary.inSla}
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
              colorClass="text-green-600 dark:text-green-400"
              bgClass="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
            />
            <KpiTile
              label="Breaches"
              value={summary.outOfSla}
              icon={<XCircle className="w-5 h-5 text-red-500" />}
              colorClass={summary.outOfSla > 0 ? "text-red-600 dark:text-red-400" : ""}
              bgClass={summary.outOfSla > 0 ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" : ""}
            />
            <KpiTile
              label="Watch Items"
              value={summary.alwaysFlag}
              icon={<AlertCircle className="w-5 h-5 text-yellow-500" />}
              colorClass={summary.alwaysFlag > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}
              bgClass={summary.alwaysFlag > 0 ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800" : ""}
            />
            <KpiTile
              label="Compliance"
              value={`${compliancePct}%`}
              icon={
                compliancePct >= 98
                  ? <TrendingUp className="w-5 h-5 text-green-500" />
                  : compliancePct >= 95
                  ? <Minus className="w-5 h-5 text-yellow-500" />
                  : <TrendingDown className="w-5 h-5 text-red-500" />
              }
              colorClass={complianceColor(compliancePct)}
              bgClass={complianceBg(compliancePct)}
            />
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No snapshot data for {selectedDate}</p>
              <p className="text-sm mt-1">Click <strong>Run Snapshot</strong> to classify all tracked orders now.</p>
            </CardContent>
          </Card>
        )}

        {/* ── Tabs ── */}
        <Tabs defaultValue="breaches">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <TabsList>
              <TabsTrigger value="breaches" className="gap-1.5">
                <XCircle className="w-4 h-4" />
                Breaches
                {breaches.length > 0 && (
                  <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">{breaches.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="watch" className="gap-1.5">
                <Eye className="w-4 h-4" />
                Watch List
                {watchItems.length > 0 && (
                  <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0 border-yellow-400 text-yellow-700 dark:text-yellow-400">{watchItems.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="trend" className="gap-1.5">
                <TrendingUp className="w-4 h-4" />
                Trend
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-1.5">
                <BookOpen className="w-4 h-4" />
                Client Rules
              </TabsTrigger>
            </TabsList>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search orders, clients, PO#…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Breaches Tab */}
          <TabsContent value="breaches">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  Out-of-SLA Orders
                  {!breachLoading && (
                    <span className="text-sm font-normal text-muted-foreground">
                      — {filteredBreaches.length} order{filteredBreaches.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {breachLoading ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">Loading breaches…</div>
                ) : (
                  <SlaTable
                    rows={filteredBreaches}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    showBizDays={true}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Watch Tab */}
          <TabsContent value="watch">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Watch List
                  <span className="text-sm font-normal text-muted-foreground">
                    — orders flagged for manual review (not yet breached)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {watchLoading ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">Loading watch list…</div>
                ) : (
                  <SlaTable
                    rows={filteredWatch}
                    sortKey={watchSortKey}
                    sortDir={watchSortDir}
                    onSort={handleWatchSort}
                    showBizDays={false}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trend Tab */}
          <TabsContent value="trend">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Compliance Trend — 30 Snapshots
                  </CardTitle>
                  <Select
                    value={String(trendClientId)}
                    onValueChange={(v) => setTrendClientId(Number(v))}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientRules.map((c) => (
                        <SelectItem key={c.clientId} value={String(c.clientId)}>
                          {c.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {trendClientId === 0 ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    Select a client above to view their compliance trend
                  </div>
                ) : (
                  <TrendChart clientId={trendClientId} />
                )}
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-6 h-0.5 bg-green-500 inline-block" /> ≥98% target
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-6 h-0.5 bg-yellow-500 inline-block" /> 95% floor
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Client Rules Tab */}
          <TabsContent value="rules">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    SLA-Tracked Clients
                    <span className="text-sm font-normal text-muted-foreground">
                      — {clientRules.length} clients with custom rules
                    </span>
                  </CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Filter clients…"
                      value={ruleSearch}
                      onChange={(e) => setRuleSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client Name</TableHead>
                        <TableHead className="text-right">Client ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRules.map((r) => (
                        <TableRow key={r.clientId}>
                          <TableCell className="font-medium">{r.clientName}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.clientId}</TableCell>
                        </TableRow>
                      ))}
                      {filteredRules.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                            No clients match "{ruleSearch}"
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Info footer ── */}
        <div className="text-xs text-muted-foreground border-t pt-4 flex flex-wrap gap-x-6 gap-y-1">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Snapshots run automatically every night at 00:00 UTC
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            Green ≥ 98% · Yellow ≥ 95% · Red &lt; 95%
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            Watch = alwaysFlag orders requiring manual review
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
