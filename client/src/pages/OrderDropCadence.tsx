/**
 * B2B Order Drop Cadence
 *
 * Chart 1 — Average Units per Order by Weekday (Mon–Fri bar chart)
 * Chart 2 — Weekly Unit Volume by Day (stacked bar, last 52 weeks)
 *            Red background shading on weeks where one day > 50% of weekly total
 *
 * Data source: order_tracking (local DB, no Extensiv API calls)
 * Cache: b2b_cadence_cache table, refreshed nightly via heartbeat
 */

import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  Cell,
  ReferenceArea,
  Legend,
} from "recharts";
import { RefreshCw, TrendingUp, BarChart3, AlertTriangle } from "lucide-react";

// Day-of-week order for charts: Mon–Fri only (business days)
const BUSINESS_DAYS = [2, 3, 4, 5, 6]; // MySQL DAYOFWEEK: 2=Mon..6=Fri
const DOW_LABEL: Record<number, string> = {
  2: "Mon",
  3: "Tue",
  4: "Wed",
  5: "Thu",
  6: "Fri",
};

// Colors for stacked bar (Mon–Fri)
const DAY_COLORS: Record<number, string> = {
  2: "#6366f1", // Mon — indigo
  3: "#0ea5e9", // Tue — sky
  4: "#10b981", // Wed — emerald
  5: "#f59e0b", // Thu — amber
  6: "#f43f5e", // Fri — rose
};

// ─── Custom tooltip for avg-units chart ──────────────────────────────────────
function AvgTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value as number;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground">
        Avg units/order: <span className="text-foreground font-mono">{val?.toFixed(0)}</span>
      </p>
    </div>
  );
}

