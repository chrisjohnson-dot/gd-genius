import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Truck, MapPin, Package, CheckCircle2, AlertTriangle,
  RefreshCw, ClipboardList, ArrowLeft, Zap, XCircle, Volume2, VolumeX,
  User, Hash, PenLine, Printer, Download, FileCheck, Save, CloudUpload,
} from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";
import { useScanAudio } from "@/hooks/useScanAudio";

// ─── Demo data ────────────────────────────────────────────────────────────────────
const DEMO_ORDER = {
  id: 0,
  extensivOrderId: 9999001,
  referenceNum: "DEMO-2026-001",
  clientName: "Keurig Dr Pepper",
  shipToName: "Walmart Distribution Center #7042",
  shipToCity: "Bentonville",
  outboundLocation: "OB-A3",
  palletCount: 6,
  facilityId: 1,
  facilityName: "ACR Logistics",
  requiredShipDate: "2026-04-30",
};
const DEMO_PALLET_LABELS = [
  "GD-PAL-001234", "GD-PAL-001235", "GD-PAL-001236",
  "GD-PAL-001237", "GD-PAL-001238", "GD-PAL-001239",
];

// ─── Types ────────────────────────────────────────────────────────────────────
// "quickstart" = arrived from Shipping Dashboard with orderId in URL; skip lookup + arrival form
type Phase = "lookup" | "arrival" | "quickstart" | "scanning" | "complete";

interface ScannedPallet {
  labelValue: string;
  scannedAt: Date;
}

interface SelectedOrder {
  id: number;
  extensivOrderId: number;
  referenceNum: string | null;
  clientName: string;
  shipToName: string | null;
  shipToCity: string | null;
  outboundLocation: string | null;
  palletCount: number | null;
  facilityId: number;
  facilityName: string | null;
  requiredShipDate: string | null;
}

