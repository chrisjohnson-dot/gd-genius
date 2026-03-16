import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { History, Loader2 } from "lucide-react";
import { Link } from "wouter";

const statusClass: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function RunHistory() {
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 100 });

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">Run History</h1>
          <p className="text-muted-foreground text-sm mt-1">All allocation runs with results and status</p>
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
                      <th className="text-left px-4 py-3 font-medium">Run #</th>
                      <th className="text-left px-4 py-3 font-medium">Customer</th>
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-right px-4 py-3 font-medium">Orders</th>
                      <th className="text-right px-4 py-3 font-medium">Allocated</th>
                      <th className="text-right px-4 py-3 font-medium">Skipped</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{run.id}</td>
                        <td className="px-4 py-3 font-medium">{run.customerName ?? `Customer ${run.customerId}`}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{run.orderCount}</td>
                        <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-medium">{run.allocatedCount}</td>
                        <td className="px-4 py-3 text-right text-yellow-700 dark:text-yellow-400">{run.skippedCount}</td>
                        <td className="px-4 py-3">
                          <Badge className={statusClass[run.status] ?? ""}>{run.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/history/${run.id}`}>View</Link>
                          </Button>
                          {run.status === "proposed" && (
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/review/${run.id}`}>Review</Link>
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
