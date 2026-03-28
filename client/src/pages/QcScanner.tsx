import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ScanBarcode, CheckCircle2, AlertTriangle, Flag, Plus, Minus,
  Package, Layers, ClipboardList, ChevronRight, RefreshCw, Download, X
} from "lucide-react";

type ScanItem = {
  id: number;
  sku: string;
  upc: string | null;
  description: string | null;
  expectedQty: number;
  scannedQty: number;
  caseAmount: number;
  lotNumber?: string | null;
  locationName?: string | null;
};

type Pallet = {
  id: number;
  palletNumber: number;
  items: Array<{ sku: string; upc?: string; qty: number }> | null;
};

type Session = {
  id: number;
  referenceNumber: string;
  status: string;
  customerName: string | null;
  warehouseName: string | null;
  poNumber: string | null;
  completedAt: Date | null;
};

type Phase = "start" | "scanning" | "complete";

function playBeep(type: "success" | "error" | "complete") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "success") {
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "error") {
      osc.frequency.value = 220;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // complete — two ascending tones
      const osc2 = ctx.createOscillator();
      osc2.connect(gain);
      osc.frequency.value = 660;
      osc2.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      osc2.start(ctx.currentTime + 0.25);
      osc2.stop(ctx.currentTime + 0.5);
    }
  } catch {
    // Audio not available — silently ignore
  }
}

// ─── Pack-sheet-style item table ──────────────────────────────────────────────

function ItemsTableSkeleton() {
  const cols = "150px 120px 1fr 110px 100px 110px 40px";
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      {/* Header */}
      <div
        className="grid text-white text-xs font-bold uppercase tracking-wide"
        style={{ gridTemplateColumns: cols, background: "#15527f", padding: "0 8px", height: 34, alignItems: "center" }}
      >
        <span>Location</span>
        <span>SKU</span>
        <span>Description</span>
        <span>Lot #</span>
        <span className="text-right">Expected</span>
        <span className="text-right pr-2">Scanned</span>
        <span />
      </div>
      {/* Skeleton rows */}
      {Array.from({ length: 5 }).map((_, idx) => (
        <div
          key={idx}
          className="grid items-center border-b border-[#CDD4DC] last:border-0"
          style={{
            gridTemplateColumns: cols,
            background: idx % 2 === 1 ? "#EEF4FB" : "#ffffff",
            minHeight: 40,
            padding: "6px 8px",
          }}
        >
          {["w-20", "w-16", "w-32", "w-14", "w-8", "w-8"].map((w, ci) => (
            <div key={ci} className={`h-3 rounded bg-gray-200 animate-pulse ${w} ${ci >= 4 ? "ml-auto" : ""}`} />
          ))}
          <div />
        </div>
      ))}
      {/* Skeleton footer */}
      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: cols,
          background: "#EDFAEB",
          borderTop: "2px solid #CDD4DC",
          padding: "6px 8px",
        }}
      >
        <div className="h-3 w-10 rounded bg-gray-200 animate-pulse col-span-4" />
        <div className="h-3 w-8 rounded bg-gray-200 animate-pulse ml-auto" />
        <div className="h-3 w-8 rounded bg-gray-200 animate-pulse ml-auto" />
        <div />
      </div>
    </div>
  );
}

