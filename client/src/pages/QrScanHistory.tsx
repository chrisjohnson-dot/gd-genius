import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  QrCode,
  Download,
  ChevronDown,
  ChevronRight,
  Send,
  Wifi,
  WifiOff,
  Pause,
  Filter,
  X,
  RefreshCw,
  FileDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  Link as LinkIcon,
  User,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDuration(startedAt: Date, closedAt: Date | null): string {
  const end = closedAt ? new Date(closedAt) : new Date();
  const diffMs = end.getTime() - new Date(startedAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return (
      <Badge className="bg-green-600/20 text-green-400 border-green-600/30 gap-1 text-[10px]">
        <Wifi className="h-2.5 w-2.5" /> Active
      </Badge>
    );
  if (status === "paused")
    return (
      <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 gap-1 text-[10px]">
        <Pause className="h-2.5 w-2.5" /> Paused
      </Badge>
    );
  return (
    <Badge className="bg-slate-600/30 text-slate-400 border-slate-600/30 gap-1 text-[10px]">
      <WifiOff className="h-2.5 w-2.5" /> Closed
    </Badge>
  );
}

// ── Session Detail Dialog ─────────────────────────────────────────────────────
function SessionDetailDialog({
  sessionId,
  open,
  onClose,
}: {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.qrScanning.getSessionDetail.useQuery(
    { sessionId },
    { enabled: open && !!sessionId }
  );
  const exportCsv = trpc.qrScanning.exportSessionCsv.useQuery(
    { sessionId },
    { enabled: false }
  );

  function handleExport() {
    exportCsv.refetch().then((res) => {
      if (res.data) {
        downloadCsv(res.data.csv, res.data.filename);
        toast.success(`Exported ${res.data.totalRows} scans to ${res.data.filename}`);
      }
    });
  }

  const session = data?.session;
  const scans = data?.scans ?? [];

  const forwardedCount = scans.filter((s) => s.forwarded).length;
  const errorCount = scans.filter((s) => !s.forwarded && s.forwardError).length;
  const pendingCount = scans.filter((s) => !s.forwarded && !s.forwardError).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-green-400" />
              Session Detail
              {session && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  — {session.customerName} · {session.sessionId.slice(0, 8)}…
                </span>
              )}
            </DialogTitle>
            {session && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={handleExport}
                disabled={exportCsv.isFetching}
              >
                <FileDown className="h-3.5 w-3.5" />
                {exportCsv.isFetching ? "Exporting…" : "Export CSV"}
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-12">
            Loading session data…
          </div>
        ) : session ? (
          <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
            {/* Session meta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="rounded-lg border border-border/50 bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-0.5">Status</div>
                <StatusBadge status={session.status} />
              </div>
              <div className="rounded-lg border border-border/50 bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-0.5">Duration</div>
                <div className="text-sm font-semibold">{formatDuration(session.startedAt, session.closedAt)}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-0.5">Line / Run</div>
                <div className="text-sm font-mono">{session.lineId} · {session.runId.slice(0, 8)}…</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-0.5">Started By</div>
                <div className="text-sm flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  {session.startedBy ?? "—"}
                </div>
              </div>
            </div>

            {/* Forwarding summary */}
            <div className="flex gap-3 shrink-0">
              <div className="flex-1 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-center">
                <div className="text-lg font-bold text-green-400">{forwardedCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Forwarded</div>
              </div>
              <div className="flex-1 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
                <div className="text-lg font-bold text-red-400">{errorCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Errors</div>
              </div>
              <div className="flex-1 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-center">
                <div className="text-lg font-bold text-yellow-400">{pendingCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Pending</div>
              </div>
              <div className="flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-center">
                <div className="text-lg font-bold">{scans.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Total</div>
              </div>
            </div>

            {/* Customer app URL */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <LinkIcon className="h-3 w-3 shrink-0" />
              <span className="font-mono truncate">{session.customerAppUrl}</span>
            </div>

            {/* Scans table */}
            <div className="flex-1 overflow-y-auto rounded border border-border/40 min-h-0">
              {scans.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 text-sm">
                  No QR scans recorded for this session.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr className="text-left text-muted-foreground uppercase">
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Carton</th>
                      <th className="px-3 py-2 font-medium">QR Data</th>
                      <th className="px-3 py-2 font-medium">Camera</th>
                      <th className="px-3 py-2 font-medium">Attempts</th>
                      <th className="px-3 py-2 font-medium">HTTP</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((s) => (
                      <tr key={s.qrScanId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                          {new Date(s.scannedAt).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-1.5 font-mono">
                          {s.cartonId ? s.cartonId.slice(0, 8) + "…" : "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono max-w-[220px]">
                          <span className="truncate block" title={s.qrData}>{s.qrData}</span>
                        </td>
                        <td className="px-3 py-1.5">{s.camera ?? "—"}</td>
                        <td className="px-3 py-1.5 text-center">{s.forwardAttempts}</td>
                        <td className="px-3 py-1.5">
                          {s.customerResponseStatus ? (
                            <span className={s.customerResponseStatus < 300 ? "text-green-400" : "text-red-400"}>
                              {s.customerResponseStatus}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {s.forwarded ? (
                            <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[9px] gap-0.5">
                              <Send className="h-2 w-2" /> Sent
                            </Badge>
                          ) : s.forwardError ? (
                            <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[9px] gap-0.5" title={s.forwardError}>
                              <AlertCircle className="h-2 w-2" /> Error
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] text-muted-foreground">
                              Pending
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-12">
            Session not found.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function QrScanHistory() {
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "paused" | "closed">("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: customerApps = [] } = trpc.qrScanning.listCustomerApps.useQuery();

  const queryInput = useMemo(() => ({
    customerId: filterCustomerId || undefined,
    status: (filterStatus || undefined) as "active" | "paused" | "closed" | undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    limit: 100,
    offset: 0,
  }), [filterCustomerId, filterStatus, filterDateFrom, filterDateTo]);

  const { data: sessions = [], isLoading, refetch } = trpc.qrScanning.listSessionHistory.useQuery(queryInput);

  // Bulk export query (lazy)
  const exportAll = trpc.qrScanning.exportAllSessionsCsv.useQuery(
    { customerId: filterCustomerId || undefined, dateFrom: filterDateFrom || undefined, dateTo: filterDateTo || undefined },
    { enabled: false }
  );

  function handleExportAll() {
    exportAll.refetch().then((res) => {
      if (res.data) {
        downloadCsv(res.data.csv, res.data.filename);
        toast.success(`Exported ${res.data.totalRows} sessions to ${res.data.filename}`);
      }
    });
  }

  function toggleExpand(sessionId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function clearFilters() {
    setFilterCustomerId("");
    setFilterStatus("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  const hasFilters = filterCustomerId || filterStatus || filterDateFrom || filterDateTo;

  // Summary stats
  const totalScanned = sessions.reduce((sum, s) => sum + s.totalScanned, 0);
  const totalForwarded = sessions.reduce((sum, s) => sum + s.totalForwarded, 0);
  const totalErrors = sessions.reduce((sum, s) => sum + s.totalErrors, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10">
            <QrCode className="h-6 w-6 text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">K18 QR Scan History</h1>
            <p className="text-sm text-muted-foreground">
              All QR scanning sessions across production runs, with per-scan forwarding audit trail.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleExportAll}
            disabled={exportAll.isFetching || sessions.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            {exportAll.isFetching ? "Exporting…" : `Export All${sessions.length > 0 ? ` (${sessions.length})` : ""}`}
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <div className="text-xs text-muted-foreground uppercase font-medium mb-0.5">Sessions</div>
              <div className="text-2xl font-bold">{sessions.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <div className="text-xs text-muted-foreground uppercase font-medium mb-0.5">QR Codes Found</div>
              <div className="text-2xl font-bold">{totalScanned.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <div className="text-xs text-green-400 uppercase font-medium mb-0.5">Forwarded</div>
              <div className="text-2xl font-bold text-green-400">{totalForwarded.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <div className="text-xs text-red-400 uppercase font-medium mb-0.5">Forward Errors</div>
              <div className="text-2xl font-bold text-red-400">{totalErrors.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            Filters
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 ml-auto" onClick={clearFilters}>
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Customer</label>
              <Select value={filterCustomerId || "all"} onValueChange={(v) => setFilterCustomerId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {customerApps.map((a) => (
                    <SelectItem key={a.customerId} value={a.customerId}>
                      {a.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v as any)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From date</label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To date</label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-10">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <QrCode className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No QR scan sessions found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasFilters ? "Try adjusting your filters." : "Enable QR scanning on the Production Line to start capturing data."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr className="text-left text-muted-foreground text-xs uppercase">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Run / Line</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium text-center">Scanned</th>
                <th className="px-4 py-3 font-medium text-center">Forwarded</th>
                <th className="px-4 py-3 font-medium text-center">Errors</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const isExpanded = expandedRows.has(session.sessionId);
                const forwardRate = session.totalScanned > 0
                  ? Math.round((session.totalForwarded / session.totalScanned) * 100)
                  : null;
                return (
                  <>
                    <tr
                      key={session.sessionId}
                      className="border-b last:border-0 hover:bg-muted/20 cursor-pointer"
                      onClick={() => toggleExpand(session.sessionId)}
                    >
                      <td className="px-4 py-3 text-muted-foreground">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{session.customerName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{session.customerId}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <div>{session.runId.slice(0, 8)}…</div>
                        <div className="text-muted-foreground">{session.lineId}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <div>{new Date(session.startedAt).toLocaleDateString()}</div>
                        <div>{new Date(session.startedAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatDuration(session.startedAt, session.closedAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{session.totalScanned}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="font-semibold text-green-400">{session.totalForwarded}</div>
                        {forwardRate !== null && (
                          <div className="text-[10px] text-muted-foreground">{forwardRate}%</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {session.totalErrors > 0 ? (
                          <span className="font-semibold text-red-400">{session.totalErrors}</span>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={session.status} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => setSelectedSessionId(session.sessionId)}
                          >
                            View
                          </Button>
                          <ExportSessionButton sessionId={session.sessionId} customerName={session.customerName} />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${session.sessionId}-expanded`} className="border-b bg-muted/10">
                        <td colSpan={10} className="px-6 py-3">
                          <ExpandedSessionRow sessionId={session.sessionId} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Session detail dialog */}
      {selectedSessionId && (
        <SessionDetailDialog
          sessionId={selectedSessionId}
          open={!!selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </div>
  );
}

// ── Inline export button (lazy per-session) ───────────────────────────────────
function ExportSessionButton({ sessionId, customerName }: { sessionId: string; customerName: string }) {
  const exportCsv = trpc.qrScanning.exportSessionCsv.useQuery(
    { sessionId },
    { enabled: false }
  );
  function handleExport() {
    exportCsv.refetch().then((res) => {
      if (res.data) {
        downloadCsv(res.data.csv, res.data.filename);
        toast.success(`Exported ${res.data.totalRows} scans — ${customerName}`);
      }
    });
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
      onClick={handleExport}
      disabled={exportCsv.isFetching}
      title="Export this session as CSV"
    >
      <FileDown className="h-3.5 w-3.5" />
    </Button>
  );
}

// ── Expanded inline row showing last 5 scans ─────────────────────────────────
function ExpandedSessionRow({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = trpc.qrScanning.listScans.useQuery(
    { sessionId, limit: 5 },
    { staleTime: 10000 }
  );
  if (isLoading) return <div className="text-xs text-muted-foreground">Loading…</div>;
  if (!data || data.length === 0) return <div className="text-xs text-muted-foreground">No scans recorded.</div>;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1.5">Last {data.length} QR Scans</div>
      <div className="rounded border border-border/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-background border-b">
            <tr className="text-left text-muted-foreground uppercase">
              <th className="px-3 py-1.5 font-medium">Time</th>
              <th className="px-3 py-1.5 font-medium">Carton</th>
              <th className="px-3 py-1.5 font-medium">QR Data</th>
              <th className="px-3 py-1.5 font-medium">Camera</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.qrScanId} className="border-b last:border-0">
                <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">
                  {new Date(s.scannedAt).toLocaleTimeString()}
                </td>
                <td className="px-3 py-1 font-mono">{s.cartonId ? s.cartonId.slice(0, 8) + "…" : "—"}</td>
                <td className="px-3 py-1 font-mono max-w-[240px] truncate">{s.qrData}</td>
                <td className="px-3 py-1">{s.camera ?? "—"}</td>
                <td className="px-3 py-1">
                  {s.forwarded ? (
                    <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[9px] gap-0.5">
                      <Send className="h-2 w-2" /> Sent
                    </Badge>
                  ) : s.forwardError ? (
                    <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[9px]">Error</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">Pending</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
