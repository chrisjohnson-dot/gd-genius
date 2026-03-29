import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "lucide-react";
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
import { trpc } from "@/lib/trpc";
import { History, Loader2, Printer, Search, Trash2, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

function VerificationBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
        Pending
      </span>
    );
  }
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    verified: { bg: "#d1fae5", text: "#059669", dot: "#059669", label: "Verified" },
    partial:  { bg: "#fef9c3", text: "#b45309", dot: "#d97706", label: "Partial" },
    mismatch: { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444", label: "Mismatch" },
    failed:   { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444", label: "Failed" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", label: status };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    confirmed:   { bg: "#d1fae5", text: "#059669", dot: "#059669" },
    proposed:    { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
    cancelled:   { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af" },
    failed:      { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444" },
    unallocated: { bg: "#ffedd5", text: "#c2410c", dot: "#f97316" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const DATE_FILTERS = [
  { label: "All Time", days: undefined },
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
] as const;

export default function RunHistory() {
  const utils = trpc.useUtils();
  const [activeDays, setActiveDays] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 200, days: activeDays });

  const filteredRuns = runs?.filter((run) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (run.customerName ?? `Customer ${run.customerId}`).toLowerCase();
    const orderIds: number[] = (run as typeof run & { orderIds?: number[] }).orderIds ?? [];
    return name.includes(q) || orderIds.some((id) => String(id).includes(q));
  }) ?? [];

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const pendingRun = runs?.find((r) => r.id === pendingDeleteId);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allIds = filteredRuns.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const deleteRun = trpc.allocation.deleteRun.useMutation({
    onSuccess: () => {
      toast.success("Run deleted successfully.");
      utils.allocation.history.invalidate();
      setPendingDeleteId(null);
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
      setPendingDeleteId(null);
    },
  });

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let failed = 0;
    for (const id of ids) {
      try { await deleteRun.mutateAsync({ runId: id }); }
      catch { failed++; }
    }
    setBulkDeleting(false);
    setPendingBulkDelete(false);
    setSelectedIds(new Set());
    if (failed > 0) toast.error(`${failed} run(s) could not be deleted.`);
    else toast.success(`${ids.length} run(s) deleted.`);
    utils.allocation.history.invalidate();
  }

  const markPrinted = trpc.allocation.markDocumentsPrinted.useMutation({
    onSuccess: () => utils.allocation.history.invalidate(),
    onError: (err) => toast.error(`Could not mark as printed: ${err.message}`),
  });

  function handlePrintDocuments(runId: number, alreadyPrinted: boolean) {
    const firstPrintParam = alreadyPrinted ? "" : "?firstPrint=1";
    const pdfUrl = encodeURIComponent(`/api/pdf/all-documents/${runId}${firstPrintParam}`);
    window.open(`/print?url=${pdfUrl}`, "_blank", "noopener,noreferrer");
    markPrinted.mutate({ runId });
  }

  return (
    <>

      <div className="p-7 space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="page-breadcrumb">Operations</p>
            <h1 className="page-title">Run History</h1>
          </div>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 shadow-sm"
              onClick={() => setPendingBulkDelete(true)}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete {selectedIds.size} Selected
            </Button>
          )}
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
            <h3 className="text-[15px] font-bold">
              {activeDays ? `Last ${activeDays} Days` : "All Allocation Runs"}
              {!isLoading && runs && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {filteredRuns.length}{searchQuery ? ` of ${runs.length}` : ""} run{filteredRuns.length !== 1 ? "s" : ""}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedIds(new Set()); }}
                  placeholder="Search customer or TX ID…"
                  className="pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setSelectedIds(new Set()); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {/* Date filter pills */}
              <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
              {DATE_FILTERS.map((f) => (
                <button
                  key={f.label}
                  onClick={() => { setActiveDays(f.days); setSelectedIds(new Set()); }}
                  className={[
                    "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                    activeDays === f.days
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  ].join(" ")}
                >
                  {f.label}
                </button>
              ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No allocation runs yet.</p>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No runs match your search.</p>
              <button onClick={() => setSearchQuery("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th className="w-10 px-4">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el) (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someSelected;
                        }}
                        onCheckedChange={toggleAll}
                        aria-label="Select all runs"
                      />
                    </th>
                    <th>Run #</th>
                    <th>Customer</th>
                    <th>TX IDs</th>
                    <th>Date</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Allocated</th>
                    <th className="text-right">Skipped</th>
                    <th>Status</th>
                    <th>Verification</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((run) => {
                    const hasPrinted = !!run.documentsPrintedAt;
                    const orderIds: number[] = (run as typeof run & { orderIds?: number[] }).orderIds ?? [];
                    const isChecked = selectedIds.has(run.id);

                    return (
                      <tr key={run.id} className={isChecked ? "bg-primary/5" : ""}>
                        <td className="px-4">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleOne(run.id)}
                            aria-label={`Select run #${run.id}`}
                          />
                        </td>
                        <td className="font-mono text-xs text-muted-foreground">#{run.id}</td>
                        <td className="font-semibold text-foreground whitespace-nowrap">
                          {run.customerName ?? `Customer ${run.customerId}`}
                        </td>
                        <td className="max-w-[200px]">
                          {orderIds.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {orderIds.slice(0, 6).map((id) => (
                                <span
                                  key={id}
                                  className="inline-block font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground"
                                >
                                  {id}
                                </span>
                              ))}
                              {orderIds.length > 6 && (
                                <span className="text-xs text-muted-foreground">+{orderIds.length - 6} more</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="text-muted-foreground whitespace-nowrap">
                          {new Date(run.createdAt).toLocaleString()}
                        </td>
                        <td className="text-right">{run.orderCount}</td>
                        <td className="text-right font-semibold" style={{ color: "#059669" }}>{run.allocatedCount}</td>
                        <td className="text-right" style={{ color: "#d97706" }}>{run.skippedCount}</td>
                        <td>
                          <StatusPill status={run.status} />
                        </td>
                        <td>
                          {run.status === "confirmed" ? (
                            <VerificationBadge status={(run as typeof run & { verificationStatus?: string }).verificationStatus} />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary/80 text-xs">
                              <Link href={`/history/${run.id}`}>View</Link>
                            </Button>
                            {run.status === "proposed" && (
                              <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary/80 text-xs">
                                <Link href={`/review/${run.id}`}>Review</Link>
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              style={hasPrinted
                                ? { borderColor: "#fca5a5", color: "#dc2626" }
                                : { borderColor: "#6ee7b7", color: "#059669" }
                              }
                              onClick={() => handlePrintDocuments(run.id, hasPrinted)}
                              disabled={markPrinted.isPending}
                              title={hasPrinted
                                ? `Previously printed on ${new Date(run.documentsPrintedAt!).toLocaleString()}`
                                : "Print all three documents"
                              }
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Print Documents
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setPendingDeleteId(run.id)}
                              disabled={deleteRun.isPending && pendingDeleteId === run.id}
                            >
                              {deleteRun.isPending && pendingDeleteId === run.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />
                              }
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Single-run delete dialog */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Allocation Run #{pendingDeleteId}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRun ? (
                <>This will permanently delete run <strong>#{pendingRun.id}</strong> for{" "}
                  <strong>{pendingRun.customerName ?? `Customer ${pendingRun.customerId}`}</strong>{" "}
                  ({pendingRun.orderCount} order{pendingRun.orderCount !== 1 ? "s" : ""}, status:{" "}
                  <strong>{pendingRun.status}</strong>).{" "}</>
              ) : null}
              All associated order records will also be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingDeleteId !== null) deleteRun.mutate({ runId: pendingDeleteId }); }}
            >
              Delete Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete dialog */}
      <AlertDialog open={pendingBulkDelete} onOpenChange={(open) => { if (!open && !bulkDeleting) setPendingBulkDelete(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Run{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{selectedIds.size}</strong> selected allocation run{selectedIds.size !== 1 ? "s" : ""} and all their associated order records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <span className="flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />Deleting…</span>
              ) : (
                `Delete ${selectedIds.size} Run${selectedIds.size !== 1 ? "s" : ""}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}