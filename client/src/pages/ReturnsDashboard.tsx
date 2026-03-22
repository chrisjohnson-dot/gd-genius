import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
  PackageOpen,
  CheckCircle2,
  Boxes,
  TrendingDown,
  Plus,
  ArrowRight,
  Loader2,
  Send,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

type ReturnsSession = {
  id: number;
  configId: number;
  warehouseName: string;
  clientId: number;
  clientName: string;
  status: "open" | "closed" | "cancelled";
  referenceNumber?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pushStatus?: "pending" | "sent" | "failed" | null;
  pushAttempts?: number | null;
  pushError?: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-50 text-amber-700 border border-amber-200",
  closed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border border-slate-200",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="shadow-sm border-0 bg-white dark:bg-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {label}
            </p>
            <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color.replace("text-", "bg-").replace("-600", "-100").replace("-500", "-100")}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReturnsDashboard() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.returns.dashboardStats.useQuery();

  const pushToClearSight = trpc.returns.pushSessionToClearSight.useMutation({
    onSuccess: (data) => {
      toast.success(`Pushed to ClearSight — ${data.itemCount} item${data.itemCount !== 1 ? "s" : ""} sent.`);
      utils.returns.dashboardStats.invalidate();
    },
    onError: (err) => {
      toast.error(`Push failed: ${err.message}`);
      utils.returns.dashboardStats.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="p-7 page-enter">
        <p className="page-breadcrumb">Returns</p>
        <h1 className="page-title">Returns Dashboard</h1>
        <div className="mt-10 flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading returns data…</span>
        </div>
      </div>
    );
  }

  const s = stats ?? {
    open: 0,
    closed: 0,
    totalItems: 0,
    totalQty: 0,
    conditionBreakdown: { new: 0, good: 0, damaged: 0, unsellable: 0 },
    recent: [],
  };

  const conditionTotal = s.conditionBreakdown.new + s.conditionBreakdown.good + s.conditionBreakdown.damaged + s.conditionBreakdown.unsellable;

  return (
    <div className="p-7 space-y-7 page-enter max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="page-breadcrumb">Returns</p>
          <h1 className="page-title">Returns Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of all inbound return sessions and item conditions
          </p>
        </div>
        <Link href="/returns/process">
          <Button className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Process Returns
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Sessions"
          value={s.open}
          icon={PackageOpen}
          color="text-amber-600"
          sub="awaiting close"
        />
        <StatCard
          label="Closed Sessions"
          value={s.closed}
          icon={CheckCircle2}
          color="text-emerald-600"
          sub="completed"
        />
        <StatCard
          label="Total SKUs"
          value={s.totalItems}
          icon={Boxes}
          color="text-blue-600"
          sub="line items scanned"
        />
        <StatCard
          label="Total Units"
          value={s.totalQty}
          icon={RotateCcw}
          color="text-purple-600"
          sub="units received back"
        />
      </div>

      {/* Condition breakdown */}
      {conditionTotal > 0 && (
        <Card className="shadow-sm border-0 bg-white dark:bg-card">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Condition Breakdown — {conditionTotal} total units
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "New / Unopened", key: "new" as const, color: "bg-emerald-100 text-emerald-700" },
                { label: "Good / Used", key: "good" as const, color: "bg-blue-100 text-blue-700" },
                { label: "Damaged", key: "damaged" as const, color: "bg-amber-100 text-amber-700" },
                { label: "Unsellable", key: "unsellable" as const, color: "bg-red-100 text-red-700" },
              ].map(({ label, key, color }) => {
                const qty = s.conditionBreakdown[key];
                const pct = conditionTotal > 0 ? Math.round((qty / conditionTotal) * 100) : 0;
                return (
                  <div key={key} className={`rounded-xl p-3 ${color}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{qty}</p>
                    <p className="text-xs opacity-70 mt-0.5">{pct}% of total</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent sessions */}
      <Card className="shadow-sm border-0 bg-white dark:bg-card">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <p className="text-sm font-semibold text-foreground">Recent Sessions</p>
            <Link href="/returns/process">
              <button className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </Link>
          </div>

          {(s.recent as ReturnsSession[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <TrendingDown className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No return sessions yet</p>
              <p className="text-xs mt-1 opacity-60">
                Start a session using the Process Returns portal
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Session
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Warehouse
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Customer
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Date
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Created By
                    </th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      ClearSight
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(s.recent as ReturnsSession[]).map((session) => {
                    const isSent = session.pushStatus === "sent";
                    const isFailed = session.pushStatus === "failed";
                    const isPushingThis = pushToClearSight.isPending && pushToClearSight.variables?.sessionId === session.id;

                    return (
                      <tr
                        key={session.id}
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-foreground">
                          #{session.id}
                          {session.referenceNumber && (
                            <span className="ml-2 text-xs text-muted-foreground font-normal">
                              {session.referenceNumber}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{session.warehouseName}</td>
                        <td className="px-3 py-3 text-foreground font-medium">{session.clientName}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[session.status]}`}
                          >
                            {STATUS_LABELS[session.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">
                          {session.createdByName ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Open session — continue link */}
                            {session.status === "open" && (
                              <Link href={`/returns/session/${session.id}`}>
                                <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                                  Continue <ArrowRight className="h-3 w-3" />
                                </Button>
                              </Link>
                            )}

                            {/* Closed + sent — success badge only */}
                            {session.status === "closed" && isSent && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                <CheckCircle className="h-3 w-3" /> Sent
                              </span>
                            )}

                            {/* Closed + failed — error badge + retry button */}
                            {session.status === "closed" && isFailed && (
                              <>
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 cursor-help"
                                  title={session.pushError ?? "Unknown error"}
                                >
                                  <AlertCircle className="h-3 w-3" />
                                  Failed {(session.pushAttempts ?? 0) > 0 ? `×${session.pushAttempts}` : ""}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 gap-1 border-red-300 text-red-600 hover:bg-red-50"
                                  onClick={() => pushToClearSight.mutate({ sessionId: session.id })}
                                  disabled={isPushingThis}
                                >
                                  {isPushingThis ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3" />
                                  )}
                                  Retry
                                </Button>
                              </>
                            )}

                            {/* Closed + never pushed — push button */}
                            {session.status === "closed" && !isSent && !isFailed && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1 border-blue-300 text-blue-600 hover:bg-blue-50"
                                onClick={() => pushToClearSight.mutate({ sessionId: session.id })}
                                disabled={isPushingThis}
                              >
                                {isPushingThis ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Send className="h-3 w-3" />
                                )}
                                Push
                              </Button>
                            )}
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
  );
}