function ItemsTable({
  items,
  phase,
  sessionId,
  adjustQty,
  isLoading,
}: {
  items: ScanItem[];
  phase: Phase;
  sessionId: number;
  adjustQty: ReturnType<typeof trpc.qcScanner.adjustQty.useMutation>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <ItemsTableSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>No items loaded. Scan a barcode to add items, or seed from Extensiv order data.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      {/* Table header — dark navy, matching pack sheet */}
      <div
        className="grid text-white text-xs font-bold uppercase tracking-wide"
        style={{
          gridTemplateColumns: "150px 120px 1fr 110px 100px 110px 40px",
          background: "#15527f",
          padding: "0 8px",
          height: 34,
          alignItems: "center",
        }}
      >
        <span>Location</span>
        <span>SKU</span>
        <span>Description</span>
        <span>Lot #</span>
        <span className="text-right">Expected</span>
        <span className="text-right pr-2">Scanned</span>
        <span />
      </div>

      {/* Rows */}
      {items.map((item, idx) => {
        const done = item.scannedQty >= item.expectedQty;
        const over = item.scannedQty > item.expectedQty;
        const isAlt = idx % 2 === 1;

        let rowBg = isAlt ? "#EEF4FB" : "#ffffff";
        if (over)  rowBg = isAlt ? "#fef3c7" : "#fffbeb";
        if (done && !over) rowBg = isAlt ? "#dcfce7" : "#f0fdf4";

        return (
          <div
            key={item.sku}
            className="grid items-center text-sm border-b border-[#CDD4DC] last:border-0"
            style={{
              gridTemplateColumns: "150px 120px 1fr 110px 100px 110px 40px",
              background: rowBg,
              minHeight: 40,
              padding: "4px 8px",
            }}
          >
            {/* Location */}
            <div className="flex flex-col justify-center min-w-0 pr-2">
              {item.locationName ? (
                <span className="font-semibold text-[#15527f] text-xs truncate">
                  {item.locationName}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
              {item.upc && (
                <span className="text-[10px] text-muted-foreground font-mono truncate">
                  UPC: {item.upc}
                </span>
              )}
            </div>

            {/* SKU */}
            <div className="font-mono text-xs text-[#333333] truncate pr-2">
              {item.sku}
            </div>

            {/* Description */}
            <div className="text-xs text-[#333333] truncate pr-2">
              {item.description ?? "—"}
            </div>

            {/* Lot # */}
            <div className="text-xs font-mono pr-2">
              {item.lotNumber ? (
                <span className="text-[#333333]">{item.lotNumber}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>

            {/* Expected qty — right-aligned */}
            <div className="text-right font-semibold text-sm text-[#333333] pr-2">
              {item.expectedQty}
            </div>

            {/* Scanned qty with +/- controls — right-aligned */}
            <div className="flex items-center justify-end gap-1">
              {phase === "scanning" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  disabled={item.scannedQty <= 0}
                  onClick={() => adjustQty.mutate({ sessionId, sku: item.sku, delta: -1 })}
                >
                  <Minus className="w-3 h-3" />
                </Button>
              )}
              <span
                className={`font-bold text-sm w-8 text-right tabular-nums ${
                  over ? "text-amber-600" : done ? "text-green-600" : "text-[#333333]"
                }`}
              >
                {item.scannedQty}
              </span>
              {phase === "scanning" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => adjustQty.mutate({ sessionId, sku: item.sku, delta: 1 })}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              )}
            </div>

            {/* Status icon */}
            <div className="flex items-center justify-center">
              {done && !over && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {over && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            </div>
          </div>
        );
      })}

      {/* Totals footer — matching pack sheet total row */}
      <div
        className="grid items-center text-sm font-bold"
        style={{
          gridTemplateColumns: "150px 120px 1fr 110px 100px 110px 40px",
          background: "#EDFAEB",
          borderTop: "2px solid #CDD4DC",
          padding: "6px 8px",
        }}
      >
        <span className="text-xs text-[#15527f] uppercase tracking-wide col-span-4">
          Total
        </span>
        <span className="text-right text-sm text-[#333333] pr-2">
          {items.reduce((s, i) => s + i.expectedQty, 0)}
        </span>
        <span className="text-right text-sm pr-2">
          <span
            className={
              items.every((i) => i.scannedQty >= i.expectedQty)
                ? "text-green-600"
                : items.some((i) => i.scannedQty > i.expectedQty)
                ? "text-amber-600"
                : "text-[#333333]"
            }
          >
            {items.reduce((s, i) => s + i.scannedQty, 0)}
          </span>
        </span>
        <span />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function QcScanner() {
  const [phase, setPhase] = useState<Phase>("start");
  const [refInput, setRefInput] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanAsCase, setScanAsCase] = useState(false);
  const [lastScan, setLastScan] = useState<{ sku: string; found: boolean } | null>(null);
  const [flagDialog, setFlagDialog] = useState(false);
  const [flagBarcode, setFlagBarcode] = useState("");
  const [flagDesc, setFlagDesc] = useState("");
  const [completeDialog, setCompleteDialog] = useState(false);
  const [activePalletTab, setActivePalletTab] = useState("0");
  const [extensivLoadError, setExtensivLoadError] = useState<string | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const fetchFromExtensiv = trpc.qcScanner.fetchFromExtensiv.useMutation({
    onSuccess: (data) => {
      setExtensivLoadError(null);
      setItems(data.items as ScanItem[]);
      if (data.customerName && session) setSession((s) => s ? { ...s, customerName: data.customerName } : s);
      if (data.poNumber && session) setSession((s) => s ? { ...s, poNumber: data.poNumber } : s);
      toast.success(`Loaded ${data.seededCount} item${data.seededCount !== 1 ? "s" : ""} from Extensiv`, {
        description: data.customerName ? `Customer: ${data.customerName}` : undefined,
      });
      setTimeout(() => barcodeRef.current?.focus(), 100);
    },
    onError: (e) => {
      setExtensivLoadError(e.message);
    },
  });

  const startSession = trpc.qcScanner.startSession.useMutation({
    onSuccess: (data) => {
      const sess = data.session as Session;
      setSession(sess);
      setItems((data.items as ScanItem[]) ?? []);
      setPallets((data.pallets as Pallet[]) ?? []);
      setPhase("scanning");
      if (data.resumed) {
        toast.info(`Resumed session for ${sess?.referenceNumber}`);
        setTimeout(() => barcodeRef.current?.focus(), 100);
      } else {
        toast.success(`Session started for ${sess?.referenceNumber}`);
        // Auto-load items and lot numbers from Extensiv for new sessions
        if (sess?.id && sess?.referenceNumber) {
          fetchFromExtensiv.mutate({ sessionId: sess.id, referenceNumber: sess.referenceNumber });
        } else {
          setTimeout(() => barcodeRef.current?.focus(), 100);
        }
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const scanBarcode = trpc.qcScanner.scanBarcode.useMutation({
    onSuccess: (data) => {
      if (!data.found) {
        playBeep("error");
        setLastScan({ sku: barcodeInput, found: false });
        toast.warning("SKU/UPC not found in this order", { description: "Use the Flag button to log it." });
      } else {
        if (data.sessionComplete) {
          playBeep("complete");
          toast.success("Order complete! All items scanned.", { duration: 5000 });
        } else {
          playBeep("success");
        }
        setLastScan({ sku: data.item?.sku ?? barcodeInput, found: true });
        setItems((prev) =>
          prev.map((i) => (i.sku === data.item?.sku ? { ...i, scannedQty: data.item!.scannedQty } : i))
        );
        if (data.sessionComplete) setPhase("complete");
      }
      setBarcodeInput("");
      barcodeRef.current?.focus();
    },
    onError: (e) => {
      toast.error(e.message);
      setBarcodeInput("");
      barcodeRef.current?.focus();
    },
  });

  const adjustQty = trpc.qcScanner.adjustQty.useMutation({
    onSuccess: (data) => {
      setItems((prev) =>
        prev.map((i) => (i.sku === data.item?.sku ? { ...i, scannedQty: data.item!.scannedQty } : i))
      );
      if (data.sessionComplete) {
        playBeep("complete");
        toast.success("Order complete!");
        setPhase("complete");
      }
    },
  });

  const addPallet = trpc.qcScanner.addPallet.useMutation({
    onSuccess: (data) => {
      setPallets((prev) => [...prev, { id: data.id, palletNumber: data.palletNumber, items: [] }]);
      setActivePalletTab(String(pallets.length));
      toast.success(`Pallet ${data.palletNumber} added`);
    },
  });

  const flagScan = trpc.qcScanner.flagScan.useMutation({
    onSuccess: () => {
      toast.success("Scan flagged for review");
      setFlagDialog(false);
      setFlagBarcode("");
      setFlagDesc("");
    },
    onError: (e) => toast.error(e.message),
  });

  const completeSession = trpc.qcScanner.completeSession.useMutation({
    onSuccess: () => {
      toast.success("Session completed and saved");
      setPhase("start");
      setSession(null);
      setItems([]);
      setPallets([]);
      setRefInput("");
      setCompleteDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRefSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refInput.trim()) return;
    startSession.mutate({ referenceNumber: refInput.trim() });
  };

  const handleBarcodeSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!barcodeInput.trim() || !session) return;
      scanBarcode.mutate({ sessionId: session.id, barcode: barcodeInput.trim(), scanAsCase });
    },
    [barcodeInput, session, scanAsCase]
  );

  const handleFlag = () => {
    if (!session) return;
    flagScan.mutate({
      sessionId: session.id,
      referenceNumber: session.referenceNumber,
      upc: flagBarcode || undefined,
      description: flagDesc || undefined,
    });
  };

  const totalExpected = items.reduce((s, i) => s + i.expectedQty, 0);
  const totalScanned = items.reduce((s, i) => s + i.scannedQty, 0);
  const progress = totalExpected > 0 ? Math.min(100, Math.round((totalScanned / totalExpected) * 100)) : 0;
  const allComplete = items.length > 0 && items.every((i) => i.scannedQty >= i.expectedQty);

  useEffect(() => {
    if (phase === "scanning") {
      barcodeRef.current?.focus();
    }
  }, [phase]);

  // ─── Start Screen ──────────────────────────────────────────────────────────
  const recentSessionsQuery = trpc.qcScanner.recentSessions.useQuery(
    { limit: 5 },
    { enabled: phase === "start" }
  );

  if (phase === "start") {
    const recent = recentSessionsQuery.data?.sessions ?? [];
    return (
      <div className="flex flex-col items-center min-h-[60vh] gap-8 p-8">
        <div className="text-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mx-auto mb-4">
            <ScanBarcode className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">QC Scanner</h1>
          <p className="text-muted-foreground mt-2">Enter a reference number to start or resume a scan session</p>
        </div>
        <form onSubmit={handleRefSubmit} className="flex gap-3 w-full max-w-md">
          <Input
            ref={refInputRef}
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            placeholder="Reference number or order ID"
            className="text-lg h-12"
            autoFocus
          />
          <Button type="submit" size="lg" disabled={startSession.isPending}>
            {startSession.isPending ? "Loading…" : "Start"}
            <ChevronRight className="ml-1 w-4 h-4" />
          </Button>
        </form>

        {/* Recent Sessions panel */}
        <div className="w-full max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Recent Completed Sessions
          </h2>
          {recentSessionsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No completed sessions yet
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Table header */}
              <div
                className="grid text-white text-xs font-bold uppercase tracking-wide"
                style={{
                  gridTemplateColumns: "1fr 160px 90px 90px 90px",
                  background: "#15527f",
                  padding: "0 12px",
                  height: 32,
                  alignItems: "center",
                }}
              >
                <span>Reference</span>
                <span>Customer</span>
                <span className="text-right">Items</span>
                <span className="text-right">Expected</span>
                <span className="text-right">Scanned</span>
              </div>
              {recent.map((s, idx) => {
                const isAlt = idx % 2 === 1;
                const allScanned = s.totalScanned >= s.totalExpected && s.totalExpected > 0;
                return (
                  <button
                    key={s.id}
                    className="grid w-full text-left text-sm border-b border-[#CDD4DC] last:border-0 hover:brightness-95 transition-all"
                    style={{
                      gridTemplateColumns: "1fr 160px 90px 90px 90px",
                      background: isAlt ? "#EEF4FB" : "#ffffff",
                      minHeight: 44,
                      padding: "6px 12px",
                      alignItems: "center",
                    }}
                    onClick={() => setRefInput(s.referenceNumber)}
                    title="Click to pre-fill reference number"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-semibold text-[#15527f] truncate">{s.referenceNumber}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {s.completedAt ? new Date(s.completedAt).toLocaleString() : "—"}
                        {s.poNumber ? ` · PO: ${s.poNumber}` : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate pr-2">
                      {s.customerName ?? "—"}
                    </div>
                    <div className="text-right text-xs font-mono text-[#333333]">{s.itemCount}</div>
                    <div className="text-right text-xs font-mono text-[#333333]">{s.totalExpected}</div>
                    <div className={`text-right text-xs font-semibold font-mono ${
                      allScanned ? "text-green-600" : "text-amber-600"
                    }`}>{s.totalScanned}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Scanning / Complete Screen ────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanBarcode className="w-6 h-6 text-primary" />
            {session?.referenceNumber}
            {phase === "complete" && (
              <Badge className="bg-green-500 text-white ml-2">Complete</Badge>
            )}
          </h1>
          <div className="flex gap-3 text-sm text-muted-foreground mt-0.5 flex-wrap">
            {session?.customerName && <span>{session.customerName}</span>}
            {session?.warehouseName && <span>· {session.warehouseName}</span>}
            {session?.poNumber && <span>· PO: {session.poNumber}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!session) return;
              fetchFromExtensiv.mutate({ sessionId: session.id, referenceNumber: session.referenceNumber });
            }}
            disabled={fetchFromExtensiv.isPending}
            title="Fetch expected items and lot numbers from Extensiv"
          >
            {fetchFromExtensiv.isPending
              ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              : <Download className="w-4 h-4 mr-1 text-blue-500" />}
            {fetchFromExtensiv.isPending ? "Loading…" : "Load from Extensiv"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setFlagBarcode(""); setFlagDialog(true); }}
          >
            <Flag className="w-4 h-4 mr-1 text-amber-500" /> Flag Scan
          </Button>
          {(phase === "complete" || allComplete) ? (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setCompleteDialog(true)}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Complete Order
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setCompleteDialog(true)}>
              Complete Order
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{totalScanned} / {totalExpected} units scanned</span>
          <span>{progress}%</span>
        </div>
        <Progress
          value={progress}
          className={`h-2 ${allComplete ? "[&>div]:bg-green-500" : ""}`}
        />
      </div>

      {/* Barcode input */}
      {phase === "scanning" && (
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <Input
            ref={barcodeRef}
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            placeholder="Scan or type barcode / SKU…"
            className="text-lg h-12 font-mono"
          />
          <Button
            type="button"
            variant={scanAsCase ? "default" : "outline"}
            className="h-12 px-4 shrink-0"
            onClick={() => setScanAsCase((v) => !v)}
            title="Toggle case scan (scan one barcode = full case quantity)"
          >
            <Layers className="w-4 h-4 mr-1" />
            Case
          </Button>
          <Button type="submit" className="h-12 px-6 shrink-0" disabled={scanBarcode.isPending}>
            Scan
          </Button>
        </form>
      )}

      {/* Last scan feedback */}
      {lastScan && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
          lastScan.found
            ? "bg-green-500/10 text-green-700 dark:text-green-400"
            : "bg-red-500/10 text-red-700 dark:text-red-400"
        }`}>
          {lastScan.found
            ? <CheckCircle2 className="w-4 h-4" />
            : <AlertTriangle className="w-4 h-4" />}
          {lastScan.found ? `✓ ${lastScan.sku} scanned` : `✗ Not found: ${lastScan.sku}`}
        </div>
      )}

      {/* Main tabs: Items | Pallets */}
      <Tabs defaultValue="items" className="flex-1">
        <TabsList>
          <TabsTrigger value="items">
            <ClipboardList className="w-4 h-4 mr-1" />
            Items ({items.length})
          </TabsTrigger>
          <TabsTrigger value="pallets">
            <Package className="w-4 h-4 mr-1" />
            Pallets ({pallets.length})
          </TabsTrigger>
        </TabsList>

        {/* Items tab — pack-sheet-style table */}
        <TabsContent value="items" className="mt-3">
          {/* Extensiv load failure banner */}
          {extensivLoadError && !fetchFromExtensiv.isPending && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mb-3 text-amber-800">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Could not load items from Extensiv</p>
                <p className="text-xs mt-0.5 break-words">{extensivLoadError}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
                  onClick={() => {
                    if (session) {
                      fetchFromExtensiv.mutate({ sessionId: session.id, referenceNumber: session.referenceNumber });
                    }
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
                <button
                  className="text-amber-500 hover:text-amber-700"
                  onClick={() => setExtensivLoadError(null)}
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <ItemsTable
            items={items}
            phase={phase}
            sessionId={session!.id}
            adjustQty={adjustQty}
            isLoading={fetchFromExtensiv.isPending}
          />
        </TabsContent>

        {/* Pallets tab */}
        <TabsContent value="pallets" className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Pallets</h3>
            {phase === "scanning" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => addPallet.mutate({ sessionId: session!.id })}
                disabled={addPallet.isPending}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Pallet
              </Button>
            )}
          </div>
          {pallets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No pallets yet.</div>
          ) : (
            <Tabs value={activePalletTab} onValueChange={setActivePalletTab}>
              <TabsList className="flex-wrap h-auto gap-1">
                {pallets.map((p, idx) => (
                  <TabsTrigger key={p.id} value={String(idx)}>
                    Pallet {p.palletNumber}
                    {p.items && p.items.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">{p.items.length}</Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {pallets.map((pallet, idx) => (
                <TabsContent key={pallet.id} value={String(idx)} className="mt-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Pallet {pallet.palletNumber}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!pallet.items || pallet.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No items assigned to this pallet yet.</p>
                      ) : (
                        /* Pallet items also use pack-sheet table style */
                        <div className="rounded-lg overflow-hidden border border-border">
                          <div
                            className="grid text-white text-xs font-bold uppercase tracking-wide"
                            style={{
                              gridTemplateColumns: "1fr 80px",
                              background: "#15527f",
                              padding: "0 8px",
                              height: 30,
                              alignItems: "center",
                            }}
                          >
                            <span>SKU</span>
                            <span className="text-right">Qty</span>
                          </div>
                          {pallet.items.map((item, i) => (
                            <div
                              key={i}
                              className="grid items-center text-sm border-b border-[#CDD4DC] last:border-0"
                              style={{
                                gridTemplateColumns: "1fr 80px",
                                background: i % 2 === 1 ? "#EEF4FB" : "#ffffff",
                                padding: "6px 8px",
                              }}
                            >
                              <span className="font-mono text-xs">{item.sku}</span>
                              <span className="text-right font-semibold text-sm">×{item.qty}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>
      </Tabs>

      {/* Flag Dialog */}
      <Dialog open={flagDialog} onOpenChange={setFlagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-amber-500" /> Flag Unrecognised Scan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Barcode / UPC / SKU</label>
              <Input
                value={flagBarcode}
                onChange={(e) => setFlagBarcode(e.target.value)}
                placeholder="Enter the barcode that was not found"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description (optional)</label>
              <Input
                value={flagDesc}
                onChange={(e) => setFlagDesc(e.target.value)}
                placeholder="e.g. Loose item, no label, wrong product"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialog(false)}>Cancel</Button>
            <Button
              onClick={handleFlag}
              disabled={flagScan.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Flag className="w-4 h-4 mr-1" /> Flag Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Order Dialog */}
      <Dialog open={completeDialog} onOpenChange={setCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" /> Complete Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Mark this order as complete and close the scan session?</p>
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-mono font-semibold">{session?.referenceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total scanned</span>
                <span className="font-semibold">{totalScanned} / {totalExpected}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pallets</span>
                <span className="font-semibold">{pallets.length}</span>
              </div>
            </div>
            {!allComplete && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded p-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Not all items have been fully scanned. Complete anyway?</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => session && completeSession.mutate({ sessionId: session.id })}
              disabled={completeSession.isPending}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
