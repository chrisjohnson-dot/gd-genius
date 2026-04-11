import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  Activity,
  Users,
  Package,
  CheckCircle2,
  Truck,
  RefreshCw,
  Maximize2,
  Minimize2,
  Clock,
  TrendingUp,
  BoxSelect,
  Layers,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 10_000;

const STAGE_CONFIG = [
  { key: "unallocated", label: "Unallocated", icon: BoxSelect, color: "bg-slate-500", textColor: "text-slate-400", borderColor: "border-slate-500" },
  { key: "allocated", label: "Allocated", icon: Layers, color: "bg-blue-500", textColor: "text-blue-400", borderColor: "border-blue-500" },
  { key: "qc", label: "QC", icon: Activity, color: "bg-yellow-500", textColor: "text-yellow-400", borderColor: "border-yellow-500" },
  { key: "qcDone", label: "QC Done", icon: CheckCircle2, color: "bg-emerald-500", textColor: "text-emerald-400", borderColor: "border-emerald-500" },
  { key: "packing", label: "Packing", icon: Package, color: "bg-purple-500", textColor: "text-purple-400", borderColor: "border-purple-500" },
  { key: "shipReady", label: "Ship Ready", icon: Truck, color: "bg-green-500", textColor: "text-green-400", borderColor: "border-green-500" },
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warning: "text-yellow-400",
  critical: "text-red-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelative(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export default function LiveOpsView() {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("__all__");
  const [tvMode, setTvMode] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [tick, setTick] = useState(0);

  const warehouseParam = selectedWarehouse === "__all__" ? undefined : selectedWarehouse;

  const { data: warehouseList } = trpc.liveOps.warehouses.useQuery(undefined, {
    staleTime: 60_000,
  });

  const { data: snapshot, refetch: refetchSnapshot } = trpc.liveOps.snapshot.useQuery(
    { warehouseId: warehouseParam },
    { staleTime: REFRESH_INTERVAL_MS }
  );

  const { data: events, refetch: refetchEvents } = trpc.liveOps.events.useQuery(
    { warehouseId: warehouseParam, limit: 50 },
    { staleTime: REFRESH_INTERVAL_MS }
  );

  const { data: stationActivity, refetch: refetchStation } = trpc.liveOps.stationActivity.useQuery(
    { warehouseId: warehouseParam },
    { staleTime: REFRESH_INTERVAL_MS }
  );

  const { data: exceptionSummary, refetch: refetchExceptions } = trpc.liveOps.exceptionSummary.useQuery(
    { warehouseId: warehouseParam },
    { staleTime: REFRESH_INTERVAL_MS }
  );

  const { data: slaSummary, refetch: refetchSla } = trpc.liveOps.slaSummary.useQuery(
    { warehouseId: warehouseParam },
    { staleTime: REFRESH_INTERVAL_MS }
  );

  const refreshAll = useCallback(() => {
    refetchSnapshot();
    refetchEvents();
    refetchStation();
    refetchExceptions();
    refetchSla();
    setLastRefresh(new Date());
  }, [refetchSnapshot, refetchEvents, refetchStation, refetchExceptions, refetchSla]);

  // Auto-refresh every 10s
  useEffect(() => {
    const id = setInterval(() => {
      refreshAll();
      setTick((t) => t + 1);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshAll]);

  // Aggregate stages across all warehouses when showing "all"
  const aggregatedStages = snapshot?.warehouses.reduce(
    (acc, wh) => {
      for (const k of Object.keys(wh.stages) as (keyof typeof wh.stages)[]) {
        acc[k] = (acc[k] ?? 0) + wh.stages[k];
      }
      return acc;
    },
    {} as Record<string, number>
  ) ?? {};

  const displayWarehouses =
    selectedWarehouse === "__all__"
      ? snapshot?.warehouses ?? []
      : snapshot?.warehouses.filter((w) => w.warehouseId === selectedWarehouse) ?? [];

  const totalActiveWorkers = Object.values(stationActivity?.shiftWorkers ?? {})
    .flat()
    .reduce((a, b) => a + b.activeWorkers, 0);

  return (
    <div className={cn("flex flex-col h-full bg-[#0d1117] text-white overflow-hidden", tvMode && "fixed inset-0 z-50")}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#161b22] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-400 animate-pulse" />
            <span className="font-bold text-lg tracking-tight">Live Ops View</span>
          </div>
          <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
            <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white h-8 text-sm">
              <SelectValue placeholder="All Warehouses" />
            </SelectTrigger>
            <SelectContent className="bg-[#1c2128] border-white/10 text-white">
              <SelectItem value="__all__">All Warehouses</SelectItem>
              {(warehouseList ?? []).map((wh) => (
                <SelectItem key={wh} value={wh}>{wh}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/50">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Updated {formatRelative(lastRefresh)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-white/50 hover:text-white hover:bg-white/10"
            onClick={refreshAll}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-white/50 hover:text-white hover:bg-white/10"
            onClick={() => setTvMode((v) => !v)}
          >
            {tvMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* ── Pipeline Flow ───────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-stretch gap-2">
          {STAGE_CONFIG.map((stage, idx) => {
            const count = aggregatedStages[stage.key] ?? 0;
            const Icon = stage.icon;
            return (
              <div key={stage.key} className="flex items-center gap-2 flex-1">
                <div className={cn(
                  "flex-1 rounded-lg border p-4 flex flex-col items-center gap-1 bg-white/[0.03] transition-all",
                  stage.borderColor,
                  count > 0 && "bg-white/[0.06]"
                )}>
                  <Icon className={cn("h-5 w-5", stage.textColor)} />
                  <div className={cn("text-3xl font-bold tabular-nums", count > 0 ? "text-white" : "text-white/30")}>
                    {count}
                  </div>
                  <div className="text-xs text-white/50 font-medium uppercase tracking-wider">{stage.label}</div>
                </div>
                {idx < STAGE_CONFIG.length - 1 && (
                  <div className="text-white/20 text-lg shrink-0">→</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Per-warehouse breakdown (when All selected and multiple warehouses) */}
        {selectedWarehouse === "__all__" && displayWarehouses.length > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {displayWarehouses.map((wh) => (
              <div key={wh.warehouseId} className="flex items-center gap-3 bg-white/[0.03] rounded-lg px-4 py-2 border border-white/10">
                <span className="text-sm font-medium text-white/70 w-32 truncate">{wh.warehouseId}</span>
                <div className="flex gap-3 flex-1">
                  {STAGE_CONFIG.map((s) => (
                    <div key={s.key} className="flex flex-col items-center min-w-[36px]">
                      <span className={cn("text-base font-bold tabular-nums", wh.stages[s.key] > 0 ? s.textColor : "text-white/20")}>
                        {wh.stages[s.key]}
                      </span>
                      <span className="text-[10px] text-white/30">{s.label.slice(0, 4)}</span>
                    </div>
                  ))}
                </div>
                <span className="text-white/40 text-sm">{wh.total} total</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Main Content: 3 columns ─────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden min-h-0">

        {/* Column 1: Alert Ticker ─────────────────────────────────────────── */}
        <div className="flex flex-col border-r border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 shrink-0 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-white/80">Activity Feed</span>
            <span className="ml-auto text-xs text-white/30">{events?.length ?? 0} events</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(!events || events.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-32 text-white/30 text-sm">
                <Activity className="h-8 w-8 mb-2 opacity-30" />
                No events yet
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {events.map((ev: any) => (
                  <div key={ev.id} className="px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-start gap-2">
                      <span className={cn("text-xs mt-0.5 shrink-0", SEVERITY_COLORS[ev.severity] ?? "text-white/50")}>
                        ●
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/80 leading-snug">{ev.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ev.warehouseId && (
                            <span className="text-xs text-white/30">{ev.warehouseId}</span>
                          )}
                          <span className="text-xs text-white/25">{formatTime(ev.occurredAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Station Activity + SLA Breaches ─────────────────────── */}
        <div className="flex flex-col border-r border-white/10 overflow-hidden">
          {/* Station Activity */}
          <div className="flex flex-col border-b border-white/10" style={{ flex: "0 0 auto", maxHeight: "50%" }}>
            <div className="px-4 py-3 border-b border-white/10 shrink-0 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold text-white/80">Station Activity</span>
              <span className="ml-auto text-xs text-white/30">{totalActiveWorkers} active</span>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {Object.keys(stationActivity?.shiftWorkers ?? {}).length === 0 &&
               (stationActivity?.receivingSessions ?? []).length === 0 ? (
                <div className="text-white/30 text-sm text-center py-4">No active workers</div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stationActivity?.shiftWorkers ?? {}).map(([wh, roles]) => (
                    <div key={wh}>
                      <div className="text-xs text-white/40 font-medium mb-1.5">{wh}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(roles as any[]).map((r: any) => (
                          <div key={r.role} className="flex items-center justify-between bg-white/[0.04] rounded px-2.5 py-1.5 border border-white/10">
                            <span className="text-xs text-white/60 capitalize">{r.role.replace(/_/g, " ")}</span>
                            <span className="text-sm font-bold text-purple-400">{r.activeWorkers}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(stationActivity?.receivingSessions ?? []).map((rs: any) => (
                    <div key={rs.warehouseId} className="flex items-center justify-between bg-white/[0.04] rounded px-2.5 py-1.5 border border-white/10">
                      <span className="text-xs text-white/60">{rs.warehouseId} — Receiving</span>
                      <span className="text-sm font-bold text-blue-400">{rs.activeSessions} open</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SLA Breaches */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 shrink-0 flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-400" />
              <span className="text-sm font-semibold text-white/80">SLA Breaches</span>
              <span className="ml-auto text-xs text-white/30">
                {slaSummary?.reduce((a: number, b: any) => a + b.breachedOrders, 0) ?? 0} orders
              </span>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {(!slaSummary || slaSummary.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-20 text-white/30 text-sm">
                  <CheckCircle2 className="h-6 w-6 mb-1 text-green-500/40" />
                  All orders on time
                </div>
              ) : (
                <div className="space-y-1.5">
                  {slaSummary.map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-red-500/5 border border-red-500/20 rounded px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-white/80 truncate">{s.clientName}</div>
                        <div className="text-xs text-white/40">{s.warehouseId}</div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-sm font-bold text-red-400">{s.breachedOrders}</div>
                        <div className="text-xs text-red-400/60">{s.worstDaysLate}d late</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Exception Panel ──────────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 shrink-0 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-semibold text-white/80">Exceptions</span>
            {(exceptionSummary?.total ?? 0) > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold animate-pulse">
                {exceptionSummary!.total}
              </span>
            )}
            <Link href="/exceptions" className="ml-auto text-xs text-blue-400 hover:underline">View All →</Link>
          </div>

          {/* Severity breakdown */}
          {exceptionSummary && exceptionSummary.total > 0 && (
            <div className="grid grid-cols-4 gap-0 border-b border-white/10 shrink-0">
              {(["critical", "high", "medium", "low"] as const).map((p) => (
                <div key={p} className="flex flex-col items-center py-2.5 border-r last:border-r-0 border-white/10">
                  <span className={cn("text-xl font-bold tabular-nums", {
                    "text-red-400": p === "critical",
                    "text-orange-400": p === "high",
                    "text-yellow-400": p === "medium",
                    "text-slate-400": p === "low",
                  })}>
                    {exceptionSummary.bySeverity[p]}
                  </span>
                  <span className="text-[10px] text-white/30 uppercase">{p}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top exceptions list */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {(!exceptionSummary || exceptionSummary.total === 0) ? (
              <div className="flex flex-col items-center justify-center h-32 text-white/30 text-sm">
                <CheckCircle2 className="h-8 w-8 mb-2 text-green-500/40" />
                No open exceptions
              </div>
            ) : (
              <div className="space-y-2">
                {exceptionSummary.topExceptions.map((ex: any) => (
                  <Link key={ex.id} href="/exceptions">
                    <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 hover:bg-white/[0.06] transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white/80 truncate">{ex.title}</div>
                          <div className="text-xs text-white/40 mt-0.5">{ex.clientName} · {ex.warehouseId}</div>
                        </div>
                        <Badge className={cn("text-[10px] px-1.5 py-0.5 shrink-0 border", PRIORITY_COLORS[ex.priority])}>
                          {ex.priority}
                        </Badge>
                      </div>
                      <div className="text-xs text-white/25 mt-1">{formatRelative(ex.createdAt)}</div>
                    </div>
                  </Link>
                ))}
                {exceptionSummary.total > exceptionSummary.topExceptions.length && (
                  <Link href="/exceptions">
                    <div className="text-center text-xs text-blue-400 hover:underline py-1 cursor-pointer">
                      +{exceptionSummary.total - exceptionSummary.topExceptions.length} more exceptions →
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer: refresh indicator ───────────────────────────────────────── */}
      <div className="px-6 py-2 border-t border-white/10 bg-[#161b22] shrink-0 flex items-center gap-2 text-xs text-white/25">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Auto-refreshing every 10s · Last update {formatTime(lastRefresh)}
        <span className="ml-auto">GD Genius Live Ops · {new Date().toLocaleDateString()}</span>
      </div>
    </div>
  );
}
