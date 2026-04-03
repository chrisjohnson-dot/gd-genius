import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanBarcode,
  Play,
  StopCircle,
  RefreshCw,
  Package,
  Tag,
  XCircle,
  ShieldCheck,
  AlertCircle,
  FileText,
  Building2,
  Hash,
  Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ─────────────────────────────────────────────────────────────────

type ScanResult = {
  cartonId: number;
  barcode: string;
  success: boolean;
  lineStopped: boolean;
  labelFilename?: string;
  labelType?: string;
  exception?: {
    reason: "no_label" | "dispatch_failed";
    barcode: string;
    detail: string;
  };
  timestamp: Date;
};

type OrderInfo = {
  transactionId: string;
  orderRef: string;
  clientName: string;
  expectedCartons?: number;
  poNum?: string;
  shipToName?: string;
};

type Phase = "packsheet" | "confirm" | "scanning" | "stopped" | "complete";

// ─── Pack Sheet Scan Screen ─────────────────────────────────────────────────

function PackSheetScanScreen({
  onOrderFound,
}: {
  onOrderFound: (info: OrderInfo) => void;
}) {
  const { data: settings } = trpc.labelScan.getSettings.useQuery();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookupMutation = trpc.labelScan.lookupOrderByTransactionId.useMutation({
    onSuccess: (data) => {
      setError(null);
      onOrderFound(data);
    },
    onError: (err) => {
      setError(err.message);
      setInput("");
      inputRef.current?.focus();
    },
  });

  useEffect(() => {
    // Auto-focus the input when the screen mounts
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  function handleScan() {
    const val = input.trim();
    if (!val) return;
    setError(null);
    lookupMutation.mutate({ transactionId: val });
  }

  const printerConfigured = !!(settings?.printerIp);

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
          <FileText className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">QC Scan &amp; Label</h1>
        <p className="text-muted-foreground text-sm">
          Scan the barcode on the <strong>pack sheet</strong> to identify the order and start the session.
        </p>
      </div>

      {!printerConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No printer IP configured. Set it in <strong>Label Scan Settings</strong> before starting.</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScanBarcode className="h-4 w-4" />
            Scan Pack Sheet Barcode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="packsheet">Extensiv Transaction ID</Label>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                id="packsheet"
                placeholder="Scan or type transaction ID…"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                disabled={lookupMutation.isPending}
                className={error ? "border-red-400 focus-visible:ring-red-400" : ""}
              />
              <Button
                onClick={handleScan}
                disabled={!input.trim() || lookupMutation.isPending}
                className="shrink-0"
              >
                {lookupMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanBarcode className="h-4 w-4" />
                )}
              </Button>
            </div>
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The transaction ID is printed as a barcode on the GD Wizard pack sheet.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Order Confirm Screen ───────────────────────────────────────────────────

function OrderConfirmScreen({
  orderInfo,
  onConfirm,
  onBack,
}: {
  orderInfo: OrderInfo;
  onConfirm: (printerIp: string, printerPort: number) => void;
  onBack: () => void;
}) {
  const { data: settings } = trpc.labelScan.getSettings.useQuery();
  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");

  useEffect(() => {
    if (settings) {
      setPrinterIp(settings.printerIp ?? "");
      setPrinterPort(String(settings.printerPort ?? 9100));
    }
  }, [settings]);

  function handleConfirm() {
    const port = parseInt(printerPort, 10);
    onConfirm(printerIp.trim(), isNaN(port) ? 9100 : port);
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div className="text-center space-y-1">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 mb-2">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h1 className="text-xl font-bold">Order Found</h1>
        <p className="text-muted-foreground text-sm">Confirm the details before starting the line.</p>
      </div>

      {/* Order details */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Hash className="h-3 w-3" /> Transaction ID
              </p>
              <p className="font-mono font-semibold">{orderInfo.transactionId}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <FileText className="h-3 w-3" /> Order Ref
              </p>
              <p className="font-semibold">{orderInfo.orderRef}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Client
              </p>
              <p className="font-semibold">{orderInfo.clientName || "—"}</p>
            </div>
            {orderInfo.shipToName && (
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ship To</p>
                <p className="font-semibold">{orderInfo.shipToName}</p>
              </div>
            )}
            {orderInfo.poNum && (
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PO #</p>
                <p className="font-semibold">{orderInfo.poNum}</p>
              </div>
            )}
            {orderInfo.expectedCartons !== undefined && (
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Boxes className="h-3 w-3" /> Expected Cartons
                </p>
                <p className="font-semibold">{orderInfo.expectedCartons}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Printer settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Print-and-Apply Machine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="printerIp" className="text-xs">Printer IP</Label>
              <Input
                id="printerIp"
                placeholder="192.168.1.50"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="printerPort" className="text-xs">Port</Label>
              <Input
                id="printerPort"
                placeholder="9100"
                value={printerPort}
                onChange={(e) => setPrinterPort(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          {!printerIp && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              No printer IP — the line will run but labels won't dispatch
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1 gap-2" onClick={handleConfirm}>
          <Play className="h-4 w-4" />
          Start Line
        </Button>
      </div>
    </div>
  );
}

// ─── Exception (Line Stopped) Screen ──────────────────────────────────────

function LineStoppedScreen({
  exception,
  sessionId,
  cartonId,
  onResolved,
}: {
  exception: ScanResult["exception"];
  sessionId: number;
  cartonId: number;
  onResolved: () => void;
}) {
  const { user } = useAuth();
  const [retryStatus, setRetryStatus] = useState<"idle" | "retrying" | "success" | "failed">("idle");
  const [retryErrorMsg, setRetryErrorMsg] = useState<string | null>(null);

  const resolveMutation = trpc.labelScan.resolveException.useMutation({
    onMutate: () => setRetryStatus("retrying"),
    onSuccess: (data) => {
      if (data.retryAttempted) {
        if (data.retryDispatched) {
          setRetryStatus("success");
          toast.success("Label re-dispatched successfully — line resumed");
        } else {
          setRetryStatus("failed");
          setRetryErrorMsg(data.retryError ?? "Retry dispatch failed");
          toast.error(`Retry failed: ${data.retryError ?? "Unknown error"}`);
        }
      } else {
        toast.success("Exception resolved — line resumed");
      }
      // Always resume the UI regardless of retry outcome
      setTimeout(() => onResolved(), data.retryAttempted && !data.retryDispatched ? 2500 : 800);
    },
    onError: (err) => {
      setRetryStatus("idle");
      toast.error(`Failed to resolve: ${err.message}`);
    },
  });

  return (
    <div className="fixed inset-0 bg-red-600 flex flex-col items-center justify-center z-50 p-6">
      <div className="max-w-lg w-full space-y-6 text-white text-center">
        {/* Big error icon */}
        <div className="flex justify-center">
          <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <XCircle className="h-16 w-16 text-white" />
          </div>
        </div>

        {/* Error heading */}
        <div className="space-y-2">
          <h1 className="text-5xl font-black tracking-tight">LINE STOPPED</h1>
          <p className="text-2xl font-semibold opacity-90">
            {exception?.reason === "no_label"
              ? "No Label Found"
              : "Label Dispatch Failed"}
          </p>
        </div>

        {/* Details card */}
        <div className="bg-white/15 rounded-xl p-5 text-left space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Scanned Barcode</p>
            <p className="text-3xl font-mono font-bold mt-0.5">{exception?.barcode}</p>
          </div>
          <Separator className="bg-white/20" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Reason</p>
            <p className="text-sm mt-0.5 leading-relaxed">{exception?.detail}</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white/10 rounded-xl p-4 text-sm text-left space-y-1">
          <p className="font-semibold">Supervisor action required:</p>
          {exception?.reason === "no_label" ? (
            <ol className="list-decimal list-inside space-y-1 opacity-90">
              <li>Locate the correct ZPL label file for barcode <strong>{exception.barcode}</strong></li>
              <li>Upload it via the Label Files page (or wait for the sync agent)</li>
              <li>Click "Resume Line" below</li>
            </ol>
          ) : (
            <ol className="list-decimal list-inside space-y-1 opacity-90">
              <li>Check that the print-and-apply machine is powered on and connected</li>
              <li>Verify the IP address in Label Scan Settings</li>
              <li>Click "Resume Line" to retry</li>
            </ol>
          )}
        </div>

        {/* Retry status feedback */}
        {retryStatus === "retrying" && (
          <div className="bg-white/15 rounded-xl p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" />
            <p className="text-sm font-medium">Re-dispatching label to printer…</p>
          </div>
        )}
        {retryStatus === "success" && (
          <div className="bg-green-500/30 border border-green-300/40 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-200" />
            <p className="text-sm font-medium">Label re-dispatched — resuming line…</p>
          </div>
        )}
        {retryStatus === "failed" && (
          <div className="bg-white/15 rounded-xl p-4 text-left space-y-1">
            <p className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Retry dispatch failed
            </p>
            <p className="text-xs opacity-80">{retryErrorMsg}</p>
            <p className="text-xs opacity-70">The exception is resolved and the line will resume, but this carton may need its label applied manually.</p>
          </div>
        )}

        {/* Resume button */}
        <Button
          size="lg"
          variant="secondary"
          className="w-full gap-2 bg-white text-red-600 hover:bg-white/90 font-bold text-lg"
          disabled={resolveMutation.isPending || retryStatus === "success"}
          onClick={() =>
            resolveMutation.mutate({
              sessionId,
              cartonId,
              resolvedBy: user?.name ?? "Supervisor",
            })
          }
        >
          {retryStatus === "retrying" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : retryStatus === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <ShieldCheck className="h-5 w-5" />
          )}
          {retryStatus === "retrying" ? "Dispatching…" : retryStatus === "success" ? "Resuming…" : "Resume Line"}
        </Button>
      </div>
    </div>
  );
}

// ─── Scanning Screen ───────────────────────────────────────────────────────

function ScanningScreen({
  sessionId,
  orderRef,
  clientName,
  transactionId,
  expectedCartons,
  onLineStopped,
  onComplete,
}: {
  sessionId: number;
  orderRef: string;
  clientName: string;
  transactionId: string;
  expectedCartons: number | undefined;
  onLineStopped: (result: ScanResult) => void;
  onComplete: () => void;
}) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const completeMutation = trpc.labelScan.completeSession.useMutation({
    onSuccess: () => {
      toast.success("Session completed");
      onComplete();
    },
  });

  const scanMutation = trpc.labelScan.scanCarton.useMutation({
    onSuccess: (data) => {
      const result: ScanResult = {
        cartonId: data.cartonId,
        barcode: barcodeInput.trim(),
        success: data.success,
        lineStopped: data.lineStopped,
        labelFilename: (data as any).labelFile?.filename,
        labelType: (data as any).labelFile?.labelType,
        exception: (data as any).exception,
        timestamp: new Date(),
      };
      setScanHistory((prev) => [result, ...prev]);
      setBarcodeInput("");
      if (data.lineStopped) {
        onLineStopped(result);
      } else {
        toast.success(`Label dispatched — ${result.barcode}`, { duration: 1500 });
      }
      // Re-focus for next scan
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    onError: (err) => {
      toast.error(`Scan error: ${err.message}`);
      setBarcodeInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  function handleScan() {
    const val = barcodeInput.trim();
    if (!val || scanMutation.isPending) return;
    scanMutation.mutate({ sessionId, barcode: val });
  }

  const dispatched = scanHistory.filter((s) => s.success).length;
  const exceptions = scanHistory.filter((s) => !s.success).length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            Line Active
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orderRef} {clientName && `· ${clientName}`}
          </p>
          <p className="text-xs text-muted-foreground font-mono">TX {transactionId}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => completeMutation.mutate({ sessionId })}
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <StopCircle className="h-3.5 w-3.5" />
          )}
          End Session
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-2">
          <p className="text-xl font-bold">{scanHistory.length}</p>
          <p className="text-xs text-muted-foreground">Scanned</p>
        </Card>
        <Card className="p-2 border-green-200 bg-green-50 dark:bg-green-950/20">
          <p className="text-xl font-bold text-green-600">{dispatched}</p>
          <p className="text-xs text-muted-foreground">Dispatched</p>
        </Card>
        <Card className="p-2 border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="text-xl font-bold text-red-600">{exceptions}</p>
          <p className="text-xs text-muted-foreground">Exceptions</p>
        </Card>
      </div>

      {/* Manual scan input (for testing / fallback) */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Manual / Fallback Scan
          </p>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Barcode auto-received from vision system…"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              disabled={scanMutation.isPending}
              className="font-mono"
            />
            <Button
              onClick={handleScan}
              disabled={!barcodeInput.trim() || scanMutation.isPending}
              className="shrink-0"
            >
              {scanMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanBarcode className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The vision system sends barcodes automatically via <code className="bg-muted px-1 rounded text-xs">POST /api/scan</code>. Use this input for manual testing.
          </p>
        </CardContent>
      </Card>

      {/* Scan history */}
      {scanHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Recent Scans</CardTitle>
          </CardHeader>
          <ScrollArea className="h-64">
            <div className="px-4 pb-3 space-y-1.5">
              {scanHistory.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    s.success
                      ? "bg-green-50 dark:bg-green-950/20"
                      : "bg-red-50 dark:bg-red-950/20"
                  }`}
                >
                  {s.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span className="font-mono font-medium flex-1">{s.barcode}</span>
                  {s.labelFilename && (
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {s.labelFilename}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {s.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

// ─── Complete Screen ────────────────────────────────────────────────────────

function CompleteScreen({
  sessionId,
  orderRef,
  onNewSession,
}: {
  sessionId: number;
  orderRef: string;
  onNewSession: () => void;
}) {
  const { data } = trpc.labelScan.getSession.useQuery({ sessionId });
  const session = data?.session;
  const cartons = data?.cartons ?? [];

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-2">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold">Session Complete</h1>
        <p className="text-muted-foreground">{orderRef}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Card className="p-3">
          <p className="text-2xl font-bold">{session?.scannedCount ?? cartons.length}</p>
          <p className="text-xs text-muted-foreground">Total Scanned</p>
        </Card>
        <Card className="p-3 border-green-200 bg-green-50 dark:bg-green-950/20">
          <p className="text-2xl font-bold text-green-600">
            {session?.dispatchedCount ?? cartons.filter((c) => c.dispatched).length}
          </p>
          <p className="text-xs text-muted-foreground">Labels Applied</p>
        </Card>
        <Card className="p-3 border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="text-2xl font-bold text-red-600">
            {session?.exceptionCount ?? cartons.filter((c) => c.hasException).length}
          </p>
          <p className="text-xs text-muted-foreground">Exceptions</p>
        </Card>
      </div>

      <Button className="w-full gap-2" onClick={onNewSession}>
        <RefreshCw className="h-4 w-4" />
        Start New Session
      </Button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function QcScanLabel() {
  const [phase, setPhase] = useState<Phase>("packsheet");
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [stoppedResult, setStoppedResult] = useState<ScanResult | null>(null);

  const startMutation = trpc.labelScan.startSession.useMutation({
    onSuccess: (data) => {
      if (data.session) {
        setSessionId(data.session.id);
        setPhase("scanning");
      }
    },
    onError: (err) => toast.error(`Failed to start session: ${err.message}`),
  });

  function handleOrderFound(info: OrderInfo) {
    setOrderInfo(info);
    setPhase("confirm");
  }

  function handleConfirm(printerIp: string, printerPort: number) {
    if (!orderInfo) return;
    startMutation.mutate({
      orderRef: orderInfo.orderRef,
      clientName: orderInfo.clientName || undefined,
      expectedCartons: orderInfo.expectedCartons,
      printerIp: printerIp || undefined,
      printerPort,
      extensivTransactionId: orderInfo.transactionId,
    });
  }

  function handleLineStopped(result: ScanResult) {
    setStoppedResult(result);
    setPhase("stopped");
  }

  function handleExceptionResolved() {
    setStoppedResult(null);
    setPhase("scanning");
  }

  function handleComplete() {
    setPhase("complete");
  }

  function handleNewSession() {
    setPhase("packsheet");
    setSessionId(null);
    setOrderInfo(null);
    setStoppedResult(null);
  }

  if (startMutation.isPending) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Starting session…</span>
      </div>
    );
  }

  if (phase === "packsheet") {
    return <PackSheetScanScreen onOrderFound={handleOrderFound} />;
  }

  if (phase === "confirm" && orderInfo) {
    return (
      <OrderConfirmScreen
        orderInfo={orderInfo}
        onConfirm={handleConfirm}
        onBack={() => setPhase("packsheet")}
      />
    );
  }

  if (phase === "stopped" && stoppedResult && sessionId) {
    return (
      <LineStoppedScreen
        exception={stoppedResult.exception}
        sessionId={sessionId}
        cartonId={stoppedResult.cartonId}
        onResolved={handleExceptionResolved}
      />
    );
  }

  if (phase === "scanning" && sessionId && orderInfo) {
    return (
      <ScanningScreen
        sessionId={sessionId}
        orderRef={orderInfo.orderRef}
        clientName={orderInfo.clientName}
        transactionId={orderInfo.transactionId}
        expectedCartons={orderInfo.expectedCartons}
        onLineStopped={handleLineStopped}
        onComplete={handleComplete}
      />
    );
  }

  if (phase === "complete" && sessionId && orderInfo) {
    return (
      <CompleteScreen
        sessionId={sessionId}
        orderRef={orderInfo.orderRef}
        onNewSession={handleNewSession}
      />
    );
  }

  return null;
}
