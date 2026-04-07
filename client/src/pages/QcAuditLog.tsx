import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ScanLine,
  Tag,
  User,
  Calendar,
  Package,
  ArrowUpDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AuditEvent = {
  id: string;
  eventType: "qc_scan" | "label_scan";
  sessionId: number;
  referenceNumber: string | null;
  customerName: string | null;
  warehouseName: string | null;
  createdBy: string | null;
  sku: string | null;
  barcode: string | null;
  scannedQty: number | null;
  status: string | null;
  scannedAt: Date;
  sessionCreatedAt: Date;
};

type SortKey = "scannedAt" | "eventType" | "createdBy" | "customerName" | "referenceNumber";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function EventTypeBadge({ type }: { type: "qc_scan" | "label_scan" }) {
  if (type === "qc_scan") {
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1 font-medium">
        <ScanLine className="w-3 h-3" />
        QC Scan
      </Badge>
    );
  }
  return (
    <Badge className="bg-purple-100 text-purple-800 border-purple-200 gap-1 font-medium">
      <Tag className="w-3 h-3" />
      Label Scan
    </Badge>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const map: Record<string, string> = {
    complete: "bg-green-100 text-green-800 border-green-200",
    complete_with_exceptions: "bg-yellow-100 text-yellow-800 border-yellow-200",
    scanning: "bg-blue-100 text-blue-800 border-blue-200",
    active: "bg-blue-100 text-blue-800 border-blue-200",
    stopped: "bg-red-100 text-red-800 border-red-200",
    shipped: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return <Badge className={`${cls} text-xs font-medium capitalize`}>{status.replace(/_/g, " ")}</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

export default function QcAuditLog() {
  // Filter state
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const [fromDate, setFromDate] = useState<Date>(thirtyDaysAgo);
  const [toDate, setToDate] = useState<Date>(today);
  const [userFilter, setUserFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<"all" | "qc_scan" | "label_scan">("all");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("scannedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Applied filters (submitted on search)
  const [appliedFrom, setAppliedFrom] = useState<Date>(thirtyDaysAgo);
  const [appliedTo, setAppliedTo] = useState<Date>(today);
  const [appliedUser, setAppliedUser] = useState("");
  const [appliedItem, setAppliedItem] = useState("");

  const { data, isLoading, refetch, isFetching } = trpc.qcScanner.listAuditLog.useQuery(
    {
      fromDate: appliedFrom,
      toDate: appliedTo,
      user: appliedUser || undefined,
      item: appliedItem || undefined,
      limit: 2000, // fetch all matching, paginate client-side
      offset: 0,
    },
    { refetchOnWindowFocus: false }
  );

  const allEvents: AuditEvent[] = (data?.events ?? []) as AuditEvent[];

  // Client-side filter by event type
  const typeFiltered = useMemo(() => {
    if (eventTypeFilter === "all") return allEvents;
    return allEvents.filter((e) => e.eventType === eventTypeFilter);
  }, [allEvents, eventTypeFilter]);

  // Sort
  const sorted = useMemo(() => {
    return [...typeFiltered].sort((a, b) => {
      let av: string | number | Date = a[sortKey] ?? "";
      let bv: string | number | Date = b[sortKey] ?? "";
      if (av instanceof Date) av = av.getTime();
      if (bv instanceof Date) bv = bv.getTime();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [typeFiltered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageEvents = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSearch() {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
    setAppliedUser(userFilter);
    setAppliedItem(itemFilter);
    setPage(0);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 text-muted-foreground ml-1 inline" />;
    return (
      <span className="ml-1 inline text-primary">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  // KPI counts
  const qcCount = allEvents.filter((e) => e.eventType === "qc_scan").length;
  const labelCount = allEvents.filter((e) => e.eventType === "label_scan").length;
  const uniqueUsers = new Set(allEvents.map((e) => e.createdBy).filter(Boolean)).size;
  const uniqueRefs = new Set(allEvents.map((e) => e.referenceNumber).filter(Boolean)).size;

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">QC / Audit Log</div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              QC Audit Log
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <ScanLine className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{qcCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">QC Scan Events</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
                <Tag className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{labelCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Label Scan Events</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                <User className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{uniqueUsers}</div>
                <div className="text-xs text-muted-foreground">Unique Users</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{uniqueRefs}</div>
                <div className="text-xs text-muted-foreground">Unique Orders</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter bar */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* From date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> From
                </label>
                <Input
                  type="date"
                  value={formatDateInput(fromDate)}
                  onChange={(e) => setFromDate(new Date(e.target.value))}
                  className="h-9 text-sm"
                />
              </div>
              {/* To date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> To
                </label>
                <Input
                  type="date"
                  value={formatDateInput(toDate)}
                  onChange={(e) => setToDate(new Date(e.target.value))}
                  className="h-9 text-sm"
                />
              </div>
              {/* User */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" /> User
                </label>
                <Input
                  placeholder="Search by user..."
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-9 text-sm"
                />
              </div>
              {/* Item / Order */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Package className="w-3 h-3" /> Item / Order / Client
                </label>
                <Input
                  placeholder="SKU, barcode, order ref..."
                  value={itemFilter}
                  onChange={(e) => setItemFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-9 text-sm"
                />
              </div>
              {/* Search button */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground opacity-0">Search</label>
                <Button onClick={handleSearch} className="h-9 gap-2">
                  <Search className="w-4 h-4" />
                  Search
                </Button>
              </div>
            </div>
            {/* Event type filter */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground font-medium">Event type:</span>
              {(["all", "qc_scan", "label_scan"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setEventTypeFilter(t); setPage(0); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    eventTypeFilter === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {t === "all" ? "All" : t === "qc_scan" ? "QC Scan" : "Label Scan"}
                </button>
              ))}
              {sorted.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {sorted.length.toLocaleString()} event{sorted.length !== 1 ? "s" : ""} found
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Scan Events
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Loading audit log...
              </div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <ClipboardList className="w-10 h-10 opacity-30" />
                <p className="text-sm">No scan events found for the selected filters.</p>
                <p className="text-xs opacity-70">Try expanding the date range or clearing the filters.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => handleSort("scannedAt")}
                        >
                          Scanned At <SortIcon k="scannedAt" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("eventType")}
                        >
                          Type <SortIcon k="eventType" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("createdBy")}
                        >
                          User <SortIcon k="createdBy" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("referenceNumber")}
                        >
                          Order / Ref <SortIcon k="referenceNumber" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("customerName")}
                        >
                          Client <SortIcon k="customerName" />
                        </TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Item / Barcode</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Session</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageEvents.map((event) => (
                        <TableRow key={event.id} className="hover:bg-muted/20 text-sm">
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDate(event.scannedAt)}
                          </TableCell>
                          <TableCell>
                            <EventTypeBadge type={event.eventType} />
                          </TableCell>
                          <TableCell>
                            {event.createdBy ? (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm">{event.createdBy}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {event.referenceNumber ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {event.customerName ?? <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {event.warehouseName ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {event.sku ? (
                              <span className="flex items-center gap-1">
                                <ScanLine className="w-3 h-3 text-blue-500" />
                                {event.sku}
                              </span>
                            ) : event.barcode ? (
                              <span className="flex items-center gap-1">
                                <Tag className="w-3 h-3 text-purple-500" />
                                {event.barcode}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {event.scannedQty != null ? (
                              <span className="font-semibold">{event.scannedQty}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={event.status} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            #{event.sessionId}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      Page {page + 1} of {totalPages} &nbsp;·&nbsp;{" "}
                      {sorted.length.toLocaleString()} total events
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
