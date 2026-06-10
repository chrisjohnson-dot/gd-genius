import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Truck, MapPin, Package, CheckCircle2, AlertTriangle,
  RefreshCw, ClipboardList, ArrowLeft, Zap, XCircle, Volume2, VolumeX,
  User, Hash, PenLine, Printer, Download, FileCheck, Save, CloudUpload, Barcode,
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
// "batch-setup" = operator is building a multi-order batch pickup list
type Phase = "lookup" | "arrival" | "quickstart" | "scanning" | "complete" | "batch-setup" | "batch-arrival";

interface BatchOrderEntry {
  transactionId: number;
  clientName: string;
  referenceNum: string | null;
  palletCount: number | null;
  outboundLocation: string | null;
}

interface ScannedPallet {
  labelValue: string;
  scannedAt: Date;
  photoDataUrl?: string | null;
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
const CARRIER_SOUNDS = {
  scanAccepted: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663682817598/YpFnVchcxAmjqGes.wav",
  loadComplete: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663682817598/HBxMrBpYYiUkiOnS.wav",
  error: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663682817598/sImXLLPBXmtjYBfK.m4a",
};

function playCarrierAudio(type: keyof typeof CARRIER_SOUNDS) {
  try {
    const audio = new Audio(CARRIER_SOUNDS[type]);
    audio.volume = 1.0;
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

function playCompleteBeep() {
  playCarrierAudio("loadComplete");
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CarrierPickupScanner() {
  const { user } = useAuth();
  const loginMethod = user?.loginMethod ?? "";
  const isAdmin = loginMethod.startsWith("team:") ? loginMethod.split(":")[1] === "admin" : user?.role === "admin";
  const trpcUtils = trpc.useUtils();

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  // Capture delay in ms — time between scan and photo capture (allows pallet to move into frame)
  const [captureDelayMs, setCaptureDelayMs] = useState(500);

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
  // Scanner-speed detection: track keystroke timestamps to distinguish scanner vs manual typing
  // USB barcode scanners send all characters in <100ms total; humans type much slower
  const lastKeystrokeRef = useRef<number>(0);
  const keystrokeTimingsRef = useRef<number[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Batch pickup state
  const [batchOrders, setBatchOrders] = useState<BatchOrderEntry[]>([]);
  const [batchTxInput, setBatchTxInput] = useState("");
  const [batchResolving, setBatchResolving] = useState(false);
  const [batchResolveError, setBatchResolveError] = useState<string | null>(null);

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
  const { playError: _playErrorFallback } = useScanAudio();
  // Use carrier-specific audio for all sounds — louder and clearer for warehouse dock
  const playSuccess = () => playCarrierAudio("scanAccepted");
  const playError = () => playCarrierAudio("error");
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

  // Inactivity focus recovery: every 5 s, silently return focus to the scan
  // input if it has drifted away (e.g. OS notification, tooltip, browser UI)
  useEffect(() => {
    if (phase !== "scanning") return;
    const id = setInterval(() => {
      // Only re-focus if no error overlay, no dialog, no other input is active
      const active = document.activeElement as HTMLElement | null;
      const isModalOpen = !!document.querySelector("[role='dialog']");
      const isOtherInputActive = active && active !== scanInputRef.current &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
      if (!scanError && !isModalOpen && !isOtherInputActive) {
        scanInputRef.current?.focus();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [phase, scanError]);

  // Ctrl+Enter to open confirm dialog
  useEffect(() => {
    if (phase !== "scanning") return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (expectedPallets > 0 && scannedCount < expectedPallets) return;
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

  // ─── Camera effects ────────────────────────────────────────────────────────
  // Enumerate available cameras when admin enables camera
  useEffect(() => {
    if (!cameraEnabled) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const cams = devices.filter((d) => d.kind === "videoinput");
      setAvailableCameras(cams);
      if (!selectedCameraId && cams.length > 0) setSelectedCameraId(cams[0].deviceId);
    }).catch(() => {});
  }, [cameraEnabled]);

  // Start/stop camera stream when enabled or camera selection changes
  useEffect(() => {
    if (!cameraEnabled) {
      if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); setCameraStream(null); }
      return;
    }
    const constraints: MediaStreamConstraints = {
      video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: "environment" },
    };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch((err) => {
      toast.error("⚠ Camera access failed — proof-of-shipping photos will NOT be captured", {
        description: err.message + ". Check that the browser has camera permission and a camera is connected.",
        duration: Infinity,
      });
      setCameraEnabled(false);
    });
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraEnabled, selectedCameraId]);

  // Attach stream to video element when stream changes
  useEffect(() => {
    if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => { cameraStream?.getTracks().forEach((t) => t.stop()); };
  }, [cameraStream]);

  // Capture a photo from the current camera frame
  const capturePhoto = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current || !cameraEnabled) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, [cameraEnabled]);

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
      // Auto-enable camera for proof-of-shipping photos
      setCameraEnabled(true);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const uploadPickupPhotoMutation = trpc.carrierPickup.uploadPickupPhoto.useMutation({
    onError: (e) => {
      console.warn("[CarrierPickup] Photo upload failed:", e.message);
      toast.error("Photo upload failed — pallet scanned but no proof photo saved", {
        description: e.message,
        duration: 8000,
      });
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
        // Capture photo after configurable delay (allows pallet to move into frame)
        const labelForPhoto = scanInput.trim();
        const scannedAt = new Date();
        const uploadPhoto = (photo: string | null, sid: number | null) => {
          if (photo && sid) {
            uploadPickupPhotoMutation.mutate({ sessionId: sid, palletLabel: labelForPhoto, dataUrl: photo });
          }
        };
        const matchedOid = (data as any).matchedOrderId as number | undefined;
        if (cameraEnabled && captureDelayMs > 0) {
          setScannedPallets(prev => [{ labelValue: labelForPhoto, scannedAt, photoDataUrl: null, orderId: matchedOid } as any, ...prev]);
          setTimeout(() => {
            const photo = capturePhoto();
            setScannedPallets(prev => prev.map((p, i) => i === 0 && p.labelValue === labelForPhoto ? { ...p, photoDataUrl: photo } : p));
            uploadPhoto(photo, sessionId);
          }, captureDelayMs);
        } else {
          const photo = capturePhoto();
          setScannedPallets(prev => [{ labelValue: labelForPhoto, scannedAt, photoDataUrl: photo, orderId: matchedOid } as any, ...prev]);
          uploadPhoto(photo, sessionId);
        }
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
      setCameraEnabled(true);
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
    setBatchOrders([]);
    setBatchTxInput("");
    setBatchResolveError(null);
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

  const isBatchMode = phase === "batch-setup" || phase === "batch-arrival" ||
    (phase === "scanning" && batchOrders.length > 0);
  const expectedPallets = isBatchMode
    ? batchOrders.reduce((s, o) => s + (o.palletCount ?? 0), 0)
    : (selectedOrder?.palletCount ?? 0);
  const scannedCount = scannedPallets.length;
  const progressPct = expectedPallets > 0 ? Math.min(100, Math.round((scannedCount / expectedPallets) * 100)) : 0;

  // Per-order scan counts for batch mode (keyed by transactionId)
  const batchScanCounts = new Map<number, number>();
  if (isBatchMode) {
    for (const p of scannedPallets) {
      const oid = (p as any).orderId as number | undefined;
      if (oid) batchScanCounts.set(oid, (batchScanCounts.get(oid) ?? 0) + 1);
    }
  }

  // Build outbound pallet list (expected pallets numbered 1..N)
  const outboundPalletList = Array.from({ length: expectedPallets }, (_, i) => i + 1);

  // Batch: add a TX ID to the list
  const handleAddBatchOrder = async () => {
    const txId = parseInt(batchTxInput.trim(), 10);
    if (isNaN(txId) || txId <= 0) { setBatchResolveError("Enter a valid Transaction ID"); return; }
    if (batchOrders.find(o => o.transactionId === txId)) { setBatchResolveError("This order is already in the batch"); return; }
    setBatchResolving(true);
    setBatchResolveError(null);
    try {
      // Use trpcUtils to call resolveOrder imperatively
      const result = await trpcUtils.carrierPickup.resolveOrder.fetch({ transactionId: txId });
      setBatchOrders(prev => [...prev, result]);
      setBatchTxInput("");
    } catch (e: any) {
      setBatchResolveError(e.message ?? `Order ${txId} not found`);
    } finally {
      setBatchResolving(false);
    }
  };

  // Batch: start the session with all orders
  const handleStartBatchSession = () => {
    if (batchOrders.length < 2) { toast.error("Add at least 2 orders for a batch pickup"); return; }
    if (!driverName.trim() || !trailerNumber.trim()) { toast.error("Driver name and trailer number are required"); return; }
    const totalPallets = batchOrders.reduce((s, o) => s + (o.palletCount ?? 0), 0);
    startSessionMutation.mutate({
      batchOrderIds: batchOrders.map(o => o.transactionId),
      referenceNum: `BATCH-${batchOrders.map(o => o.transactionId).join("-")}`,
      expectedPallets: totalPallets || undefined,
      carrierName: carrierName.trim() || undefined,
      driverName: driverName.trim(),
      trailerNumber: trailerNumber.trim(),
      sealNumber: sealNumber.trim() || undefined,
      proNumber: proNumber.trim() || undefined,
      isDemo: false,
    });
  };

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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Find Order</h2>
              <p className="text-sm text-muted-foreground">Search by reference number, client name, ship-to, or outbound location.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-purple-500 text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/30"
              onClick={() => setPhase("batch-setup")}
            >
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Batch Pickup
            </Button>
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

      {/* ── Batch Phase 1: Add Orders ── */}
      {phase === "batch-setup" && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950/40">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Batch Pickup Setup</h2>
              <p className="text-sm text-muted-foreground">Add all transaction IDs for this load, then enter carrier details.</p>
            </div>
          </div>

          {/* TX ID input */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Enter Transaction ID (e.g. 3496544)"
                value={batchTxInput}
                onChange={e => { setBatchTxInput(e.target.value); setBatchResolveError(null); }}
                onKeyDown={e => { if (e.key === "Enter") handleAddBatchOrder(); }}
                autoFocus
              />
              {batchResolveError && (
                <p className="text-xs text-red-500 mt-1">{batchResolveError}</p>
              )}
            </div>
            <Button onClick={handleAddBatchOrder} disabled={batchResolving || !batchTxInput.trim()}>
              {batchResolving ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Add Order"}
            </Button>
          </div>

          {/* Order list */}
          {batchOrders.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Orders in Batch ({batchOrders.length})
              </div>
              {batchOrders.map((o, i) => (
                <div key={o.transactionId} className="border rounded-lg p-3 flex items-center justify-between gap-3 bg-card">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <div>
                      <div className="font-semibold text-sm">{o.clientName}</div>
                      <div className="text-xs text-muted-foreground">TX {o.transactionId} · Ref: {o.referenceNum ?? "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-medium">{o.palletCount ?? "?"} pallets</div>
                      {o.outboundLocation && <div className="text-xs text-blue-600">{o.outboundLocation}</div>}
                    </div>
                    <button
                      onClick={() => setBatchOrders(prev => prev.filter(x => x.transactionId !== o.transactionId))}
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Summary */}
              <div className="border rounded-lg p-3 bg-muted/50 flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold">
                  {batchOrders.reduce((s, o) => s + (o.palletCount ?? 0), 0)} pallets across {batchOrders.length} orders
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              disabled={batchOrders.length < 2}
              onClick={() => setPhase("batch-arrival")}
            >
              <Truck className="h-4 w-4 mr-2" />
              Continue to Carrier Details
            </Button>
          </div>
        </div>
      )}

      {/* ── Batch Phase 2: Carrier Details ── */}
      {phase === "batch-arrival" && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5 w-full">
          {/* Batch summary card */}
          <div className="border rounded-lg p-4 bg-purple-50 dark:bg-purple-950/20">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-purple-600" />
              <span className="font-semibold text-sm">Batch Pickup — {batchOrders.length} Orders</span>
            </div>
            <div className="space-y-1">
              {batchOrders.map((o, i) => (
                <div key={o.transactionId} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{i + 1}. TX {o.transactionId} — {o.clientName}</span>
                  <span className="font-medium">{o.palletCount ?? "?"} pallets</span>
                </div>
              ))}
              <div className="border-t pt-1 mt-1 flex justify-between text-xs font-bold">
                <span>Total</span>
                <span>{batchOrders.reduce((s, o) => s + (o.palletCount ?? 0), 0)} pallets</span>
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
              <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="First Last" autoFocus />
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

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setPhase("batch-setup")}>
              Back
            </Button>
            <Button
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              size="lg"
              disabled={!driverName.trim() || !trailerNumber.trim() || startSessionMutation.isPending}
              onClick={handleStartBatchSession}
            >
              {startSessionMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Starting…</>
              ) : (
                <><Truck className="h-4 w-4 mr-2" /> Start Batch Scan-Out ({batchOrders.length} orders)</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Phase 3 (quickstart) + Phase 3 (scanning): Split-panel layout ── */}
      {(phase === "quickstart" || phase === "scanning") && (selectedOrder || isBatchMode) && (
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
              {isBatchMode ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-purple-600" />
                    <div className="font-semibold text-sm">Batch Pickup</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{batchOrders.length} orders</div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-sm">{selectedOrder?.clientName}</div>
                  <div className="text-xs text-muted-foreground truncate">{selectedOrder?.shipToName}</div>
                  {/* Dock location — prominent display */}
                  <div className={`mt-3 rounded-lg px-3 py-2 flex items-center gap-2 ${
                    selectedOrder?.outboundLocation
                      ? "bg-blue-600 text-white"
                      : "bg-muted text-muted-foreground border border-dashed"
                  }`}>
                    <MapPin className="h-4 w-4 shrink-0" />
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">Dock Location</div>
                      <div className="text-base font-bold leading-tight">
                        {selectedOrder?.outboundLocation ?? "Not assigned"}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Package className="h-3 w-3" /> {scannedCount}/{expectedPallets} pallets
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${scannedCount >= expectedPallets && expectedPallets > 0 ? "bg-green-500" : isBatchMode ? "bg-purple-500" : "bg-blue-500"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isBatchMode ? (
                /* Batch mode: per-order progress */
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b flex items-center gap-1">
                    <Package className="h-3 w-3" /> Orders ({batchOrders.length})
                  </div>
                  <div className="divide-y">
                    {batchOrders.map((o) => {
                      const orderScanned = batchScanCounts.get(o.transactionId) ?? 0;
                      const orderExpected = o.palletCount ?? 0;
                      const orderDone = orderExpected > 0 && orderScanned >= orderExpected;
                      return (
                        <div key={o.transactionId} className={`px-3 py-2.5 ${orderDone ? "bg-green-50 dark:bg-green-950/20" : ""}` }>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{o.clientName}</div>
                              <div className="text-[10px] text-muted-foreground">TX {o.transactionId}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {orderDone
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                : <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              }
                              <span className={`text-xs font-bold ${orderDone ? "text-green-600" : "text-foreground"}`}>
                                {orderScanned}/{orderExpected > 0 ? orderExpected : "?"}
                              </span>
                            </div>
                          </div>
                          {orderExpected > 0 && (
                            <div className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${orderDone ? "bg-green-500" : "bg-purple-500"}`}
                                style={{ width: `${Math.min(100, Math.round(orderScanned / orderExpected * 100))}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Unmatched scans */}
                  {scannedPallets.filter(p => !(p as any).orderId).length > 0 && (
                    <div className="px-3 py-2 text-xs text-amber-600 border-t">
                      {scannedPallets.filter(p => !(p as any).orderId).length} unmatched scan(s)
                    </div>
                  )}
                </>
              ) : (
                /* Single order mode: numbered pallet list */
                <>
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
                </>
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
                  <TooltipProvider>
                  <Tooltip>
                  <TooltipTrigger asChild>
                  <div className="relative flex-1">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={scanInputRef}
                      value={scanInput}
                      onChange={e => {
                        const now = Date.now();
                        const gap = now - lastKeystrokeRef.current;
                        lastKeystrokeRef.current = now;
                        // Record inter-keystroke gap (ignore first keystroke)
                        if (keystrokeTimingsRef.current.length > 0 || scanInput.length > 0) {
                          keystrokeTimingsRef.current.push(gap);
                        }
                        setScanInput(e.target.value);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const timings = keystrokeTimingsRef.current;
                          // A real scanner sends chars with gaps <80ms; manual typing is typically >150ms
                          const isScanner = timings.length === 0 || timings.every(t => t < 80);
                          keystrokeTimingsRef.current = [];
                          lastKeystrokeRef.current = 0;
                          if (!isScanner && !isDemo) {
                            setScanError("Manual keyboard entry is not allowed. Please scan the barcode on the physical pallet label.");
                            setScanInput("");
                            return;
                          }
                          handleScan();
                        }
                      }}
                      placeholder="Scan only — do not type"
                      className="pl-10 text-lg font-mono"
                      disabled={scanPalletMutation.isPending || phase === "quickstart"}
                      autoFocus
                    />
                  </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">This field only accepts input from a USB barcode scanner. Keyboard entry is blocked to prevent mis-scans.</p>
                  </TooltipContent>
                  </Tooltip>
                  </TooltipProvider>
                  <Button
                    onClick={handleScan}
                    disabled={!scanInput.trim() || scanPalletMutation.isPending || phase === "quickstart" || isDemo === false}
                    title={isDemo ? "Click to scan (demo mode)" : "Use your barcode scanner — manual entry is not permitted"}
                    className={isDemo ? undefined : "opacity-40 cursor-not-allowed"}
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
                      <div key={i} className="flex items-center justify-between px-4 py-2 text-sm gap-3">
                        <span className="font-mono font-medium">{p.labelValue}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {p.photoDataUrl && (
                            <img
                              src={p.photoDataUrl}
                              alt={`Pallet ${p.labelValue}`}
                              className="w-12 h-9 object-cover rounded border border-border cursor-pointer"
                              onClick={() => window.open(p.photoDataUrl!, '_blank')}
                              title="Click to view full photo"
                            />
                          )}
                          <span className="text-muted-foreground text-xs">
                            {p.scannedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Camera Panel — alignment/testing only, hidden from regular employees */}
              {isAdmin && phase === "scanning" && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      📷 Camera (Admin)
                    </span>
                    <div className="flex items-center gap-2">
                      {cameraEnabled && availableCameras.length > 1 && (
                        <select
                          className="text-xs border border-input rounded px-1 py-0.5 bg-background"
                          value={selectedCameraId ?? ""}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                        >
                          {availableCameras.map((cam, idx) => (
                            <option key={cam.deviceId} value={cam.deviceId}>
                              {cam.label || `Camera ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => {
                          if (!cameraEnabled) {
                            setCameraEnabled(true);
                            setShowCameraPreview(true);
                          } else {
                            setShowCameraPreview((v) => !v);
                          }
                        }}
                      >
                        {!cameraEnabled ? 'Enable Camera' : showCameraPreview ? 'Hide Preview' : 'Show Preview'}
                      </button>
                      {cameraEnabled && (
                        <button
                          className="text-xs text-red-500 hover:underline"
                          onClick={() => { setCameraEnabled(false); setShowCameraPreview(false); }}
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                  {showCameraPreview && cameraEnabled && (
                    <div className="p-2 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-h-48 object-contain rounded"
                      />
                      <p className="text-xs text-center text-gray-400 mt-1">Live preview — align camera to cover the pallet area</p>
                    </div>
                  )}
                  {cameraEnabled && !showCameraPreview && (
                    <div className="px-4 py-2 text-xs text-green-600">✓ Camera active — photos will be captured {captureDelayMs > 0 ? `${captureDelayMs}ms after` : 'immediately on'} each scan</div>
                  )}
                  {cameraEnabled && (
                    <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-xs">
                      <label className="text-muted-foreground shrink-0">Capture delay:</label>
                      <input
                        type="range"
                        min={0}
                        max={2000}
                        step={100}
                        value={captureDelayMs}
                        onChange={(e) => setCaptureDelayMs(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-muted-foreground w-14 text-right shrink-0">
                        {captureDelayMs === 0 ? 'Instant' : `${captureDelayMs}ms`}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {/* Hidden canvas for photo capture */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Bottom action bar */}
            {phase === "scanning" && (
              <div className="border-t px-6 py-4 bg-card shrink-0">
                <Button
                  variant="default"
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={expectedPallets > 0 && scannedCount < expectedPallets}
                  onClick={() => setShowConfirmDialog(true)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Pickup ({scannedCount} pallets scanned)
                  <span className="ml-2 text-xs opacity-75">Ctrl+Enter</span>
                </Button>
                {expectedPallets > 0 && scannedCount < expectedPallets && (
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    {expectedPallets - scannedCount} pallet{expectedPallets - scannedCount !== 1 ? "s" : ""} remaining before pickup can be completed
                  </p>
                )}
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

            {/* Photo gallery — shown if any photos were captured */}
            {scannedPallets.some((p) => p.photoDataUrl) && (
              <div className="max-w-2xl mx-auto mt-6 text-left">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">📷 Pallet Photos</h3>
                <div className="grid grid-cols-3 gap-2">
                  {scannedPallets.filter((p) => p.photoDataUrl).map((p, i) => (
                    <div key={i} className="space-y-1">
                      <img
                        src={p.photoDataUrl!}
                        alt={`Pallet ${p.labelValue}`}
                        className="w-full aspect-video object-cover rounded border border-border cursor-pointer hover:opacity-90"
                        onClick={() => window.open(p.photoDataUrl!, '_blank')}
                        title="Click to view full size"
                      />
                      <p className="text-xs text-center text-muted-foreground font-mono truncate">{p.labelValue}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
