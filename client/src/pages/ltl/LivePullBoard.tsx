/**
 * LivePullBoard.tsx
 * Real-time view of all active pull sessions.
 * Normal mode: standard card grid inside the app layout.
 * Kiosk/TV mode: full-screen, sidebar hidden, enlarged cards, 10 s refresh,
 *   minimal header with live wall-clock, and keyboard shortcut (F or Escape).
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
  Tv,
  Minimize2,
} from "lucide-react";
import { Link } from "wouter";
import { PaceSparkline } from "@/components/ltl/PaceSparkline";
import { useKiosk } from "@/contexts/KioskContext";

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

function formatWallClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
  kiosk = false,
}: {
  session: LiveSession;
  tickOffset: number;
  kiosk?: boolean;
}) {
  const elapsedTotal = session.elapsedSeconds + tickOffset;
  const ghostNow = computeGhostItems(session, tickOffset);
  const paceRatio = computePaceRatio(session.itemsScanned, ghostNow);
  const paceStatus = computePaceStatus(paceRatio);
  const cfg = PACE_CONFIG[paceStatus];
  const PaceIcon = cfg.icon;

  const actualPct = Math.min(100, ghostNow > 0 ? (session.itemsScanned / ghostNow) * 100 : 100);
  const itemsPerHourNow =
    elapsedTotal > 0
      ? Math.round((session.itemsScanned / elapsedTotal) * 3600)
      : 0;

  return (
    <Card className={`relative overflow-hidden border ${paceStatus === "behind" ? "border-red-500/30" : paceStatus === "ahead" ? "border-emerald-500/30" : "border-border"} ${kiosk ? "bg-gray-900 border-gray-700" : ""}`}>
      {/* Pace accent stripe */}
      <div className={`absolute top-0 left-0 right-0 ${kiosk ? "h-2" : "h-1"} ${cfg.barColor}`} />

      <CardHeader className={`${kiosk ? "pt-5 pb-3 px-5" : "pt-4 pb-2 px-4"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-bold truncate leading-tight ${kiosk ? "text-2xl text-white" : "text-base"}`}>
              {session.associateName || session.associateId}
            </p>
            <p className={`text-muted-foreground font-mono truncate ${kiosk ? "text-sm" : "text-xs"}`}>
              {session.associateId} · {session.warehouseId}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 gap-1 font-semibold ${cfg.className} ${kiosk ? "text-base px-3 py-1" : "text-xs"}`}
          >
            <PaceIcon className={kiosk ? "h-4 w-4" : "h-3 w-3"} />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className={`${kiosk ? "px-5 pb-5" : "px-4 pb-4"} space-y-3`}>
        {/* Pick ticket */}
        <p className={`text-muted-foreground ${kiosk ? "text-sm" : "text-xs"}`}>
          Pick Ticket:{" "}
          <span className={`font-mono font-semibold text-foreground ${kiosk ? "text-base" : ""}`}>
            {session.pickTicket}
          </span>
        </p>

        {/* Running clock */}
        <div className="flex items-center gap-2">
          <Clock className={`text-muted-foreground shrink-0 ${kiosk ? "h-6 w-6" : "h-4 w-4"}`} />
          <span className={`font-mono font-bold tabular-nums tracking-tight ${kiosk ? "text-5xl" : "text-2xl"}`}>
            {formatClock(elapsedTotal)}
          </span>
        </div>

        {/* Ghost picker progress bar */}
        <div className="space-y-1.5">
          <div className={`flex items-center justify-between text-muted-foreground ${kiosk ? "text-sm" : "text-xs"}`}>
            <span className="flex items-center gap-1">
              <Ghost className={kiosk ? "h-4 w-4" : "h-3 w-3"} />
              Ghost: {Math.round(ghostNow)} items
            </span>
            <span className="flex items-center gap-1">
              <Package className={kiosk ? "h-4 w-4" : "h-3 w-3"} />
              Actual:{" "}
              <strong className={`text-foreground ml-0.5 ${kiosk ? "text-base" : ""}`}>
                {session.itemsScanned}
              </strong>
            </span>
          </div>
          <div className={`relative rounded-full overflow-hidden ${cfg.ghostColor} ${kiosk ? "h-6" : "h-4"}`}>
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${cfg.barColor}`}
              style={{ width: `${actualPct}%` }}
            />
            <div className="absolute inset-y-0 right-0 w-0.5 bg-muted-foreground/40" />
          </div>
          <div className={`flex items-center justify-between text-muted-foreground ${kiosk ? "text-xs" : "text-[10px]"}`}>
            <span>{paceRatio >= 1 ? "+" : ""}{Math.round((paceRatio - 1) * 100)}% vs ghost</span>
            <span>Target: {session.expectedRate} items/hr</span>
          </div>
        </div>

        {/* Historical pace sparkline */}
        <div className={`space-y-1 pt-1 border-t border-border/50`}>
          <div className={`flex items-center gap-1 text-muted-foreground ${kiosk ? "text-xs" : "text-[10px]"}`}>
            <Activity className={kiosk ? "h-3.5 w-3.5" : "h-3 w-3"} />
            <span>Last 10 min pace trend</span>
          </div>
          <PaceSparkline
            data={session.sparkline}
            expectedRate={session.expectedRate}
            paceStatus={paceStatus}
            width={kiosk ? 320 : 260}
            height={kiosk ? 80 : 52}
            className="w-full"
          />
        </div>

        {/* Current throughput */}
        <div className={`flex items-center gap-1.5 pt-1 border-t border-border/50`}>
          <Zap className={`text-amber-500 ${kiosk ? "h-5 w-5" : "h-3.5 w-3.5"}`} />
          <span className={`text-muted-foreground ${kiosk ? "text-sm" : "text-xs"}`}>Current rate:</span>
          <span className={`font-bold ${itemsPerHourNow >= session.expectedRate ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} ${kiosk ? "text-xl" : "text-sm"}`}>
            {itemsPerHourNow} items/hr
          </span>
          <span className={`text-muted-foreground ml-auto ${kiosk ? "text-sm" : "text-xs"}`}>
            {session.itemsScanned} scanned
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Kiosk Header ─────────────────────────────────────────────────────────────
function KioskHeader({
  sessions,
  wallClock,
  onExit,
  onRefresh,
  isRefreshing,
}: {
  sessions: LiveSession[];
  wallClock: string;
  onExit: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const aheadCount = sessions.filter((s) => s.paceStatus === "ahead").length;
  const onPaceCount = sessions.filter((s) => s.paceStatus === "on_pace").length;
  const behindCount = sessions.filter((s) => s.paceStatus === "behind").length;

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-gray-950 border-b border-gray-800 shrink-0">
      {/* Left: branding + live indicator */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <span className="text-white font-bold text-xl tracking-tight">Live Pull Board</span>
        </div>
        <div className="flex items-center gap-2">
          {sessions.length > 0 && (
            <span className="text-gray-400 text-sm">{sessions.length} active</span>
          )}
          {aheadCount > 0 && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 text-sm">
              <TrendingUp className="h-3.5 w-3.5" /> {aheadCount} Ahead
            </Badge>
          )}
          {onPaceCount > 0 && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 gap-1 text-sm">
              <Minus className="h-3.5 w-3.5" /> {onPaceCount} On Pace
            </Badge>
          )}
          {behindCount > 0 && (
            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 gap-1 text-sm">
              <TrendingDown className="h-3.5 w-3.5" /> {behindCount} Behind
            </Badge>
          )}
        </div>
      </div>

      {/* Right: wall clock + controls */}
      <div className="flex items-center gap-4">
        <span className="font-mono text-2xl font-bold text-white tabular-nums">{wallClock}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="text-gray-400 hover:text-white gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExit}
          className="gap-1.5 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
        >
          <Minimize2 className="h-4 w-4" />
          Exit Kiosk
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const NORMAL_REFETCH_MS = 15_000;
const KIOSK_REFETCH_MS = 10_000;

export default function LivePullBoard() {
  const { isKiosk, enterKiosk, exitKiosk } = useKiosk();
  const [tickOffset, setTickOffset] = useState(0);
  const [wallClock, setWallClock] = useState(() => formatWallClock(new Date()));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const refetchInterval = isKiosk ? KIOSK_REFETCH_MS : NORMAL_REFETCH_MS;

  const { data: sessions = [], isLoading, refetch, dataUpdatedAt } = trpc.pullTracker.getActiveSessions.useQuery(
    undefined,
    { refetchInterval }
  );

  // Reset tick offset on fresh server data
  useEffect(() => {
    setTickOffset(0);
  }, [dataUpdatedAt]);

  // 1-second ticker for clocks + wall clock
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setTickOffset((prev) => prev + 1);
      setWallClock(formatWallClock(new Date()));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Keyboard shortcut: F = enter kiosk, Escape = exit kiosk
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "f" || e.key === "F") {
        if (!isKiosk) handleEnterKiosk();
      } else if (e.key === "Escape") {
        if (isKiosk) handleExitKiosk();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isKiosk]);

  // Sync with browser fullscreen API — if user presses Esc in native fullscreen, exit kiosk
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement && isKiosk) {
        exitKiosk();
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [isKiosk, exitKiosk]);

  const handleEnterKiosk = useCallback(() => {
    enterKiosk();
    // Request native full-screen on the board container (or document element)
    const el = boardRef.current ?? document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {/* ignore permission errors */});
    }
  }, [enterKiosk]);

  const handleExitKiosk = useCallback(() => {
    exitKiosk();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [exitKiosk]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  // Group by warehouse
  const byWarehouse = sessions.reduce<Record<string, LiveSession[]>>((acc, s) => {
    (acc[s.warehouseId] ??= []).push(s as LiveSession);
    return acc;
  }, {});

  const aheadCount = sessions.filter((s) => s.paceStatus === "ahead").length;
  const onPaceCount = sessions.filter((s) => s.paceStatus === "on_pace").length;
  const behindCount = sessions.filter((s) => s.paceStatus === "behind").length;

  // ── Kiosk layout ─────────────────────────────────────────────────────────────
  if (isKiosk) {
    return (
      <div
        ref={boardRef}
        className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white overflow-hidden"
      >
        <KioskHeader
          sessions={sessions as LiveSession[]}
          wallClock={wallClock}
          onExit={handleExitKiosk}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse bg-gray-900 border-gray-700">
                  <CardContent className="pt-6 pb-6 space-y-4">
                    <div className="h-6 bg-gray-800 rounded w-3/4" />
                    <div className="h-14 bg-gray-800 rounded w-1/2" />
                    <div className="h-6 bg-gray-800 rounded" />
                    <div className="h-20 bg-gray-800 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
              <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center">
                <Package className="h-12 w-12 text-gray-600" />
              </div>
              <p className="text-2xl font-semibold text-gray-400">No active sessions</p>
              <p className="text-gray-500 max-w-sm">
                Sessions started by associates will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(byWarehouse).map(([warehouse, wSessions]) => (
                <div key={warehouse}>
                  <h2 className="text-base font-semibold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-gray-800" />
                    {warehouse} — {wSessions.length} session{wSessions.length !== 1 ? "s" : ""}
                    <span className="h-px flex-1 bg-gray-800" />
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {wSessions.map((s) => (
                      <SessionCard key={s.id} session={s} tickOffset={tickOffset} kiosk />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kiosk footer hint */}
        <div className="shrink-0 px-6 py-2 bg-gray-950 border-t border-gray-800 text-center text-xs text-gray-600">
          Press <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">Esc</kbd> or click "Exit Kiosk" to return · Refreshes every {KIOSK_REFETCH_MS / 1000}s
        </div>
      </div>
    );
  }

  // ── Normal layout ─────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div ref={boardRef} className="p-6 space-y-6">
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
              Active sessions vs. ghost picker · refreshes every {NORMAL_REFETCH_MS / 1000}s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleEnterKiosk}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Tv className="h-4 w-4" />
                  TV / Kiosk Mode
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enter full-screen kiosk mode for warehouse monitors (shortcut: F)</TooltipContent>
            </Tooltip>
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
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
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
          <span className="ml-auto text-muted-foreground/70">
            Shortcut: press <kbd className="px-1 py-0.5 rounded bg-muted font-mono">F</kbd> for kiosk mode
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
