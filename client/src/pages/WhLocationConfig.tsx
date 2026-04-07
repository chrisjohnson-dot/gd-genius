import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Trash2,
  Save,
  Loader2,
  Info,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AisleRule = {
  prefix: string;       // e.g. "A", "B", "HR"
  description: string;  // e.g. "Main floor aisle A"
  levels: string[];     // e.g. ["A", "B", "C"] or ["1", "2", "3"]
};

type WhConfig = {
  facilityId: number;
  facilityName: string;
  locationFormat: string;   // e.g. "AISLE-SLOT-LEVEL" or "AISLE-SLOT"
  aisleRules: AisleRule[];
  notes: string;
};

const FORMAT_OPTIONS = [
  { value: "AISLE-SLOT-LEVEL", label: "AISLE-SLOT-LEVEL  (e.g. D-017-C)" },
  { value: "AISLE-SLOT",       label: "AISLE-SLOT  (e.g. A-001)" },
  { value: "ZONE-AISLE-SLOT",  label: "ZONE-AISLE-SLOT  (e.g. WH1-D-017)" },
  { value: "CUSTOM",           label: "Custom / Other" },
];

export default function WhLocationConfig() {
  const configQuery = trpc.config.list.useQuery();
  const selectedConfigId = (configQuery.data ?? [])[0]?.id ?? null;

  const facilitiesQuery = trpc.extensiv.facilities.useQuery(
    { configId: selectedConfigId! },
    { enabled: !!selectedConfigId }
  );
  const facilities = facilitiesQuery.data ?? [];

  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [configs, setConfigs] = useState<Record<number, WhConfig>>({});
  const [expandedFacility, setExpandedFacility] = useState<number | null>(null);

  function getConfig(facilityId: number, facilityName: string): WhConfig {
    return configs[facilityId] ?? {
      facilityId,
      facilityName,
      locationFormat: "AISLE-SLOT-LEVEL",
      aisleRules: [],
      notes: "",
    };
  }

  function updateConfig(facilityId: number, facilityName: string, update: Partial<WhConfig>) {
    setConfigs((prev) => ({
      ...prev,
      [facilityId]: { ...getConfig(facilityId, facilityName), ...update },
    }));
  }

  function addAisleRule(facilityId: number, facilityName: string) {
    const cfg = getConfig(facilityId, facilityName);
    updateConfig(facilityId, facilityName, {
      aisleRules: [...cfg.aisleRules, { prefix: "", description: "", levels: [] }],
    });
  }

  function updateAisleRule(facilityId: number, facilityName: string, idx: number, rule: Partial<AisleRule>) {
    const cfg = getConfig(facilityId, facilityName);
    const updated = cfg.aisleRules.map((r, i) => i === idx ? { ...r, ...rule } : r);
    updateConfig(facilityId, facilityName, { aisleRules: updated });
  }

  function removeAisleRule(facilityId: number, facilityName: string, idx: number) {
    const cfg = getConfig(facilityId, facilityName);
    updateConfig(facilityId, facilityName, { aisleRules: cfg.aisleRules.filter((_, i) => i !== idx) });
  }

  function handleSave(facilityId: number, facilityName: string) {
    const cfg = getConfig(facilityId, facilityName);
    // Persist to localStorage as a simple local config store
    const stored = JSON.parse(localStorage.getItem("wh_location_configs") ?? "{}");
    stored[facilityId] = cfg;
    localStorage.setItem("wh_location_configs", JSON.stringify(stored));
    toast.success(`WH Location Config saved for ${facilityName}`);
  }

  // Load from localStorage on mount
  useState(() => {
    const stored = JSON.parse(localStorage.getItem("wh_location_configs") ?? "{}");
    if (Object.keys(stored).length > 0) {
      setConfigs(stored);
    }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="page-breadcrumb">Configuration</p>
        <h1 className="page-title">WH Location Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Train the system on how each warehouse's location numbering is structured — aisles, levels, and naming format.
          This information is used by the Put Away Wizard and Location Priority Config to show only relevant aisles and levels.
        </p>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300 space-y-1">
          <p className="font-medium">How to use this page</p>
          <p className="text-xs leading-relaxed">
            Select each warehouse below and define its location format and aisle structure.
            For example, Calgary may use <code className="bg-blue-500/10 px-1 rounded">D-017-C</code> (aisle D, slot 017, level C),
            while Mississauga uses <code className="bg-blue-500/10 px-1 rounded">A-001</code> (aisle A, slot 001).
            Once configured, the Put Away Config will only show aisles and levels relevant to the selected warehouse.
          </p>
        </div>
      </div>

      {/* Facility list */}
      {facilitiesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading warehouses…</div>
      ) : facilities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No warehouses found. Add an Extensiv configuration in Settings first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {facilities.map((facility) => {
            const cfg = getConfig(facility.id, facility.name);
            const isOpen = expandedFacility === facility.id;
            const savedCfg = JSON.parse(localStorage.getItem("wh_location_configs") ?? "{}")[facility.id];
            const isSaved = !!savedCfg;

            return (
              <div key={facility.id} className="border border-border/60 rounded-xl overflow-hidden">
                {/* Facility header */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                  onClick={() => setExpandedFacility(isOpen ? null : facility.id)}
                >
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm flex-1">{facility.name}</span>
                  {isSaved && (
                    <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px]">Configured</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{cfg.locationFormat}</span>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="p-5 space-y-5 border-t border-border/40">
                    {/* Location format */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Location Format</Label>
                      <Select
                        value={cfg.locationFormat}
                        onValueChange={(v) => updateConfig(facility.id, facility.name, { locationFormat: v })}
                      >
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMAT_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Describes how location names are structured in Extensiv for this warehouse.
                      </p>
                    </div>

                    {/* Aisle rules */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Aisles &amp; Levels</Label>
                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => addAisleRule(facility.id, facility.name)}>
                          <Plus className="h-3.5 w-3.5" /> Add Aisle
                        </Button>
                      </div>

                      {cfg.aisleRules.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-xs border border-dashed border-border rounded-lg">
                          No aisles configured. Click "Add Aisle" to define the aisle structure for this warehouse.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {cfg.aisleRules.map((rule, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2 items-start">
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Prefix</Label>
                                <Input
                                  value={rule.prefix}
                                  onChange={(e) => updateAisleRule(facility.id, facility.name, idx, { prefix: e.target.value.toUpperCase() })}
                                  placeholder="e.g. D"
                                  className="h-8 text-xs font-mono"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Description</Label>
                                <Input
                                  value={rule.description}
                                  onChange={(e) => updateAisleRule(facility.id, facility.name, idx, { description: e.target.value })}
                                  placeholder="e.g. Main floor aisle D"
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Levels (comma-separated)</Label>
                                <Input
                                  value={rule.levels.join(", ")}
                                  onChange={(e) => updateAisleRule(facility.id, facility.name, idx, {
                                    levels: e.target.value.split(",").map((l) => l.trim().toUpperCase()).filter(Boolean),
                                  })}
                                  placeholder="e.g. A, B, C"
                                  className="h-8 text-xs font-mono"
                                />
                              </div>
                              <div className="pt-5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  onClick={() => removeAisleRule(facility.id, facility.name, idx)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Notes</Label>
                      <Input
                        value={cfg.notes}
                        onChange={(e) => updateConfig(facility.id, facility.name, { notes: e.target.value })}
                        placeholder="Any additional notes about this warehouse's location structure…"
                        className="text-xs"
                      />
                    </div>

                    {/* Save */}
                    <div className="flex justify-end">
                      <Button className="gap-2" onClick={() => handleSave(facility.id, facility.name)}>
                        <Save className="h-4 w-4" /> Save Config
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
