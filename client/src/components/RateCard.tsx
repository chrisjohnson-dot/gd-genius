import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Zap, DollarSign, Clock, Star, AlertTriangle, CheckCircle2,
  RefreshCw, ChevronUp, ChevronDown, Loader2, Info, Package,
  Truck, ArrowRight, RotateCcw, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RateCardInput {
  configId: number;
  orderId?: number;
  orderNumber?: string;
  locationId: string;
  customerId?: number;
  customerName?: string;
  weightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  destPostal: string;
  destCountry?: string;
  destAddress1?: string;
  destCity?: string;
  destState?: string;
  destName?: string;
  isResidential?: boolean;
  declaredValue?: number;
  requireSignature?: boolean;
}

export interface RateRow {
  rateId: string;
  carrierCode: string;
  carrierName: string;
  service: string;
  transitDays: number;
  totalCost: number;
  currency: string;
  isPreferred: boolean;
  isCheapest: boolean;
  isFastest: boolean;
  surcharges: Array<{ label: string; amount: number }>;
  isMock: boolean;
  hasCredentials: boolean;
  // Veeqo Rate Shopping API tokens (present when live rates are fetched)
  remoteShipmentId?: string;
  requestToken?: string;
}

type SortKey = "cost" | "transit" | "carrier";
type SortDir = "asc" | "desc";

// ─── Carrier colour map ───────────────────────────────────────────────────────
const CARRIER_COLOURS: Record<string, string> = {
  usps:        "bg-blue-100 text-blue-800 border-blue-200",
  fedex:       "bg-purple-100 text-purple-800 border-purple-200",
  ups:         "bg-amber-100 text-amber-800 border-amber-200",
  ontrac:      "bg-green-100 text-green-800 border-green-200",
  dhl_express: "bg-yellow-100 text-yellow-800 border-yellow-200",
  canpar:      "bg-red-100 text-red-800 border-red-200",
  purolator:   "bg-indigo-100 text-indigo-800 border-indigo-200",
  canada_post: "bg-rose-100 text-rose-800 border-rose-200",
  gls_canada:  "bg-teal-100 text-teal-800 border-teal-200",
};

function carrierBadge(code: string) {
  return CARRIER_COLOURS[code] ?? "bg-slate-100 text-slate-800 border-slate-200";
}

// ─── RateCard ─────────────────────────────────────────────────────────────────
interface RateCardProps {
  input: RateCardInput;
  onConfirm?: (rate: RateRow) => void;
  onSkip?: () => void;
  compact?: boolean;
}

