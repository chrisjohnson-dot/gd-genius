import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Scan, CheckCircle2, Warehouse, Star, Package,
  History, Trash2, AlertCircle, Loader2,
  ArrowRight, RefreshCw, ChevronDown, ChevronRight,
  PackageCheck, ArrowLeft, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

type Suggestion = {
  locationName: string;
  locationType: "pick_face" | "warehouse";
  reason: "consolidate" | "empty_pick_face" | "empty_warehouse";
  currentQty: number;
  expirationDate?: string;
  lotNumber?: string;
  priority: number;
};

type ScanRecord = {
  id: number;
  sku: string;
  description?: string | null;
  confirmedLocation?: string | null;
  confirmedLocationType?: string | null;
  suggestedLocation?: string | null;
  qty: number;
  scannedAt: Date;
  lotNumber?: string | null;
  expirationDate?: string | null;
};

type Receiver = {
  referenceNum: string | null;
  notes: string | null;
  readOnly: {
    transactionId: number;
    status: number;
    facilityIdentifier: { id: number; name: string };
    customerIdentifier: { id: number; name: string };
    createdDate?: string;
    expectedDate?: string;
  };
  receiveItems?: Array<{
    itemIdentifier: { sku: string; description?: string };
    expectedQty: number;
    receivedQty: number;
  }>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getOrCreateSessionId() {
  const key = "put-away-session-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = generateUuid();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function locationTypeBadge(type: "pick_face" | "warehouse") {
  if (type === "pick_face") {
    return (
      <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs gap-1">
        <Star className="h-3 w-3" /> Pick Face
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-xs gap-1">
      <Warehouse className="h-3 w-3" /> Warehouse
    </Badge>
  );
}

function reasonBadge(reason: Suggestion["reason"]) {
  if (reason === "consolidate") {
    return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">Consolidate</Badge>;
  }
  if (reason === "empty_pick_face") {
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Empty Pick Face</Badge>;
  }
  return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-xs">Empty Warehouse</Badge>;
}

// ─── Warehouse Card (completed receipts) ──────────────────────────────────

function CompletedWarehouseCard({
  facilityName,
  receivers,
  onSelect,
}: {
  facilityName: string;
  receivers: Receiver[];
  onSelect: (r: Receiver) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm text-foreground">{facilityName}</span>
          <Badge variant="secondary" className="text-xs">{receivers.length} completed</Badge>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="divide-y divide-border border-t border-border">
          {receivers.map((r) => {
            const itemCount = r.receiveItems?.length ?? 0;
            const date = r.readOnly.createdDate
              ? new Date(r.readOnly.createdDate).toLocaleDateString()
              : null;
            return (
              <button
                key={r.readOnly.transactionId}
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors text-left group"
                onClick={() => onSelect(r)}
              >
                <PackageCheck className="h-4 w-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {r.referenceNum ?? `#${r.readOnly.transactionId}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.readOnly.customerIdentifier.name}
                    </span>
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">
                      Completed
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {itemCount > 0 && <span>{itemCount} SKU{itemCount !== 1 ? "s" : ""}</span>}
                    {date && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {date}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Scan Session ──────────────────────────────────────────────────────────

function ScanSession({
  sessionId,
  configId,
  facilityId,
  customerId,
  customerName,
  referenceNum,
  transactionId,
  onBack,
}: {
  sessionId: string;
  configId: number;
  facilityId: number;
  customerId: number;
  customerName: string;
  referenceNum: string | null;
  transactionId: number;
  onBack: () => void;
}) {
  const [skuInput, setSkuInput] = useState("");
  const [qty, setQty] = useState(1);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [activeSku, setActiveSku] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [confirming, setConfirming] = useState(false);

  const utils = trpc.useUtils();

  const suggestQuery = trpc.putAway.suggest.useQuery(
    { configId, facilityId, customerId, sku: activeSku ?? "", qty },
    { enabled: !!activeSku, retry: false }
  );

  const sessionScansQuery = trpc.putAway.sessionScans.useQuery(
    { sessionId },
    { refetchInterval: 5000 }
  );
  const scans = (sessionScansQuery.data ?? []) as ScanRecord[];

  const logScanMutation = trpc.putAway.logScan.useMutation({
    onSuccess: () => { sessionScansQuery.refetch(); },
  });

  const clearSessionMutation = trpc.putAway.clearSession.useMutation({
    onSuccess: () => {
      sessionScansQuery.refetch();
      toast.success("Session cleared");
    },
  });

  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  const handleScan = useCallback(() => {
    const sku = skuInput.trim().toUpperCase();
    if (!sku) return;
    setActiveSku(sku);
    setSelectedSuggestion(null);
    setSkuInput("");
    utils.putAway.suggest.invalidate();
  }, [skuInput, utils]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  const handleConfirm = async (suggestion: Suggestion) => {
    if (!activeSku) return;
    setConfirming(true);
    try {
      await logScanMutation.mutateAsync({
        configId,
        facilityId,
        customerId,
        customerName: customerName || undefined,
        sku: activeSku,
        confirmedLocation: suggestion.locationName,
        confirmedLocationType: suggestion.locationType,
        suggestedLocation: suggestQuery.data?.suggestions[0]?.locationName,
        suggestedLocationType: suggestQuery.data?.suggestions[0]?.locationType,
        qty,
        sessionId,
      });
      toast.success(`Put away ${activeSku} → ${suggestion.locationName}`);
      setActiveSku(null);
      setSelectedSuggestion(null);
      setQty(1);
      scanInputRef.current?.focus();
    } catch {
      toast.error("Failed to log scan");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Session header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">
              {referenceNum ?? `Transaction #${transactionId}`}
            </span>
            <span className="text-xs text-muted-foreground">{customerName}</span>
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">
              Completed
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scan SKUs to get FEFO-based put-away location suggestions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Left: Scan Input ── */}
        <div className="xl:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Scan className="h-4 w-4" /> Scan SKU
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  ref={scanInputRef}
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scan or type SKU…"
                  className="font-mono text-sm h-9"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button
                  size="sm"
                  onClick={handleScan}
                  disabled={!skuInput.trim()}
                  className="h-9 px-3"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Qty:</label>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-7 w-20 text-sm"
                />
              </div>
              {activeSku && (
                <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-muted/40 rounded-lg px-3 py-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="font-mono">{activeSku}</span>
                  <span className="text-muted-foreground ml-auto text-xs">qty {qty}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Suggestions + History ── */}
        <div className="xl:col-span-2 space-y-4">
          {/* Suggestions */}
          {activeSku && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Suggestions — <span className="text-foreground font-mono">{activeSku}</span>
                  </CardTitle>
                  {suggestQuery.isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => suggestQuery.refetch()}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {suggestQuery.isLoading && (
                  <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Fetching inventory…</span>
                  </div>
                )}
                {suggestQuery.isError && (
                  <div className="flex items-center gap-2 text-sm text-destructive py-6 justify-center">
                    <AlertCircle className="h-4 w-4" />
                    Failed to load suggestions. Check config credentials.
                  </div>
                )}
                {suggestQuery.data && suggestQuery.data.suggestions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <MapPin className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">No locations found for this SKU.</p>
                    <p className="text-xs mt-1">Ensure the facility has locations configured in Extensiv.</p>
                  </div>
                )}
                {suggestQuery.data && suggestQuery.data.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground mb-3">
                      {suggestQuery.data.skuLocations} existing location{suggestQuery.data.skuLocations !== 1 ? "s" : ""} for this SKU
                      &nbsp;·&nbsp; {suggestQuery.data.suggestions.length} suggestion{suggestQuery.data.suggestions.length !== 1 ? "s" : ""}
                    </p>
                    {suggestQuery.data.suggestions.map((s, i) => {
                      const isTop = i === 0;
                      const isSelected = selectedSuggestion?.locationName === s.locationName;
                      return (
                        <div
                          key={s.locationName}
                          onClick={() => setSelectedSuggestion(isSelected ? null : s)}
                          className={`
                            relative flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all
                            ${isTop ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/30"}
                            ${isSelected ? "ring-2 ring-primary" : ""}
                          `}
                        >
                          {isTop && (
                            <span className="absolute -top-2 left-4 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                              TOP PICK
                            </span>
                          )}
                          <div className={`flex-shrink-0 rounded-lg p-2 ${isTop ? "bg-primary/15" : "bg-muted"}`}>
                            <MapPin className={`h-5 w-5 ${isTop ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-sm text-foreground">{s.locationName}</span>
                              {locationTypeBadge(s.locationType)}
                              {reasonBadge(s.reason)}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {s.currentQty > 0 && <span>{s.currentQty.toLocaleString()} units on hand</span>}
                              {s.expirationDate && <span>Exp: {new Date(s.expirationDate).toLocaleDateString()}</span>}
                              {s.lotNumber && <span>Lot: {s.lotNumber}</span>}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={isTop ? "default" : "outline"}
                            className="flex-shrink-0 h-8 gap-1"
                            disabled={confirming}
                            onClick={(e) => { e.stopPropagation(); handleConfirm(s); }}
                          >
                            {confirming && isSelected ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <><CheckCircle2 className="h-3.5 w-3.5" /> Confirm</>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty scan state */}
          {!activeSku && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
              <Scan className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">Ready to scan</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scan or type a SKU in the panel on the left to get location suggestions.
              </p>
            </div>
          )}

          {/* Session History */}
          {scans.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <History className="h-4 w-4" /> Session History
                    <Badge variant="secondary" className="text-xs">{scans.length}</Badge>
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => clearSessionMutation.mutate({ sessionId })}
                    disabled={clearSessionMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {scans.map((scan) => (
                    <div key={scan.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-foreground">{scan.sku}</span>
                          {scan.confirmedLocationType && locationTypeBadge(scan.confirmedLocationType as "pick_face" | "warehouse")}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>→ {scan.confirmedLocation ?? "Not confirmed"}</span>
                          {scan.lotNumber && <span>Lot: {scan.lotNumber}</span>}
                          {scan.expirationDate && <span>Exp: {scan.expirationDate}</span>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs text-muted-foreground">qty {scan.qty}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(scan.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function PutAwayAssistant() {
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [location] = useLocation();

  // Parse URL query params for pre-fill from Receiving Dashboard
  const urlParams = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search);
  }, [location]);

  const prefilledConfigId = urlParams?.get("configId") ? Number(urlParams.get("configId")) : null;
  const prefilledFacilityId = urlParams?.get("facilityId") ? Number(urlParams.get("facilityId")) : null;
  const prefilledCustomerId = urlParams?.get("customerId") ? Number(urlParams.get("customerId")) : null;
  const prefilledTransactionId = urlParams?.get("transactionId") ? Number(urlParams.get("transactionId")) : null;
  const prefilledReferenceNum = urlParams?.get("referenceNum") ?? null;

  // Active session state (set when a receipt is selected)
  const [activeSession, setActiveSession] = useState<{
    configId: number;
    facilityId: number;
    customerId: number;
    customerName: string;
    referenceNum: string | null;
    transactionId: number;
  } | null>(null);

  // Config list for the receiving.list query
  const configQuery = trpc.config.list.useQuery();
  const configs = configQuery.data ?? [];

  // Use the first config by default (most setups have one)
  const configId = configs[0]?.id ?? null;

  // Fetch completed receipts (status = 2)
  const receiversQuery = trpc.receiving.list.useQuery(
    { configId: configId!, pgsiz: 200 },
    { enabled: !!configId }
  );

  const allReceivers: Receiver[] = useMemo(() => {
    const list = (receiversQuery.data?.receivers ?? []) as Receiver[];
    // Filter to completed only (status === 2)
    return list.filter((r) => r.readOnly.status === 2);
  }, [receiversQuery.data]);

  // Group by facility name, sorted alphabetically
  const warehouseGroups = useMemo(() => {
    const map = new Map<string, Receiver[]>();
    for (const r of allReceivers) {
      const name = r.readOnly.facilityIdentifier.name;
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(r);
    }
    // Sort facility names alphabetically
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allReceivers]);

  // Auto-populate session from URL params (pre-fill from Receiving Dashboard)
  const didAutoFill = useRef(false);
  useEffect(() => {
    if (didAutoFill.current) return;
    if (!prefilledConfigId || !prefilledFacilityId || !prefilledCustomerId || !prefilledTransactionId) return;
    if (configs.length === 0) return;
    const configExists = configs.some((c) => c.id === prefilledConfigId);
    if (!configExists) return;
    didAutoFill.current = true;
    // Find the receiver in the list to get the customer name
    const receiver = allReceivers.find((r) => r.readOnly.transactionId === prefilledTransactionId);
    setActiveSession({
      configId: prefilledConfigId,
      facilityId: prefilledFacilityId,
      customerId: prefilledCustomerId,
      customerName: receiver?.readOnly.customerIdentifier.name ?? "",
      referenceNum: prefilledReferenceNum,
      transactionId: prefilledTransactionId,
    });
  }, [configs, allReceivers, prefilledConfigId, prefilledFacilityId, prefilledCustomerId, prefilledTransactionId, prefilledReferenceNum]);

  function handleSelectReceiver(r: Receiver) {
    if (!configId) return;
    setActiveSession({
      configId,
      facilityId: r.readOnly.facilityIdentifier.id,
      customerId: r.readOnly.customerIdentifier.id,
      customerName: r.readOnly.customerIdentifier.name,
      referenceNum: r.referenceNum,
      transactionId: r.readOnly.transactionId,
    });
  }

  // ── Scan session view ──
  if (activeSession) {
    return (
      <div className="p-5 space-y-5 page-enter">
        <div>
          <p className="page-breadcrumb">Receiving</p>
          <h1 className="page-title">Put Away Assistant</h1>
        </div>
        <ScanSession
          sessionId={sessionId}
          configId={activeSession.configId}
          facilityId={activeSession.facilityId}
          customerId={activeSession.customerId}
          customerName={activeSession.customerName}
          referenceNum={activeSession.referenceNum}
          transactionId={activeSession.transactionId}
          onBack={() => setActiveSession(null)}
        />
      </div>
    );
  }

  // ── Warehouse-grouped completed receipts landing view ──
  return (
    <div className="p-5 space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="page-breadcrumb">Receiving</p>
          <h1 className="page-title">Put Away Assistant</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select a completed receipt to begin scanning items for put-away.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs mt-1"
          onClick={() => receiversQuery.refetch()}
          disabled={receiversQuery.isFetching}
        >
          {receiversQuery.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {receiversQuery.isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading completed receipts…</span>
        </div>
      )}

      {/* No config */}
      {!configId && !receiversQuery.isLoading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No Extensiv config found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add an Extensiv configuration in Settings to get started.
          </p>
        </div>
      )}

      {/* Empty state */}
      {configId && !receiversQuery.isLoading && warehouseGroups.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <PackageCheck className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No completed receipts</p>
          <p className="text-xs text-muted-foreground mt-1">
            Receipts appear here once they are marked as Complete in the Receiving Dashboard.
          </p>
        </div>
      )}

      {/* Warehouse groups */}
      {warehouseGroups.map(([facilityName, receivers]) => (
        <CompletedWarehouseCard
          key={facilityName}
          facilityName={facilityName}
          receivers={receivers}
          onSelect={handleSelectReceiver}
        />
      ))}
    </div>
  );
}
