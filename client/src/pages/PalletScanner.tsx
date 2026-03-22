import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ScanBarcode, Truck, CheckCircle2, Clock, Package, ChevronRight, RefreshCw,
} from "lucide-react";

type PalletScan = {
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
  } catch {
    // ignore
  }
}

export default function PalletScanner() {
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedDoor, setSelectedDoor] = useState<string>("");
  const [carrierInput, setCarrierInput] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [lastScan, setLastScan] = useState<PalletScan | null>(null);
  const [departDialog, setDepartDialog] = useState<PalletScan | null>(null);

  const trackingRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: scans = [], isLoading, refetch } = trpc.palletScanner.list.useQuery(
    { limit: 50 },
    { refetchInterval: 15_000 }
  );

  const logScan = trpc.palletScanner.logScan.useMutation({
    onSuccess: (data) => {
      playBeep("success");
      setLastScan(data as PalletScan);
      setTrackingInput("");
      toast.success(`Pallet logged — ${data?.trackingNumber}`, {
        description: selectedDoor ? `Door: ${selectedDoor}` : undefined,
      });
      refetch();
      trackingRef.current?.focus();
    },
    onError: (e) => {
      playBeep("error");
      toast.error(e.message);
      trackingRef.current?.focus();
    },
  });

  const updateStatus = trpc.palletScanner.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      setDepartDialog(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingInput.trim()) return;
    logScan.mutate({
      trackingNumber: trackingInput.trim(),
      doorNumber: selectedDoor || undefined,
      carrierName: carrierInput.trim() || undefined,
      referenceNumber: referenceInput.trim() || undefined,
      notes: notesInput.trim() || undefined,
    });
  };

  // Auto-focus tracking input on mount
  useEffect(() => {
    trackingRef.current?.focus();
  }, []);

  const loadedCount = scans.filter((s) => s.status === "loaded").length;
  const departedToday = scans.filter((s) => {
    if (s.status !== "departed") return false;
    const d = new Date(s.scannedAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            Pallet Scanner
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Scan tracking numbers when pallets are loaded onto dock doors
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-500">{loadedCount}</div>
            <div className="text-sm text-muted-foreground">Currently Loaded</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">{departedToday}</div>
            <div className="text-sm text-muted-foreground">Departed Today</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{scans.length}</div>
            <div className="text-sm text-muted-foreground">Total (last 50)</div>
          </CardContent>
        </Card>
      </div>

      {/* Scan form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanBarcode className="w-4 h-4" /> Scan Pallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleScan} className="space-y-4">
            {/* Tracking number — primary scan target */}
            <div>
              <label className="text-sm font-medium mb-1 block">Tracking Number *</label>
              <Input
                ref={trackingRef}
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Scan or type tracking number…"
                className="text-lg h-12 font-mono"
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Door */}
              <div>
                <label className="text-sm font-medium mb-1 block">Door</label>
                <Select value={selectedDoor} onValueChange={setSelectedDoor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select door…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No door</SelectItem>
                    {DOORS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Carrier */}
              <div>
                <label className="text-sm font-medium mb-1 block">Carrier</label>
                <Input
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value)}
                  placeholder="e.g. UPS, FedEx"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="text-sm font-medium mb-1 block">Reference #</label>
                <Input
                  value={referenceInput}
                  onChange={(e) => setReferenceInput(e.target.value)}
                  placeholder="Order / PRO number"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
              <Input
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Any additional notes…"
              />
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={logScan.isPending || !trackingInput.trim()}>
              <ScanBarcode className="w-5 h-5 mr-2" />
              {logScan.isPending ? "Logging…" : "Log Pallet Scan"}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </form>

          {/* Last scan feedback */}
          {lastScan && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 border border-green-400/30">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold font-mono">{lastScan.trackingNumber}</div>
                <div className="text-xs opacity-80">
                  {lastScan.doorNumber && `${lastScan.doorNumber} · `}
                  {lastScan.carrierName && `${lastScan.carrierName} · `}
                  {new Date(lastScan.scannedAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent scans table */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Package className="w-5 h-5" /> Recent Scans
        </h2>
        <div className="border rounded-lg overflow-hidden">
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
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : scans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Truck className="w-8 h-8 opacity-30" />
                      <span>No pallet scans yet. Scan a tracking number above.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                scans.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell className="font-mono text-sm font-semibold">{scan.trackingNumber}</TableCell>
                    <TableCell className="text-sm">{scan.doorNumber ?? "—"}</TableCell>
                    <TableCell className="text-sm">{scan.carrierName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{scan.referenceNumber ?? "—"}</TableCell>
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
                          onClick={() => setDepartDialog(scan as PalletScan)}
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
      </div>

      {/* Depart confirmation dialog */}
      <Dialog open={!!departDialog} onOpenChange={(open) => !open && setDepartDialog(null)}>
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
                  <span className="font-mono font-semibold">{departDialog.trackingNumber}</span>
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
            <Button variant="outline" onClick={() => setDepartDialog(null)}>Cancel</Button>
            <Button
              onClick={() => departDialog && updateStatus.mutate({ id: departDialog.id, status: "departed" })}
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
