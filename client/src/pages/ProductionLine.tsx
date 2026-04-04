import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Square,
  RefreshCw,
  Activity,
  Package,
  Clock,
  Percent,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Verdict = "pass" | "fail" | "hold";

const FAIL_REASON_LABELS: Record<string, string> = {
  GTIN_MISMATCH: "GTIN Mismatch",
  LOT_MISMATCH: "Lot Mismatch",
  EXPIRED: "Product Expired",
  EXPIRY_WINDOW: "Expiry Window Too Short",
  LOW_CONFIDENCE: "Low Scan Confidence",
  STRAY_LABEL: "Stray Label Detected",
  NO_ACTIVE_RUN: "No Active Run",
  NO_DECODE: "Barcode Not Decoded",
};

// ── Verdict badge ─────────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict === "pass")
    return (
      <Badge className="bg-green-600 text-white gap-1">
        <CheckCircle2 className="w-3 h-3" /> PASS
      </Badge>
    );
  if (verdict === "fail")
    return (
      <Badge className="bg-red-600 text-white gap-1">
        <XCircle className="w-3 h-3" /> FAIL
      </Badge>
    );
  return (
    <Badge className="bg-yellow-500 text-white gap-1">
      <AlertTriangle className="w-3 h-3" /> HOLD
    </Badge>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card className="flex-1 min-w-[120px]">
      <CardContent className="pt-4 pb-3 px-4">
        <div className={`flex items-center gap-2 ${color} mb-1`}>
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ── Start Run Dialog ──────────────────────────────────────────────────────────
function StartRunDialog({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const [form, setForm] = useState({
    lineId: "LINE-1",
    operatorId: "",
    expectedGtin: "",
    expectedLot: "",
    expectedExpiry: "",
    confidenceThreshold: "0.85",
    shelfLifeDaysMin: "",
  });

  const startRun = trpc.productionLine.startRun.useMutation({
    onSuccess: (data) => {
      toast.success(`Production run started — Run ID: ${data.runId.slice(0, 8)}…`);
      onStarted(data.runId);
    },
    onError: (err) => toast.error(`Failed to start run: ${err.message}`),
  });

  const handleSubmit = () => {
    if (!form.operatorId || !form.expectedGtin || !form.expectedLot || !form.expectedExpiry) {
      toast.error("Required fields missing");
      return;
    }
    startRun.mutate({
      lineId: form.lineId,
      operatorId: form.operatorId,
      expectedGtin: form.expectedGtin,
      expectedLot: form.expectedLot,
      expectedExpiry: form.expectedExpiry,
      confidenceThreshold: parseFloat(form.confidenceThreshold) || 0.85,
      shelfLifeDaysMin: form.shelfLifeDaysMin ? parseInt(form.shelfLifeDaysMin) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start Production Run</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Line ID</Label>
              <Input value={form.lineId} onChange={(e) => setForm({ ...form, lineId: e.target.value })} />
            </div>
            <div>
              <Label>Operator ID *</Label>
              <Input
                placeholder="e.g. OP-001"
                value={form.operatorId}
                onChange={(e) => setForm({ ...form, operatorId: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Expected GTIN *</Label>
            <Input
              placeholder="14-digit GTIN"
              value={form.expectedGtin}
              onChange={(e) => setForm({ ...form, expectedGtin: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Expected Lot *</Label>
              <Input
                placeholder="Lot number"
                value={form.expectedLot}
                onChange={(e) => setForm({ ...form, expectedLot: e.target.value })}
              />
            </div>
            <div>
              <Label>Expected Expiry *</Label>
              <Input
                type="date"
                value={form.expectedExpiry}
                onChange={(e) => setForm({ ...form, expectedExpiry: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Confidence Threshold</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.confidenceThreshold}
                onChange={(e) => setForm({ ...form, confidenceThreshold: e.target.value })}
              />
            </div>
            <div>
              <Label>Min Shelf Life (days)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 30"
                value={form.shelfLifeDaysMin}
                onChange={(e) => setForm({ ...form, shelfLifeDaysMin: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={startRun.isPending}>
            {startRun.isPending ? "Starting…" : "Start Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manual Scan Dialog (for testing) ─────────────────────────────────────────
function ManualScanDialog({
  open,
  runId,
  onClose,
  onScanned,
}: {
  open: boolean;
  runId: string;
  onClose: () => void;
  onScanned: () => void;
}) {
  const [form, setForm] = useState({
    gtin: "",
    lot: "",
    expiry: "",
    confidence: "0.95",
    camBClear: true,
  });

  const submitScan = trpc.productionLine.submitScan.useMutation({
    onSuccess: (data) => {
      const verdictLabel = data.verdict.toUpperCase();
      const reason = data.failReason ? ` — ${FAIL_REASON_LABELS[data.failReason] ?? data.failReason}` : "";
      if (data.verdict === "pass") {
        toast.success(`Verdict: ${verdictLabel}`);
      } else {
        toast.error(`Verdict: ${verdictLabel}${reason}`);
      }
      onScanned();
      onClose();
    },
    onError: (err) => toast.error(`Scan failed: ${err.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manual Test Scan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label>GTIN</Label>
            <Input value={form.gtin} onChange={(e) => setForm({ ...form, gtin: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lot</Label>
              <Input value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} />
            </div>
            <div>
              <Label>Expiry (YYYYMMDD)</Label>
              <Input
                placeholder="20261231"
                value={form.expiry}
                onChange={(e) => setForm({ ...form, expiry: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Confidence (0–1)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: e.target.value })}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.camBClear}
                  onChange={(e) => setForm({ ...form, camBClear: e.target.checked })}
                />
                <span>Cam B Clear</span>
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              submitScan.mutate({
                runId,
                gtin: form.gtin || undefined,
                lot: form.lot || undefined,
                expiry: form.expiry || undefined,
                confidence: parseFloat(form.confidence) || undefined,
                camBClear: form.camBClear,
              })
            }
            disabled={submitScan.isPending}
          >
            {submitScan.isPending ? "Scanning…" : "Submit Scan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProductionLine() {
  const { user } = useAuth();
  const [lineId] = useState("LINE-1");
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showManualScan, setShowManualScan] = useState(false);
  const [showScans, setShowScans] = useState(true);
  const scanListRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // Poll active run every 3 seconds
  const { data: activeRun, refetch: refetchRun } = trpc.productionLine.getActiveRun.useQuery(
    { lineId },
    { refetchInterval: 3000 }
  );

  // Poll scans when a run is active
  const { data: scansData, refetch: refetchScans } = trpc.productionLine.listScans.useQuery(
    { runId: activeRun?.runId ?? "", limit: 50 },
    { enabled: !!activeRun?.runId, refetchInterval: 2000 }
  );

  const scans = scansData ?? [];

  // Auto-scroll scan list to top (newest first)
  useEffect(() => {
    if (scanListRef.current) {
      scanListRef.current.scrollTop = 0;
    }
  }, [scans.length]);

  const closeRun = trpc.productionLine.closeRun.useMutation({
    onSuccess: (data) => {
      toast.success(`Run closed — ${data.totalScanned} scanned: ${data.totalPass} pass, ${data.totalFail} fail, ${data.totalHold} hold`);
      refetchRun();
    },
    onError: (err) => toast.error(`Failed to close run: ${err.message}`),
  });

  const abortRun = trpc.productionLine.abortRun.useMutation({
    onSuccess: () => {
      toast.success("Run aborted");
      refetchRun();
    },
    onError: (err) => toast.error(`Failed to abort run: ${err.message}`),
  });

  const passRate = activeRun && activeRun.totalScanned > 0
    ? Math.round((activeRun.totalPass / activeRun.totalScanned) * 100)
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-500" />
            Production Line
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Automated QC carton line — GS1-128 verdict engine
          </p>
        </div>
        <div className="flex gap-2">
          {!activeRun ? (
            <Button onClick={() => setShowStartDialog(true)} className="gap-2">
              <Play className="w-4 h-4" /> Start Run
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualScan(true)}
                className="gap-1"
              >
                Test Scan
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => closeRun.mutate({ runId: activeRun.runId })}
                disabled={closeRun.isPending}
                className="gap-1"
              >
                <Square className="w-3 h-3" /> Close Run
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => abortRun.mutate({ runId: activeRun.runId })}
                disabled={abortRun.isPending}
              >
                Abort
              </Button>
            </>
          )}
        </div>
      </div>

      {/* No active run */}
      {!activeRun && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No active production run on {lineId}</p>
            <p className="text-sm mt-1">Click "Start Run" to begin a new run and activate the scan endpoint.</p>
          </CardContent>
        </Card>
      )}

      {/* Active run */}
      {activeRun && (
        <>
          {/* Run info bar */}
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Run ID: </span>
                  <span className="font-mono font-medium">{activeRun.runId.slice(0, 8)}…</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Line: </span>
                  <span className="font-medium">{activeRun.lineId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Operator: </span>
                  <span className="font-medium">{activeRun.operatorId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">GTIN: </span>
                  <span className="font-mono font-medium">{activeRun.expectedGtin}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Lot: </span>
                  <span className="font-mono font-medium">{activeRun.expectedLot}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Expiry: </span>
                  <span className="font-medium">{activeRun.expectedExpiry}</span>
                </div>
                <div className="ml-auto flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  ACTIVE
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Counters */}
          <div className="flex gap-3 flex-wrap">
            <StatCard
              icon={<Package className="w-4 h-4" />}
              label="Scanned"
              value={activeRun.totalScanned}
              color="text-muted-foreground"
            />
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Pass"
              value={activeRun.totalPass}
              color="text-green-600"
            />
            <StatCard
              icon={<XCircle className="w-4 h-4" />}
              label="Fail"
              value={activeRun.totalFail}
              color="text-red-600"
            />
            <StatCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Hold"
              value={activeRun.totalHold}
              color="text-yellow-600"
            />
            <StatCard
              icon={<Percent className="w-4 h-4" />}
              label="Pass Rate"
              value={passRate != null ? `${passRate}%` : "—"}
              color={
                passRate == null
                  ? "text-muted-foreground"
                  : passRate >= 98
                  ? "text-green-600"
                  : passRate >= 95
                  ? "text-yellow-600"
                  : "text-red-600"
              }
            />
          </div>

          {/* Rolling scan feed */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  Live Scan Feed
                  <Badge variant="secondary" className="text-xs">{scans.length} shown</Badge>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowScans(!showScans)}
                  className="gap-1 text-xs"
                >
                  {showScans ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showScans ? "Hide" : "Show"}
                </Button>
              </div>
            </CardHeader>
            {showScans && (
              <CardContent className="px-0 pb-0">
                <div
                  ref={scanListRef}
                  className="overflow-y-auto max-h-[400px]"
                >
                  {scans.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      Waiting for cartons…
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background border-b">
                        <tr className="text-left text-muted-foreground text-xs uppercase">
                          <th className="px-4 py-2 font-medium">Time</th>
                          <th className="px-4 py-2 font-medium">Carton ID</th>
                          <th className="px-4 py-2 font-medium">GTIN</th>
                          <th className="px-4 py-2 font-medium">Lot</th>
                          <th className="px-4 py-2 font-medium">Expiry</th>
                          <th className="px-4 py-2 font-medium">Confidence</th>
                          <th className="px-4 py-2 font-medium">Verdict</th>
                          <th className="px-4 py-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scans.map((scan) => (
                          <tr
                            key={scan.id}
                            className={`border-b last:border-0 ${
                              scan.verdict === "fail"
                                ? "bg-red-50 dark:bg-red-950/20"
                                : scan.verdict === "hold"
                                ? "bg-yellow-50 dark:bg-yellow-950/20"
                                : ""
                            }`}
                          >
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                              {new Date(scan.scannedAt).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">
                              {scan.cartonId.slice(0, 8)}…
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{scan.scannedGtin ?? "—"}</td>
                            <td className="px-4 py-2 font-mono text-xs">{scan.scannedLot ?? "—"}</td>
                            <td className="px-4 py-2 text-xs">
                              {scan.scannedExpiry
                                ? `${scan.scannedExpiry.slice(0, 4)}-${scan.scannedExpiry.slice(4, 6)}-${scan.scannedExpiry.slice(6, 8)}`
                                : "—"}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              {scan.confidence != null
                                ? `${(Number(scan.confidence) * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                            <td className="px-4 py-2">
                              <VerdictBadge verdict={scan.verdict as Verdict} />
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">
                              {scan.failReason
                                ? FAIL_REASON_LABELS[scan.failReason] ?? scan.failReason
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}

      {/* Dialogs */}
      <StartRunDialog
        open={showStartDialog}
        onClose={() => setShowStartDialog(false)}
        onStarted={() => {
          setShowStartDialog(false);
          refetchRun();
        }}
      />
      {activeRun && (
        <ManualScanDialog
          open={showManualScan}
          runId={activeRun.runId}
          onClose={() => setShowManualScan(false)}
          onScanned={() => {
            refetchRun();
            refetchScans();
          }}
        />
      )}
    </div>
  );
}
