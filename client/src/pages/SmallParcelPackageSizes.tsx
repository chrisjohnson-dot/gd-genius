import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PackageSize {
  id: number;
  clientId: number;
  clientName: string;
  name: string;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  weightKg: string | null;
  sortOrder: number;
}

// ─── Inline Edit Row ──────────────────────────────────────────────────────────
function EditRow({
  size,
  onSave,
  onCancel,
}: {
  size: PackageSize;
  onSave: (data: Partial<PackageSize>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(size.name);
  const [lengthCm, setLengthCm] = useState(size.lengthCm ?? "");
  const [widthCm, setWidthCm] = useState(size.widthCm ?? "");
  const [heightCm, setHeightCm] = useState(size.heightCm ?? "");
  const [weightKg, setWeightKg] = useState(size.weightKg ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-muted/40 rounded-lg">
      <Input
        className="w-40 h-8 text-sm"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="L (cm)"
        type="number"
        value={lengthCm}
        onChange={(e) => setLengthCm(e.target.value)}
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="W (cm)"
        type="number"
        value={widthCm}
        onChange={(e) => setWidthCm(e.target.value)}
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="H (cm)"
        type="number"
        value={heightCm}
        onChange={(e) => setHeightCm(e.target.value)}
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="Wt (kg)"
        type="number"
        value={weightKg}
        onChange={(e) => setWeightKg(e.target.value)}
      />
      <div className="flex gap-1 ml-auto">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-green-600 hover:text-green-700"
          onClick={() =>
            onSave({
              name: name.trim() || size.name,
              lengthCm: lengthCm || null,
              widthCm: widthCm || null,
              heightCm: heightCm || null,
              weightKg: weightKg || null,
            })
          }
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Add Row ──────────────────────────────────────────────────────────────────
function AddRow({
  clientId,
  clientName,
  onAdded,
}: {
  clientId: number;
  clientName: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");

  const utils = trpc.useUtils();
  const createMutation = trpc.smallParcel.createPackageSize.useMutation({
    onSuccess: () => {
      toast.success("Package size added");
      setName("");
      setLengthCm("");
      setWidthCm("");
      setHeightCm("");
      setWeightKg("");
      setOpen(false);
      utils.smallParcel.listAllPackageSizes.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-3.5 h-3.5" />
        Add size
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <Input
        className="w-40 h-8 text-sm"
        placeholder="Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="L (cm)"
        type="number"
        value={lengthCm}
        onChange={(e) => setLengthCm(e.target.value)}
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="W (cm)"
        type="number"
        value={widthCm}
        onChange={(e) => setWidthCm(e.target.value)}
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="H (cm)"
        type="number"
        value={heightCm}
        onChange={(e) => setHeightCm(e.target.value)}
      />
      <Input
        className="w-20 h-8 text-sm"
        placeholder="Wt (kg)"
        type="number"
        value={weightKg}
        onChange={(e) => setWeightKg(e.target.value)}
      />
      <div className="flex gap-1 ml-auto">
        <Button
          size="sm"
          className="h-8 bg-blue-600 hover:bg-blue-700"
          disabled={!name.trim() || createMutation.status === "pending"}
          onClick={() =>
            createMutation.mutate({
              clientId,
              clientName,
              name: name.trim(),
              lengthCm: lengthCm ? parseFloat(lengthCm) : undefined,
              widthCm: widthCm ? parseFloat(widthCm) : undefined,
              heightCm: heightCm ? parseFloat(heightCm) : undefined,
              weightKg: weightKg ? parseFloat(weightKg) : undefined,
            })
          }
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Client Group ─────────────────────────────────────────────────────────────
function ClientGroup({
  clientId,
  clientName,
  sizes,
}: {
  clientId: number;
  clientName: string;
  sizes: PackageSize[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.smallParcel.deletePackageSize.useMutation({
    onSuccess: () => {
      toast.success("Deleted");
      utils.smallParcel.listAllPackageSizes.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const updateMutation = trpc.smallParcel.updatePackageSize.useMutation({
    onSuccess: () => {
      toast.success("Updated");
      setEditingId(null);
      utils.smallParcel.listAllPackageSizes.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setCollapsed((c) => !c)}>
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
          <CardTitle className="text-base font-semibold">{clientName}</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {sizes.length} size{sizes.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="flex flex-col gap-2 pt-0">
          {sizes.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No package sizes yet.</p>
          )}
          {sizes.map((size) =>
            editingId === size.id ? (
              <EditRow
                key={size.id}
                size={size}
                onSave={(data) => {
                  updateMutation.mutate({
                    id: size.id,
                    name: data.name,
                    lengthCm: data.lengthCm ? parseFloat(data.lengthCm) : null,
                    widthCm: data.widthCm ? parseFloat(data.widthCm) : null,
                    heightCm: data.heightCm ? parseFloat(data.heightCm) : null,
                    weightKg: data.weightKg ? parseFloat(data.weightKg) : null,
                  });
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={size.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 group"
              >
                <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm">{size.name}</span>
                {(size.lengthCm || size.widthCm || size.heightCm) && (
                  <span className="text-xs text-muted-foreground">
                    {[size.lengthCm, size.widthCm, size.heightCm]
                      .filter(Boolean)
                      .join(" × ")}{" "}
                    cm
                  </span>
                )}
                {size.weightKg && (
                  <span className="text-xs text-muted-foreground">{size.weightKg} kg</span>
                )}
                <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setEditingId(size.id)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${size.name}"?`)) {
                        deleteMutation.mutate({ id: size.id });
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          )}

          <AddRow
            clientId={clientId}
            clientName={clientName}
            onAdded={() => {}}
          />
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SmallParcelPackageSizes() {
  const { data: allSizes, isLoading } = trpc.smallParcel.listAllPackageSizes.useQuery();

  // Group by clientId
  const groups = (() => {
    if (!allSizes) return [];
    const map = new Map<number, { clientId: number; clientName: string; sizes: PackageSize[] }>();
    for (const s of allSizes) {
      if (!map.has(s.clientId)) {
        map.set(s.clientId, { clientId: s.clientId, clientName: s.clientName, sizes: [] });
      }
      map.get(s.clientId)!.sizes.push(s as PackageSize);
    }
    // Sort: "All Clients" (clientId=0) first, then alphabetical
    return Array.from(map.values()).sort((a, b) => {
      if (a.clientId === 0) return -1;
      if (b.clientId === 0) return 1;
      return a.clientName.localeCompare(b.clientName);
    });
  })();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Package className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Package Sizes</h1>
          <p className="text-muted-foreground text-sm">
            Configure package size buttons shown during Pack &amp; Ship. Sizes under{" "}
            <strong>All Clients</strong> appear for every customer.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <ClientGroup
              key={g.clientId}
              clientId={g.clientId}
              clientName={g.clientName}
              sizes={g.sizes}
            />
          ))}

          {/* Add a new client group */}
          <AddNewClientGroup existingClientIds={groups.map((g) => g.clientId)} />
        </div>
      )}
    </div>
  );
}

// ─── Add New Client Group ─────────────────────────────────────────────────────
function AddNewClientGroup({ existingClientIds }: { existingClientIds: number[] }) {
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [sizeName, setSizeName] = useState("");

  const utils = trpc.useUtils();
  const createMutation = trpc.smallParcel.createPackageSize.useMutation({
    onSuccess: () => {
      toast.success(`Package size added for "${clientName}"`);
      setClientName("");
      setSizeName("");
      setOpen(false);
      utils.smallParcel.listAllPackageSizes.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  if (!open) {
    return (
      <Button
        variant="outline"
        className="gap-2 self-start"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" />
        Add sizes for a new client
      </Button>
    );
  }

  return (
    <Card className="border-dashed border-blue-300 dark:border-blue-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          New Client Group
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Client Name *</label>
            <Input
              className="w-44 h-8 text-sm"
              placeholder="e.g. Acme Corp"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">First Size Name *</label>
            <Input
              className="w-40 h-8 text-sm"
              placeholder="e.g. Small Box"
              value={sizeName}
              onChange={(e) => setSizeName(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="h-8 bg-blue-600 hover:bg-blue-700"
            disabled={!clientName.trim() || !sizeName.trim() || createMutation.status === "pending"}
            onClick={() =>
              createMutation.mutate({
                // Use a synthetic clientId based on hash of name — will be overridden by real Extensiv clientId later
                clientId: Math.abs(clientName.trim().split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 1_000_000 + 1,
                clientName: clientName.trim(),
                name: sizeName.trim(),
              })
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Create
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You can add more sizes to this client after creating the first one.
        </p>
      </CardContent>
    </Card>
  );
}
