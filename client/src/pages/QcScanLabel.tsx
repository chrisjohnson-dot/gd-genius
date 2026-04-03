import { useState, useRef, useEffect, useCallback } from "react";
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
  ClipboardList,
  XCircle,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
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

type Phase = "setup" | "scanning" | "stopped" | "complete";

// ─── Setup Screen ──────────────────────────────────────────────────────────

function SetupScreen({
  onStart,
}: {
  onStart: (opts: { orderRef: string; clientName: string; expectedCartons: number | undefined; printerIp: string; printerPort: number }) => void;
}) {
  const { data: settings } = trpc.labelScan.getSettings.useQuery();
  const [orderRef, setOrderRef] = useState("");
  const [clientName, setClientName] = useState("");
  const [expectedCartons, setExpectedCartons] = useState("");
  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");

  useEffect(() => {
    if (settings) {
      setPrinterIp(settings.printerIp ?? "");
      setPrinterPort(String(settings.printerPort ?? 9100));
    }
  }, [settings]);

  function handleStart() {
    if (!orderRef.trim()) {
      toast.error("Order reference is required");
      return;
    }
    const port = parseInt(printerPort, 10);
    onStart({
      orderRef: orderRef.trim(),
      clientName: clientName.trim(),
      expectedCartons: expectedCartons ? parseInt(expectedCartons, 10) : undefined,
      printerIp: printerIp.trim(),
      printerPort: isNaN(port) ? 9100 : port,
    });
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
          <Tag className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">QC Scan &amp; Label</h1>
        <p className="text-muted-foreground text-sm">
          Scan carton barcodes on the automated line. The app will match each barcode to its label file and dispatch ZPL to the print-and-apply machine.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="orderRef">Order Reference *</Label>
            <Input
              id="orderRef"
              placeholder="e.g. PO-4821"
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientName">Client Name</Label>
            <Input
              id="clientName"
              placeholder="e.g. Walmart"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedCartons">Expected Carton Count</Label>
            <Input
              id="expectedCartons"
              type="number"
              min="1"
              placeholder="Optional"
              value={expectedCartons}
              onChange={(e) => setExpectedCartons(e.target.value)}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="printerIp">Printer IP</Label>
              <Input
                id="printerIp"
                placeholder="192.168.1.50"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="printerPort">Port</Label>
              <Input
                id="printerPort"
                placeholder="9100"
                value={printerPort}
                onChange={(e) => setPrinterPort(e.target.value)}
              />
            </div>
          </div>
          {!printerIp && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              No printer IP — configure in Label Scan Settings or enter above
            </p>
          )}
        </CardContent>
      </Card>

      <Button className="w-full gap-2" size="lg" onClick={handleStart}>
        <Play className="h-4 w-4" />
        Start Session
      </Button>
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
  const resolveMutation = trpc.labelScan.resolveException.useMutation({
    onSuccess: () => {
      toast.success("Exception resolved — line resumed");
      onResolved();
    },
    onError: (err) => toast.error(`Failed to resolve: ${err.message}`),
  });

  return (
    <div className="fixed inset-0 bg-red-600 flex flex-col items-center justify-center z-50 p-6">
      <div className="max-w-lg w-full space-y-6 text-white text-center">
        {/* Big error icon */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <XCircle className="h-14 w-14 text-white" />
          </div>
        </div>

        {/* Error heading */}
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight">LINE STOPPED</h1>
          <p className="text-xl font-semibold opacity-90">
            {exception?.reason === "no_label"
              ? "No Label Found"
              : "Label Dispatch Failed"}
          </p>
        </div>

        {/* Details card */}
        <div className="bg-white/15 rounded-xl p-5 text-left space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Scanned Barcode</p>
            <p className="text-2xl font-mono font-bold mt-0.5">{exception?.barcode}</p>
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

        {/* Resume button */}
        <Button
          size="lg"
          variant="secondary"
          className="w-full gap-2 bg-white text-red-600 hover:bg-white/90 font-bold text-base"
          disabled={resolveMutation.isPending}
          onClick={() =>
            resolveMutation.mutate({
              sessionId,
              cartonId,
              resolvedBy: user?.name ?? "Supervisor",
            })
          }
        >
          {resolveMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ShieldCheck className="h-5 w-5" />
          )}
          Resume Line
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
  expectedCartons,
  onLineStopped,
  onComplete,
}: {
  sessionId: number;
  orderRef: string;
  clientName: string;
  expectedCartons: number | undefined;
  onLineStopped: (result: ScanResult) => void;
  onComplete: () => void;
}) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
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
        labelFilename: "labelFile" in data && data.labelFile ? data.labelFile.filename : undefined,
        labelType: "labelFile" in data && data.labelFile ? data.labelFile.labelType : undefined,
        exception: "exception" in data ? data.exception : undefined,
        timestamp: new Date(),
      };
      setScanHistory((prev) => [result, ...prev]);
      setBarcodeInput("");
      setIsScanning(false);

      if (data.lineStopped) {
        onLineStopped(result);
      } else {
        toast.success(`Label dispatched for ${barcodeInput.trim()}`);
        // Refocus for next scan
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    onError: (err) => {
      toast.error(`Scan error: ${err.message}`);
      setIsScanning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: sessionData } = trpc.labelScan.getSession.useQuery(
    { sessionId },
    { refetchInterval: 5000 }
  );
  const session = sessionData?.session;

  function handleScan() {
    const barcode = barcodeInput.trim();
    if (!barcode) return;
    setIsScanning(true);
    scanMutation.mutate({ sessionId, barcode });
  }

  const scanned = session?.scannedCount ?? scanHistory.length;
  const dispatched = session?.dispatchedCount ?? scanHistory.filter((s) => s.success).length;
  const exceptions = session?.exceptionCount ?? scanHistory.filter((s) => !s.success).length;

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            QC Scan &amp; Label
          </h1>
          <p className="text-sm text-muted-foreground">
            {orderRef}{clientName ? ` — ${clientName}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => completeMutation.mutate({ sessionId })}
          disabled={completeMutation.isPending}
        >
          <StopCircle className="h-4 w-4" />
          Complete
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center p-3">
          <p className="text-2xl font-bold">{scanned}</p>
          <p className="text-xs text-muted-foreground">Scanned</p>
          {expectedCartons && (
            <p className="text-xs text-muted-foreground">of {expectedCartons}</p>
          )}
        </Card>
        <Card className="text-center p-3 border-green-200 bg-green-50 dark:bg-green-950/20">
          <p className="text-2xl font-bold text-green-600">{dispatched}</p>
          <p className="text-xs text-muted-foreground">Dispatched</p>
        </Card>
        <Card className="text-center p-3 border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="text-2xl font-bold text-red-600">{exceptions}</p>
          <p className="text-xs text-muted-foreground">Exceptions</p>
        </Card>
      </div>

      {/* Scan input */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <Label htmlFor="barcodeInput" className="text-sm font-medium">
            Scan or enter carton barcode
          </Label>
          <div className="flex gap-2">
            <Input
              id="barcodeInput"
              ref={inputRef}
              placeholder="Waiting for scan..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              className="font-mono text-lg h-12"
              disabled={isScanning}
              autoComplete="off"
            />
            <Button
              onClick={handleScan}
              disabled={!barcodeInput.trim() || isScanning}
              className="h-12 px-5 gap-2"
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanBarcode className="h-4 w-4" />
              )}
              Scan
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Press Enter or click Scan after each barcode. On an automated line, the scanner fires automatically.
          </p>
        </CardContent>
      </Card>

      {/* Scan history */}
      {scanHistory.length > 0 && (
        <Card className="flex-1 min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Scan History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-64">
              <div className="px-4 pb-4 space-y-2">
                {scanHistory.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-2.5 rounded-lg text-sm ${
                      s.success
                        ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                    }`}
                  >
                    {s.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-medium truncate">{s.barcode}</p>
                      {s.success ? (
                        <p className="text-xs text-muted-foreground">
                          Label dispatched{s.labelFilename ? ` — ${s.labelFilename}` : ""}
                          {s.labelType ? ` (${s.labelType.toUpperCase()})` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-red-600">{s.exception?.detail}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {s.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Complete Screen ───────────────────────────────────────────────────────

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
    <div className="max-w-lg mx-auto p-6 space-y-6 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30">
        <CheckCircle2 className="h-9 w-9 text-green-600" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Session Complete</h1>
        <p className="text-muted-foreground mt-1">{orderRef}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Card className="p-3">
          <p className="text-2xl font-bold">{session?.scannedCount ?? cartons.length}</p>
          <p className="text-xs text-muted-foreground">Total Scanned</p>
        </Card>
        <Card className="p-3 border-green-200 bg-green-50 dark:bg-green-950/20">
          <p className="text-2xl font-bold text-green-600">{session?.dispatchedCount ?? cartons.filter((c) => c.dispatched).length}</p>
          <p className="text-xs text-muted-foreground">Labels Applied</p>
        </Card>
        <Card className="p-3 border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="text-2xl font-bold text-red-600">{session?.exceptionCount ?? cartons.filter((c) => c.hasException).length}</p>
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
  const [phase, setPhase] = useState<Phase>("setup");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [orderRef, setOrderRef] = useState("");
  const [clientName, setClientName] = useState("");
  const [expectedCartons, setExpectedCartons] = useState<number | undefined>();
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

  function handleStart(opts: {
    orderRef: string;
    clientName: string;
    expectedCartons: number | undefined;
    printerIp: string;
    printerPort: number;
  }) {
    setOrderRef(opts.orderRef);
    setClientName(opts.clientName);
    setExpectedCartons(opts.expectedCartons);
    startMutation.mutate({
      orderRef: opts.orderRef,
      clientName: opts.clientName || undefined,
      expectedCartons: opts.expectedCartons,
      printerIp: opts.printerIp || undefined,
      printerPort: opts.printerPort,
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
    setPhase("setup");
    setSessionId(null);
    setOrderRef("");
    setClientName("");
    setExpectedCartons(undefined);
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

  if (phase === "setup") {
    return <SetupScreen onStart={handleStart} />;
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

  if (phase === "scanning" && sessionId) {
    return (
      <ScanningScreen
        sessionId={sessionId}
        orderRef={orderRef}
        clientName={clientName}
        expectedCartons={expectedCartons}
        onLineStopped={handleLineStopped}
        onComplete={handleComplete}
      />
    );
  }

  if (phase === "complete" && sessionId) {
    return (
      <CompleteScreen
        sessionId={sessionId}
        orderRef={orderRef}
        onNewSession={handleNewSession}
      />
    );
  }

  return null;
}
