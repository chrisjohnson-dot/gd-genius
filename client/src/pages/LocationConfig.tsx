import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Layers,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

// ─── Bulk Pick Face Dialog ───────────────────────────────────────────────────
function BulkPickFaceDialog({
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
  const [locationPrefix, setLocationPrefix] = useState("HR");

  const { data: customers, isLoading: customersLoading } = trpc.extensiv.customersForFacility.useQuery(
    { configId, facilityId: selectedFacilityId ?? 0 },
    { enabled: !!selectedFacilityId }
  );

  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<"configure" | "preview" | "done">("configure");
  const [previewResult, setPreviewResult] = useState<{
    totalLocations: number;
    matchedLocations: number;
    seeded: number;
    customers: number;
    preview: Array<{ customerId: number; customerName: string; locationId: number; locationName: string }>;
  } | null>(null);

  const seedMutation = trpc.locations.seedPickFaceFromExtensiv.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) {
        setPreviewResult(data);
        setStep("preview");
      } else {
        toast.success(`Added ${data.seeded} pick face location${data.seeded !== 1 ? "s" : ""} successfully!`);
        onSuccess();
        onClose();
        setStep("configure");
        setPreviewResult(null);
      }
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const toggleCustomer = (id: number) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllCustomers = () => {
    if (customers) setSelectedCustomerIds(new Set(customers.map((c) => c.id)));
  };

  const buildPayload = (dryRun: boolean) => {
    const selectedFacility = facilities?.find((f) => f.id === selectedFacilityId);
    return {
      configId,
      facilityId: selectedFacilityId!,
      facilityName: selectedFacility?.name,
      locationPrefix: locationPrefix.trim(),
      customers: (customers ?? []).filter((c) => selectedCustomerIds.has(c.id)).map((c) => ({
        customerId: c.id,
        customerName: c.name,
      })),
      dryRun,
    };
  };

  const handlePreview = () => {
    if (!selectedFacilityId) { toast.error("Select a facility first"); return; }
    if (!locationPrefix.trim()) { toast.error("Enter a location prefix"); return; }
    if (selectedCustomerIds.size === 0) { toast.error("Select at least one customer"); return; }
    seedMutation.mutate(buildPayload(true));
  };

  const handleConfirm = () => seedMutation.mutate(buildPayload(false));

  const handleClose = () => {
    onClose();
    setStep("configure");
    setPreviewResult(null);
    setSelectedFacilityId(null);
    setSelectedCustomerIds(new Set());
    setLocationPrefix("HR");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Bulk Add Pick Face Locations
          </DialogTitle>
        </DialogHeader>

        {step === "configure" && (
          <div className="space-y-5 py-2">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md text-xs text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-semibold">What are pick face locations?</p>
              <p>
                Pick face locations are forward-pick slots where inventory is replenished from bulk storage.
                Enter a prefix (e.g. <code>HR</code>) and Genius will find all matching Extensiv locations
                (HR001, HR002 … HR400) and register them as pick face locations for the selected clients.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">1. Select Facility</Label>
              {facilitiesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading facilities...
                </div>
              ) : (
                <Select
                  value={selectedFacilityId ? String(selectedFacilityId) : ""}
                  onValueChange={(v) => { setSelectedFacilityId(Number(v)); setSelectedCustomerIds(new Set()); }}
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

            <div className="space-y-2">
              <Label className="text-sm font-semibold">2. Location Name Prefix</Label>
              <p className="text-xs text-muted-foreground">
                All Extensiv locations whose name starts with this prefix will be added as pick face locations.
                Example: <code>HR</code> matches HR001, HR002 … HR400.
              </p>
              <Input
                placeholder="e.g. HR"
                value={locationPrefix}
                onChange={(e) => setLocationPrefix(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {selectedFacilityId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">3. Select Clients</Label>
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={selectAllCustomers}
                  >
                    Select all
                  </button>
                </div>
                {customersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading clients...
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {(customers ?? []).map((c) => (
                      <label key={c.id} className="flex items-center gap-3 cursor-pointer select-none rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          checked={selectedCustomerIds.has(c.id)}
                          onChange={() => toggleCustomer(c.id)}
                        />
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">ID: {c.id}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                A <strong>dry run preview</strong> runs first — you'll see exactly which locations will be saved before anything is committed.
              </span>
            </div>
          </div>
        )}

        {step === "preview" && previewResult && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{previewResult.matchedLocations}</p>
                <p className="text-xs text-muted-foreground">Locations matched</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{previewResult.customers}</p>
                <p className="text-xs text-muted-foreground">Clients</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{previewResult.seeded}</p>
                <p className="text-xs text-muted-foreground">Entries to save</p>
              </div>
            </div>

            {previewResult.matchedLocations === 0 ? (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md text-xs text-red-800 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>No locations found matching prefix "{locationPrefix}". Check the prefix and try again.</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Showing first {Math.min(30, previewResult.seeded)} of {previewResult.seeded} entries:</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {previewResult.preview.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span className="font-medium w-20 shrink-0">{item.customerName}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{item.locationName}</span>
                      <span className="text-muted-foreground ml-auto">(ID: {item.locationId})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "configure" && (
            <Button
              onClick={handlePreview}
              disabled={!selectedFacilityId || !locationPrefix.trim() || selectedCustomerIds.size === 0 || seedMutation.isPending}
            >
              {seedMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching...</> : "Preview →"}
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("configure")}>← Back</Button>
              {previewResult && previewResult.matchedLocations > 0 && (
                <Button
                  onClick={handleConfirm}
                  disabled={seedMutation.isPending}
                >
                  {seedMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                    : `Save ${previewResult.seeded} Pick Face Location${previewResult.seeded !== 1 ? "s" : ""}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Auto-Populate Dialog ─────────────────────────────────────────────────────
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
        toast.success(`Seeded ${data.seeded} staging location${data.seeded !== 1 ? "s" : ""} successfully!`);
        onSuccess();
        onClose();
      }
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const initMappings = (customerList: Array<{ id: number; name: string }>) => {
    setMappings(
      customerList.map((c) => ({
        customerId: c.id,
        customerName: c.name,
        stagingPrefix: "",
      }))
    );
  };

  const handleFacilitySelect = (facilityId: number) => {
    setSelectedFacilityId(facilityId);
    setMappings([]);
    setPreviewResult(null);
    setStep("configure");
  };

  const updateMapping = (customerId: number, prefix: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.customerId === customerId ? { ...m, stagingPrefix: prefix } : m))
    );
  };

  const buildPayload = (dryRun: boolean) => {
    const selectedFacility = facilities?.find((f) => f.id === selectedFacilityId);
    return {
      configId,
      facilityId: selectedFacilityId!,
      facilityName: selectedFacility?.name,
      customerMappings: mappings
        .filter((m) => m.stagingPrefix.trim())
        .map((m) => ({
          customerId: m.customerId,
          customerName: m.customerName,
          stagingPrefixes: m.stagingPrefix
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
    if (payload.customerMappings.length === 0) { toast.error("Enter at least one staging prefix"); return; }
    seedMutation.mutate(payload);
  };

  const handleConfirm = () => {
    seedMutation.mutate(buildPayload(false));
  };

  if (customers && mappings.length === 0 && customers.length > 0) {
    initMappings(customers);
  }

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
              <p>
                Staging is a temporary holding area. During allocation, inventory moves from warehouse and pick face locations
                into staging. Once the order is packed and shipped, staging is empty again.
                Each client has one staging location in Extensiv (e.g. <code>HR-Stage</code>, <code>ONCO-Staging</code>, <code>BOBA-staging</code>).
              </p>
            </div>

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

            {selectedFacilityId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">2. Staging Location Prefix per Client</Label>
                <p className="text-xs text-muted-foreground">
                  Enter the prefix that identifies each client's staging location in Extensiv.
                  The app will find any location ending in <code>-Stage</code> or <code>-Staging</code> (case-insensitive) that starts with this prefix.
                  For example, prefix <code>ONCO</code> matches <code>ONCO-Staging</code>; prefix <code>HR</code> matches <code>HR-Stage</code>.
                  Leave blank to skip a client.
                </p>
                {customersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading clients...
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {mappings.map((m) => (
                      <div key={m.customerId} className="flex items-center gap-3">
                        <div className="w-44 shrink-0">
                          <p className="text-sm font-medium truncate">{m.customerName}</p>
                          <p className="text-xs text-muted-foreground">ID: {m.customerId}</p>
                        </div>
                        <Input
                          placeholder="e.g. HR  or  BIG"
                          value={m.stagingPrefix}
                          onChange={(e) => updateMapping(m.customerId, e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md text-xs text-blue-800 dark:text-blue-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                A <strong>dry run preview</strong> runs first — you'll see exactly which staging locations will be saved before anything is committed.
              </span>
            </div>
          </div>
        )}

        {step === "preview" && previewResult && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{previewResult.totalLocations}</p>
                <p className="text-xs text-muted-foreground">Total Extensiv Locations</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{previewResult.seeded}</p>
                <p className="text-xs text-muted-foreground">Staging locations found</p>
              </div>
            </div>

            {previewResult.seeded === 0 ? (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md text-xs text-red-800 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>No staging locations found. Check your prefixes and try again.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {previewResult.preview.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <span className="font-medium">{item.customerName}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{item.locationName}</span>
                    <span className="text-muted-foreground">(ID: {item.locationId})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "configure" && (
            <Button
              onClick={handlePreview}
              disabled={!selectedFacilityId || seedMutation.isPending}
            >
              {seedMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching...</> : "Preview →"}
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("configure")}>← Back</Button>
              {previewResult && previewResult.seeded > 0 && (
                <Button
                  onClick={handleConfirm}
                  disabled={seedMutation.isPending}
                >
                  {seedMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                    : `Save ${previewResult.seeded} Staging Location${previewResult.seeded !== 1 ? "s" : ""}`}
                </Button>
              )}
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
  const bulkDeleteMutation = trpc.locations.bulkDelete.useMutation({
    onSuccess: (res) => {
      utils.locations.list.invalidate();
      toast.success(`Deleted ${res.deleted} location${res.deleted !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleActiveMutation = trpc.locations.toggleActive.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
    onError: (e) => toast.error(`Toggle failed: ${e.message}`),
  });
  const saveRuleMutation = trpc.customerRules.save.useMutation({
    onSuccess: () => { utils.customerRules.list.invalidate(); toast.success("Rule saved"); },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [autoPopulateOpen, setAutoPopulateOpen] = useState(false);
  const [bulkPickFaceOpen, setBulkPickFaceOpen] = useState(false);
  const [form, setForm] = useState<Partial<LocationForm>>({});
  // Multi-select state: set of location IDs
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const openNew = () => {
    if (!selectedConfigId) { toast.error("Select a configuration first"); return; }
    setForm({ configId: selectedConfigId, locationType: "staging" });
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

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected location${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
  };

  // Group locations by customer
  const grouped = (locations ?? []).reduce<Record<string, typeof locations>>((acc, loc) => {
    const key = `${loc.customerId}:${loc.customerName ?? loc.customerId}`;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(loc);
    return acc;
  }, {});

  const allLocIds = (locations ?? []).map((l) => l.id);
  const allSelected = allLocIds.length > 0 && allLocIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  return (
    <>
      <div className="p-7 space-y-6 max-w-4xl page-enter">
        <div className="flex items-center justify-between">
          <div>
            <p className="page-breadcrumb">Configuration</p>
            <h1 className="page-title">Location Config</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure the staging location for each client — the temporary holding area where inventory moves during order fulfillment
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedConfigId && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setBulkPickFaceOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Layers className="h-4 w-4" /> Bulk Add Pick Face
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAutoPopulateOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" /> Auto-Detect Staging
                </Button>
              </>
            )}
            <Button onClick={openNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Manually
            </Button>
          </div>
        </div>

        {/* Config selector */}
        <div className="bg-card border border-border rounded-2xl px-5 py-4">
          <div className="flex items-center gap-4">
            <Label className="shrink-0">Warehouse:</Label>
            <Select
              value={selectedConfigId ? String(selectedConfigId) : ""}
              onValueChange={(v) => { setSelectedConfigId(Number(v)); setSelectedIds(new Set()); }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a warehouse..." />
              </SelectTrigger>
              <SelectContent>
                {(configs ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* How staging works */}
        <div className="rounded-2xl border px-5 py-4" style={{ background: "#f5f3ff", borderColor: "#ddd6fe" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "#5b21b6" }}>How Staging Works</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            During allocation, inventory moves from <strong>warehouse locations</strong> and <strong>pick face locations</strong> into
            the client's <strong>staging area</strong>. Once the order is packed and shipped, staging is empty again.
            Each client needs exactly one staging location configured here — this is the Extensiv location ID that
            the allocation engine will move inventory into.
          </p>
        </div>

        {!selectedConfigId ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Select a configuration above to view and manage staging locations.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-10 text-center">
            <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No staging locations configured yet.</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => setAutoPopulateOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Auto-Detect from Extensiv
              </Button>
              <Button variant="outline" size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Manually
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Bulk action toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(allLocIds));
                      }
                    }}
                  />
                  {someSelected ? `${selectedIds.size} selected` : "Select all"}
                </label>
              </div>
              {someSelected && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                >
                  {bulkDeleteMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Delete {selectedIds.size} location{selectedIds.size !== 1 ? "s" : ""}
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {Object.entries(grouped).map(([key, locs]) => {
                const [customerIdStr, customerName] = key.split(":");
                const customerId = Number(customerIdStr);
                const rule = (customerRulesList ?? []).find((r) => r.customerId === customerId);
                const noLotMixing = rule?.noLotMixing ?? false;

                return (
                  <div key={key} className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] font-bold">
                          {customerName}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(ID: {customerIdStr})</span>
                        </span>
                        {/* Lot Mixing Rule Toggle */}
                        <div className="flex items-center gap-2 text-sm">
                          <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">No Lot Mixing</span>
                          <Switch
                            checked={noLotMixing}
                            onCheckedChange={(checked) => {
                              if (!selectedConfigId) return;
                              saveRuleMutation.mutate({
                                configId: selectedConfigId,
                                customerId,
                                customerName: customerName ?? undefined,
                                noLotMixing: checked,
                                autoRun: rule?.autoRun ?? false,
                                locationPriorityPatterns: (rule?.locationPriorityPatterns as Array<{ pattern: string; label: string }> | null) ?? [],
                                locationExclusionPatterns: (rule?.locationExclusionPatterns as Array<{ pattern: string; label: string }> | null) ?? [],
                                minShelfLifeDays: rule?.minShelfLifeDays ?? null,
                                notes: rule?.notes ?? null,
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
                    </div>
                    <div className="divide-y divide-border">
                      {(locs ?? []).map((loc) => (
                        <div
                          key={loc.id}
                          className={`px-5 py-3 flex items-center justify-between transition-colors ${
                            selectedIds.has(loc.id) ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Row checkbox */}
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
                              checked={selectedIds.has(loc.id)}
                              onChange={() => toggleSelect(loc.id)}
                            />
                            <span
                              className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold"
                              style={
                                loc.locationType === "staging"
                                  ? { background: "#ede9fe", color: "#6d28d9" }
                                  : loc.locationType === "pick_face"
                                  ? { background: "#dbeafe", color: "#1d4ed8" }
                                  : { background: "#ffedd5", color: "#c2410c" }
                              }
                            >
                              {locTypeLabel[loc.locationType]}
                            </span>
                            <div>
                              <p className="text-sm font-medium">{loc.locationName}</p>
                              <p className="text-xs text-muted-foreground">
                                Location ID: {loc.locationId} · Facility: {loc.facilityName ?? loc.facilityId}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={!!loc.isActive}
                              onCheckedChange={(checked) =>
                                toggleActiveMutation.mutate({ id: loc.id, isActive: checked })
                              }
                              title={!!loc.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
                            />
                            <Button variant="ghost" size="sm" onClick={() => openEdit(loc)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this location?")) deleteMutation.mutate({ id: loc.id });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Bulk Pick Face Dialog */}
      {selectedConfigId && (
        <BulkPickFaceDialog
          open={bulkPickFaceOpen}
          onClose={() => setBulkPickFaceOpen(false)}
          configId={selectedConfigId}
          onSuccess={() => utils.locations.list.invalidate()}
        />
      )}

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
            <p className="text-xs text-muted-foreground">
              Enter the Extensiv location ID for this client's staging area. You can find the location ID in Extensiv under
              Properties → Facilities → Locations.
            </p>
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
                <Input type="number" placeholder="e.g. 3" value={form.facilityId ?? ""} onChange={(e) => setForm({ ...form, facilityId: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Facility Name</Label>
                <Input placeholder="e.g. RENO - Reno" value={form.facilityName ?? ""} onChange={(e) => setForm({ ...form, facilityName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location ID</Label>
                <Input type="number" placeholder="Extensiv location ID" value={form.locationId ?? ""} onChange={(e) => setForm({ ...form, locationId: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Location Name</Label>
                <Input placeholder="e.g. HR-Stage" value={form.locationName ?? ""} onChange={(e) => setForm({ ...form, locationName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location Type</Label>
              <Select value={form.locationType ?? "staging"} onValueChange={(v) => setForm({ ...form, locationType: v as LocationType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staging">Staging (temporary holding area)</SelectItem>
                  <SelectItem value="pick_face">Pick Face (dedicated pick area)</SelectItem>
                  <SelectItem value="warehouse">Warehouse (bulk storage)</SelectItem>
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
    </>
  );
}
