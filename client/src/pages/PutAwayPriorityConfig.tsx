import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Save,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

type PriorityEntry = {
  aisle: string;
  level: string;
  priorityOrder: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse the aisle from a location name.
 * Location names from Extensiv look like "D-017-C" or "A-001" or "STAGING-01".
 * The first dash-delimited segment is the aisle.
 */
function parseAisle(locationName: string): string {
  const parts = locationName.split("-");
  return parts[0].trim().toUpperCase();
}

/**
 * Parse the level from a location name.
 * For "D-017-C", the third segment "C" is the level.
 * If no level segment, return "*".
 */
function parseLevel(locationName: string): string {
  const parts = locationName.split("-");
  if (parts.length >= 3) return parts[2].trim().toUpperCase();
  return "*";
}

// ─── Aisle Chip ────────────────────────────────────────────────────────────

function AisleChip({
  aisle,
  isSelected,
  priorityOrder,
  onToggle,
}: {
  aisle: string;
  isSelected: boolean;
  priorityOrder?: number;
  onToggle: (aisle: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(aisle)}
      className={`
        relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
        border transition-all duration-150 select-none
        ${isSelected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-muted/30"
        }
      `}
    >
      {isSelected && priorityOrder !== undefined && (
        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary-foreground/20 text-xs font-bold leading-none">
          {priorityOrder}
        </span>
      )}
      <MapPin className="h-3.5 w-3.5 shrink-0" />
      {aisle}
    </button>
  );
}

// ─── Priority List ─────────────────────────────────────────────────────────

function PriorityList({
  entries,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  entries: PriorityEntry[];
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-border bg-muted/10">
        <MapPin className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No aisles selected yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Click aisles above to add them to the priority list
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry, idx) => (
        <div
          key={entry.aisle}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/10 transition-colors group"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm text-foreground">Aisle {entry.aisle}</span>
            {entry.level !== "*" && (
              <span className="ml-2 text-xs text-muted-foreground">Level {entry.level}</span>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={idx === 0}
              onClick={() => onMoveUp(idx)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={idx === entries.length - 1}
              onClick={() => onMoveDown(idx)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onRemove(idx)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function PutAwayPriorityConfig() {
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [priorityEntries, setPriorityEntries] = useState<PriorityEntry[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const utils = trpc.useUtils();

  // ── Data queries ──

  const configQuery = trpc.config.list.useQuery();
  const configs = configQuery.data ?? [];

  const facilitiesQuery = trpc.extensiv.facilities.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );
  const facilities = facilitiesQuery.data ?? [];

  const customersQuery = trpc.extensiv.customersForFacility.useQuery(
    { configId: selectedConfigId!, facilityId: selectedFacilityId! },
    { enabled: !!selectedConfigId && !!selectedFacilityId }
  );
  const customers = customersQuery.data ?? [];

  const locationsQuery = trpc.extensiv.locations.useQuery(
    { configId: selectedConfigId!, facilityId: selectedFacilityId! },
    { enabled: !!selectedConfigId && !!selectedFacilityId }
  );
  const locations = locationsQuery.data ?? [];

  const priorityQuery = trpc.putAway.getPriority.useQuery(
    {
      configId: selectedConfigId!,
      facilityId: selectedFacilityId!,
      customerId: selectedCustomerId!,
    },
    { enabled: !!selectedConfigId && !!selectedFacilityId && !!selectedCustomerId }
  );

  // ── Auto-select first config ──
  useEffect(() => {
    if (configs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(configs[0].id);
    }
  }, [configs, selectedConfigId]);

  // ── Load saved priorities when selection changes ──
  useEffect(() => {
    if (priorityQuery.data) {
      const loaded: PriorityEntry[] = priorityQuery.data.map((p) => ({
        aisle: p.aisle,
        level: p.level,
        priorityOrder: p.priorityOrder,
      }));
      setPriorityEntries(loaded);
      setIsDirty(false);
    } else if (!priorityQuery.isLoading && selectedCustomerId) {
      setPriorityEntries([]);
      setIsDirty(false);
    }
  }, [priorityQuery.data, priorityQuery.isLoading, selectedCustomerId]);

  // ── Derive unique aisles from locations ──
  const uniqueAisles = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locations) {
      const aisle = parseAisle(loc.name);
      if (aisle && aisle.length > 0) set.add(aisle);
    }
    return Array.from(set).sort();
  }, [locations]);

  const selectedAisles = useMemo(
    () => new Set(priorityEntries.map((e) => e.aisle)),
    [priorityEntries]
  );

  // ── Mutations ──

  const saveMutation = trpc.putAway.savePriority.useMutation({
    onSuccess: () => {
      toast.success("Priority configuration saved");
      setIsDirty(false);
      utils.putAway.getPriority.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  const clearMutation = trpc.putAway.clearPriority.useMutation({
    onSuccess: () => {
      toast.success("Priority configuration cleared");
      setPriorityEntries([]);
      setIsDirty(false);
      utils.putAway.getPriority.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to clear: ${err.message}`);
    },
  });

  // ── Handlers ──

  function handleToggleAisle(aisle: string) {
    if (!selectedCustomerId) return;
    setIsDirty(true);
    if (selectedAisles.has(aisle)) {
      // Remove
      setPriorityEntries((prev) => {
        const filtered = prev.filter((e) => e.aisle !== aisle);
        return filtered.map((e, i) => ({ ...e, priorityOrder: i + 1 }));
      });
    } else {
      // Add to end
      setPriorityEntries((prev) => [
        ...prev,
        { aisle, level: "*", priorityOrder: prev.length + 1 },
      ]);
    }
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setIsDirty(true);
    setPriorityEntries((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((e, i) => ({ ...e, priorityOrder: i + 1 }));
    });
  }

  function handleMoveDown(index: number) {
    setPriorityEntries((prev) => {
      if (index >= prev.length - 1) return prev;
      setIsDirty(true);
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((e, i) => ({ ...e, priorityOrder: i + 1 }));
    });
  }

  function handleRemove(index: number) {
    setIsDirty(true);
    setPriorityEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((e, i) => ({ ...e, priorityOrder: i + 1 }));
    });
  }

  function handleSave() {
    if (!selectedConfigId || !selectedFacilityId || !selectedCustomerId) return;
    saveMutation.mutate({
      configId: selectedConfigId,
      facilityId: selectedFacilityId,
      customerId: selectedCustomerId,
      entries: priorityEntries,
    });
  }

  function handleClear() {
    if (!selectedConfigId || !selectedFacilityId || !selectedCustomerId) return;
    clearMutation.mutate({
      configId: selectedConfigId,
      facilityId: selectedFacilityId,
      customerId: selectedCustomerId,
    });
  }

  function handleFacilityChange(value: string) {
    setSelectedFacilityId(Number(value));
    setSelectedCustomerId(null);
    setPriorityEntries([]);
    setIsDirty(false);
  }

  function handleCustomerChange(value: string) {
    setSelectedCustomerId(Number(value));
    setPriorityEntries([]);
    setIsDirty(false);
  }

  const canInteract = !!selectedConfigId && !!selectedFacilityId && !!selectedCustomerId;
  const canSave = canInteract && isDirty && !saveMutation.isPending;
  const isLoadingLocations = locationsQuery.isLoading || priorityQuery.isLoading;

  return (
    <div className="p-5 space-y-5 page-enter max-w-4xl">
      {/* Header */}
      <div>
        <p className="page-breadcrumb">Receiving / Put Away Wizard</p>
        <h1 className="page-title">Location Priority Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set which aisles should be prioritised for put-away per warehouse and customer.
          The Put Away Wizard will suggest these aisles first when directing associates.
        </p>
      </div>

      {/* Selectors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Select Warehouse &amp; Customer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Config */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Extensiv Config</Label>
              <Select
                value={selectedConfigId?.toString() ?? ""}
                onValueChange={(v) => {
                  setSelectedConfigId(Number(v));
                  setSelectedFacilityId(null);
                  setSelectedCustomerId(null);
                  setPriorityEntries([]);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select config…" />
                </SelectTrigger>
                <SelectContent>
                  {configs.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name ?? `Config #${c.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Facility */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Warehouse</Label>
              <Select
                value={selectedFacilityId?.toString() ?? ""}
                onValueChange={handleFacilityChange}
                disabled={!selectedConfigId || facilitiesQuery.isLoading}
              >
                <SelectTrigger className="h-9">
                  {facilitiesQuery.isLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </span>
                  ) : (
                    <SelectValue placeholder="Select warehouse…" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id.toString()}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Customer</Label>
              <Select
                value={selectedCustomerId?.toString() ?? ""}
                onValueChange={handleCustomerChange}
                disabled={!selectedFacilityId || customersQuery.isLoading}
              >
                <SelectTrigger className="h-9">
                  {customersQuery.isLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </span>
                  ) : (
                    <SelectValue placeholder="Select customer…" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No config state */}
      {!selectedConfigId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No Extensiv config found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add an Extensiv configuration in Settings to get started.
          </p>
        </div>
      )}

      {/* Aisle selection + priority list */}
      {canInteract && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Available aisles */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Available Aisles
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => locationsQuery.refetch()}
                  disabled={locationsQuery.isFetching}
                >
                  {locationsQuery.isFetching ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Refresh
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Click an aisle to add it to the priority list. Click again to remove it.
              </p>
            </CardHeader>
            <CardContent>
              {isLoadingLocations ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading locations…</span>
                </div>
              ) : uniqueAisles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <MapPin className="h-7 w-7 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No locations found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    No locations are configured for this warehouse in Extensiv.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {uniqueAisles.map((aisle) => {
                    const idx = priorityEntries.findIndex((e) => e.aisle === aisle);
                    return (
                      <AisleChip
                        key={aisle}
                        aisle={aisle}
                        isSelected={selectedAisles.has(aisle)}
                        priorityOrder={idx >= 0 ? idx + 1 : undefined}
                        onToggle={handleToggleAisle}
                      />
                    );
                  })}
                </div>
              )}

              {uniqueAisles.length > 0 && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Aisles are derived from location names (e.g. <code className="font-mono">D-017-C</code> → aisle <code className="font-mono">D</code>).
                    {" "}Selected aisles show their priority number.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Priority order */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Priority Order
                </CardTitle>
                {priorityEntries.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {priorityEntries.length} aisle{priorityEntries.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use the arrows to reorder. Priority 1 is suggested first.
              </p>
            </CardHeader>
            <CardContent>
              <PriorityList
                entries={priorityEntries}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onRemove={handleRemove}
              />

              {/* Save / Clear actions */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                <Button
                  className="flex-1 gap-2"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Priorities
                </Button>
                {priorityEntries.length > 0 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={handleClear}
                    disabled={clearMutation.isPending}
                    title="Clear all priorities"
                  >
                    {clearMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>

              {/* Saved state indicator */}
              {!isDirty && priorityEntries.length > 0 && !saveMutation.isPending && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-green-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </div>
              )}
              {isDirty && (
                <p className="text-xs text-amber-500 mt-2">Unsaved changes</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* How it works info */}
      {canInteract && (
        <Card className="bg-muted/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">How priorities work</p>
                <p className="text-xs text-muted-foreground">
                  When the Put Away Wizard suggests a location for a scanned SKU, it will first look for
                  empty slots in your prioritised aisles (in order), before falling back to consolidation
                  candidates and then any available warehouse slot. This helps direct associates to
                  preferred storage zones for each customer.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
