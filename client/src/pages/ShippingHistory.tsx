import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  ScrollText, Search, Plus, RefreshCw, Package, Truck,
  ExternalLink, Copy, Check, X, RotateCcw, Eye, EyeOff,
  Download, Printer, FileCheck, FileX, CheckCircle2, AlertTriangle, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const PLATFORM_LABELS: Record<string, string> = {
  veeqo: "Veeqo",
  techship: "TechShip",
  shipwell: "Shipwell",
  manual: "Manual",
};

const PLATFORM_COLORS: Record<string, string> = {
  veeqo: "bg-orange-100 text-orange-700 border-orange-200",
  techship: "bg-blue-100 text-blue-700 border-blue-200",
  shipwell: "bg-purple-100 text-purple-700 border-purple-200",
  manual: "bg-gray-100 text-gray-600 border-gray-200",
};

const MODE_LABELS: Record<string, string> = {
  small_parcel: "Small Parcel",
  ltl: "LTL",
  ftl: "FTL",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  booked: "bg-green-100 text-green-700 border-green-200",
  in_transit: "bg-blue-100 text-blue-700 border-blue-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  exception: "bg-red-100 text-red-700 border-red-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
};

// ─── ClearSight push-status badge ────────────────────────────────────────────

type PushStatus = "pending" | "sent" | "failed" | null | undefined;

interface ClearSightBadgeProps {
  status: PushStatus;
  attempts: number | null | undefined;
  lastPushedAt: Date | string | null | undefined;
  error: string | null | undefined;
  shipmentId: number;
  onRetry: () => void;
  isRetrying: boolean;
}

