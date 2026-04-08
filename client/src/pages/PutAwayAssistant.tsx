import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, CheckCircle2, Warehouse, Package,
  AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronRight,
  PackageCheck, ArrowLeft, CalendarDays, Flame, ListOrdered,
  Settings, XCircle, CheckCheck, RotateCcw, ThumbsUp, ThumbsDown,
  ChevronUp, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────

type BatchSuggestion = {
  locationName: string;
  locationType: "pick_face" | "warehouse";
  reason: "consolidate" | "empty_pick_face" | "empty_warehouse";
  currentQty: number;
  expirationDate?: string;
  lotNumber?: string;
  priority: number;
  isPriorityAisle: boolean;
  aislePriorityOrder: number | null;
  matchedLevel?: string | null;
};

type SkuRow = {
  sku: string;
  description?: string;
  receivedQty: number;
  lotNumber?: string;
  expirationDate?: string;
  topSuggestion: BatchSuggestion | null;
  allSuggestions: BatchSuggestion[];
};

type RowState = "pending" | "accepted" | "rejected";

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
      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs gap-1">
        <Star className="h-2.5 w-2.5" /> Pick Face
      </Badge>
    );
  }
  return (
    <Badge className="bg-muted text-muted-foreground border-border text-xs gap-1">
      <Warehouse className="h-2.5 w-2.5" /> Warehouse
    </Badge>
  );
}

