import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Clock, PackageSearch, XCircle } from "lucide-react";
import { Link } from "wouter";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    confirmed: { bg: "#d1fae5", text: "#059669", dot: "#059669" },
    proposed:  { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
    cancelled: { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444" },
    failed:    { bg: "#fee2e2", text: "#ef4444", dot: "#ef4444" },
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

export default function Home() {
  const { data: runs, isLoading } = trpc.allocation.history.useQuery({ limit: 5 });

  const totalAllocated = runs?.reduce((s, r) => s + (r.allocatedCount ?? 0), 0) ?? 0;
  const totalSkipped   = runs?.reduce((s, r) => s + (r.skippedCount ?? 0), 0) ?? 0;
  const totalRuns      = runs?.length ?? 0;

  return (
    <AppLayout>
      <div className="p-7 space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="page-breadcrumb">Overview</p>
            <h1 className="page-title">Dashboard</h1>
          </div>
          <Button asChild className="shadow-sm">
            <Link href="/allocate" className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4" />
              Run Allocation Tool
            </Link>
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Recent Runs */}
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <Clock className="h-3.5 w-3.5" />
              Recent Runs
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">{totalRuns}</p>
          </div>

          {/* Orders Allocated */}
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Orders Allocated
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">{totalAllocated}</p>
          </div>

          {/* Orders Skipped */}
          <div className="kpi-card">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
              <XCircle className="h-3.5 w-3.5 text-amber-500" />
              Orders Skipped
            </p>
            <p className="text-[28px] font-extrabold tracking-tight leading-none">{totalSkipped}</p>
          </div>
        </div>

        {/* Recent Allocation Runs table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between border-b border-border">
            <h3 className="text-[15px] font-bold">Recent Allocation Runs</h3>
            <Link href="/history">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs font-medium">
                View All →
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No allocation runs yet.</p>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href="/allocate">Run your first allocation</Link>
              </Button>
            </div>
          ) : (
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Allocated</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="font-semibold text-foreground">
                      {run.customerName ?? `Customer ${run.customerId}`}
                    </td>
                    <td className="text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="text-muted-foreground">
                      {run.allocatedCount}/{run.orderCount} allocated
                    </td>
                    <td>
                      <StatusPill status={run.status} />
                    </td>
                    <td className="text-right">
                      <Link href={`/history/${run.id}`}>
                        <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
