/**
 * AssociateStatsDrawer.tsx
 * Slide-out drawer showing performance stats for a single associate.
 * Includes KPI summary cards, a 30-day items/hour trend chart, and
 * a recent pull-session history table.
 */
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Package,
  Layers,
  Clock,
  TrendingUp,
  Activity,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  associateId: string;
  associateName: string;
  warehouseId: string;
  role: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  picker: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  packer: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  receiver: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  supervisor: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  driver: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  const cls = ROLE_COLORS[role.toLowerCase()] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
        <CheckCircle2 className="h-3 w-3" /> Done
      </span>
    );
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
        <Activity className="h-3 w-3" /> Active
      </span>
    );
  return <span className="text-xs text-muted-foreground">{status}</span>;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AssociateStatsDrawer({
  open,
  onClose,
  associateId,
  associateName,
  warehouseId,
  role,
}: Props) {
  const { data: stats, isLoading } = trpc.associates.getStats.useQuery(
    { associateId },
    { enabled: open && !!associateId }
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            {associateName}
            <RoleBadge role={role} />
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            ID: <span className="font-mono">{associateId}</span> · {warehouseId}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading stats…
          </div>
        )}

        {!isLoading && !stats && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No data available.
          </div>
        )}

        {!isLoading && stats && (
          <div className="flex flex-col gap-6">
            {/* KPI Cards */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Lifetime Performance
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  icon={<Activity className="h-3.5 w-3.5" />}
                  label="Sessions"
                  value={stats.totalSessions}
                  sub="completed pull sessions"
                />
                <KpiCard
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Avg Items / Hr"
                  value={stats.avgItemsPerHour ?? "—"}
                  sub={stats.avgItemsPerHour ? "items per hour" : "no completed sessions"}
                />
                <KpiCard
                  icon={<Package className="h-3.5 w-3.5" />}
                  label="Total Pallets"
                  value={stats.totalPallets}
                  sub="pallets pulled lifetime"
                />
                <KpiCard
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="Total Cases"
                  value={stats.totalCases}
                  sub="cases pulled lifetime"
                />
                <KpiCard
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Avg Duration"
                  value={stats.avgDurationMinutes != null ? `${stats.avgDurationMinutes} min` : "—"}
                  sub="per session average"
                />
                <KpiCard
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="Total Items"
                  value={stats.totalItems}
                  sub="pallets + cases combined"
                />
              </div>
            </section>

            {/* 30-day Trend Chart */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Items / Hour — Last 30 Days
              </h3>
              {stats.trend.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 flex items-center justify-center h-36 text-sm text-muted-foreground">
                  No activity in the last 30 days
                </div>
              ) : (
                <div className="rounded-lg border bg-card p-3" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.trend}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(d: string) => {
                          const dt = new Date(d + "T00:00:00");
                          return `${dt.getMonth() + 1}/${dt.getDate()}`;
                        }}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v: number) => [`${v} items/hr`, "Throughput"]}
                        labelFormatter={(d: string) => `Date: ${d}`}
                      />
                      <Bar dataKey="itemsPerHour" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Session History Table */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Recent Sessions (last 10)
              </h3>
              {stats.sessions.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 flex items-center justify-center h-24 text-sm text-muted-foreground">
                  No sessions recorded yet
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                        <th className="text-left px-3 py-2 font-medium">Pick Ticket</th>
                        <th className="text-left px-3 py-2 font-medium">Date</th>
                        <th className="text-right px-3 py-2 font-medium">Items</th>
                        <th className="text-right px-3 py-2 font-medium">Pallets</th>
                        <th className="text-right px-3 py-2 font-medium">Duration</th>
                        <th className="text-right px-3 py-2 font-medium">Items/Hr</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stats.sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 font-mono text-xs">{s.pickTicket}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(s.startedAt)}
                            <br />
                            <span className="text-[10px]">{fmtTime(s.startedAt)}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{s.totalItems}</td>
                          <td className="px-3 py-2 text-right">{s.totalPallets}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {s.durationMinutes != null ? `${s.durationMinutes}m` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {s.itemsPerHour != null ? (
                              <Badge variant="secondary" className="text-xs">
                                {s.itemsPerHour}/hr
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={s.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
