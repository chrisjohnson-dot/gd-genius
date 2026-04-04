import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ImageOff,
  Loader2,
  RefreshCw,
  Eye,
  Search,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type Verdict = "pass" | "fail" | "hold";

interface ScanRecord {
  scanId: string;
  cartonId: string | null;
  runId: string;
  verdict: string;
  failReason: string | null;
  scannedGtin: string | null;
  scannedLot: string | null;
  scannedExpiry: string | null;
  camAImageUrl: string | null;
  camBImageUrl: string | null;
  postApplyImageUrl: string | null;
  postApplyReceivedAt: Date | null;
  scannedAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function verdictBadge(verdict: string) {
  if (verdict === "pass")
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Pass
      </Badge>
    );
  if (verdict === "fail")
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0 gap-1">
        <XCircle className="h-3 w-3" /> Fail
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 gap-1">
      <AlertTriangle className="h-3 w-3" /> Hold
    </Badge>
  );
}

function imageCount(scan: ScanRecord): number {
  return [scan.camAImageUrl, scan.camBImageUrl, scan.postApplyImageUrl].filter(Boolean).length;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ scan, onClose }: { scan: ScanRecord; onClose: () => void }) {
  const cameras = [
    { label: "Camera A — Label face (pre-apply)", url: scan.camAImageUrl },
    { label: "Camera B — Opposite face", url: scan.camBImageUrl },
    { label: "Camera C — Post-apply verification", url: scan.postApplyImageUrl },
  ].filter((c) => c.url);

  const [activeIdx, setActiveIdx] = useState(0);
  const active = cameras[activeIdx];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Scan Detail — {scan.cartonId ?? scan.scanId}
          </DialogTitle>
        </DialogHeader>

        {cameras.length > 1 && (
          <div className="flex gap-2 px-6 pb-2 flex-wrap">
            {cameras.map((c, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  i === activeIdx
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {active ? (
          <div className="relative bg-black flex items-center justify-center min-h-[320px] max-h-[60vh]">
            <img
              src={active.url!}
              alt={active.label}
              className="max-h-[60vh] max-w-full object-contain"
            />
            {cameras.length > 1 && (
              <>
                <button
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                  disabled={activeIdx === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setActiveIdx((i) => Math.min(cameras.length - 1, i + 1))}
                  disabled={activeIdx === cameras.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[200px] text-muted-foreground gap-2">
            <ImageOff className="h-6 w-6" />
            No images captured for this scan
          </div>
        )}

        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-t">
          <div>
            <p className="text-xs text-muted-foreground">Verdict</p>
            <div className="mt-0.5">{verdictBadge(scan.verdict)}</div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">GTIN</p>
            <p className="font-mono text-xs mt-0.5">{scan.scannedGtin ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Lot</p>
            <p className="font-mono text-xs mt-0.5">{scan.scannedLot ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expiry</p>
            <p className="font-mono text-xs mt-0.5">{scan.scannedExpiry ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Run ID</p>
            <p className="font-mono text-xs mt-0.5 truncate">{scan.runId}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Scanned At</p>
            <p className="text-xs mt-0.5">{new Date(scan.scannedAt).toLocaleString()}</p>
          </div>
          {scan.failReason && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Fail Reason</p>
              <p className="font-mono text-xs mt-0.5 text-red-600">{scan.failReason}</p>
            </div>
          )}
          {scan.postApplyReceivedAt && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Post-Apply Received</p>
              <p className="text-xs mt-0.5">{new Date(scan.postApplyReceivedAt).toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex flex-wrap gap-2">
          {cameras.map((c, i) => (
            <a key={i} href={c.url!} download target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download {c.label.split("—")[0].trim()}
              </Button>
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Scan Card ─────────────────────────────────────────────────────────────────

function ScanCard({ scan, onClick }: { scan: ScanRecord; onClick: () => void }) {
  const thumbUrl = scan.camAImageUrl ?? scan.camBImageUrl ?? scan.postApplyImageUrl;
  const imgCount = imageCount(scan);

  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg border border-border overflow-hidden bg-card hover:border-primary/60 hover:shadow-md transition-all text-left"
    >
      <div className="relative h-36 bg-muted flex items-center justify-center overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="scan thumbnail"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <ImageOff className="h-8 w-8 text-muted-foreground/40" />
        )}
        <div className="absolute top-2 left-2">{verdictBadge(scan.verdict)}</div>
        {imgCount > 0 && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Camera className="h-3 w-3" />
            {imgCount}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div className="p-2.5 space-y-0.5">
        <p className="text-xs font-mono truncate text-foreground">
          {scan.cartonId ?? scan.scanId.slice(0, 12) + "…"}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {scan.scannedGtin ?? "No GTIN"} · {scan.scannedLot ?? "No lot"}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(scan.scannedAt).toLocaleString()}
        </p>
        {scan.failReason && (
          <p className="text-xs text-red-500 truncate">{scan.failReason}</p>
        )}
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 48;

export default function AuditImages() {
  const [selectedRunId, setSelectedRunId] = useState<string>("all");
  const [selectedVerdict, setSelectedVerdict] = useState<string>("all");
  const [hasImages, setHasImages] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [lightboxScan, setLightboxScan] = useState<ScanRecord | null>(null);

  const { data: runsData } = trpc.auditImages.listRuns.useQuery();

  const queryInput = useMemo(
    () => ({
      runId: selectedRunId !== "all" ? selectedRunId : undefined,
      verdict: selectedVerdict !== "all" ? (selectedVerdict as Verdict) : undefined,
      hasImages: hasImages || undefined,
      fromTs: fromDate ? new Date(fromDate).getTime() : undefined,
      toTs: toDate ? new Date(toDate + "T23:59:59").getTime() : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [selectedRunId, selectedVerdict, hasImages, fromDate, toDate, page]
  );

  const { data, isLoading, refetch } = trpc.auditImages.list.useQuery(queryInput);

  const exportQuery = trpc.auditImages.exportRunManifest.useQuery(
    { runId: selectedRunId !== "all" ? selectedRunId : "none" },
    { enabled: false }
  );

  const purgeMutation = trpc.auditImages.triggerRetentionPurge.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Purge complete: ${result.purgedCount} images removed, ${result.skippedCount} skipped`
      );
      refetch();
    },
    onError: (err) => toast.error(`Purge failed: ${err.message}`),
  });

  const scans: ScanRecord[] = (data?.scans ?? []) as ScanRecord[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleExportManifest() {
    if (selectedRunId === "all") {
      toast.error("Select a specific run to export its image manifest");
      return;
    }
    exportQuery.refetch().then((res) => {
      if (res.data) {
        downloadCsv(res.data.csv, res.data.filename);
        toast.success(`Exported ${res.data.totalRows} rows`);
      }
    });
  }

  function handleReset() {
    setSelectedRunId("all");
    setSelectedVerdict("all");
    setHasImages(false);
    setFromDate("");
    setToDate("");
    setPage(0);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Camera className="h-6 w-6" />
            Audit Images
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse Camera A, B, and C images captured during production scans. Click any card to
            view full-size images and scan metadata.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportManifest}
            disabled={selectedRunId === "all" || exportQuery.isFetching}
            className="gap-1.5"
          >
            {exportQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export Manifest CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => purgeMutation.mutate()}
            disabled={purgeMutation.isPending}
            className="gap-1.5 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            {purgeMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Run Purge Now
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Production Run</Label>
              <Select
                value={selectedRunId}
                onValueChange={(v) => { setSelectedRunId(v); setPage(0); }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All runs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All runs</SelectItem>
                  {runsData?.map((r) => (
                    <SelectItem key={r.runId} value={r.runId}>
                      {r.runId.slice(0, 8)}… · {r.expectedGtin ?? r.lineId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Verdict</Label>
              <Select
                value={selectedVerdict}
                onValueChange={(v) => { setSelectedVerdict(v); setPage(0); }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All verdicts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All verdicts</SelectItem>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">From date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(0); }}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">To date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(0); }}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Images only</Label>
              <button
                onClick={() => { setHasImages(!hasImages); setPage(0); }}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs transition-colors w-full justify-center ${
                  hasImages
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                {hasImages ? "With images" : "All scans"}
              </button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">&nbsp;</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs w-full"
                onClick={handleReset}
              >
                <Search className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {isLoading
            ? "Loading…"
            : `${total.toLocaleString()} scan${total !== 1 ? "s" : ""} found`}
        </span>
        {totalPages > 1 && (
          <span>
            Page {page + 1} of {totalPages}
          </span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading scan images…
        </div>
      ) : scans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <ImageOff className="h-10 w-10 opacity-30" />
          <p className="text-sm">No scans match the current filters.</p>
          <p className="text-xs text-center max-w-sm">
            Images are captured when the edge compute sends{" "}
            <code className="font-mono bg-muted px-1 rounded">cam_a_image_b64</code> or{" "}
            <code className="font-mono bg-muted px-1 rounded">cam_b_image_b64</code> in the scan
            payload, or via the{" "}
            <code className="font-mono bg-muted px-1 rounded">/api/scan/image-receive</code>{" "}
            endpoint.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {scans.map((scan) => (
            <ScanCard
              key={scan.scanId}
              scan={scan}
              onClick={() => setLightboxScan(scan)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxScan && (
        <Lightbox scan={lightboxScan} onClose={() => setLightboxScan(null)} />
      )}
    </div>
  );
}
