import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { History, Loader2, Printer, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const statusClass: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  unallocated: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function RunHistory() {
  const utils = trpc.useUtils();
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 100 });

  // Single-delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const pendingRun = runs?.find((r) => r.id === pendingDeleteId);

  // Bulk-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allIds = runs?.map((r) => r.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
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
      try {
        await deleteRun.mutateAsync({ runId: id });
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setPendingBulkDelete(false);
    setSelectedIds(new Set());
    if (failed > 0) {
      toast.error(`${failed} run(s) could not be deleted.`);
    } else {
      toast.success(`${ids.length} run(s) deleted.`);
    }
    utils.allocation.history.invalidate();
  }

  const markPrinted = trpc.allocation.markDocumentsPrinted.useMutation({
    onSuccess: () => {
      utils.allocation.history.invalidate();
    },
    onError: (err) => {
      toast.error(`Could not mark as printed: ${err.message}`);
    },
  });

  function handlePrintDocuments(runId: number, alreadyPrinted: boolean) {
    // Pass firstPrint=1 when this is the first time printing — suppresses the DUPLICATE badge
    const firstPrintParam = alreadyPrinted ? "" : "?firstPrint=1";
    const pdfUrl = encodeURIComponent(`/api/pdf/all-documents/${runId}${firstPrintParam}`);
    window.open(`/print?url=${pdfUrl}`, "_blank", "noopener,noreferrer");
    markPrinted.mutate({ runId });
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Run History</h1>
            <p className="text-muted-foreground text-sm mt-1">All allocation runs with results and status</p>
          </div>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setPendingBulkDelete(true)}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete {selectedIds.size} Selected
            </Button>
          )}
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">All Allocation Runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !runs || runs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No allocation runs yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 w-10">
                        <Checkbox
                          checked={allSelected}
                          ref={(el) => {
                            if (el) (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someSelected;
                          }}
                          onCheckedChange={toggleAll}
                          aria-label="Select all runs"
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-medium">Run #</th>
                      <th className="text-left px-4 py-3 font-medium">Customer</th>
                      <th className="text-left px-4 py-3 font-medium">TX IDs</th>
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-right px-4 py-3 font-medium">Orders</th>
                      <th className="text-right px-4 py-3 font-medium">Allocated</th>
                      <th className="text-right px-4 py-3 font-medium">Skipped</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const hasPrinted = !!run.documentsPrintedAt;
                      const orderIds: number[] = (run as typeof run & { orderIds?: number[] }).orderIds ?? [];
                      const isChecked = selectedIds.has(run.id);

                      return (
                        <tr
                          key={run.id}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${isChecked ? "bg-muted/20" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleOne(run.id)}
                              aria-label={`Select run #${run.id}`}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{run.id}</td>
                          <td className="px-4 py-3 font-medium whitespace-nowrap">
                            {run.customerName ?? `Customer ${run.customerId}`}
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
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
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {new Date(run.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">{run.orderCount}</td>
                          <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-medium">{run.allocatedCount}</td>
                          <td className="px-4 py-3 text-right text-yellow-700 dark:text-yellow-400">{run.skippedCount}</td>
                          <td className="px-4 py-3">
                            <Badge className={statusClass[run.status] ?? ""}>{run.status}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/history/${run.id}`}>View</Link>
                              </Button>
                              {run.status === "proposed" && (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href={`/review/${run.id}`}>Review</Link>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className={
                                  hasPrinted
                                    ? "gap-1.5 border-red-400 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-950/30"
                                    : "gap-1.5 border-green-500 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-950/30"
                                }
                                onClick={() => handlePrintDocuments(run.id, hasPrinted)}
                                disabled={markPrinted.isPending}
                                title={
                                  hasPrinted
                                    ? `Documents previously printed on ${new Date(run.documentsPrintedAt!).toLocaleString()}`
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
                                {deleteRun.isPending && pendingDeleteId === run.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
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
          </CardContent>
        </Card>
      </div>

      {/* Single-run delete dialog */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Allocation Run #{pendingDeleteId}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRun ? (
                <>
                  This will permanently delete run <strong>#{pendingRun.id}</strong> for{" "}
                  <strong>{pendingRun.customerName ?? `Customer ${pendingRun.customerId}`}</strong>{" "}
                  ({pendingRun.orderCount} order{pendingRun.orderCount !== 1 ? "s" : ""}, status:{" "}
                  <strong>{pendingRun.status}</strong>).{" "}
                </>
              ) : null}
              All associated order records will also be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId !== null) {
                  deleteRun.mutate({ runId: pendingDeleteId });
                }
              }}
            >
              Delete Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog
        open={pendingBulkDelete}
        onOpenChange={(open) => {
          if (!open && !bulkDeleting) setPendingBulkDelete(false);
        }}
      >
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
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </span>
              ) : (
                `Delete ${selectedIds.size} Run${selectedIds.size !== 1 ? "s" : ""}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
