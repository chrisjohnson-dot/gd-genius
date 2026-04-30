import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ScanBarcode, CheckCircle2, AlertTriangle, Flag, Plus, Minus,
  Package, Layers, ClipboardList, ChevronRight, RefreshCw, Download, X,
  Barcode, Wand2, Pencil, Copy, Printer, FileText, FlaskConical, ChevronDown, Scale, PackagePlus,
  Lock, LockOpen, ChevronsUpDown, Volume2, VolumeX, Loader2, Truck, MapPin, Send, Weight
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
  muLabel?: string | null;
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
  warehouseId: number | null;
  poNumber: string | null;
  completedAt: Date | null;
  destinationAddress: string | null;
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

// Module-level mute flag — updated by the component's toggleMute callback
let _soundMuted = false;
function setSoundMutedFlag(muted: boolean) { _soundMuted = muted; }

function playBeep(type: "success" | "error" | "complete") {
  if (_soundMuted) return;
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
  onRowRef,
  showCaseBadge,
}: {
  items: ScanItem[];
  phase: Phase;
  sessionId: number;
  adjustQty: ReturnType<typeof trpc.qcScanner.adjustQty.useMutation>;
  isLoading?: boolean;
  onAdjust?: (sku: string, delta: number) => void;
  flashSku?: string | null;
  onRowRef?: (sku: string, el: HTMLDivElement | null) => void;
  showCaseBadge?: boolean;
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

  // Compact QC view: SKU | Description | [Case] | Req | − Scanned +
  const hasCaseAmounts = showCaseBadge && items.some((i) => (i.caseAmount ?? 1) > 1);
  const cols = phase === "scanning"
    ? hasCaseAmounts ? "100px 1fr 46px 44px 90px" : "100px 1fr 44px 90px"
    : hasCaseAmounts ? "100px 1fr 46px 44px 56px" : "100px 1fr 44px 56px";
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      {/* Header */}
      <div
        className="grid text-white text-[11px] font-bold uppercase tracking-wide"
        style={{ gridTemplateColumns: cols, background: "#15527f", padding: "0 8px", height: 28, alignItems: "center" }}
      >
        <span>SKU</span>
        <span>Description</span>
        {hasCaseAmounts && <span className="text-right">Case</span>}
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
            ref={(el) => onRowRef?.(item.sku, el)}
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
            {/* Case amount badge */}
            {hasCaseAmounts && (
              <div className="text-right">
                {(item.caseAmount ?? 1) > 1 ? (
                  <span className="inline-block text-[10px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 tabular-nums">
                    ×{item.caseAmount}
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400">—</span>
                )}
              </div>
            )}
            {/* Required qty */}
            <div className="text-right text-xs font-semibold text-[#333333]">
              {item.expectedQty}
            </div>

            {/* Scanned qty with optional +/- controls */}
            <div className="flex items-center justify-end gap-0.5">
              {phase === "scanning" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 p-0"
                  disabled={item.scannedQty <= 0}
                  onClick={() => { adjustQty.mutate({ sessionId, sku: item.sku, delta: -1 }); onAdjust?.(item.sku, -1); }}
                >
                  <Minus className="w-2.5 h-2.5" />
                </Button>
              )}
              <span className={`font-bold text-xs tabular-nums w-6 text-center ${
                over ? "text-amber-600" : done ? "text-green-600" : "text-[#333333]"
              }`}>
                {item.scannedQty}
              </span>
              {phase === "scanning" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 p-0"
                  disabled={item.scannedQty >= item.expectedQty}
                  onClick={() => { adjustQty.mutate({ sessionId, sku: item.sku, delta: 1 }); onAdjust?.(item.sku, 1); }}
                >
                  <Plus className="w-2.5 h-2.5" />
                </Button>
              )}
              {phase !== "scanning" && (
                <span className="ml-0.5 text-xs">
                  {done && !over && <span className="text-green-500">✓</span>}
                  {over && <span className="text-amber-500">⚠</span>}
                </span>
              )}
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
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<ScanItem[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanAsCase, setScanAsCase] = useState(false);
  const [scanAsMu, setScanAsMu] = useState(false);
  const [lastScan, setLastScan] = useState<{ sku: string; found: boolean } | null>(null);
  // Admin-only manual quantity entry
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualSku, setManualSku] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [flagDialog, setFlagDialog] = useState(false);
  const [flagBarcode, setFlagBarcode] = useState("");
  const [flagDesc, setFlagDesc] = useState("");
  const [completeDialog, setCompleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  // Per-pallet weight breakdown (palletId → skuBreakdown) stored after Calculate
  type SkuBreakdownEntry = { sku: string; qty: number; perUnitWeightLb: number | null; totalWeightLb: number | null; source: 'carton' | 'imperial' | 'none' };
  const [palletWeightBreakdown, setPalletWeightBreakdown] = useState<Record<number, SkuBreakdownEntry[]>>({});
  const [zeroWeightAlert, setZeroWeightAlert] = useState<{ palletId: number; skus: string[] } | null>(null);
  // Dock location recommendation shown after session completes
  const [dockRecommendDialog, setDockRecommendDialog] = useState(false);
  const [missingShipToWarning, setMissingShipToWarning] = useState<{ pendingUrl: string } | null>(null);
  const [shipwellDialog, setShipwellDialog] = useState(false);
  const [assignedStagingLane, setAssignedStagingLane] = useState<string | null>(null);
  const [completedSessionInfo, setCompletedSessionInfo] = useState<{ sessionId: number; configId: number | null; palletCount: number; customerName: string | null; transactionId: number | null; customerId: number | null } | null>(null);
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

  // On mount: read ?txId= or ?sessionId= URL params.
  // pendingTxId is consumed after startSession is defined (see useEffect below).
  const [pendingUrlTxId, setPendingUrlTxId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("txId");
    if (v) { const n = parseInt(v, 10); return (!isNaN(n) && n > 0) ? n : null; }
    return null;
  });
  const [pendingUrlSessionId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("sessionId");
    if (v) { const n = parseInt(v, 10); return (!isNaN(n) && n > 0) ? n : null; }
    return null;
  });

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
    onError: (e) => toast.error(e.message, { duration: Infinity }),
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
  // Sound mute toggle — persisted in localStorage
  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    try { return localStorage.getItem("qc_sound_muted") === "1"; } catch { return false; }
  });
  const toggleMute = useCallback(() => {
    setSoundMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem("qc_sound_muted", next ? "1" : "0"); } catch { /* ignore */ }
      setSoundMutedFlag(next);
      return next;
    });
  }, []);
  // Sync initial mute state to module-level flag
  useEffect(() => { setSoundMutedFlag(soundMuted); }, [soundMuted]);
  // Ctrl+Enter keyboard shortcut — opens the Complete Order dialog when in scanning phase
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && phase === "scanning" && !completeDialog) {
        e.preventDefault();
        setCompleteDialog(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, completeDialog]);
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
  // Per-item row refs — keyed by SKU for auto-scroll on flash
  const itemRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Ref to the left column scrollable body
  const leftScrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the left column to the flashed SKU row whenever flashSku changes
  useEffect(() => {
    if (!flashSku) return;
    const row = itemRowRefs.current.get(flashSku);
    const container = leftScrollContainerRef.current;
    if (!row || !container) return;
    const rowTop = row.offsetTop - container.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const isVisible = rowTop >= containerTop && rowBottom <= containerBottom;
    if (!isVisible) {
      container.scrollTo({ top: rowTop - 12, behavior: "smooth" });
    }
  }, [flashSku]);

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
      // Silently refresh case amounts — ensures correct inventoryUnitsPerUnit is stored
      // (fixes sessions seeded before the Extensiv field-name fix)
      if (session?.id) {
        refreshCaseAmounts.mutate({ sessionId: session.id });
      }

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
      // Set the correct phase based on session status — a completed session should open in "complete" view
      const resumedPhase = (data.resumed && (sess as any).status === "complete") ? "complete" : "scanning";
      setPhase(resumedPhase);
      if (data.resumed) {
        const statusLabel = (sess as any).status === "complete" ? "Viewing completed session" : "Resumed session";
        toast.info(`${statusLabel} for TX ${sess?.transactionId ?? sess?.referenceNumber}`);
        if (resumedPhase === "scanning") setTimeout(() => barcodeRef.current?.focus(), 100);
        // Silently refresh case amounts and carton weights in the background for sessions seeded before the fix
        const loadedItems = (data.items as ScanItem[]) ?? [];
        const needsCaseRefresh = loadedItems.some((i) => (i.caseAmount ?? 1) <= 1);
        if (sess?.id && needsCaseRefresh) {
          refreshCaseAmounts.mutate({ sessionId: sess.id });
        }
        // Always refresh carton weights on resume — they may not have been populated
        const needsWeightRefresh = loadedItems.some((i) => (i as any).cartonWeightLb == null);
        if (sess?.id && needsWeightRefresh) {
          refreshCartonWeights.mutate({ sessionId: sess.id });
        }
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
    onError: (e) => toast.error(e.message, { duration: Infinity }),
  });

  // Consume URL params now that startSession is defined.
  // ?txId= → resume/open via startSession (handles both scanning and complete sessions)
  // ?sessionId= → open the session detail dialog (legacy fallback)
  useEffect(() => {
    if (pendingUrlTxId) {
      setPendingUrlTxId(null);
      startSession.mutate({ transactionId: pendingUrlTxId });
    } else if (pendingUrlSessionId) {
      setSelectedSessionId(pendingUrlSessionId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanBarcode = trpc.qcScanner.scanBarcode.useMutation({
    onSuccess: (data) => {
      console.log("[QcScanner] scanBarcode result:", JSON.stringify({ found: data.found, overScan: (data as any).overScan, sessionComplete: data.sessionComplete }));
      if (!data.found) {
        // Auto-fallback: try the barcode as an MU label before showing an error.
        // The active pallet at the time of scan is captured in activeScanPalletIdRef.
        const muPalletId = activeScanPalletIdRef.current ?? (palletsRef.current[palletsRef.current.length - 1]?.id ?? null);
        const sessionRef = session;
        if (muPalletId && sessionRef) {
          console.log(`[QcScanner] UPC not found — auto-trying as MU label: ${barcodeInput}`);
          scanMu.mutate({
            sessionId: sessionRef.id,
            muLabel: barcodeInput.trim(),
            palletId: muPalletId,
            palletType: palletsRef.current.find((p) => p.id === muPalletId)?.palletType ?? undefined,
          });
          return; // scanMu.onSuccess/onError will handle feedback
        }
        playBeep("error");
        setLastScan({ sku: barcodeInput, found: false });
        toast.warning("SKU/UPC not found in this order", { description: "Use the Flag button to log it.", duration: Infinity });
      } else if ((data as any).overScan) {
        // Hard block — play a double-buzz error and show a persistent red banner
        playBeep("error");
        setTimeout(() => playBeep("error"), 300);
        setLastScan({ sku: data.item?.sku ?? barcodeInput, found: false });
        toast.error(`⛔ Over-scan blocked — ${data.item?.sku ?? barcodeInput} is already at 100%`, {
          description: "Remove the extra unit or adjust the expected quantity.",
          duration: Infinity,
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
          // Use the server-committed scannedQty as the cap source of truth.
          // The server uses LEAST(scannedQty + amount, expectedQty), so data.item.scannedQty
          // is the actual committed value. We compute how much was actually added vs requested.
          const committedTotal = data.item?.scannedQty ?? 0;
          const expectedQty = data.item?.expectedQty ?? Infinity;
          // Optimistically update pallet items in local state
          setPallets((prev) => prev.map((p) => {
            if (p.id !== activePallet.id) return p;
            const existingItems = (p.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
            const existing = existingItems.find((i) => i.sku === scannedSku);
            // Cap the pallet qty: never let the pallet show more than expectedQty for this SKU
            const prevPalletQty = existing?.qty ?? 0;
            const newPalletQty = Math.min(prevPalletQty + scannedAmount, expectedQty);
            const newItems = existing
              ? existingItems.map((i) => i.sku === scannedSku ? { ...i, qty: newPalletQty } : i)
              : [...existingItems, { sku: scannedSku, upc: scannedUpc, qty: Math.min(scannedAmount, expectedQty) }];
            void committedTotal; // used for reference — pallet qty is capped independently per-pallet
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
                duration: Infinity,
              });
            }
          } else if (activePallet.calculatedWeightLb) {
            const w = parseFloat(activePallet.calculatedWeightLb);
            if (w > weightLimitLbRef.current && !overLimitToastedRef.current.has(activePallet.id)) {
              overLimitToastedRef.current.add(activePallet.id);
              playBeep("error");
              toast.warning(`⚠️ Pallet ${activePallet.palletNumber} exceeds weight limit`, {
                description: `${w} lbs — over the ${weightLimitLbRef.current} lb threshold. Consider starting a new pallet.`,
                duration: Infinity,
              });
            }
          }
          // Persist pallet item assignments to server so they survive page refresh
          // Use the already-updated palletsRef (after setPallets above) to get the capped qty
          const latestPallet = palletsRef.current.find((p) => p.id === activePallet.id);
          const existingItemsForPersist = (latestPallet?.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
          const existingForPersist = existingItemsForPersist.find((i) => i.sku === scannedSku);
          // Use server-committed scannedQty capped at expectedQty — never write over-count to DB
          const cappedPersistQty = Math.min(committedTotal, expectedQty === Infinity ? committedTotal : expectedQty);
          const newItemsForPersist = existingForPersist
            ? existingItemsForPersist.map((i) => i.sku === scannedSku ? { ...i, qty: cappedPersistQty } : i)
            : [...existingItemsForPersist, { sku: scannedSku, upc: scannedUpc, qty: cappedPersistQty }];
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
      toast.error(e.message, { duration: Infinity });
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
        toast.warning(`⚠️ ${data.item?.sku ?? "Item"} is already at the expected quantity — cannot add more.`, { duration: Infinity });
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.sku === data.item?.sku ? { ...i, scannedQty: data.item!.scannedQty } : i))
      );
      if (data.item?.sku) triggerFlash(data.item.sku);
      // Persist pallet item assignments so they survive page refresh and appear on labels
      if (data.item?.sku && activeScanPalletIdRef.current !== null) {
        const palletId = activeScanPalletIdRef.current;
        const latestPallet = palletsRef.current.find((p) => p.id === palletId);
        const existingItems = (latestPallet?.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
        const committedQty = data.item.scannedQty ?? 0;
        const expectedQty = items.find((i) => i.sku === data.item!.sku)?.expectedQty ?? committedQty;
        const cappedQty = Math.min(committedQty, expectedQty);
        const newItems = existingItems.find((i) => i.sku === data.item!.sku)
          ? existingItems.map((i) => i.sku === data.item!.sku ? { ...i, qty: cappedQty } : i)
          : [...existingItems, { sku: data.item.sku, qty: cappedQty }];
        updatePalletItems.mutate({ palletId, items: newItems });
      }
      if (data.sessionComplete) {
        playBeep("complete");
        toast.success("Order complete!");
        setPhase("complete");
      } else {
        playBeep("success");
      }
    },
  });

  const refreshCaseAmounts = trpc.qcScanner.refreshCaseAmounts.useMutation({
    onSuccess: (data) => {
      if (data.updatedCount > 0) {
        const updatedItems = data.items as ScanItem[];
        setItems(updatedItems);
        // Auto-enable Case mode if every item now has a case amount > 1
        const allHaveCase = updatedItems.length > 0 && updatedItems.every((i) => (i.caseAmount ?? 1) > 1);
        if (allHaveCase) setScanAsCase(true);
        toast.success(`Case quantities updated (${data.updatedCount} SKU${data.updatedCount !== 1 ? "s" : ""})`, {
          description: allHaveCase
            ? "Case mode auto-enabled — every item has a case quantity configured."
            : "Case mode will now scan the correct quantity per scan.",
          duration: 4000,
        });
      }
    },
    onError: () => { /* silently ignore — non-critical */ },
  });

  const refreshCartonWeights = trpc.qcScanner.refreshCartonWeights.useMutation({
    onSuccess: (data) => {
      if (data.updatedCount > 0) {
        setItems(data.items as ScanItem[]);
        toast.success(`Carton weights loaded (${data.updatedCount} SKU${data.updatedCount !== 1 ? "s" : ""})`, {
          description: "Press Calculate on each pallet to update the weight totals.",
          duration: 4000,
        });
      }
    },
    onError: () => { /* silently ignore — non-critical */ },
  });

  const scanMu = trpc.qcScanner.scanMu.useMutation({
    onSuccess: (data) => {
      if (data.notFound) {
        playBeep("error");
        setLastScan({ sku: data.muLabel, found: false });
        toast.error(`MU not found: ${data.muLabel}`, {
          description: "This MU label was not found in Extensiv. Check the label and try again.",
          duration: 5000,
        });
        setBarcodeInput("");
        return;
      }
      playBeep("success");
      // Update scanned quantities in the item list
      setItems((prev) =>
        prev.map((item) => {
          const muItem = data.muItems.find((m: { sku: string; qty: number }) => m.sku === item.sku);
          if (!muItem) return item;
          return { ...item, scannedQty: Math.min(item.scannedQty + muItem.qty, item.expectedQty) };
        })
      );
      // Update pallets: fill the current pallet with MU items
      setPallets((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== data.palletId) return p;
          const merged = [...(p.items ?? [])];
          for (const muItem of data.muItems as Array<{ sku: string; qty: number }>) {
            const ex = merged.find((i) => i.sku === muItem.sku);
            if (ex) ex.qty = (ex.qty ?? 0) + muItem.qty;
            else merged.push({ sku: muItem.sku, qty: muItem.qty });
          }
          return { ...p, items: merged, calculatedWeightLb: data.calculatedWeightLb ? String(data.calculatedWeightLb) : p.calculatedWeightLb };
        });
        // Add next pallet if one was created
        if (data.nextPalletId && !updated.find((p) => p.id === data.nextPalletId)) {
          updated.push({ id: data.nextPalletId, palletNumber: data.nextPalletNumber!, items: [], palletType: null });
        }
        return updated;
      });
      // Expand and activate the next pallet
      if (data.nextPalletId) {
        setActiveScanPalletId(data.nextPalletId);
        activeScanPalletIdRef.current = data.nextPalletId;
        setExpandedPallets((prev) => new Set([...prev, data.nextPalletId!]));
        setTimeout(() => {
          const nextInput = palletInputRefs.current.get(data.nextPalletId!);
          if (nextInput) nextInput.focus();
        }, 150);
      }
      setBarcodeInput("");
      setScanAsMu(false);
      const skuSummary = data.muItems.map((m: { sku: string; qty: number }) => `${m.sku} ×${m.qty}`).join(", ");
      toast.success(`MU ${data.muLabel} imported as Pallet ${data.palletNumber}`, {
        description: skuSummary,
        duration: 5000,
      });
      if (data.sessionComplete) {
        playBeep("complete");
        toast.success("Order complete!");
        setPhase("complete");
      }
    },
    onError: (err) => {
      playBeep("error");
      toast.error("MU scan failed", { description: err.message });
      setBarcodeInput("");
    },
  });

  const manualSetQty = trpc.qcScanner.manualSetQty.useMutation({
    onSuccess: (data) => {
      setItems((prev) =>
        prev.map((i) => (i.sku === data.item?.sku ? { ...i, scannedQty: data.item!.scannedQty } : i))
      );
      if (data.item?.sku) triggerFlash(data.item.sku);
      setManualEntryOpen(false);
      setManualSku("");
      setManualQty("");
      toast.success(`✓ ${data.item?.sku ?? "Item"} manually set to ${data.item?.scannedQty ?? 0}`);
      if (data.sessionComplete) {
        playBeep("complete");
        toast.success("Order complete!");
        setPhase("complete");
      }
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to set quantity");
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
    onError: (e) => toast.error(e.message, { duration: Infinity }),
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
    onError: (e) => toast.error(e.message, { duration: Infinity }),
  });

  const generatePalletUpc = trpc.qcScanner.generatePalletUpc.useMutation({
    onSuccess: (data) => {
      setPallets((prev) =>
        prev.map((p) => p.id === data.palletId ? { ...p, palletUpc: data.upc } : p)
      );
      toast.success(`Auto-generated UPC: ${data.upc}`);
    },
    onError: (e) => toast.error(e.message, { duration: Infinity }),
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
    onError: (e) => toast.error(e.message, { duration: Infinity }),
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
    onError: (e) => toast.error(e.message, { duration: Infinity }),
  });

  const updatePalletItems = trpc.qcScanner.updatePalletItems.useMutation();

  const updatePalletTareWeight = trpc.qcScanner.updatePalletTareWeight.useMutation({
    onSuccess: (_, vars) => {
      setPallets((prev) =>
        prev.map((p) => p.id === vars.palletId ? { ...p, palletTareWeightLb: String(vars.tareLb) } : p)
      );
    },
    onError: (e) => toast.error(e.message, { duration: Infinity }),
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
    onError: (e) => toast.error(e.message, { duration: Infinity }),
  });

  const calculatePalletWeight = trpc.qcScanner.calculatePalletWeight.useMutation({
    onSuccess: (data, vars) => {
      if (data.weightLb !== null) {
        setPallets((prev) =>
          prev.map((p) => p.id === vars.palletId ? { ...p, calculatedWeightLb: String(data.weightLb) } : p)
        );
        // Store per-SKU breakdown for tooltip display
        if (data.skuBreakdown?.length) {
          setPalletWeightBreakdown((prev) => ({ ...prev, [vars.palletId]: data.skuBreakdown }));
        }
        // Show zero-weight alert if any SKUs had no weight data
        if (data.zeroWeightSkus?.length) {
          setZeroWeightAlert({ palletId: vars.palletId, skus: data.zeroWeightSkus });
        }
        toast.success(`Calculated weight: ${data.weightLb} lbs`);
      } else {
        toast.info("Weight could not be calculated — item dims may be missing in Extensiv");
      }
    },
    onError: (e) => toast.error(e.message, { duration: Infinity }),
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
      toast.error('Failed to auto-assign UPCs — printing with available data', { duration: Infinity });
    }
  };

  const flagScan = trpc.qcScanner.flagScan.useMutation({
    onSuccess: () => {
      toast.success("Scan flagged for review");
      setFlagDialog(false);
      setFlagBarcode("");
      setFlagDesc("");
    },
    onError: (e) => toast.error(e.message, { duration: Infinity }),
  });

  const flagsQuery = trpc.qcScanner.listFlaggedBySession.useQuery(
    { sessionId: session?.id ?? 0 },
    { enabled: !!session && completeDialog }
  );
  const openFlags = (flagsQuery.data?.flags ?? []).filter((f) => f.status === "open");

  const completeSession = trpc.qcScanner.completeSession.useMutation({
    onSuccess: (data) => {
      if (data.packedInExtensiv) {
        toast.success("Session completed — order marked as Packed in Extensiv");
      } else if (data.packError) {
        // Session saved locally but Extensiv pack failed — warn, don't block
        toast.success("Session completed and saved");
        toast.warning(`Could not mark order as Packed in Extensiv: ${data.packError}`, { duration: Infinity });
      } else {
        toast.success("Session completed and saved");
      }
      // Capture session info for dock recommendation before clearing state
      setCompletedSessionInfo({
        sessionId: session?.id ?? 0,
        configId: session?.warehouseId ?? null,
        palletCount: pallets.length,
        customerName: session?.customerName ?? null,
        transactionId: session?.transactionId ?? null,
        customerId: (session as any)?.customerId ?? null,
      });
      setPhase("start");
      setSession(null);
      setItems([]);
      setPallets([]);
      setTxInput("");
      setCompleteDialog(false);
      setConfirmText("");
      // Show dock recommendation dialog
      setDockRecommendDialog(true);
    },
    onError: (e) => toast.error(e.message, { duration: Infinity }),
  });

  const retryPackInExtensiv = trpc.qcScanner.retryPackInExtensiv.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Order successfully marked as Packed in Extensiv");
      // Optimistically update the local cache so the badge flips to ✓ Packed immediately
      trpcUtils.qcScanner.recentSessions.setData(
        { limit: sessionLimit },
        (old) => {
          if (!old) return old;
          return {
            sessions: old.sessions.map((s) =>
              s.id === variables.sessionId ? { ...s, packedInExtensiv: true } : s
            ),
          };
        }
      );
    },
    onError: (e) => toast.error(`Retry failed: ${e.message}`, { duration: Infinity }),
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
                  gridTemplateColumns: "1fr 160px 90px 90px 90px 60px 80px",
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
                <span className="text-right">Case</span>
                <span className="text-right">Extensiv</span>
              </div>
              {filteredRecent.map((s, idx) => {
                const isAlt = idx % 2 === 1;
                const allScanned = s.totalScanned >= s.totalExpected && s.totalExpected > 0;
                const isPending = s.foundInExtensiv && !s.packedInExtensiv;
                // Amber tint for unsynced rows, otherwise alternate white/blue
                const rowBg = isPending
                  ? isAlt ? "#FEF3C7" : "#FFFBEB"
                  : isAlt ? "#EEF4FB" : "#ffffff";
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className="grid w-full text-left text-sm border-b border-[#CDD4DC] last:border-0 hover:brightness-95 transition-all cursor-pointer"
                    style={{
                      gridTemplateColumns: "1fr 160px 90px 90px 90px 60px 80px",
                      background: rowBg,
                      minHeight: 44,
                      padding: "6px 12px",
                      alignItems: "center",
                    }}
                    onClick={() => setSelectedSessionId(s.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedSessionId(s.id); }}
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
                    {/* Case configured badge */}
                    <div className="flex justify-end">
                      {s.allCaseConfigured ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold"
                          title="All items have case quantities configured in Extensiv"
                        >
                          ✓ Case
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                    {/* Extensiv pack sync status badge */}
                    <div className="flex justify-end">
                      {!s.foundInExtensiv ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium" title="Manual label — no Extensiv order">N/A</span>
                      ) : s.packedInExtensiv ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold" title="Order marked as Packed in Extensiv">✓ Packed</span>
                      ) : (
                        <button
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold hover:bg-amber-200 transition-colors disabled:opacity-50"
                          title="Click to retry marking this order as Packed in Extensiv"
                          disabled={retryPackInExtensiv.isPending && retryPackInExtensiv.variables?.sessionId === s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            retryPackInExtensiv.mutate({ sessionId: s.id });
                          }}
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${
                            retryPackInExtensiv.isPending && retryPackInExtensiv.variables?.sessionId === s.id
                              ? "animate-spin"
                              : ""
                          }`} />
                          Pending
                        </button>
                      )}
                    </div>
                  </div>
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
                {sessionSummaryQuery.data.session.createdBy && (
                  <><span className="text-muted-foreground">QC Operator</span><span className="font-medium">{sessionSummaryQuery.data.session.createdBy}</span></>
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
                    style={{ gridTemplateColumns: "110px 1fr 70px 70px", background: "#15527f", padding: "0 10px", height: 32, alignItems: "center" }}
                  >
                    <span>SKU</span>
                    <span>Description</span>
                    <span className="text-right">Req</span>
                    <span className="text-right">Scanned</span>
                  </div>
                  {sessionSummaryQuery.data.items.map((item, idx) => {
                    const done = item.scannedQty >= item.expectedQty && item.expectedQty > 0;
                    const over = item.scannedQty > item.expectedQty;
                    const timestamps = (item.scanTimestamps as number[] | null) ?? [];
                    const firstScan = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
                    const lastScan = timestamps.length > 1 ? new Date(Math.max(...timestamps)).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
                    return (
                      <div
                        key={item.id}
                        className="grid text-sm border-b border-[#CDD4DC] last:border-0"
                        style={{
                          gridTemplateColumns: "110px 1fr 70px 70px",
                          background: over ? "#FFF8E7" : done ? "#F0FDF4" : idx % 2 === 1 ? "#EEF4FB" : "#ffffff",
                          padding: "5px 10px",
                          alignItems: "start",
                        }}
                      >
                        <span className="font-mono text-xs text-[#15527f] truncate pt-0.5">{item.sku}</span>
                        <div className="pr-2">
                          <span className="text-xs text-[#333333] block leading-tight">{item.description ?? "—"}</span>
                          {firstScan && (
                            <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                              {firstScan}{lastScan ? ` – ${lastScan}` : ""} · {timestamps.length} scan{timestamps.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <span className="text-right text-xs font-mono text-[#333333] pt-0.5">{item.expectedQty}</span>
                        <span className={`text-right text-xs font-semibold font-mono pt-0.5 ${
                          over ? "text-amber-600" : done ? "text-green-600" : "text-[#333333]"
                        }`}>{item.scannedQty}</span>
                      </div>
                    );
                  })}
                  {/* Totals footer */}
                  <div
                    className="grid text-sm font-bold"
                    style={{ gridTemplateColumns: "110px 1fr 70px 70px", background: "#EDFAEB", borderTop: "2px solid #CDD4DC", padding: "5px 10px", alignItems: "center" }}
                  >
                    <span className="text-xs text-[#15527f] uppercase tracking-wide col-span-2">Total</span>
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
    {/* Read-only banner — shown when viewing a completed session */}
    {phase === "complete" && (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span>This session is complete — read-only view. Scanning is disabled.</span>
        <span className="ml-auto text-green-200 font-normal text-xs">
          {session?.completedAt ? `Completed ${new Date(session.completedAt).toLocaleString()}` : ""}
        </span>
      </div>
    )}
    {/* Two-column layout: order details left | scanning + pallets right */}
    <div className="flex-1 flex flex-row overflow-hidden">

    {/* ===== LEFT COLUMN: Order details (header, progress, items table) ===== */}
    <div className="w-[40%] shrink-0 flex flex-col overflow-hidden border-r border-border bg-background">
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
      <div ref={leftScrollContainerRef} className="flex-1 overflow-y-auto px-4 pb-4">
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
            showCaseBadge={scanAsCase}
            onAdjust={(sku, delta) => {
              // Mirror + / - adjustments into the active pallet's item list,
              // capped at the item's expectedQty to match server-side enforcement
              const targetId = activeScanPalletIdRef.current ?? (palletsRef.current[palletsRef.current.length - 1]?.id ?? null);
              const activePallet = palletsRef.current.find((p) => p.id === targetId) ?? palletsRef.current[palletsRef.current.length - 1];
              if (!activePallet) return;
              // Look up the server-enforced expected qty for this SKU
              const orderItem = items.find((i) => i.sku === sku);
              const maxQty = orderItem?.expectedQty ?? Infinity;
              setPallets((prev) => prev.map((p) => {
                if (p.id !== activePallet.id) return p;
                const existingItems = (p.items as Array<{ sku: string; upc?: string; qty: number }> | null) ?? [];
                const existing = existingItems.find((i) => i.sku === sku);
                let newItems: Array<{ sku: string; upc?: string; qty: number }>;
                if (existing) {
                  const newQty = Math.min(Math.max(0, existing.qty + delta), maxQty);
                  newItems = newQty <= 0
                    ? existingItems.filter((i) => i.sku !== sku)
                    : existingItems.map((i) => i.sku === sku ? { ...i, qty: newQty } : i);
                } else if (delta > 0) {
                  newItems = [...existingItems, { sku, qty: Math.min(delta, maxQty) }];
                } else {
                  return p;
                }
                return { ...p, items: newItems };
              }));
            }}
            flashSku={flashSku}
            onRowRef={(sku, el) => {
              if (el) itemRowRefs.current.set(sku, el);
              else itemRowRefs.current.delete(sku);
            }}
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
                {/* Refresh Case Qty */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (session) refreshCaseAmounts.mutate({ sessionId: session.id }); }}
                  disabled={refreshCaseAmounts.isPending}
                  title="Re-fetch case pack quantities from Extensiv for all items in this session"
                >
                  {refreshCaseAmounts.isPending
                    ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    : <RefreshCw className="w-4 h-4 mr-1" />}
                  Case Qty
                </Button>
                {/* Sound mute toggle */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleMute}
                  title={soundMuted ? "Unmute scan sounds" : "Mute scan sounds"}
                  className={soundMuted ? "text-muted-foreground opacity-60" : ""}
                >
                  {soundMuted
                    ? <><VolumeX className="w-4 h-4 mr-1" />Muted</>
                    : <><Volume2 className="w-4 h-4 mr-1" />Sound</>}
                </Button>
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
                      {/* MU badge — shown when this pallet was imported via MU scan */}
                      {pallet.muLabel && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" title={`Imported from MU ${pallet.muLabel}`}>
                          <Package className="w-2.5 h-2.5" />
                          MU {pallet.muLabel}
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
                              setExpandedPallets((prev) => new Set(Array.from(prev).concat(pallet.id)));
                              setTimeout(() => palletInputRefs.current.get(pallet.id)?.focus(), 100);
                            } else {
                              // Lock: add to locked set
                              setLockedPallets((prev) => new Set(Array.from(prev).concat(pallet.id)));
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
                                if (scanAsMu) {
                                  // MU mode: look up the MU in Extensiv and import as full pallet
                                  scanMu.mutate({ sessionId: session.id, muLabel: barcodeInput.trim(), palletId: pallet.id, palletType: pallet.palletType ?? undefined });
                                } else {
                                  scanBarcode.mutate({ sessionId: session.id, barcode: barcodeInput.trim(), scanAsCase });
                                }
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
                                  title={(() => {
                                    const caseItems = items.filter((i) => (i.caseAmount ?? 1) > 1);
                                    if (caseItems.length === 0) return "Toggle case scan — no case quantities configured for this customer";
                                    const lines = caseItems.map((i) => `${i.sku}: ×${i.caseAmount}`).join("\n");
                                    return `Toggle case scan (scan one barcode = full case quantity)\n\nCase quantities:\n${lines}`;
                                  })()}
                                >
                                  <Layers className="w-4 h-4 mr-1" />
                                  Case
                                  {items.some((i) => (i.caseAmount ?? 1) > 1) && (
                                    <span className="ml-1 text-xs opacity-75">×{items.find((i) => (i.caseAmount ?? 1) > 1)?.caseAmount}</span>
                                  )}
                                </Button>
                                <Button type="submit" className="h-12 px-6 shrink-0" disabled={scanBarcode.isPending || scanMu.isPending}>
                                  Scan
                                </Button>
                              </form>
                              {/* Case mode active but no case qty warning */}
                              {scanAsCase && !items.some((i) => (i.caseAmount ?? 1) > 1) && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 border border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Case mode is on but no case quantities are configured for this customer. Each scan will add ×1.</span>
                                </div>
                              )}
                              {/* Admin-only manual quantity entry button */}
                              {isAdmin && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-9 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950"
                                  onClick={() => { setManualEntryOpen(true); setManualSku(""); setManualQty(""); }}
                                >
                                  <Pencil className="w-3 h-3 mr-1.5" />
                                  Admin: Manual Quantity Entry
                                </Button>
                              )}
                              {/* Demo Cheat Sheet removed — operators scan using the barcode input directly */}
                              {/* MU lookup in-progress indicator */}
                              {scanMu.isPending && (
                                <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                  <span>Looking up MU in Extensiv… this may take a few seconds</span>
                                </div>
                              )}
                              {/* Last scan feedback */}
                              {!scanMu.isPending && lastScan && (
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
                          (pallet.items as Array<{ sku: string; upc?: string; qty: number }>).map((item, i) => {
                            const breakdown = palletWeightBreakdown[pallet.id];
                            const skuEntry = breakdown?.find((b) => b.sku === item.sku);
                            return (
                              <div
                                key={i}
                                className="grid items-center text-sm border-b border-[#CDD4DC] last:border-0"
                                style={{ gridTemplateColumns: "1fr 80px 80px", background: i % 2 === 1 ? "#EEF4FB" : "#ffffff", padding: "6px 8px" }}
                              >
                                <span className="font-mono text-xs">{item.sku}</span>
                                <span className="text-right font-semibold text-sm">×{item.qty}</span>
                                {skuEntry ? (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className={`text-right text-xs cursor-help ${
                                          skuEntry.source === 'none' ? 'text-amber-600 font-semibold' :
                                          skuEntry.source === 'imperial' ? 'text-blue-600' : 'text-green-700'
                                        }`}>
                                          {skuEntry.totalWeightLb !== null ? `${skuEntry.totalWeightLb} lb` : '—'}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-[200px]">
                                        <p className="text-xs font-semibold mb-1">{item.sku} weight</p>
                                        {skuEntry.source === 'none' ? (
                                          <p className="text-xs text-amber-600">No weight data in Extensiv</p>
                                        ) : (
                                          <>
                                            <p className="text-xs">{skuEntry.perUnitWeightLb} lb/unit × {item.qty} units</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                              Source: {skuEntry.source === 'carton' ? 'carton weight' : 'imperial weight'}
                                            </p>
                                          </>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span />
                                )}
                              </div>
                            );
                          })
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

      {/* ── Admin Manual Quantity Entry dialog ── */}
      {isAdmin && session && (
        <Dialog open={manualEntryOpen} onOpenChange={setManualEntryOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <Pencil className="w-4 h-4" />
                Manual Quantity Entry
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">Admin only — sets the scanned quantity for a SKU directly, bypassing scan requirement.</p>
              <div className="space-y-2">
                <label className="text-sm font-medium">SKU</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={manualSku}
                  onChange={(e) => setManualSku(e.target.value)}
                >
                  <option value="">— Select SKU —</option>
                  {items.map((item) => (
                    <option key={item.sku} value={item.sku}>
                      {item.sku} ({item.scannedQty}/{item.expectedQty})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  min={0}
                  max={items.find((i) => i.sku === manualSku)?.expectedQty ?? 9999}
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  placeholder="Enter quantity"
                  className="h-10"
                />
                {manualSku && (
                  <p className="text-xs text-muted-foreground">
                    Expected: {items.find((i) => i.sku === manualSku)?.expectedQty ?? "—"} &nbsp;|&nbsp;
                    Currently scanned: {items.find((i) => i.sku === manualSku)?.scannedQty ?? 0}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualEntryOpen(false)}>Cancel</Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!manualSku || manualQty === "" || manualSetQty.isPending}
                onClick={() => {
                  if (!manualSku || manualQty === "") return;
                  manualSetQty.mutate({ sessionId: session.id, sku: manualSku, qty: parseInt(manualQty, 10) });
                }}
              >
                {manualSetQty.isPending ? "Saving…" : "Set Quantity"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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
        <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" /> Complete &amp; Confirm Order
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm">
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
                          const url = `/api/pdf/qc-gd-labels/${session.id}?type=gd`;
                          if (!session.destinationAddress) {
                            setMissingShipToWarning({ pendingUrl: url });
                            return;
                          }
                          await ensurePalletUpcs();
                          window.open(url, '_blank');
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
                          const url = `/api/pdf/qc-gd-labels/${session.id}?type=sscc`;
                          if (!session.destinationAddress) {
                            setMissingShipToWarning({ pendingUrl: url });
                            return;
                          }
                          await ensurePalletUpcs();
                          window.open(url, '_blank');
                        }}
                      >
                        <FileText className="w-3 h-3 mr-1" /> SSCC Labels
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
                        if (!session?.destinationAddress) {
                          setMissingShipToWarning({ pendingUrl: '' });
                          return;
                        }
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

          </div>

          {/* Pinned confirm input + footer — always visible */}
          <div className="shrink-0 space-y-3 pt-2 border-t">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
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

          <DialogFooter className="shrink-0 gap-2">
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

      {/* ─── Zero-Weight SKU Alert Dialog ─────────────────────────────── */}
      <Dialog open={!!zeroWeightAlert} onOpenChange={(o) => { if (!o) setZeroWeightAlert(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Missing Weight Data
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              The following SKUs had no weight data in Extensiv. The calculated total may be understated.
            </p>
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
              {zeroWeightAlert?.skus.map((sku) => (
                <p key={sku} className="font-mono text-xs text-amber-800">{sku}</p>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              To fix: add carton weight or item weight in Extensiv, then click Calculate again.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setZeroWeightAlert(null)}>Dismiss</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Missing Ship-To Warning Dialog ───────────────────────────── */}
      <Dialog open={!!missingShipToWarning} onOpenChange={(o) => { if (!o) setMissingShipToWarning(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Ship-To Address Missing
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2 py-1">
            <p>This session does not have a ship-to address on file. The label will show only the customer name without a delivery address or sub-client (retailer).</p>
            <p>To fix this, use the <strong>Fetch from Extensiv</strong> button to reload the order data, then try printing again.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setMissingShipToWarning(null)}>Cancel</Button>
            <Button
              variant="default"
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={async () => {
                const url = missingShipToWarning?.pendingUrl;
                setMissingShipToWarning(null);
                if (url) {
                  await ensurePalletUpcs();
                  window.open(url, '_blank');
                } else if (session) {
                  const w = window.open('', '_blank', 'width=500,height=700');
                  if (w) { w.document.write('<p>Label printed without ship-to address.</p>'); w.document.close(); w.print(); }
                }
              }}
            >
              Print Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Dock Location Recommendation Dialog ─────────────────────────── */}
      <DockRecommendDialog
        open={dockRecommendDialog}
        onClose={() => { setDockRecommendDialog(false); setCompletedSessionInfo(null); }}
        onConfirm={(lane) => { setAssignedStagingLane(lane); setDockRecommendDialog(false); setShipwellDialog(true); }}
        sessionInfo={completedSessionInfo}
      />
      {/* ─── Shipwell LTL Confirmation Dialog ────────────────────────────── */}
      <ShipwellConfirmDialog
        open={shipwellDialog}
        onClose={() => { setShipwellDialog(false); setCompletedSessionInfo(null); setAssignedStagingLane(null); }}
        sessionInfo={completedSessionInfo}
        assignedLane={assignedStagingLane}
      />
    </>
  );
}

// ─── Dock Recommendation Dialog ───────────────────────────────────────────────
function DockRecommendDialog({
  open,
  onClose,
  onConfirm,
  sessionInfo,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (lane: string | null) => void;
  sessionInfo: { sessionId: number; configId: number | null; palletCount: number; customerName: string | null; transactionId: number | null; customerId: number | null } | null;
}) {
  const palletCount = sessionInfo?.palletCount ?? 1;
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const { data: spaces, isLoading } = trpc.shippingDashboard.listAvailableDockSpaces.useQuery(
    {
      configId: sessionInfo?.configId ?? undefined,
      palletCount: palletCount > 0 ? palletCount : 1,
      clientId: sessionInfo?.customerId ?? undefined,
    },
    { enabled: open && !!sessionInfo }
  );

  const recommended = spaces?.recommended;
  const isOverflow = spaces?.overflow === true;

  // Auto-select the recommended location when data first loads
  useEffect(() => {
    if (!spaces || selectedLocation) return;
    if (spaces.recommended) {
      setSelectedLocation(spaces.recommended.label);
    } else if (spaces.overflow) {
      setSelectedLocation("Overflow");
    }
  }, [spaces]);

  const assignDock = trpc.shippingDashboard.updateOutbound.useMutation({
    onSuccess: () => {
      toast.success(`Staged at: ${selectedLocation ?? "Overflow"}`);
      onConfirm(selectedLocation ?? null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Find the order_tracking row for this session's transactionId so we can assign the location
  const { data: outboundOrders } = trpc.shippingDashboard.listOutbound.useQuery(
    undefined,
    { enabled: open && !!sessionInfo?.transactionId }
  );
  const matchedOrder = outboundOrders?.find(
    (o) => o.extensivOrderId === sessionInfo?.transactionId
  );

  function handleAssign() {
    if (!matchedOrder) return;
    const loc = selectedLocation === "Overflow" ? "Overflow" : (selectedLocation ?? undefined);
    assignDock.mutate({ id: matchedOrder.id, outboundLocation: loc });
  }

  // Group available cells by lane for display
  const byLane: Record<number, string[]> = {};
  for (const cell of spaces?.available ?? []) {
    if (!byLane[cell.lane]) byLane[cell.lane] = [];
    byLane[cell.lane].push(cell.label);
  }
  const laneNumbers = Object.keys(byLane).map(Number).sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Move to Outbound
          </DialogTitle>
          {sessionInfo && (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{sessionInfo.customerName ?? `TX ${sessionInfo.transactionId}`}</span>
              {" — "}{palletCount} pallet{palletCount !== 1 ? "s" : ""}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="w-4 h-4 animate-spin" /> Finding available dock positions…
            </div>
          ) : (
            <>
              {/* Recommended banner */}
              {recommended && (
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedLocation === recommended.label
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30 hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedLocation(recommended.label)}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Recommended</p>
                    <p className="text-2xl font-black text-primary">{recommended.label}</p>
                    {recommended.positions.length > 1 && (
                      <p className="text-xs text-muted-foreground">Lane {recommended.lane} · Positions {recommended.positions.join(", ")}</p>
                    )}
                  </div>
                  {selectedLocation === recommended.label && (
                    <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
                  )}
                </div>
              )}

              {/* Overflow suggested when no contiguous block */}
              {isOverflow && !recommended && (
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedLocation === "Overflow"
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-border bg-muted/30 hover:border-amber-500/50"
                  }`}
                  onClick={() => setSelectedLocation("Overflow")}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">No contiguous space — suggested</p>
                    <p className="text-2xl font-black text-amber-600 dark:text-amber-400">Overflow</p>
                  </div>
                  {selectedLocation === "Overflow" && (
                    <CheckCircle2 className="w-6 h-6 text-amber-500 shrink-0" />
                  )}
                </div>
              )}

              {/* All available positions grid */}
              {laneNumbers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    All Available Positions ({spaces?.available.length} of {spaces?.totalCells})
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {laneNumbers.map((lane) => (
                      <div key={lane} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12 shrink-0">Lane {lane}</span>
                        <div className="flex gap-1 flex-wrap">
                          {byLane[lane].map((label) => (
                            <button
                              key={label}
                              onClick={() => setSelectedLocation(label)}
                              className={`px-2.5 py-1 rounded-lg text-sm font-bold border transition-all ${
                                selectedLocation === label
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted/50 text-foreground border-border hover:border-primary/60 hover:bg-primary/10"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overflow option always available at bottom */}
              <div
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  selectedLocation === "Overflow"
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-dashed border-border hover:border-amber-500/50 hover:bg-amber-500/5"
                }`}
                onClick={() => setSelectedLocation("Overflow")}
              >
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Overflow</span>
                {selectedLocation === "Overflow" && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
              </div>

              {spaces && (
                <p className="text-xs text-muted-foreground text-center">
                  {spaces.occupiedCount} of {spaces.totalCells} dock cells currently occupied
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Skip All</Button>
          <Button variant="ghost" onClick={() => onConfirm(null)} className="text-muted-foreground">
            Skip to Shipwell →
          </Button>
          {matchedOrder && selectedLocation && (
            <Button
              className={selectedLocation === "Overflow" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
              disabled={assignDock.isPending}
              onClick={handleAssign}
            >
              {assignDock.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <MapPin className="w-4 h-4 mr-1" />}
              Confirm Staging →
            </Button>
          )}
          {!matchedOrder && !isLoading && (
            <div className="flex items-center gap-2 w-full justify-between">
              <p className="text-xs text-muted-foreground">Order not found in outbound tracking.</p>
              <Button onClick={() => onConfirm(null)}><Truck className="w-4 h-4 mr-1" />Continue to Shipwell →</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shipwell LTL Confirmation Dialog ────────────────────────────────────────
function ShipwellConfirmDialog({
  open,
  onClose,
  sessionInfo,
  assignedLane,
}: {
  open: boolean;
  onClose: () => void;
  sessionInfo: { sessionId: number; configId: number | null; palletCount: number; customerName: string | null; transactionId: number | null; customerId: number | null } | null;
  assignedLane?: string | null;
}) {
  const [palletCount, setPalletCount] = useState<number>(sessionInfo?.palletCount ?? 1);
  const [totalWeightLb, setTotalWeightLb] = useState<string>("");
  const [freightClass, setFreightClass] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);

  // Auto-fetch default freight class for this customer
  const { data: freightClassData } = trpc.rateWizard.getFreightClassForCustomer.useQuery(
    { customerId: sessionInfo?.customerId ?? 0 },
    { enabled: open && !!sessionInfo?.customerId }
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (open && sessionInfo) {
      setPalletCount(sessionInfo.palletCount > 0 ? sessionInfo.palletCount : 1);
      setTotalWeightLb("");
      setFreightClass("");
      setConfirmed(false);
    }
  }, [open, sessionInfo?.sessionId]);

  // Pre-populate freight class from customer rule when it loads
  useEffect(() => {
    if (freightClassData?.freightClass) {
      setFreightClass(freightClassData.freightClass);
    }
  }, [freightClassData?.freightClass]);

  // Check if Shipwell is configured
  const { data: shipwellConfig, isLoading: configLoading } = trpc.shipwell.getConfig.useQuery(
    undefined,
    { enabled: open }
  );
  const isShipwellConfigured = !!shipwellConfig?.isActive;

  const sendToShipwell = trpc.qcScanner.sendToShipwell.useMutation({
    onSuccess: (data) => {
      setConfirmed(true);
      toast.success("Sent to Shipwell — PO created successfully");
      // Open Shipwell PO in new tab
      if (data.poUrl) window.open(data.poUrl, "_blank");
    },
    onError: (e) => toast.error(`Shipwell error: ${e.message}`, { duration: Infinity }),
  });

  function handleSend() {
    if (!sessionInfo) return;
    sendToShipwell.mutate({
      sessionId: sessionInfo.sessionId,
      palletCountOverride: palletCount,
      totalWeightLbOverride: totalWeightLb ? parseFloat(totalWeightLb) : undefined,
      freightClass: freightClass || undefined,
    });
  }

  const customerLabel = sessionInfo?.customerName ?? `Session ${sessionInfo?.sessionId}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Send to Shipwell — LTL
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{customerLabel}</span>
            {sessionInfo?.transactionId ? ` — TX ${sessionInfo.transactionId}` : ""}
          </p>
        </DialogHeader>

        {confirmed ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="text-lg font-semibold">Shipwell PO Created</p>
            <p className="text-sm text-muted-foreground">The LTL shipment has been submitted to Shipwell for rate shopping and carrier tendering.</p>
            <Button className="mt-2" onClick={onClose}>Done — Back to Scanner</Button>
          </div>
        ) : configLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" /> Checking Shipwell configuration…
          </div>
        ) : !isShipwellConfigured ? (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Shipwell Not Configured</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Configure Shipwell credentials in Shipping Integration settings to enable LTL shipment creation.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {assignedLane && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
                <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="text-sm font-semibold text-teal-800 dark:text-teal-200">Staged at Lane {assignedLane}</span>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Review the shipment details below. All fields are auto-populated from the order — adjust if needed before sending.
            </p>

            {/* Pallet Count */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Package className="w-4 h-4 text-muted-foreground" />
                Pallet Count
              </label>
              <div className="flex items-center gap-2">
                <button
                  className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => setPalletCount((n) => Math.max(1, n - 1))}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center text-lg font-bold">{palletCount}</span>
                <button
                  className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => setPalletCount((n) => n + 1)}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Total Weight */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-muted-foreground" />
                Total Weight (lbs)
                <span className="text-xs text-muted-foreground font-normal">— auto-calculated from pallets if blank</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="Auto-calculated"
                value={totalWeightLb}
                onChange={(e) => setTotalWeightLb(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Freight Class */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-muted-foreground" />
                Freight Class
                {freightClassData?.freightClass && (
                  <span className="text-xs text-green-600 font-normal">— from customer rules</span>
                )}
              </label>
              <select
                value={freightClass}
                onChange={(e) => setFreightClass(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select freight class…</option>
                {["50","55","60","65","70","77.5","85","92.5","100","110","125","150","175","200","250","300","400","500"].map((fc) => (
                  <option key={fc} value={fc}>Class {fc}</option>
                ))}
              </select>
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-muted/40 border px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{customerLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pallets</span>
                <span className="font-medium">{palletCount}</span>
              </div>
              {totalWeightLb && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Weight</span>
                  <span className="font-medium">{parseFloat(totalWeightLb).toLocaleString()} lbs</span>
                </div>
              )}
              {freightClass && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Freight Class</span>
                  <span className="font-medium">Class {freightClass}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium">LTL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Environment</span>
                <span className={`font-medium ${shipwellConfig?.environment === "production" ? "text-green-600" : "text-amber-600"}`}>
                  {shipwellConfig?.environment === "production" ? "Production" : "Sandbox"}
                </span>
              </div>
            </div>

            {!freightClass && (
              <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>No freight class selected. Shipwell needs a freight class for accurate LTL rate shopping. Select one above or set a default in Customer Shipping Rules.</span>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>Skip</Button>
              <Button
                disabled={sendToShipwell.isPending}
                onClick={handleSend}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {sendToShipwell.isPending ? (
                  <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />Sending…</>
                ) : (
                  <><Send className="w-4 h-4 mr-1.5" />Send to Shipwell</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
