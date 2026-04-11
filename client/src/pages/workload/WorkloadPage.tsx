import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Users,
  RefreshCw,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const STAGE_LABELS: Record<string, string> = {
  unallocated: "Unallocated",
  allocated: "Allocated",
  picking: "Picking",
  qc: "QC",
  qc_complete: "QC Done",
  ship_ready: "Ship Ready",
};

const STAGE_COLORS: Record<string, string> = {
  unallocated: "#6b7280",
  allocated: "#3b82f6",
  picking: "#f59e0b",
  qc: "#8b5cf6",
  qc_complete: "#10b981",
  ship_ready: "#22c55e",
};

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function WorkloadPage() {
  const [warehouseId] = useState("all");

  const { data: pipeline } = trpc.workload.getPipelineSnapshot.useQuery({ warehouseId });
  const { data: forecast, refetch: refetchForecast } = trpc.workload.getLatestForecast.useQuery({ warehouseId });
  const { data: staffing } = trpc.workload.getStaffingRecommendation.useQuery({ warehouseId });

  const generateMutation = trpc.workload.generateForecast.useMutation({
    onSuccess: () => {
      refetchForecast();
      toast.success("Workload forecast updated.");
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const forecasts = forecast?.forecasts ?? [];
  const bottleneckStage = forecasts.find((f: any) => f.bottleneck || Number(f.bottleneck) === 1);
  const totalSlaAtRisk = forecasts.reduce((sum: number, f: any) => sum + Number(f.sla_breach_count ?? f.slaBreachCount ?? 0), 0);

  const chartData = (pipeline ?? []).map((p: any) => ({
    stage: STAGE_LABELS[p.stage] ?? p.stage,
    stageKey: p.stage,
    count: p.count,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Workload Planning
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Predictive pipeline analysis and staffing recommendations
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate({ warehouseId })}
          disabled={generateMutation.isPending}
          className="gap-2"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          {generateMutation.isPending ? "Generating..." : "Generate Forecast"}
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Total in Pipeline</div>
            <div className="text-2xl font-bold">
              {(pipeline ?? []).reduce((s: number, p: any) => s + p.count, 0)}
            </div>
            <div className="text-xs text-muted-foreground">orders</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">SLA at Risk</div>
            <div className={`text-2xl font-bold ${totalSlaAtRisk > 0 ? "text-red-400" : "text-green-400"}`}>
              {totalSlaAtRisk}
            </div>
            <div className="text-xs text-muted-foreground">orders</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Bottleneck Stage</div>
            <div className="text-lg font-bold truncate">
              {bottleneckStage
                ? STAGE_LABELS[bottleneckStage.stage] ?? bottleneckStage.stage
                : "None"}
            </div>
            {bottleneckStage && (
              <div className="text-xs text-amber-400">
                {formatHours(Number(bottleneckStage.hours_needed ?? bottleneckStage.hoursNeeded ?? 0))} to clear
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Last Forecast</div>
            <div className="text-lg font-bold">
              {forecast?.generatedAt ? formatTime(forecast.generatedAt) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">today</div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Current Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">No orders in pipeline</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1e2130", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry: any) => (
                    <Cell key={entry.stageKey} fill={STAGE_COLORS[entry.stageKey] ?? "#6b7280"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Forecast Table */}
      {forecasts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Stage Forecast
              {forecast?.generatedAt && (
                <span className="text-xs font-normal text-muted-foreground">
                  Generated at {formatTime(forecast.generatedAt)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left pb-2 pr-4">Stage</th>
                    <th className="text-right pb-2 pr-4">Queue</th>
                    <th className="text-right pb-2 pr-4">Throughput/hr</th>
                    <th className="text-right pb-2 pr-4">Est. Clear</th>
                    <th className="text-right pb-2 pr-4">SLA Risk</th>
                    <th className="text-right pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map((f: any) => {
                    const isBottleneck = f.bottleneck || Number(f.bottleneck) === 1;
                    const slaRisk = Number(f.sla_breach_count ?? f.slaBreachCount ?? 0);
                    const tph = Number(f.throughput_per_hour ?? f.throughputPerHour ?? 0);
                    const queue = Number(f.current_queue ?? f.currentQueue ?? 0);
                    const hoursNeeded = tph > 0 ? queue / tph : 0;
                    const projectedAt = f.projected_completion_at ?? f.projectedCompletionAt;
                    return (
                      <tr key={f.stage} className={`border-b border-border/50 ${isBottleneck ? "bg-amber-500/5" : ""}`}>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: STAGE_COLORS[f.stage] ?? "#6b7280" }}
                            />
                            <span>{STAGE_LABELS[f.stage] ?? f.stage}</span>
                            {isBottleneck && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1 text-amber-400 border-amber-400/30">
                                Bottleneck
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-2 pr-4 font-mono">{queue}</td>
                        <td className="text-right py-2 pr-4 font-mono">{tph.toFixed(1)}</td>
                        <td className="text-right py-2 pr-4 text-muted-foreground">
                          {queue === 0 ? "—" : projectedAt ? formatTime(Number(projectedAt)) : formatHours(hoursNeeded)}
                        </td>
                        <td className="text-right py-2 pr-4">
                          {slaRisk > 0 ? (
                            <span className="text-red-400 font-medium">{slaRisk}</span>
                          ) : (
                            <span className="text-green-400">0</span>
                          )}
                        </td>
                        <td className="text-right py-2">
                          {queue === 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400 ml-auto" />
                          ) : slaRisk > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-red-400 ml-auto" />
                          ) : isBottleneck ? (
                            <Zap className="h-4 w-4 text-amber-400 ml-auto" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground ml-auto" />
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
      )}

      {/* Staffing Recommendations */}
      {staffing && staffing.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Staffing Insights
              <span className="text-xs font-normal text-muted-foreground">(last 30 days)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(staffing as any[]).map((s: any) => (
                <div key={s.stage} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: STAGE_COLORS[s.stage] ?? "#6b7280" }}
                    />
                    <span className="text-sm font-medium">{STAGE_LABELS[s.stage] ?? s.stage}</span>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Avg orders/hr</span>
                      <span className="text-foreground font-mono">{s.avgOrdersPerHour.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg workers</span>
                      <span className="text-foreground font-mono">{s.avgWorkers.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Orders/worker/hr</span>
                      <span className="text-foreground font-mono">{s.ordersPerWorkerPerHour.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Peak orders/hr</span>
                      <span className="text-foreground font-mono">{s.peakOrders}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {(staffing as any[]).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No staffing data yet. Data accumulates as workers log shifts.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state for forecast */}
      {forecasts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-1">No forecast yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Generate Forecast" to analyze the current pipeline and predict completion times.
            </p>
            <Button
              onClick={() => generateMutation.mutate({ warehouseId })}
              disabled={generateMutation.isPending}
            >
              Generate Forecast
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
