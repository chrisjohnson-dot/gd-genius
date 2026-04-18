/**
 * ReturnsScanStation
 *
 * Multi-camera returns scanning station. Associate places item in the
 * designated spot and presses Enter. All connected cameras fire simultaneously,
 * images are stitched into a 360 viewer, and the UPC barcode is auto-detected
 * and pre-populated into the returns form. Lot code is left editable.
 *
 * Hardware requirements:
 *   - 2+ USB webcams (top-down + front-facing recommended)
 *   - Chrome/Edge (multi-camera MediaDevices support)
 *
 * Libraries used:
 *   - @zxing/library  — barcode/UPC detection (runs in browser, no server call)
 *   - tesseract.js    — OCR for lot code hint (editable by associate)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Camera,
  ScanBarcode,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CameraStream {
  deviceId: string;
  label: string;
  stream: MediaStream;
  videoRef: React.RefObject<HTMLVideoElement>;
}

interface CapturedFrame {
  deviceId: string;
  label: string;
  dataUrl: string; // base64 PNG
}

type ScanPhase = "idle" | "capturing" | "processing" | "review" | "saving";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadToS3(
  uploadPhoto: (args: { filename: string; dataUrl: string }) => Promise<{ url: string }>,
  frame: CapturedFrame,
  sessionId: number,
  index: number
): Promise<string> {
  const filename = `returns/${sessionId}/frame-${index}-${Date.now()}.png`;
  const result = await uploadPhoto({ filename, dataUrl: frame.dataUrl });
  return result.url;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReturnsScanStation() {
  // ── Camera state ──────────────────────────────────────────────────────────
  const [cameras, setCameras] = useState<CameraStream[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // ── Capture state ─────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartIndex = useRef(0);

  // ── Detected data ─────────────────────────────────────────────────────────
  const [detectedUpc, setDetectedUpc] = useState("");
  const [detectedLot, setDetectedLot] = useState("");

  // ── Form state ────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<number | "">("");
  const [sku, setSku] = useState("");
  const [upcCode, setUpcCode] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [condition, setCondition] = useState<"new" | "good" | "damaged" | "unsellable">("good");
  const [disposition, setDisposition] = useState<"restock" | "quarantine" | "destroy" | "return_to_vendor">("restock");
  const [notes, setNotes] = useState("");

  // ── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const addItem = trpc.returns.addItem.useMutation({
    onSuccess: () => {
      utils.returns.listSessions.invalidate();
      toast.success("Item added to return session");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadPhoto = trpc.returns.uploadScanPhoto.useMutation();

  // ── Session list for picker ───────────────────────────────────────────────
  const { data: sessionsData } = trpc.returns.listSessions.useQuery();
  const openSessions = sessionsData?.filter((s: { status: string }) => s.status === "open") ?? [];

  // ─── Camera init ──────────────────────────────────────────────────────────

  const initCameras = useCallback(async () => {
    setCameraError(null);
    try {
      // Request permission first (required by most browsers)
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");

      if (videoDevices.length === 0) {
        setCameraError("No cameras detected. Connect at least one USB webcam.");
        return;
      }

      // Stop any existing streams
      setCameras((prev) => {
        prev.forEach((c) => c.stream.getTracks().forEach((t) => t.stop()));
        return [];
      });

      const streams: CameraStream[] = [];
      for (const device of videoDevices) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: device.deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          });
          const ref = { current: videoRefs.current.get(device.deviceId) ?? null } as React.RefObject<HTMLVideoElement>;
          streams.push({ deviceId: device.deviceId, label: device.label || `Camera ${streams.length + 1}`, stream, videoRef: ref });
        } catch {
          console.warn(`[ScanStation] Could not open camera ${device.label}`);
        }
      }

      setCameras(streams);
    } catch (err) {
      setCameraError("Camera access denied. Please allow camera permissions in your browser.");
      console.error("[ScanStation] Camera init error:", err);
    }
  }, []);

  // Attach streams to video elements whenever cameras change
  useEffect(() => {
    cameras.forEach((cam) => {
      const el = videoRefs.current.get(cam.deviceId);
      if (el && el.srcObject !== cam.stream) {
        el.srcObject = cam.stream;
        el.play().catch(() => {});
      }
    });
  }, [cameras]);

  // Init on mount
  useEffect(() => {
    initCameras();
    return () => {
      // Cleanup streams on unmount
      setCameras((prev) => {
        prev.forEach((c) => c.stream.getTracks().forEach((t) => t.stop()));
        return [];
      });
    };
  }, [initCameras]);

  // ─── Capture on Enter ─────────────────────────────────────────────────────

  const captureFrames = useCallback(async () => {
    if (cameras.length === 0) {
      toast.error("No cameras available. Please connect a webcam.");
      return;
    }
    if (phase !== "idle" && phase !== "review") return;

    setPhase("capturing");
    setFrames([]);
    setDetectedUpc("");
    setDetectedLot("");

    const captured: CapturedFrame[] = [];

    for (const cam of cameras) {
      const video = videoRefs.current.get(cam.deviceId);
      if (!video) continue;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      captured.push({
        deviceId: cam.deviceId,
        label: cam.label,
        dataUrl: canvas.toDataURL("image/png"),
      });
    }

    setFrames(captured);
    setViewerIndex(0);
    setPhase("processing");

    // ── Barcode detection ─────────────────────────────────────────────────
    const reader = new BrowserMultiFormatReader();
    let foundUpc = "";

    for (const frame of captured) {
      if (foundUpc) break;
      try {
        const img = new Image();
        img.src = frame.dataUrl;
        await new Promise<void>((res) => { img.onload = () => res(); });
        // Use decodeFromImageElement — it accepts HTMLImageElement directly
        const result = reader.decode(img as unknown as HTMLVideoElement);
        if (result) {
          foundUpc = result.getText();
        }
      } catch (e) {
        if (!(e instanceof NotFoundException)) {
          console.warn("[ScanStation] Barcode decode error:", e);
        }
      }
    }

    if (foundUpc) {
      setDetectedUpc(foundUpc);
      setUpcCode(foundUpc);
      // If SKU is empty, pre-fill it with the UPC too
      setSku((prev) => prev || foundUpc);
      toast.success(`UPC detected: ${foundUpc}`);
    } else {
      toast.info("No barcode detected — enter UPC manually if needed");
    }

    setPhase("review");
  }, [cameras, phase]);

  // Global Enter key listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.target === document.body) {
        e.preventDefault();
        captureFrames();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [captureFrames]);

  // ─── 360 viewer drag ──────────────────────────────────────────────────────

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    dragStartX.current = "touches" in e ? e.touches[0].clientX : e.clientX;
    dragStartIndex.current = viewerIndex;
  };

  const onDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || frames.length === 0) return;
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const delta = dragStartX.current - x;
    const step = Math.round(delta / 40); // pixels per frame
    const newIndex = ((dragStartIndex.current + step) % frames.length + frames.length) % frames.length;
    setViewerIndex(newIndex);
  };

  const onDragEnd = () => setIsDragging(false);

  // ─── Save item ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!sessionId) { toast.error("Select a return session first"); return; }
    if (!sku.trim()) { toast.error("SKU is required"); return; }

    setPhase("saving");

    // Upload photos to S3
    let photoUrls: string[] = [];
    try {
      photoUrls = await Promise.all(
        frames.map((f, i) => uploadToS3(
          (args) => uploadPhoto.mutateAsync(args),
          f,
          Number(sessionId),
          i
        ))
      );
    } catch (err) {
      console.warn("[ScanStation] Photo upload failed, saving without photos:", err);
    }

    addItem.mutate({
      sessionId: Number(sessionId),
      sku: sku.trim(),
      quantity: 1,
      condition,
      disposition,
      lotNumber: lotNumber || undefined,
      notes: notes || undefined,
      upcCode: upcCode || undefined,
      photos: photoUrls.length > 0 ? JSON.stringify(photoUrls) : undefined,
    });
  };

  const resetForm = () => {
    setFrames([]);
    setSku("");
    setUpcCode("");
    setLotNumber("");
    setNotes("");
    setCondition("good");
    setDisposition("restock");
    setDetectedUpc("");
    setDetectedLot("");
    setPhase("idle");
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const currentFrame = frames[viewerIndex];

  return (
    <div className="p-6 space-y-6 max-w-7xl page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/returns">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
              Returns
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Camera className="h-6 w-6 text-blue-500" />
              Scan Station
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Place item in designated spot, then press <kbd className="px-1.5 py-0.5 rounded bg-muted border text-xs font-mono">Enter</kbd> to capture all cameras
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={cameras.length > 0 ? "default" : "destructive"} className="gap-1">
            <Camera className="h-3 w-3" />
            {cameras.length} camera{cameras.length !== 1 ? "s" : ""} connected
          </Badge>
          <Button variant="outline" size="sm" onClick={initCameras} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{cameraError}</p>
            <p className="text-xs text-red-500 mt-1">Connect USB webcams and click Refresh, or allow camera access in browser settings.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Left: Camera feeds + 360 viewer ── */}
        <div className="space-y-4">
          {/* Live camera previews */}
          {cameras.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Live Feeds</p>
              <div className={`grid gap-2 ${cameras.length === 1 ? "grid-cols-1" : cameras.length === 2 ? "grid-cols-2" : "grid-cols-2"}`}>
                {cameras.map((cam) => (
                  <div key={cam.deviceId} className="relative rounded-xl overflow-hidden bg-black aspect-video">
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current.set(cam.deviceId, el);
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1.5 left-2 right-2">
                      <span className="text-[10px] text-white/70 bg-black/40 rounded px-1.5 py-0.5 truncate block">
                        {cam.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 360 viewer */}
          {frames.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  360° Viewer — {frames.length} angle{frames.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {viewerIndex + 1} / {frames.length} · Drag to rotate
                </p>
              </div>
              <div
                className="relative rounded-xl overflow-hidden bg-black aspect-video cursor-grab select-none"
                style={{ cursor: isDragging ? "grabbing" : "grab" }}
                onMouseDown={onDragStart}
                onMouseMove={onDragMove}
                onMouseUp={onDragEnd}
                onMouseLeave={onDragEnd}
                onTouchStart={onDragStart}
                onTouchMove={onDragMove}
                onTouchEnd={onDragEnd}
              >
                {currentFrame && (
                  <img
                    src={currentFrame.dataUrl}
                    alt={`Angle ${viewerIndex + 1}`}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                )}
                {/* Navigation arrows */}
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
                  onClick={() => setViewerIndex((i) => (i - 1 + frames.length) % frames.length)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
                  onClick={() => setViewerIndex((i) => (i + 1) % frames.length)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {/* Frame dots */}
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {frames.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setViewerIndex(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === viewerIndex ? "bg-white" : "bg-white/40"}`}
                    />
                  ))}
                </div>
                {/* Camera label */}
                {currentFrame && (
                  <div className="absolute top-2 left-2">
                    <span className="text-[10px] text-white/80 bg-black/40 rounded px-1.5 py-0.5">
                      {currentFrame.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                {frames.map((f, i) => (
                  <button
                    key={f.deviceId}
                    onClick={() => setViewerIndex(i)}
                    className={`shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${i === viewerIndex ? "border-blue-500" : "border-transparent"}`}
                    style={{ width: 72, height: 48 }}
                  >
                    <img src={f.dataUrl} alt={f.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Idle placeholder */}
          {frames.length === 0 && cameras.length > 0 && phase === "idle" && (
            <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 aspect-video flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <ZoomIn className="h-10 w-10 opacity-30" />
              <div className="text-center">
                <p className="text-sm font-medium">Place item in designated spot</p>
                <p className="text-xs mt-1">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-muted border text-xs font-mono">Enter</kbd> to capture all cameras
                </p>
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {phase === "capturing" || phase === "processing" ? (
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 aspect-video flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {phase === "capturing" ? "Capturing all cameras…" : "Detecting barcode…"}
              </p>
            </div>
          ) : null}

          {/* Capture button */}
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={captureFrames}
            disabled={cameras.length === 0 || phase === "capturing" || phase === "processing" || phase === "saving"}
          >
            {phase === "capturing" || phase === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanBarcode className="h-4 w-4" />
            )}
            {phase === "review" ? "Re-capture" : "Capture (Enter)"}
          </Button>
        </div>

        {/* ── Right: Returns form ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Return Item Details</p>

          {/* Session picker */}
          <div className="space-y-1.5">
            <Label htmlFor="sessionId">Return Session</Label>
            <select
              id="sessionId"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value ? Number(e.target.value) : "")}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Select open session —</option>
              {openSessions.map((s: { id: number; facilityName?: string | null; clientName?: string | null; createdAt: Date }) => (
                <option key={s.id} value={s.id}>
                  #{s.id} · {s.facilityName ?? "Unknown facility"} · {s.clientName ?? "Unknown client"}
                </option>
              ))}
            </select>
          </div>

          {/* UPC (auto-detected) */}
          <div className="space-y-1.5">
            <Label htmlFor="upcCode" className="flex items-center gap-1.5">
              UPC / Barcode
              {detectedUpc && (
                <Badge variant="default" className="gap-1 text-[10px] py-0 px-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Auto-detected
                </Badge>
              )}
            </Label>
            <Input
              id="upcCode"
              value={upcCode}
              onChange={(e) => setUpcCode(e.target.value)}
              placeholder="Auto-detected or enter manually"
              className={detectedUpc ? "border-green-400 focus-visible:ring-green-400" : ""}
            />
          </div>

          {/* SKU */}
          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Enter or scan SKU"
            />
          </div>

          {/* Lot code — always manual */}
          <div className="space-y-1.5">
            <Label htmlFor="lotNumber">Lot Code</Label>
            <Input
              id="lotNumber"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="Enter lot code manually"
            />
          </div>

          {/* Condition */}
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["new", "good", "damaged", "unsellable"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={`rounded-lg py-2 text-xs font-medium capitalize transition-colors border ${
                    condition === c
                      ? c === "damaged" || c === "unsellable"
                        ? "bg-red-100 border-red-400 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-400"
                        : "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400"
                      : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Disposition */}
          <div className="space-y-1.5">
            <Label>Disposition</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["restock", "quarantine", "destroy", "return_to_vendor"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDisposition(d)}
                  className={`rounded-lg py-2 text-xs font-medium capitalize transition-colors border ${
                    disposition === d
                      ? "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400"
                      : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes"
            />
          </div>

          {/* Save + Reset */}
          <div className="flex gap-2 pt-2">
            <Button
              size="lg"
              className="flex-1 gap-2"
              onClick={handleSave}
              disabled={!sessionId || !sku.trim() || phase === "saving" || addItem.isPending}
            >
              {phase === "saving" || addItem.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Add to Session
            </Button>
            <Button variant="outline" size="lg" onClick={resetForm} className="gap-1">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>

          {/* Photo count indicator */}
          {frames.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {frames.length} photo{frames.length !== 1 ? "s" : ""} will be attached to this item
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