// ─── Custom tooltip for weekly stacked chart ─────────────────────────────────
function WeeklyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = (payload as any[]).reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm min-w-[160px]">
      <p className="font-semibold text-foreground mb-1">Week of {label}</p>
      {(payload as any[]).map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.fill }} className="font-medium">{p.name}</span>
          <span className="font-mono text-foreground">{(p.value as number)?.toLocaleString()}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1 flex justify-between gap-4">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono font-semibold text-foreground">{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrderDropCadence() {
  const { selectedFacilityId } = useWarehouse();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.analytics.getB2BCadence.useQuery(
    { facilityId: selectedFacilityId ?? null },
    { staleTime: 5 * 60 * 1000 }
  );

  const refreshMutation = trpc.analytics.refreshB2BCadence.useMutation({
    onSuccess: () => {
      utils.analytics.getB2BCadence.invalidate();
      toast.success("Cadence cache refreshed");
    },
    onError: (err) => toast.error(`Refresh failed: ${err.message}`),
  });

  // ── Chart 1: Avg units/order by weekday (Mon–Fri) ────────────────────────
  const avgData = useMemo(() => {
    if (!data?.weekdayAvgs) return [];
    return BUSINESS_DAYS.map(dow => {
      const row = data.weekdayAvgs.find(r => r.dow === dow);
      return {
        day: DOW_LABEL[dow],
        dow,
        avgUnits: row ? Math.round(row.avgUnitsPerOrder) : 0,
        orderCount: row?.orderCount ?? 0,
      };
    });
  }, [data]);

  // ── Chart 2: Weekly stacked bar (last 52 weeks) ───────────────────────────
  const weeklyData = useMemo(() => {
    if (!data?.weeklyVol) return { rows: [], dominantWeeks: new Set<string>() };

    // Collect all weeks in order
    const weekSet = new Set<string>();
    for (const r of data.weeklyVol) weekSet.add(r.weekIso);
    const weeks = Array.from(weekSet).sort();

    // Build one row per week with Mon–Fri columns
    const rows = weeks.map(weekIso => {
      const days = data.weeklyVol.filter(r => r.weekIso === weekIso);
      const weekTotal = days.reduce((s, d) => s + d.totalUnits, 0);
      const row: Record<string, any> = {
        weekIso,
        weekStart: days[0]?.weekStart ?? weekIso,
        weekTotal,
        hasDominantDay: days.some(d => weekTotal > 0 && d.totalUnits / weekTotal > 0.5),
      };
      for (const dow of BUSINESS_DAYS) {
        const d = days.find(r => r.dow === dow);
        row[`dow_${dow}`] = d?.totalUnits ?? 0;
      }
      return row;
    });

    const dominantWeeks = new Set(rows.filter(r => r.hasDominantDay).map(r => r.weekIso));
    return { rows, dominantWeeks };
  }, [data]);

  // Format week label for X axis (show "Jan 5" style)
  const formatWeekLabel = (weekStart: string) => {
    if (!weekStart || weekStart.length < 7) return weekStart;
    const d = new Date(weekStart + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Determine which week indices are dominant (for ReferenceArea)
  const dominantRanges = useMemo(() => {
    const { rows, dominantWeeks } = weeklyData;
    const ranges: { x1: string; x2: string }[] = [];
    for (const row of rows) {
      if (dominantWeeks.has(row.weekIso)) {
        ranges.push({ x1: row.weekStart, x2: row.weekStart });
      }
    }
    return ranges;
  }, [weeklyData]);

  const dominantCount = weeklyData.dominantWeeks.size;

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>Failed to load cadence data: {error.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            B2B Order Drop Cadence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregated from local order history — no live Extensiv calls
            {data?.lastComputed && (
              <span className="ml-2 text-xs">
                · Last computed: {new Date(data.lastComputed).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dominantCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {dominantCount} dominant-day week{dominantCount !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate({ facilityId: selectedFacilityId ?? null })}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh Cache
          </Button>
        </div>
      </div>

      {/* Chart 1 — Average Units per Order by Weekday */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Average Units per Order by Weekday
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            All-time average across all B2B orders in the local database
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
              Computing cadence data…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={avgData}
                margin={{ top: 32, right: 24, left: 8, bottom: 8 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 13, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <RechartTooltip content={<AvgTooltip />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }} />
                <Bar dataKey="avgUnits" name="Avg Units/Order" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 12, fill: "hsl(var(--foreground))", formatter: (v: number) => v > 0 ? v.toLocaleString() : "" }}>
                  {avgData.map(entry => (
                    <Cell key={entry.dow} fill={DAY_COLORS[entry.dow] ?? "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Chart 2 — Weekly Unit Volume by Day (stacked) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Weekly Unit Volume by Day
            <span className="text-xs font-normal text-muted-foreground">(last 52 weeks)</span>
          </CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Stacked by weekday</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/40" />
              Red shading = one day &gt; 50% of week's total units
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[340px] flex items-center justify-center text-muted-foreground text-sm">
              Computing cadence data…
            </div>
          ) : weeklyData.rows.length === 0 ? (
            <div className="h-[340px] flex items-center justify-center text-muted-foreground text-sm">
              No weekly data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={weeklyData.rows}
                margin={{ top: 16, right: 24, left: 8, bottom: 32 }}
                barCategoryGap="8%"
                barGap={0}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={formatWeekLabel}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(weeklyData.rows.length / 12)}
                  angle={-35}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <RechartTooltip content={<WeeklyTooltip />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }} />
                <Legend
                  verticalAlign="top"
                  height={28}
                  formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                />

                {/* Red background shading for dominant-day weeks */}
                {dominantRanges.map((r, i) => (
                  <ReferenceArea
                    key={i}
                    x1={r.x1}
                    x2={r.x2}
                    fill="rgba(239, 68, 68, 0.12)"
                    stroke="rgba(239, 68, 68, 0.25)"
                    strokeWidth={1}
                  />
                ))}

                {BUSINESS_DAYS.map(dow => (
                  <Bar
                    key={dow}
                    dataKey={`dow_${dow}`}
                    name={DOW_LABEL[dow]}
                    stackId="week"
                    fill={DAY_COLORS[dow]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Summary stats */}
      {data && !isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {BUSINESS_DAYS.map(dow => {
            const row = data.weekdayAvgs.find(r => r.dow === dow);
            if (!row) return null;
            return (
              <Card key={dow} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: DAY_COLORS[dow] }}
                  />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {DOW_LABEL[dow]}
                  </span>
                </div>
                <p className="text-xl font-bold text-foreground font-mono">
                  {Math.round(row.avgUnitsPerOrder).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">avg units/order</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {row.orderCount.toLocaleString()} orders total
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
