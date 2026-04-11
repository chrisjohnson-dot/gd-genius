import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Barcode,
  PlayCircle,
  StopCircle,
  Loader2,
  RotateCcw,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScanStatus = "success" | "error" | "warning";

interface ScanEvent {
  id: number;
  barcode: string;
  resolvedEntityType?: string | null;
  resolvedEntityId?: string | null;
  resolvedLabel?: string | null;
  status: ScanStatus;
  errorMessage?: string | null;
  scannedAt: Date;
}

interface ScanSession {
  id: number;
  mode: string;
  warehouseId?: string | null;
  status: string;
  totalScans: number;
  successScans: number;
  errorScans: number;
  startedAt: Date;
  events: ScanEvent[];
}

// ─── Status icon ──────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: ScanStatus }) {
  if (status === "success") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "error") return <XCircle className="h-5 w-5 text-red-500" />;
  return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
}

// ─── Scan Result Flash ────────────────────────────────────────────────────────
function ScanResultFlash({
  result,
}: {
  result: { status: ScanStatus; label: string | null; barcode: string; errorMessage: string | null } | null;
}) {
  if (!result) return null;

  const bg =
    result.status === "success"
      ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300"
      : result.status === "error"
      ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
      : "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300";

  return (
    <div className={`rounded-xl border px-6 py-5 text-center transition-all ${bg}`}>
      <div className="flex justify-center mb-2">
        <StatusIcon status={result.status} />
      </div>
      <p className="text-lg font-bold font-mono tracking-wide">{result.barcode}</p>
      {result.label && <p className="text-sm mt-1 opacity-80">{result.label}</p>}
      {result.errorMessage && <p className="text-xs mt-1 opacity-70">{result.errorMessage}</p>}
    </div>
  );
}

// ─── Active Scan Session ──────────────────────────────────────────────────────
function ActiveScanSession({ session }: { session: ScanSession }) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [lastResult, setLastResult] = useState<{
    status: ScanStatus;
    label: string | null;
    barcode: string;
    errorMessage: string | null;
  } | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  const scan = trpc.scanMode.scan.useMutation({
    onSuccess: (data) => {
      setLastResult({
        status: data.status as ScanStatus,
        label: data.label,
        barcode: barcode,
        errorMessage: data.errorMessage,
      });
      setFlashKey((k) => k + 1);
      utils.scanMode.activeSession.invalidate();
      setBarcode("");
      // Auto-focus back to input
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    onError: (err) => {
      toast.error(`Scan failed: ${err.message}`);
      setBarcode("");
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  const endSession = trpc.scanMode.endSession.useMutation({
    onSuccess: () => {
      utils.scanMode.activeSession.invalidate();
      utils.scanMode.recentSessions.invalidate();
      toast.success("Scan session ended");
    },
  });

  const handleScan = useCallback(() => {
    const b = barcode.trim();
    if (!b) return;
    scan.mutate({ sessionId: session.id, barcode: b });
  }, [barcode, session.id, scan]);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  const pct =
    session.totalScans > 0 ? Math.round((session.successScans / session.totalScans) * 100) : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <div>
            <p className="text-sm font-semibold">Scan Mode Active</p>
            <p className="text-xs text-muted-foreground capitalize">
              Mode: {session.mode}
              {session.warehouseId && ` · ${session.warehouseId}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{session.totalScans}</span>
            </span>
            <span className="text-green-600">
              OK: <span className="font-semibold">{session.successScans}</span>
            </span>
            {session.errorScans > 0 && (
              <span className="text-red-500">
                Err: <span className="font-semibold">{session.errorScans}</span>
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
            onClick={() => endSession.mutate({ id: session.id })}
            disabled={endSession.isPending}
          >
            <StopCircle className="h-3.5 w-3.5" />
            End Session
          </Button>
        </div>
      </div>

      {/* Main scan area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 max-w-lg mx-auto w-full">
        {/* Scan input */}
        <div className="w-full">
          <label className="text-xs text-muted-foreground mb-2 block text-center uppercase tracking-wider">
            Scan or type barcode
          </label>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Waiting for scan…"
              className="text-center text-lg font-mono h-14 tracking-widest"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              className="h-14 px-5"
              onClick={handleScan}
              disabled={!barcode.trim() || scan.isPending}
            >
              {scan.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Barcode className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Result flash */}
        <div key={flashKey} className="w-full">
          <ScanResultFlash result={lastResult} />
        </div>

        {/* Progress bar */}
        {session.totalScans > 0 && (
          <div className="w-full">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{session.successScans} successful</span>
              <span>{pct}% success rate</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Recent scans */}
      {session.events && session.events.length > 0 && (
        <div className="border-t bg-card">
          <div className="px-6 py-3 border-b">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Scans
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y">
            {session.events.slice(0, 20).map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 px-6 py-2.5">
                <StatusIcon status={ev.status as ScanStatus} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{ev.barcode}</p>
                  {ev.resolvedLabel && (
                    <p className="text-xs text-muted-foreground truncate">{ev.resolvedLabel}</p>
                  )}
                  {ev.errorMessage && (
                    <p className="text-xs text-red-500 truncate">{ev.errorMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {new Date(ev.scannedAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Start Session View ───────────────────────────────────────────────────────
function StartSessionView() {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState("generic");
  const [warehouse, setWarehouse] = useState("");

  const startSession = trpc.scanMode.startSession.useMutation({
    onSuccess: () => {
      utils.scanMode.activeSession.invalidate();
      toast.success("Scan session started");
    },
  });

  const { data: recentSessions = [] } = trpc.scanMode.recentSessions.useQuery();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Barcode className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Scan Mode</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full-screen barcode scanning with real-time resolution
          </p>
        </div>

        {/* Config */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Scan Mode</label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generic">Generic</SelectItem>
                  <SelectItem value="receiving">Receiving</SelectItem>
                  <SelectItem value="putaway">Put Away</SelectItem>
                  <SelectItem value="picking">Picking</SelectItem>
                  <SelectItem value="qc">QC</SelectItem>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="returns">Returns</SelectItem>
                  <SelectItem value="inventory">Inventory Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Warehouse (optional)</label>
              <Input
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                placeholder="e.g. COL, CAL, RENO"
                className="h-10"
              />
            </div>
            <Button
              className="w-full h-11 gap-2 text-base"
              onClick={() =>
                startSession.mutate({
                  mode,
                  warehouseId: warehouse.trim() || undefined,
                })
              }
              disabled={startSession.isPending}
            >
              {startSession.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <PlayCircle className="h-5 w-5" />
              )}
              Start Scanning
            </Button>
          </CardContent>
        </Card>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Recent Sessions
            </p>
            <div className="space-y-2">
              {recentSessions.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-sm bg-card border rounded-lg px-4 py-2.5"
                >
                  <div>
                    <p className="font-medium capitalize">{s.mode}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString()} ·{" "}
                      {s.totalScans} scans
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.warehouseId && (
                      <Badge variant="secondary" className="text-xs">{s.warehouseId}</Badge>
                    )}
                    <Badge
                      variant={s.status === "completed" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {s.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ScanMode() {
  const { data: session, isLoading } = trpc.scanMode.activeSession.useQuery(undefined, {
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) {
    return <ActiveScanSession session={session as ScanSession} />;
  }

  return <StartSessionView />;
}
