import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Database,
  Eye, FlaskConical, Info, Loader2, MapPin, Pencil, Plus, Save,
  Sparkles, Trash2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

type LocationType = "staging" | "pick_face" | "warehouse";

const locTypeLabel: Record<LocationType, string> = {
  staging: "Staging",
  pick_face: "Pick Face",
  warehouse: "Warehouse",
};

const locTypeBadge: Record<LocationType, string> = {
  staging: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  pick_face: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  warehouse: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Location Assignments  (was LocationConfig.tsx)
// ─────────────────────────────────────────────────────────────────────────────

interface LocationForm {
  id?: number;
  configId: number;
  customerId: number;
  customerName: string;
  facilityId: number;
  facilityName: string;
  locationId: number;
  locationName: string;
  locationType: LocationType;
}

interface StagingMapping {
  customerId: number;
  customerName: string;
  stagingPrefix: string;
}

function AutoPopulateDialog({
  open,
  onClose,
  configId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  configId: number;
  onSuccess: () => void;
}) {
  const { data: facilities, isLoading: facilitiesLoading } = trpc.extensiv.facilities.useQuery(
    { configId },
    { enabled: open }
  );
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const { data: customers, isLoading: customersLoading } = trpc.extensiv.customersForFacility.useQuery(
    { configId, facilityId: selectedFacilityId ?? 0 },
    { enabled: !!selectedFacilityId }
  );
  const [mappings, setMappings] = useState<StagingMapping[]>([]);
  const [previewResult, setPreviewResult] = useState<{
    totalLocations: number; seeded: number; skipped: number;
    preview: Array<{ customerId: number; customerName: string; locationId: number; locationName: string; locationType: string }>;
  } | null>(null);
  const [step, setStep] = useState<"configure" | "preview" | "done">("configure");

  const seedMutation = trpc.locations.seedFromExtensiv.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) { setPreviewResult(data); setStep("preview"); }
      else { toast.success(`Seeded ${data.seeded} staging location${data.seeded !== 1 ? "s" : ""} successfully!`); onSuccess(); onClose(); }
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const initMappings = (customerList: Array<{ id: number; name: string }>) => {
    setMappings(
      [...customerList]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ customerId: c.id, customerName: c.name, stagingPrefix: "" }))
    );
  };
  const handleFacilitySelect = (facilityId: number) => {
    setSelectedFacilityId(facilityId); setMappings([]); setPreviewResult(null); setStep("configure");
  };
  const updateMapping = (customerId: number, prefix: string) => {
    setMappings((prev) => prev.map((m) => (m.customerId === customerId ? { ...m, stagingPrefix: prefix } : m)));
  };
  const buildPayload = (dryRun: boolean) => {
    const selectedFacility = facilities?.find((f) => f.id === selectedFacilityId);
    return {
      configId, facilityId: selectedFacilityId!, facilityName: selectedFacility?.name,
      customerMappings: mappings.filter((m) => m.stagingPrefix.trim()).map((m) => ({
        customerId: m.customerId, customerName: m.customerName,
        stagingPrefixes: m.stagingPrefix.split(",").map((p) => p.trim()).filter(Boolean),
      })),
      dryRun,
    };
  };
  const handlePreview = () => {
    if (!selectedFacilityId) { toast.error("Select a facility first"); return; }
    const payload = buildPayload(true);
    if (payload.customerMappings.length === 0) { toast.error("Enter at least one staging prefix"); return; }
    seedMutation.mutate(payload);
  };
  const handleConfirm = () => { seedMutation.mutate(buildPayload(false)); };
  if (customers && mappings.length === 0 && customers.length > 0) initMappings(customers);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Set Up Staging Locations from Extensiv
          </DialogTitle>
        </DialogHeader>
        {step === "configure" && (
          <div className="space-y-5 py-2">
            <div className="p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 rounded-md text-xs text-purple-800 dark:text-purple-300 space-y-1">
              <p className="font-semibold">What is a staging location?</p>
              <p>Staging is a temporary holding area. During allocation, inventory moves from warehouse and pick face locations into staging. Each client has one staging location in Extensiv (e.g. <code>HR-Stage</code>, <code>ONCO-Staging</code>).</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">1. Select Facility</Label>
              {facilitiesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading facilities...</div>
              ) : (
                <Select value={selectedFacilityId ? String(selectedFacilityId) : ""} onValueChange={(v) => handleFacilitySelect(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Select a facility..." /></SelectTrigger>
                  <SelectContent>{(facilities ?? []).map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            {selectedFacilityId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">2. Staging Location Prefix per Client</Label>
                <p className="text-xs text-muted-foreground">Enter the prefix that identifies each client's staging location in Extensiv. Leave blank to skip a client.</p>
                {customersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading clients...</div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {mappings.map((m) => (
                      <div key={m.customerId} className="flex items-center gap-3">
                        <div className="w-44 shrink-0"><p className="text-sm font-medium truncate">{m.customerName}</p><p className="text-xs text-muted-foreground">ID: {m.customerId}</p></div>
                        <Input placeholder="e.g. HR  or  BIG" value={m.stagingPrefix} onChange={(e) => updateMapping(m.customerId, e.target.value)} className="flex-1" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md text-xs text-blue-800 dark:text-blue-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>A <strong>dry run preview</strong> runs first — you'll see exactly which staging locations will be saved before anything is committed.</span>
            </div>
          </div>
        )}
        {step === "preview" && previewResult && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-muted rounded-lg"><p className="text-2xl font-bold">{previewResult.totalLocations}</p><p className="text-xs text-muted-foreground">Total Extensiv Locations</p></div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg"><p className="text-2xl font-bold text-green-700 dark:text-green-400">{previewResult.seeded}</p><p className="text-xs text-muted-foreground">Staging locations found</p></div>
            </div>
            {previewResult.seeded === 0 ? (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md text-xs text-red-800 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>No staging locations found with the given prefixes. Check that the prefix matches the start of the location name in Extensiv.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {previewResult.preview.map((loc, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0"><p className="font-medium truncate">{loc.locationName}</p><p className="text-xs text-muted-foreground">{loc.customerName}</p></div>
                    <Badge className={locTypeBadge[loc.locationType as LocationType] ?? ""}>{locTypeLabel[loc.locationType as LocationType] ?? loc.locationType}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {step === "configure" && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handlePreview} disabled={seedMutation.isPending} className="gap-1.5">
                {seedMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Running preview...</> : <><FlaskConical className="h-4 w-4" />Preview</>}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("configure")}>Back</Button>
              <Button onClick={handleConfirm} disabled={seedMutation.isPending || previewResult?.seeded === 0} className="gap-1.5">
                {seedMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : `Confirm & Save ${previewResult?.seeded ?? 0} Locations`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationAssignmentsTab() {
  const utils = trpc.useUtils();
  const { data: configs } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [autoPopOpen, setAutoPopOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<LocationForm>>({});
  const [testConfigId, setTestConfigId] = useState<number | null>(null);
  const [testFacilityId, setTestFacilityId] = useState<number | null>(null);
  const [runTest, setRunTest] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const activeConfigId = selectedConfigId ?? configs?.[0]?.id ?? null;

  const { data: facilities } = trpc.extensiv.facilities.useQuery(
    { configId: activeConfigId! }, { enabled: !!activeConfigId }
  );
  const activeFacilityId = selectedFacilityId ?? facilities?.[0]?.id ?? null;

  const { data: locations, isLoading } = trpc.locations.list.useQuery(
    { configId: activeConfigId! },
    { enabled: !!activeConfigId }
  );
  const { data: extLocations } = trpc.extensiv.locations.useQuery(
    { configId: testConfigId!, facilityId: testFacilityId! },
    { enabled: !!testConfigId && !!testFacilityId && runTest }
  ) as { data?: Array<{ id: number; name: string }> };

  const saveMutation = trpc.locations.save.useMutation({
    onSuccess: () => { utils.locations.list.invalidate(); toast.success("Location saved"); setEditOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.locations.delete.useMutation({
    onSuccess: () => { utils.locations.list.invalidate(); toast.success("Location removed"); },
    onError: (e) => toast.error(e.message),
  });
  // toggleActive may not exist in all router versions; guard gracefully
  const toggleMutation = (trpc.locations as unknown as { toggleActive?: { useMutation: (opts: object) => { mutate: (args: { id: number }) => void; isPending?: boolean } } }).toggleActive?.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (loc?: typeof locations extends (infer T)[] | undefined ? T : never) => {
    if (loc) {
      setEditForm({
        id: (loc as { id: number }).id,
        configId: activeConfigId!,
        customerId: (loc as { customerId: number }).customerId,
        customerName: (loc as { customerName: string }).customerName,
        facilityId: activeFacilityId!,
        facilityName: (loc as { facilityName: string }).facilityName,
        locationId: (loc as { locationId: number }).locationId,
        locationName: (loc as { locationName: string }).locationName,
        locationType: (loc as { locationType: LocationType }).locationType,
      });
    } else {
      setEditForm({ configId: activeConfigId!, facilityId: activeFacilityId!, locationType: "staging" });
    }
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!editForm.customerId || !editForm.locationId || !editForm.locationType) {
      toast.error("All fields are required"); return;
    }
    saveMutation.mutate(editForm as Parameters<typeof saveMutation.mutate>[0]);
  };

  const displayedLocations = showInactive ? locations : (locations ?? []).filter((l) => (l as { isActive?: boolean }).isActive !== false);

  return (
    <>
      <div className="space-y-5">
        {/* Config + facility selectors */}
        {configs && configs.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {configs.map((c) => (
              <Button key={c.id} variant={activeConfigId === c.id ? "default" : "outline"} size="sm"
                onClick={() => { setSelectedConfigId(c.id); setSelectedFacilityId(null); }}>
                {c.name}
              </Button>
            ))}
          </div>
        )}
        {facilities && facilities.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {facilities.map((f) => (
              <Button key={f.id} variant={activeFacilityId === f.id ? "default" : "outline"} size="sm"
                onClick={() => setSelectedFacilityId(f.id)}>
                {f.name}
              </Button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
            <label htmlFor="show-inactive" className="cursor-pointer">Show inactive</label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"
              onClick={() => { setTestConfigId(activeConfigId); setTestFacilityId(activeFacilityId); setRunTest(true); }}>
              <FlaskConical className="h-3.5 w-3.5" /> Test Extensiv Locations
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAutoPopOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" /> Auto-Populate Staging
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => openEdit()}>
              <Plus className="h-3.5 w-3.5" /> Add Location
            </Button>
          </div>
        </div>

        {extLocations && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Extensiv Locations ({extLocations.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {extLocations.map((l) => (
                  <Badge key={(l as { id: number }).id} variant="outline" className="text-xs font-mono">
                    {(l as { name: string }).name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /><span>Loading locations…</span>
          </div>
        ) : !displayedLocations || displayedLocations.length === 0 ? (
          <Card><CardContent className="p-8 text-center">
            <MapPin className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground mb-3">No location assignments yet.</p>
            <Button size="sm" onClick={() => openEdit()}><Plus className="h-4 w-4 mr-2" />Add Location</Button>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {displayedLocations.map((loc) => {
              const l = loc as { id: number; locationName: string; customerName: string; locationType: LocationType; isActive?: boolean };
              return (
                <div key={l.id} className={`flex items-center gap-3 p-3 rounded-xl border ${l.isActive === false ? "opacity-50" : ""}`}>
                  <Badge className={`${locTypeBadge[l.locationType]} text-xs shrink-0`}>{locTypeLabel[l.locationType]}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.locationName}</p>
                    <p className="text-xs text-muted-foreground">{l.customerName}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={l.isActive !== false} onCheckedChange={() => toggleMutation?.mutate({ id: l.id })} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc as Parameters<typeof openEdit>[0])}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Remove this location?")) deleteMutation.mutate({ id: l.id }); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editForm.id ? "Edit Location" : "Add Location"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Location Type</Label>
              <Select value={editForm.locationType ?? "staging"} onValueChange={(v) => setEditForm({ ...editForm, locationType: v as LocationType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="pick_face">Pick Face</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location Name</Label>
              <Input placeholder="e.g. HR-Stage" value={editForm.locationName ?? ""} onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Location ID (Extensiv)</Label>
              <Input type="number" placeholder="Numeric ID" value={editForm.locationId ?? ""} onChange={(e) => setEditForm({ ...editForm, locationId: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Customer Name</Label>
              <Input placeholder="e.g. Halo Reach" value={editForm.customerName ?? ""} onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Customer ID (Extensiv)</Label>
              <Input type="number" placeholder="Numeric ID" value={editForm.customerId ?? ""} onChange={(e) => setEditForm({ ...editForm, customerId: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeConfigId && (
        <AutoPopulateDialog
          open={autoPopOpen}
          onClose={() => setAutoPopOpen(false)}
          configId={activeConfigId}
          onSuccess={() => utils.locations.list.invalidate()}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Warehouse Structure  (was WhLocationConfig.tsx)
// ─────────────────────────────────────────────────────────────────────────────

type BayRule = { bayId: string; hasLeftRight: boolean };
type AisleRule = { aislePrefix: string; description?: string; bays: BayRule[]; levels: string[] };
type LocalDraft = { locationFormat: string; aisleRules: AisleRule[]; notes: string };

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

function WarehouseStructureTab() {
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

  const upsertMutation = trpc.whLocationConfig.upsert.useMutation({
    onSuccess: () => { utils.whLocationConfig.list.invalidate(); utils.whLocationConfig.get.invalidate(); }
  });
  const deleteMutation = trpc.whLocationConfig.delete.useMutation({
    onSuccess: () => { utils.whLocationConfig.list.invalidate(); utils.whLocationConfig.get.invalidate(); }
  });

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
    <div className="space-y-5">
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
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /><span>Loading warehouses…</span></div>
      ) : facilities.length === 0 ? (
        <Card><CardContent className="p-8 text-center"><p className="text-sm text-muted-foreground">No warehouses found. Add an Extensiv configuration in API Settings first.</p></CardContent></Card>
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
                <button className="w-full flex items-center gap-3 px-5 py-4 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                  onClick={() => setExpandedFacility(isOpen ? null : facility.id)}>
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm flex-1">{facility.name}</span>
                  {isSaved
                    ? <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px]">Configured · {(dbRow.aisleRules as AisleRule[]).length} aisle{(dbRow.aisleRules as AisleRule[]).length !== 1 ? "s" : ""}</Badge>
                    : <Badge className="bg-muted/40 text-muted-foreground border-border/40 text-[10px]">Not configured</Badge>}
                  {isSaved && dbRow.updatedBy && <span className="text-[10px] text-muted-foreground hidden sm:inline">by {dbRow.updatedBy}</span>}
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="p-5 space-y-5 border-t border-border/40">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <Eye className="h-4 w-4 text-primary shrink-0" />
                      <div><p className="text-xs font-semibold text-foreground">Example location</p><p className="text-sm font-mono text-primary mt-0.5">{exampleLocation}</p></div>
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
                        <p className="text-xs text-muted-foreground italic">No aisles configured yet. Click "Add Aisle" to start.</p>
                      ) : (
                        <div className="space-y-4">
                          {draft.aisleRules.map((rule, ai) => (
                            <div key={ai} className="border border-border/40 rounded-lg p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs">Aisle Prefix</Label>
                                  <Input placeholder="e.g. A" value={rule.aislePrefix} onChange={(e) => updateAisleRule(facility.id, ai, { aislePrefix: e.target.value })} className="h-8 text-sm" />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs">Description (optional)</Label>
                                  <Input placeholder="e.g. Main aisle" value={rule.description ?? ""} onChange={(e) => updateAisleRule(facility.id, ai, { description: e.target.value })} className="h-8 text-sm" />
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive mt-5" onClick={() => removeAisleRule(facility.id, ai)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">Levels (comma-separated)</Label>
                                </div>
                                <Input placeholder="e.g. A,B,C" value={rule.levels.join(",")} onChange={(e) => updateAisleRule(facility.id, ai, { levels: e.target.value.split(",").map((l) => l.trim()).filter(Boolean) })} className="h-8 text-sm" />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">Bays</Label>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => addBay(facility.id, ai)}>
                                    <Plus className="h-3 w-3" /> Add Bay
                                  </Button>
                                </div>
                                {rule.bays.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">No bays yet.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {rule.bays.map((bay, bi) => (
                                      <div key={bi} className="flex items-center gap-2">
                                        <Input placeholder="Bay ID e.g. 001" value={bay.bayId} onChange={(e) => updateBay(facility.id, ai, bi, { bayId: e.target.value })} className="h-7 text-xs flex-1" />
                                        <div className="flex items-center gap-1.5">
                                          <Checkbox id={`lr-${facility.id}-${ai}-${bi}`} checked={bay.hasLeftRight} onCheckedChange={(v) => updateBay(facility.id, ai, bi, { hasLeftRight: !!v })} />
                                          <label htmlFor={`lr-${facility.id}-${ai}-${bi}`} className="text-xs cursor-pointer">L/R</label>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeBay(facility.id, ai, bi)}>
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
                      <Label className="text-xs font-semibold">Notes (optional)</Label>
                      <Input placeholder="Any notes about this warehouse's layout…" value={draft.notes} onChange={(e) => updateDraft(facility.id, { notes: e.target.value })} />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" className="gap-1.5" onClick={() => handleSave(facility.id, facility.name)} disabled={isSavingNow}>
                        {isSavingNow ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Save className="h-3.5 w-3.5" />Save Config</>}
                      </Button>
                      {isSaved && (
                        <Button size="sm" variant="ghost" className="text-destructive gap-1.5" onClick={() => handleDelete(facility.id, facility.name)}>
                          <Trash2 className="h-3.5 w-3.5" /> Clear Config
                        </Button>
                      )}
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

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export default function LocationConfigCombined() {
  return (
    <div className="p-7 space-y-6 page-enter max-w-4xl">
      <div>
        <p className="page-breadcrumb">Configuration</p>
        <h1 className="page-title flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          Location Config
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage location assignments per customer and define each warehouse's physical aisle/bay/level structure.
        </p>
      </div>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Location Assignments
          </TabsTrigger>
          <TabsTrigger value="structure" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Warehouse Structure
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="pt-4">
          <LocationAssignmentsTab />
        </TabsContent>

        <TabsContent value="structure" className="pt-4">
          <WarehouseStructureTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
