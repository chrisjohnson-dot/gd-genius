import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Link, useParams } from "wouter";

const statusClass: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  allocated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  skipped: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export default function RunDetail() {
  const params = useParams<{ runId: string }>();
  const runId = Number(params.runId);

  const { data, isLoading } = trpc.allocation.runDetail.useQuery({ runId });

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

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/history"><a><ArrowLeft className="h-4 w-4 mr-1" />Back</a></Link>
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