function ClearSightBadge({
  status,
  attempts,
  lastPushedAt,
  error,
  shipmentId,
  onRetry,
  isRetrying,
}: ClearSightBadgeProps) {
  if (!status) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-400 border-gray-200 cursor-default select-none">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-300 inline-block" />
              Not synced
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-xs">
            <p>ClearSight connection not configured or push not yet attempted.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (status === "sent") {
    const pushedAt = lastPushedAt ? new Date(lastPushedAt).toLocaleString() : null;
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default select-none">
              <Check className="h-3 w-3" />
              Synced
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
            <p className="font-semibold text-emerald-700">✓ Pushed to ClearSight</p>
            {pushedAt && <p className="text-muted-foreground">Last synced: {pushedAt}</p>}
            {attempts != null && <p className="text-muted-foreground">Attempt #{attempts}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (status === "pending") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200 cursor-default select-none">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
              Pending
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
            <p className="font-semibold text-amber-700">⏳ Queued for ClearSight</p>
            <p className="text-muted-foreground">Will be pushed in the next sync cycle (every 30 min).</p>
            {attempts != null && attempts > 0 && (
              <p className="text-muted-foreground">{attempts} attempt{attempts !== 1 ? "s" : ""} so far</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            disabled={isRetrying}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 transition-colors disabled:opacity-60 cursor-pointer"
            title={`Retry push for shipment #${shipmentId}`}
          >
            {isRetrying
              ? <RefreshCw className="h-3 w-3 animate-spin" />
              : <RotateCcw className="h-3 w-3" />
            }
            Failed
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
          <p className="font-semibold text-red-700">✗ Push to ClearSight failed</p>
          {error && <p className="text-muted-foreground break-words">{error}</p>}
          {attempts != null && (
            <p className="text-muted-foreground">{attempts} attempt{attempts !== 1 ? "s" : ""} made</p>
          )}
          <p className="text-muted-foreground italic">Click to retry now</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handleCopy} className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─── Manual entry form ────────────────────────────────────────────────────────

interface ManualEntryForm {
  platform: "veeqo" | "techship" | "shipwell" | "manual";
  mode: "small_parcel" | "ltl" | "ftl" | "other";
  orderNumber: string;
  customerName: string;
  facilityName: string;
  shipToName: string;
  shipToCity: string;
  shipToState: string;
  shipToZip: string;
  carrier: string;
  serviceLevel: string;
  trackingNumber: string;
  bolNumber: string;
  proNumber: string;
  notes: string;
}

const DEFAULT_FORM: ManualEntryForm = {
  platform: "manual",
  mode: "small_parcel",
  orderNumber: "",
  customerName: "",
  facilityName: "",
  shipToName: "",
  shipToCity: "",
  shipToState: "",
  shipToZip: "",
  carrier: "",
  serviceLevel: "",
  trackingNumber: "",
  bolNumber: "",
  proNumber: "",
  notes: "",
};

// ─── Carrier Pickup types ─────────────────────────────────────────────────────

interface PickupSession {
  id: number;
  transactionId: number | null;
  referenceNum: string | null;
  clientName: string | null;
  shipToName: string | null;
  carrierName: string | null;
  driverName: string | null;
  trailerNumber: string | null;
  proNumber: string | null;
  status: string;
  shippedInExtensiv: boolean | null;
  isDemo: boolean;
  bolUrl: string | null;
  signedBolUrl: string | null;
  expectedPallets: number | null;
  scannedCount: number;
  completedAt: Date | string | null;
  createdAt: Date | string;
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function BolCell({ session }: { session: PickupSession }) {
  const url = session.signedBolUrl ?? session.bolUrl;
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <FileX className="h-3.5 w-3.5" /> No BOL
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {session.signedBolUrl ? (
        <Badge variant="outline" className="text-[10px] border-green-500 text-green-700 dark:text-green-400 px-1.5 py-0 shrink-0">
          <FileCheck className="h-3 w-3 mr-0.5" /> Signed
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] border-indigo-400 text-indigo-600 dark:text-indigo-400 px-1.5 py-0 shrink-0">
          Draft
        </Badge>
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" title="View BOL">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
          <Download className="h-3.5 w-3.5" />
          View
        </Button>
      </a>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        title="Print BOL"
        onClick={() => {
          const win = window.open(url, "_blank");
          win?.print();
        }}
      >
        <Printer className="h-3.5 w-3.5" />
        Print
      </Button>
    </div>
  );
}

// ─── Carrier Pickups tab ──────────────────────────────────────────────────────

function PhotosCell({ sessionId }: { sessionId: number }) {
  const [expanded, setExpanded] = useState(false);
  const photosQuery = trpc.carrierPickup.getSessionPhotos.useQuery(
    { sessionId },
    { enabled: expanded, staleTime: 5 * 60 * 1000 }
  );
  const photos = photosQuery.data ?? [];
  if (!expanded) {
    return (
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setExpanded(true)}>
        <Camera className="h-3.5 w-3.5" /> Photos
      </Button>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium">Proof of Shipping</span>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => setExpanded(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      {photosQuery.isLoading ? (
        <div className="text-xs text-muted-foreground">Loading...</div>
      ) : photos.length === 0 ? (
        <div className="text-xs text-muted-foreground">No photos stored</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {photos.map((p: any) => (
            <a key={p.id} href={p.photoUrl} target="_blank" rel="noopener noreferrer" title={`Pallet: ${p.palletLabel}`}>
              <img src={p.photoUrl} alt={p.palletLabel}
                className="w-16 h-16 object-cover rounded border border-border hover:opacity-80 transition-opacity" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CarrierPickupsTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "scanning">("all");

  const { data, isLoading, refetch, isFetching } = trpc.carrierPickup.listHistory.useQuery(
    { limit: 200 },
    { refetchOnWindowFocus: false }
  );

  const sessions = (data ?? []) as PickupSession[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.referenceNum?.toLowerCase().includes(q) ||
        s.clientName?.toLowerCase().includes(q) ||
        s.driverName?.toLowerCase().includes(q) ||
        s.trailerNumber?.toLowerCase().includes(q) ||
        s.carrierName?.toLowerCase().includes(q) ||
        s.proNumber?.toLowerCase().includes(q) ||
        String(s.transactionId ?? "").includes(q)
      );
    });
  }, [sessions, search, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search ref, customer, driver, trailer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(["all", "complete", "scanning"] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className="h-9 capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s === "complete" ? "Completed" : "In Progress"}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 ml-auto"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {filtered.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} session{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pickup sessions found</p>
          <p className="text-sm mt-1">
            {search || statusFilter !== "all"
              ? "Try adjusting your filters."
              : "Carrier pickup sessions will appear here once created."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead>Order / Ref</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Trailer</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead className="w-[130px] text-center">Scanned / Expected</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[200px]">BOL</TableHead>
                <TableHead className="w-[120px]">Photos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className="text-sm">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(s.completedAt ?? s.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{s.referenceNum ?? "—"}</div>
                    {s.transactionId && (
                      <div className="text-xs text-muted-foreground">TX {s.transactionId}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{s.clientName ?? "—"}</div>
                    {s.shipToName && (
                      <div className="text-xs text-muted-foreground truncate max-w-[160px]">{s.shipToName}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{s.driverName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.trailerNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.carrierName ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const scanned = s.scannedCount ?? 0;
                      const expected = s.expectedPallets ?? 0;
                      const isMatch = expected > 0 && scanned === expected;
                      const isShort = expected > 0 && scanned < expected;
                      const isOver = expected > 0 && scanned > expected;
                      return (
                        <span className={`font-medium text-xs ${
                          isMatch ? "text-green-700 dark:text-green-400" :
                          isShort ? "text-amber-600 dark:text-amber-400" :
                          isOver  ? "text-red-600 dark:text-red-400" :
                          "text-foreground"
                        }`}>
                          {scanned}{expected > 0 ? ` / ${expected}` : ""}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {s.isDemo ? (
                      <Badge variant="outline" className="text-xs">Demo</Badge>
                    ) : s.status === "complete" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {s.shippedInExtensiv ? "Shipped" : "Complete"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        In Progress
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <BolCell session={s} />
                  </TableCell>
                  <TableCell>
                    <PhotosCell sessionId={s.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShippingHistory() {
  const [activeTab, setActiveTab] = useState<"shipments" | "pickups">("shipments");

  // Filters (Shipments tab)
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [showClearSight, setShowClearSight] = useState(true);
  const PAGE_SIZE = 50;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout((handleSearchChange as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearchChange as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 400);
  };

  const queryInput = useMemo(() => ({
    platform: platformFilter !== "all" ? (platformFilter as "veeqo" | "techship" | "shipwell" | "manual") : undefined,
    trackingNumber: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    orderNumber: debouncedSearch.length >= 3 && !debouncedSearch.match(/^[A-Z0-9]{10,}$/) ? debouncedSearch : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [platformFilter, debouncedSearch, page]);

  const { data, isLoading, refetch } = trpc.shippingHistory.list.useQuery(queryInput);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState<ManualEntryForm>(DEFAULT_FORM);
  const recordManual = trpc.shippingHistory.recordManual.useMutation({
    onSuccess: () => {
      toast.success("Tracking number recorded", { description: `${form.trackingNumber} saved successfully.` });
      setShowManual(false);
      setForm(DEFAULT_FORM);
      void refetch();
    },
    onError: (err) => {
      toast.error("Error", { description: err.message });
    },
  });

  const utils = trpc.useUtils();
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());
  const retryPush = trpc.shippingHistory.retryPush.useMutation({
    onMutate: ({ id }) => {
      setRetryingIds(prev => new Set(prev).add(id));
    },
    onSuccess: (_, { id }) => {
      setRetryingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      toast.success("Retry queued", { description: "ClearSight push re-queued. Refresh in a moment to see the result." });
      setTimeout(() => void refetch(), 3000);
    },
    onError: (err, { id }) => {
      setRetryingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      toast.error("Retry failed", { description: err.message });
    },
  });

  const handleSubmitManual = () => {
    if (!form.trackingNumber.trim()) {
      toast.error("Tracking number required");
      return;
    }
    recordManual.mutate({
      ...form,
      orderNumber: form.orderNumber || undefined,
      customerName: form.customerName || undefined,
      facilityName: form.facilityName || undefined,
      shipToName: form.shipToName || undefined,
      shipToCity: form.shipToCity || undefined,
      shipToState: form.shipToState || undefined,
      shipToZip: form.shipToZip || undefined,
      carrier: form.carrier || undefined,
      serviceLevel: form.serviceLevel || undefined,
      bolNumber: form.bolNumber || undefined,
      proNumber: form.proNumber || undefined,
      notes: form.notes || undefined,
    });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const colSpan = showClearSight ? 10 : 9;

  return (
    <div className="p-7 page-enter">
      <p className="page-breadcrumb">Shipping</p>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title mb-1">Shipping History</h1>
          <p className="text-sm text-muted-foreground">
            Unified tracking registry across Veeqo, Shipwell, TechShip, manual entries, and carrier pickups
          </p>
        </div>
        {activeTab === "shipments" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClearSight(v => !v)}
              title={showClearSight ? "Hide ClearSight column" : "Show ClearSight column"}
            >
              {showClearSight ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              ClearSight
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowManual(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Tracking
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-5">
        <button
          onClick={() => setActiveTab("shipments")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "shipments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ScrollText className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Shipments
        </button>
        <button
          onClick={() => setActiveTab("pickups")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "pickups"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Truck className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Carrier Pickups
        </button>
      </div>

      {/* Carrier Pickups Tab */}
      {activeTab === "pickups" && <CarrierPickupsTab />}

      {/* Shipments Tab */}
      {activeTab === "shipments" && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tracking # or order #..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="veeqo">Veeqo</SelectItem>
                <SelectItem value="shipwell">Shipwell</SelectItem>
                <SelectItem value="techship">TechShip</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {total.toLocaleString()} shipment{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tracking #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Platform</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Transaction ID</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ship To</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Carrier / Service</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    {showClearSight && (
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        ClearSight
                      </th>
                    )}
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={colSpan} className="text-center py-16 text-muted-foreground">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading shipments...
                      </td>
                    </tr>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={colSpan} className="text-center py-16 text-muted-foreground">
                        <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p className="font-medium">No shipments found</p>
                        <p className="text-xs mt-1 opacity-70">
                          {debouncedSearch || platformFilter !== "all"
                            ? "Try adjusting your filters"
                            : "Shipments will appear here after labels are purchased in Pack & Ship or orders are sent to Shipwell"}
                        </p>
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.trackingNumber ? (
                          <span className="flex items-center gap-1">
                            <span className="text-foreground font-medium">{row.trackingNumber}</span>
                            <CopyButton text={row.trackingNumber} />
                          </span>
                        ) : row.bolNumber ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <span>BOL: {row.bolNumber}</span>
                            <CopyButton text={row.bolNumber} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Pending</span>
                        )}
                        {row.proNumber && (
                          <div className="text-muted-foreground text-xs mt-0.5">PRO: {row.proNumber}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${PLATFORM_COLORS[row.platform] ?? "bg-gray-100 text-gray-600"}`}>
                          {PLATFORM_LABELS[row.platform] ?? row.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {row.mode === "small_parcel" ? (
                          <span className="flex items-center gap-1"><Package className="h-3 w-3" />{MODE_LABELS[row.mode]}</span>
                        ) : (
                          <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{MODE_LABELS[row.mode ?? ""] ?? row.mode}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {row.orderNumber ?? <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.customerName ?? <span className="text-muted-foreground italic opacity-50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {[row.shipToCity, row.shipToState].filter(Boolean).join(", ") || <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.carrier ? (
                          <div>
                            <span className="font-medium text-foreground">{row.carrier}</span>
                            {row.serviceLevel && <div className="text-muted-foreground">{row.serviceLevel}</div>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic opacity-50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[row.status ?? "booked"] ?? "bg-gray-100 text-gray-600"}`}>
                          {(row.status ?? "booked").replace(/_/g, " ")}
                        </span>
                      </td>
                      {showClearSight && (
                        <td className="px-4 py-3">
                          <ClearSightBadge
                            status={row.clearSightPushStatus as PushStatus}
                            attempts={row.clearSightPushAttempts}
                            lastPushedAt={row.clearSightLastPushedAt}
                            error={row.clearSightPushError}
                            shipmentId={row.id}
                            onRetry={() => retryPush.mutate({ id: row.id })}
                            isRetrying={retryingIds.has(row.id)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                        {row.labelUrl && (
                          <a href={row.labelUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Manual Entry Dialog */}
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Tracking Number</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Platform</Label>
                <Select value={form.platform} onValueChange={(v) => setForm(f => ({ ...f, platform: v as ManualEntryForm["platform"] }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="veeqo">Veeqo</SelectItem>
                    <SelectItem value="techship">TechShip</SelectItem>
                    <SelectItem value="shipwell">Shipwell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm(f => ({ ...f, mode: v as ManualEntryForm["mode"] }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small_parcel">Small Parcel</SelectItem>
                    <SelectItem value="ltl">LTL</SelectItem>
                    <SelectItem value="ftl">FTL</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Tracking Number <span className="text-red-500">*</span></Label>
              <Input
                value={form.trackingNumber}
                onChange={(e) => setForm(f => ({ ...f, trackingNumber: e.target.value }))}
                placeholder="e.g. 1Z999AA10123456784"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">BOL Number</Label>
                <Input value={form.bolNumber} onChange={(e) => setForm(f => ({ ...f, bolNumber: e.target.value }))} placeholder="Optional" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">PRO Number</Label>
                <Input value={form.proNumber} onChange={(e) => setForm(f => ({ ...f, proNumber: e.target.value }))} placeholder="Optional" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Transaction ID</Label>
                <Input value={form.orderNumber} onChange={(e) => setForm(f => ({ ...f, orderNumber: e.target.value }))} placeholder="e.g. 143355885" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Customer</Label>
                <Input value={form.customerName} onChange={(e) => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Customer name" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Carrier</Label>
                <Input value={form.carrier} onChange={(e) => setForm(f => ({ ...f, carrier: e.target.value }))} placeholder="e.g. UPS, FedEx" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Service Level</Label>
                <Input value={form.serviceLevel} onChange={(e) => setForm(f => ({ ...f, serviceLevel: e.target.value }))} placeholder="e.g. Ground" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Ship-To City</Label>
                <Input value={form.shipToCity} onChange={(e) => setForm(f => ({ ...f, shipToCity: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">State/Prov</Label>
                <Input value={form.shipToState} onChange={(e) => setForm(f => ({ ...f, shipToState: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Postal Code</Label>
                <Input value={form.shipToZip} onChange={(e) => setForm(f => ({ ...f, shipToZip: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManual(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSubmitManual} disabled={recordManual.isPending || !form.trackingNumber.trim()}>
              {recordManual.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Save Tracking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
