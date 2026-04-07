import { useState, useEffect, useMemo } from "react";
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
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Info,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

// ─── Shared types (mirror WhLocationConfig) ────────────────────────────────

type AisleRule = {
  prefix: string;
  description: string;
  levels: string[];
};

type WhConfig = {
  facilityId: number;
  facilityName: string;
  locationFormat: string;
  aisleRules: AisleRule[];
  notes: string;
};

type PriorityEntry = {
  aisle: string;
  level: string;          // "*" means "all levels"
  priorityOrder: number;
};

// ─── localStorage helpers ──────────────────────────────────────────────────

const WH_CONFIG_KEY = "wh_location_configs";

function loadWhConfig(facilityId: number): WhConfig | null {
  try {
    const stored = JSON.parse(localStorage.getItem(WH_CONFIG_KEY) ?? "{}");
    return stored[facilityId] ?? null;
  } catch {
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseAisle(locationName: string): string {
  return locationName.split("-")[0].trim().toUpperCase();
}

// ─── AisleChip ─────────────────────────────────────────────────────────────

function AisleChip({
  aisle,
  level,
  isSelected,
  priorityOrder,
  onToggle,
}: {
  aisle: string;
  level: string;
  isSelected: boolean;
  priorityOrder?: number;
  onToggle: (aisle: string, level: string) => void;
}) {
  const label = level === "*" ? aisle : `${aisle} / ${level}`;
  return (
    <button
      type="button"
      onClick={() => onToggle(aisle, level)}
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
      {label}
    </button>
  );
}

// ─── PriorityList ──────────────────────────────────────────────────────────

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
      {entries.map((entry, idx) => {
        const label = entry.level === "*" ? entry.aisle : `${entry.aisle} / ${entry.level}`;
        return (
          <div
            key={`${entry.aisle}-${entry.level}`}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
              {entry.priorityOrder}
            </span>
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1 font-mono">{label}</span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => onMoveUp(idx)}
                disabled={idx === 0}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => onMoveDown(idx)}
                disabled={idx === entries.length - 1}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => onRemove(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function PutAwayPriorityConfig() {
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [priorityEntries, setPriorityEntries] = useState<PriorityEntry[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [whConfig, setWhConfig] = useState<WhConfig | null>(null);

  const utils = trpc.useUtils();

  // ── Data queries ──

  const configQuery = trpc.config.list.useQuery();
  const selectedConfigId = (configQuery.data ?? [])[0]?.id ?? null;

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

  // Only fetch Extensiv locations if there is NO WH Location Config for this facility
  const needExtensivLocations = !!selectedFacilityId && !whConfig;
  const locationsQuery = trpc.extensiv.locations.useQuery(
    { configId: selectedConfigId!, facilityId: selectedFacilityId! },
    { enabled: !!selectedConfigId && needExtensivLocations }
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

  // ── Load WH config from localStorage when facility changes ──
  useEffect(() => {
    if (selectedFacilityId) {
      setWhConfig(loadWhConfig(selectedFacilityId));
    } else {
      setWhConfig(null);
    }
  }, [selectedFacilityId]);

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

  // ── Build the list of aisle+level chips to display ──
  // If WH Location Config exists: use configured aisles and their levels
  // Otherwise: fall back to deriving unique aisles from Extensiv locations (level = "*")
  const availableChips = useMemo<{ aisle: string; level: string; description?: string }[]>(() => {
    if (whConfig && whConfig.aisleRules.length > 0) {
      const chips: { aisle: string; level: string; description?: string }[] = [];
      for (const rule of whConfig.aisleRules) {
        if (!rule.prefix) continue;
        if (rule.levels.length === 0) {
          // No levels defined — show just the aisle
          chips.push({ aisle: rule.prefix, level: "*", description: rule.description });
        } else {
          // Show one chip per level
          for (const lvl of rule.levels) {
            chips.push({ aisle: rule.prefix, level: lvl, description: rule.description });
          }
        }
      }
      return chips;
    }
    // Fallback: derive from Extensiv locations
    const seen = new Set<string>();
    const chips: { aisle: string; level: string }[] = [];
    for (const loc of locations) {
      const aisle = parseAisle(loc.name);
      if (aisle && !seen.has(aisle)) {
        seen.add(aisle);
        chips.push({ aisle, level: "*" });
      }
    }
    return chips.sort((a, b) => a.aisle.localeCompare(b.aisle));
  }, [whConfig, locations]);

  const selectedKeys = useMemo(
    () => new Set(priorityEntries.map((e) => `${e.aisle}::${e.level}`)),
    [priorityEntries]
  );

  // ── Mutations ──

  const saveMutation = trpc.putAway.savePriority.useMutation({
    onSuccess: () => {
      toast.success("Priority configuration saved");
      setIsDirty(false);
      utils.putAway.getPriority.invalidate();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const clearMutation = trpc.putAway.clearPriority.useMutation({
    onSuccess: () => {
      toast.success("Priority configuration cleared");
      setPriorityEntries([]);
      setIsDirty(false);
      utils.putAway.getPriority.invalidate();
    },
    onError: (err) => toast.error(`Failed to clear: ${err.message}`),
  });

  // ── Handlers ──

  function handleToggleChip(aisle: string, level: string) {
    if (!selectedCustomerId) return;
    setIsDirty(true);
    const key = `${aisle}::${level}`;
    if (selectedKeys.has(key)) {
      setPriorityEntries((prev) => {
        const filtered = prev.filter((e) => !(e.aisle === aisle && e.level === level));
        return filtered.map((e, i) => ({ ...e, priorityOrder: i + 1 }));
      });
    } else {
      setPriorityEntries((prev) => [
        ...prev,
        { aisle, level, priorityOrder: prev.length + 1 },
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
  const isLoadingData = (needExtensivLocations && locationsQuery.isLoading) || priorityQuery.isLoading;

  return (
    <div className="p-5 space-y-5 page-enter max-w-4xl">
      {/* Header */}
      <div>
        <p className="page-breadcrumb">Receiving / Put Away Wizard</p>
        <h1 className="page-title">Location Priority Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set which aisles (and levels) should be prioritised for put-away per warehouse and customer.
          The Put Away Wizard will suggest these first when directing associates.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      {!selectedConfigId && !configQuery.isLoading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No Extensiv config found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add an Extensiv configuration in Settings to get started.
          </p>
        </div>
      )}

      {/* WH Location Config status banner */}
      {selectedFacilityId && (
        whConfig && whConfig.aisleRules.length > 0 ? (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-green-300 font-medium">
                Using WH Location Config for {whConfig.facilityName}
              </p>
              <p className="text-xs text-green-400/70 mt-0.5">
                {whConfig.aisleRules.length} aisle{whConfig.aisleRules.length !== 1 ? "s" : ""} configured
                ({availableChips.length} aisle/level combination{availableChips.length !== 1 ? "s" : ""}).
                Only these aisles and levels are shown below.
              </p>
            </div>
            <Link href="/config/wh-location">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-green-400 hover:text-green-300 shrink-0">
                <ExternalLink className="h-3.5 w-3.5" /> Edit Config
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
            <Info className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-300 font-medium">No WH Location Config for this warehouse</p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Aisles are being derived from all Extensiv locations. For a cleaner list, configure this warehouse's
                aisle structure in WH Location Config.
              </p>
            </div>
            <Link href="/config/wh-location">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-amber-400 hover:text-amber-300 shrink-0">
                <ExternalLink className="h-3.5 w-3.5" /> Configure
              </Button>
            </Link>
          </div>
        )
      )}

      {/* Aisle/level selection + priority list */}
      {canInteract && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Available aisles */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {whConfig && whConfig.aisleRules.length > 0 ? "Configured Aisles & Levels" : "Available Aisles"}
                </CardTitle>
                {!whConfig && (
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
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Click an aisle{whConfig && whConfig.aisleRules.length > 0 ? "/level" : ""} to add it to the priority list. Click again to remove it.
              </p>
            </CardHeader>
            <CardContent>
              {isLoadingData ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : availableChips.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <MapPin className="h-7 w-7 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No aisles found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {whConfig
                      ? "Add aisles to this warehouse in WH Location Config."
                      : "No locations are configured for this warehouse in Extensiv."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Group chips by aisle when using WH config with levels */}
                  {whConfig && whConfig.aisleRules.length > 0 ? (
                    <div className="space-y-3">
                      {whConfig.aisleRules.filter(r => r.prefix).map((rule) => {
                        const chips = availableChips.filter(c => c.aisle === rule.prefix);
                        if (chips.length === 0) return null;
                        return (
                          <div key={rule.prefix}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                              Aisle {rule.prefix}{rule.description ? ` — ${rule.description}` : ""}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {chips.map((chip) => {
                                const key = `${chip.aisle}::${chip.level}`;
                                const idx = priorityEntries.findIndex(e => `${e.aisle}::${e.level}` === key);
                                return (
                                  <AisleChip
                                    key={key}
                                    aisle={chip.aisle}
                                    level={chip.level}
                                    isSelected={selectedKeys.has(key)}
                                    priorityOrder={idx >= 0 ? idx + 1 : undefined}
                                    onToggle={handleToggleChip}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableChips.map((chip) => {
                        const key = `${chip.aisle}::${chip.level}`;
                        const idx = priorityEntries.findIndex(e => `${e.aisle}::${e.level}` === key);
                        return (
                          <AisleChip
                            key={key}
                            aisle={chip.aisle}
                            level={chip.level}
                            isSelected={selectedKeys.has(key)}
                            priorityOrder={idx >= 0 ? idx + 1 : undefined}
                            onToggle={handleToggleChip}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border">
                    <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      {whConfig && whConfig.aisleRules.length > 0
                        ? `Aisles and levels come from the WH Location Config for ${whConfig.facilityName}. Edit that config to add or remove options.`
                        : "Aisles are derived from Extensiv location names. Configure this warehouse in WH Location Config for a curated list."}
                    </p>
                  </div>
                </>
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
                    {priorityEntries.length} slot{priorityEntries.length !== 1 ? "s" : ""}
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
                  empty slots in your prioritised aisles and levels (in order), before falling back to
                  consolidation candidates and then any available warehouse slot.
                  {whConfig && whConfig.aisleRules.length > 0 && (
                    <> Level-specific priorities (e.g. <span className="font-mono">D / A</span>) let you direct
                    associates to a specific shelf height within an aisle.</>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
