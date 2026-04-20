import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, Check, ChevronDown, ChevronRight, ChevronsUpDown, Database,
  Download, Eye, FlaskConical, Hash, Info, Loader2, MapPin, Pencil, Plus, Save,
  Search, Trash2,
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


// ── Customer autocomplete combobox ──────────────────────────────────────────
function CustomerCombobox({
  customers,
  value,
  onChange,
}: {
  customers: Array<{ id: number; name: string }>;
  value: number | null;
  onChange: (id: number, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? selected.name : <span className="text-muted-foreground">Type to search customers…</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search customers…" autoFocus />
          <CommandList>
            <CommandEmpty>No customers found.</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(c.id, c.name);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function LocationAssignmentsTab() {
  const utils = trpc.useUtils();
  const { data: configs } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<LocationForm>>({});
  const [testConfigId, setTestConfigId] = useState<number | null>(null);
  const [testFacilityId, setTestFacilityId] = useState<number | null>(null);
  const [runTest, setRunTest] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // Lookup state: trigger a lookup when user clicks "Look up in Extensiv"
  const [lookupTrigger, setLookupTrigger] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupResults, setLookupResults] = useState<Array<{ locationId: number; locationName: string }> | null>(null);
  // Multi-select: map locationId → chosen type (undefined = not selected)
  const [selectedRows, setSelectedRows] = useState<Record<number, LocationType>>({});

  const activeConfigId = selectedConfigId ?? configs?.[0]?.id ?? null;

  const { data: facilities } = trpc.extensiv.facilities.useQuery(
    { configId: activeConfigId! }, { enabled: !!activeConfigId }
  );
  const activeFacilityId = selectedFacilityId ?? facilities?.[0]?.id ?? null;

  // Customers for the active facility — used to populate the customer dropdown
  const { data: facilityCustomers } = trpc.extensiv.customersForFacility.useQuery(
    { configId: activeConfigId!, facilityId: activeFacilityId! },
    { enabled: !!activeConfigId && !!activeFacilityId }
  );

  const { data: locations, isLoading } = trpc.locations.list.useQuery(
    { configId: activeConfigId!, facilityId: activeFacilityId ?? undefined },
    { enabled: !!activeConfigId && !!activeFacilityId }
  );
  const { data: extLocations } = trpc.extensiv.locations.useQuery(
    { configId: testConfigId!, facilityId: testFacilityId! },
    { enabled: !!testConfigId && !!testFacilityId && runTest }
  ) as { data?: Array<{ id: number; name: string }> };

  // Extensiv location lookup — fires when user clicks "Look up in Extensiv"
  const lookupEnabled =
    lookupTrigger &&
    !!activeConfigId &&
    !!activeFacilityId &&
    !!editForm.locationName?.trim();
  const { data: lookupResult, isFetching: lookupFetching, error: lookupError } =
    trpc.extensiv.lookupLocation.useQuery(
      { configId: activeConfigId!, facilityId: activeFacilityId!, locationName: editForm.locationName ?? "" },
      {
        enabled: lookupEnabled,
        retry: false,
      }
    );

  // When lookup resolves, store results list for user to pick from
  useEffect(() => {
    if (!lookupTrigger || lookupFetching || lookupDone) return;
    if (lookupError) {
      toast.error("Extensiv lookup failed — please try again");
      setLookupTrigger(false);
      return;
    }
    if (lookupResult === undefined) return; // still loading
    setLookupTrigger(false);
    if (!lookupResult || lookupResult.length === 0) {
      toast.warning(`No locations matching "${editForm.locationName}" found in Extensiv`);
      setLookupResults([]);
      return;
    }
    if (lookupResult.length === 1) {
      // Auto-select if only one match
      setEditForm((prev) => ({ ...prev, locationId: lookupResult[0].locationId, locationName: lookupResult[0].locationName }));
      toast.success("Location confirmed");
      setLookupDone(true);
      setLookupResults(null);
    } else {
      // Show list for user to pick
      setLookupResults(lookupResult);
    }
  }, [lookupTrigger, lookupFetching, lookupDone, lookupResult, lookupError, editForm.locationName]);

  const saveMutation = trpc.locations.save.useMutation({
    onSuccess: () => { utils.locations.list.invalidate(); toast.success("Location saved"); setEditOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const saveManyMutation = trpc.locations.save.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const handleSaveSelected = async () => {
    const entries = Object.entries(selectedRows) as [string, LocationType][];
    if (entries.length === 0) { toast.error("Select at least one location"); return; }
    if (!editForm.customerId || !editForm.configId || !editForm.facilityId) {
      toast.error("Customer is required"); return;
    }
    let saved = 0;
    for (const [locIdStr, locType] of entries) {
      const locId = Number(locIdStr);
      const locName = lookupResults?.find((r) => r.locationId === locId)?.locationName ?? "";
      await saveManyMutation.mutateAsync({
        configId: editForm.configId,
        facilityId: editForm.facilityId,
        customerId: editForm.customerId,
        customerName: editForm.customerName,
        locationId: locId,
        locationName: locName,
        locationType: locType,
      });
      saved++;
    }
    utils.locations.list.invalidate();
    toast.success(`${saved} location${saved !== 1 ? "s" : ""} saved`);
    setEditOpen(false);
  };
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
    setLookupTrigger(false);
    setLookupDone(false);
    setLookupResults(null);
    setSelectedRows({});
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
      toast.error("Customer, location name, and location type are required. Use \"Look up in Extensiv\" to fill IDs automatically.");
      return;
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
            {(() => {
              // Build a set of customer names that have a pick_face configured
              const customersWithPickFace = new Set(
                (displayedLocations as Array<{ id: number; locationName: string; customerName: string; locationType: LocationType; isActive?: boolean }>)
                  .filter((l) => l.locationType === "pick_face" && l.isActive !== false)
                  .map((l) => l.customerName)
              );
              return (displayedLocations as Array<{ id: number; locationName: string; customerName: string; locationType: LocationType; isActive?: boolean }>).map((l) => {
              const missingPickFace = l.locationType === "staging" && !customersWithPickFace.has(l.customerName);
              return (
                <div key={l.id} className={`flex items-center gap-3 p-3 rounded-xl border ${l.isActive === false ? "opacity-50" : ""}`}>
                  <Badge className={`${locTypeBadge[l.locationType]} text-xs shrink-0`}>{locTypeLabel[l.locationType]}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.locationName}</p>
                    <p className="text-xs text-muted-foreground">{l.customerName}</p>
                  </div>
                  {missingPickFace && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 shrink-0 font-medium">No pick face</span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={l.isActive !== false} onCheckedChange={() => toggleMutation?.mutate({ id: l.id })} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l as Parameters<typeof openEdit>[0])}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Remove this location?")) deleteMutation.mutate({ id: l.id }); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            });
            })()}
          </div>
        )}
      </div>

      {/* Add / Edit Location dialog — simplified: Customer autocomplete + Location Name + Type + Extensiv lookup */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setLookupTrigger(false); setLookupDone(false); setLookupResults(null); } setEditOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editForm.id ? "Edit Location" : "Add Location"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {/* ── Customer autocomplete ── */}
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <CustomerCombobox
                customers={(facilityCustomers ?? []).sort((a, b) => a.name.localeCompare(b.name))}
                value={editForm.customerId ?? null}
                onChange={(id, name) => setEditForm((f) => ({ ...f, customerId: id, customerName: name }))}
              />
            </div>

            {/* ── Location Name + Look up button ── */}
            <div className="space-y-1.5">
              <Label>Location Name</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. K18-"
                  value={editForm.locationName ?? ""}
                  onChange={(e) => {
                    setEditForm((f) => ({ ...f, locationName: e.target.value, locationId: undefined }));
                    setLookupDone(false);
                    setLookupResults(null);
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!editForm.locationName?.trim() || lookupFetching}
                  onClick={() => { setLookupDone(false); setLookupResults(null); setLookupTrigger(true); }}
                  title="Search Extensiv for locations matching this name"
                >
                  {lookupFetching
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : lookupDone
                      ? <Check className="h-3.5 w-3.5 text-green-600" />
                      : <Search className="h-3.5 w-3.5" />}
                  <span className="ml-1.5 hidden sm:inline">{lookupDone ? "Found" : "Look up"}</span>
                </Button>
              </div>

              {/* Multi-select results list */}
              {lookupResults && lookupResults.length > 0 && (
                <div className="border rounded-lg overflow-hidden mt-1">
                  <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 border-b">
                    <Checkbox
                      checked={
                        lookupResults.length > 0 &&
                        lookupResults.every((r) => r.locationId in selectedRows)
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const all: Record<number, LocationType> = {};
                          lookupResults.forEach((r) => { all[r.locationId] = selectedRows[r.locationId] ?? "staging"; });
                          setSelectedRows(all);
                        } else {
                          setSelectedRows({});
                        }
                      }}
                      className="shrink-0"
                      aria-label="Select all locations"
                    />
                    <p className="text-xs text-muted-foreground flex-1">
                      {Object.keys(selectedRows).length > 0
                        ? `${Object.keys(selectedRows).length} of ${lookupResults.length} selected`
                        : `${lookupResults.length} location${lookupResults.length !== 1 ? "s" : ""} found — check to add`}
                    </p>
                    {Object.keys(selectedRows).length > 0 && (
                      <button type="button" className="text-[10px] text-muted-foreground hover:underline shrink-0"
                        onClick={() => setSelectedRows({})}>Clear</button>
                    )}
                  </div>
                  <ul className="max-h-56 overflow-y-auto divide-y divide-border">
                    {lookupResults.map((r) => {
                      const isChecked = r.locationId in selectedRows;
                      const rowType = selectedRows[r.locationId] ?? "staging";
                      // Check if this location is already configured for the selected customer
                      const alreadyConfigured = (locations ?? []).some(
                        (l) => (l as { locationId: number; customerId: number }).locationId === r.locationId &&
                               (l as { locationId: number; customerId: number }).customerId === editForm.customerId
                      );
                      const existingEntry = alreadyConfigured
                        ? (locations ?? []).find(
                            (l) => (l as { locationId: number; customerId: number }).locationId === r.locationId &&
                                   (l as { locationId: number; customerId: number }).customerId === editForm.customerId
                          ) as { locationType: LocationType } | undefined
                        : undefined;
                      return (
                        <li
                          key={r.locationId}
                          className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            alreadyConfigured
                              ? "opacity-50 cursor-not-allowed bg-muted/30"
                              : isChecked
                                ? "bg-primary/5"
                                : "hover:bg-accent/40"
                          }`}
                          title={alreadyConfigured ? `Already configured as ${locTypeLabel[existingEntry?.locationType ?? "staging"]}` : undefined}
                        >
                          <Checkbox
                            checked={alreadyConfigured ? true : isChecked}
                            disabled={alreadyConfigured}
                            onCheckedChange={(checked) => {
                              if (alreadyConfigured) return;
                              setSelectedRows((prev) => {
                                const next = { ...prev };
                                if (checked) { next[r.locationId] = "staging"; }
                                else { delete next[r.locationId]; }
                                return next;
                              });
                            }}
                            className="shrink-0"
                          />
                          <span className={`font-medium flex-1 truncate ${alreadyConfigured ? "line-through" : ""}`}>{r.locationName}</span>
                          {alreadyConfigured ? (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded shrink-0">
                              <CheckCircle2 className="h-3 w-3" />
                              {locTypeLabel[existingEntry?.locationType ?? "staging"]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono shrink-0">ID {r.locationId}</span>
                          )}
                          {!alreadyConfigured && isChecked && (
                            <Select
                              value={rowType}
                              onValueChange={(v) => setSelectedRows((prev) => ({ ...prev, [r.locationId]: v as LocationType }))}
                            >
                              <SelectTrigger className="h-6 text-xs w-28 shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="staging">Staging</SelectItem>
                                <SelectItem value="pick_face">Pick Face</SelectItem>
                                <SelectItem value="warehouse">Warehouse</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {Object.keys(selectedRows).length > 0 && (
                    <div className="px-3 py-2 bg-muted/30 border-t text-xs text-muted-foreground">
                      {Object.keys(selectedRows).length} selected
                    </div>
                  )}
                </div>
              )}
              {lookupResults && lookupResults.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">No matching locations found in Extensiv for this facility.</p>
              )}
              {lookupDone && editForm.locationId && (
                <p className="text-xs text-green-600 dark:text-green-400">✓ {editForm.locationName} (ID {editForm.locationId})</p>
              )}
              {!lookupDone && !lookupResults && !editForm.locationId && editForm.locationName && (
                <p className="text-xs text-muted-foreground">Click Look up to search Extensiv for matching locations.</p>
              )}
            </div>

            {/* ── Location Type — hidden when multi-select is active ── */}
            {!lookupResults && (
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
            )}

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            {lookupResults && lookupResults.length > 0 ? (
              <Button
                onClick={handleSaveSelected}
                disabled={saveManyMutation.isPending || Object.keys(selectedRows).length === 0}
              >
                {saveManyMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  : `Save ${Object.keys(selectedRows).length > 0 ? Object.keys(selectedRows).length + " " : ""}Selected`}
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Warehouse Structure  (was WhLocationConfig.tsx)
// ─────────────────────────────────────────────────────────────────────────────

type BayRule = { bayId: string; bayPrefix?: string; sideValues?: string; hasLeftRight: boolean };
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
  const rule = draft.aisleRules[0];
  const aisle = rule?.aislePrefix || "A";
  const bayRule = rule?.bays[0];
  const bayPrefix = bayRule?.bayPrefix ?? "";
  const bay = bayPrefix + (bayRule?.bayId || "001");
  const sideVals = bayRule?.sideValues?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const side = sideVals[0] ?? (bayRule?.hasLeftRight ? "L" : "");
  const level = rule?.levels[0] || "C";
  if (fmt === "AISLE-BAY-LEVEL") return `${aisle}-${bay}-${level}`;
  if (fmt === "AISLE-BAY") return `${aisle}-${bay}`;
  if (fmt === "AISLE-BAY-LR-LEVEL") return `${aisle}-${bay}-${side || "L"}-${level}`;
  if (fmt === "ZONE-AISLE-BAY") return `WH1-${aisle}-${bay}`;
  return `${aisle}-${bay}-${level}`;
}

/** Parse an example location string and return partial draft fields */
function parseExampleLocation(example: string, fmt: string): Partial<{ aislePrefix: string; bayPrefix: string; bayId: string; sideValues: string; levels: string[] }> {
  const parts = example.split("-");
  if (parts.length < 2) return {};
  if (fmt === "AISLE-BAY-LEVEL" && parts.length >= 3) {
    return { aislePrefix: parts[0], bayId: parts[1], levels: [parts[2]] };
  }
  if (fmt === "AISLE-BAY" && parts.length >= 2) {
    return { aislePrefix: parts[0], bayId: parts[1] };
  }
  if (fmt === "AISLE-BAY-LR-LEVEL" && parts.length >= 4) {
    return { aislePrefix: parts[0], bayId: parts[1], sideValues: parts[2], levels: [parts[3]] };
  }
  if (fmt === "ZONE-AISLE-BAY" && parts.length >= 3) {
    return { aislePrefix: parts[1], bayId: parts[2] };
  }
  // Generic: first part = aisle, last part = level if 3+, middle = bay
  if (parts.length >= 3) return { aislePrefix: parts[0], bayId: parts[1], levels: [parts[parts.length - 1]] };
  return { aislePrefix: parts[0], bayId: parts[1] };
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
  const [exampleInputs, setExampleInputs] = useState<Record<number, string>>({});
  // Bay range dialog state
  const [bayRangeDialog, setBayRangeDialog] = useState<{ facilityId: number; aisleIdx: number } | null>(null);
  const [bayRangeInput, setBayRangeInput] = useState("");
  const [bayRangePrefix, setBayRangePrefix] = useState("");
  const [bayRangeSides, setBayRangeSides] = useState("");
  // Extensiv import state
  const [importing, setImporting] = useState<Record<number, boolean>>({});

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

  /** Expand a levels string: "A-E" → ["A","B","C","D","E"], "A,B,C" → ["A","B","C"] */
  function expandLevels(raw: string): string[] {
    const rangeMatch = raw.trim().match(/^([A-Za-z0-9])-([A-Za-z0-9])$/);
    if (rangeMatch) {
      const start = rangeMatch[1], end = rangeMatch[2];
      const startCode = start.charCodeAt(0), endCode = end.charCodeAt(0);
      if (startCode <= endCode) {
        return Array.from({ length: endCode - startCode + 1 }, (_, i) => String.fromCharCode(startCode + i));
      }
    }
    return raw.split(",").map((l) => l.trim()).filter(Boolean);
  }

  /** Generate bay IDs from a range string like "001-050" or "1-50" */
  function expandBayRange(rangeStr: string): string[] {
    const m = rangeStr.trim().match(/^(\d+)[-–](\d+)$/);
    if (!m) return [];
    const start = parseInt(m[1], 10), end = parseInt(m[2], 10);
    if (isNaN(start) || isNaN(end) || start > end || end - start > 999) return [];
    const pad = m[1].length; // preserve leading zeros from start
    return Array.from({ length: end - start + 1 }, (_, i) => String(start + i).padStart(pad, "0"));
  }

  /** Parse Extensiv location names into AisleRule[] */
  function parseExtensivLocations(names: string[], fmt: string): AisleRule[] {
    const aisleMap = new Map<string, { bays: Map<string, Set<string>>; levels: Set<string> }>();
    for (const name of names) {
      const parts = name.split("-");
      if (parts.length < 2) continue;
      const aisle = parts[0];
      const bay = parts[1] ?? "";
      const level = fmt === "AISLE-BAY-LR-LEVEL" ? (parts[3] ?? "") : (parts[2] ?? "");
      const side = fmt === "AISLE-BAY-LR-LEVEL" ? (parts[2] ?? "") : "";
      if (!aisleMap.has(aisle)) aisleMap.set(aisle, { bays: new Map(), levels: new Set() });
      const aisleEntry = aisleMap.get(aisle)!;
      if (!aisleEntry.bays.has(bay)) aisleEntry.bays.set(bay, new Set());
      if (side) aisleEntry.bays.get(bay)!.add(side);
      if (level) aisleEntry.levels.add(level);
    }
    return Array.from(aisleMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([aislePrefix, data]) => ({
      aislePrefix,
      description: "",
      levels: Array.from(data.levels).sort(),
      bays: Array.from(data.bays.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([bayId, sides]) => ({
        bayId,
        bayPrefix: "",
        sideValues: Array.from(sides).sort().join(","),
        hasLeftRight: sides.size > 0,
      })),
    }));
  }

  function getDraft(fid: number): LocalDraft { return drafts[fid] ?? DEFAULT_DRAFT; }
  function updateDraft(fid: number, u: Partial<LocalDraft>) { setDrafts((p) => ({ ...p, [fid]: { ...getDraft(fid), ...u } })); }
  function addAisleRule(fid: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: [...d.aisleRules, { aislePrefix: "", description: "", bays: [], levels: [] }] }); }
  function updateAisleRule(fid: number, idx: number, rule: Partial<AisleRule>) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === idx ? { ...r, ...rule } : r) }); }
  function removeAisleRule(fid: number, idx: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.filter((_, i) => i !== idx) }); }
  function addBay(fid: number, ai: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === ai ? { ...r, bays: [...r.bays, { bayId: "", bayPrefix: "", sideValues: "", hasLeftRight: false }] } : r) }); }
  function updateBay(fid: number, ai: number, bi: number, u: Partial<BayRule>) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === ai ? { ...r, bays: r.bays.map((b, j) => j === bi ? { ...b, ...u } : b) } : r) }); }
  function removeBay(fid: number, ai: number, bi: number) { const d = getDraft(fid); updateDraft(fid, { aisleRules: d.aisleRules.map((r, i) => i === ai ? { ...r, bays: r.bays.filter((_, j) => j !== bi) } : r) }); }

  async function handleImportFromExtensiv(fid: number, fname: string) {
    if (!selectedConfigId) return;
    setImporting((s) => ({ ...s, [fid]: true }));
    try {
      const locs = await utils.extensiv.locations.fetch({ configId: selectedConfigId, facilityId: fid });
      if (!locs || locs.length === 0) { toast.warning("No locations found in Extensiv for this facility"); return; }
      const fmt = getDraft(fid).locationFormat;
      const names = locs.map((l: { name?: string; locationName?: string }) => (l.name ?? l.locationName ?? "")).filter(Boolean);
      const aisleRules = parseExtensivLocations(names, fmt);
      updateDraft(fid, { aisleRules });
      toast.success(`Imported ${aisleRules.length} aisle${aisleRules.length !== 1 ? "s" : ""} from Extensiv (${names.length} locations)`);
    } catch { toast.error("Failed to import from Extensiv"); }
    finally { setImporting((s) => ({ ...s, [fid]: false })); }
  }

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
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground mb-1">Example location</p>
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-7 text-sm font-mono bg-background/60 border-primary/30 flex-1 max-w-[200px]"
                            placeholder={exampleLocation}
                            value={exampleInputs[facility.id] ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExampleInputs((p) => ({ ...p, [facility.id]: val }));
                              if (val.includes("-")) {
                                const parsed = parseExampleLocation(val, draft.locationFormat);
                                if (parsed.aislePrefix || parsed.bayId) {
                                  const d = getDraft(facility.id);
                                  const existingAisle = d.aisleRules[0] ?? { aislePrefix: "", bays: [], levels: [] };
                                  const existingBay = existingAisle.bays[0] ?? { bayId: "", bayPrefix: "", sideValues: "", hasLeftRight: false };
                                  const updatedBay: BayRule = { ...existingBay, ...(parsed.bayId ? { bayId: parsed.bayId } : {}), ...(parsed.bayPrefix ? { bayPrefix: parsed.bayPrefix } : {}), ...(parsed.sideValues ? { sideValues: parsed.sideValues } : {}) };
                                  const updatedAisle: AisleRule = { ...existingAisle, ...(parsed.aislePrefix ? { aislePrefix: parsed.aislePrefix } : {}), ...(parsed.levels ? { levels: parsed.levels } : {}), bays: [updatedBay, ...existingAisle.bays.slice(1)] };
                                  updateDraft(facility.id, { aisleRules: [updatedAisle, ...d.aisleRules.slice(1)] });
                                }
                              }
                            }}
                          />
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-sm font-mono text-primary">{exampleLocation}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Type a real location (e.g. E-30-50) to auto-fill the fields below</p>
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
                                  <Label className="text-xs">Levels</Label>
                                  <span className="text-[10px] text-muted-foreground">Enter A-E to expand to A,B,C,D,E</span>
                                </div>
                                <Input
                                  placeholder="e.g. A,B,C or A-E"
                                  value={rule.levels.join(",")}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    // Auto-expand range on blur or if user typed a complete X-Y pattern
                                    updateAisleRule(facility.id, ai, { levels: expandLevels(raw) });
                                  }}
                                  onBlur={(e) => updateAisleRule(facility.id, ai, { levels: expandLevels(e.target.value) })}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">Bays</Label>
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => { setBayRangeDialog({ facilityId: facility.id, aisleIdx: ai }); setBayRangeInput(""); setBayRangePrefix(""); setBayRangeSides(""); }}>
                                      <Hash className="h-3 w-3" /> Range
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => addBay(facility.id, ai)}>
                                      <Plus className="h-3 w-3" /> Add Bay
                                    </Button>
                                  </div>
                                </div>
                                {rule.bays.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">No bays yet.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {/* Column headers */}
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-0.5">
                                      <span className="w-14 shrink-0">Prefix</span>
                                      <span className="flex-1">Bay ID</span>
                                      <span className="w-24 shrink-0">Sides (e.g. L,R or 1,2)</span>
                                      <span className="w-7" />
                                    </div>
                                    {rule.bays.map((bay, bi) => (
                                      <div key={bi} className="flex items-center gap-2">
                                        <Input
                                          placeholder="e.g. B"
                                          value={bay.bayPrefix ?? ""}
                                          onChange={(e) => updateBay(facility.id, ai, bi, { bayPrefix: e.target.value })}
                                          className="h-7 text-xs w-14 shrink-0 font-mono"
                                          title="Bay prefix (prepended to bay ID)"
                                        />
                                        <Input
                                          placeholder="e.g. 030"
                                          value={bay.bayId}
                                          onChange={(e) => updateBay(facility.id, ai, bi, { bayId: e.target.value })}
                                          className="h-7 text-xs flex-1 font-mono"
                                        />
                                        <Input
                                          placeholder="L,R or 1,2"
                                          value={bay.sideValues ?? ""}
                                          onChange={(e) => updateBay(facility.id, ai, bi, { sideValues: e.target.value, hasLeftRight: e.target.value.trim().length > 0 })}
                                          className="h-7 text-xs w-24 shrink-0"
                                          title="Comma-separated side values (leave blank if no sides)"
                                        />
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeBay(facility.id, ai, bi)}>
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
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <Button size="sm" className="gap-1.5" onClick={() => handleSave(facility.id, facility.name)} disabled={isSavingNow}>
                        {isSavingNow ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Save className="h-3.5 w-3.5" />Save Config</>}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleImportFromExtensiv(facility.id, facility.name)} disabled={importing[facility.id]}>
                        {importing[facility.id] ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Importing…</> : <><Download className="h-3.5 w-3.5" />Import from Extensiv</>}
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

      {/* Bay Range Dialog */}
      <Dialog open={!!bayRangeDialog} onOpenChange={(open) => { if (!open) setBayRangeDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Bay Range</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Bay Range (e.g. 001-050)</Label>
              <Input placeholder="001-050" value={bayRangeInput} onChange={(e) => setBayRangeInput(e.target.value)} className="font-mono" />
              <p className="text-[10px] text-muted-foreground">{(() => { const ids = expandBayRange(bayRangeInput); return ids.length > 0 ? `Will generate ${ids.length} bays: ${ids.slice(0,3).join(", ")}${ids.length > 3 ? " …" : ""}` : bayRangeInput ? "Enter format: 001-050" : ""; })()}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bay Prefix (optional)</Label>
              <Input placeholder="e.g. B" value={bayRangePrefix} onChange={(e) => setBayRangePrefix(e.target.value)} className="font-mono max-w-[80px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sides (optional, e.g. L,R or 1,2)</Label>
              <Input placeholder="L,R" value={bayRangeSides} onChange={(e) => setBayRangeSides(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBayRangeDialog(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!bayRangeDialog) return;
              const ids = expandBayRange(bayRangeInput);
              if (ids.length === 0) { toast.error("Invalid range — use format 001-050"); return; }
              const newBays: BayRule[] = ids.map((id) => ({ bayId: id, bayPrefix: bayRangePrefix, sideValues: bayRangeSides, hasLeftRight: bayRangeSides.trim().length > 0 }));
              const d = getDraft(bayRangeDialog.facilityId);
              updateDraft(bayRangeDialog.facilityId, { aisleRules: d.aisleRules.map((r, i) => i === bayRangeDialog.aisleIdx ? { ...r, bays: [...r.bays, ...newBays] } : r) });
              toast.success(`Added ${ids.length} bays`);
              setBayRangeDialog(null);
            }}>Add {expandBayRange(bayRangeInput).length > 0 ? `${expandBayRange(bayRangeInput).length} Bays` : "Bays"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
