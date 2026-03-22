import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Loader2, Search, Users, Eye, EyeOff, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface ClientRow {
  id: number;
  configId: number;
  clientId: number;
  clientName: string;
  isVisible: boolean;
}

export default function ClientVisibility() {
  const utils = trpc.useUtils();

  // Load all warehouse configs
  const { data: configs, isLoading: configsLoading } = trpc.config.list.useQuery();

  // Active config tab
  const [activeConfigId, setActiveConfigId] = useState<number | null>(null);

  // Resolve the active config (default to first)
  const resolvedConfigId = activeConfigId ?? configs?.[0]?.id ?? null;

  // Load clients for the active config
  const { data: clients, isLoading: clientsLoading } = trpc.clientVisibility.list.useQuery(
    { configId: resolvedConfigId! },
    { enabled: resolvedConfigId !== null }
  );

  // Local edits — keyed by clientId
  const [edits, setEdits] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");

  // Merge server data with local edits
  const rows: ClientRow[] = useMemo(() => {
    if (!clients) return [];
    return clients
      .map((c) => ({
        ...c,
        isVisible: c.clientId in edits ? edits[c.clientId] : c.isVisible,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [clients, edits]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => r.clientName.toLowerCase().includes(q));
  }, [rows, search]);

  const hasEdits = Object.keys(edits).length > 0;

  // Count unallocated orders per client for the badge
  const { data: scheduleData } = trpc.pickSchedule.list.useQuery(
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

  const saveMutation = trpc.clientVisibility.save.useMutation({
    onSuccess: () => {
      toast.success("Client visibility saved");
      setEdits({});
      utils.clientVisibility.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function toggleAll(visible: boolean) {
    const newEdits: Record<number, boolean> = {};
    rows.forEach((r) => { newEdits[r.clientId] = visible; });
    setEdits(newEdits);
  }

  function handleSave() {
    if (!resolvedConfigId) return;
    const rowsToSave = rows.map((r) => ({
      configId: resolvedConfigId,
      clientId: r.clientId,
      clientName: r.clientName,
      isVisible: r.clientId in edits ? edits[r.clientId] : r.isVisible,
    }));
    saveMutation.mutate({ rows: rowsToSave });
  }

  const visibleCount = rows.filter((r) => (r.clientId in edits ? edits[r.clientId] : r.isVisible)).length;
  const hiddenCount = rows.length - visibleCount;

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-3xl page-enter">
        {/* Page header */}
        <div>
          <p className="page-breadcrumb">Configuration</p>
          <h1 className="page-title">Client Visibility</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which clients appear in the Open Orders view. Hidden clients are excluded from all order lists and counts.
          </p>
        </div>

        {/* Config tabs (if multiple warehouses) */}
        {!configsLoading && configs && configs.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {configs.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveConfigId(c.id); setEdits({}); setSearch(""); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  resolvedConfigId === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

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
                Clients
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 w-48 text-sm"
                    placeholder="Search clients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {/* Bulk actions */}
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleAll(true)}>
                  Show all
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleAll(false)}>
                  Hide all
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {clientsLoading || configsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {search ? `No clients match "${search}"` : "No clients found. Run a sync to populate this list."}
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
                      } ${isEdited ? "bg-amber-50/50" : "hover:bg-muted/30"}`}
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
                            {unalloc === 0 && scheduleData && (
                              <span className="ml-2 text-muted-foreground/60">(0 unallocated)</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isEdited && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
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
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-800 font-medium">
              You have unsaved changes to {Object.keys(edits).length} client{Object.keys(edits).length !== 1 ? "s" : ""}.
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
    </AppLayout>
  );
}
