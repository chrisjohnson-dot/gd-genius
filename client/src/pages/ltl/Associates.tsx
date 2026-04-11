import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Plus, Pencil, UserX, UserCheck, Search, RefreshCw, Loader2, Printer, Warehouse, BarChart2, ArrowRightLeft } from "lucide-react";
import { AssociateBadge } from "@/components/ltl/AssociateBadge";
import { BulkBadgePrint } from "@/components/ltl/BulkBadgePrint";
import { AssociateStatsDrawer } from "@/components/AssociateStatsDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────
type Associate = {
  id: number;
  associateId: string;
  name: string;
  warehouseId: string;
  role: string | null;
  active: boolean;
  notes: string | null;
  targetItemsPerHour: number | null;
  createdAt: number;
  updatedAt: number;
};

// ─── Add / Edit Dialog ────────────────────────────────────────────────────────
function AssociateDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: Associate | null;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    associateId: existing?.associateId ?? "",
    name: existing?.name ?? "",
    warehouseId: existing?.warehouseId ?? "all",
    role: existing?.role ?? "",
    notes: existing?.notes ?? "",
    targetItemsPerHour: existing?.targetItemsPerHour != null ? String(existing.targetItemsPerHour) : "",
  });

  const upsert = trpc.associates.upsert.useMutation({
    onSuccess: (data) => {
      toast.success(data.created ? "Associate added." : "Associate updated.");
      utils.associates.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const isEdit = Boolean(existing);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.associateId.trim() || !form.name.trim()) return;
    const tph = parseInt(form.targetItemsPerHour, 10);
    upsert.mutate({
      associateId: form.associateId.trim(),
      name: form.name.trim(),
      warehouseId: form.warehouseId.trim() || "all",
      role: form.role.trim() || undefined,
      notes: form.notes.trim() || undefined,
      active: true,
      targetItemsPerHour: !isNaN(tph) && tph > 0 ? tph : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Associate" : "Add Associate"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Badge / Associate ID <span className="text-red-500">*</span></Label>
            <Input
              placeholder="e.g. EMP-001 or badge barcode"
              value={form.associateId}
              onChange={(e) => setForm(f => ({ ...f, associateId: e.target.value }))}
              disabled={isEdit}
              className="font-mono"
              autoFocus={!isEdit}
            />
            {isEdit && <p className="text-xs text-muted-foreground">Associate ID cannot be changed after creation.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Full Name <span className="text-red-500">*</span></Label>
            <Input
              placeholder="e.g. John Smith"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus={isEdit}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Input
                placeholder="all / COL / TOR / …"
                value={form.warehouseId}
                onChange={(e) => setForm(f => ({ ...f, warehouseId: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input
                placeholder="e.g. Picker, Forklift"
                value={form.role}
                onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes"
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              Target Items/hr
              <span className="text-xs font-normal text-muted-foreground">(ghost picker rate override)</span>
            </Label>
            <Input
              type="number"
              min={1}
              max={9999}
              placeholder="e.g. 45 — leave blank to use warehouse default"
              value={form.targetItemsPerHour}
              onChange={(e) => setForm(f => ({ ...f, targetItemsPerHour: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={!form.associateId.trim() || !form.name.trim() || upsert.isPending}
              className="bg-[#15527f] hover:bg-[#1a6699] text-white"
            >
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {isEdit ? "Save Changes" : "Add Associate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Associates() {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Associate | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Associate | null>(null);
  const [badgeTarget, setBadgeTarget] = useState<Associate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statsTarget, setStatsTarget] = useState<Associate | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignWarehouse, setReassignWarehouse] = useState("");

  const utils = trpc.useUtils();

  const { data: associates = [], isLoading, refetch } = trpc.associates.list.useQuery({
    activeOnly: !showInactive,
    search: search.trim() || undefined,
  }, { refetchInterval: 30000 });

  // Unique warehouse IDs derived from the full list (for dropdown options)
  const warehouseOptions = Array.from(new Set(associates.map((a) => a.warehouseId))).sort();

  // Unique roles derived from the full list (excluding null/empty)
  const roleOptions = Array.from(
    new Set(associates.map((a) => a.role).filter((r): r is string => Boolean(r)))
  ).sort();

  // Apply both warehouse and role filters on top of the server-side search/active filters
  const filteredAssociates = associates.filter((a) => {
    if (warehouseFilter !== "all" && a.warehouseId !== warehouseFilter) return false;
    if (roleFilter !== "all" && (a.role ?? "") !== roleFilter) return false;
    return true;
  });

  const allIds = filteredAssociates.map((a) => a.associateId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = allIds.some((id) => selectedIds.has(id));

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  function selectAllInWarehouse(wh: string) {
    const ids = associates.filter((a) => a.warehouseId === wh).map((a) => a.associateId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function selectAllInRole(role: string) {
    const ids = associates.filter((a) => (a.role ?? "") === role).map((a) => a.associateId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  // Label map for display
  const ROLE_LABEL: Record<string, string> = {
    picker: "Picker", packer: "Packer", receiver: "Receiver",
    supervisor: "Supervisor", driver: "Driver",
  };
  // Color map: bg / text / border Tailwind classes per role
  const ROLE_COLOR: Record<string, string> = {
    picker:     "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400",
    packer:     "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
    receiver:   "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400",
    supervisor: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400",
    driver:     "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-500",
  };
  function roleLabel(r: string | null) { return r ? (ROLE_LABEL[r] ?? r) : "—"; }
  function roleColor(r: string | null) { return r ? (ROLE_COLOR[r] ?? "bg-gray-500/10 text-gray-600 border-gray-500/20") : ""; }

  // selectedAssociates is drawn from the FULL list (not filtered) so deselecting warehouse
  // doesn't silently drop already-selected badges from the print job
  const selectedAssociates = associates
    .filter((a) => selectedIds.has(a.associateId))
    .map((a) => ({ associateId: a.associateId, name: a.name, warehouseId: a.warehouseId, role: a.role }));

  const deactivate = trpc.associates.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Associate deactivated.");
      utils.associates.list.invalidate();
      setDeactivateTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const reactivate = trpc.associates.reactivate.useMutation({
    onSuccess: () => {
      toast.success("Associate reactivated.");
      utils.associates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkReassign = trpc.associates.bulkReassign.useMutation({
    onSuccess: (data) => {
      toast.success(`Reassigned ${data.updated} associate${data.updated !== 1 ? 's' : ''} to ${reassignWarehouse}.`);
      utils.associates.list.invalidate();
      setReassignOpen(false);
      setReassignWarehouse("");
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  function openAdd() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(a: Associate) {
    setEditTarget(a);
    setDialogOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Associates</h1>
          <p className="text-sm text-muted-foreground">
            Manage warehouse associate IDs for automatic name lookup during pull sessions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          {someSelected && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                onClick={() => setReassignOpen(true)}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Reassign {selectedIds.size}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                onClick={() => setBulkPrintOpen(true)}
              >
                <Printer className="h-3.5 w-3.5" />
                Print {selectedIds.size} Badge{selectedIds.size !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          <Button onClick={openAdd} className="bg-[#15527f] hover:bg-[#1a6699] text-white gap-2">
            <Plus className="h-4 w-4" />
            Add Associate
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Active", value: associates.filter(a => a.active).length, color: "text-green-600" },
          { label: "Inactive", value: associates.filter(a => !a.active).length, color: "text-muted-foreground" },
          { label: "Warehouses", value: new Set(associates.map(a => a.warehouseId)).size, color: "text-[#15527f]" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-[#15527f]" />
              Associate Directory
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Warehouse filter */}
              <Select value={warehouseFilter} onValueChange={(v) => setWarehouseFilter(v)}>
                <SelectTrigger className="h-8 w-44 text-sm gap-1.5">
                  <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouseOptions.map((wh) => (
                    <SelectItem key={wh} value={wh}>{wh === "all" ? "All" : wh}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Role filter */}
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v)}>
                <SelectTrigger className="h-8 w-36 text-sm gap-1.5">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Select All shortcuts — show combined label when both filters active */}
              {(warehouseFilter !== "all" || roleFilter !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setSelectedIds(new Set(filteredAssociates.map((a) => a.associateId)))}
                >
                  Select All
                  {warehouseFilter !== "all" && roleFilter !== "all"
                    ? ` ${ROLE_LABEL[roleFilter] ?? roleFilter}s in ${warehouseFilter}`
                    : warehouseFilter !== "all"
                    ? ` in ${warehouseFilter}`
                    : ` ${ROLE_LABEL[roleFilter] ?? roleFilter}s`}
                </Button>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search name or ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 w-40 text-sm"
                />
              </div>
              <button
                onClick={() => setShowInactive(!showInactive)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  showInactive
                    ? "bg-[#15527f] text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {showInactive ? "Showing All" : "Active Only"}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filteredAssociates.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No associates found.</p>
              <p className="text-sm mt-1">Click "Add Associate" to create the first entry.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                      className={someSelected && !allSelected ? "opacity-50" : ""}
                    />
                  </TableHead>
                  <TableHead>Badge ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Target/hr</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssociates.map((a) => (
                  <TableRow key={a.associateId} className={!a.active ? "opacity-50" : ""} onClick={() => toggleRow(a.associateId)} style={{ cursor: "pointer" }}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(a.associateId)}
                        onCheckedChange={() => toggleRow(a.associateId)}
                        aria-label={`Select ${a.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-sm">{a.associateId}</TableCell>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {a.warehouseId === "all" ? "All" : a.warehouseId}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.role ? (
                        <Badge variant="outline" className={`text-xs font-medium ${roleColor(a.role)}`}>
                          {roleLabel(a.role)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(a as any).targetItemsPerHour != null ? (
                        <span className="font-mono font-semibold text-sm text-[#15527f] dark:text-blue-400">{(a as any).targetItemsPerHour}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">default</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.active ? (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-500 border-gray-500/20">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(a.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => openEdit(a)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/20"
                          onClick={(e) => { e.stopPropagation(); setStatsTarget(a); }}
                          title="View Stats"
                        >
                          <BarChart2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                          onClick={(e) => { e.stopPropagation(); setBadgeTarget(a); }}
                          title="Print Badge"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {a.active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                            onClick={() => setDeactivateTarget(a)}
                            title="Deactivate"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                            onClick={() => reactivate.mutate({ associateId: a.associateId })}
                            title="Reactivate"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <AssociateDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditTarget(null); }}
        existing={editTarget}
      />

      {/* Bulk Print Badges Dialog */}
      <BulkBadgePrint
        associates={selectedAssociates}
        open={bulkPrintOpen}
        onClose={() => setBulkPrintOpen(false)}
      />

      {/* Print Badge Dialog */}
      {badgeTarget && (
        <AssociateBadge
          associate={{
            associateId: badgeTarget.associateId,
            name: badgeTarget.name,
            warehouseId: badgeTarget.warehouseId,
            role: badgeTarget.role,
          }}
          open={Boolean(badgeTarget)}
          onClose={() => setBadgeTarget(null)}
        />
      )}

      {/* Associate Stats Drawer */}
      {statsTarget && (
        <AssociateStatsDrawer
          open={Boolean(statsTarget)}
          onClose={() => setStatsTarget(null)}
          associateId={statsTarget.associateId}
          associateName={statsTarget.name}
          warehouseId={statsTarget.warehouseId}
          role={statsTarget.role}
        />
      )}

      {/* Bulk Reassign Dialog */}
      <Dialog open={reassignOpen} onOpenChange={(o) => { if (!o) { setReassignOpen(false); setReassignWarehouse(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-amber-500" />
              Reassign {selectedIds.size} Associate{selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Move the selected associate{selectedIds.size !== 1 ? "s" : ""} to a different warehouse.
              This updates their default warehouse assignment immediately.
            </p>
            <div className="space-y-1.5">
              <Label>New Warehouse ID <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. COL, TOR, CAL"
                value={reassignWarehouse}
                onChange={(e) => setReassignWarehouse(e.target.value.toUpperCase())}
                className="font-mono"
                autoFocus
              />
              {warehouseOptions.filter(w => w !== "all").length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {warehouseOptions.filter(w => w !== "all").map(wh => (
                    <button
                      key={wh}
                      type="button"
                      onClick={() => setReassignWarehouse(wh)}
                      className={`px-2 py-0.5 rounded text-xs font-mono font-semibold border transition-colors ${
                        reassignWarehouse === wh
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-muted text-muted-foreground border-border hover:border-amber-400 hover:text-foreground"
                      }`}
                    >
                      {wh}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setReassignOpen(false); setReassignWarehouse(""); }}>Cancel</Button>
            <Button
              disabled={!reassignWarehouse.trim() || bulkReassign.isPending}
              onClick={() => bulkReassign.mutate({ associateIds: Array.from(selectedIds), warehouseId: reassignWarehouse.trim() })}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {bulkReassign.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <AlertDialog open={Boolean(deactivateTarget)} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Associate?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateTarget?.name}</strong> ({deactivateTarget?.associateId}) will no longer
              auto-fill in the Warehouse Pull scanner. You can reactivate them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && deactivate.mutate({ associateId: deactivateTarget.associateId })}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
