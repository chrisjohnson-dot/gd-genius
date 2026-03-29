import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MapPin, Scan, CheckCircle2, Warehouse, Star, Package,
  History, Trash2, ChevronRight, AlertCircle, Loader2,
  ArrowRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
// uuid generated inline

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

// ─── Helpers ───────────────────────────────────────────────────────────────

function reasonLabel(reason: Suggestion["reason"]) {
  if (reason === "consolidate") return "Consolidate";
  if (reason === "empty_pick_face") return "Empty Pick Face";
  return "Empty Warehouse";
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
    return (
      <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">
        Consolidate
      </Badge>
    );
  }
  if (reason === "empty_pick_face") {
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
        Empty Pick Face
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-xs">
      Empty Warehouse
    </Badge>
  );
}

// ─── Session ID (persisted per browser tab) ────────────────────────────────

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
  const prefilledTransactionId = urlParams?.get("transactionId") ?? null;
  const prefilledReferenceNum = urlParams?.get("referenceNum") ?? null;

  // Warehouse / customer selection
  const configQuery = trpc.config.list.useQuery();
  const configs = configQuery.data ?? [];

  const [configId, setConfigId] = useState<number | null>(null);
  const [facilityId, setFacilityId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState<string>("");

  // Fetch facilities and customers when config is selected
  const facilitiesQuery = trpc.extensiv.facilities.useQuery(
    { configId: configId! },
    { enabled: !!configId }
  );
  const facilities: Array<{ id: number; name: string }> = facilitiesQuery.data ?? [];

  const customersQuery = trpc.extensiv.customers.useQuery(
    { configId: configId! },
    { enabled: !!configId }
  );
  const customers: Array<{ id: number; name: string }> = customersQuery.data ?? [];

  // Scan input state
  const [skuInput, setSkuInput] = useState("");
  const [qty, setQty] = useState(1);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Suggestion state
  const [activeSku, setActiveSku] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [confirming, setConfirming] = useState(false);

  const suggestQuery = trpc.putAway.suggest.useQuery(
    {
      configId: configId!,
      facilityId: facilityId!,
      customerId: customerId!,
      sku: activeSku ?? "",
      qty,
    },
    {
      enabled: !!configId && !!facilityId && !!customerId && !!activeSku,
      retry: false,
    }
  );

  // Session history
  const sessionScansQuery = trpc.putAway.sessionScans.useQuery(
    { sessionId: sessionId as string },
    { refetchInterval: 5000 }
  );
  const scans = (sessionScansQuery.data ?? []) as ScanRecord[];

  const logScanMutation = trpc.putAway.logScan.useMutation({
    onSuccess: () => {
      sessionScansQuery.refetch();
    },
  });

  const clearSessionMutation = trpc.putAway.clearSession.useMutation({
    onSuccess: () => {
      sessionScansQuery.refetch();
      toast.success("Session cleared");
    },
  });

  const utils = trpc.useUtils();

  // Auto-populate session from URL params (pre-fill from Receiving Dashboard)
  const didAutoFill = useRef(false);
  useEffect(() => {
    if (didAutoFill.current) return;
    if (!prefilledConfigId || !prefilledFacilityId || !prefilledCustomerId) return;
    // Wait until configs are loaded to confirm the configId is valid
    if (configs.length === 0) return;
    const configExists = configs.some((c) => c.id === prefilledConfigId);
    if (!configExists) return;
    didAutoFill.current = true;
    setConfigId(prefilledConfigId);
    setFacilityId(prefilledFacilityId);
    setCustomerId(prefilledCustomerId);
    // customerName will be resolved once customers load — handled in the customers effect below
  }, [configs, prefilledConfigId, prefilledFacilityId, prefilledCustomerId]);

  // Resolve customerName once customers list loads after auto-fill
  useEffect(() => {
    if (!customerId || customers.length === 0 || customerName) return;
    const match = customers.find((c) => c.id === customerId);
    if (match) setCustomerName(match.name);
  }, [customers, customerId, customerName]);

  // Auto-focus scan input when setup is complete
  useEffect(() => {
    if (configId && facilityId && customerId) {
      scanInputRef.current?.focus();
    }
  }, [configId, facilityId, customerId]);

  // Handle scan submit
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

  // Confirm put-away to a location
  const handleConfirm = async (suggestion: Suggestion) => {
    if (!activeSku || !configId || !facilityId || !customerId) return;
    setConfirming(true);
    try {
      await logScanMutation.mutateAsync({
        configId,
        facilityId,
        customerId,
        customerName: customerName || undefined,
        sku: activeSku as string,
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

  const isSetupComplete = !!configId && !!facilityId && !!customerId;

  return (
    <div className="p-5 space-y-5 page-enter">
      {/* Header */}
      <div>
        <p className="page-breadcrumb">Receiving</p>
        <h1 className="page-title">Put Away Assistant</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scan a SKU to get FEFO-based put-away location suggestions.
        </p>
      </div>

      {/* Receipt context banner — shown when launched from Receiving Dashboard */}
      {(prefilledTransactionId || prefilledReferenceNum) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
          <span className="text-foreground">
            Receiving context:{" "}
            <span className="font-semibold text-primary">
              {prefilledReferenceNum
                ? `Receipt ${prefilledReferenceNum}`
                : `Transaction #${prefilledTransactionId}`}
            </span>
            {isSetupComplete
              ? " — session pre-filled. Ready to scan."
              : " — loading session setup…"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Left column: Setup + Scan ── */}
        <div className="xl:col-span-1 space-y-4">
          {/* Warehouse / Customer Setup */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Session Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Config */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Warehouse Config</label>
                <Select
                  value={configId?.toString() ?? ""}
                  onValueChange={(v) => {
                    setConfigId(Number(v));
                    setFacilityId(null);
                    setCustomerId(null);
                    setActiveSku(null);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select config…" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Facility */}
              {configId && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Facility</label>
                  <Select
                    value={facilityId?.toString() ?? ""}
                    onValueChange={(v) => {
                      setFacilityId(Number(v));
                      setCustomerId(null);
                      setActiveSku(null);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={facilitiesQuery.isLoading ? "Loading…" : "Select facility…"} />
                    </SelectTrigger>
                    <SelectContent>
                    {facilities.map((f: { id: number; name: string }) => (
                      <SelectItem key={f.id} value={f.id.toString()}>
                        {f.name}
                      </SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Customer */}
              {configId && facilityId && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Customer</label>
                  <Select
                    value={customerId?.toString() ?? ""}
                    onValueChange={(v) => {
                      const c = customers.find((x: { id: number; name: string }) => x.id === Number(v));
                      setCustomerId(Number(v));
                      setCustomerName(c?.name ?? "");
                      setActiveSku(null);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={customersQuery.isLoading ? "Loading…" : "Select customer…"} />
                    </SelectTrigger>
                    <SelectContent>
                    {customers.map((c: { id: number; name: string }) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isSetupComplete && (
                <div className="flex items-center gap-2 pt-1 text-xs text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready to scan
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan Input */}
          {isSetupComplete && (
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
          )}
        </div>

        {/* ── Right column: Suggestions + History ── */}
        <div className="xl:col-span-2 space-y-4">
          {/* Suggestions Panel */}
          {activeSku && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Location Suggestions — <span className="text-foreground font-mono">{activeSku}</span>
                  </CardTitle>
                  {suggestQuery.isFetching && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!suggestQuery.isFetching && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => suggestQuery.refetch()}
                    >
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
                    {/* Summary line */}
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
                          {/* Top badge */}
                          {isTop && (
                            <span className="absolute -top-2 left-4 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                              TOP PICK
                            </span>
                          )}

                          {/* Location icon */}
                          <div className={`flex-shrink-0 rounded-lg p-2 ${isTop ? "bg-primary/15" : "bg-muted"}`}>
                            <MapPin className={`h-5 w-5 ${isTop ? "text-primary" : "text-muted-foreground"}`} />
                          </div>

                          {/* Location info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-sm text-foreground">
                                {s.locationName}
                              </span>
                              {locationTypeBadge(s.locationType)}
                              {reasonBadge(s.reason)}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {s.currentQty > 0 && (
                                <span>{s.currentQty.toLocaleString()} units on hand</span>
                              )}
                              {s.expirationDate && (
                                <span>Exp: {new Date(s.expirationDate).toLocaleDateString()}</span>
                              )}
                              {s.lotNumber && <span>Lot: {s.lotNumber}</span>}
                            </div>
                          </div>

                          {/* Confirm button */}
                          <Button
                            size="sm"
                            variant={isTop ? "default" : "outline"}
                            className="flex-shrink-0 h-8 gap-1"
                            disabled={confirming}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirm(s);
                            }}
                          >
                            {confirming && isSelected ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Confirm
                              </>
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

          {/* Empty state when no scan active */}
          {!activeSku && isSetupComplete && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
              <Scan className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">Ready to scan</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scan or type a SKU in the panel on the left to get location suggestions.
              </p>
            </div>
          )}

          {/* Setup prompt */}
          {!isSetupComplete && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
              <ChevronRight className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">Complete session setup</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select a warehouse config, facility, and customer to begin.
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
                      <div className="flex-shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-foreground">{scan.sku}</span>
                          {scan.confirmedLocationType && locationTypeBadge(scan.confirmedLocationType as "pick_face" | "warehouse")}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>→ {scan.confirmedLocation ?? "Not confirmed"}</span>
                          {scan.confirmedLocationType && null /* type shown in badge above */}
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