// Star icon for pick face badge
function Star({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function reasonBadge(reason: BatchSuggestion["reason"]) {
  if (reason === "consolidate") {
    return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">Consolidate</Badge>;
  }
  if (reason === "empty_pick_face") {
    return <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">Empty Pick Face</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground border-border text-xs">Empty</Badge>;
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

// ─── SKU Row in the recommendation list ───────────────────────────────────

function SkuRecommendationRow({
  row,
  rowState,
  selectedLocation,
  onAccept,
  onReject,
  onReset,
  onLocationChange,
  isCommitting,
}: {
  row: SkuRow;
  rowState: RowState;
  selectedLocation: string;
  onAccept: () => void;
  onReject: () => void;
  onReset: () => void;
  onLocationChange: (loc: string) => void;
  isCommitting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const top = row.allSuggestions.find((s) => s.locationName === selectedLocation) ?? row.topSuggestion;

  const stateColors: Record<RowState, string> = {
    pending: "border-border bg-card",
    accepted: "border-green-500/40 bg-green-500/5",
    rejected: "border-red-500/30 bg-red-500/5 opacity-60",
  };

  return (
    <div className={`rounded-xl border transition-all ${stateColors[rowState]}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status icon */}
        <div className="shrink-0">
          {rowState === "accepted" && <CheckCircle2 className="h-5 w-5 text-green-400" />}
          {rowState === "rejected" && <XCircle className="h-5 w-5 text-red-400" />}
          {rowState === "pending" && <Package className="h-5 w-5 text-muted-foreground" />}
        </div>

        {/* SKU info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm text-foreground">{row.sku}</span>
            {row.description && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">{row.description}</span>
            )}
            <Badge variant="secondary" className="text-xs">qty {row.receivedQty}</Badge>
            {row.lotNumber && <Badge variant="outline" className="text-xs">Lot: {row.lotNumber}</Badge>}
            {row.expirationDate && (
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                Exp: {new Date(row.expirationDate).toLocaleDateString()}
              </Badge>
            )}
          </div>
          {/* Suggested location */}
          {top ? (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-mono text-sm font-medium text-primary">{top.locationName}</span>
              {locationTypeBadge(top.locationType)}
              {reasonBadge(top.reason)}
              {top.isPriorityAisle && (() => {
                const parts = top.locationName.split("-");
                const aisle = parts[0] ?? "";
                const level = top.matchedLevel && top.matchedLevel !== "*" ? top.matchedLevel : null;
                const label = level ? `${aisle}/${level}` : `Aisle ${aisle}`;
                return (
                  <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-xs gap-1">
                    <Flame className="h-3 w-3" />
                    {top.aislePriorityOrder !== null ? `#${top.aislePriorityOrder} · ` : ""}{label}
                  </Badge>
                );
              })()}
              {top.currentQty > 0 && (
                <span className="text-xs text-muted-foreground">{top.currentQty.toLocaleString()} on hand</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">No location available</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {rowState === "pending" && top && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                onClick={onReject}
                disabled={isCommitting}
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs bg-green-600 hover:bg-green-500 text-white"
                onClick={onAccept}
                disabled={isCommitting}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Accept
              </Button>
            </>
          )}
          {rowState === "accepted" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={onReset}
              disabled={isCommitting}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Undo
            </Button>
          )}
          {rowState === "rejected" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={onReset}
              disabled={isCommitting}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Undo
            </Button>
          )}
          {/* Expand/collapse alternate locations */}
          {row.allSuggestions.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Alternate locations */}
      {expanded && row.allSuggestions.length > 1 && (
        <div className="border-t border-border px-4 pb-3 pt-2">
          <p className="text-xs text-muted-foreground mb-2">Choose a different location:</p>
          <div className="flex items-center gap-2">
            <Select value={selectedLocation} onValueChange={onLocationChange}>
              <SelectTrigger className="h-8 text-xs font-mono w-56">
                <SelectValue placeholder="Select location…" />
              </SelectTrigger>
              <SelectContent>
                {row.allSuggestions.map((s, i) => (
                  <SelectItem key={s.locationName} value={s.locationName}>
                    <span className="font-mono">{s.locationName}</span>
                    {i === 0 && <span className="ml-2 text-[10px] text-primary">top pick</span>}
                    {s.isPriorityAisle && <span className="ml-2 text-[10px] text-orange-400">priority</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rowState === "pending" && top && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs bg-green-600 hover:bg-green-500 text-white"
                onClick={onAccept}
                disabled={isCommitting}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Accept
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recommendation Session ────────────────────────────────────────────────

function RecommendationSession({
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
  const utils = trpc.useUtils();

  // Fetch the full batch recommendation list
  const batchQuery = trpc.putAway.batchSuggest.useQuery(
    { configId, facilityId, customerId, transactionId },
    { retry: false, staleTime: 60_000 }
  );

  const priorityQuery = trpc.putAway.getPriority.useQuery(
    { configId, facilityId, customerId },
    { staleTime: 60_000 }
  );
  const priorityRows = priorityQuery.data ?? [];

  const rows: SkuRow[] = batchQuery.data?.rows ?? [];

  // Per-row state: pending | accepted | rejected
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  // Per-row selected location (defaults to top suggestion)
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({});

  // Initialise selectedLocations when data loads
  useEffect(() => {
    if (rows.length === 0) return;
    setSelectedLocations((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!next[row.sku] && row.topSuggestion) {
          next[row.sku] = row.topSuggestion.locationName;
        }
      }
      return next;
    });
  }, [rows]);

  const logScanMutation = trpc.putAway.logScan.useMutation();
  const [committing, setCommitting] = useState(false);

  const getRowState = (sku: string): RowState => rowStates[sku] ?? "pending";

  const acceptRow = useCallback((sku: string) => {
    setRowStates((prev) => ({ ...prev, [sku]: "accepted" }));
  }, []);

  const rejectRow = useCallback((sku: string) => {
    setRowStates((prev) => ({ ...prev, [sku]: "rejected" }));
  }, []);

  const resetRow = useCallback((sku: string) => {
    setRowStates((prev) => ({ ...prev, [sku]: "pending" }));
  }, []);

  const acceptAll = useCallback(() => {
    const next: Record<string, RowState> = {};
    for (const row of rows) {
      if (row.topSuggestion) next[row.sku] = "accepted";
    }
    setRowStates((prev) => ({ ...prev, ...next }));
  }, [rows]);

  const acceptAllExceptRejected = useCallback(() => {
    const next: Record<string, RowState> = {};
    for (const row of rows) {
      if (row.topSuggestion && getRowState(row.sku) !== "rejected") {
        next[row.sku] = "accepted";
      }
    }
    setRowStates((prev) => ({ ...prev, ...next }));
  }, [rows, rowStates]);

  const resetAll = useCallback(() => {
    setRowStates({});
  }, []);

  // Commit all accepted rows to the session log
  const commitAccepted = useCallback(async () => {
    const toCommit = rows.filter((row) => getRowState(row.sku) === "accepted");
    if (toCommit.length === 0) {
      toast.info("No accepted rows to commit.");
      return;
    }
    setCommitting(true);
    let success = 0;
    let failed = 0;
    for (const row of toCommit) {
      const locName = selectedLocations[row.sku] ?? row.topSuggestion?.locationName;
      const suggestion = row.allSuggestions.find((s) => s.locationName === locName) ?? row.topSuggestion;
      if (!suggestion) { failed++; continue; }
      try {
        await logScanMutation.mutateAsync({
          configId,
          facilityId,
          customerId,
          customerName: customerName || undefined,
          sku: row.sku,
          description: row.description,
          confirmedLocation: suggestion.locationName,
          confirmedLocationType: suggestion.locationType,
          suggestedLocation: row.topSuggestion?.locationName,
          suggestedLocationType: row.topSuggestion?.locationType,
          qty: row.receivedQty,
          sessionId,
          lotNumber: row.lotNumber,
          expirationDate: row.expirationDate,
        });
        success++;
      } catch {
        failed++;
      }
    }
    setCommitting(false);
    if (success > 0) toast.success(`Committed ${success} put-away${success !== 1 ? "s" : ""} to session log.`);
    if (failed > 0) toast.error(`${failed} item${failed !== 1 ? "s" : ""} failed to log.`);
    utils.putAway.sessionScans.invalidate({ sessionId });
  }, [rows, rowStates, selectedLocations, configId, facilityId, customerId, customerName, sessionId, logScanMutation, utils]);

  const pendingCount = rows.filter((r) => getRowState(r.sku) === "pending" && r.topSuggestion).length;
  const acceptedCount = rows.filter((r) => getRowState(r.sku) === "accepted").length;
  const rejectedCount = rows.filter((r) => getRowState(r.sku) === "rejected").length;
  const noSuggestionCount = rows.filter((r) => !r.topSuggestion).length;

  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* Session header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-sm mt-0.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">
              {referenceNum ?? `Transaction #${transactionId}`}
            </span>
            <span className="text-xs text-muted-foreground">{customerName}</span>
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">Completed</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review recommended put-away locations for all SKUs in this receipt.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs mt-0.5"
          onClick={() => batchQuery.refetch()}
          disabled={batchQuery.isFetching}
        >
          {batchQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {batchQuery.isLoading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-20 text-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">Generating recommendations…</p>
          <p className="text-xs text-muted-foreground">Fetching inventory and location data from Extensiv</p>
        </div>
      )}

      {/* Error */}
      {batchQuery.isError && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Failed to load recommendations</p>
            <p className="text-xs text-muted-foreground mt-0.5">Check Extensiv config credentials and try refreshing.</p>
          </div>
          <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => batchQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Bulk action toolbar */}
      {rows.length > 0 && !batchQuery.isLoading && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-3">
          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mr-auto flex-wrap">
            <span className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              {rows.length} SKU{rows.length !== 1 ? "s" : ""}
            </span>
            {acceptedCount > 0 && (
              <span className="flex items-center gap-1.5 text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> {acceptedCount} accepted
              </span>
            )}
            {rejectedCount > 0 && (
              <span className="flex items-center gap-1.5 text-red-400">
                <XCircle className="h-3.5 w-3.5" /> {rejectedCount} rejected
              </span>
            )}
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5">
                <ListOrdered className="h-3.5 w-3.5" /> {pendingCount} pending
              </span>
            )}
            {noSuggestionCount > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" /> {noSuggestionCount} no suggestion
              </span>
            )}
          </div>

          {/* Bulk actions */}
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={acceptAll} disabled={committing}>
                <CheckCheck className="h-3.5 w-3.5" /> Accept All
              </Button>
            )}
            {rejectedCount > 0 && pendingCount > 0 && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={acceptAllExceptRejected} disabled={committing}>
                <CheckCheck className="h-3.5 w-3.5" /> Accept All Except Rejected
              </Button>
            )}
            {(acceptedCount > 0 || rejectedCount > 0) && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={resetAll} disabled={committing}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset All
              </Button>
            )}
            {acceptedCount > 0 && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90"
                onClick={commitAccepted}
                disabled={committing}
              >
                {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Commit {acceptedCount} Put-Away{acceptedCount !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Priority config banner */}
      {!priorityQuery.isLoading && priorityRows.length === 0 && rows.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-300">No priority config for this customer</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suggestions use default FEFO ranking. Set up aisle/level priorities to guide recommendations.
            </p>
          </div>
          <a
            href="/config/put-away-priority"
            className="shrink-0 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors border border-amber-500/30 rounded-lg px-2.5 py-1.5 hover:bg-amber-500/10"
          >
            <Settings className="h-3.5 w-3.5" />
            Set up priorities
          </a>
        </div>
      )}

      {/* Priority legend */}
      {priorityRows.length > 0 && rows.length > 0 && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-orange-500/10 transition-colors"
            onClick={() => setLegendOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-semibold text-orange-300">Location Priority Map</span>
              <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-xs">
                {priorityRows.length} rule{priorityRows.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            {legendOpen ? <ChevronDown className="h-4 w-4 text-orange-400" /> : <ChevronRight className="h-4 w-4 text-orange-400" />}
          </button>
          {legendOpen && (
            <div className="border-t border-orange-500/20 px-4 pb-4 pt-3 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Suggestions matching these rules are ranked first. Lower number = higher priority.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {priorityRows
                  .slice()
                  .sort((a: { priorityOrder: number }, b: { priorityOrder: number }) => a.priorityOrder - b.priorityOrder)
                  .map((row: { id: number; aisle: string; level: string; priorityOrder: number }) => {
                    const isWildcard = !row.level || row.level === "*";
                    const locationLabel = isWildcard ? `Aisle ${row.aisle} (all levels)` : `${row.aisle}/${row.level}`;
                    return (
                      <div key={row.id} className="flex items-center gap-3 rounded-lg border border-orange-500/15 bg-orange-500/8 px-3 py-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-300 text-xs font-bold flex items-center justify-center">
                          {row.priorityOrder}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-sm font-semibold text-foreground">{locationLabel}</span>
                          {isWildcard && (
                            <span className="ml-1.5 text-[10px] text-orange-400/70 border border-orange-500/20 rounded px-1">wildcard</span>
                          )}
                        </div>
                        <ListOrdered className="h-3.5 w-3.5 text-orange-400/60 shrink-0" />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendation list */}
      {rows.length > 0 && !batchQuery.isLoading && (
        <div className="space-y-2">
          {rows.map((row) => (
            <SkuRecommendationRow
              key={row.sku}
              row={row}
              rowState={getRowState(row.sku)}
              selectedLocation={selectedLocations[row.sku] ?? row.topSuggestion?.locationName ?? ""}
              onAccept={() => acceptRow(row.sku)}
              onReject={() => rejectRow(row.sku)}
              onReset={() => resetRow(row.sku)}
              onLocationChange={(loc) => setSelectedLocations((prev) => ({ ...prev, [row.sku]: loc }))}
              isCommitting={committing}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !batchQuery.isLoading && !batchQuery.isError && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No items in this receipt</p>
          <p className="text-xs text-muted-foreground mt-1">
            The receipt has no receive items recorded in Extensiv.
          </p>
        </div>
      )}
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

  // ── Recommendation session view ──
  if (activeSession) {
    return (
      <div className="p-5 space-y-5 page-enter">
        <div>
          <p className="page-breadcrumb">Receiving</p>
          <h1 className="page-title">Put Away Assistant</h1>
        </div>
        <RecommendationSession
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
            Select a completed receipt to review recommended put-away locations.
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