export function RateCard({ input, onConfirm, onSkip, compact = false }: RateCardProps) {
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterCarrier, setFilterCarrier] = useState<string>("all");
  const [filterMaxDays, setFilterMaxDays] = useState<string>("all");
  const [showSurcharges, setShowSurcharges] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Track the input snapshot that was used to fetch the current rates
  // so we can detect when dimensions change and rates are stale
  const [fetchedInput, setFetchedInput] = useState<RateCardInput | null>(null);

  const ratesQuery = trpc.rateWizard.getRates.useQuery(
    {
      ...input,
      destCountry: input.destCountry ?? "US",
      isResidential: input.isResidential ?? false,
      requireSignature: input.requireSignature ?? false,
    },
    {
      enabled: !!(input.locationId && input.weightLbs > 0 && input.destPostal),
      staleTime: 30_000,
    }
  );

  const data = ratesQuery.data;
  const rates: RateRow[] = data?.rates ?? [];
  const maxTransitDays = data?.customerRule?.maxTransitDays ?? null;

  // Auto-select: preferred carrier first, then cheapest rate that meets SLA, then absolute cheapest
  const autoSelectedRateId = useMemo(() => {
    if (!data?.autoSelectedRateId) return null;
    // If there's a preferred carrier, use the server's auto-selected rate
    if (data.customerRule?.preferredCarrier) return data.autoSelectedRateId;
    // Otherwise pick cheapest rate that meets maxTransitDays SLA
    if (maxTransitDays !== null) {
      const slaCompliant = rates.filter((r) => r.transitDays <= maxTransitDays);
      if (slaCompliant.length > 0) {
        const cheapestCompliant = slaCompliant.reduce((a, b) => a.totalCost <= b.totalCost ? a : b);
        return cheapestCompliant.rateId;
      }
    }
    return data.autoSelectedRateId;
  }, [data, rates, maxTransitDays]);

  // Auto-select the best SLA-compliant rate when data first loads
  useEffect(() => {
    if (ratesQuery.data && autoSelectedRateId && !selectedRateId) {
      setSelectedRateId(autoSelectedRateId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectedRateId]);

  // Snapshot the input whenever fresh data arrives
  useEffect(() => {
    if (ratesQuery.data) {
      setFetchedInput({ ...input });
    }
  // We intentionally only run this when data changes, not on every input change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratesQuery.data]);

  // Detect if dimensions have changed since last fetch
  const dimensionsChanged = fetchedInput !== null && (
    fetchedInput.weightLbs !== input.weightLbs ||
    fetchedInput.lengthIn !== input.lengthIn ||
    fetchedInput.widthIn !== input.widthIn ||
    fetchedInput.heightIn !== input.heightIn
  );

  function handleRefresh() {
    setSelectedRateId(null);
    ratesQuery.refetch();
  }

  const confirmMutation = trpc.rateWizard.confirmRate.useMutation({
    onSuccess: (data) => {
      if (data.isMock) {
        toast("Rate selected (mock) — Add carrier credentials to book real labels.");
      } else {
        toast.success(`Label booked! Shipment #${data.shipmentId} created.`);
      }
    },
    onError: (err) => {
      toast.error(`Error confirming rate: ${err.message}`);
    },
  });

  // Unique carriers in results
  const carriers = useMemo(() => Array.from(new Set(rates.map((r) => r.carrierCode))), [rates]);

  // Filter + sort
  const displayed = useMemo(() => {
    let list = [...rates];
    if (filterCarrier !== "all") list = list.filter((r) => r.carrierCode === filterCarrier);
    if (filterMaxDays !== "all") list = list.filter((r) => r.transitDays <= parseInt(filterMaxDays));
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "cost") cmp = a.totalCost - b.totalCost;
      else if (sortKey === "transit") cmp = a.transitDays - b.transitDays;
      else cmp = a.carrierName.localeCompare(b.carrierName);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rates, filterCarrier, filterMaxDays, sortKey, sortDir]);

  const selectedRate = displayed.find((r) => r.rateId === selectedRateId) ?? null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  async function handleConfirm() {
    if (!selectedRate) return;
    setConfirming(true);
    try {
      await confirmMutation.mutateAsync({
        configId: input.configId,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        locationId: input.locationId,
        customerId: input.customerId,
        customerName: input.customerName,
        rateId: selectedRate.rateId,
        carrierCode: selectedRate.carrierCode,
        carrierName: selectedRate.carrierName,
        service: selectedRate.service,
        transitDays: selectedRate.transitDays,
        totalCost: selectedRate.totalCost,
        currency: selectedRate.currency,
        weightLbs: input.weightLbs,
        destPostal: input.destPostal,
        destCountry: input.destCountry ?? "US",
        isMock: selectedRate.isMock,
        // Pass Veeqo Rate Shopping API tokens for live label booking
        remoteShipmentId: selectedRate.remoteShipmentId,
        requestToken: selectedRate.requestToken,
      });
      onConfirm?.(selectedRate);
    } finally {
      setConfirming(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (ratesQuery.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm">Fetching rates from {input.destCountry === "CA" ? "Canadian" : "US"} carriers…</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (ratesQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-destructive">
        <AlertTriangle className="w-6 h-6" />
        <p className="text-sm">Failed to load rates. {ratesQuery.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => ratesQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // ── No carriers configured ─────────────────────────────────────────────────
  if (!data || data.activeCarrierCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
        <Truck className="w-8 h-8 opacity-40" />
        <p className="text-sm font-medium">No carrier accounts configured for this location.</p>
        <p className="text-xs">Go to Configuration → Shipping Integration → Rate Wizard to add carriers.</p>
      </div>
    );
  }

  // ── Veeqo routing notice ───────────────────────────────────────────────────
  if (data.integration === "veeqo") {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
          <Info className="w-4 h-4 shrink-0" />
          <span>This customer is routed to <strong>Veeqo</strong>. Use Veeqo to rate shop and book this shipment.</span>
        </div>
        {onSkip && <Button variant="outline" size="sm" onClick={onSkip}>Continue without Rate Wizard</Button>}
      </div>
    );
  }

  // ── No rates returned ──────────────────────────────────────────────────────
  if (rates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
        <Package className="w-7 h-7 opacity-40" />
        <p className="text-sm">No rates available for these shipment details.</p>
        <Button variant="outline" size="sm" onClick={() => ratesQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">

        {/* Stale rates warning — shown when dimensions changed after fetch */}
        {dimensionsChanged && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs text-amber-800 dark:text-amber-300 flex-1">
              <strong>Dimensions changed</strong> — rates shown are for the previous dimensions.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1.5 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 shrink-0"
              onClick={handleRefresh}
              disabled={ratesQuery.isFetching}
            >
              {ratesQuery.isFetching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh Rates
            </Button>
          </div>
        )}

        {/* Mock data banner */}
        {data.isMockData && (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Estimated rates</strong> — Add carrier API credentials in Shipping Integration to see your negotiated rates.
            </span>
          </div>
        )}

        {/* SLA requirement banner */}
        {maxTransitDays !== null && (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>SLA: max {maxTransitDays}-day transit</strong> — only services meeting this requirement are shown.
              {data.customerRule?.preferredCarrier && (
                <> Preferred carrier: <strong>{data.customerRule.preferredCarrier.toUpperCase()}</strong>.</>
              )}
            </span>
          </div>
        )}

        {/* Customer preferred carrier notice (no SLA set) */}
        {!maxTransitDays && data.customerRule?.preferredCarrier && (
          <div className="flex items-center gap-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs">
            <Star className="w-3.5 h-3.5 shrink-0" />
            <span>Preferred carrier for this customer: <strong>{data.customerRule.preferredCarrier.toUpperCase()}</strong></span>
          </div>
        )}

        {/* Filters row */}
        {!compact && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterCarrier} onValueChange={setFilterCarrier}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue placeholder="All carriers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All carriers</SelectItem>
                {carriers.map((c) => (
                  <SelectItem key={c} value={c}>{rates.find((r) => r.carrierCode === c)?.carrierName ?? c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMaxDays} onValueChange={setFilterMaxDays}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue placeholder="Any transit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any transit</SelectItem>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="2">≤ 2 days</SelectItem>
                <SelectItem value="3">≤ 3 days</SelectItem>
                <SelectItem value="5">≤ 5 days</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5 ml-auto">
              <Checkbox
                id="show-surcharges"
                checked={showSurcharges}
                onCheckedChange={(v) => setShowSurcharges(!!v)}
                className="w-3.5 h-3.5"
              />
              <Label htmlFor="show-surcharges" className="text-xs cursor-pointer">Show surcharges</Label>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 gap-1.5 text-xs ml-1"
              onClick={handleRefresh}
              disabled={ratesQuery.isFetching}
            >
              {ratesQuery.isFetching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {!compact && "Refresh"}
            </Button>
          </div>
        )}

        {/* Rate table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
                <th className="w-8 px-2 py-2"></th>
                <th className="px-3 py-2 text-left">
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("carrier")}>
                    Carrier / Service <SortIcon k="carrier" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button className="flex items-center gap-1 justify-end hover:text-foreground" onClick={() => toggleSort("transit")}>
                    Transit <SortIcon k="transit" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button className="flex items-center gap-1 justify-end hover:text-foreground" onClick={() => toggleSort("cost")}>
                    Cost <SortIcon k="cost" />
                  </button>
                </th>
                <th className="px-2 py-2 text-center w-16">Badges</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((rate) => {
                const isSelected = rate.rateId === selectedRateId;
                return (
                  <tr
                    key={rate.rateId}
                    onClick={() => setSelectedRateId(rate.rateId)}
                    className={`border-b last:border-0 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary/8 border-l-2 border-l-primary"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Radio indicator */}
                    <td className="px-2 py-2.5 text-center">
                      <div className={`w-4 h-4 rounded-full border-2 mx-auto flex items-center justify-center ${
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </td>

                    {/* Carrier + service */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${carrierBadge(rate.carrierCode)}`}>
                          {rate.carrierCode.toUpperCase().replace("_", " ")}
                        </span>
                        <span className="text-foreground">{rate.service}</span>
                      </div>
                      {showSurcharges && rate.surcharges.length > 0 && (
                        <div className="mt-0.5 flex gap-2">
                          {rate.surcharges.map((s) => (
                            <span key={s.label} className="text-xs text-muted-foreground">
                              +{s.label} ${s.amount.toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Transit */}
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-xs font-medium ${rate.transitDays === 1 ? "text-amber-600" : ""}`}>
                        {rate.transitDays}d
                      </span>
                    </td>

                    {/* Cost */}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {rate.currency} ${rate.totalCost.toFixed(2)}
                      {rate.isMock && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 inline ml-1 text-muted-foreground/60" />
                          </TooltipTrigger>
                          <TooltipContent>Estimated — add credentials for negotiated rates</TooltipContent>
                        </Tooltip>
                      )}
                    </td>

                    {/* Badges */}
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* SLA compliance badge */}
                        {maxTransitDays !== null && (
                          rate.transitDays <= maxTransitDays ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              </TooltipTrigger>
                              <TooltipContent>Meets {maxTransitDays}-day SLA</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger>
                                <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent>Exceeds {maxTransitDays}-day SLA requirement</TooltipContent>
                            </Tooltip>
                          )
                        )}
                        {rate.isCheapest && (
                          <Tooltip>
                            <TooltipTrigger>
                              <DollarSign className="w-3.5 h-3.5 text-green-600" />
                            </TooltipTrigger>
                            <TooltipContent>Cheapest option</TooltipContent>
                          </Tooltip>
                        )}
                        {rate.isFastest && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Zap className="w-3.5 h-3.5 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>Fastest option</TooltipContent>
                          </Tooltip>
                        )}
                        {rate.isPreferred && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Star className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
                            </TooltipTrigger>
                            <TooltipContent>Customer preferred carrier</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary + confirm row */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs text-muted-foreground">
            {displayed.length} rate{displayed.length !== 1 ? "s" : ""} from {carriers.length} carrier{carriers.length !== 1 ? "s" : ""}
            {data.isMockData && " · estimated"}
          </div>

          <div className="flex items-center gap-2">
            {onSkip && (
              <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs h-8">
                Skip
              </Button>
            )}
            <Button
              size="sm"
              disabled={!selectedRate || confirming}
              onClick={handleConfirm}
              className="h-8 gap-1.5"
            >
              {confirming ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirming…</>
              ) : selectedRate ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Use {selectedRate.carrierName} — ${selectedRate.totalCost.toFixed(2)}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              ) : (
                "Select a rate"
              )}
            </Button>
          </div>
        </div>

        {/* Dim weight notice */}
        {!compact && (() => {
          const dw = (input.lengthIn * input.widthIn * input.heightIn) / 139;
          return dw > input.weightLbs ? (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
              <Clock className="w-3 h-3 inline mr-1" />
              Dim weight ({dw.toFixed(1)} lb) exceeds actual weight ({input.weightLbs} lb) — rates calculated on dim weight.
            </p>
          ) : null;
        })()}
      </div>
    </TooltipProvider>
  );
}
