import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";

const statusClass: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  allocated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  skipped: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  unallocated: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function RunDetail() {
  const params = useParams<{ runId: string }>();
  const runId = Number(params.runId);
  const [unallocatingId, setUnallocatingId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.allocation.runDetail.useQuery({ runId });

  const unallocateMutation = trpc.allocation.unallocateOrder.useMutation({
    onSuccess: () => {
      toast.success("Order unallocated in Extensiv.");
      utils.allocation.runDetail.invalidate({ runId });
    },
    onError: (e) => toast.error(`Unallocate failed: ${e.message}`),
    onSettled: () => setUnallocatingId(null),
  });

  const handleUnallocate = (runOrderId: number, referenceNum: string | null) => {
    if (!confirm(`Unallocate order ${referenceNum ?? runOrderId} in Extensiv? This cannot be undone.`)) return;
    setUnallocatingId(runOrderId);
    unallocateMutation.mutate({ runOrderId });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-muted-foreground">Run not found.</div>
      </AppLayout>
    );
  }

  const { run, orders } = data;
  const isConfirmed = run.status === "confirmed";

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/history" className="flex items-center"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Run #{run.id}</h1>
            <p className="text-muted-foreground text-sm">{run.customerName} · {new Date(run.createdAt).toLocaleString()}</p>
          </div>
          <Badge className={statusClass[run.status] ?? ""}>{run.status}</Badge>
        </div>

        {/* Run summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xl font-bold">{run.allocatedCount}</p>
                <p className="text-xs text-muted-foreground">Allocated</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-xl font-bold">{run.skippedCount}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground mb-1">Confirmed At</p>
              <p className="text-sm font-medium">{run.confirmedAt ? new Date(run.confirmedAt).toLocaleString() : "—"}</p>
            </CardContent>
          </Card>
        </div>

        {run.notes && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
            <CardContent className="py-3 text-sm text-red-800 dark:text-red-300">
              <strong>Notes:</strong> {run.notes}
            </CardContent>
          </Card>
        )}

        {/* Order list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Order Results</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Reference #</th>
                    <th className="text-left px-4 py-3 font-medium">Order ID</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Skip Reason</th>
                    {isConfirmed && (
                      <th className="text-right px-4 py-3 font-medium">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{o.referenceNum ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{o.orderId}</td>
                      <td className="px-4 py-2">
                        <Badge className={statusClass[o.status] ?? ""}>{o.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{o.skipReason ?? "—"}</td>
                      {isConfirmed && (
                        <td className="px-4 py-2 text-right">
                          {o.status === "allocated" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                              disabled={unallocatingId === o.id}
                              onClick={() => handleUnallocate(o.id, o.referenceNum ?? null)}
                            >
                              {unallocatingId === o.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Undo2 className="h-3 w-3" />
                              )}
                              Unallocate
                            </Button>
                          )}
                          {o.status === "unallocated" && (
                            <span className="text-xs text-orange-600 dark:text-orange-400 italic">Unallocated</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
