/**
 * AlertHistoryTab
 *
 * Displays the Behind pace alert history with:
 *  - 4 KPI stat cards (total alerts, resolved, avg duration, top offender)
 *  - Filters: warehouse, associate name search, date range
 *  - Paginated table with session details, duration, and recovery status
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bell,
  CheckCircle2,
  Clock,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
} from "lucide-react";

const PAGE_SIZE = 25;

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  warehouses: string[];
}

export function AlertHistoryTab({ warehouses }: Props) {
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [associateSearch, setAssociateSearch] = useState("");
  const [debouncedAssociate, setDebouncedAssociate] = useState("");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [page, setPage] = useState(0);

  // Debounce associate search
  const handleAssociateChange = (v: string) => {
    setAssociateSearch(v);
    clearTimeout((handleAssociateChange as any)._t);
    (handleAssociateChange as any)._t = setTimeout(() => {
      setDebouncedAssociate(v);
      setPage(0);
    }, 400);
  };

  const queryInput = useMemo(() => ({
    warehouseId: warehouseFilter === "all" ? undefined : warehouseFilter,
    associateName: debouncedAssociate || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
    dateTo: dateTo ? new Date(dateTo + "T23:59:59").getTime() : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [warehouseFilter, debouncedAssociate, dateFrom, dateTo, page]);

  const statsInput = useMemo(() => ({
    warehouseId: warehouseFilter === "all" ? undefined : warehouseFilter,
    dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
    dateTo: dateTo ? new Date(dateTo + "T23:59:59").getTime() : undefined,
  }), [warehouseFilter, dateFrom, dateTo]);

  const { data: historyData, isLoading } = trpc.pullAlerts.listAlertHistory.useQuery(queryInput);
  const { data: stats } = trpc.pullAlerts.alertHistoryStats.useQuery(statsInput);

  const rows = historyData?.rows ?? [];
  const total = historyData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Bell className="h-3.5 w-3.5 text-red-500" />
              Total Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold">{stats?.totalAlerts ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold">{stats?.resolvedAlerts ?? "—"}</p>
            {stats && stats.totalAlerts > 0 && (
              <p className="text-xs text-muted-foreground">
                {Math.round((stats.resolvedAlerts / stats.totalAlerts) * 100)}% recovery rate
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              Avg Duration Behind
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold">
              {stats?.avgDurationSeconds != null
                ? formatDuration(stats.avgDurationSeconds)
                : "—"}
            </p>
            {stats?.maxDurationSeconds != null && (
              <p className="text-xs text-muted-foreground">
                Max: {formatDuration(stats.maxDurationSeconds)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              Top Offender
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {stats?.topOffenders?.[0] ? (
              <>
                <p className="text-sm font-semibold truncate">
                  {stats.topOffenders[0].associateName || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.topOffenders[0].alertCount} alerts
                  {stats.topOffenders[0].avgDurationSeconds != null &&
                    ` · avg ${formatDuration(stats.topOffenders[0].avgDurationSeconds)}`}
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Offenders mini-list ── */}
      {stats?.topOffenders && stats.topOffenders.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Top Associates by Alert Count
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {stats.topOffenders.map((o, i) => (
                <div key={o.associateName} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-muted-foreground text-xs font-mono">{i + 1}.</span>
                  <span className="flex-1 truncate">{o.associateName || "Unknown"}</span>
                  <Badge variant="destructive" className="text-xs">{o.alertCount}</Badge>
                  {o.avgDurationSeconds != null && (
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      avg {formatDuration(o.avgDurationSeconds)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <p className="text-xs text-muted-foreground mb-1">Warehouse</p>
          <Select value={warehouseFilter} onValueChange={(v) => { setWarehouseFilter(v); setPage(0); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <p className="text-xs text-muted-foreground mb-1">Associate</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              className="h-8 text-xs pl-6"
              placeholder="Search name…"
              value={associateSearch}
              onChange={(e) => handleAssociateChange(e.target.value)}
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">From</p>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
          />
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">To</p>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Associate</TableHead>
                <TableHead className="text-xs">Warehouse</TableHead>
                <TableHead className="text-xs">Pick Ticket</TableHead>
                <TableHead className="text-xs">Alerted At</TableHead>
                <TableHead className="text-xs">Items/hr at Alert</TableHead>
                <TableHead className="text-xs">Duration Behind</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No alerts found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm font-medium">
                      {row.associateName || <span className="text-muted-foreground italic">Unknown</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{row.warehouseId || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {row.pickTicket || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span title={formatTs(row.alertedAt)}>{formatRelative(row.alertedAt)}</span>
                      <br />
                      <span className="text-muted-foreground">{formatTs(row.alertedAt)}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.itemsPerHourAtAlert != null
                        ? <span className="text-red-500 font-medium">{row.itemsPerHourAtAlert.toFixed(1)}/hr</span>
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.durationBehindSeconds != null
                        ? <span className={row.durationBehindSeconds > 600 ? "text-red-500 font-medium" : ""}>
                            {formatDuration(row.durationBehindSeconds)}
                          </span>
                        : <span className="text-amber-500 italic">ongoing</span>}
                    </TableCell>
                    <TableCell>
                      {row.recoveredAt != null ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                          Recovered
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">
                          Behind
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} alerts
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
