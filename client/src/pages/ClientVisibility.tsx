import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  Loader2, Search, Users, Eye, EyeOff, Save, RotateCcw, Warehouse, Lock,
} from "lucide-react";
import { toast } from "sonner";

interface ClientRow {
  id: number;
  configId: number;
  clientId: number;
  clientName: string;
  isVisible: boolean;
  isLocked: boolean;
}

// ─── Per-warehouse panel ──────────────────────────────────────────────────────

interface WarehousePanelProps {
  configId: number;
  configName: string;
  /** unallocated counts keyed by clientId (from the global schedule query) */
  unallocatedByClient: Record<number, number>;
  scheduleReady: boolean;
}

function WarehousePanel({ configId, configName, unallocatedByClient, scheduleReady }: WarehousePanelProps) {
  const utils = trpc.useUtils();

  const { data: clients, isLoading: clientsLoading } = trpc.clientVisibility.list.useQuery({ configId });

  // Isolated edits for this warehouse only
  const [edits, setEdits] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");

  const rows: ClientRow[] = useMemo(() => {
    if (!clients) return [];
    return clients
      .map((c) => ({
        ...c,
        isVisible: c.clientId in edits ? edits[c.clientId] : c.isVisible,
        isLocked: c.isLocked ?? false,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [clients, edits]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => r.clientName.toLowerCase().includes(q));
  }, [rows, search]);

  const hasEdits = Object.keys(edits).length > 0;
  const visibleCount = rows.filter((r) => (r.clientId in edits ? edits[r.clientId] : r.isVisible)).length;
  const hiddenCount = rows.length - visibleCount;

  const saveMutation = trpc.clientVisibility.save.useMutation({
    onSuccess: () => {
      toast.success(`Client visibility saved for ${configName}`);
      setEdits({});
      utils.clientVisibility.list.invalidate({ configId });
    },
    onError: (e) => toast.error(e.message),
  });

  function toggleAll(visible: boolean) {
    const newEdits: Record<number, boolean> = {};
    rows.forEach((r) => { newEdits[r.clientId] = visible; });
    setEdits(newEdits);
  }

  function handleSave() {
    const rowsToSave = rows.map((r) => ({
      configId,
      clientId: r.clientId,
      clientName: r.clientName,
      isVisible: r.clientId in edits ? edits[r.clientId] : r.isVisible,
    }));
    saveMutation.mutate({ rows: rowsToSave });
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {!clientsLoading && rows.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-emerald-500" />
            <strong className="text-foreground">{visibleCount}</strong> visible
          </span>
          <span className="flex items-center gap-1.5">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <strong className="text-foreground">{hiddenCount}</strong> hidden
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span>{rows.length} total clients</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clients — {configName}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 w-48 text-sm"
                  placeholder="Search clients…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleAll(true)}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleAll(false)}>
                  Deselect All
                </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {clientsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search
                ? `No clients match "${search}"`
                : "No clients found for this warehouse. Run a sync to populate this list."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredRows.map((row) => {
                const unalloc = unallocatedByClient[row.clientId] ?? 0;
                const isVisible = row.clientId in edits ? edits[row.clientId] : row.isVisible;
                const isEdited = row.clientId in edits;

                return (
                  <div
                    key={row.clientId}
                    className={`flex items-center justify-between px-4 py-3 transition-colors ${
                      !isVisible ? "opacity-50" : ""
                    } ${isEdited ? "bg-amber-50/50 dark:bg-amber-900/10" : "hover:bg-muted/30"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 text-white"
                        style={{ background: isVisible ? "#6366f1" : "#9ca3af" }}
                      >
                        {row.clientName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {row.clientId}
                          {unalloc > 0 && (
                            <span className="ml-2 text-amber-600 font-medium">
                              ({unalloc} unallocated)
                            </span>
                          )}
                          {unalloc === 0 && scheduleReady && (
                            <span className="ml-2 text-muted-foreground/60">(0 unallocated)</span>
                          )}
                          {!scheduleReady && (
                            <span className="ml-2 text-muted-foreground/40 inline-flex items-center gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" /> loading…
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Lock badge — shown when client is hidden & locked (sync-protected) */}
                      {row.isLocked && !isEdited && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded"
                          title="Sync-locked: this client will not be re-shown by the background sync"
                        >
                          <Lock className="h-2.5 w-2.5" /> Locked
                        </span>
                      )}
                      {isEdited && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                          Unsaved
                        </span>
                      )}
                      <Switch
                        checked={isVisible}
                        onCheckedChange={(v) => setEdits((prev) => ({ ...prev, [row.clientId]: v }))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save / Reset bar */}
      {hasEdits && (
        <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            {Object.keys(edits).length} unsaved change{Object.keys(edits).length !== 1 ? "s" : ""} for {configName}.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setEdits({})}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
            <Button
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : <><Save className="h-3.5 w-3.5" /> Save Changes</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientVisibility() {
  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();
  const [activeConfigId, setActiveConfigId] = useState<number | null>(null);

  const resolvedConfigId = activeConfigId ?? configs?.[0]?.id ?? null;

  // Fetch all orders once for unallocated counts (not filtered by visibility so counts are accurate)
  const { data: scheduleData, isLoading: scheduleLoading } = trpc.pickSchedule.list.useQuery(
    { facilityId: undefined },
    { staleTime: 30_000 }
  );

  const unallocatedByClient = useMemo(() => {
    const map: Record<number, number> = {};
    if (!scheduleData?.orders) return map;
    for (const o of scheduleData.orders) {
      if (o.lifecycleStatus === "unallocated") {
        map[o.clientId] = (map[o.clientId] ?? 0) + 1;
      }
    }
    return map;
  }, [scheduleData]);

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-3xl page-enter">
        {/* Page header */}
        <div>
          <p className="page-breadcrumb">Configuration</p>
          <h1 className="page-title">Client Visibility</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which clients appear in the Open Orders view per warehouse. Hidden clients are excluded from all order lists and counts.
          </p>
        </div>

        {configsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !configs || configs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No warehouse configurations found. Add a warehouse in Settings first.
          </div>
        ) : (
          <>
            {/* Warehouse tabs */}
            <div className="flex gap-2 flex-wrap border-b border-border pb-1">
              {configs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveConfigId(c.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                    resolvedConfigId === c.id
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <Warehouse className="h-3.5 w-3.5" />
                  {c.name}
                </button>
              ))}
            </div>

            {/* Active warehouse panel — each mounts its own isolated state */}
            {resolvedConfigId !== null && (() => {
              const cfg = configs.find((c) => c.id === resolvedConfigId);
              if (!cfg) return null;
              return (
                <WarehousePanel
                  key={resolvedConfigId}
                  configId={resolvedConfigId}
                  configName={cfg.name}
                  unallocatedByClient={unallocatedByClient}
                  scheduleReady={!scheduleLoading}
                />
              );
            })()}
          </>
        )}
      </div>
    </AppLayout>
  );
}
