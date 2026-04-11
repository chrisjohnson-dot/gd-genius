/**
 * LivePullBoard.tsx
 * Real-time view of all active pull sessions.
 * Each card shows a running clock, an animated progress bar vs. a ghost picker,
 * a pace badge (Ahead / On Pace / Behind), and a historical items/hr sparkline.
 * Refreshes from the server every 15 s; clocks tick every second client-side.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Package,
  Clock,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Ghost,
  Settings,
  Activity,
} from "lucide-react";
import { Link } from "wouter";
import { PaceSparkline } from "@/components/ltl/PaceSparkline";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SparkPoint {
  bucketTs: number;
  itemsPerHour: number;
}

interface LiveSession {
  id: number;
  pickTicket: string;
  associateId: string;
  associateName: string | null;
  warehouseId: string;
  startedAt: number;
  elapsedSeconds: number;
  itemsScanned: number;
  expectedRate: number;
  ghostItems: number;
  paceRatio: number;
  paceStatus: "ahead" | "on_pace" | "behind";
  sparkline: SparkPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function computeGhostItems(session: LiveSession, extraSeconds: number): number {
  return (session.expectedRate / 3600) * (session.elapsedSeconds + extraSeconds);
}

function computePaceRatio(items: number, ghost: number): number {
  return ghost > 0 ? items / ghost : 1;
}

function computePaceStatus(ratio: number): "ahead" | "on_pace" | "behind" {
  return ratio >= 1.05 ? "ahead" : ratio >= 0.85 ? "on_pace" : "behind";
}

// ─── Pace Badge Config ────────────────────────────────────────────────────────
const PACE_CONFIG = {
  ahead: {
    label: "Ahead",
    icon: TrendingUp,
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
    barColor: "bg-emerald-500",
    ghostColor: "bg-emerald-200 dark:bg-emerald-900/40",
  },
  on_pace: {
    label: "On Pace",
    icon: Minus,
    className: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
    barColor: "bg-blue-500",
    ghostColor: "bg-blue-200 dark:bg-blue-900/40",
  },
  behind: {
    label: "Behind",
    icon: TrendingDown,
    className: "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400",
    barColor: "bg-red-500",
    ghostColor: "bg-red-200 dark:bg-red-900/40",
  },
};

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({
  session,
  tickOffset,
}: {
  session: LiveSession;
  tickOffset: number; // seconds elapsed since last server fetch
}) {
  const elapsedTotal = session.elapsedSeconds + tickOffset;
  const ghostNow = computeGhostItems(session, tickOffset);
  const paceRatio = computePaceRatio(session.itemsScanned, ghostNow);
  const paceStatus = computePaceStatus(paceRatio);
  const cfg = PACE_CONFIG[paceStatus];
  const PaceIcon = cfg.icon;

  // Progress bar: use ghost as the 100% anchor
  const actualPct = Math.min(100, ghostNow > 0 ? (session.itemsScanned / ghostNow) * 100 : 100);
  const itemsPerHourNow =
    elapsedTotal > 0
      ? Math.round((session.itemsScanned / elapsedTotal) * 3600)
      : 0;

  return (
    <Card className={`relative overflow-hidden border ${paceStatus === "behind" ? "border-red-500/30" : paceStatus === "ahead" ? "border-emerald-500/30" : "border-border"}`}>
      {/* Pace accent stripe */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${cfg.barColor}`} />

      <CardHeader className="pt-4 pb-2 px-4">
        <div className="flex items-start justify-between gap-2">
          {/* Associate info */}
          <div className="min-w-0">
            <p className="font-bold text-base truncate leading-tight">
              {session.associateName || session.associateId}
            </p>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {session.associateId} · {session.warehouseId}
            </p>
          </div>
          {/* Pace badge */}
          <Badge variant="outline" className={`shrink-0 gap-1 text-xs font-semibold ${cfg.className}`}>
            <PaceIcon className="h-3 w-3" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Pick ticket */}
        <p className="text-xs text-muted-foreground">
          Pick Ticket: <span className="font-mono font-semibold text-foreground">{session.pickTicket}</span>
        </p>

        {/* Running clock */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
            {formatClock(elapsedTotal)}
          </span>
        </div>

        {/* Ghost picker progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Ghost className="h-3 w-3" />
              Ghost: {Math.round(ghostNow)} items
            </span>
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              Actual: <strong className="text-foreground ml-0.5">{session.itemsScanned}</strong>
            </span>
          </div>
          {/* Bar track */}
          <div className={`relative h-4 rounded-full overflow-hidden ${cfg.ghostColor}`}>
            {/* Actual bar */}
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${cfg.barColor}`}
              style={{ width: `${actualPct}%` }}
            />
            {/* Ghost marker line at 100% */}
            <div className="absolute inset-y-0 right-0 w-0.5 bg-muted-foreground/40" />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{paceRatio >= 1 ? "+" : ""}{Math.round((paceRatio - 1) * 100)}% vs ghost</span>
            <span>Target: {session.expectedRate} items/hr</span>
          </div>
        </div>

        {/* Historical pace sparkline */}
        <div className="space-y-1 pt-1 border-t border-border/50">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>Last 10 min pace trend</span>
          </div>
          <PaceSparkline
            data={session.sparkline}
            expectedRate={session.expectedRate}
            paceStatus={paceStatus}
            width={260}
            height={52}
            className="w-full"
          />
        </div>

        {/* Current throughput */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs text-muted-foreground">Current rate:</span>
          <span className={`text-sm font-bold ${itemsPerHourNow >= session.expectedRate ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {itemsPerHourNow} items/hr
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {session.itemsScanned} scanned
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const REFETCH_INTERVAL_MS = 15_000;

export default function LivePullBoard() {
  const [tickOffset, setTickOffset] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: sessions = [], isLoading, refetch, dataUpdatedAt } = trpc.pullTracker.getActiveSessions.useQuery(
    undefined,
    { refetchInterval: REFETCH_INTERVAL_MS }
  );

  // Reset tick offset whenever we get fresh data from the server
  useEffect(() => {
    setTickOffset(0);
  }, [dataUpdatedAt]);

  // Client-side 1-second ticker
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setTickOffset((prev) => prev + 1);
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Group by warehouse for display
  const byWarehouse = sessions.reduce<Record<string, LiveSession[]>>((acc, s) => {
    (acc[s.warehouseId] ??= []).push(s as LiveSession);
    return acc;
  }, {});

  const aheadCount = sessions.filter((s) => s.paceStatus === "ahead").length;
  const onPaceCount = sessions.filter((s) => s.paceStatus === "on_pace").length;
  const behindCount = sessions.filter((s) => s.paceStatus === "behind").length;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              Live Pull Board
            </h1>
            <p className="text-sm text-muted-foreground">
              Active sessions vs. ghost picker · refreshes every {REFETCH_INTERVAL_MS / 1000}s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/ltl/pull-manager">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Configure expected rate in Pull Manager → Alert Settings</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary pills */}
        {sessions.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground font-medium">{sessions.length} active</span>
            {aheadCount > 0 && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
                <TrendingUp className="h-3 w-3" /> {aheadCount} Ahead
              </Badge>
            )}
            {onPaceCount > 0 && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1">
                <Minus className="h-3 w-3" /> {onPaceCount} On Pace
              </Badge>
            )}
            {behindCount > 0 && (
              <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 gap-1">
                <TrendingDown className="h-3 w-3" /> {behindCount} Behind
              </Badge>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6 pb-6 space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-8 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-12 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Package className="h-8 w-8 text-muted-foreground opacity-40" />
            </div>
            <p className="text-lg font-semibold text-muted-foreground">No active sessions</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Sessions started by associates will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byWarehouse).map(([warehouse, wSessions]) => (
              <div key={warehouse}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />
                  {warehouse} — {wSessions.length} session{wSessions.length !== 1 ? "s" : ""}
                  <span className="h-px flex-1 bg-border" />
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {wSessions.map((s) => (
                    <SessionCard key={s.id} session={s} tickOffset={tickOffset} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap pt-2 border-t border-border/50 text-xs text-muted-foreground">
          <span className="font-semibold">Sparkline legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-current border-dashed opacity-60" />
            Ghost picker target rate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-emerald-500" />
            Actual items/hr per minute
          </span>
          <span className="ml-auto">
            Ghost rate configured in <strong>Pull Manager → Alert Settings → Ghost Picker Rate</strong>
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
