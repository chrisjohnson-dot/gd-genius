import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  Activity,
  Users,
  Package,
  CheckCircle2,
  Truck,
  RefreshCw,
  Clock,
  TrendingUp,
  BoxSelect,
  Layers,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 10_000;

const STAGE_CONFIG = [
  { key: "unallocated", label: "Unallocated", icon: BoxSelect,    color: "text-slate-600",   bg: "bg-slate-100",   border: "border-slate-200" },
  { key: "allocated",   label: "Allocated",   icon: Layers,       color: "text-blue-600",    bg: "bg-blue-50",     border: "border-blue-200" },
  { key: "qc",          label: "QC",          icon: Activity,     color: "text-amber-600",   bg: "bg-amber-50",    border: "border-amber-200" },
  { key: "qcDone",      label: "QC Done",     icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-200" },
  { key: "packing",     label: "Packing",     icon: Package,      color: "text-purple-600",  bg: "bg-purple-50",   border: "border-purple-200" },
  { key: "shipReady",   label: "Ship Ready",  icon: Truck,        color: "text-green-600",   bg: "bg-green-50",    border: "border-green-200" },
] as const;

const SEVERITY_DOT: Record<string, string> = {
  info:     "bg-blue-400",
  warning:  "bg-amber-400",
  critical: "bg-red-500",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high:     "bg-orange-100 text-orange-700 border-orange-200",
  medium:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  low:      "bg-slate-100 text-slate-600 border-slate-200",
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
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const warehouseParam = selectedWarehouse === "__all__" ? undefined : selectedWarehouse;

  const { data: warehouseList } = trpc.liveOps.warehouses.useQuery(undefined, { staleTime: 60_000 });
  const { data: snapshot,         refetch: refetchSnapshot  } = trpc.liveOps.snapshot.useQuery(        { warehouseId: warehouseParam }, { staleTime: REFRESH_INTERVAL_MS });
  const { data: events,           refetch: refetchEvents    } = trpc.liveOps.events.useQuery(          { warehouseId: warehouseParam, limit: 50 }, { staleTime: REFRESH_INTERVAL_MS });
  const { data: stationActivity,  refetch: refetchStation   } = trpc.liveOps.stationActivity.useQuery( { warehouseId: warehouseParam }, { staleTime: REFRESH_INTERVAL_MS });
  const { data: exceptionSummary, refetch: refetchExceptions} = trpc.liveOps.exceptionSummary.useQuery({ warehouseId: warehouseParam }, { staleTime: REFRESH_INTERVAL_MS });
  const { data: slaSummary,       refetch: refetchSla       } = trpc.liveOps.slaSummary.useQuery(      { warehouseId: warehouseParam }, { staleTime: REFRESH_INTERVAL_MS });

  const refreshAll = useCallback(() => {
    refetchSnapshot(); refetchEvents(); refetchStation(); refetchExceptions(); refetchSla();
    setLastRefresh(new Date());
  }, [refetchSnapshot, refetchEvents, refetchStation, refetchExceptions, refetchSla]);

  useEffect(() => {
    const id = setInterval(refreshAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshAll]);

  const aggregatedStages = snapshot?.warehouses.reduce((acc, wh) => {
    for (const k of Object.keys(wh.stages) as (keyof typeof wh.stages)[]) {
      acc[k] = (acc[k] ?? 0) + wh.stages[k];
    }
    return acc;
  }, {} as Record<string, number>) ?? {};

  const displayWarehouses =
    selectedWarehouse === "__all__"
      ? snapshot?.warehouses ?? []
      : snapshot?.warehouses.filter((w) => w.warehouseId === selectedWarehouse) ?? [];

  const totalActiveWorkers = Object.values(stationActivity?.shiftWorkers ?? {})
    .flat()
    .reduce((a, b) => a + (b as any).activeWorkers, 0);

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Ops View</h1>
          <p className="text-sm text-muted-foreground">Real-time warehouse pipeline, exceptions, and activity feed</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All Warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Warehouses</SelectItem>
              {(warehouseList ?? []).map((wh) => (
                <SelectItem key={wh} value={wh}>{wh}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatRelative(lastRefresh)}
          </span>
          <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Pipeline Flow ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {STAGE_CONFIG.map((stage) => {
          const count = aggregatedStages[stage.key] ?? 0;
          const Icon = stage.icon;
          return (
            <Card key={stage.key} className={cn("border", stage.border)}>
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", stage.bg)}>
                    <Icon className={cn("h-4 w-4", stage.color)} />
                  </div>
                  <div className={cn("text-3xl font-bold tabular-nums", count > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                    {count}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stage.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Per-warehouse breakdown */}
      {selectedWarehouse === "__all__" && displayWarehouses.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {displayWarehouses.map((wh) => (
                <div key={wh.warehouseId} className="flex items-center gap-3 bg-muted/40 rounded-lg px-4 py-2.5 border border-border">
                  <span className="text-sm font-semibold text-foreground w-24 truncate">{wh.warehouseId}</span>
                  <div className="flex gap-3 flex-1">
                    {STAGE_CONFIG.map((s) => (
                      <div key={s.key} className="flex flex-col items-center min-w-[32px]">
                        <span className={cn("text-sm font-bold tabular-nums", wh.stages[s.key] > 0 ? s.color : "text-muted-foreground/30")}>
                          {wh.stages[s.key]}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{s.label.slice(0, 4)}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-muted-foreground text-sm">{wh.total} total</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Main Content: 3 columns ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Column 1: Activity Feed */}
        <Card className="flex flex-col" style={{ minHeight: 420 }}>
          <CardHeader className="pb-3 pt-4 px-4 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Activity Feed
              <span className="ml-auto text-xs font-normal text-muted-foreground">{events?.length ?? 0} events</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-0" style={{ maxHeight: 380 }}>
            {(!events || events.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-sm">
                <Activity className="h-8 w-8 mb-2 opacity-30" />
                No events yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {events.map((ev: any) => (
                  <div key={ev.id} className="py-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", SEVERITY_DOT[ev.severity] ?? "bg-slate-400")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">{ev.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ev.warehouseId && (
                            <span className="text-xs text-muted-foreground">{ev.warehouseId}</span>
                          )}
                          <span className="text-xs text-muted-foreground/60">{formatTime(ev.occurredAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 2: Station Activity + SLA Breaches */}
        <Card className="flex flex-col" style={{ minHeight: 420 }}>
          {/* Station Activity */}
          <CardHeader className="pb-2 pt-4 px-4 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Station Activity
              <span className="ml-auto text-xs font-normal text-muted-foreground">{totalActiveWorkers} active</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 shrink-0">
            {Object.keys(stationActivity?.shiftWorkers ?? {}).length === 0 &&
             (stationActivity?.receivingSessions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No active workers</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(stationActivity?.shiftWorkers ?? {}).map(([wh, roles]) => (
                  <div key={wh}>
                    <p className="text-xs text-muted-foreground font-medium mb-1.5">{wh}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(roles as any[]).map((r: any, ri: number) => (
                        <div key={r.role ?? ri} className="flex items-center justify-between bg-muted/50 rounded-lg px-2.5 py-1.5 border border-border">
                          <span className="text-xs text-muted-foreground capitalize">{(r.role ?? "unknown").replace(/_/g, " ")}</span>
                          <span className="text-sm font-bold text-purple-600">{r.activeWorkers}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(stationActivity?.receivingSessions ?? []).map((rs: any) => (
                  <div key={rs.warehouseId} className="flex items-center justify-between bg-muted/50 rounded-lg px-2.5 py-1.5 border border-border">
                    <span className="text-xs text-muted-foreground">{rs.warehouseId} — Receiving</span>
                    <span className="text-sm font-bold text-blue-600">{rs.activeSessions} open</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>

          {/* Divider */}
          <div className="border-t border-border mx-4" />

          {/* SLA Breaches */}
          <CardHeader className="pb-2 pt-3 px-4 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" />
              SLA Breaches
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {slaSummary?.reduce((a: number, b: any) => a + b.breachedOrders, 0) ?? 0} orders
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-0" style={{ maxHeight: 200 }}>
            {(!slaSummary || slaSummary.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-16 text-muted-foreground text-sm">
                <CheckCircle2 className="h-5 w-5 mb-1 text-emerald-500/60" />
                All orders on time
              </div>
            ) : (
              <div className="space-y-1.5">
                {slaSummary.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">{s.clientName}</div>
                      <div className="text-xs text-muted-foreground">{s.warehouseId}</div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-sm font-bold text-red-600">{s.breachedOrders}</div>
                      <div className="text-xs text-red-500/70">{s.worstDaysLate}d late</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Exception Panel */}
        <Card className="flex flex-col" style={{ minHeight: 420 }}>
          <CardHeader className="pb-2 pt-4 px-4 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Exceptions
              {(exceptionSummary?.total ?? 0) > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {exceptionSummary!.total}
                </span>
              )}
              <Link href="/exceptions" className="ml-auto text-xs text-[#15527f] hover:underline font-normal">
                View All →
              </Link>
            </CardTitle>
          </CardHeader>

          {/* Severity breakdown */}
          {exceptionSummary && exceptionSummary.total > 0 && (
            <div className="grid grid-cols-4 gap-0 border-y border-border mx-4 mb-3 shrink-0 rounded-lg overflow-hidden">
              {(["critical", "high", "medium", "low"] as const).map((p) => (
                <div key={p} className={cn("flex flex-col items-center py-2.5", {
                  "bg-red-50":    p === "critical",
                  "bg-orange-50": p === "high",
                  "bg-yellow-50": p === "medium",
                  "bg-slate-50":  p === "low",
                })}>
                  <span className={cn("text-xl font-bold tabular-nums", {
                    "text-red-600":    p === "critical",
                    "text-orange-600": p === "high",
                    "text-yellow-600": p === "medium",
                    "text-slate-500":  p === "low",
                  })}>
                    {exceptionSummary.bySeverity[p]}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase">{p}</span>
                </div>
              ))}
            </div>
          )}

          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-0" style={{ maxHeight: 340 }}>
            {(!exceptionSummary || exceptionSummary.total === 0) ? (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-sm">
                <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-500/40" />
                No open exceptions
              </div>
            ) : (
              <div className="space-y-2">
                {exceptionSummary.topExceptions.map((ex: any) => (
                  <Link key={ex.id} href="/exceptions">
                    <div className="bg-muted/40 border border-border rounded-lg px-3 py-2.5 hover:bg-muted/70 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-foreground truncate">{ex.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{ex.clientName} · {ex.warehouseId}</div>
                        </div>
                        <Badge className={cn("text-[10px] px-1.5 py-0.5 shrink-0 border", PRIORITY_BADGE[ex.priority])}>
                          {ex.priority}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground/60 mt-1">{formatRelative(ex.createdAt)}</div>
                    </div>
                  </Link>
                ))}
                {exceptionSummary.total > exceptionSummary.topExceptions.length && (
                  <Link href="/exceptions">
                    <div className="text-center text-xs text-[#15527f] hover:underline py-1 cursor-pointer">
                      +{exceptionSummary.total - exceptionSummary.topExceptions.length} more exceptions →
                    </div>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Auto-refreshing every 10s · Last update {formatTime(lastRefresh)}
        <span className="ml-auto">GD Genius Live Ops · {new Date().toLocaleDateString()}</span>
      </div>
    </div>
  );
}
