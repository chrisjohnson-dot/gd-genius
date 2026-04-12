import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Package,
  Layers,
  RefreshCw,
  CheckCircle2,
  Zap,
  ArrowRight,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Window = "1h" | "3h" | "24h";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatHours(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Today ${formatTime(ts)}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${formatTime(ts)}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + formatTime(ts);
}

const PACE_CONFIG = {
  on_track: { label: "On Track", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  at_risk:  { label: "At Risk",  color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",   icon: AlertTriangle },
  critical: { label: "Critical", color: "text-red-600",     bg: "bg-red-50 border-red-200",       icon: AlertTriangle },
  no_data:  { label: "No Data",  color: "text-gray-500",    bg: "bg-gray-50 border-gray-200",     icon: Activity },
};

const STAGE_LABELS: Record<string, string> = {
  unallocated: "Unallocated",
  allocated:   "Allocated",
  picking:     "Picking",
  qc:          "QC",
  qc_complete: "QC Done",
  ship_ready:  "Ship Ready",
};

const STAGE_COLORS: Record<string, string> = {
  unallocated: "#94a3b8",
  allocated:   "#3b82f6",
  picking:     "#f59e0b",
  qc:          "#8b5cf6",
  qc_complete: "#10b981",
  ship_ready:  "#22c55e",
};

const WINDOW_LABELS: Record<Window, string> = {
  "1h":  "Last 1 Hour",
  "3h":  "Last 3 Hours",
  "24h": "Last 24 Hours",
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function BurndownTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs">
      <div className="font-medium text-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkloadPage() {
  const [window, setWindow] = useState<Window>("1h");
  const [warehouseId] = useState("all");

  // Live rate + projection
  const {
    data: rate,
    isLoading: rateLoading,
    refetch: refetchRate,
  } = trpc.workload.getThroughputRate.useQuery({ warehouseId, window }, { refetchInterval: 60_000 });

  const {
    data: projection,
    isLoading: projLoading,
    refetch: refetchProjection,
  } = trpc.workload.getBacklogProjection.useQuery({ warehouseId, window }, { refetchInterval: 60_000 });

  // Burn-down chart (last 24h always for context)
  const { data: burndown, isLoading: burndownLoading } =
    trpc.workload.getBurndownSeries.useQuery({ warehouseId, hours: 24 }, { refetchInterval: 120_000 });

  // Pipeline snapshot
  const { data: pipeline } = trpc.workload.getPipelineSnapshot.useQuery({ warehouseId }, { refetchInterval: 60_000 });

  const handleRefresh = useCallback(() => {
    refetchRate();
    refetchProjection();
    toast.success("Workload data refreshed.");
  }, [refetchRate, refetchProjection]);

  const isLoading = rateLoading || projLoading;
  const proj = projection?.projection;
  const paceConf = PACE_CONFIG[proj?.paceStatus ?? "no_data"];
  const PaceIcon = paceConf.icon;

  // Pipeline chart data
  const pipelineData = (pipeline ?? []).map((p: any) => ({
    stage: STAGE_LABELS[p.stage] ?? p.stage,
    stageKey: p.stage,
    count: p.count,
  }));

  // Hourly rate sparkline from rate.trendBuckets
  const rateTrend = (rate?.trendBuckets ?? []).map((b: any) => ({
    label: formatTime(b.bucket),
    itemsPerHour: b.itemsPerHour,
    items: b.items,
  }));

  // Burn-down series
  const burnSeries = (burndown?.series ?? []).map((s: any) => ({
    label: s.label,
    completed: s.itemsCompleted,
    cumulative: s.cumulative,
    sessions: s.sessions,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Workload Planning
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live production rate vs. open order backlog
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Window selector */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
            {(["1h", "3h", "24h"] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  window === w
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Top KPI Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Production Rate */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-muted-foreground">Production Rate</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {rateLoading ? "—" : (rate?.itemsPerHour ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">items / hr · {WINDOW_LABELS[window]}</div>
            {(rate?.casesPerHour ?? 0) > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {rate!.casesPerHour.toLocaleString()} cases / hr
              </div>
            )}
          </CardContent>
        </Card>

        {/* Backlog */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Layers className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">Active Backlog</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {projLoading ? "—" : (projection?.backlog.orders ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              orders · {(projection?.backlog.pieces ?? 0).toLocaleString()} pieces
            </div>
            {(projection?.backlog.unallocatedOrders ?? 0) > 0 && (
              <div className="text-xs text-amber-600 mt-0.5">
                +{projection!.backlog.unallocatedOrders.toLocaleString()} unallocated
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projected Completion */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs text-muted-foreground">Est. Completion</span>
            </div>
            <div className="text-lg font-bold">
              {projLoading ? "—" : formatDate(proj?.projectedCompletionAt ?? null)}
            </div>
            <div className="text-xs text-muted-foreground">
              {proj?.hoursToComplete != null
                ? `${formatHours(proj.hoursToComplete)} to clear backlog`
                : "No rate data yet"}
            </div>
          </CardContent>
        </Card>

        {/* Pace Status */}
        <Card className={`border ${paceConf.bg}`}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <PaceIcon className={`h-3.5 w-3.5 ${paceConf.color}`} />
              <span className="text-xs text-muted-foreground">Pace Status</span>
            </div>
            <div className={`text-xl font-bold ${paceConf.color}`}>{paceConf.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {proj?.paceStatus === "on_track" && "Backlog clears within 4h"}
              {proj?.paceStatus === "at_risk" && "4–8h to clear backlog"}
              {proj?.paceStatus === "critical" && "8h+ to clear backlog"}
              {proj?.paceStatus === "no_data" && "Complete a pull session to measure"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Rate vs Backlog comparison ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hourly rate trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Items/hr Trend
              <span className="text-xs font-normal text-muted-foreground">({WINDOW_LABELS[window]})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rateTrend.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No completed sessions in this window</p>
                <p className="text-xs mt-1">Complete a pull session to see rate data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={rateTrend} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<BurndownTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="itemsPerHour"
                    name="Items/hr"
                    stroke="#3b82f6"
                    fill="url(#rateGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pipeline snapshot */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Pipeline Snapshot
              <span className="text-xs font-normal text-muted-foreground">(current)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <Package className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No orders in pipeline</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={pipelineData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<BurndownTooltip />} />
                  <Bar dataKey="count" name="Orders" radius={[3, 3, 0, 0]}>
                    {pipelineData.map((entry: any) => (
                      <Cell key={entry.stageKey} fill={STAGE_COLORS[entry.stageKey] ?? "#94a3b8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Burn-down Chart ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              Production Burn-down
              <span className="text-xs font-normal text-muted-foreground">(last 24h)</span>
            </CardTitle>
            {(burndown?.totalCompleted ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs">
                {burndown!.totalCompleted.toLocaleString()} items completed
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {burndownLoading ? (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : burnSeries.every((s) => s.completed === 0) ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <TrendingDown className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No completed sessions in the last 24 hours</p>
              <p className="text-xs mt-1">Items completed will appear here as pull sessions finish</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={burnSeries} margin={{ top: 4, right: 4, left: -10, bottom: 4 }}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip content={<BurndownTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative Items"
                  stroke="#10b981"
                  fill="url(#cumGrad)"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="completed"
                  name="Items / hr"
                  stroke="#3b82f6"
                  fill="url(#hrGrad)"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Backlog Breakdown + Projection Detail ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Backlog by stage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              Active Backlog Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(projection?.backlog.byStage ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground py-6 text-sm">
                No orders in allocated or picking stages
              </div>
            ) : (
              <div className="space-y-2">
                {(projection?.backlog.byStage ?? []).map((s: any) => {
                  const pct = projection!.backlog.pieces > 0
                    ? Math.round((s.pieces / projection!.backlog.pieces) * 100)
                    : 0;
                  return (
                    <div key={s.stage}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: STAGE_COLORS[s.stage] ?? "#94a3b8" }}
                          />
                          <span>{STAGE_LABELS[s.stage] ?? s.stage}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{s.orders.toLocaleString()} orders</span>
                          <span className="font-medium text-foreground">{s.pieces.toLocaleString()} pcs</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: STAGE_COLORS[s.stage] ?? "#94a3b8" }}
                        />
                      </div>
                    </div>
                  );
                })}
                {(projection?.backlog.unallocatedOrders ?? 0) > 0 && (
                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      Unallocated (not yet in pipeline)
                    </span>
                    <span>
                      {projection!.backlog.unallocatedOrders.toLocaleString()} orders ·{" "}
                      {projection!.backlog.unallocatedPieces.toLocaleString()} pcs
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projection detail */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Projection Detail
              <span className="text-xs font-normal text-muted-foreground">
                based on {WINDOW_LABELS[window].toLowerCase()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Measured rate</span>
                <span className="text-sm font-medium">
                  {(projection?.rate.itemsPerHour ?? 0).toLocaleString()} items/hr
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Based on</span>
                <span className="text-sm font-medium">
                  {(projection?.rate.sessionCount ?? 0)} sessions ·{" "}
                  {(projection?.rate.basedOnItems ?? 0).toLocaleString()} items ·{" "}
                  {(projection?.rate.basedOnDurationH ?? 0).toFixed(1)}h worked
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Backlog (pieces)</span>
                <span className="text-sm font-medium">
                  {(projection?.backlog.pieces ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Hours to clear</span>
                <span className="text-sm font-medium">
                  {formatHours(proj?.hoursToComplete ?? null)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Projected completion</span>
                <span className={`text-sm font-semibold ${paceConf.color}`}>
                  {formatDate(proj?.projectedCompletionAt ?? null)}
                </span>
              </div>

              {/* Pace status pill */}
              <div className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 ${paceConf.bg}`}>
                <PaceIcon className={`h-4 w-4 ${paceConf.color}`} />
                <span className={`text-sm font-medium ${paceConf.color}`}>{paceConf.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {proj?.paceStatus === "on_track" && "Backlog clears within 4h at current rate"}
                  {proj?.paceStatus === "at_risk" && "4–8h to clear — consider adding staff"}
                  {proj?.paceStatus === "critical" && "8h+ to clear — immediate action needed"}
                  {proj?.paceStatus === "no_data" && "Complete pull sessions to measure rate"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Per-warehouse rate breakdown ───────────────────────────────────── */}
      {(rate?.byWarehouse ?? []).length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Rate by Warehouse
              <span className="text-xs font-normal text-muted-foreground">({WINDOW_LABELS[window]})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {(rate?.byWarehouse ?? []).map((wh: any) => (
                <div key={wh.warehouseId} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-xs font-semibold text-foreground mb-1">{wh.warehouseId}</div>
                  <div className="text-xl font-bold tabular-nums">{wh.itemsPerHour.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">items/hr</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{wh.sessions} sessions</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
