/**
 * AllocationRules.tsx
 *
 * Per-client allocation rules page. Shows all clients (from the active Extensiv
 * config) as expandable cards. Each card exposes:
 *   - Lot Mixing toggle (already exists)
 *   - Auto-Run toggle (already exists)
 *   - Location Priority Patterns — an ordered list of prefix/substring patterns
 *     that the engine uses to sort candidate locations before FEFO.
 *   - Notes — free-form instructions visible to the allocator.
 */
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  ListOrdered,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PriorityPattern {
  pattern: string;
  label: string;
}

interface ClientRuleState {
  customerId: number;
  customerName: string;
  facilityId?: number;
  facilityName?: string;
  noLotMixing: boolean;
  autoRun: boolean;
  locationPriorityPatterns: PriorityPattern[];
  notes: string;
  dirty: boolean;
  saving: boolean;
  open: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildInitialState(
  customers: Array<{ customerId: number; customerName: string; facilityId?: number; facilityName?: string }>,
  rules: Array<{
    customerId: number;
    noLotMixing: boolean;
    autoRun: boolean;
    locationPriorityPatterns?: PriorityPattern[] | null;
    notes?: string | null;
  }>
): ClientRuleState[] {
  const ruleMap = new Map(rules.map((r) => [r.customerId, r]));
  return [...customers].sort((a, b) => (a.customerName ?? "").localeCompare(b.customerName ?? "")).map((c) => {
    const r = ruleMap.get(c.customerId);
    return {
      customerId: c.customerId,
      customerName: c.customerName,
      facilityId: c.facilityId,
      facilityName: c.facilityName,
      noLotMixing: r?.noLotMixing ?? false,
      autoRun: r?.autoRun ?? false,
      locationPriorityPatterns: (r?.locationPriorityPatterns as PriorityPattern[] | null | undefined) ?? [],
      notes: r?.notes ?? "",
      dirty: false,
      saving: false,
      open: false,
    };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AllocationRules() {
  const utils = trpc.useUtils();

  // Load the active config
  const { data: configs, isLoading: loadingConfigs } =
    trpc.config.list.useQuery();
  const configId = configs?.[0]?.id ?? 0;

  // Load customers for the active config
  const { data: customersData, isLoading: loadingCustomers } =
    trpc.extensiv.customers.useQuery(
      { configId },
      { enabled: configId > 0 }
    );

  // Load existing rules
  const { data: rulesData, isLoading: loadingRules } =
    trpc.customerRules.list.useQuery(
      { configId },
      { enabled: configId > 0 }
    );

  const saveMutation = trpc.customerRules.save.useMutation({
    onSuccess: () => {
      utils.customerRules.list.invalidate({ configId });
    },
  });

  const copyMutation = trpc.customerRules.copyRules.useMutation({
    onSuccess: (data) => {
      utils.customerRules.list.invalidate({ configId });
      toast.success(`Rules copied to ${data.copied} customer${data.copied === 1 ? "" : "s"}.`);
      setCopyDialog({ open: false, sourceId: null, targetIds: new Set() });
    },
    onError: (e) => {
      toast.error(`Copy failed: ${e.message}`);
    },
  });

  // ── Copy Rules dialog state ───────────────────────────────────────────────
  const [copyDialog, setCopyDialog] = useState<{
    open: boolean;
    sourceId: number | null;
    targetIds: Set<number>;
  }>({ open: false, sourceId: null, targetIds: new Set() });

  const openCopyDialog = (sourceId: number) => {
    setCopyDialog({ open: true, sourceId, targetIds: new Set() });
  };

  const toggleCopyTarget = (customerId: number) => {
    setCopyDialog((prev) => {
      const next = new Set(prev.targetIds);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return { ...prev, targetIds: next };
    });
  };

  // Local state for all client rule cards
  const [clients, setClients] = useState<ClientRuleState[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [hideInactive, setHideInactive] = useState(true);

  const copyDialogSource = useMemo(
    () => clients.find((c) => c.customerId === copyDialog.sourceId),
    [clients, copyDialog.sourceId]
  );

  const handleCopyConfirm = () => {
    if (!copyDialog.sourceId || copyDialog.targetIds.size === 0) return;
    const targets = clients
      .filter((c) => copyDialog.targetIds.has(c.customerId))
      .map((c) => ({
        customerId: c.customerId,
        customerName: c.customerName,
        facilityId: c.facilityId,
        facilityName: c.facilityName,
      }));
    copyMutation.mutate({
      configId,
      sourceCustomerId: copyDialog.sourceId,
      targetCustomers: targets,
    });
  };

  useEffect(() => {
    if (!customersData || !rulesData || initialized) return;
    // Build a deduplicated list of customers across all facilities
    const seen = new Set<number>();
    const unique: Array<{ customerId: number; customerName: string; facilityId?: number; facilityName?: string }> = [];
    for (const c of customersData) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        unique.push({ customerId: c.id, customerName: c.name });
      }
    }
    setClients(buildInitialState(unique, rulesData));
    setInitialized(true);
  }, [customersData, rulesData, initialized]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const updateClient = (customerId: number, patch: Partial<ClientRuleState>) => {
    setClients((prev) =>
      prev.map((c) =>
        c.customerId === customerId ? { ...c, ...patch, dirty: true } : c
      )
    );
  };

  const addPattern = (customerId: number) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.customerId !== customerId) return c;
        return {
          ...c,
          dirty: true,
          locationPriorityPatterns: [
            ...c.locationPriorityPatterns,
            { pattern: "", label: "" },
          ],
        };
      })
    );
  };

  const removePattern = (customerId: number, idx: number) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.customerId !== customerId) return c;
        const next = c.locationPriorityPatterns.filter((_, i) => i !== idx);
        return { ...c, dirty: true, locationPriorityPatterns: next };
      })
    );
  };

  const updatePattern = (
    customerId: number,
    idx: number,
    field: "pattern" | "label",
    value: string
  ) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.customerId !== customerId) return c;
        const next = c.locationPriorityPatterns.map((p, i) =>
          i === idx ? { ...p, [field]: value } : p
        );
        return { ...c, dirty: true, locationPriorityPatterns: next };
      })
    );
  };

  const movePattern = (customerId: number, idx: number, dir: -1 | 1) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.customerId !== customerId) return c;
        const arr = [...c.locationPriorityPatterns];
        const target = idx + dir;
        if (target < 0 || target >= arr.length) return c;
        [arr[idx], arr[target]] = [arr[target], arr[idx]];
        return { ...c, dirty: true, locationPriorityPatterns: arr };
      })
    );
  };

  const saveClient = async (c: ClientRuleState) => {
    setClients((prev) =>
      prev.map((x) => (x.customerId === c.customerId ? { ...x, saving: true } : x))
    );
    try {
      await saveMutation.mutateAsync({
        configId,
        customerId: c.customerId,
        customerName: c.customerName,
        facilityId: c.facilityId,
        facilityName: c.facilityName,
        noLotMixing: c.noLotMixing,
        autoRun: c.autoRun,
        locationPriorityPatterns: c.locationPriorityPatterns.filter(
          (p) => p.pattern.trim() !== ""
        ),
        notes: c.notes.trim() || null,
      });
      setClients((prev) =>
        prev.map((x) =>
          x.customerId === c.customerId ? { ...x, dirty: false, saving: false } : x
        )
      );
      toast.success(`Rules saved for ${c.customerName}`);
    } catch (e: unknown) {
      setClients((prev) =>
        prev.map((x) => (x.customerId === c.customerId ? { ...x, saving: false } : x))
      );
      toast.error(`Failed to save: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const isLoading = loadingConfigs || loadingCustomers || loadingRules;

  // Filter out VACANT / TEST customers unless the user opts in
  const INACTIVE_PATTERN = /^VACANT|\bTEST\b|\(DEACTIVAT/i;
  const visibleClients = hideInactive
    ? clients.filter((c) => !INACTIVE_PATTERN.test(c.customerName ?? ""))
    : clients;
  const hiddenCount = clients.length - visibleClients.length;

  return (
    <AppLayout>
    <div className="p-7 max-w-4xl space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="page-breadcrumb">Configuration</p>
          <h1 className="page-title">Allocation Rules</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure per-client allocation behaviour. Location priority patterns
            tell the engine which locations to prefer when picking inventory — the
            first matching pattern wins. Rules are applied at run time.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <Switch
            id="hide-inactive"
            checked={hideInactive}
            onCheckedChange={setHideInactive}
          />
          <Label htmlFor="hide-inactive" className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
            Hide inactive
            {hideInactive && hiddenCount > 0 && (
              <span className="ml-1 text-xs">({hiddenCount} hidden)</span>
            )}
          </Label>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && clients.length === 0 && (
        <div className="bg-card border border-border rounded-2xl py-10 text-center text-muted-foreground text-sm">
          No clients found. Make sure your Extensiv API credentials are configured in API Settings.
        </div>
      )}

      {/* ── Copy Rules Dialog ───────────────────────────────────────── */}
      <Dialog
        open={copyDialog.open}
        onOpenChange={(open) =>
          setCopyDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy Rules To…</DialogTitle>
            <DialogDescription>
              {copyDialogSource ? (
                <>
                  Copying rules from <strong>{copyDialogSource.customerName}</strong>.
                  Select one or more customers to receive the same patterns,
                  lot-mixing setting, auto-run flag, and notes. Each customer’s
                  staging location will be preserved.
                </>
              ) : (
                "Select target customers."
              )}
            </DialogDescription>
          </DialogHeader>

          {copyDialogSource && (
            <div className="space-y-2 text-sm">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">Rules being copied</p>
                <div className="flex flex-wrap gap-2">
                  {copyDialogSource.locationPriorityPatterns.length > 0 ? (
                    copyDialogSource.locationPriorityPatterns.map((p, i) => (
                      <Badge key={i} variant="secondary" className="font-mono text-xs">
                        {i + 1}. {p.pattern}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">No location patterns</span>
                  )}
                  {copyDialogSource.noLotMixing && <Badge variant="outline" className="text-xs">No Lot Mixing</Badge>}
                  {copyDialogSource.autoRun && <Badge className="text-xs bg-blue-600 text-white">Auto-Run</Badge>}
                  {copyDialogSource.notes && (
                    <span className="text-xs text-muted-foreground italic truncate max-w-full">
                      Notes: {copyDialogSource.notes.slice(0, 60)}{copyDialogSource.notes.length > 60 ? "…" : ""}
                    </span>
                  )}
                </div>
              </div>

              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide pt-1">Copy to</p>
              <ScrollArea className="h-64 rounded-md border">
                <div className="p-2 space-y-1">
                  {visibleClients
                    .filter((c) => c.customerId !== copyDialog.sourceId)
                    .map((c) => (
                      <label
                        key={c.customerId}
                        className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={copyDialog.targetIds.has(c.customerId)}
                          onCheckedChange={() => toggleCopyTarget(c.customerId)}
                        />
                        <span className="flex-1 text-sm">{c.customerName}</span>
                        {c.locationPriorityPatterns.length > 0 && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {c.locationPriorityPatterns.length} pattern{c.locationPriorityPatterns.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </label>
                    ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCopyDialog({ open: false, sourceId: null, targetIds: new Set() })}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCopyConfirm}
              disabled={copyDialog.targetIds.size === 0 || copyMutation.isPending}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              {copyMutation.isPending
                ? "Copying…"
                : `Copy to ${copyDialog.targetIds.size} customer${copyDialog.targetIds.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isLoading &&
        visibleClients.map((c) => (
          <Collapsible
            key={c.customerId}
            open={c.open}
            onOpenChange={(open) =>
              setClients((prev) =>
                prev.map((x) =>
                  x.customerId === c.customerId ? { ...x, open } : x
                )
              )
            }
          >
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* ── Card header / trigger ─────────────────────────────── */}
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer select-none hover:bg-muted/30 transition-colors px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {c.open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-[15px] font-bold truncate">
                        {c.customerName}
                      </span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        ID {c.customerId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.locationPriorityPatterns.length > 0 && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <ListOrdered className="h-3 w-3" />
                          {c.locationPriorityPatterns.length}{" "}
                          {c.locationPriorityPatterns.length === 1
                            ? "pattern"
                            : "patterns"}
                        </Badge>
                      )}
                      {c.noLotMixing && (
                        <Badge variant="outline" className="text-xs">
                          No Lot Mixing
                        </Badge>
                      )}
                      {c.autoRun && (
                        <Badge className="text-xs bg-blue-600 text-white">
                          Auto-Run
                        </Badge>
                      )}
                      {c.dirty && (
                        <Badge
                          variant="outline"
                          className="text-xs text-amber-600 border-amber-400"
                        >
                          Unsaved
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>

              {/* ── Expanded content ──────────────────────────────────── */}
              <CollapsibleContent>
                <div className="px-5 pb-6 space-y-6 border-t border-border pt-5">

                  {/* ── Toggles row ─────────────────────────────────── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                      <div>
                        <Label className="font-medium">No Lot Mixing</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Prevent multiple lot codes on the same order line.
                        </p>
                      </div>
                      <Switch
                        checked={c.noLotMixing}
                        onCheckedChange={(v) =>
                          updateClient(c.customerId, { noLotMixing: v })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                      <div>
                        <Label className="font-medium">Auto-Run</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Include in scheduled auto-allocation runs.
                        </p>
                      </div>
                      <Switch
                        checked={c.autoRun}
                        onCheckedChange={(v) =>
                          updateClient(c.customerId, { autoRun: v })
                        }
                      />
                    </div>
                  </div>

                  {/* ── Location Priority Patterns ───────────────────── */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="font-medium">
                          Location Priority Patterns
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Locations whose names contain the pattern (case-insensitive)
                          are sorted higher. Drag to reorder — rank 1 is highest
                          priority.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addPattern(c.customerId)}
                        className="gap-1 shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Pattern
                      </Button>
                    </div>

                    {c.locationPriorityPatterns.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                        No patterns configured. The engine will use the default
                        FEFO order across all locations.
                      </div>
                    )}

                    {c.locationPriorityPatterns.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
                      >
                        {/* Rank badge */}
                        <span className="w-6 text-center text-xs font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>

                        {/* Move up/down */}
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={idx === 0}
                            onClick={() => movePattern(c.customerId, idx, -1)}
                            title="Move up"
                          >
                            <GripVertical className="h-3 w-3 rotate-90" />
                          </button>
                          <button
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={
                              idx === c.locationPriorityPatterns.length - 1
                            }
                            onClick={() => movePattern(c.customerId, idx, 1)}
                            title="Move down"
                          >
                            <GripVertical className="h-3 w-3 -rotate-90" />
                          </button>
                        </div>

                        {/* Pattern input */}
                        <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              Pattern (prefix / substring)
                            </Label>
                            <Input
                              value={p.pattern}
                              onChange={(e) =>
                                updatePattern(
                                  c.customerId,
                                  idx,
                                  "pattern",
                                  e.target.value
                                )
                              }
                              placeholder="e.g. 12, RCV12, HR4"
                              className="h-8 text-sm font-mono"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              Label (description)
                            </Label>
                            <Input
                              value={p.label}
                              onChange={(e) =>
                                updatePattern(
                                  c.customerId,
                                  idx,
                                  "label",
                                  e.target.value
                                )
                              }
                              placeholder="e.g. Building 12"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>

                        {/* Remove */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                          onClick={() => removePattern(c.customerId, idx)}
                          title="Remove pattern"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* ── Notes ───────────────────────────────────────── */}
                  <div className="space-y-2">
                    <Label className="font-medium">Allocation Notes</Label>
                    <p className="text-xs text-muted-foreground">
                      Free-form instructions visible to the allocation team.
                      Not used by the engine directly.
                    </p>
                    <Textarea
                      value={c.notes}
                      onChange={(e) =>
                        updateClient(c.customerId, { notes: e.target.value })
                      }
                      placeholder="e.g. For Calgary warehouse, prioritise Building 12 locations (12####, RCV12) over Building 11 locations."
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>

                  {/* ── Save button ─────────────────────────────────── */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); openCopyDialog(c.customerId); }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy rules to…
                    </Button>
                    <Button
                      onClick={() => saveClient(c)}
                      disabled={!c.dirty || c.saving}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {c.saving ? "Saving…" : "Save Rules"}
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))
      }
    </div>
    </AppLayout>
  );
}
