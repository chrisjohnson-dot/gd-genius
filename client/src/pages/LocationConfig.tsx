import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, FlaskConical, Loader2, MapPin, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type LocationType = "staging" | "pick_face" | "warehouse";

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

// ─── Auto-Populate Dialog ─────────────────────────────────────────────────────
interface CustomerMapping {
  customerId: number;
  customerName: string;
  pickFacePrefixes: string; // comma-separated, e.g. "HR" or "BIG" or "BP"
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
  const [warehousePattern, setWarehousePattern] = useState("^[A-Z]-\\d{3}-[A-Z]$");

  const { data: customers, isLoading: customersLoading } = trpc.extensiv.customersForFacility.useQuery(
    { configId, facilityId: selectedFacilityId ?? 0 },
    { enabled: !!selectedFacilityId }
  );

  const [mappings, setMappings] = useState<CustomerMapping[]>([]);
  const [previewResult, setPreviewResult] = useState<{
    totalLocations: number;
    seeded: number;
    skipped: number;
    preview: Array<{ customerId: number; customerName: string; locationId: number; locationName: string; locationType: string }>;
  } | null>(null);
  const [step, setStep] = useState<"configure" | "preview" | "done">("configure");

  const seedMutation = trpc.locations.seedFromExtensiv.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) {
        setPreviewResult(data);
        setStep("preview");
      } else {
        toast.success(`Auto-populated ${data.seeded} locations successfully!`);
        onSuccess();
        onClose();
      }
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  // When customers load, initialize mappings
  const initMappings = (customerList: Array<{ id: number; name: string }>) => {
    setMappings(
      customerList.map((c) => ({
        customerId: c.id,
        customerName: c.name,
        pickFacePrefixes: "",
      }))
    );
  };

  const handleFacilitySelect = (facilityId: number) => {
    setSelectedFacilityId(facilityId);
    setMappings([]);
    setPreviewResult(null);
    setStep("configure");
  };

  const updateMapping = (customerId: number, prefixes: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.customerId === customerId ? { ...m, pickFacePrefixes: prefixes } : m))
    );
  };

  const buildPayload = (dryRun: boolean) => {
    const selectedFacility = facilities?.find((f) => f.id === selectedFacilityId);
    return {
      configId,
      facilityId: selectedFacilityId!,
      facilityName: selectedFacility?.name,
      warehouseLocationPattern: warehousePattern,
      customerMappings: mappings
        .filter((m) => m.pickFacePrefixes.trim())
        .map((m) => ({
          customerId: m.customerId,
          customerName: m.customerName,
          pickFacePrefixes: m.pickFacePrefixes
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        })),
      dryRun,
    };
  };

  const handlePreview = () => {
    if (!selectedFacilityId) { toast.error("Select a facility first"); return; }
    const payload = buildPayload(true);
    if (payload.customerMappings.length === 0) { toast.error("Add at least one pick face prefix"); return; }
    seedMutation.mutate(payload);
  };

  const handleConfirm = () => {
    seedMutation.mutate(buildPayload(false));
  };

  // Initialize mappings when customers load
  if (customers && mappings.length === 0 && customers.length > 0) {
    initMappings(customers);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Auto-Populate Locations from Extensiv
          </DialogTitle>
        </DialogHeader>

        {step === "configure" && (
          <div className="space-y-5 py-2">
            {/* Step 1: Select Facility */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">1. Select Facility</Label>
              {facilitiesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading facilities...
                </div>
              ) : (
                <Select
                  value={selectedFacilityId ? String(selectedFacilityId) : ""}
                  onValueChange={(v) => handleFacilitySelect(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a facility..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(facilities ?? []).map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Step 2: Pick Face Prefixes per Customer */}
            {selectedFacilityId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">2. Pick Face Prefix per Client</Label>
                <p className="text-xs text-muted-foreground">
                  Enter the location name prefix(es) for each client's pick face zone (e.g. <code>HR</code>, <code>BIG</code>, <code>BP</code>).
                  Locations matching <code>PREFIX###</code> will be tagged as Pick Face for that client.
                  Leave blank to skip a client (they'll still get warehouse locations).
                </p>
                {customersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading clients...
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {mappings.map((m) => (
                      <div key={m.customerId} className="flex items-center gap-3">
                        <div className="w-40 shrink-0">
                          <p className="text-sm font-medium truncate">{m.customerName}</p>
                          <p className="text-xs text-muted-foreground">ID: {m.customerId}</p>
                        </div>
                        <Input
                          placeholder="e.g. HR  or  BIG,HR"
                          value={m.pickFacePrefixes}
                          onChange={(e) => updateMapping(m.customerId, e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Warehouse pattern */}
            {selectedFacilityId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">3. Warehouse Location Pattern (regex)</Label>
                <p className="text-xs text-muted-foreground">
                  Locations matching this pattern are tagged as Warehouse for all clients.
                  Default matches <code>D-017-C</code> style (Aisle-Bay-Level).
                </p>
                <Input
                  value={warehousePattern}
                  onChange={(e) => setWarehousePattern(e.target.value)}
                  placeholder="^[A-Z]-\d{3}-[A-Z]$"
                />
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md text-xs text-blue-800 dark:text-blue-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                A <strong>dry run preview</strong> will run first — you'll see exactly what will be seeded before any data is saved.
                Staging locations must be added manually after seeding.
              </span>
            </div>
          </div>
        )}

        {step === "preview" && previewResult && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{previewResult.totalLocations}</p>
                <p className="text-xs text-muted-foreground">Total Extensiv Locations</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{previewResult.seeded}</p>
                <p className="text-xs text-muted-foreground">Will be seeded</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-muted-foreground">{previewResult.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped (no match)</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Preview (first 20):</p>
              <div className="space-y-1 max-h-64 overflow-y-auto text-xs">
                {previewResult.preview.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-border last:border-0">
                    <Badge className={locTypeBadge[item.locationType as LocationType] ?? ""}>{locTypeLabel[item.locationType as LocationType] ?? item.locationType}</Badge>
                    <span className="font-mono">{item.locationName}</span>
                    <span className="text-muted-foreground">→ {item.customerName}</span>
                    <span className="text-muted-foreground ml-auto">ID: {item.locationId}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Confirming will save all {previewResult.seeded} location entries. Existing entries for these customers will not be deleted — use the manual delete buttons to clean up first if needed.</span>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold">Locations seeded successfully!</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === "configure" && (
            <Button
              onClick={handlePreview}
              disabled={!selectedFacilityId || seedMutation.isPending}
            >
              {seedMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Running preview...</> : "Preview →"}
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("configure")}>← Back</Button>
              <Button
                onClick={handleConfirm}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Seeding...</> : `Confirm & Seed ${previewResult?.seeded ?? ""} Locations`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LocationConfig() {
  const utils = trpc.useUtils();
  const { data: configs } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const { data: locations, isLoading } = trpc.locations.list.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );
  const { data: customerRulesList } = trpc.customerRules.list.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );

  const saveMutation = trpc.locations.save.useMutation({
    onSuccess: () => { utils.locations.list.invalidate(); toast.success("Location saved"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.locations.delete.useMutation({
    onSuccess: () => { utils.locations.list.invalidate(); toast.success("Location deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const saveRuleMutation = trpc.customerRules.save.useMutation({
    onSuccess: () => { utils.customerRules.list.invalidate(); toast.success("Rule saved"); },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [autoPopulateOpen, setAutoPopulateOpen] = useState(false);
  const [form, setForm] = useState<Partial<LocationForm>>({});

  const openNew = () => {
    if (!selectedConfigId) { toast.error("Select a configuration first"); return; }
    setForm({ configId: selectedConfigId, locationType: "warehouse" });
    setOpen(true);
  };

  const openEdit = (loc: NonNullable<typeof locations>[number]) => {
    setForm({
      id: loc.id,
      configId: loc.configId,
      customerId: loc.customerId,
      customerName: loc.customerName ?? "",
      facilityId: loc.facilityId,
      facilityName: loc.facilityName ?? "",
      locationId: loc.locationId,
      locationName: loc.locationName,
      locationType: loc.locationType,
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.configId || !form.locationName || !form.locationType || !form.locationId || !form.customerId || !form.facilityId) {
      toast.error("Please fill all required fields");
      return;
    }
    saveMutation.mutate({
      id: form.id,
      configId: form.configId!,
      customerId: form.customerId!,
      customerName: form.customerName,
      facilityId: form.facilityId!,
      facilityName: form.facilityName,
      locationId: form.locationId!,
      locationName: form.locationName!,
      locationType: form.locationType!,
    });
  };

  // Group locations by customer
  const grouped = (locations ?? []).reduce<Record<string, typeof locations>>((acc, loc) => {
    const key = `${loc.customerId}:${loc.customerName ?? loc.customerId}`;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(loc);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Location Configuration</h1>
            <p className="text-muted-foreground text-sm mt-1">Map Extensiv location IDs to staging, pick face, or warehouse types</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedConfigId && (
              <Button
                variant="outline"
                onClick={() => setAutoPopulateOpen(true)}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" /> Auto-Populate from Extensiv
              </Button>
            )}
            <Button onClick={openNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Location
            </Button>
          </div>
        </div>

        {/* Config selector */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Label className="shrink-0">API Configuration:</Label>
              <Select
                value={selectedConfigId ? String(selectedConfigId) : ""}
                onValueChange={(v) => setSelectedConfigId(Number(v))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a configuration..." />
                </SelectTrigger>
                <SelectContent>
                  {(configs ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Location priority legend */}
        <Card className="border-muted">
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-2">Location Priority for Allocation:</p>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">Staging</Badge>
                <span className="text-muted-foreground">Tier 1 — fulfilled first, no movement needed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Pick Face</Badge>
                <span className="text-muted-foreground">Tier 1 — fulfilled first, no movement needed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Warehouse</Badge>
                <span className="text-muted-foreground">Tier 2 — moved to staging before allocation</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {!selectedConfigId ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Select a configuration above to view and manage locations.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">No locations configured yet.</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={() => setAutoPopulateOpen(true)}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Auto-Populate from Extensiv
                </Button>
                <Button variant="outline" size="sm" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Manually
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([key, locs]) => {
              const [customerIdStr, customerName] = key.split(":");
              const customerId = Number(customerIdStr);
              const rule = (customerRulesList ?? []).find((r) => r.customerId === customerId);
              const noLotMixing = rule?.noLotMixing ?? false;

              return (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Customer: <span className="text-foreground">{customerName}</span>
                        <span className="ml-2 text-xs">(ID: {customerIdStr})</span>
                      </CardTitle>
                      {/* Lot Mixing Rule Toggle */}
                      <div className="flex items-center gap-2 text-sm">
                        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground text-xs">No Lot Mixing</span>
                        <Switch
                          checked={noLotMixing}
                          onCheckedChange={(checked) => {
                            if (!selectedConfigId) return;
                            const existingRule = (customerRulesList ?? []).find((r) => r.customerId === customerId);
                            saveRuleMutation.mutate({
                              configId: selectedConfigId,
                              customerId,
                              customerName: customerName ?? undefined,
                              noLotMixing: checked,
                              autoRun: existingRule?.autoRun ?? false,
                            });
                          }}
                        />
                        <Badge
                          className={noLotMixing
                            ? "text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0"
                            : "text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0"}
                        >
                          {noLotMixing ? "Enforced" : "Allowed"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="divide-y divide-border">
                      {(locs ?? []).map((loc) => (
                        <div key={loc.id} className="py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge className={locTypeBadge[loc.locationType]}>{locTypeLabel[loc.locationType]}</Badge>
                            <div>
                              <p className="text-sm font-medium">{loc.locationName}</p>
                              <p className="text-xs text-muted-foreground">
                                Location ID: {loc.locationId} · Facility: {loc.facilityName ?? loc.facilityId}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(loc)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => { if (confirm("Delete this location?")) deleteMutation.mutate({ id: loc.id }); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto-Populate Dialog */}
      {selectedConfigId && (
        <AutoPopulateDialog
          open={autoPopulateOpen}
          onClose={() => setAutoPopulateOpen(false)}
          configId={selectedConfigId}
          onSuccess={() => utils.locations.list.invalidate()}
        />
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer ID</Label>
                <Input type="number" placeholder="e.g. 12345" value={form.customerId ?? ""} onChange={(e) => setForm({ ...form, customerId: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input placeholder="Display name" value={form.customerName ?? ""} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Facility ID</Label>
                <Input type="number" placeholder="e.g. 1" value={form.facilityId ?? ""} onChange={(e) => setForm({ ...form, facilityId: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Facility Name</Label>
                <Input placeholder="Display name" value={form.facilityName ?? ""} onChange={(e) => setForm({ ...form, facilityName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location ID</Label>
                <Input type="number" placeholder="Extensiv location ID" value={form.locationId ?? ""} onChange={(e) => setForm({ ...form, locationId: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Location Name</Label>
                <Input placeholder="e.g. STAGING-A" value={form.locationName ?? ""} onChange={(e) => setForm({ ...form, locationName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location Type</Label>
              <Select value={form.locationType ?? "warehouse"} onValueChange={(v) => setForm({ ...form, locationType: v as LocationType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staging">Staging (Tier 1 — no move needed)</SelectItem>
                  <SelectItem value="pick_face">Pick Face (Tier 1 — no move needed)</SelectItem>
                  <SelectItem value="warehouse">Warehouse (Tier 2 — moved to staging)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
