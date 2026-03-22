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
  Package, Layers, ClipboardList, RotateCcw, ChevronRight, X
} from "lucide-react";

type ScanItem = {
  id: number;
  sku: string;
  upc: string | null;
  description: string | null;
  expectedQty: number;
  scannedQty: number;
  caseAmount: number;
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

  const barcodeRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const startSession = trpc.qcScanner.startSession.useMutation({
    onSuccess: (data) => {
      setSession(data.session as Session);
      setItems((data.items as ScanItem[]) ?? []);
      setPallets((data.pallets as Pallet[]) ?? []);
      setPhase("scanning");
      if (data.resumed) toast.info(`Resumed session for ${data.session?.referenceNumber}`);
      else toast.success(`Session started for ${data.session?.referenceNumber}`);
      setTimeout(() => barcodeRef.current?.focus(), 100);
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
        // Update item in local state
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

  // Auto-focus barcode input when in scanning phase
  useEffect(() => {
    if (phase === "scanning") {
      barcodeRef.current?.focus();
    }
  }, [phase]);

  // ─── Start Screen ──────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 p-8">
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
      </div>
    );
  }

  // ─── Scanning Screen ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto">
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
            onClick={() => { setFlagBarcode(""); setFlagDialog(true); }}
          >
            <Flag className="w-4 h-4 mr-1 text-amber-500" /> Flag Scan
          </Button>
          {phase === "complete" || allComplete ? (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setCompleteDialog(true)}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Complete Order
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => { setPhase("start"); setSession(null); setItems([]); setPallets([]); }}>
            <RotateCcw className="w-4 h-4 mr-1" /> New Session
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{totalScanned} / {totalExpected} units scanned</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-3" />
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
          lastScan.found ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-700 dark:text-red-400"
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

        {/* Items tab */}
        <TabsContent value="items" className="mt-3">
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No items loaded. Scan a barcode to add items, or seed from Extensiv order data.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const done = item.scannedQty >= item.expectedQty;
                const over = item.scannedQty > item.expectedQty;
                return (
                  <div
                    key={item.sku}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      over ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" :
                      done ? "border-green-400 bg-green-50 dark:bg-green-950/20" :
                      "border-border bg-card"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono font-semibold text-sm truncate">{item.sku}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      )}
                      {item.upc && (
                        <div className="text-xs text-muted-foreground font-mono">UPC: {item.upc}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={item.scannedQty <= 0 || phase !== "scanning"}
                        onClick={() => session && adjustQty.mutate({ sessionId: session.id, sku: item.sku, delta: -1 })}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className={`font-bold text-lg w-16 text-center ${
                        over ? "text-amber-600" : done ? "text-green-600" : ""
                      }`}>
                        {item.scannedQty} / {item.expectedQty}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={phase !== "scanning"}
                        onClick={() => session && adjustQty.mutate({ sessionId: session.id, sku: item.sku, delta: 1 })}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      {done && !over && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                      {over && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Pallets tab */}
        <TabsContent value="pallets" className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Pallets</h3>
            {phase === "scanning" && (
              <Button size="sm" variant="outline" onClick={() => addPallet.mutate({ sessionId: session!.id })} disabled={addPallet.isPending}>
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
                        <div className="space-y-1">
                          {pallet.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                              <span className="font-mono">{item.sku}</span>
                              <span className="font-semibold">×{item.qty}</span>
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
            <Button onClick={handleFlag} disabled={flagScan.isPending} className="bg-amber-500 hover:bg-amber-600 text-white">
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
