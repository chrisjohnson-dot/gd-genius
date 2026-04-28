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
  Barcode, Wand2, Pencil, Copy, Printer, FileText, FlaskConical, ChevronDown, Scale, PackagePlus,
  Lock, LockOpen, ChevronsUpDown
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
  palletTareWeightLb?: string | null;
};

const PALLET_TYPES = [
  { value: "gd_owned", label: "GD-Owned Pallet", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "customer_owned", label: "Customer-Owned Pallet", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
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

//// WAV URLs for each sound type
const SOUND_URLS: Record<"success" | "error" | "complete", string> = {
  success: "/manus-storage/cryo_pistol_gunshot_454de70d.wav",
  error: "/manus-storage/wrong_item_angry_c1fd9aee.wav",
  complete: "/manus-storage/order_complete_jingle_d15136e3.wav",
};
// HTMLAudioElement-based sound playback — more reliable than AudioContext in mutation callbacks
const _audioElements: Partial<Record<"success" | "error" | "complete", HTMLAudioElement>> = {};

function preloadSounds() {
  (Object.keys(SOUND_URLS) as Array<"success" | "error" | "complete">).forEach((type) => {
    if (_audioElements[type]) return;
    try {
      const el = new Audio(SOUND_URLS[type]);
      el.preload = "auto";
      el.load();
      _audioElements[type] = el;
    } catch { /* ignore */ }
  });
}

function playBeep(type: "success" | "error" | "complete") {
  try {
    // Always create a fresh Audio element so rapid scans don't block each other
    const el = new Audio(SOUND_URLS[type]);
    el.volume = 1.0;
    void el.play().catch(() => {
      // If autoplay blocked, try resuming via the preloaded element
      const cached = _audioElements[type];
      if (cached) {
        cached.currentTime = 0;
        void cached.play().catch(() => {});
      }
    });
  } catch { /* ignore */ }
}

// --- Pack-sheet-style item table ----------------------------------------------

function ItemsTableSkeleton() {
  // Compact: SKU | Description | Req | Scanned
  const cols = "100px 1fr 54px 60px";
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div
        className="grid text-white text-[11px] font-bold uppercase tracking-wide"
        style={{ gridTemplateColumns: cols, background: "#15527f", padding: "0 8px", height: 28, alignItems: "center" }}
      >
        <span>SKU</span>
        <span>Description</span>
        <span className="text-right">Req</span>
        <span className="text-right">Scanned</span>
      </div>
      {Array.from({ length: 5 }).map((_, idx) => (
        <div
          key={idx}
          className="grid items-center border-b border-[#CDD4DC] last:border-0"
          style={{ gridTemplateColumns: cols, background: idx % 2 === 1 ? "#EEF4FB" : "#ffffff", minHeight: 32, padding: "4px 8px" }}
        >
          {["w-16", "w-28", "w-6", "w-6"].map((w, ci) => (
            <div key={ci} className={`h-2.5 rounded bg-gray-200 animate-pulse ${w} ${ci >= 2 ? "ml-auto" : ""}`} />
          ))}
        </div>
      ))}
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: cols, background: "#EDFAEB", borderTop: "2px solid #CDD4DC", padding: "4px 8px" }}
      >
        <div className="h-2.5 w-10 rounded bg-gray-200 animate-pulse col-span-2" />
        <div className="h-2.5 w-6 rounded bg-gray-200 animate-pulse ml-auto" />
        <div className="h-2.5 w-6 rounded bg-gray-200 animate-pulse ml-auto" />
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
  onAdjust,
  flashSku,
}: {
  items: ScanItem[];
  phase: Phase;
  sessionId: number;
  adjustQty: ReturnType<typeof trpc.qcScanner.adjustQty.useMutation>;
  isLoading?: boolean;
  onAdjust?: (sku: string, delta: number) => void;
  flashSku?: string | null;
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

  // Compact QC view: SKU | Description | Req | Scanned
  const cols = "100px 1fr 44px 56px";
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      {/* Header */}
      <div
        className="grid text-white text-[11px] font-bold uppercase tracking-wide"
        style={{ gridTemplateColumns: cols, background: "#15527f", padding: "0 8px", height: 28, alignItems: "center" }}
      >
        <span>SKU</span>
        <span>Description</span>
        <span className="text-right">Req</span>
        <span className="text-right">Scanned</span>
      </div>

      {/* Rows */}
      {items.map((item, idx) => {
        const done = item.scannedQty >= item.expectedQty;
        const over = item.scannedQty > item.expectedQty;
        const isAlt = idx % 2 === 1;
        const isFlashing = flashSku === item.sku;
        let rowBg = isAlt ? "#EEF4FB" : "#ffffff";
        if (over)  rowBg = isAlt ? "#fef3c7" : "#fffbeb";
        if (done && !over) rowBg = isAlt ? "#dcfce7" : "#f0fdf4";
        if (isFlashing) rowBg = "#bbf7d0"; // bright green flash override

        return (
          <div
            key={item.sku}
            className="grid items-center border-b border-[#CDD4DC] last:border-0"
            style={{ gridTemplateColumns: cols, background: rowBg, minHeight: 32, padding: "3px 8px", transition: "background 0.15s ease" }}
          >
            {/* SKU */}
            <div className="font-mono text-[11px] text-[#333333] truncate pr-1">
              {item.sku}
            </div>

            {/* Description */}
            <div className="text-[11px] text-[#333333] truncate pr-1">
              {item.description ?? "—"}
            </div>

            {/* Required qty */}
            <div className="text-right text-xs font-semibold text-[#333333]">
              {item.expectedQty}
            </div>

            {/* Scanned qty */}
            <div className="text-right">
              <span className={`font-bold text-xs tabular-nums ${
                over ? "text-amber-600" : done ? "text-green-600" : "text-[#333333]"
              }`}>
                {item.scannedQty}
                {done && !over && <span className="ml-0.5 text-green-500">✓</span>}
                {over && <span className="ml-0.5 text-amber-500">⚠</span>}
              </span>
            </div>
          </div>
        );
      })}

      {/* Totals footer */}
      <div
        className="grid items-center text-xs font-bold"
        style={{ gridTemplateColumns: cols, background: "#EDFAEB", borderTop: "2px solid #CDD4DC", padding: "4px 8px" }}
      >
        <span className="text-[#15527f] uppercase tracking-wide col-span-2">Total</span>
        <span className="text-right text-[#333333]">{items.reduce((s, i) => s + i.expectedQty, 0)}</span>
        <span className="text-right">
          <span className={
            items.every((i) => i.scannedQty >= i.expectedQty) ? "text-green-600"
            : items.some((i) => i.scannedQty > i.expectedQty) ? "text-amber-600"
            : "text-[#333333]"
          }>
            {items.reduce((s, i) => s + i.scannedQty, 0)}
          </span>
        </span>
      </div>
    </div>
  );
}

