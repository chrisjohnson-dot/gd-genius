import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ScanBarcode, Truck, CheckCircle2, Clock, Package, Camera, RotateCcw,
  Building2, User, Hash, ArrowRight, XCircle, Image as ImageIcon,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
type PalletRow = {
  id: number;
  palletNumber: number;
  palletUpc: string | null;
  shippedAt: Date | string | null;
  photoUrl: string | null;
};

type OrderSession = {
  id: number;
  referenceNumber: string;
  customerName: string | null;
  warehouseName: string | null;
  status: string;
};

type LegacyScan = {
  id: number;
  trackingNumber: string;
  doorNumber: string | null;
  warehouseName: string | null;
  carrierName: string | null;
  referenceNumber: string | null;
  notes: string | null;
  scannedBy: string | null;
  status: string;
  scannedAt: Date | string;
};

const DOORS = ["Door 1", "Door 2", "Door 3", "Door 4", "Door 5", "Door 6", "Door 7", "Door 8"];

// ─── Audio helpers ─────────────────────────────────────────────────────────────
function playBeep(type: "success" | "error") {
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
    } else {
      osc.frequency.value = 220;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch { /* ignore */ }
}

// ─── Two-step pallet shipping scanner ─────────────────────────────────────────
function PalletShippingScanner() {
  const [refInput, setRefInput] = useState("");
  const [searchRef, setSearchRef] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<OrderSession | null>(null);
  const [pallets, setPallets] = useState<PalletRow[]>([]);
  const [upcInput, setUpcInput] = useState("");
  const upcInputRef = useRef<HTMLInputElement>(null);

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoTargetUpc, setPhotoTargetUpc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadOrderQuery = trpc.palletScanner.loadOrder.useQuery(
    { referenceNumber: searchRef ?? "" },
    { enabled: !!searchRef, retry: false }
  );

  // React to query result changes
  useEffect(() => {
    if (loadOrderQuery.isSuccess && loadOrderQuery.data) {
      setSession(loadOrderQuery.data.session);
      setPallets(loadOrderQuery.data.pallets);
      playBeep("success");
      setTimeout(() => upcInputRef.current?.focus(), 100);
    }
  }, [loadOrderQuery.isSuccess, loadOrderQuery.data]);

  useEffect(() => {
    if (loadOrderQuery.isError && loadOrderQuery.error) {
      playBeep("error");
      toast.error(loadOrderQuery.error.message);
      setSearchRef(null);
    }
  }, [loadOrderQuery.isError, loadOrderQuery.error]);

  const scanPalletMutation = trpc.palletScanner.scanPallet.useMutation({
    onSuccess: (updated: PalletRow[]) => {
      setPallets(updated);
      playBeep("success");
      setUpcInput("");
      setTimeout(() => upcInputRef.current?.focus(), 50);
    },
    onError: (err: { message: string }) => {
      playBeep("error");
      toast.error(err.message);
      setUpcInput("");
      setTimeout(() => upcInputRef.current?.focus(), 50);
    },
  });

  const uploadPhotoMutation = trpc.palletScanner.uploadPhoto.useMutation({
    onSuccess: (data: { url: string }) => {
      if (photoTargetUpc) {
        setPallets((prev) =>
          prev.map((p) =>
            p.palletUpc?.toLowerCase() === photoTargetUpc.toLowerCase()
              ? { ...p, photoUrl: data.url }
              : p
          )
        );
      }
      toast.success("Photo saved");
      setCapturedPhoto(null);
      setPhotoTargetUpc(null);
      setCameraOpen(false);
    },
    onError: () => toast.error("Failed to upload photo"),
  });

  const shippedCount = pallets.filter((p) => !!p.shippedAt).length;
  const totalCount = pallets.length;
  const allShipped = totalCount > 0 && shippedCount === totalCount;

  function handleLoadOrder(e: React.FormEvent) {
    e.preventDefault();
    const ref = refInput.trim();
    if (!ref) return;
    setSearchRef(ref);
  }

  function handleUpcScan(e: React.FormEvent) {
    e.preventDefault();
    const upc = upcInput.trim();
    if (!upc || !session) return;
    scanPalletMutation.mutate({ sessionId: session.id, palletUpc: upc });
  }

  function handleReset() {
    setSession(null);
    setPallets([]);
    setSearchRef(null);
    setRefInput("");
    setUpcInput("");
    setTimeout(() => refInputRef.current?.focus(), 100);
  }

  async function openCamera(palletUpc: string) {
    setPhotoTargetUpc(palletUpc);
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast.error("Camera not available");
      setCameraOpen(false);
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedPhoto(dataUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function confirmPhoto() {
    if (!capturedPhoto || !photoTargetUpc || !session) return;
    uploadPhotoMutation.mutate({
      sessionId: session.id,
      palletUpc: photoTargetUpc,
      dataUrl: capturedPhoto,
    });
  }

  function discardPhoto() {
    setCapturedPhoto(null);
    if (photoTargetUpc) openCamera(photoTargetUpc);
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCapturedPhoto(null);
    setPhotoTargetUpc(null);
  }

  useEffect(() => { refInputRef.current?.focus(); }, []);

  // ── Step 1: Load Order ──────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="max-w-lg mx-auto pt-10 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Load Order</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Enter a reference number to see the pallets for this order
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleLoadOrder} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Reference Number</label>
                <Input
                  ref={refInputRef}
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder="Scan or type reference number…"
                  className="text-lg h-12 font-mono"
                  autoComplete="off"
                  disabled={loadOrderQuery.isFetching}
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base"
                disabled={!refInput.trim() || loadOrderQuery.isFetching}
              >
                {loadOrderQuery.isFetching ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Loading order…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5" /> Load Order
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step 2: Scan Pallets ────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Order header card */}
      <Card className={allShipped ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hash className="w-3.5 h-3.5" />
                <span className="font-mono font-semibold text-foreground">
                  {session.referenceNumber}
                </span>
              </div>
              {session.customerName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  <span>{session.customerName}</span>
                </div>
              )}
              {session.warehouseName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{session.warehouseName}</span>
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div
                className={`text-3xl font-bold tabular-nums ${
                  allShipped
                    ? "text-green-600"
                    : shippedCount > 0
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {shippedCount}
                <span className="text-lg font-normal text-muted-foreground">
                  /{totalCount}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">pallets shipped</div>
            </div>
          </div>
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                allShipped ? "bg-green-500" : "bg-primary"
              }`}
              style={{
                width: totalCount > 0 ? `${(shippedCount / totalCount) * 100}%` : "0%",
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Success banner */}
      {allShipped && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
                <div>
                  <div className="font-semibold text-green-700 dark:text-green-400">
                    All {totalCount} pallets shipped!
                  </div>
                  <div className="text-sm text-muted-foreground">Order is complete</div>
                </div>
              </div>
              <Button onClick={handleReset} variant="outline" className="shrink-0">
                <RotateCcw className="w-4 h-4 mr-1" /> New Order
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPC scan input */}
      {!allShipped && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <form onSubmit={handleUpcScan} className="flex gap-2">
              <Input
                ref={upcInputRef}
                value={upcInput}
                onChange={(e) => setUpcInput(e.target.value)}
                placeholder="Scan pallet UPC barcode…"
                className="font-mono text-base h-11 flex-1"
                autoComplete="off"
                disabled={scanPalletMutation.isPending}
              />
              <Button
                type="submit"
                className="h-11 px-5"
                disabled={!upcInput.trim() || scanPalletMutation.isPending}
              >
                <ScanBarcode className="w-4 h-4 mr-1" /> Scan
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Pallet list */}
      <div className="space-y-2">
        {pallets.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No pallets found on this order.</p>
              <p className="text-xs mt-1">Pallets are created during the QC scan.</p>
            </CardContent>
          </Card>
        ) : (
          pallets.map((pallet) => {
            const shipped = !!pallet.shippedAt;
            return (
              <Card
                key={pallet.id}
                className={`transition-colors ${
                  shipped
                    ? "border-green-400 bg-green-50/50 dark:bg-green-950/10"
                    : ""
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {shipped ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">
                          Pallet #{pallet.palletNumber}
                        </div>
                        {pallet.palletUpc ? (
                          <div className="font-mono text-xs text-muted-foreground truncate">
                            {pallet.palletUpc}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">
                            No UPC assigned
                          </div>
                        )}
                        {shipped && pallet.shippedAt && (
                          <div className="text-xs text-green-600 mt-0.5">
                            Shipped {new Date(pallet.shippedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pallet.photoUrl ? (
                        <a
                          href={pallet.photoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="outline" className="h-8 px-2">
                            <ImageIcon className="w-3.5 h-3.5 mr-1" /> Photo
                          </Button>
                        </a>
                      ) : pallet.palletUpc ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-muted-foreground"
                          onClick={() => openCamera(pallet.palletUpc!)}
                        >
                          <Camera className="w-3.5 h-3.5 mr-1" /> Photo
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {!allShipped && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleReset}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Load a different order
          </Button>
        </div>
      )}

      {/* Camera dialog */}
      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          if (!open) closeCamera();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" /> Capture Dock Photo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {capturedPhoto ? (
              <img
                src={capturedPhoto}
                alt="Captured"
                className="w-full rounded-lg border"
              />
            ) : (
              <video
                ref={videoRef}
                className="w-full rounded-lg border bg-black"
                autoPlay
                playsInline
                muted
              />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <DialogFooter className="gap-2">
            {capturedPhoto ? (
              <>
                <Button variant="outline" onClick={discardPhoto}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Retake
                </Button>
                <Button
                  onClick={confirmPhoto}
                  disabled={uploadPhotoMutation.isPending}
                >
                  {uploadPhotoMutation.isPending ? "Saving…" : "Save Photo"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={closeCamera}>
                  <XCircle className="w-4 h-4 mr-1" /> Cancel
                </Button>
                <Button onClick={capturePhoto}>
                  <Camera className="w-4 h-4 mr-1" /> Capture
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Legacy tracking log tab ───────────────────────────────────────────────────
function TrackingLog() {
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedDoor, setSelectedDoor] = useState<string>("");
  const [carrierInput, setCarrierInput] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [departDialog, setDepartDialog] = useState<LegacyScan | null>(null);
  const trackingRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: scans = [], isLoading } = trpc.palletScanner.list.useQuery(
    { limit: 50 },
    { refetchInterval: 15_000 }
  );

  const logScan = trpc.palletScanner.logScan.useMutation({
    onSuccess: () => {
      playBeep("success");
      setTrackingInput("");
      utils.palletScanner.list.invalidate();
      setTimeout(() => trackingRef.current?.focus(), 50);
    },
    onError: (err: { message: string }) => {
      playBeep("error");
      toast.error(err.message);
    },
  });

  const updateStatus = trpc.palletScanner.updateStatus.useMutation({
    onSuccess: () => {
      setDepartDialog(null);
      utils.palletScanner.list.invalidate();
      toast.success("Status updated");
    },
  });

  function handleLogScan(e: React.FormEvent) {
    e.preventDefault();
    if (!trackingInput.trim()) return;
    logScan.mutate({
      trackingNumber: trackingInput.trim(),
      doorNumber: selectedDoor || undefined,
      carrierName: carrierInput.trim() || undefined,
      referenceNumber: referenceInput.trim() || undefined,
      notes: notesInput.trim() || undefined,
    });
  }

  useEffect(() => { trackingRef.current?.focus(); }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4" /> Log Tracking Scan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogScan} className="space-y-3">
            <div className="flex gap-2">
              <Input
                ref={trackingRef}
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Scan tracking number…"
                className="font-mono flex-1"
                autoComplete="off"
              />
              <Select value={selectedDoor} onValueChange={setSelectedDoor}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Door" />
                </SelectTrigger>
                <SelectContent>
                  {DOORS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={carrierInput}
                onChange={(e) => setCarrierInput(e.target.value)}
                placeholder="Carrier (optional)"
              />
              <Input
                value={referenceInput}
                onChange={(e) => setReferenceInput(e.target.value)}
                placeholder="Reference # (optional)"
              />
            </div>
            <Input
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Notes (optional)"
            />
            <Button
              type="submit"
              disabled={!trackingInput.trim() || logScan.isPending}
              className="w-full"
            >
              <ScanBarcode className="w-4 h-4 mr-1" /> Log Scan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Scans</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking #</TableHead>
                  <TableHead>Door</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Scanned By</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : scans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Truck className="w-8 h-8 opacity-30" />
                        <span>No tracking scans yet.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  scans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-mono text-sm font-semibold">
                        {scan.trackingNumber}
                      </TableCell>
                      <TableCell className="text-sm">{scan.doorNumber ?? "—"}</TableCell>
                      <TableCell className="text-sm">{scan.carrierName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {scan.referenceNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{scan.scannedBy ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(scan.scannedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {scan.status === "loaded" ? (
                          <Badge variant="outline" className="border-blue-400 text-blue-600">
                            <Clock className="w-3 h-3 mr-1" /> Loaded
                          </Badge>
                        ) : scan.status === "departed" ? (
                          <Badge variant="outline" className="border-green-400 text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Departed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{scan.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {scan.status === "loaded" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDepartDialog(scan as LegacyScan)}
                          >
                            <Truck className="w-3 h-3 mr-1" /> Mark Departed
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!departDialog}
        onOpenChange={(open) => !open && setDepartDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" /> Mark Pallet as Departed
            </DialogTitle>
          </DialogHeader>
          {departDialog && (
            <div className="space-y-2 text-sm">
              <p>Confirm this pallet has left the dock?</p>
              <div className="bg-muted rounded-lg p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tracking</span>
                  <span className="font-mono font-semibold">
                    {departDialog.trackingNumber}
                  </span>
                </div>
                {departDialog.doorNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Door</span>
                    <span>{departDialog.doorNumber}</span>
                  </div>
                )}
                {departDialog.carrierName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Carrier</span>
                    <span>{departDialog.carrierName}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepartDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                departDialog &&
                updateStatus.mutate({ id: departDialog.id, status: "departed" })
              }
              disabled={updateStatus.isPending}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Departed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PalletScanner() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" /> Pallet Scanner
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Scan pallets for shipping confirmation or log tracking numbers
        </p>
      </div>

      <Tabs defaultValue="shipping">
        <TabsList className="mb-4">
          <TabsTrigger value="shipping" className="flex items-center gap-1.5">
            <Package className="w-4 h-4" /> Pallet Shipping
          </TabsTrigger>
          <TabsTrigger value="tracking" className="flex items-center gap-1.5">
            <ScanBarcode className="w-4 h-4" /> Tracking Log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="shipping">
          <PalletShippingScanner />
        </TabsContent>
        <TabsContent value="tracking">
          <TrackingLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
