import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  MapPin, Plus, Trash2, Save, Loader2, Info, ChevronDown, ChevronRight, Database, Eye,
} from "lucide-react";

type BayRule = { bayId: string; hasLeftRight: boolean; };
type AisleRule = { aislePrefix: string; description?: string; bays: BayRule[]; levels: string[]; };
type LocalDraft = { locationFormat: string; aisleRules: AisleRule[]; notes: string; };

const GD_WAREHOUSES_FALLBACK = ["Columbus", "Reno", "Toronto", "Calgary"];

const FORMAT_OPTIONS = [
  { value: "AISLE-BAY-LEVEL",    label: "AISLE-BAY-LEVEL  (e.g. D-017-C)" },
  { value: "AISLE-BAY",          label: "AISLE-BAY  (e.g. A-001)" },
  { value: "AISLE-BAY-LR-LEVEL", label: "AISLE-BAY-L/R-LEVEL  (e.g. D-017-L-C)" },
  { value: "ZONE-AISLE-BAY",     label: "ZONE-AISLE-BAY  (e.g. WH1-D-017)" },
  { value: "CUSTOM",             label: "Custom / Other" },
];

const DEFAULT_DRAFT: LocalDraft = { locationFormat: "AISLE-BAY-LEVEL", aisleRules: [], notes: "" };

function buildExampleLocation(draft: LocalDraft): string {
  const fmt = draft.locationFormat;
  const aisle = draft.aisleRules[0]?.aislePrefix || "A";
  const bay = draft.aisleRules[0]?.bays[0]?.bayId || "001";
  const hasLR = draft.aisleRules[0]?.bays[0]?.hasLeftRight ?? false;
  const level = draft.aisleRules[0]?.levels[0] || "C";
  if (fmt === "AISLE-BAY-LEVEL") return `${aisle}-${bay}-${level}`;
  if (fmt === "AISLE-BAY") return `${aisle}-${bay}`;
  if (fmt === "AISLE-BAY-LR-LEVEL") return `${aisle}-${bay}-${hasLR ? "L" : "R"}-${level}`;
  if (fmt === "ZONE-AISLE-BAY") return `WH1-${aisle}-${bay}`;
  return `${aisle}-${bay}-${level}`;
}

