import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Clock, PackageSearch, XCircle } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 5 });

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "proposed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "cancelled": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
      case "failed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const totalAllocated = runs?.reduce((s, r) => s + (r.allocatedCount ?? 0), 0) ?? 0;
  const totalSkipped = runs?.reduce((s, r) => s + (r.skippedCount ?? 0), 0) ?? 0;
  const totalRuns = runs?.length ?? 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Go Direct Allocation Agent</p>
          </div>
          <Button asChild>
            <Link href="/allocate" className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4" />
              Run Allocation
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recent Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{totalRuns}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Orders Allocated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold">{totalAllocated}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Orders Skipped</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-yellow-600" />
                <span className="text-2xl font-bold">{totalSkipped}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent runs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Allocation Runs</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/history">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : !runs || runs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <PackageSearch className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No allocation runs yet.</p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link href="/allocate">Run your first allocation</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {runs.map((run) => (
                  <div key={run.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{run.customerName ?? `Customer ${run.customerId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString()} · {run.allocatedCount}/{run.orderCount} allocated
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColor(run.status)}>{run.status}</Badge>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/history/${run.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
