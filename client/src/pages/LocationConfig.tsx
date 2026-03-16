import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
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

const locTypeBadge: Record<LocationType, string> = {
  staging: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  pick_face: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  warehouse: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function LocationConfig() {
  const utils = trpc.useUtils();
  const { data: configs } = trpc.config.list.useQuery();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const { data: locations, isLoading } = trpc.locations.list.useQuery(
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

  const [open, setOpen] = useState(false);
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
          <Button onClick={openNew} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Location
          </Button>
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
              <Button variant="outline" size="sm" className="mt-3" onClick={openNew}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add First Location
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([key, locs]) => {
              const [customerId, customerName] = key.split(":");
              return (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Customer: <span className="text-foreground">{customerName}</span>
                      <span className="ml-2 text-xs">(ID: {customerId})</span>
                    </CardTitle>
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