// --- Main component ------------------------------------------------------------

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
  // Multi-expand: track a Set of expanded pallet IDs — all pallets start expanded
  const [expandedPallets, setExpandedPallets] = useState<Set<number>>(new Set());
  const togglePalletExpand = (palletId: number) =>
    setExpandedPallets((prev) => {
      const next = new Set(prev);
      if (next.has(palletId)) next.delete(palletId); else next.add(palletId);
      return next;
    });
  // Legacy alias kept for the auto-focus useEffect
  const activePalletTab = expandedPallets.size > 0 ? String([...expandedPallets][expandedPallets.size - 1]) : "";
  const [extensivLoadError, setExtensivLoadError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  // Weight limit threshold (lbs) — configurable per session, default 2000
  const [weightLimitLb, setWeightLimitLb] = useState<number>(2000);
  const [weightLimitInput, setWeightLimitInput] = useState<string>("2000");
  // Track which pallet IDs have already fired the over-limit toast (reset when limit changes)
  const overLimitToastedRef = useRef<Set<number>>(new Set());
  // Keep a ref of the current weight limit so the mutation closure always reads the latest value
  const weightLimitLbRef = useRef<number>(weightLimitLb);
  useEffect(() => {
    weightLimitLbRef.current = weightLimitLb;
    overLimitToastedRef.current = new Set(); // reset toasted set when threshold changes
  }, [weightLimitLb]);

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
      const demoPallets = (data.pallets as unknown as Pallet[]) ?? [];
      setPallets(demoPallets);
      // Auto-expand the last (active) pallet
      if (demoPallets.length > 0) setExpandedPallets(new Set(demoPallets.map((p: Pallet) => p.id)));
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
  // Keep a ref to the latest pallets so mutation callbacks don't capture stale closures
  const palletsRef = useRef<Pallet[]>([]);
  useEffect(() => { palletsRef.current = pallets; }, [pallets]);
  // Track which pallet the operator is currently scanning into (defaults to last pallet)
  const [activeScanPalletId, setActiveScanPalletId] = useState<number | null>(null);
  const activeScanPalletIdRef = useRef<number | null>(null);
  useEffect(() => { activeScanPalletIdRef.current = activeScanPalletId; }, [activeScanPalletId]);

  // Locked pallets: set of pallet IDs that are locked (scan input hidden)
  // When a new pallet is added, all previous pallets are auto-locked
  const [lockedPallets, setLockedPallets] = useState<Set<number>>(new Set());
  const [flashSku, setFlashSku] = useState<string | null>(null);
  const flashSkuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerFlash = useCallback((sku: string) => {
    if (flashSkuTimerRef.current) clearTimeout(flashSkuTimerRef.current);
    setFlashSku(sku);
    flashSkuTimerRef.current = setTimeout(() => setFlashSku(null), 800);
  }, []);
  // Per-pallet input refs — keyed by pallet ID so we can focus the right input after a scan
  const palletInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  // Per-pallet card refs — keyed by pallet ID for auto-scroll
  const palletCardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Ref to the scrollable pallet cards container
  const palletScrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the active pallet card whenever activeScanPalletId changes
  useEffect(() => {
    const activeId = activeScanPalletId ?? (pallets[pallets.length - 1]?.id ?? null);
    if (!activeId) return;
    const card = palletCardRefs.current.get(activeId);
    const container = palletScrollContainerRef.current;
    if (!card || !container) return;
    // Use scrollIntoView with smooth behavior, contained within the scroll container
    const cardTop = card.offsetTop - container.offsetTop;
    const cardBottom = cardTop + card.offsetHeight;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const isVisible = cardTop >= containerTop && cardBottom <= containerBottom;
    if (!isVisible) {
      container.scrollTo({ top: cardTop - 12, behavior: "smooth" });
    }
  }, [activeScanPalletId, pallets]);

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
      const loadedPallets = (data.pallets as unknown as Pallet[]) ?? [];
      setPallets(loadedPallets);
      // Auto-expand the last (active) pallet
      if (loadedPallets.length > 0) setExpandedPallets(new Set(loadedPallets.map((p: Pallet) => p.id)));
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
      console.log("[QcScanner] scanBarcode result:", JSON.stringify({ found: data.found, overScan: (data as any).overScan, sessionComplete: data.sessionComplete }));
      if (!data.found) {
        playBeep("error");
        setLastScan({ sku: barcodeInput, found: false });
        toast.warning("SKU/UPC not found in this order", { description: "Use the Flag button to log it." });
      } else if ((data as any).overScan) {
        // Hard block — play a double-buzz error and show a persistent red banner
        playBeep("error");
        setTimeout(() => playBeep("error"), 300);
        setLastScan({ sku: data.item?.sku ?? barcodeInput, found: false });
        toast.error(`⛔ Over-scan blocked — ${data.item?.sku ?? barcodeInput} is already at 100%`, {
          description: "Remove the extra unit or adjust the expected quantity.",
          duration: 6000,
        });
      } else {
        if (data.sessionComplete) {
          playBeep("complete");
          toast.success("Order complete! All items scanned.", { duration: 5000 });
        } else {
          playBeep("success");
        }
        setLastScan({ sku: data.item?.sku ?? barcodeInput, found: true });
        if (data.item?.sku) triggerFlash(data.item.sku);
        const scannedSku = data.item?.sku ?? barcodeInput;
        const scannedUpc = data.item?.upc ?? undefined;
        const scannedAmount = scanAsCase ? (data.item?.caseAmount ?? 1) : 1;
        setItems((prev) =>
          prev.map((i) => (i.sku === data.item?.sku ? { ...i, scannedQty: data.item!.scannedQty } : i))
        );
        if (data.sessionComplete) setPhase("complete");
        // Auto-assign scanned item to the selected pallet (or last pallet if none selected)
        const targetId = activeScanPalletIdRef.current;
        const activePallet = targetId
          ? (palletsRef.current.find((p) => p.id === targetId) ?? palletsRef.current[palletsRef.current.length - 1])
          : palletsRef.current[palletsRef.current.length - 1];
        if (activePallet && session) {
          // Optimistically update pallet items in local state
          setPallets((prev) => prev.map((p) => {
            if (p.id !== activePallet.id) return p;
            const existingItems = (p.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
            const existing = existingItems.find((i) => i.sku === scannedSku);
            const newItems = existing
              ? existingItems.map((i) => i.sku === scannedSku ? { ...i, qty: i.qty + scannedAmount } : i)
              : [...existingItems, { sku: scannedSku, upc: scannedUpc, qty: scannedAmount }];
            // Recalculate weight from demoUpcMap if available
            let newWeight = p.calculatedWeightLb;
            if (isDemoSession && demoUpcMap.length > 0) {
              let totalLb = 0;
              for (const pi of newItems) {
                const demo = demoUpcMap.find((d) => d.sku === pi.sku);
                if (demo?.weightLbPerCase && demo?.caseAmount) {
                  totalLb += (demo.weightLbPerCase / demo.caseAmount) * pi.qty;
                }
              }
              // Add tare weight (use pallet's stored tare or default 30 lbs)
              const tareLb = p.palletTareWeightLb ? parseFloat(p.palletTareWeightLb) : 30;
              newWeight = totalLb > 0 ? String(Math.round((totalLb + tareLb) * 100) / 100) : p.calculatedWeightLb;
            }
            return { ...p, items: newItems, calculatedWeightLb: newWeight ?? p.calculatedWeightLb };
          }));
          // Check if this scan pushed the pallet over the weight limit — fire a one-time toast
          if (isDemoSession && demoUpcMap.length > 0) {
            const updatedPallet = palletsRef.current.find((p) => p.id === activePallet.id);
            const updatedItems = (updatedPallet?.items as Array<{ sku: string; qty: number }> | null) ?? [];
            let totalLb = 0;
            for (const pi of updatedItems) {
              const demo = demoUpcMap.find((d) => d.sku === pi.sku);
              if (demo?.weightLbPerCase && demo?.caseAmount) {
                totalLb += (demo.weightLbPerCase / demo.caseAmount) * pi.qty;
              }
            }
            const tareLb = activePallet.palletTareWeightLb ? parseFloat(activePallet.palletTareWeightLb) : 30;
            const newTotalLb = Math.round((totalLb + tareLb) * 10) / 10;
            if (newTotalLb > weightLimitLbRef.current && !overLimitToastedRef.current.has(activePallet.id)) {
              overLimitToastedRef.current.add(activePallet.id);
              playBeep("error");
              toast.warning(`⚠️ Pallet ${activePallet.palletNumber} exceeds weight limit`, {
                description: `${newTotalLb} lbs — over the ${weightLimitLbRef.current} lb threshold. Consider starting a new pallet.`,
                duration: 8000,
              });
            }
          } else if (activePallet.calculatedWeightLb) {
            const w = parseFloat(activePallet.calculatedWeightLb);
            if (w > weightLimitLbRef.current && !overLimitToastedRef.current.has(activePallet.id)) {
              overLimitToastedRef.current.add(activePallet.id);
              playBeep("error");
              toast.warning(`⚠️ Pallet ${activePallet.palletNumber} exceeds weight limit`, {
                description: `${w} lbs — over the ${weightLimitLbRef.current} lb threshold. Consider starting a new pallet.`,
                duration: 8000,
              });
            }
          }
          // Persist pallet item assignments to server so they survive page refresh
          // Use the functional updater result — read from palletsRef which is always current
          const latestPallet = palletsRef.current.find((p) => p.id === activePallet.id);
          const existingItemsForPersist = (latestPallet?.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
          const existingForPersist = existingItemsForPersist.find((i) => i.sku === scannedSku);
          const newItemsForPersist = existingForPersist
            ? existingItemsForPersist.map((i) => i.sku === scannedSku ? { ...i, qty: i.qty + scannedAmount } : i)
            : [...existingItemsForPersist, { sku: scannedSku, upc: scannedUpc, qty: scannedAmount }];
          updatePalletItems.mutate({ palletId: activePallet.id, items: newItemsForPersist });
        }
      }
      setBarcodeInput("");
      // Refocus the input for the pallet we just scanned into
      const focusId = activeScanPalletIdRef.current ?? (palletsRef.current[palletsRef.current.length - 1]?.id ?? null);
      if (focusId !== null) {
        palletInputRefs.current.get(focusId)?.focus();
      } else {
        barcodeRef.current?.focus();
      }
    },
    onError: (e) => {
      playBeep("error");
      toast.error(e.message);
      setBarcodeInput("");
      const focusId = activeScanPalletIdRef.current ?? (palletsRef.current[palletsRef.current.length - 1]?.id ?? null);
      if (focusId !== null) {
        palletInputRefs.current.get(focusId)?.focus();
      } else {
        barcodeRef.current?.focus();
      }
    },
  });

  const adjustQty = trpc.qcScanner.adjustQty.useMutation({
    onSuccess: (data) => {
      if ((data as any).overScan) {
        playBeep("error");
        toast.warning(`⚠️ ${data.item?.sku ?? "Item"} is already at the expected quantity — cannot add more.`, { duration: 4000 });
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.sku === data.item?.sku ? { ...i, scannedQty: data.item!.scannedQty } : i))
      );
      if (data.item?.sku) triggerFlash(data.item.sku);
      if (data.sessionComplete) {
        playBeep("complete");
        toast.success("Order complete!");
        setPhase("complete");
      } else {
        playBeep("success");
      }
    },
  });

  const addPallet = trpc.qcScanner.addPallet.useMutation({
    onSuccess: (data) => {
      // Auto-calculate weight for the pallet that was just closed (the previous last pallet)
      const closingPallet = pallets[pallets.length - 1];
      if (closingPallet && session) {
        calculatePalletWeight.mutate({ sessionId: session.id, palletId: closingPallet.id });
      }
      const newPallet: Pallet = { id: data.id, palletNumber: data.palletNumber, palletUpc: null, palletType: data.palletType ?? null, items: [], palletTareWeightLb: "30" };
      setPallets((prev) => [...prev, newPallet]);
      // Auto-expand the new pallet (keyed by pallet.id) so the scan input is immediately visible
      setExpandedPallets((prev) => new Set([...prev, data.id]));
      // Auto-lock all existing pallets when a new one is added
      setLockedPallets((prev) => {
        const next = new Set(prev);
        palletsRef.current.forEach((p) => next.add(p.id));
        return next;
      });
      // Auto-select the new pallet as the active scan target
      setActiveScanPalletId(data.id);
      activeScanPalletIdRef.current = data.id;
      setTimeout(() => palletInputRefs.current.get(data.id)?.focus(), 100);
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
  // Tare weight input state per pallet (palletId -> string), defaults to '30'
  const [tareWeightInputs, setTareWeightInputs] = useState<Record<number, string>>({});
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

  const updatePalletItems = trpc.qcScanner.updatePalletItems.useMutation();

  const updatePalletTareWeight = trpc.qcScanner.updatePalletTareWeight.useMutation({
    onSuccess: (_, vars) => {
      setPallets((prev) =>
        prev.map((p) => p.id === vars.palletId ? { ...p, palletTareWeightLb: String(vars.tareLb) } : p)
      );
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

  // Auto-focus the active pallet's scan input when a pallet is expanded
  useEffect(() => {
    if (phase !== "scanning") return;
    // Focus the active scan pallet's input (or last pallet if none set)
    const targetId = activeScanPalletIdRef.current ?? (palletsRef.current[palletsRef.current.length - 1]?.id ?? null);
    if (targetId !== null) {
      setTimeout(() => palletInputRefs.current.get(targetId)?.focus(), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePalletTab, phase]);

  // --- Start Screen ----------------------------------------------------------
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
                    const openedPallets = (data.pallets as unknown as Pallet[]) ?? [];
                    setPallets(openedPallets);
                    // Auto-expand the last (active) pallet
                    if (openedPallets.length > 0) setExpandedPallets(new Set(openedPallets.map((p: Pallet) => p.id)));
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

  // --- Scanning / Complete Screen --------------------------------------------

  // Helper: programmatically fire a single scan for a UPC (used by cheat sheet)
  const fireDemoScan = (upc: string) => {
    if (!session || phase !== "scanning") return;
    scanBarcode.mutate({ sessionId: session.id, barcode: upc, scanAsCase: false });
  };

  return (
    <>
    {/* Two-column layout: order details left | scanning + pallets right */}
    <div className="flex-1 flex flex-row overflow-hidden">

    {/* ===== LEFT COLUMN: Order details (header, progress, items table) ===== */}
    <div className="w-[380px] shrink-0 flex flex-col overflow-hidden border-r border-border bg-background">
    {/* Pinned header inside left column — compact */}
    <div className="shrink-0 bg-background border-b border-border pb-2 px-3 pt-2">
      {/* Title row */}
      <div className="flex items-center gap-2 min-w-0">
        <ScanBarcode className="w-4 h-4 text-primary shrink-0" />
        <h1 className="text-base font-bold truncate flex-1">
          {session?.transactionId ? `TX ${session.transactionId}` : session?.referenceNumber}
        </h1>
        {phase === "complete" && <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0 shrink-0">Done</Badge>}
        {/* Action buttons — icon-only with tooltips */}
        <div className="flex gap-1 shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (!session) return;
              fetchFromExtensiv.mutate({ sessionId: session.id, transactionId: session.transactionId ?? 0 });
            }}
            disabled={fetchFromExtensiv.isPending}
            title={fetchFromExtensiv.isPending ? "Loading from Extensiv…" : "Load from Extensiv"}
          >
            {fetchFromExtensiv.isPending
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5 text-blue-500" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => { setFlagBarcode(""); setFlagDialog(true); }}
            title="Flag a scan issue"
          >
            <Flag className="w-3.5 h-3.5 text-amber-500" />
          </Button>
          {(phase === "complete" || allComplete) ? (
            <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700" onClick={() => setCompleteDialog(true)} title="Complete Order">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setCompleteDialog(true)} title="Complete Order">
              Complete
            </Button>
          )}
        </div>
      </div>
      {/* Customer / warehouse / PO — single compact line */}
      <div className="flex gap-2 text-[11px] text-muted-foreground mt-0.5 truncate">
        {session?.customerName && <span className="truncate">{session.customerName}</span>}
        {session?.warehouseName && <span className="shrink-0">· {session.warehouseName}</span>}
        {session?.poNumber && <span className="shrink-0">· PO: {session.poNumber}</span>}
      </div>
      {/* Progress bar — compact */}
      <div className="mt-1.5">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
          <span>{totalScanned} / {totalExpected} units</span>
          <span>{progress}%</span>
        </div>
        <Progress
          value={progress}
          className={`h-1.5 ${allComplete ? "[&>div]:bg-green-500" : ""}`}
        />
      </div>

      {/* Barcode input and Demo Cheat Sheet are now inside the active pallet card */}

      {/* Demo Cheat Sheet placeholder — collapsible panel shown only in demo sessions — MOVED INSIDE PALLET CARD */}
      {isDemoSession && demoUpcMap.length > 0 && false && (
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

      </div>{/* end left column pinned header */}

      {/* Left column scrollable body: items table + error banner */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Extensiv load failure banner */}
        {extensivLoadError && !fetchFromExtensiv.isPending && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mt-3 mb-3 text-amber-800">
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
        <div className="mt-3">
          <ItemsTable
            items={items}
            phase={phase}
            sessionId={session!.id}
            adjustQty={adjustQty}
            isLoading={fetchFromExtensiv.isPending}
            onAdjust={(sku, delta) => {
              // Mirror + / - adjustments into the active pallet's item list
              const targetId = activeScanPalletIdRef.current ?? (palletsRef.current[palletsRef.current.length - 1]?.id ?? null);
              const activePallet = palletsRef.current.find((p) => p.id === targetId) ?? palletsRef.current[palletsRef.current.length - 1];
              if (!activePallet) return;
              setPallets((prev) => prev.map((p) => {
                if (p.id !== activePallet.id) return p;
                const existingItems = (p.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
                const existing = existingItems.find((i) => i.sku === sku);
                let newItems: Array<{ sku: string; upc?: string; qty: number }>;
                if (existing) {
                  const newQty = existing.qty + delta;
                  newItems = newQty <= 0
                    ? existingItems.filter((i) => i.sku !== sku)
                    : existingItems.map((i) => i.sku === sku ? { ...i, qty: newQty } : i);
                } else if (delta > 0) {
                  newItems = [...existingItems, { sku, qty: delta }];
                } else {
                  return p;
                }
                return { ...p, items: newItems };
              }));
            }}
            flashSku={flashSku}
          />
        </div>
      </div>{/* end left column scrollable body */}

    </div>{/* end LEFT COLUMN */}

    {/* ===== RIGHT COLUMN: Pallets toolbar (pinned) + pallet cards (scrollable) ===== */}
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">

      {/* Right column pinned toolbar */}
      <div className="shrink-0 bg-background border-b border-border px-4 pt-3 pb-3">
        {/* Pallets toolbar */}
        {phase === "scanning" && pallets.length > 0 && ((() => {
            const _toolbarExpected = items.reduce((s, i) => s + (i.expectedQty ?? 0), 0);
            const _toolbarScanned = items.reduce((s, i) => s + (i.scannedQty ?? 0), 0);
            const _toolbarRemaining = Math.max(0, _toolbarExpected - _toolbarScanned);
            return (
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-muted-foreground">{pallets.length} pallet{pallets.length !== 1 ? "s" : ""}</h3>
                {_toolbarRemaining > 0 ? (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {_toolbarRemaining} remaining
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    ✓ All scanned
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {/* Weight limit configurator */}
                <div className="flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Limit (lbs):</span>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    className="h-7 w-24 text-xs px-2"
                    value={weightLimitInput}
                    onChange={(e) => setWeightLimitInput(e.target.value)}
                    onBlur={() => {
                      const val = parseFloat(weightLimitInput);
                      if (!isNaN(val) && val > 0) setWeightLimitLb(val);
                      else setWeightLimitInput(String(weightLimitLb));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = parseFloat(weightLimitInput);
                        if (!isNaN(val) && val > 0) setWeightLimitLb(val);
                        else setWeightLimitInput(String(weightLimitLb));
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    title="Max pallet weight before the weight badge turns red"
                  />
                </div>
                {/* Collapse all / Expand all toggle */}
                {pallets.length > 1 && (() => {
                  const allExpanded = pallets.every((p) => expandedPallets.has(p.id));
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (allExpanded) {
                          setExpandedPallets(new Set());
                        } else {
                          setExpandedPallets(new Set(pallets.map((p) => p.id)));
                        }
                      }}
                      title={allExpanded ? "Collapse all pallet cards" : "Expand all pallet cards"}
                    >
                      {allExpanded
                        ? <><ChevronsUpDown className="w-4 h-4 mr-1" />Collapse All</>
                        : <><ChevronsUpDown className="w-4 h-4 mr-1" />Expand All</>}
                    </Button>
                  );
                })()}
                {/* Add Pallet — moved here from session header */}
                <Button
                  size="sm"
                  className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  onClick={() => {
                    if (!session) return;
                    const reuseType =
                      pallets.find((p) => p.palletType)?.palletType ??
                      pallets[pallets.length - 1]?.palletType ??
                      "gd_owned";
                    addPallet.mutate({ sessionId: session.id, palletType: reuseType });
                  }}
                  disabled={addPallet.isPending}
                  title="Add a new pallet (inherits last pallet type)"
                >
                  {addPallet.isPending
                    ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    : <Plus className="w-4 h-4 mr-1" />}
                  Add Pallet
                </Button>
{/* Auto-Assign UPCs removed — label generation now available on the Complete Order screen */}
              </div>
            </div>
            );
          })())}

      </div>{/* end right column pinned toolbar */}

      {/* -- Scrollable pallet cards area (right column) -- */}
      <div ref={palletScrollContainerRef} className="flex-1 overflow-y-auto px-4 pb-4">
        {pallets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No pallets yet. Use the button above to add one.</div>
          ) : (
            /* -- Vertical stack of collapsible pallet cards -- */
            <div className="space-y-2">
              {pallets.map((pallet, palletIdx) => {
                const isExpanded = expandedPallets.has(pallet.id);
                const itemCount = pallet.items?.length ?? 0;
                const hasUpc = !!pallet.palletUpc?.trim();
                const hasWeight = !!(pallet.weightOverrideLb ?? pallet.calculatedWeightLb);
                // isActivePallet = this pallet is the current scan target (or the last pallet if none selected)
                const isLastPallet = palletIdx === pallets.length - 1;
                const isActivePallet = activeScanPalletId !== null ? pallet.id === activeScanPalletId : isLastPallet;
                // isLocked = scan input is hidden; operators must click Unlock to add items
                const isLocked = lockedPallets.has(pallet.id);
                // Remaining = total expected minus total scanned across all items
                const totalExpected = items.reduce((s, i) => s + (i.expectedQty ?? 0), 0);
                const totalScanned = items.reduce((s, i) => s + (i.scannedQty ?? 0), 0);
                const remainingUnits = Math.max(0, totalExpected - totalScanned);
                // Pallet summary stats for collapsed header
                const palletItems = (pallet.items as Array<{ sku: string; qty: number }> | null) ?? [];
                const palletSkuCount = palletItems.length;
                const palletUnitCount = palletItems.reduce((s, i) => s + (i.qty ?? 0), 0);
                const palletWeight = pallet.weightOverrideLb ?? pallet.calculatedWeightLb;
                // Live running weight estimate — derived from demoUpcMap (demo) or calculatedWeightLb (real)
                // For demo sessions: sum(weightLbPerCase / caseAmount * qty) + tare
                // For real sessions: use calculatedWeightLb (updated after each scan by the server)
                const liveWeightLb: number | null = (() => {
                  if (pallet.weightOverrideLb) return parseFloat(pallet.weightOverrideLb);
                  if (isDemoSession && demoUpcMap.length > 0 && palletItems.length > 0) {
                    let totalLb = 0;
                    for (const pi of palletItems) {
                      const demo = demoUpcMap.find((d) => d.sku === pi.sku);
                      if (demo?.weightLbPerCase && demo?.caseAmount) {
                        totalLb += (demo.weightLbPerCase / demo.caseAmount) * pi.qty;
                      }
                    }
                    const tareLb = pallet.palletTareWeightLb ? parseFloat(pallet.palletTareWeightLb) : 30;
                    return totalLb > 0 ? Math.round((totalLb + tareLb) * 10) / 10 : null;
                  }
                  if (pallet.calculatedWeightLb) return parseFloat(pallet.calculatedWeightLb);
                  return null;
                })();
                return (
                  <div key={pallet.id} ref={(el) => { if (el) palletCardRefs.current.set(pallet.id, el); else palletCardRefs.current.delete(pallet.id); }} className={`rounded-lg border overflow-hidden transition-colors ${isActivePallet && !isLocked ? "border-l-4 border-l-blue-500 border-t-blue-200 border-r-blue-200 border-b-blue-200 dark:border-t-blue-800 dark:border-r-blue-800 dark:border-b-blue-800" : "border-border"}`}>
                    {/* -- Collapsed header row -- */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/50 transition-colors text-left cursor-pointer"
                      onClick={() => togglePalletExpand(pallet.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') togglePalletExpand(pallet.id); }}
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
                      {/* Summary: SKUs · units · weight */}
                      {palletSkuCount > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{palletSkuCount}</span> SKU{palletSkuCount !== 1 ? "s" : ""}
                          {" · "}
                          <span className="font-medium text-foreground">{palletUnitCount}</span> unit{palletUnitCount !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Empty</span>
                      )}
                      {/* Live running weight badge — flashes red when over limit */}
                      {liveWeightLb !== null && (() => {
                        const overLimit = liveWeightLb > weightLimitLb;
                        return (
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            overLimit
                              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 weight-over-limit"
                              : pallet.weightOverrideLb
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                            title={overLimit ? `Over ${weightLimitLb} lb limit!` : undefined}
                          >
                            <Scale className="w-3 h-3" />
                            {liveWeightLb} lbs{overLimit ? " ⚠️" : pallet.weightOverrideLb ? " ✎" : isDemoSession ? " ~" : ""}
                          </span>
                        );
                      })()}
                      {/* UPC indicator */}
                      {hasUpc && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <Barcode className="w-3 h-3" /> UPC
                        </span>
                      )}
                      {/* Lock/Unlock button — shown during scanning phase, not on last pallet (which is always unlocked) */}
                      {phase === "scanning" && !isLastPallet && (
                        <button
                          type="button"
                          className={`ml-auto flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border transition-colors shrink-0 ${
                            isLocked
                              ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600"
                              : "border-green-400 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-600"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isLocked) {
                              // Unlock: remove from locked set, set as active scan target, expand, focus
                              setLockedPallets((prev) => { const next = new Set(prev); next.delete(pallet.id); return next; });
                              setActiveScanPalletId(pallet.id);
                              activeScanPalletIdRef.current = pallet.id;
                              setExpandedPallets((prev) => new Set([...prev, pallet.id]));
                              setTimeout(() => palletInputRefs.current.get(pallet.id)?.focus(), 100);
                            } else {
                              // Lock: add to locked set
                              setLockedPallets((prev) => new Set([...prev, pallet.id]));
                              if (activeScanPalletId === pallet.id) {
                                // Switch active target to last pallet
                                const lastId = palletsRef.current[palletsRef.current.length - 1]?.id ?? null;
                                setActiveScanPalletId(lastId);
                                activeScanPalletIdRef.current = lastId;
                                if (lastId) setTimeout(() => palletInputRefs.current.get(lastId)?.focus(), 100);
                              }
                            }
                          }}
                          title={isLocked ? `Unlock Pallet ${pallet.palletNumber} to add more items` : `Lock Pallet ${pallet.palletNumber}`}
                        >
                          {isLocked ? <LockOpen className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {isLocked ? "Unlock" : "Lock"}
                        </button>
                      )}
                      {/* Remaining units badge moved to toolbar — no longer shown per-pallet */}
                      {false && (
                        <span className="hidden">
                        </span>
                      )}
                      {/* Print buttons — only visible once order is complete */}
                      {phase === "complete" && (
                        <div className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await ensurePalletUpcs();
                              window.open(`/api/pdf/qc-gd-labels/${session!.id}?type=gd&palletId=${pallet.id}`, "_blank");
                            }}
                          >
                            <Printer className="w-3 h-3 mr-1" /> GD
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await ensurePalletUpcs();
                              window.open(`/api/pdf/qc-gd-labels/${session!.id}?type=sscc&palletId=${pallet.id}`, "_blank");
                            }}
                          >
                            <Printer className="w-3 h-3 mr-1" /> SSCC
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* -- Expanded body -- */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        <Card className="rounded-none border-0 shadow-none">
                          {/* Barcode input — shown only when pallet is unlocked during scanning */}
                          {phase === "scanning" && !isLocked && (
                            <div className="px-4 pt-4 space-y-2">
                              <form onSubmit={(e) => {
                                e.preventDefault();
                                if (!barcodeInput.trim() || !session) return;
                                // Always route to THIS pallet's form
                                setActiveScanPalletId(pallet.id);
                                activeScanPalletIdRef.current = pallet.id;
                                scanBarcode.mutate({ sessionId: session.id, barcode: barcodeInput.trim(), scanAsCase });
                              }} className="flex gap-2">
                                <Input
                                  ref={(el) => {
                                    if (el) palletInputRefs.current.set(pallet.id, el);
                                    else palletInputRefs.current.delete(pallet.id);
                                    if (isActivePallet && el) (barcodeRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                                  }}
                                  value={barcodeInput}
                                  onChange={(e) => setBarcodeInput(e.target.value)}
                                  onFocus={() => {
                                    setActiveScanPalletId(pallet.id);
                                    activeScanPalletIdRef.current = pallet.id;
                                    void preloadSounds();
                                  }}
                                  placeholder={`Scan into Pallet ${pallet.palletNumber}…`}
                                  className={`text-lg h-12 font-mono ${isActivePallet ? "ring-2 ring-primary" : ""}`}
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
                              {/* Demo Cheat Sheet removed — operators scan using the barcode input directly */}
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
                            </div>
                          )}
                    <CardContent>
                      {/* Live scanned items table — always visible, populates as items are scanned */}
                      <div className="rounded-lg overflow-hidden border border-border mb-3">
                        <div
                          className="grid text-white text-xs font-bold uppercase tracking-wide"
                          style={{ gridTemplateColumns: "1fr 80px", background: "#15527f", padding: "0 8px", height: 30, alignItems: "center" }}
                        >
                          <span>SKU</span>
                          <span className="text-right">Qty</span>
                        </div>
                        {(!pallet.items || pallet.items.length === 0) ? (
                          <div className="px-3 py-4 text-xs text-muted-foreground italic text-center">Scan items to populate this pallet…</div>
                        ) : (
                          (pallet.items as Array<{ sku: string; upc?: string; qty: number }>).map((item, i) => (
                            <div
                              key={i}
                              className="grid items-center text-sm border-b border-[#CDD4DC] last:border-0"
                              style={{ gridTemplateColumns: "1fr 80px", background: i % 2 === 1 ? "#EEF4FB" : "#ffffff", padding: "6px 8px" }}
                            >
                              <span className="font-mono text-xs">{item.sku}</span>
                              <span className="text-right font-semibold text-sm">×{item.qty}</span>
                            </div>
                          ))
                        )}
                        {/* Live weight footer row */}
                        {(pallet.calculatedWeightLb || pallet.weightOverrideLb) && (
                          <div
                            className="grid items-center border-t-2 border-[#15527f]"
                            style={{ gridTemplateColumns: "1fr 80px", background: "#f0f7ff", padding: "6px 8px" }}
                          >
                            <span className="text-xs font-bold text-[#15527f] uppercase tracking-wide">Total Weight</span>
                            <span className="text-right font-bold text-sm text-[#15527f]">
                              {pallet.weightOverrideLb ? (
                                <span className="text-orange-600">{pallet.weightOverrideLb} lbs</span>
                              ) : (
                                `${pallet.calculatedWeightLb} lbs`
                              )}
                            </span>
                          </div>
                        )}
                      </div>
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
                            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Pallet Tare (lbs):</label>
                            <Input
                              type="number"
                              min="0"
                              max="500"
                              step="1"
                              className="h-7 w-20 text-xs"
                              placeholder="30"
                              value={tareWeightInputs[pallet.id] ?? (pallet.palletTareWeightLb ?? "30")}
                              onChange={(e) => setTareWeightInputs((prev) => ({ ...prev, [pallet.id]: e.target.value }))}
                              onBlur={() => {
                                const val = parseFloat(tareWeightInputs[pallet.id] ?? "30");
                                if (!isNaN(val) && val >= 0) {
                                  updatePalletTareWeight.mutate({ palletId: pallet.id, tareLb: val });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const val = parseFloat(tareWeightInputs[pallet.id] ?? "30");
                                  if (!isNaN(val) && val >= 0) {
                                    updatePalletTareWeight.mutate({ palletId: pallet.id, tareLb: val });
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

      </div>{/* end scrollable pallet cards area */}
    </div>{/* end RIGHT COLUMN */}

    </div>{/* end two-column wrapper */}
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

            {/* Pallet Labels — only shown once order is complete */}
            {pallets.length > 0 && phase === "complete" && (
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
    </>
  );
}
