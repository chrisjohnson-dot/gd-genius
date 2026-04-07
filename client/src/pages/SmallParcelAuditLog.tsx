import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Tag,
  RefreshCw,
  Search,
  ClipboardList,
  Printer,
  PackageCheck,
  ScanBarcode,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const EVENT_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  manual_override: {
    label: "Manual Override",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  label_purchased: {
    label: "Label Purchased",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: <PackageCheck className="w-3.5 h-3.5" />,
  },
  reprint: {
    label: "Reprint",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    icon: <Printer className="w-3.5 h-3.5" />,
  },
  carrier_changed: {
    label: "Carrier Changed",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    icon: <Tag className="w-3.5 h-3.5" />,
  },
  scan_error: {
    label: "Scan Error",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    icon: <ScanBarcode className="w-3.5 h-3.5" />,
  },
};

const PAGE_SIZE = 50;

export default function SmallParcelAuditLog() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, refetch, isFetching } = trpc.smallParcel.listAuditLog.useQuery({
    eventType: eventTypeFilter !== "all" ? eventTypeFilter : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Client-side search filter on the current page
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.sku?.toLowerCase().includes(q) ||
        r.clientName?.toLowerCase().includes(q) ||
        r.userName?.toLowerCase().includes(q) ||
        String(r.extensivOrderId ?? "").includes(q) ||
        r.trackingNumber?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-600 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Small Parcel Audit Log</h1>
          <p className="text-muted-foreground text-sm">
            Tracks manual overrides, label purchases, reprints, carrier changes, and scan errors.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search SKU, order, user, tracking…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select
          value={eventTypeFilter}
          onValueChange={(v) => { setEventTypeFilter(v); setPage(0); }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All event types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            <SelectItem value="manual_override">Manual Override</SelectItem>
            <SelectItem value="label_purchased">Label Purchased</SelectItem>
            <SelectItem value="reprint">Reprint</SelectItem>
            <SelectItem value="carrier_changed">Carrier Changed</SelectItem>
            <SelectItem value="scan_error">Scan Error</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {total} event{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Events
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <ClipboardList className="w-10 h-10 opacity-30" />
              <p className="text-sm">No audit events found.</p>
              {eventTypeFilter !== "all" && (
                <Button variant="ghost" size="sm" onClick={() => setEventTypeFilter("all")}>
                  Clear filter
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Date / Time</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Event</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Transaction ID</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Client</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">SKU</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Qty</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">User</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const meta = EVENT_LABELS[row.eventType] ?? {
                      label: row.eventType,
                      color: "bg-gray-100 text-gray-700",
                      icon: null,
                    };
                    return (
                      <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}
                          >
                            {meta.icon}
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {row.extensivOrderId ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {row.clientName ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                          {row.sku ?? <span className="text-muted-foreground font-normal">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-center">
                          {row.qty != null ? row.qty : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {row.userName ?? row.userId ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                          {row.notes ?? "—"}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
