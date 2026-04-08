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
  Package, Layers, ClipboardList, ChevronRight, RefreshCw, Download, X,
  Barcode, Wand2, Pencil, Copy
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
  palletUpc?: string | null;
  palletType?: string | null;
  items: Array<{ sku: string; upc?: string; qty: number }> | null;
};

const PALLET_TYPES = [
  { value: "customer_owned", label: "Customer-Owned Pallet", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "gd_owned", label: "GD-Owned Pallet", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "chep", label: "CHEP Pallet", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
];

function palletTypeLabel(type?: string | null) {
  return PALLET_TYPES.find((t) => t.value === type)?.label ?? type ?? "Unknown";
}
function palletTypeBadgeClass(type?: string | null) {
  return PALLET_TYPES.find((t) => t.value === type)?.color ?? "bg-muted text-muted-foreground";
}

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
  const [confirmText, setConfirmText] = useState("");
  const [activePalletTab, setActivePalletTab] = useState("0");
  const [extensivLoadError, setExtensivLoadError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

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
      setPallets((data.pallets as unknown as Pallet[]) ?? []);
      setPhase("scanning");
      if (data.resumed) {
        toast.info(`Resumed session for ${sess?.referenceNumber}`);
        setTimeout(() => barcodeRef.current?.focus(), 100);
      } else {
        toast.success(`Session started for ${sess?.referenceNumber}`);
        // Show pallet type selection for the first pallet
        setPalletTypeForFirst(true);
        setPendingPalletType(null);
        setPalletTypeDialog(true);
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
      const newPallet: Pallet = { id: data.id, palletNumber: data.palletNumber, palletUpc: null, palletType: data.palletType ?? null, items: [] };
      setPallets((prev) => {
        const updated = [...prev, newPallet];
        setActivePalletTab(String(updated.length - 1));
        return updated;
      });
      toast.success(`Pallet ${data.palletNumber} added`);
    },
  });

  // UPC assignment state
  const [upcInputs, setUpcInputs] = useState<Record<number, string>>({});
  const [editingUpc, setEditingUpc] = useState<number | null>(null);

  // Pallet type selection dialog
  const [palletTypeDialog, setPalletTypeDialog] = useState(false);
  const [pendingPalletType, setPendingPalletType] = useState<string | null>(null);
  // When true, the dialog is for the first pallet (auto-created on session start)
  const [palletTypeForFirst, setPalletTypeForFirst] = useState(false);

  const updatePalletType = trpc.qcScanner.updatePalletType.useMutation({
    onSuccess: (data) => {
      setPallets((prev) =>
        prev.map((p) => p.id === data.palletId ? { ...p, palletType: data.palletType } : p)
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const assignPalletUpc = trpc.qcScanner.assignPalletUpc.useMutation({
    onSuccess: (data) => {
      setPallets((prev) =>
        prev.map((p) => p.id === data.palletId ? { ...p, palletUpc: data.upc } : p)
      );
      setEditingUpc(null);
      setUpcInputs((prev) => ({ ...prev, [data.palletId]: "" }));
      toast.success(`UPC assigned: ${data.upc}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const generatePalletUpc = trpc.qcScanner.generatePalletUpc.useMutation({
    onSuccess: (data) => {
      setPallets((prev) =>
        prev.map((p) => p.id === data.palletId ? { ...p, palletUpc: data.upc } : p)
      );
      toast.success(`Auto-generated UPC: ${data.upc}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkGeneratePalletUpcs = trpc.qcScanner.bulkGeneratePalletUpcs.useMutation({
    onSuccess: (data) => {
      // Merge newly assigned UPCs into local pallet state
      const assignedMap = new Map(data.assigned.map((a) => [a.palletId, a.upc]));
      setPallets((prev) =>
        prev.map((p) => assignedMap.has(p.id) ? { ...p, palletUpc: assignedMap.get(p.id) } : p)
      );
      if (data.assigned.length === 0) {
        toast.info("All pallets already have UPCs assigned.");
      } else {
        toast.success(
          `Assigned UPCs to ${data.assigned.length} pallet${data.assigned.length !== 1 ? "s" : ""}` +
          (data.skipped > 0 ? ` (${data.skipped} already had one)` : "")
        );
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // Derived: how many pallets are still missing a UPC
  const unassignedCount = pallets.filter((p) => !p.palletUpc?.trim()).length;

  const flagScan = trpc.qcScanner.flagScan.useMutation({
    onSuccess: () => {
      toast.success("Scan flagged for review");
      setFlagDialog(false);
      setFlagBarcode("");
      setFlagDesc("");
    },
    onError: (e) => toast.error(e.message),
  });

  const flagsQuery = trpc.qcScanner.listFlaggedBySession.useQuery(
    { sessionId: session?.id ?? 0 },
    { enabled: !!session && completeDialog }
  );
  const openFlags = (flagsQuery.data?.flags ?? []).filter((f) => f.status === "open");

  const completeSession = trpc.qcScanner.completeSession.useMutation({
    onSuccess: () => {
      toast.success("Session completed and saved");
      setPhase("start");
      setSession(null);
      setItems([]);
      setPallets([]);
      setRefInput("");
      setCompleteDialog(false);
      setConfirmText("");
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
  const [sessionLimit, setSessionLimit] = useState(5);
  const recentSessionsQuery = trpc.qcScanner.recentSessions.useQuery(
    { limit: sessionLimit },
    { enabled: phase === "start" }
  );
  const sessionSummaryQuery = trpc.qcScanner.sessionSummary.useQuery(
    { sessionId: selectedSessionId ?? 0 },
    { enabled: selectedSessionId !== null }
  );

  const [customerFilter, setCustomerFilter] = useState("");

  if (phase === "start") {
    const recent = recentSessionsQuery.data?.sessions ?? [];
    const filteredRecent = customerFilter.trim()
      ? recent.filter((s) =>
          s.customerName?.toLowerCase().includes(customerFilter.trim().toLowerCase())
        )
      : recent;
    return (
      <>
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
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2 shrink-0">
              <ClipboardList className="w-4 h-4" />
              Recent Completed Sessions
            </h2>
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                placeholder="Filter by customer…"
                className="w-full h-8 pl-3 pr-7 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {customerFilter && (
                <button
                  onClick={() => setCustomerFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
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
          ) : filteredRecent.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No sessions match &ldquo;{customerFilter}&rdquo;
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
              {filteredRecent.map((s, idx) => {
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
                    onClick={() => setSelectedSessionId(s.id)}
                    title="Click to view session summary"
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
          {/* Show more / Show less toggle */}
          {!recentSessionsQuery.isLoading && recent.length > 0 && filteredRecent.length > 0 && (
            <div className="mt-2 text-center">
              {sessionLimit === 5 ? (
                <button
                  className="text-xs text-[#15527f] hover:underline font-medium"
                  onClick={() => setSessionLimit(10)}
                >
                  Show more
                </button>
              ) : (
                <button
                  className="text-xs text-[#15527f] hover:underline font-medium"
                  onClick={() => setSessionLimit(5)}
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Session Summary Modal */}
      <Dialog open={selectedSessionId !== null} onOpenChange={(open) => { if (!open) setSelectedSessionId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Session Summary
              {sessionSummaryQuery.data?.session && (
                <span className="text-base font-normal text-muted-foreground ml-1">
                  — {sessionSummaryQuery.data.session.referenceNumber}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {sessionSummaryQuery.isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : sessionSummaryQuery.data ? (
            <div className="flex flex-col gap-4 overflow-y-auto">
              {/* Session header info */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm border rounded-lg p-3 bg-muted/30">
                {sessionSummaryQuery.data.session.customerName && (
                  <><span className="text-muted-foreground">Customer</span><span className="font-medium">{sessionSummaryQuery.data.session.customerName}</span></>
                )}
                {sessionSummaryQuery.data.session.poNumber && (
                  <><span className="text-muted-foreground">PO #</span><span className="font-medium">{sessionSummaryQuery.data.session.poNumber}</span></>
                )}
                {sessionSummaryQuery.data.session.warehouseName && (
                  <><span className="text-muted-foreground">Warehouse</span><span className="font-medium">{sessionSummaryQuery.data.session.warehouseName}</span></>
                )}
                {sessionSummaryQuery.data.session.completedAt && (
                  <><span className="text-muted-foreground">Completed</span><span className="font-medium">{new Date(sessionSummaryQuery.data.session.completedAt).toLocaleString()}</span></>
                )}
                <span className="text-muted-foreground">Status</span>
                <span>
                  <Badge className={sessionSummaryQuery.data.session.status === "complete" ? "bg-green-500 text-white" : "bg-amber-500 text-white"}>
                    {sessionSummaryQuery.data.session.status}
                  </Badge>
                </span>
              </div>

              {/* Items table */}
              {sessionSummaryQuery.data.items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No items recorded for this session
                </div>
              ) : (
                <div className="rounded-lg overflow-hidden border border-border">
                  {/* Header */}
                  <div
                    className="grid text-white text-xs font-bold uppercase tracking-wide"
                    style={{ gridTemplateColumns: "120px 1fr 110px 90px 90px", background: "#15527f", padding: "0 10px", height: 32, alignItems: "center" }}
                  >
                    <span>SKU</span>
                    <span>Description</span>
                    <span>Lot #</span>
                    <span className="text-right">Expected</span>
                    <span className="text-right">Scanned</span>
                  </div>
                  {sessionSummaryQuery.data.items.map((item, idx) => {
                    const done = item.scannedQty >= item.expectedQty && item.expectedQty > 0;
                    const over = item.scannedQty > item.expectedQty;
                    return (
                      <div
                        key={item.id}
                        className="grid text-sm border-b border-[#CDD4DC] last:border-0"
                        style={{
                          gridTemplateColumns: "120px 1fr 110px 90px 90px",
                          background: over ? "#FFF8E7" : done ? "#F0FDF4" : idx % 2 === 1 ? "#EEF4FB" : "#ffffff",
                          minHeight: 38,
                          padding: "5px 10px",
                          alignItems: "center",
                        }}
                      >
                        <span className="font-mono text-xs text-[#15527f] truncate">{item.sku}</span>
                        <span className="text-xs text-[#333333] truncate pr-2">{item.description ?? "—"}</span>
                        <span className="font-mono text-xs text-[#555]">{item.lotNumber ?? "—"}</span>
                        <span className="text-right text-xs font-mono text-[#333333]">{item.expectedQty}</span>
                        <span className={`text-right text-xs font-semibold font-mono ${
                          over ? "text-amber-600" : done ? "text-green-600" : "text-[#333333]"
                        }`}>{item.scannedQty}</span>
                      </div>
                    );
                  })}
                  {/* Totals footer */}
                  <div
                    className="grid text-sm font-bold"
                    style={{ gridTemplateColumns: "120px 1fr 110px 90px 90px", background: "#EDFAEB", borderTop: "2px solid #CDD4DC", padding: "5px 10px", alignItems: "center" }}
                  >
                    <span className="text-xs text-[#15527f] uppercase tracking-wide col-span-3">Total</span>
                    <span className="text-right text-xs font-mono text-[#333333]">
                      {sessionSummaryQuery.data.items.reduce((s, i) => s + i.expectedQty, 0)}
                    </span>
                    <span className="text-right text-xs font-semibold font-mono text-green-600">
                      {sessionSummaryQuery.data.items.reduce((s, i) => s + i.scannedQty, 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setSelectedSessionId(null)}>Close</Button>
            <Button
              variant="default"
              onClick={() => {
                if (sessionSummaryQuery.data?.session) {
                  setRefInput(sessionSummaryQuery.data.session.referenceNumber);
                  setSelectedSessionId(null);
                }
              }}
            >
              Open Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
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
              <div className="flex items-center gap-2">
                {pallets.length > 0 && (
                  <Button
                    size="sm"
                    variant={unassignedCount > 0 ? "default" : "outline"}
                    onClick={() => bulkGeneratePalletUpcs.mutate({ sessionId: session!.id })}
                    disabled={bulkGeneratePalletUpcs.isPending || unassignedCount === 0}
                    title={unassignedCount === 0 ? "All pallets already have UPCs" : `Auto-assign UPCs to ${unassignedCount} unassigned pallet${unassignedCount !== 1 ? "s" : ""}`}
                  >
                    <Wand2 className="w-4 h-4 mr-1" />
                    {bulkGeneratePalletUpcs.isPending
                      ? "Assigning…"
                      : unassignedCount > 0
                        ? `Auto-Assign All (${unassignedCount})`
                        : "All UPCs Assigned"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setPalletTypeForFirst(false); setPendingPalletType(null); setPalletTypeDialog(true); }}
                  disabled={addPallet.isPending}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Pallet
                </Button>
              </div>
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
                    {p.palletType && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${palletTypeBadgeClass(p.palletType)}`}>
                        {p.palletType === "customer_owned" ? "CUST" : p.palletType === "gd_owned" ? "GD" : "CHEP"}
                      </span>
                    )}
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
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">Pallet {pallet.palletNumber}</CardTitle>
                          {pallet.palletType ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${palletTypeBadgeClass(pallet.palletType)}`}>
                              {palletTypeLabel(pallet.palletType)}
                            </span>
                          ) : (
                            <button
                              className="text-xs text-amber-600 underline hover:text-amber-700"
                              onClick={() => { setPalletTypeForFirst(false); setPendingPalletType(null); setPalletTypeDialog(true); }}
                            >Set type</button>
                          )}
                        </div>
                        {/* UPC assignment section */}
                        <div className="flex flex-col items-end gap-1 min-w-0">
                          {pallet.palletUpc && editingUpc !== pallet.id ? (
                            <div className="flex items-center gap-1.5">
                              <Barcode className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-mono text-xs text-emerald-700 font-semibold truncate max-w-[140px]">{pallet.palletUpc}</span>
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                title="Copy UPC"
                                onClick={() => { navigator.clipboard.writeText(pallet.palletUpc!); toast.success("UPC copied"); }}
                              ><Copy className="w-3 h-3" /></button>
                              {phase === "scanning" && (
                                <button
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Edit UPC"
                                  onClick={() => { setEditingUpc(pallet.id); setUpcInputs((p) => ({ ...p, [pallet.id]: pallet.palletUpc ?? "" })); }}
                                ><Pencil className="w-3 h-3" /></button>
                              )}
                            </div>
                          ) : phase === "scanning" ? (
                            editingUpc === pallet.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  className="h-7 text-xs w-36 font-mono"
                                  placeholder="Scan or type UPC"
                                  value={upcInputs[pallet.id] ?? ""}
                                  autoFocus
                                  onChange={(e) => setUpcInputs((p) => ({ ...p, [pallet.id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && upcInputs[pallet.id]?.trim()) {
                                      assignPalletUpc.mutate({ palletId: pallet.id, sessionId: session!.id, upc: upcInputs[pallet.id].trim() });
                                    } else if (e.key === "Escape") {
                                      setEditingUpc(null);
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  disabled={!upcInputs[pallet.id]?.trim() || assignPalletUpc.isPending}
                                  onClick={() => assignPalletUpc.mutate({ palletId: pallet.id, sessionId: session!.id, upc: upcInputs[pallet.id].trim() })}
                                >Save</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setEditingUpc(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => { setEditingUpc(pallet.id); setUpcInputs((p) => ({ ...p, [pallet.id]: "" })); }}
                                >
                                  <Barcode className="w-3 h-3 mr-1" /> Assign UPC
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground"
                                  title="Auto-generate a UPC"
                                  disabled={generatePalletUpc.isPending}
                                  onClick={() => generatePalletUpc.mutate({ palletId: pallet.id, sessionId: session!.id, palletNumber: pallet.palletNumber })}
                                >
                                  <Wand2 className="w-3 h-3 mr-1" /> Auto
                                </Button>
                              </div>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No UPC assigned</span>
                          )}
                        </div>
                      </div>
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

      {/* Pallet Type Selection Dialog */}
      <Dialog open={palletTypeDialog} onOpenChange={(open) => { if (!open) { setPalletTypeDialog(false); setPendingPalletType(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {palletTypeForFirst ? "Select Pallet Type — Pallet 1" : "Select Pallet Type"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground mb-3">What type of pallet is being used?</p>
            {PALLET_TYPES.map((pt) => (
              <button
                key={pt.value}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  pendingPalletType === pt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setPendingPalletType(pt.value)}
              >
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mr-2 ${pt.color}`}>
                  {pt.value === "customer_owned" ? "CUST" : pt.value === "gd_owned" ? "GD" : "CHEP"}
                </span>
                <span className="font-medium text-sm">{pt.label}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPalletTypeDialog(false); setPendingPalletType(null); }}>Cancel</Button>
            <Button
              disabled={!pendingPalletType || addPallet.isPending || updatePalletType.isPending}
              onClick={() => {
                if (!pendingPalletType || !session) return;
                if (palletTypeForFirst) {
                  // Update the first pallet that was auto-created
                  const firstPallet = pallets[0];
                  if (firstPallet) {
                    updatePalletType.mutate({ palletId: firstPallet.id, palletType: pendingPalletType });
                  }
                  setPalletTypeDialog(false);
                  setPendingPalletType(null);
                } else {
                  // Create a new pallet with the selected type
                  addPallet.mutate({ sessionId: session.id, palletType: pendingPalletType });
                  setPalletTypeDialog(false);
                  setPendingPalletType(null);
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Complete Order — Mandatory Confirmation Gate */}
      <Dialog open={completeDialog} onOpenChange={(open) => { setCompleteDialog(open); if (!open) setConfirmText(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" /> Complete &amp; Confirm Order
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* Session summary */}
            <div className="bg-muted rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-mono font-semibold">{session?.referenceNumber}</span>
              </div>
              {session?.customerName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-semibold">{session.customerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Units scanned</span>
                <span className={`font-semibold ${allComplete ? "text-green-600" : "text-amber-600"}`}>
                  {totalScanned} / {totalExpected}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pallets</span>
                <span className="font-semibold">{pallets.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open flags</span>
                <span className={`font-semibold ${openFlags.length > 0 ? "text-red-600" : "text-green-600"}`}>
                  {flagsQuery.isLoading ? "…" : openFlags.length}
                </span>
              </div>
            </div>

            {/* Pallet Labels */}
            {pallets.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pallet Labels</p>
                  {pallets.length > 0 && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      disabled={bulkGeneratePalletUpcs.isPending}
                      onClick={async () => {
                        if (!session) return;
                        // Auto-generate UPCs for any pallets that are missing one
                        let latestPallets = pallets;
                        const missing = pallets.filter((p) => !p.palletUpc?.trim());
                        if (missing.length > 0) {
                          try {
                            const result = await bulkGeneratePalletUpcs.mutateAsync({ sessionId: session.id });
                            // Merge the newly assigned UPCs into a local copy for label generation
                            const assignedMap = new Map(result.assigned.map((a: { palletId: number; upc: string }) => [a.palletId, a.upc]));
                            latestPallets = pallets.map((p) =>
                              assignedMap.has(p.id) ? { ...p, palletUpc: assignedMap.get(p.id) as string } : p
                            );
                            if (result.assigned.length > 0) {
                              toast.success(`Auto-assigned UPCs to ${result.assigned.length} pallet${result.assigned.length !== 1 ? 's' : ''} before printing`);
                            }
                          } catch {
                            toast.error('Failed to auto-assign UPCs — printing with available data');
                          }
                        }
                        const buildLabel = (p: Pallet) =>
                          `<div class='label'><div class='header'><div class='title'>GD Pallet Label</div><div class='sub'>${session?.referenceNumber ?? ''} &bull; ${session?.customerName ?? ''}</div></div><div class='row'><span>Pallet</span><span><b>#${p.palletNumber}</b></span></div><div class='row'><span>Type</span><span><span class='badge' style='background:${p.palletType==='chep'?'#f59e0b':p.palletType==='gd_owned'?'#8b5cf6':'#3b82f6'}'>` +
                          palletTypeLabel(p.palletType) +
                          `</span></span></div>${p.palletUpc ? `<div class='upc'>${p.palletUpc}</div>` : ''}<div class='row' style='margin-top:8px'><span>Items</span><span>${p.items?.length ?? 0} SKU(s)</span></div>${(p.items ?? []).map((i: { sku: string; qty: number }) => `<div class='row'><span style='font-size:11px'>${i.sku}</span><span>&times;${i.qty}</span></div>`).join('')}</div>`;
                        const allHtml = `<!DOCTYPE html><html><head><title>Pallet Labels</title><style>body{font-family:Arial,sans-serif;margin:0;padding:0;} .label{padding:16px;width:4in;page-break-after:always;} .label:last-child{page-break-after:auto;} .header{background:#1e3a5f;color:white;padding:8px 12px;border-radius:4px;margin-bottom:8px;} .title{font-size:18px;font-weight:bold;} .sub{font-size:12px;opacity:0.8;} .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;} .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;color:white;} .upc{font-family:monospace;font-size:14px;font-weight:bold;margin-top:8px;text-align:center;} @media print{button{display:none}}</style></head><body>${latestPallets.map(buildLabel).join('')}</body></html>`;
                        const w = window.open('', '_blank', 'width=600,height=800');
                        if (w) { w.document.write(allHtml); w.document.close(); w.print(); }
                      }}
                    >
                      {bulkGeneratePalletUpcs.isPending
                        ? <><span className="w-3 h-3 mr-1 animate-spin inline-block border-2 border-current border-t-transparent rounded-full" /> Generating…</>
                        : <><Barcode className="w-3 h-3 mr-1" /> Print Pallet Labels</>}
                    </Button>
                  )}
                </div>
                {pallets.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">Pallet {p.palletNumber}</span>
                      {p.palletType && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${palletTypeBadgeClass(p.palletType)}`}>
                          {palletTypeLabel(p.palletType)}
                        </span>
                      )}
                      {p.palletUpc && (
                        <span className="font-mono text-xs text-muted-foreground">{p.palletUpc}</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        const labelHtml = `<!DOCTYPE html><html><head><title>Pallet Label</title><style>body{font-family:Arial,sans-serif;margin:0;padding:16px;width:4in;} .header{background:#1e3a5f;color:white;padding:8px 12px;border-radius:4px;margin-bottom:8px;} .title{font-size:18px;font-weight:bold;} .sub{font-size:12px;opacity:0.8;} .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;} .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;background:${p.palletType==='chep'?'#f59e0b':p.palletType==='gd_owned'?'#8b5cf6':'#3b82f6'};color:white;} .upc{font-family:monospace;font-size:14px;font-weight:bold;margin-top:8px;text-align:center;} @media print{button{display:none}}</style></head><body><div class='header'><div class='title'>GD Pallet Label</div><div class='sub'>${session?.referenceNumber ?? ''} &bull; ${session?.customerName ?? ''}</div></div><div class='row'><span>Pallet</span><span><b>#${p.palletNumber}</b></span></div><div class='row'><span>Type</span><span><span class='badge'>${palletTypeLabel(p.palletType)}</span></span></div>${p.palletUpc?`<div class='upc'>${p.palletUpc}</div>`:''}<div class='row' style='margin-top:8px'><span>Items</span><span>${p.items?.length ?? 0} SKU(s)</span></div>${(p.items??[]).map(i=>`<div class='row'><span style='font-size:11px'>${i.sku}</span><span>&times;${i.qty}</span></div>`).join('')}</body></html>`;
                        const w = window.open('', '_blank', 'width=500,height=700');
                        if (w) { w.document.write(labelHtml); w.document.close(); w.print(); }
                      }}
                    >
                      <Barcode className="w-3 h-3 mr-1" /> Print Label
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {!allComplete && (
              <div className="flex items-center gap-2 text-amber-700 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Not all items have been fully scanned ({totalExpected - totalScanned} units remaining).</span>
              </div>
            )}
            {openFlags.length > 0 && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 dark:bg-red-950/20 rounded-lg p-2.5">
                <Flag className="w-4 h-4 shrink-0" />
                <span>{openFlags.length} flagged scan{openFlags.length !== 1 ? "s" : ""} still open. Resolve them before closing or confirm to proceed.</span>
              </div>
            )}

            {/* Confirmation input */}
            <div className="space-y-2">
              <p className="text-muted-foreground">
                Type <span className="font-mono font-bold text-foreground">CONFIRMED</span> below to close this session and return to the scanner.
              </p>
              <Input
                autoFocus
                placeholder="Type CONFIRMED…"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmText === "CONFIRMED" && session && !completeSession.isPending) {
                    completeSession.mutate({ sessionId: session.id });
                  }
                }}
                className={`font-mono text-center text-base h-11 ${
                  confirmText === "CONFIRMED"
                    ? "border-green-500 ring-1 ring-green-500"
                    : ""
                }`}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setCompleteDialog(false); setConfirmText(""); }}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => session && completeSession.mutate({ sessionId: session.id })}
              disabled={confirmText !== "CONFIRMED" || completeSession.isPending}
            >
              {completeSession.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1" />
              )}
              Confirm &amp; Close Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