// ─── Audio ────────────────────────────────────────────────────────────────────
function playCompleteBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1047;
    gain.gain.value = 0.15;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* ignore */ }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CarrierPickupScanner() {
  // Phase
  const [phase, setPhase] = useState<Phase>("lookup");
  const [showSignatureCapture, setShowSignatureCapture] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [appointmentId, setAppointmentId] = useState<number | null>(null);
  const [signedBolUrl, setSignedBolUrl] = useState<string | null>(null);
  const [bolUrl, setBolUrl] = useState<string | null>(null);
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  // Lookup
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<SelectedOrder | null>(null);

  // Arrival form
  const [carrierName, setCarrierName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [sealNumber, setSealNumber] = useState("");
  const [proNumber, setProNumber] = useState("");

  // Quickstart inline form (shown as overlay on scanning screen)
  const [showQuickstartForm, setShowQuickstartForm] = useState(false);

  // Scanning
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scannedPallets, setScannedPallets] = useState<ScannedPallet[]>([]);
  const [flashState, setFlashState] = useState<"idle" | "success" | "duplicate">("idle");
  // Full-screen error blocker — must be manually cleared before scanning resumes
  const [scanError, setScanError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Complete
  const [shippedInExtensiv, setShippedInExtensiv] = useState<boolean | null>(null);
  const [isGeneratingBol, setIsGeneratingBol] = useState(false);

  const generatePickupBolMutation = trpc.carrierPickup.generatePickupBol.useMutation({
    onSuccess: (data) => {
      setBolUrl(data.bolUrl);
      setIsGeneratingBol(false);
      toast.success("BOL generated — ready to print or sign");
    },
    onError: (err) => {
      setIsGeneratingBol(false);
      toast.error("BOL generation failed: " + err.message);
    },
  });

  const savePickupBolMutation = trpc.carrierPickup.savePickupBol.useMutation({
    onSuccess: (data) => {
      setBolUrl(data.bolUrl);
      setSignedBolUrl(data.signedBolUrl);
      setShowSignatureCapture(false);
      setIsSubmittingSignature(false);
      toast.success("Signed BOL saved — ready to print");
    },
    onError: (err) => {
      setIsSubmittingSignature(false);
      toast.error("Save BOL failed: " + err.message);
    },
  });

  const submitSignatureMutation = trpc.carrierAppointments.submitSignature.useMutation({
    onSuccess: (data) => {
      if (data.signedBolUrl) setSignedBolUrl(data.signedBolUrl);
      setShowSignatureCapture(false);
      setIsSubmittingSignature(false);
      toast.success("Signature captured — BOL signed and ready to print");
    },
    onError: (err) => {
      setIsSubmittingSignature(false);
      toast.error("Signature failed: " + err.message);
    },
  });

  // Sound
  const { playSuccess, playError } = useScanAudio();
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("carrierPickup_soundMuted") === "true"; } catch { return false; }
  });
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem("carrierPickup_soundMuted", String(next)); } catch { /* ignore */ }
  };

  const scanInputRef = useRef<HTMLInputElement>(null);

  // ── Read orderId from URL on mount ──────────────────────────────────────────
  const [urlOrderId, setUrlOrderId] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("orderId");
    if (id) {
      const parsed = parseInt(id, 10);
      if (!isNaN(parsed)) setUrlOrderId(parsed);
    }
    const apptId = params.get("appointmentId");
    if (apptId) {
      const parsed = parseInt(apptId, 10);
      if (!isNaN(parsed)) setAppointmentId(parsed);
    }
  }, []);

  // Fetch the order when orderId is in the URL
  const orderByIdQuery = trpc.carrierPickup.getOrderById.useQuery(
    { extensivOrderId: urlOrderId! },
    { enabled: urlOrderId !== null, retry: false }
  );

  // When the order is loaded from URL, pre-populate and go to quickstart phase
  useEffect(() => {
    if (orderByIdQuery.data && urlOrderId !== null && phase === "lookup") {
      const row = orderByIdQuery.data as SelectedOrder;
      setSelectedOrder(row);
      setPhase("quickstart");
      setShowQuickstartForm(true); // show the driver/trailer form immediately
    }
  }, [orderByIdQuery.data, urlOrderId, phase]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Focus scan input when in scanning phase
  useEffect(() => {
    if (phase === "scanning" && !showQuickstartForm) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [phase, showQuickstartForm]);

  // Re-focus scan input whenever the user clicks anywhere on the page
  // (except interactive elements) so the scanner is always ready
  useEffect(() => {
    if (phase !== "scanning") return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = target.closest(
        "button, a, input, textarea, select, [role='button'], [role='dialog'], [data-radix-popper-content-wrapper]"
      );
      if (!isInteractive && !scanError) {
        scanInputRef.current?.focus();
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [phase, scanError]);

  // Ctrl+Enter to open confirm dialog
  useEffect(() => {
    if (phase !== "scanning") return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        setShowConfirmDialog(true);
      }
      // Escape clears the full-screen error blocker
      if (e.key === "Escape") {
        setScanError(prev => {
          if (prev !== null) {
            e.preventDefault();
            setScanInput("");
            setFlashState("idle");
            setTimeout(() => scanInputRef.current?.focus(), 100);
            return null;
          }
          return prev;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase]);

  // tRPC
  const searchQuery2 = debouncedQuery.trim();
  const searchResult = trpc.carrierPickup.searchOrders.useQuery(
    { query: searchQuery2 },
    { enabled: searchQuery2.length >= 2 && !isDemo }
  );

  const startSessionMutation = trpc.carrierPickup.startSession.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setShowQuickstartForm(false);
      setPhase("scanning");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const scanPalletMutation = trpc.carrierPickup.scanPallet.useMutation({
    onSuccess: (data) => {
      if (data.duplicate) {
        if (!muted) playError();
        setScanError(data.message ?? "Duplicate scan — this pallet was already scanned.");
        setFlashState("duplicate");
      } else {
        if (!muted) playSuccess();
        setFlashState("success");
        setScannedPallets(prev => [{ labelValue: scanInput.trim(), scannedAt: new Date() }, ...prev]);
        setScanInput("");
        setTimeout(() => setFlashState("idle"), 500);
      }
    },
    onError: (err) => {
      if (!muted) playError();
      setScanError(err.message);
    },
  });

  const completeSessionMutation = trpc.carrierPickup.completeSession.useMutation({
    onSuccess: (data) => {
      if (!muted) playCompleteBeep();
      setShippedInExtensiv(data.shippedInExtensiv);
      setPhase("complete");
      setShowConfirmDialog(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setShowConfirmDialog(false);
    },
  });

  // Demo scan handler
  const handleDemoScan = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (scannedPallets.find(p => p.labelValue === trimmed)) {
      if (!muted) playError();
      setScanError(`"${trimmed}" has already been scanned. Clear this error before continuing.`);
      setFlashState("duplicate");
      return;
    }
    if (!muted) playSuccess();
    setFlashState("success");
    setScannedPallets(prev => [{ labelValue: trimmed, scannedAt: new Date() }, ...prev]);
    setScanInput("");
    setTimeout(() => setFlashState("idle"), 500);
  }, [scannedPallets]);

  const handleScan = useCallback(() => {
    const trimmed = scanInput.trim();
    if (!trimmed) return;
    if (scanError) return; // blocked until error overlay is dismissed
    if (isDemo) {
      handleDemoScan(trimmed);
    } else if (sessionId !== null) {
      scanPalletMutation.mutate({ sessionId, labelValue: trimmed });
    }
  }, [scanInput, isDemo, sessionId, scanPalletMutation, handleDemoScan]);

  // Shared start logic used by both arrival form and quickstart form
  const doStartSession = () => {
    if (!selectedOrder) return;
    if (!driverName.trim() || !trailerNumber.trim()) {
      toast.error("Driver name and trailer number are required.");
      return;
    }
    if (isDemo) {
      setSessionId(-1);
      setShowQuickstartForm(false);
      setPhase("scanning");
      return;
    }
    startSessionMutation.mutate({
      transactionId: selectedOrder.extensivOrderId,
      referenceNum: selectedOrder.referenceNum ?? undefined,
      clientName: selectedOrder.clientName,
      shipToName: selectedOrder.shipToName ?? undefined,
      outboundLocation: selectedOrder.outboundLocation ?? undefined,
      expectedPallets: selectedOrder.palletCount ?? undefined,
      warehouseId: selectedOrder.facilityId,
      warehouseName: selectedOrder.facilityName ?? undefined,
      carrierName: carrierName.trim() || undefined,
      driverName: driverName.trim(),
      trailerNumber: trailerNumber.trim(),
      sealNumber: sealNumber.trim() || undefined,
      proNumber: proNumber.trim() || undefined,
      isDemo: false,
    });
  };

  const handleStartPickup = () => {
    if (!selectedOrder) return;
    if (!driverName.trim() || !trailerNumber.trim()) {
      toast.error("Driver name and trailer number are required.");
      return;
    }
    doStartSession();
  };

  const handleComplete = () => {
    if (confirmText !== "CONFIRMED") return;
    if (isDemo) {
      if (!muted) playCompleteBeep();
      setShippedInExtensiv(false);
      setPhase("complete");
      setShowConfirmDialog(false);
      return;
    }
    if (sessionId !== null) {
      completeSessionMutation.mutate({ sessionId });
    }
  };

  const handleReset = () => {
    setPhase("lookup");
    setIsDemo(false);
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedOrder(null);
    setCarrierName("");
    setDriverName("");
    setTrailerNumber("");
    setSealNumber("");
    setProNumber("");
    setSessionId(null);
    setScanInput("");
    setScannedPallets([]);
    setFlashState("idle");
    setScanError(null);
    setConfirmText("");
    setShowConfirmDialog(false);
    setShippedInExtensiv(null);
    setUrlOrderId(null);
    setShowQuickstartForm(false);
    setShowSignatureCapture(false);
    setSignatureDataUrl(null);
    setAppointmentId(null);
    setSignedBolUrl(null);
    setBolUrl(null);
    setIsSubmittingSignature(false);
    // Clear the URL param
    const url = new URL(window.location.href);
    url.searchParams.delete("orderId");
    window.history.replaceState({}, "", url.toString());
  };

  const expectedPallets = selectedOrder?.palletCount ?? 0;
  const scannedCount = scannedPallets.length;
  const progressPct = expectedPallets > 0 ? Math.min(100, Math.round((scannedCount / expectedPallets) * 100)) : 0;

  // Build outbound pallet list (expected pallets numbered 1..N)
  const outboundPalletList = Array.from({ length: expectedPallets }, (_, i) => i + 1);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {(phase !== "lookup") && (
            <button onClick={handleReset} className="text-muted-foreground hover:text-foreground mr-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Truck className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold">Carrier Pickup Scanner</h1>
            <p className="text-xs text-muted-foreground">Scan out pallets when a carrier arrives for pickup</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(phase === "scanning" || phase === "quickstart") && (
            <button
              onClick={toggleMute}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              title={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          {!isDemo && phase === "lookup" && (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500 text-amber-700 hover:bg-amber-50"
              onClick={() => {
                setIsDemo(true);
                setSelectedOrder(DEMO_ORDER);
                setPhase("arrival");
                setCarrierName("XPO Logistics");
              }}
            >
              <Zap className="h-3.5 w-3.5 mr-1" />
              Demo Mode
            </Button>
          )}
          {isDemo && (
            <Badge className="bg-amber-500 text-white text-xs px-2 py-1">DEMO</Badge>
          )}
        </div>
      </div>

      {/* Demo banner */}
      {isDemo && (
        <div className="bg-amber-500 text-white px-6 py-2 flex items-center justify-between text-sm font-medium shrink-0">
          <span>⚡ Demo Mode — all data is synthetic. No Extensiv changes will be made.</span>
          <button onClick={handleReset} className="underline text-white/90 hover:text-white text-xs">Exit Demo</button>
        </div>
      )}

      {/* ── Loading state when fetching order from URL ── */}
      {urlOrderId !== null && orderByIdQuery.isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading order…</span>
        </div>
      )}

      {/* ── Phase 1: Order Lookup ── */}
      {phase === "lookup" && urlOrderId === null && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 w-full">
          <div>
            <h2 className="text-lg font-semibold mb-1">Find Order</h2>
            <p className="text-sm text-muted-foreground">Search by reference number, client name, ship-to, or outbound location.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="e.g. 3331807 or Walmart or OB-A3"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {searchResult.isLoading && (
            <p className="text-sm text-muted-foreground">Searching...</p>
          )}

          {searchResult.data && searchResult.data.length === 0 && debouncedQuery.length >= 2 && (
            <p className="text-sm text-muted-foreground">No ship-ready orders found matching "{debouncedQuery}".</p>
          )}

          {searchResult.data && searchResult.data.length > 0 && (
            <div className="space-y-2">
              {searchResult.data.map((order) => (
                <button
                  key={order.id}
                  onClick={() => { setSelectedOrder(order as SelectedOrder); setPhase("arrival"); }}
                  className="w-full text-left border rounded-lg p-4 hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{order.clientName}</div>
                      <div className="text-sm text-muted-foreground">{order.shipToName}</div>
                      <div className="text-xs text-muted-foreground mt-1">Ref: {order.referenceNum ?? "—"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-xs font-medium text-blue-600">
                        <MapPin className="h-3 w-3" />
                        {order.outboundLocation ?? "No location"}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Package className="h-3 w-3" />
                        {order.palletCount ?? 0} pallets
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Phase 2: Carrier Arrival Form (manual lookup path) ── */}
      {phase === "arrival" && selectedOrder && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5 w-full">
          {/* Order summary card */}
          <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{selectedOrder.clientName}</div>
                <div className="text-sm text-muted-foreground">{selectedOrder.shipToName}</div>
                <div className="text-xs text-muted-foreground mt-1">Ref: {selectedOrder.referenceNum ?? "—"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-sm font-bold text-blue-700 dark:text-blue-400">
                  <MapPin className="h-4 w-4" />
                  {selectedOrder.outboundLocation ?? "No location"}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <Package className="h-3.5 w-3.5" />
                  {selectedOrder.palletCount ?? 0} pallets expected
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-1">Carrier Arrival Details</h2>
            <p className="text-sm text-muted-foreground">Fill in the carrier info before starting the scan-out.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Carrier Name</label>
              <Input value={carrierName} onChange={e => setCarrierName(e.target.value)} placeholder="e.g. XPO Logistics" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">PRO / Tracking #</label>
              <Input value={proNumber} onChange={e => setProNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Driver Name <span className="text-red-500">*</span></label>
              <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="First Last" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Trailer / Truck # <span className="text-red-500">*</span></label>
              <Input value={trailerNumber} onChange={e => setTrailerNumber(e.target.value)} placeholder="e.g. XPO-44821" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium">Seal Number</label>
              <Input value={sealNumber} onChange={e => setSealNumber(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!driverName.trim() || !trailerNumber.trim() || startSessionMutation.isPending}
            onClick={handleStartPickup}
          >
            {startSessionMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Starting…</>
            ) : (
              <><Truck className="h-4 w-4 mr-2" /> Start Pickup Scan-Out</>
            )}
          </Button>
        </div>
      )}

      {/* ── Phase 3 (quickstart) + Phase 3 (scanning): Split-panel layout ── */}
      {(phase === "quickstart" || phase === "scanning") && selectedOrder && (
        <div className="flex flex-1 overflow-hidden relative">

          {/* ─── FULL-SCREEN SCAN ERROR BLOCKER ────────────────────────────────────── */}
          {scanError && (
            <div className="absolute inset-0 z-50 bg-red-600 flex flex-col items-center justify-center gap-8 p-8">
              <div className="flex flex-col items-center gap-4 text-white text-center">
                <XCircle className="h-24 w-24 text-white opacity-90" />
                <h2 className="text-4xl font-black tracking-tight">SCAN ERROR</h2>
                <p className="text-xl font-semibold max-w-lg leading-snug">{scanError}</p>
                <p className="text-red-200 text-sm">Scanning is paused. Review the error above and clear it before continuing.</p>
              </div>
              <Button
                size="lg"
                className="bg-white text-red-700 hover:bg-red-50 font-bold text-lg px-10 py-6 shadow-xl"
                onClick={() => {
                  setScanError(null);
                  setScanInput("");
                  setFlashState("idle");
                  setTimeout(() => scanInputRef.current?.focus(), 100);
                }}
              >
                Clear Error & Resume Scanning
              </Button>
              <p className="text-red-200 text-xs">or press <kbd className="bg-red-700 text-white px-1.5 py-0.5 rounded text-xs font-mono">Esc</kbd> to dismiss</p>
            </div>
          )}

          {/* LEFT PANEL: Outbound pallets */}
          <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/50 shrink-0">
              <div className="font-semibold text-sm">{selectedOrder.clientName}</div>
              <div className="text-xs text-muted-foreground truncate">{selectedOrder.shipToName}</div>

              {/* Dock location — prominent display */}
              <div className={`mt-3 rounded-lg px-3 py-2 flex items-center gap-2 ${
                selectedOrder.outboundLocation
                  ? "bg-blue-600 text-white"
                  : "bg-muted text-muted-foreground border border-dashed"
              }`}>
                <MapPin className="h-4 w-4 shrink-0" />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">Dock Location</div>
                  <div className="text-base font-bold leading-tight">
                    {selectedOrder.outboundLocation ?? "Not assigned"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Package className="h-3 w-3" /> {scannedCount}/{expectedPallets} pallets
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${scannedCount >= expectedPallets && expectedPallets > 0 ? "bg-green-500" : "bg-blue-500"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b flex items-center gap-1">
                <Package className="h-3 w-3" /> Outbound Pallets ({expectedPallets})
              </div>
              {outboundPalletList.length === 0 ? (
                <div className="px-4 py-6 text-xs text-muted-foreground text-center">No pallet count set</div>
              ) : (
                <div className="divide-y">
                  {outboundPalletList.map((num) => {
                    const scanned = scannedPallets[num - 1];
                    return (
                      <div key={num} className={`flex items-center justify-between px-4 py-2.5 text-sm ${scanned ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                        <span className="font-medium text-muted-foreground">Pallet {num}</span>
                        {scanned ? (
                          <div className="flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="font-mono truncate max-w-[100px]">{scanned.labelValue}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </div>
                    );
                  })}
                  {/* Extra scanned pallets beyond expected */}
                  {scannedPallets.slice(expectedPallets).map((p, i) => (
                    <div key={`extra-${i}`} className="flex items-center justify-between px-4 py-2.5 text-sm bg-amber-50 dark:bg-amber-950/20">
                      <span className="font-medium text-amber-600">Extra {i + 1}</span>
                      <div className="flex items-center gap-1 text-amber-600 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="font-mono truncate max-w-[100px]">{p.labelValue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Driver/trailer info at bottom of left panel */}
            {phase === "scanning" && (driverName || trailerNumber) && (
              <div className="border-t px-4 py-3 text-xs text-muted-foreground space-y-1 shrink-0">
                {driverName && <div className="flex items-center gap-1"><User className="h-3 w-3" /> {driverName}</div>}
                {trailerNumber && <div className="flex items-center gap-1"><Hash className="h-3 w-3" /> {trailerNumber}</div>}
                {carrierName && <div className="flex items-center gap-1"><Truck className="h-3 w-3" /> {carrierName}</div>}
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Scan input + scanned list */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Scan input area */}
              <div
                className={`border-2 rounded-xl p-4 transition-colors duration-300 ${
                  flashState === "success" ? "border-green-500 bg-green-50 dark:bg-green-950/30" :
                  flashState === "duplicate" ? "border-red-500 bg-red-50 dark:bg-red-950/30" :
                  "border-border bg-card"
                }`}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scan Pallet Label</p>
                <div className="flex gap-2">
                  <Input
                    ref={scanInputRef}
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(); } }}
                    placeholder="Scan or type pallet label…"
                    className="text-lg font-mono"
                    disabled={scanPalletMutation.isPending || phase === "quickstart"}
                    autoFocus
                  />
                  <Button
                    onClick={handleScan}
                    disabled={!scanInput.trim() || scanPalletMutation.isPending || phase === "quickstart"}
                  >
                    {scanPalletMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Scan"}
                  </Button>
                </div>
                {flashState === "success" && (
                  <p className="text-green-700 dark:text-green-400 text-sm mt-2 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Pallet scanned successfully
                  </p>
                )}
                {flashState === "duplicate" && (
                  <p className="text-red-700 dark:text-red-400 text-sm mt-2 font-medium flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> Duplicate — already scanned
                  </p>
                )}
              </div>

              {/* Demo quick-scan buttons */}
              {isDemo && phase === "scanning" && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Demo: click a label to simulate a scan</p>
                  <div className="flex flex-wrap gap-2">
                    {DEMO_PALLET_LABELS.map(label => (
                      <button
                        key={label}
                        onClick={() => { setScanInput(label); setTimeout(() => handleDemoScan(label), 50); }}
                        className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                          scannedPallets.find(p => p.labelValue === label)
                            ? "bg-green-100 border-green-400 text-green-700 line-through"
                            : "hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scanned list */}
              {scannedPallets.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Scanned Pallets ({scannedPallets.length})
                  </div>
                  <div className="divide-y max-h-64 overflow-y-auto">
                    {scannedPallets.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="font-mono font-medium">{p.labelValue}</span>
                        <span className="text-muted-foreground text-xs">
                          {p.scannedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom action bar */}
            {phase === "scanning" && (
              <div className="border-t px-6 py-4 bg-card shrink-0">
                <Button
                  variant="default"
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => setShowConfirmDialog(true)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Pickup ({scannedCount} pallets scanned)
                  <span className="ml-2 text-xs opacity-75">Ctrl+Enter</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Phase 4: Complete ── */}
      {phase === "complete" && selectedOrder && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 text-center w-full">
          <div className="py-6">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold mt-4">Pickup Complete!</h2>
            <p className="text-muted-foreground mt-2">
              {scannedCount} pallet{scannedCount !== 1 ? "s" : ""} scanned out for{" "}
              <strong>{selectedOrder.clientName}</strong>
            </p>
            <div className="border rounded-lg p-4 text-left text-sm space-y-2 max-w-sm mx-auto mt-6">
              <div className="flex justify-between"><span className="text-muted-foreground">Order Ref</span><span className="font-medium">{selectedOrder.referenceNum ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Driver</span><span className="font-medium">{driverName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Trailer</span><span className="font-medium">{trailerNumber}</span></div>
              {sealNumber && <div className="flex justify-between"><span className="text-muted-foreground">Seal</span><span className="font-medium">{sealNumber}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Pallets</span><span className="font-medium">{scannedCount}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extensiv Status</span>
                {isDemo ? (
                  <Badge variant="outline" className="text-xs">Demo — skipped</Badge>
                ) : shippedInExtensiv ? (
                  <Badge className="bg-green-600 text-white text-xs">Marked Shipped</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500 text-amber-700 text-xs flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Pending retry
                  </Badge>
                )}
              </div>
            </div>

            {/* ── Document & Signature Actions ── */}
            <div className="max-w-sm mx-auto mt-6 space-y-3">

              {/* Step 1: Generate BOL */}
              {!bolUrl ? (
                <Button
                  size="lg"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={isGeneratingBol || !sessionId}
                  onClick={() => {
                    if (!sessionId) return;
                    setIsGeneratingBol(true);
                    generatePickupBolMutation.mutate({ sessionId });
                  }}
                >
                  {isGeneratingBol ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating BOL…</>
                  ) : (
                    <><CloudUpload className="h-4 w-4 mr-2" /> Generate BOL</>
                  )}
                </Button>
              ) : (
                <div className="border border-indigo-300 rounded-lg p-3 bg-indigo-50 dark:bg-indigo-950/30 text-sm text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                  <FileCheck className="h-4 w-4 shrink-0" />
                  <span>BOL generated</span>
                  <button className="ml-auto text-xs underline" onClick={() => {
                    if (!sessionId) return;
                    setIsGeneratingBol(true);
                    generatePickupBolMutation.mutate({ sessionId });
                  }}>Regenerate</button>
                </div>
              )}

              {/* Step 2: Capture driver signature */}
              {!signatureDataUrl ? (
                <Button
                  size="lg"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => setShowSignatureCapture(true)}
                >
                  <PenLine className="h-4 w-4 mr-2" /> Capture Driver Signature
                </Button>
              ) : (
                <div className="border border-green-300 rounded-lg p-3 bg-green-50 dark:bg-green-950/30 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                  <FileCheck className="h-4 w-4 shrink-0" />
                  <span>Driver signature captured</span>
                  <button className="ml-auto text-xs underline" onClick={() => setShowSignatureCapture(true)}>Re-sign</button>
                </div>
              )}

              {/* Step 3: Save signed BOL (only shown after signature captured) */}
              {signatureDataUrl && !signedBolUrl && (
                <Button
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={savePickupBolMutation.isPending || !sessionId}
                  onClick={() => {
                    if (!sessionId || !signatureDataUrl) return;
                    setIsSubmittingSignature(true);
                    savePickupBolMutation.mutate({ sessionId, signatureDataUrl });
                  }}
                >
                  {savePickupBolMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving BOL…</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> Save BOL & Push to History</>
                  )}
                </Button>
              )}

              {/* BOL / Signed BOL download + print */}
              {(signedBolUrl || bolUrl) && (
                <div className="flex gap-2">
                  <a
                    href={signedBolUrl ?? bolUrl ?? ""}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button variant="outline" size="sm" className="w-full">
                      <Download className="h-4 w-4 mr-2" /> {signedBolUrl ? "Signed BOL" : "BOL"}
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const win = window.open(signedBolUrl ?? bolUrl ?? "", "_blank");
                      win?.print();
                    }}
                  >
                    <Printer className="h-4 w-4 mr-2" /> Print BOL
                  </Button>
                </div>
              )}

              {signedBolUrl && (
                <div className="text-xs text-muted-foreground text-center">
                  Signed BOL saved to Shipment History & ClearSight
                </div>
              )}
            </div>

            <Button onClick={handleReset} size="lg" className="mt-6">
              <Truck className="h-4 w-4 mr-2" /> Start New Pickup
            </Button>
          </div>
        </div>
      )}

      {/* ── Quickstart: Driver/Trailer overlay form ── */}
      {showQuickstartForm && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" /> Carrier Arrival Details
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Enter the driver and trailer info to begin scan-out.</p>
            </div>

            {/* Order summary */}
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-sm">
              <div className="font-semibold">{selectedOrder.clientName}</div>
              <div className="text-muted-foreground text-xs">{selectedOrder.shipToName}</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-blue-600 text-xs font-medium">
                  <MapPin className="h-3 w-3" /> {selectedOrder.outboundLocation ?? "No location"}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Package className="h-3 w-3" /> {selectedOrder.palletCount ?? 0} pallets
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Carrier Name</label>
                <Input value={carrierName} onChange={e => setCarrierName(e.target.value)} placeholder="e.g. XPO Logistics" autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">PRO / Tracking #</label>
                <Input value={proNumber} onChange={e => setProNumber(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Driver Name <span className="text-red-500">*</span></label>
                <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="First Last" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Trailer / Truck # <span className="text-red-500">*</span></label>
                <Input
                  value={trailerNumber}
                  onChange={e => setTrailerNumber(e.target.value)}
                  placeholder="e.g. XPO-44821"
                  onKeyDown={e => { if (e.key === "Enter" && driverName.trim() && trailerNumber.trim()) doStartSession(); }}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">Seal Number</label>
                <Input value={sealNumber} onChange={e => setSealNumber(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!driverName.trim() || !trailerNumber.trim() || startSessionMutation.isPending}
                onClick={doStartSession}
              >
                {startSessionMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Starting…</>
                ) : (
                  <><Truck className="h-4 w-4 mr-2" /> Start Scan-Out</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Signature Capture Overlay ── */}
      {showSignatureCapture && selectedOrder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl p-6 w-full max-w-lg space-y-5 shadow-2xl">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <PenLine className="h-5 w-5 text-blue-600" /> Driver Signature
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please have the driver sign below to acknowledge receipt of{" "}
                <strong>{scannedCount} pallet{scannedCount !== 1 ? "s" : ""}</strong> for{" "}
                <strong>{selectedOrder.clientName}</strong>.
              </p>
            </div>
            <SignaturePad
              onSave={(dataUrl: string) => {
                setSignatureDataUrl(dataUrl);
                setShowSignatureCapture(false);
                toast.success("Signature captured — click \"Save BOL\" to finalize");
              }}
              onCancel={() => setShowSignatureCapture(false)}
            />
            {isSubmittingSignature && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> Generating signed BOL…
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm completion dialog ── */}
      {showConfirmDialog && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold">Confirm Pickup Completion</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Order:</strong> {selectedOrder.referenceNum ?? selectedOrder.extensivOrderId}</p>
              <p><strong>Client:</strong> {selectedOrder.clientName}</p>
              <p><strong>Pallets scanned:</strong> {scannedCount} {expectedPallets > 0 ? `of ${expectedPallets} expected` : ""}</p>
              <p><strong>Driver:</strong> {driverName}</p>
              <p><strong>Trailer:</strong> {trailerNumber}</p>
            </div>
            {!isDemo && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                This will mark the order as <strong>Shipped</strong> in Extensiv.
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Type CONFIRMED to proceed</label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && confirmText === "CONFIRMED") handleComplete(); }}
                placeholder="CONFIRMED"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowConfirmDialog(false); setConfirmText(""); }}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={confirmText !== "CONFIRMED" || completeSessionMutation.isPending}
                onClick={handleComplete}
              >
                {completeSessionMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
