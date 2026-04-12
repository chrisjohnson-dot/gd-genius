import { useState, useCallback, useEffect, useMemo } from "react";
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
  Legend,
  Cell,
  ReferenceLine,
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
  Activity,
  ArrowRight,
  ChevronLeft,
  Bell,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Window = "1h" | "3h" | "24h";
type PaceStatus = "green" | "amber" | "red" | "no_data";

interface WarehouseSummary {
  warehouseId: string;
  paceStatus: PaceStatus;
  currentRate: number;
  casesPerHour: number;
  requiredRate: number;
  ratio: number | null;
  backlog: { orders: number; pieces: number };
  unallocated: { orders: number; pieces: number };
  sessions: number;
  hoursToComplete: number | null;
  projectedCompletionAt: number | null;
  measuredAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatHours(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h === 0) return "Clear";
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

const WINDOW_LABELS: Record<Window, string> = {
  "1h": "Last 1 Hour",
  "3h": "Last 3 Hours",
  "24h": "Last 24 Hours",
};

// ─── Pace config ──────────────────────────────────────────────────────────────
const PACE: Record<PaceStatus, {
  label: string;
  bg: string;
  border: string;
  text: string;
  ring: string;
  dot: string;
  badgeBg: string;
  icon: React.ElementType;
}> = {
  green: {
    label: "On Track",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-700",
    ring: "ring-emerald-400",
    dot: "bg-emerald-500",
    badgeBg: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  amber: {
    label: "At Risk",
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-700",
    ring: "ring-amber-400",
    dot: "bg-amber-500",
    badgeBg: "bg-amber-100 text-amber-700",
    icon: AlertTriangle,
  },
  red: {
    label: "Critical",
    bg: "bg-red-50",
    border: "border-red-300",
    text: "text-red-700",
    ring: "ring-red-400",
    dot: "bg-red-500",
    badgeBg: "bg-red-100 text-red-700",
    icon: AlertTriangle,
  },
  no_data: {
    label: "No Data",
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-500",
    ring: "ring-gray-300",
    dot: "bg-gray-400",
    badgeBg: "bg-gray-100 text-gray-500",
    icon: Activity,
  },
};

const STAGE_COLORS: Record<string, string> = {
  unallocated: "#94a3b8",
  allocated: "#3b82f6",
  picking: "#f59e0b",
  qc: "#8b5cf6",
  qc_complete: "#10b981",
  ship_ready: "#22c55e",
};

const STAGE_LABELS: Record<string, string> = {
  unallocated: "Unallocated",
  allocated: "Allocated",
  picking: "Picking",
  qc: "QC",
  qc_complete: "QC Done",
  ship_ready: "Ship Ready",
};

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
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

// ─── Warehouse Card ───────────────────────────────────────────────────────────
function WarehouseCard({ summary, onClick }: { summary: WarehouseSummary; onClick: () => void }) {
  const p = PACE[summary.paceStatus];
  const Icon = p.icon;
  const ratio = summary.ratio;
  const pct = ratio != null ? Math.min(Math.round(ratio * 100), 200) : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 ${p.border} ${p.bg} p-4 transition-all hover:shadow-md hover:scale-[1.01] focus:outline-none focus:ring-2 ${p.ring} focus:ring-offset-2`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${p.dot}`} />
          <span className="font-semibold text-foreground text-base">{summary.warehouseId}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {summary.paceStatus === "red" && (
            <span title="Flagged to Requires Attention">
              <Bell className="h-4 w-4 text-red-500" />
            </span>
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.badgeBg}`}>
            {p.label}
          </span>
        </div>
      </div>

      {/* Rate vs Required */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Current Rate</div>
          <div className={`text-2xl font-bold tabular-nums ${p.text}`}>
            {summary.currentRate > 0 ? summary.currentRate.toLocaleString() : "—"}
          </div>
          <div className="text-xs text-muted-foreground">items / hr</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Required Rate</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {summary.requiredRate > 0 ? summary.requiredRate.toLocaleString() : "—"}
          </div>
          <div className="text-xs text-muted-foreground">items / hr</div>
        </div>
      </div>

      {/* Progress bar — current vs required */}
      {pct != null && summary.requiredRate > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Rate vs Required</span>
            <span className={`font-medium ${p.text}`}>{pct}%</span>
          </div>
          <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white/80">
            <div
              className={`h-full rounded-full transition-all ${
                summary.paceStatus === "green" ? "bg-emerald-500" :
                summary.paceStatus === "amber" ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Backlog + projection */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Backlog</div>
          <div className="font-medium">{summary.backlog.orders.toLocaleString()} orders</div>
          <div className="text-muted-foreground">{summary.backlog.pieces.toLocaleString()} pcs</div>
        </div>
        <div>
          <div className="text-muted-foreground">Est. Clear</div>
          <div className={`font-medium ${p.text}`}>{formatHours(summary.hoursToComplete)}</div>
          <div className="text-muted-foreground">{formatDate(summary.projectedCompletionAt)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Sessions</div>
          <div className="font-medium">{summary.sessions}</div>
          <div className="text-muted-foreground">in window</div>
        </div>
      </div>

      {summary.unallocated.orders > 0 && (
        <div className="mt-2 pt-2 border-t border-white/60 text-xs text-amber-600">
          +{summary.unallocated.orders.toLocaleString()} unallocated orders waiting
        </div>
      )}
    </button>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function WarehouseDetail({ warehouseId, window, shiftHours, onBack }: { warehouseId: string; window: Window; shiftHours: number; onBack: () => void }) {
  const { data: warehouseSummaries } = trpc.workload.getWarehouseSummaries.useQuery(
    { window, shiftHours },
    { refetchInterval: 60_000 }
  );
  const thisSummary = (warehouseSummaries as WarehouseSummary[] | undefined)?.find(
    (s) => s.warehouseId === warehouseId
  );
  const targetRate = thisSummary?.requiredRate ?? 0;

  const { data: rate } = trpc.workload.getThroughputRate.useQuery(
    { warehouseId, window },
    { refetchInterval: 60_000 }
  );
  const { data: projection } = trpc.workload.getBacklogProjection.useQuery(
    { warehouseId, window },
    { refetchInterval: 60_000 }
  );
  const { data: burndown } = trpc.workload.getBurndownSeries.useQuery(
    { warehouseId, hours: 24 },
    { refetchInterval: 120_000 }
  );
  const { data: pipeline } = trpc.workload.getPipelineSnapshot.useQuery(
    { warehouseId },
    { refetchInterval: 60_000 }
  );

  const proj = projection?.projection;
  const paceStatus: "on_track" | "at_risk" | "critical" | "no_data" = proj?.paceStatus ?? "no_data";
  const paceMap = {
    on_track: PACE.green,
    at_risk: PACE.amber,
    critical: PACE.red,
    no_data: PACE.no_data,
  };
  const p = paceMap[paceStatus];

  const rateTrend = (rate?.trendBuckets ?? []).map((b: any) => ({
    label: formatTime(b.bucket),
    itemsPerHour: b.itemsPerHour,
  }));

  const burnSeries = (burndown?.series ?? []).map((s: any) => ({
    label: s.label,
    completed: s.itemsCompleted,
    cumulative: s.cumulative,
  }));

  const pipelineData = (pipeline ?? []).map((p: any) => ({
    stage: STAGE_LABELS[p.stage] ?? p.stage,
    stageKey: p.stage,
    count: p.count,
  }));

  return (
    <div className="space-y-5">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-1">
          <ChevronLeft className="h-4 w-4" />
          All Warehouses
        </Button>
        <div className="h-4 w-px bg-border" />
        <h2 className="font-semibold text-lg">{warehouseId}</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.badgeBg}`}>
          {p.label}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-muted-foreground">Current Rate</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {(rate?.itemsPerHour ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">items / hr</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Layers className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">Active Backlog</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {(projection?.backlog.orders ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {(projection?.backlog.pieces ?? 0).toLocaleString()} pieces
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs text-muted-foreground">Est. Completion</span>
            </div>
            <div className="text-lg font-bold">{formatDate(proj?.projectedCompletionAt ?? null)}</div>
            <div className="text-xs text-muted-foreground">
              {proj?.hoursToComplete != null ? `${formatHours(proj.hoursToComplete)} to clear` : "No rate data"}
            </div>
          </CardContent>
        </Card>
        <Card className={`border ${p.border} ${p.bg}`}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className={`h-3.5 w-3.5 ${p.text}`} />
              <span className="text-xs text-muted-foreground">Pace</span>
            </div>
            <div className={`text-xl font-bold ${p.text}`}>{p.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {paceStatus === "on_track" && "Clears within 4h"}
              {paceStatus === "at_risk" && "4–8h to clear"}
              {paceStatus === "critical" && "8h+ — action needed"}
              {paceStatus === "no_data" && "No sessions yet"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Activity className="h-7 w-7 mb-2 opacity-30" />
                <p className="text-sm">No sessions in this window</p>
              </div>
            ) : (
              <>
                {targetRate > 0 && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <span className="inline-block w-6 border-t-2 border-dashed border-red-400" />
                    <span>Target: <strong className="text-foreground">{targetRate.toLocaleString()} items/hr</strong> required to clear backlog in {shiftHours}h</span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={rateTrend} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                    <defs>
                      <linearGradient id="rateGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    {targetRate > 0 && (
                      <ReferenceLine
                        y={targetRate}
                        stroke="#ef4444"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{
                          value: `Target ${targetRate.toLocaleString()}`,
                          position: "insideTopRight",
                          fontSize: 10,
                          fill: "#ef4444",
                          fontWeight: 600,
                        }}
                      />
                    )}
                    <Area type="monotone" dataKey="itemsPerHour" name="Items/hr" stroke="#3b82f6" fill="url(#rateGrad2)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Pipeline Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.every((d: any) => d.count === 0) ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Package className="h-7 w-7 mb-2 opacity-30" />
                <p className="text-sm">No orders in pipeline</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={pipelineData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
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

      {/* Burn-down */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              24h Burn-down
            </CardTitle>
            {(burndown?.totalCompleted ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs">
                {burndown!.totalCompleted.toLocaleString()} items completed
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {burnSeries.every((s) => s.completed === 0) ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <TrendingDown className="h-7 w-7 mb-2 opacity-30" />
              <p className="text-sm">No completed sessions in the last 24 hours</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={burnSeries} margin={{ top: 4, right: 4, left: -10, bottom: 4 }}>
                <defs>
                  <linearGradient id="cumGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="left" type="monotone" dataKey="cumulative" name="Cumulative Items" stroke="#10b981" fill="url(#cumGrad2)" strokeWidth={2} dot={false} />
                <Area yAxisId="right" type="monotone" dataKey="completed" name="Items / hr" stroke="#3b82f6" fill="none" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Projection detail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            Projection Detail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { label: "Measured rate", value: `${(projection?.rate.itemsPerHour ?? 0).toLocaleString()} items/hr` },
              { label: "Based on", value: `${projection?.rate.sessionCount ?? 0} sessions · ${(projection?.rate.basedOnItems ?? 0).toLocaleString()} items · ${(projection?.rate.basedOnDurationH ?? 0).toFixed(1)}h worked` },
              { label: "Backlog (pieces)", value: (projection?.backlog.pieces ?? 0).toLocaleString() },
              { label: "Hours to clear", value: formatHours(proj?.hoursToComplete ?? null) },
              { label: "Projected completion", value: formatDate(proj?.projectedCompletionAt ?? null), highlight: true },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={`text-sm font-medium ${highlight ? p.text : ""}`}>{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers for end-time picker ─────────────────────────────────────────────
function defaultShiftEnd(): string {
  // Default to 5:00 PM today
  return "17:00";
}

function hoursUntil(timeStr: string): number {
  const now = new Date();
  const [hh, mm] = timeStr.split(":").map(Number);
  const end = new Date(now);
  end.setHours(hh, mm, 0, 0);
  // If end time is in the past, assume it's tomorrow
  if (end <= now) end.setDate(end.getDate() + 1);
  return Math.max((end.getTime() - now.getTime()) / 3_600_000, 0.25);
}

function formatCountdown(timeStr: string): string {
  const h = hoursUntil(timeStr);
  if (h >= 24) return ">24h";
  const totalMin = Math.round(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins}m left`;
  return mins === 0 ? `${hrs}h left` : `${hrs}h ${mins}m left`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkloadPage() {
  const [window, setWindow] = useState<Window>("1h");
  const [shiftEnd, setShiftEnd] = useState<string>(defaultShiftEnd);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick every minute to keep countdown live
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Derive shiftHours from the end-time picker (recomputes every minute)
  const shiftHours = useMemo(() => {
    void now; // depend on the ticker
    return Math.max(hoursUntil(shiftEnd), 0.25);
  }, [shiftEnd, now]);

  const { data: summaries, isLoading, refetch } = trpc.workload.getWarehouseSummaries.useQuery(
    { window, shiftHours },
    { refetchInterval: 60_000 }
  );

  const handleRefresh = useCallback(() => {
    refetch();
    toast.success("Workload data refreshed.");
  }, [refetch]);

  const redCount = (summaries ?? []).filter((s: WarehouseSummary) => s.paceStatus === "red").length;
  const amberCount = (summaries ?? []).filter((s: WarehouseSummary) => s.paceStatus === "amber").length;

  if (selectedWarehouse) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <WarehouseDetail
          warehouseId={selectedWarehouse}
          window={window}
          shiftHours={shiftHours}
          onBack={() => setSelectedWarehouse(null)}
        />
      </div>
    );
  }

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
            Live production rate vs. backlog — click a warehouse for detail
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Shift end-time picker */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="whitespace-nowrap">Shift ends:</span>
            <input
              type="time"
              value={shiftEnd}
              onChange={(e) => setShiftEnd(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="whitespace-nowrap font-medium text-primary">{formatCountdown(shiftEnd)}</span>
          </div>
          {/* Window selector */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
            {(["1h", "3h", "24h"] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  window === w ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
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

      {/* ── Alert banner if any red ────────────────────────────────────────── */}
      {redCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <Bell className="h-4 w-4 text-red-600 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-red-700">
              {redCount} warehouse{redCount > 1 ? "s" : ""} critical
            </span>
            <span className="text-red-600 ml-1">
              — flagged to Requires Attention automatically.
            </span>
          </div>
        </div>
      )}

      {/* ── Summary pills ──────────────────────────────────────────────────── */}
      {(summaries ?? []).length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">{(summaries ?? []).length} warehouses</span>
          {[
            { status: "green" as PaceStatus, count: (summaries ?? []).filter((s: WarehouseSummary) => s.paceStatus === "green").length, label: "On Track" },
            { status: "amber" as PaceStatus, count: amberCount, label: "At Risk" },
            { status: "red" as PaceStatus, count: redCount, label: "Critical" },
            { status: "no_data" as PaceStatus, count: (summaries ?? []).filter((s: WarehouseSummary) => s.paceStatus === "no_data").length, label: "No Data" },
          ].filter(({ count }) => count > 0).map(({ status, count, label }) => (
            <span key={status} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${PACE[status].badgeBg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${PACE[status].dot}`} />
              {count} {label}
            </span>
          ))}
        </div>
      )}

      {/* ── Warehouse cards grid ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-xl border-2 border-gray-200 bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : (summaries ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Activity className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-base font-medium">No warehouse data yet</p>
          <p className="text-sm mt-1">Complete pull sessions or sync orders to see workload data</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(summaries as WarehouseSummary[]).map((summary) => (
            <WarehouseCard
              key={summary.warehouseId}
              summary={summary}
              onClick={() => setSelectedWarehouse(summary.warehouseId)}
            />
          ))}
        </div>
      )}

      {/* ── Legend / explanation ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="text-xs font-medium text-foreground mb-2">How status is calculated</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mt-0.5 flex-shrink-0" />
            <span><strong className="text-foreground">Green (On Track):</strong> Current rate ≥ required rate to clear backlog within the selected shift window.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 mt-0.5 flex-shrink-0" />
            <span><strong className="text-foreground">Amber (At Risk):</strong> Current rate is 70–99% of required rate — may not finish on time.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 mt-0.5 flex-shrink-0" />
            <span><strong className="text-foreground">Red (Critical):</strong> Current rate is below 70% of required rate — auto-flagged to Requires Attention.</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Required rate = backlog pieces ÷ hours remaining in shift. Set the shift end time above — the target rate updates automatically as the clock counts down.
        </div>
      </div>
    </div>
  );
}