export default function WhLocationConfig() {
  const utils = trpc.useUtils();
  const configQuery = trpc.config.list.useQuery();
  const selectedConfigId = (configQuery.data ?? [])[0]?.id ?? null;
  const facilitiesQuery = trpc.extensiv.facilities.useQuery({ configId: selectedConfigId! }, { enabled: !!selectedConfigId });
  const facilities = facilitiesQuery.data ?? [];
  const dbConfigsQuery = trpc.whLocationConfig.list.useQuery({ configId: selectedConfigId! }, { enabled: !!selectedConfigId });
  const dbConfigs = dbConfigsQuery.data ?? [];
  const [drafts, setDrafts] = useState<Record<number, LocalDraft>>({});
  const [expandedFacility, setExpandedFacility] = useState<number | null>(null);
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (dbConfigs.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of dbConfigs) {
        if (!next[row.facilityId]) {
          const legacyRules = (row.aisleRules as AisleRule[]).map((r) => ({ ...r, bays: r.bays ?? [] }));
          next[row.facilityId] = { locationFormat: "AISLE-BAY-LEVEL", aisleRules: legacyRules, notes: row.notes ?? "" };
        }
      }
      return next;
    });
  }, [dbConfigs]);

  const upsertMutation = trpc.whLocationConfig.upsert.useMutation({ onSuccess: () => { utils.whLocationConfig.list.invalidate(); utils.whLocationConfig.get.invalidate(); } });
  const deleteMutation = trpc.whLocationConfig.delete.useMutation({ onSuccess: () => { utils.whLocationConfig.list.invalidate(); utils.whLocationConfig.get.invalidate(); } });

  function getDraft(fid: number): LocalDraft { return drafts[fid] ?? DEFAULT_DRAFT; }
  function updateDraft(fid: number, u: Partial<LocalDraft>) { setDrafts((p) => ({ ...p, [fid]: { ...getDraft(fid), ...u } })); }
  function addAisleRule(fid: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: [...d.aisleRules, { aislePrefix: "", description: "", bays: [], levels: [] }] }); }
  function updateAisleRule(fid: number, idx: number, rule: Partial<AisleRule>) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === idx ? { ...r, ...rule } : r) }); }
  function removeAisleRule(fid: number, idx: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.filter((_, i) => i !== idx) }); }
  function addBay(fid: number, ai: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === ai ? { ...r, bays: [...r.bays, { bayId: "", hasLeftRight: false }] } : r) }); }
  function updateBay(fid: number, ai: number, bi: number, u: Partial<BayRule>) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === ai ? { ...r, bays: r.bays.map((b, j) => j === bi ? { ...b, ...u } : b) } : r) }); }
  function removeBay(fid: number, ai: number, bi: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === ai ? { ...r, bays: r.bays.filter((_, j) => j !== bi) } : r) }); }

  async function handleSave(fid: number, fname: string) {
    const d = getDraft(fid);
    if (d.aisleRules.some((r) => !r.aislePrefix.trim())) { toast.error("All aisle rules must have a prefix."); return; }
    setSaving((s) => ({ ...s, [fid]: true }));
    try {
      await upsertMutation.mutateAsync({ configId: selectedConfigId!, facilityId: fid, facilityName: fname, aisleRules: d.aisleRules, notes: d.notes || null });
      toast.success(`WH Location Config saved for ${fname}`);
    } catch { toast.error("Failed to save config."); }
    finally { setSaving((s) => ({ ...s, [fid]: false })); }
  }

  async function handleDelete(fid: number, fname: string) {
    try {
      await deleteMutation.mutateAsync({ configId: selectedConfigId!, facilityId: fid });
      setDrafts((p) => { const n = { ...p }; delete n[fid]; return n; });
      toast.success(`Config cleared for ${fname}`);
    } catch { toast.error("Failed to delete config."); }
  }

  function getDbRow(fid: number) { return dbConfigs.find((r) => r.facilityId === fid) ?? null; }
  const isLoading = configQuery.isLoading || facilitiesQuery.isLoading || dbConfigsQuery.isLoading;
  const showFallbackNote = facilities.length === 1 && (facilities[0]?.name?.toLowerCase().includes("go direct") || facilities[0]?.name?.trim() === "");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <p className="page-breadcrumb">Configuration</p>
        <h1 className="page-title">WH Location Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define each warehouse's location structure — aisles, bays (with optional Left/Right sides), and levels.
          Used by the Put Away Wizard and Location Priority Config.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-green-400">
        <Database className="h-3.5 w-3.5" />
        <span>Configs are saved to the database and shared across all workstations.</span>
      </div>
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Location structure guide</p>
              <p>Each location has three components: <strong>Aisle</strong> (letter/prefix), <strong>Bay</strong> (numbered slot — some have Left/Right sides), and <strong>Level</strong> (vertical: A=bottom, B=middle, C=top).</p>
              <p className="mt-1">Example: <code className="bg-muted px-1 rounded font-mono">D-017-L-C</code> = Aisle D, Bay 017, Left side, Level C</p>
            </div>
          </div>
        </CardContent>
      </Card>
      {showFallbackNote && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Extensiv shows a single facility</p>
                <p>To see Columbus, Reno, Toronto, and Calgary as separate warehouses, each needs its own facility record in Extensiv (Settings → Facilities).</p>
                <p className="mt-1 font-medium text-foreground">GD Warehouses: {GD_WAREHOUSES_FALLBACK.join(" · ")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Loading warehouses…</span>
        </div>
      ) : facilities.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No warehouses found. Add an Extensiv configuration in Settings first.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {facilities.map((facility) => {
            const draft = getDraft(facility.id);
            const dbRow = getDbRow(facility.id);
            const isOpen = expandedFacility === facility.id;
            const isSaved = !!dbRow;
            const isSavingNow = saving[facility.id] ?? false;
            const exampleLocation = buildExampleLocation(draft);
            return (
              <div key={facility.id} className="border border-border/60 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                  onClick={() => setExpandedFacility(isOpen ? null : facility.id)}
                >
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm flex-1">{facility.name}</span>
                  {isSaved ? (
                    <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px]">
                      Configured · {(dbRow.aisleRules as AisleRule[]).length} aisle{(dbRow.aisleRules as AisleRule[]).length !== 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <Badge className="bg-muted/40 text-muted-foreground border-border/40 text-[10px]">Not configured</Badge>
                  )}
                  {isSaved && dbRow.updatedBy && <span className="text-[10px] text-muted-foreground hidden sm:inline">by {dbRow.updatedBy}</span>}
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="p-5 space-y-5 border-t border-border/40">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <Eye className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Example location</p>
                        <p className="text-sm font-mono text-primary mt-0.5">{exampleLocation}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Location Format</Label>
                      <Select value={draft.locationFormat} onValueChange={(v) => updateDraft(facility.id, { locationFormat: v })}>
                        <SelectTrigger className="w-full max-w-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{FORMAT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Aisles, Bays &amp; Levels</Label>
                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => addAisleRule(facility.id)}>
                          <Plus className="h-3.5 w-3.5" /> Add Aisle
                        </Button>
                      </div>
                      {draft.aisleRules.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-xs border border-dashed border-border rounded-lg">
                          No aisles configured. Click "Add Aisle" to define the aisle structure.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {draft.aisleRules.map((rule, aisleIdx) => (
                            <div key={aisleIdx} className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/10">
                              <div className="flex items-start gap-2">
                                <div className="space-y-1 w-24 shrink-0">
                                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Aisle</Label>
                                  <Input value={rule.aislePrefix} onChange={(e) => updateAisleRule(facility.id, aisleIdx, { aislePrefix: e.target.value.toUpperCase() })} placeholder="e.g. D" className="h-8 text-xs font-mono" />
                                </div>
                                <div className="space-y-1 flex-1">
                                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Description (optional)</Label>
                                  <Input value={rule.description ?? ""} onChange={(e) => updateAisleRule(facility.id, aisleIdx, { description: e.target.value })} placeholder="e.g. Main floor aisle D" className="h-8 text-xs" />
                                </div>
                                <div className="pt-5">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => removeAisleRule(facility.id, aisleIdx)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Levels (comma-separated)</Label>
                                <Input value={rule.levels.join(", ")} onChange={(e) => updateAisleRule(facility.id, aisleIdx, { levels: e.target.value.split(",").map((l) => l.trim().toUpperCase()).filter(Boolean) })} placeholder="e.g. A, B, C  or  1, 2, 3" className="h-8 text-xs font-mono max-w-xs" />
                                <p className="text-[10px] text-muted-foreground">A = bottom, B = middle, C = top (or use numbers)</p>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Bays</Label>
                                  <Button size="sm" variant="outline" className="gap-1 h-6 text-[10px] px-2" onClick={() => addBay(facility.id, aisleIdx)}>
                                    <Plus className="h-3 w-3" /> Add Bay
                                  </Button>
                                </div>
                                {rule.bays.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic">No bays defined — click "Add Bay" to add individual bay slots.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {rule.bays.map((bay, bayIdx) => (
                                      <div key={bayIdx} className="flex items-center gap-2 flex-wrap">
                                        <Input value={bay.bayId} onChange={(e) => updateBay(facility.id, aisleIdx, bayIdx, { bayId: e.target.value })} placeholder="e.g. 001" className="h-7 text-xs font-mono w-24 shrink-0" />
                                        <div className="flex items-center gap-1.5">
                                          <Checkbox id={`lr-${facility.id}-${aisleIdx}-${bayIdx}`} checked={bay.hasLeftRight} onCheckedChange={(v) => updateBay(facility.id, aisleIdx, bayIdx, { hasLeftRight: !!v })} />
                                          <label htmlFor={`lr-${facility.id}-${aisleIdx}-${bayIdx}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">Has Left / Right side</label>
                                        </div>
                                        {bay.hasLeftRight && bay.bayId && (
                                          <span className="text-[10px] text-primary font-mono">{rule.aislePrefix || "A"}-{bay.bayId}-L &amp; {rule.aislePrefix || "A"}-{bay.bayId}-R</span>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10 ml-auto" onClick={() => removeBay(facility.id, aisleIdx, bayIdx)}>
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Notes</Label>
                      <Input value={draft.notes} onChange={(e) => updateDraft(facility.id, { notes: e.target.value })} placeholder="Any additional notes about this warehouse's location structure…" className="text-xs" />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      {isSaved ? (
                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs gap-1.5" onClick={() => handleDelete(facility.id, facility.name)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" /> Clear Config
                        </Button>
                      ) : <span />}
                      <Button className="gap-2" onClick={() => handleSave(facility.id, facility.name)} disabled={isSavingNow}>
                        {isSavingNow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Config
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
