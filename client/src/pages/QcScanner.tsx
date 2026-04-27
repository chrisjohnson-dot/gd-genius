import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PhotoGallery } from "@/components/photos/PhotoGallery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ScanBarcode, CheckCircle2, AlertTriangle, Flag, Plus, Minus,
  Package, Layers, ClipboardList, ChevronRight, RefreshCw, Download, X,
  Barcode, Wand2, Pencil, Copy, Printer, FileText, FlaskConical, ChevronDown
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
  palletHeightIn?: string | null;
  calculatedWeightLb?: string | null;
  weightOverrideLb?: string | null;
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
  transactionId: number | null;
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
  const [txInput, setTxInput] = useState("");
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

  // Demo mode state
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoScenario, setDemoScenario] = useState<"apparel" | "electronics" | "mixed">("mixed");
  const [demoUpcMap, setDemoUpcMap] = useState<Array<{ sku: string; upc: string; description: string; weightLbPerCase: number; caseAmount: number }>>([]);
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(true);

  const createDemoSession = trpc.qcScanner.createDemoSession.useMutation({
    onSuccess: (data) => {
      const sess = data.session as Session;
      setSession(sess);
      setItems((data.items as ScanItem[]) ?? []);
      setPallets((data.pallets as unknown as Pallet[]) ?? []);
      setDemoUpcMap(data.demoUpcMap ?? []);
      setIsDemoSession(true);
      setPhase("scanning");
      setDemoOpen(false);
      toast.success(`Demo session started: ${data.demoScenario} scenario`, {
        description: `${(data.items as ScanItem[]).length} SKUs pre-loaded. Scan the UPCs shown in the cheat sheet.`,
        duration: 6000,
      });
      // Show pallet type dialog for first pallet
      setPalletTypeForFirst(true);
      setPendingPalletType(null);
      setPalletTypeDialog(true);
      setTimeout(() => barcodeRef.current?.focus(), 100);
    },
    onError: (e) => toast.error(e.message),
  });

  const barcodeRef = useRef<HTMLInputElement>(null);
  const txInputRef = useRef<HTMLInputElement>(null);

  const trpcUtils = trpc.useUtils();

  const fetchFromExtensiv = trpc.qcScanner.fetchFromExtensiv.useMutation({
    onSuccess: async (data) => {
      setExtensivLoadError(null);
      setItems(data.items as ScanItem[]);
      if (data.customerName && session) setSession((s) => s ? { ...s, customerName: data.customerName } : s);
      if (data.poNumber && session) setSession((s) => s ? { ...s, poNumber: data.poNumber } : s);
      toast.success(`Loaded ${data.seededCount} item${data.seededCount !== 1 ? "s" : ""} from Extensiv`, {
        description: data.customerName ? `Customer: ${data.customerName}` : undefined,
      });

      // Auto-apply pallet type if confidence ≥90%, otherwise show dialog
      if (data.customerName) {
        try {
          const palletDefault = await trpcUtils.qcScanner.getCustomerPalletDefault.fetch(
            { customerName: data.customerName }
          );
          if (palletDefault.suggestedType && palletDefault.confidence >= 90) {
            // High confidence — silently apply and skip the dialog
            setPalletTypeDialog(false);
            const firstPallet = pallets[0];
            if (firstPallet && !firstPallet.palletType) {
              updatePalletType.mutate({ palletId: firstPallet.id, palletType: palletDefault.suggestedType });
            }
            toast.info(
              `Pallet type auto-set: ${palletTypeLabel(palletDefault.suggestedType)}`,
              { description: `${palletDefault.confidence}% confidence from past sessions` }
            );
          }
          // If confidence <90% or no history, the dialog stays open (already shown by startSession)
        } catch {
          // Silently ignore — dialog stays open as fallback
        }
      }

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
        toast.info(`Resumed session for TX ${sess?.transactionId ?? sess?.referenceNumber}`);
        setTimeout(() => barcodeRef.current?.focus(), 100);
      } else {
        toast.success(`Session started for TX ${sess?.transactionId ?? sess?.referenceNumber}`);
        // Show pallet type selection for the first pallet
        setPalletTypeForFirst(true);
        setPendingPalletType(null);
        setPalletTypeDialog(true);
        // Auto-load items and lot numbers from Extensiv for new sessions
        if (sess?.id && sess?.transactionId) {
          fetchFromExtensiv.mutate({ sessionId: sess.id, transactionId: sess.transactionId });
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

  // Smart pallet default — learned from historical sessions for this customer
  const customerPalletDefault = trpc.qcScanner.getCustomerPalletDefault.useQuery(
    { customerName: session?.customerName ?? "" },
    { enabled: !!session?.customerName && palletTypeDialog }
  );
  // Label paper size — persisted in localStorage
  const [labelPaperSize, setLabelPaperSize] = useState<'thermal' | 'letter'>(
    () => (localStorage.getItem('qc_label_paper_size') as 'thermal' | 'letter') ?? 'thermal'
  );

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

  // Height input state per pallet (palletId -> string)
  const [heightInputs, setHeightInputs] = useState<Record<number, string>>({});
  // Weight override input state per pallet (palletId -> string)
  const [weightOverrideInputs, setWeightOverrideInputs] = useState<Record<number, string>>({});

  const updatePalletHeight = trpc.qcScanner.updatePalletHeight.useMutation({
    onSuccess: (_, vars) => {
      setPallets((prev) =>
        prev.map((p) => p.id === vars.palletId ? { ...p, palletHeightIn: String(vars.heightIn) } : p)
      );
      toast.success(`Pallet height saved: ${vars.heightIn}"`); 
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePalletWeightOverride = trpc.qcScanner.updatePalletWeightOverride.useMutation({
    onSuccess: (_, vars) => {
      setPallets((prev) =>
        prev.map((p) => p.id === vars.palletId ? { ...p, weightOverrideLb: vars.weightLb !== null ? String(vars.weightLb) : null } : p)
      );
      if (vars.weightLb !== null) {
        toast.success(`Weight override saved: ${vars.weightLb} lbs`);
      } else {
        toast.success('Weight override cleared');
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const calculatePalletWeight = trpc.qcScanner.calculatePalletWeight.useMutation({
    onSuccess: (data, vars) => {
      if (data.weightLb !== null) {
        setPallets((prev) =>
          prev.map((p) => p.id === vars.palletId ? { ...p, calculatedWeightLb: String(data.weightLb) } : p)
        );
        toast.success(`Calculated weight: ${data.weightLb} lbs`);
      } else {
        toast.info("Weight could not be calculated — item dims may be missing in Extensiv");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // Helper: auto-assign UPCs to any pallets missing one, then update local state
  const ensurePalletUpcs = async () => {
    if (!session) return;
    const missing = pallets.filter((p) => !p.palletUpc?.trim());
    if (missing.length === 0) return;
    try {
      const result = await bulkGeneratePalletUpcs.mutateAsync({ sessionId: session.id });
      if (result.assigned.length > 0) {
        toast.success(`Auto-assigned UPCs to ${result.assigned.length} pallet${result.assigned.length !== 1 ? 's' : ''} before printing`);
      }
    } catch {
      toast.error('Failed to auto-assign UPCs — printing with available data');
    }
  };

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
      setTxInput("");
      setCompleteDialog(false);
      setConfirmText("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const txId = parseInt(txInput.trim(), 10);
    if (!txInput.trim() || isNaN(txId) || txId <= 0) return;
    startSession.mutate({ transactionId: txId });
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

  // Search filter (TX ID or Reference Number)
  const [sessionSearch, setSessionSearch] = useState("");

  if (phase === "start") {
    const recent = recentSessionsQuery.data?.sessions ?? [];
    const filteredRecent = sessionSearch.trim()
      ? recent.filter((s) => {
          const q = sessionSearch.trim().toLowerCase();
          return (
            String(s.transactionId ?? "").includes(q) ||
            s.referenceNumber?.toLowerCase().includes(q) ||
            s.customerName?.toLowerCase().includes(q) ||
            s.poNumber?.toLowerCase().includes(q)
          );
        })
      : recent;
    return (
      <>
      <div className="flex flex-col items-center min-h-[60vh] gap-8 p-8">
        <div className="text-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mx-auto mb-4">
            <ScanBarcode className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">QC Scanner</h1>
          <p className="text-muted-foreground mt-2">Enter a Transaction ID to start or resume a scan session</p>
        </div>

        {/* TX form + Demo Mode side by side */}
        <div className="w-full max-w-md space-y-3">
          <form onSubmit={handleTxSubmit} className="flex gap-3">
            <Input
              ref={txInputRef}
              value={txInput}
              onChange={(e) => setTxInput(e.target.value)}
              placeholder="Transaction ID (numeric)"
              type="number"
              className="text-lg h-12"
              autoFocus
            />
            <Button type="submit" size="lg" disabled={startSession.isPending}>
              {startSession.isPending ? "Loading…" : "Start"}
              <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </form>

          {/* Demo Mode accordion */}
          <div className="border border-dashed border-amber-400 rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              onClick={() => setDemoOpen((v) => !v)}
            >
              <FlaskConical className="w-4 h-4 shrink-0" />
              <span>Demo Mode — no live order needed</span>
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${demoOpen ? "rotate-180" : ""}`} />
            </button>
            {demoOpen && (
              <div className="px-4 py-3 bg-amber-50/60 dark:bg-amber-950/20 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Creates a realistic demo session with pre-loaded SKUs so you can walk through the full QC workflow — scanning, pallet building, weight entry, and label printing — without a live Extensiv order.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(["mixed", "apparel", "electronics"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDemoScenario(s)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        demoScenario === s
                          ? "bg-amber-500 text-white border-amber-500"
                          : "border-amber-300 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                      }`}
                    >
                      {s === "mixed" ? "Mixed (Home & Beauty)" : s === "apparel" ? "Apparel" : "Electronics"}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {demoScenario === "mixed" && (
                    <><p className="font-medium text-amber-700 dark:text-amber-400">Meridian Retail Group → Walmart DC</p>
                    <p>6 SKUs · 228 pcs total · Candles, soaps, lotions, diffusers, gift sets</p></>
                  )}
                  {demoScenario === "apparel" && (
                    <><p className="font-medium text-amber-700 dark:text-amber-400">Lakeview Apparel Co. → Target DC</p>
                    <p>6 SKUs · 126 pcs total · Tees &amp; hoodies in S/M/L</p></>
                  )}
                  {demoScenario === "electronics" && (
                    <><p className="font-medium text-amber-700 dark:text-amber-400">TechBridge Distribution → Best Buy DC</p>
                    <p>4 SKUs · 120 pcs total · HDMI cables, USB hubs, chargers, speakers</p></>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white w-full"
                  disabled={createDemoSession.isPending}
                  onClick={() => createDemoSession.mutate({ scenario: demoScenario })}
                >
                  <FlaskConical className="w-4 h-4 mr-1.5" />
                  {createDemoSession.isPending ? "Creating demo session…" : `Start Demo — ${demoScenario}`}
                </Button>
              </div>
            )}
          </div>
        </div>

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
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search TX ID, ref #, customer…"
                className="w-full h-8 pl-3 pr-7 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {sessionSearch && (
                <button
                  onClick={() => setSessionSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
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
              No sessions match &ldquo;{sessionSearch}&rdquo;
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
                <span>Ref / TX ID</span>
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
                      <span className="font-semibold text-[#15527f] truncate">{s.transactionId ? `TX ${s.transactionId}` : s.referenceNumber}</span>
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

              {/* Items table with scan timestamps */}
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
                    style={{ gridTemplateColumns: "120px 1fr 90px 80px 80px", background: "#15527f", padding: "0 10px", height: 32, alignItems: "center" }}
                  >
                    <span>SKU</span>
                    <span>Description / Scan Timestamps</span>
                    <span>Lot #</span>
                    <span className="text-right">Expected</span>
                    <span className="text-right">Scanned</span>
                  </div>
                  {sessionSummaryQuery.data.items.map((item, idx) => {
                    const done = item.scannedQty >= item.expectedQty && item.expectedQty > 0;
                    const over = item.scannedQty > item.expectedQty;
                    const timestamps = (item.scanTimestamps as number[] | null) ?? [];
                    return (
                      <div
                        key={item.id}
                        className="grid text-sm border-b border-[#CDD4DC] last:border-0"
                        style={{
                          gridTemplateColumns: "120px 1fr 90px 80px 80px",
                          background: over ? "#FFF8E7" : done ? "#F0FDF4" : idx % 2 === 1 ? "#EEF4FB" : "#ffffff",
                          padding: "5px 10px",
                          alignItems: "start",
                        }}
                      >
                        <span className="font-mono text-xs text-[#15527f] truncate pt-1">{item.sku}</span>
                        <div className="pr-2">
                          <span className="text-xs text-[#333333] truncate block">{item.description ?? "—"}</span>
                          {timestamps.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {timestamps.map((ts, ti) => (
                                <span key={ti} className="block text-[10px] text-muted-foreground font-mono">
                                  #{ti + 1} {new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="font-mono text-xs text-[#555] pt-1">{item.lotNumber ?? "—"}</span>
                        <span className="text-right text-xs font-mono text-[#333333] pt-1">{item.expectedQty}</span>
                        <span className={`text-right text-xs font-semibold font-mono pt-1 ${
                          over ? "text-amber-600" : done ? "text-green-600" : "text-[#333333]"
                        }`}>{item.scannedQty}</span>
                      </div>
                    );
                  })}
                  {/* Totals footer */}
                  <div
                    className="grid text-sm font-bold"
                    style={{ gridTemplateColumns: "120px 1fr 90px 80px 80px", background: "#EDFAEB", borderTop: "2px solid #CDD4DC", padding: "5px 10px", alignItems: "center" }}
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
              disabled={startSession.isPending}
              onClick={() => {
                const sess = sessionSummaryQuery.data?.session;
                if (!sess) return;
                setSelectedSessionId(null);
                if (sess.transactionId) {
                  // Real session: resume via startSession (handles scanning/complete status)
                  startSession.mutate({ transactionId: sess.transactionId });
                } else {
                  // Demo or manual session: load directly from DB
                  trpcUtils.qcScanner.getSession.fetch({ sessionId: sess.id }).then((data) => {
                    setSession(data.session as Session);
                    setItems((data.items as ScanItem[]) ?? []);
                    setPallets((data.pallets as unknown as Pallet[]) ?? []);
                    setPhase(sess.status === "complete" ? "complete" : "scanning");
                    toast.info(`Opened session: ${sess.referenceNumber}`);
                    setTimeout(() => barcodeRef.current?.focus(), 100);
                  }).catch((e) => toast.error(e.message));
                }
              }}
            >
              {startSession.isPending ? "Opening…" : "Open Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    );
  }

  // ─── Scanning / Complete Screen ────────────────────────────────────────────

  // Helper: programmatically fire a single scan for a UPC (used by cheat sheet)
  const fireDemoScan = (upc: string) => {
    if (!session || phase !== "scanning") return;
    scanBarcode.mutate({ sessionId: session.id, barcode: upc, scanAsCase: false });
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanBarcode className="w-6 h-6 text-primary" />
{session?.transactionId ? `TX ${session.transactionId}` : session?.referenceNumber}
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
              fetchFromExtensiv.mutate({ sessionId: session.id, transactionId: session.transactionId ?? 0 });
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

      {/* Demo Cheat Sheet — collapsible panel shown only in demo sessions */}
      {isDemoSession && demoUpcMap.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-400 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            onClick={() => setCheatSheetOpen((v) => !v)}
          >
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>Demo Cheat Sheet — click any row to scan that UPC</span>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${cheatSheetOpen ? "rotate-180" : ""}`} />
          </button>
          {cheatSheetOpen && (
            <div className="bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
              {/* Header */}
              <div
                className="grid text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-1"
                style={{ gridTemplateColumns: "140px 1fr 130px 80px 90px 90px 110px" }}
              >
                <span>SKU</span>
                <span>Description</span>
                <span>UPC</span>
                <span className="text-right">Case Qty</span>
                <span className="text-right">Expected</span>
                <span className="text-right">Scanned</span>
                <span className="text-center">Scan</span>
              </div>
              <div className="space-y-0.5">
                {demoUpcMap.map((entry) => {
                  const liveItem = items.find((i) => i.sku === entry.sku);
                  const scanned = liveItem?.scannedQty ?? 0;
                  const expected = liveItem?.expectedQty ?? 0;
                  const done = expected > 0 && scanned >= expected;
                  const over = scanned > expected;
                  return (
                    <div
                      key={entry.sku}
                      className="grid items-center rounded text-xs"
                      style={{
                        gridTemplateColumns: "140px 1fr 130px 80px 90px 90px 110px",
                        background: over ? "#FFF3CD" : done ? "#DCFCE7" : "transparent",
                        padding: "4px 6px",
                      }}
                    >
                      <span className="font-mono text-[#15527f] truncate">{entry.sku}</span>
                      <span className="text-muted-foreground truncate pr-2">{entry.description}</span>
                      <span className="font-mono text-[#333] dark:text-gray-300">{entry.upc}</span>
                      <span className="text-right font-mono text-muted-foreground">{entry.caseAmount}</span>
                      <span className="text-right font-mono text-muted-foreground">{expected}</span>
                      <span className={`text-right font-semibold font-mono ${
                        over ? "text-amber-600" : done ? "text-green-600" : "text-[#333] dark:text-gray-300"
                      }`}>{scanned}</span>
                      <div className="flex gap-1 justify-center">
                        <button
                          type="button"
                          disabled={done || phase !== "scanning" || scanBarcode.isPending}
                          onClick={() => fireDemoScan(entry.upc)}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title={`Scan 1× ${entry.sku}`}
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          disabled={done || phase !== "scanning" || scanBarcode.isPending}
                          onClick={() => {
                            if (!session) return;
                            // Scan caseAmount times in sequence
                            const count = entry.caseAmount;
                            let i = 0;
                            const fireNext = () => {
                              if (i >= count) return;
                              i++;
                              scanBarcode.mutate(
                                { sessionId: session.id, barcode: entry.upc, scanAsCase: false },
                                { onSettled: fireNext }
                              );
                            };
                            fireNext();
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-700 hover:bg-amber-800 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title={`Scan full case (${entry.caseAmount}×) for ${entry.sku}`}
                        >
                          +{entry.caseAmount}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 px-1">+1 scans one unit &nbsp;·&nbsp; +{demoUpcMap[0]?.caseAmount ?? "N"} scans a full case &nbsp;·&nbsp; Green = complete &nbsp;·&nbsp; Amber = over-scanned</p>
            </div>
          )}
        </div>
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
                      fetchFromExtensiv.mutate({ sessionId: session.id, transactionId: session.transactionId ?? 0 });
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
          {/* Top toolbar: auto-assign UPCs */}
          {phase === "scanning" && pallets.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-muted-foreground">{pallets.length} pallet{pallets.length !== 1 ? "s" : ""}</h3>
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
                    ? `Auto-Assign UPCs (${unassignedCount})`
                    : "All UPCs Assigned"}
              </Button>
            </div>
          )}

          {pallets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No pallets yet. Use the button below to add one.</div>
          ) : (
            /* ── Vertical stack of collapsible pallet cards ── */
            <div className="space-y-2">
              {pallets.map((pallet) => {
                const isExpanded = activePalletTab === String(pallet.id);
                const itemCount = pallet.items?.length ?? 0;
                const hasUpc = !!pallet.palletUpc?.trim();
                const hasWeight = !!(pallet.weightOverrideLb ?? pallet.calculatedWeightLb);
                return (
                  <div key={pallet.id} className="rounded-lg border border-border overflow-hidden">
                    {/* ── Collapsed header row ── */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/50 transition-colors text-left"
                      onClick={() => setActivePalletTab(isExpanded ? "" : String(pallet.id))}
                    >
                      {/* Expand/collapse chevron */}
                      <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      {/* Pallet number */}
                      <span className="font-semibold text-sm w-20 shrink-0">Pallet {pallet.palletNumber}</span>
                      {/* Type badge */}
                      {pallet.palletType && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none shrink-0 ${
                          palletTypeBadgeClass(pallet.palletType)
                        }`}>
                          {pallet.palletType === "customer_owned" ? "CUST" : pallet.palletType === "gd_owned" ? "GD" : "CHEP"}
                        </span>
                      )}
                      {/* SKU count pill */}
                      {itemCount > 0 && (
                        <span className="text-xs text-muted-foreground">{itemCount} SKU{itemCount !== 1 ? "s" : ""}</span>
                      )}
                      {/* UPC indicator */}
                      {hasUpc && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <Barcode className="w-3 h-3" /> UPC
                        </span>
                      )}
                      {/* Weight indicator */}
                      {hasWeight && (
                        <span className="text-xs text-muted-foreground">
                          {pallet.weightOverrideLb
                            ? <span className="text-orange-600 font-medium">{pallet.weightOverrideLb} lbs ✎</span>
                            : <span>{pallet.calculatedWeightLb} lbs</span>}
                        </span>
                      )}
                      {/* Print buttons — always visible in header */}
                      {phase === "scanning" && (
                        <div className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={async () => {
                              await ensurePalletUpcs();
                              window.open(`/api/pdf/gd-label?sessionId=${session!.id}&palletId=${pallet.id}`, "_blank");
                            }}
                          >
                            <Printer className="w-3 h-3 mr-1" /> GD
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={async () => {
                              await ensurePalletUpcs();
                              window.open(`/api/pdf/sscc-label?sessionId=${session!.id}&palletId=${pallet.id}`, "_blank");
                            }}
                          >
                            <Printer className="w-3 h-3 mr-1" /> SSCC
                          </Button>
                        </div>
                      )}
                    </button>

                    {/* ── Expanded body ── */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        <Card className="rounded-none border-0 shadow-none">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-base">Pallet {pallet.palletNumber}</CardTitle>
                                <Popover>
                            <PopoverTrigger asChild>
                              {pallet.palletType ? (
                                <button
                                  className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${palletTypeBadgeClass(pallet.palletType)}`}
                                  title="Click to change pallet type"
                                >
                                  {palletTypeLabel(pallet.palletType)} ✎
                                </button>
                              ) : (
                                <button className="text-xs text-amber-600 underline hover:text-amber-700">
                                  Set type
                                </button>
                              )}
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-2" align="start">
                              <p className="text-xs text-muted-foreground mb-2 font-medium">Change pallet type</p>
                              <div className="flex flex-col gap-1">
                                {PALLET_TYPES.map((pt) => (
                                  <button
                                    key={pt.value}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium w-full text-left hover:opacity-90 transition-opacity ${
                                      pallet.palletType === pt.value ? pt.color + " ring-1 ring-current" : "hover:bg-muted"
                                    }`}
                                    onClick={() => {
                                      if (pallet.palletType !== pt.value) {
                                        updatePalletType.mutate({ palletId: pallet.id, palletType: pt.value });
                                        toast.success(`Pallet ${pallet.palletNumber} → ${pt.label}`);
                                      }
                                    }}
                                    disabled={updatePalletType.isPending}
                                  >
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pt.color}`}>
                                      {pt.value === "customer_owned" ? "CUST" : pt.value === "gd_owned" ? "GD" : "CHEP"}
                                    </span>
                                    {pt.label}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
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
                      {/* Height input and calculated weight row */}
                      {phase === "scanning" && (
                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Pallet Height (in):</label>
                            <Input
                              type="number"
                              min="0"
                              max="120"
                              step="0.5"
                              className="h-7 w-20 text-xs"
                              placeholder={pallet.palletHeightIn ?? "e.g. 48"}
                              value={heightInputs[pallet.id] ?? (pallet.palletHeightIn ?? "")}
                              onChange={(e) => setHeightInputs((prev) => ({ ...prev, [pallet.id]: e.target.value }))}
                              onBlur={() => {
                                const val = parseFloat(heightInputs[pallet.id] ?? "");
                                if (!isNaN(val) && val > 0) {
                                  updatePalletHeight.mutate({ palletId: pallet.id, heightIn: val });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const val = parseFloat(heightInputs[pallet.id] ?? "");
                                  if (!isNaN(val) && val > 0) {
                                    updatePalletHeight.mutate({ palletId: pallet.id, heightIn: val });
                                  }
                                }
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Calc. Weight:</span>
                            {pallet.calculatedWeightLb ? (
                              <span className="text-xs font-semibold text-green-700">{pallet.calculatedWeightLb} lbs</span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">—</span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={calculatePalletWeight.isPending}
                              onClick={() => calculatePalletWeight.mutate({ sessionId: session!.id, palletId: pallet.id })}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" /> Calculate
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Weight Override (lbs):</label>
                            <Input
                              type="number"
                              min="0"
                              max="9999"
                              step="0.1"
                              className="h-7 w-24 text-xs"
                              placeholder={pallet.weightOverrideLb ?? "optional"}
                              value={weightOverrideInputs[pallet.id] ?? (pallet.weightOverrideLb ?? "")}
                              onChange={(e) => setWeightOverrideInputs((prev) => ({ ...prev, [pallet.id]: e.target.value }))}
                              onBlur={() => {
                                const raw = weightOverrideInputs[pallet.id] ?? "";
                                if (raw === "") {
                                  // Clear override if field is emptied
                                  if (pallet.weightOverrideLb) updatePalletWeightOverride.mutate({ palletId: pallet.id, weightLb: null });
                                  return;
                                }
                                const val = parseFloat(raw);
                                if (!isNaN(val) && val >= 0) {
                                  updatePalletWeightOverride.mutate({ palletId: pallet.id, weightLb: val });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const raw = weightOverrideInputs[pallet.id] ?? "";
                                  const val = parseFloat(raw);
                                  if (!isNaN(val) && val >= 0) {
                                    updatePalletWeightOverride.mutate({ palletId: pallet.id, weightLb: val });
                                  }
                                }
                              }}
                            />
                            {pallet.weightOverrideLb && (
                              <span className="text-xs font-semibold text-orange-600">Override active</span>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Show saved height/weight in read-only mode outside scanning phase */}
                      {phase !== "scanning" && (pallet.palletHeightIn || pallet.calculatedWeightLb || pallet.weightOverrideLb) && (
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                          {pallet.palletHeightIn && <span>Height: <strong>{pallet.palletHeightIn}"</strong></span>}
                          {pallet.weightOverrideLb ? (
                            <span>Weight: <strong className="text-orange-600">{pallet.weightOverrideLb} lbs</strong> <span className="text-orange-500">(override)</span></span>
                          ) : pallet.calculatedWeightLb ? (
                            <span>Weight: <strong>{pallet.calculatedWeightLb} lbs</strong></span>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Persistent Add Pallet button ── */}
          {phase === "scanning" && (
            <div className="mt-4">
              <Button
                className="w-full h-12 text-base font-semibold gap-2"
                onClick={() => {
                  if (!session) return;
                  const reuseType =
                    pallets.find((p) => p.palletType)?.palletType ??
                    pallets[pallets.length - 1]?.palletType ??
                    "gd_owned";
                  addPallet.mutate({ sessionId: session.id, palletType: reuseType });
                }}
                disabled={addPallet.isPending}
              >
                {addPallet.isPending
                  ? <RefreshCw className="w-5 h-5 animate-spin" />
                  : <Plus className="w-5 h-5" />}
                Add Pallet
                {(() => {
                  const inheritedType =
                    pallets.find((p) => p.palletType)?.palletType ??
                    pallets[pallets.length - 1]?.palletType ??
                    "gd_owned";
                  const shortLabel =
                    inheritedType === "customer_owned" ? "Customer-Owned"
                    : inheritedType === "gd_owned" ? "GD-Owned"
                    : inheritedType === "chep" ? "CHEP"
                    : inheritedType;
                  return <span className="text-sm font-normal opacity-80">({shortLabel})</span>;
                })()}
              </Button>
              {pallets.length > 0 && (
                <p className="text-center text-xs text-muted-foreground mt-1.5">
                  Pallet type auto-inherited from previous pallet · tap type badge on any pallet to change
                </p>
              )}
            </div>
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
            {/* Smart suggestion banner */}
            {customerPalletDefault.data?.suggestedType && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2 mb-1">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">
                  📊 Suggested based on {customerPalletDefault.data.totalSessions} past pallet{customerPalletDefault.data.totalSessions !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                    PALLET_TYPES.find(p => p.value === customerPalletDefault.data!.suggestedType)?.color ?? "bg-muted text-muted-foreground"
                  }`}>
                    {customerPalletDefault.data.suggestedType === "customer_owned" ? "CUST" :
                     customerPalletDefault.data.suggestedType === "gd_owned" ? "GD" : "CHEP"}
                  </span>
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    {palletTypeLabel(customerPalletDefault.data.suggestedType)}
                    {customerPalletDefault.data.confidence > 0 && (
                      <span className="text-blue-500 dark:text-blue-400 ml-1">({customerPalletDefault.data.confidence}% of sessions)</span>
                    )}
                  </span>
                  {!pendingPalletType && (
                    <button
                      className="ml-auto text-xs text-blue-600 dark:text-blue-400 underline"
                      onClick={() => setPendingPalletType(customerPalletDefault.data!.suggestedType!)}
                    >
                      Use this
                    </button>
                  )}
                </div>
              </div>
            )}
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
                {pt.value === customerPalletDefault.data?.suggestedType && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-normal">✓ Suggested</span>
                )}
              </button>
            ))}
            {/* Warning when a different type is selected */}
            {pendingPalletType &&
             customerPalletDefault.data?.suggestedType &&
             pendingPalletType !== customerPalletDefault.data.suggestedType && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-3 py-2 mt-1">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ <strong>Different from usual:</strong> This customer typically uses{" "}
                  <strong>{palletTypeLabel(customerPalletDefault.data.suggestedType)}</strong>.
                  Confirm this is correct before proceeding.
                </p>
              </div>
            )}
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
                <span className="text-muted-foreground">TX ID</span>
                <span className="font-mono font-semibold">{session?.transactionId ?? session?.referenceNumber}</span>
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
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pallet Labels</p>
                    <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                      {(['thermal', 'letter'] as const).map((size) => (
                        <button
                          key={size}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                            labelPaperSize === size
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={() => {
                            setLabelPaperSize(size);
                            localStorage.setItem('qc_label_paper_size', size);
                          }}
                        >
                          {size === 'thermal' ? '4×6 Thermal' : 'Letter'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {pallets.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {/* GD Pallet Labels */}
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        disabled={bulkGeneratePalletUpcs.isPending}
                        onClick={async () => {
                          if (!session) return;
                          await ensurePalletUpcs();
                          window.open(`/api/pdf/qc-gd-labels/${session.id}?type=gd`, '_blank');
                        }}
                      >
                        {bulkGeneratePalletUpcs.isPending
                          ? <><span className="w-3 h-3 mr-1 animate-spin inline-block border-2 border-current border-t-transparent rounded-full" /> Generating…</>
                          : <><Barcode className="w-3 h-3 mr-1" /> GD Labels</>}
                      </Button>
                      {/* SSCC Labels */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={bulkGeneratePalletUpcs.isPending}
                        onClick={async () => {
                          if (!session) return;
                          await ensurePalletUpcs();
                          window.open(`/api/pdf/qc-gd-labels/${session.id}?type=sscc`, '_blank');
                        }}
                      >
                        <FileText className="w-3 h-3 mr-1" /> SSCC Labels
                      </Button>
                      {/* Print Both */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={bulkGeneratePalletUpcs.isPending}
                        onClick={async () => {
                          if (!session) return;
                          await ensurePalletUpcs();
                          window.open(`/api/pdf/qc-gd-labels/${session.id}?type=both`, '_blank');
                        }}
                      >
                        <Printer className="w-3 h-3 mr-1" /> Print Both
                      </Button>
                    </div>
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

            {/* Photos */}
            {session && (
              <div className="border-t border-border pt-3">
                <PhotoGallery
                  entityType="qc_session"
                  entityId={String(session.id)}
                  title="QC Photos"
                />
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
