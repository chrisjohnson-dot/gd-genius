import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart2,
  Clock,
  Package,
  Layers,
  RefreshCw,
  Eye,
  Send,
  TrendingUp,
  AlertCircle,
  Download,
  Filter,
  Loader2,
  X,
} from "lucide-react";
import { PullAlertBell } from "@/components/ltl/PullAlertBell";
import { PullAlertSettings } from "@/components/ltl/PullAlertSettings";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

/** Convert a local date string (YYYY-MM-DD) to start-of-day UTC ms */
function dateStrToMs(dateStr: string, endOfDay = false): number {
  if (!dateStr) return 0;
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return dt.getTime();
}

/** Format ms timestamp as YYYY-MM-DD for <input type="date"> */
function msToDateStr(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-500/20",
  completed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  cancelled: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

// ─── CSV Download helper ──────────────────────────────────────────────────────
function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export Dialog ────────────────────────────────────────────────────────────
function ExportDialog({
  open,
  onClose,
  warehouseOptions,
}: {
  open: boolean;
  onClose: () => void;
  warehouseOptions: string[];
}) {
  const today = msToDateStr(Date.now());
  const thirtyDaysAgo = msToDateStr(Date.now() - 30 * 24 * 3600 * 1000);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [warehouse, setWarehouse] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "completed" | "cancelled">("all");
  const [isExporting, setIsExporting] = useState(false);

  const utils = trpc.useUtils();

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await utils.pullTracker.exportSessions.fetch({
        warehouseId: warehouse !== "all" ? warehouse : undefined,
        status,
        dateFrom: dateFrom ? dateStrToMs(dateFrom, false) : undefined,
        dateTo: dateTo ? dateStrToMs(dateTo, true) : undefined,
      });

      if (!result || result.rowCount === 0) {
        toast.warning("No sessions matched the selected filters.");
        setIsExporting(false);
        return;
      }

      const fromLabel = dateFrom.replace(/-/g, "");
      const toLabel = dateTo.replace(/-/g, "");
      const whLabel = warehouse !== "all" ? `_${warehouse}` : "";
      const filename = `pull-sessions${whLabel}_${fromLabel}-${toLabel}.csv`;

      downloadCsv(result.csv, filename);
      toast.success(`Exported ${result.rowCount} session${result.rowCount !== 1 ? "s" : ""}`);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [utils, warehouse, status, dateFrom, dateTo, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Pull Sessions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Warehouse */}
          <div className="space-y-1.5">
            <Label className="text-xs">Warehouse</Label>
            <Select value={warehouse} onValueChange={setWarehouse}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All Warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warehouses</SelectItem>
                {warehouseOptions.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Exports up to 5,000 sessions as a CSV file with Session ID, Pick Ticket,
            Associate, Warehouse, Status, Timestamps, Duration, Pallets, Cases, Items/hr,
            OpFi status, and Notes.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="bg-[#15527f] hover:bg-[#1a6699] text-white gap-2"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Exporting…" : "Download CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Session Detail Dialog ────────────────────────────────────────────────────
function SessionDetailDialog({
  sessionId,
  open,
  onClose,
}: {
  sessionId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: session, isLoading } = trpc.pullTracker.getSession.useQuery(
    { sessionId: sessionId! },
    { enabled: sessionId !== null && open }
  );
  const retryPush = trpc.pullTracker.retryOpFiPush.useMutation({
    onSuccess: () => toast.success("Pushed to OpFi successfully"),
    onError: (e) => toast.error(e.message),
  });

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session Detail</DialogTitle>
        </DialogHeader>
        {isLoading || !session ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Pick Ticket", session.pickTicket],
                ["Associate", session.associateName || session.associateId],
                ["Associate ID", session.associateId],
                ["Warehouse", session.warehouseId],
                ["Status", session.status],
                ["Started", formatTime(session.startedAt)],
                ["Ended", formatTime(session.endedAt)],
                ["Duration", formatDuration(session.durationSeconds)],
                ["Pallets", String(session.totalPallets)],
                ["Cases", String(session.totalCases)],
                ["Total Items", String(session.totalItems)],
                ["OpFi", session.opfiPushed ? "Sent ✓" : "Not sent"],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold truncate">{value}</p>
                </div>
              ))}
            </div>

            {!session.opfiPushed && session.status === "completed" && (
              <Button
                onClick={() => retryPush.mutate({ sessionId: session.id })}
                disabled={retryPush.isPending}
                className="w-full gap-2"
                variant="outline"
              >
                <Send className="h-4 w-4" />
                {retryPush.isPending ? "Pushing…" : "Retry OpFi Push"}
              </Button>
            )}

            {session.items && session.items.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Scanned Items ({session.items.length})
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {session.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-1.5 text-xs">
                      <Badge variant="outline" className="capitalize text-[10px]">{item.itemType}</Badge>
                      <span className="font-mono truncate flex-1">{item.barcode || item.sku || "—"}</span>
                      <span className="font-semibold">×{item.quantity}</span>
                      <span className="text-muted-foreground">{new Date(item.scannedAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PullManager() {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [associateFilter, setAssociateFilter] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: sessions = [], isLoading, refetch } = trpc.pullTracker.listSessions.useQuery({
    status: statusFilter,
    associateId: associateFilter.trim() || undefined,
    limit: 100,
  }, { refetchInterval: 30000 });

  const { data: stats = [] } = trpc.pullTracker.associateStats.useQuery({}, { refetchInterval: 60000 });

  const activeSessions = sessions.filter(s => s.status === "active");
  const totalPallets = sessions.filter(s => s.status === "completed").reduce((sum, s) => sum + s.totalPallets, 0);
  const totalCases = sessions.filter(s => s.status === "completed").reduce((sum, s) => sum + s.totalCases, 0);
  const avgDuration = sessions.filter(s => s.durationSeconds).length > 0
    ? Math.round(sessions.filter(s => s.durationSeconds).reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / sessions.filter(s => s.durationSeconds).length)
    : 0;

  // Unique warehouses from session list for export dialog
  const warehouseOptions = Array.from(new Set(sessions.map(s => s.warehouseId))).sort();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pull Manager</h1>
          <p className="text-sm text-muted-foreground">Monitor warehouse associate pull sessions and efficiency</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PullAlertBell />
          <PullAlertSettings />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="gap-2 border-emerald-500/50 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Sessions", value: activeSessions.length, icon: AlertCircle, color: "text-green-600", bg: "bg-green-500/10" },
          { label: "Total Pallets", value: totalPallets, icon: Layers, color: "text-purple-600", bg: "bg-purple-500/10" },
          { label: "Total Cases", value: totalCases, icon: Package, color: "text-blue-600", bg: "bg-blue-500/10" },
          { label: "Avg Duration", value: formatDuration(avgDuration), icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Associate Efficiency */}
      {stats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#15527f]" />
              Associate Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Associate</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Pallets</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="text-right">Total Items</TableHead>
                  <TableHead className="text-right">Items/hr</TableHead>
                  <TableHead className="text-right">Avg Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((s) => (
                  <TableRow key={s.associateId}>
                    <TableCell>
                      <div>
                        <p className="font-semibold">{s.associateName || s.associateId}</p>
                        <p className="text-xs text-muted-foreground font-mono">{s.associateId}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{s.sessionCount}</TableCell>
                    <TableCell className="text-right">{s.totalPallets}</TableCell>
                    <TableCell className="text-right">{s.totalCases}</TableCell>
                    <TableCell className="text-right font-semibold">{s.totalItems}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-bold ${s.itemsPerHour > 20 ? "text-green-600" : s.itemsPerHour > 10 ? "text-amber-600" : "text-red-600"}`}>
                        {s.itemsPerHour.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDuration(s.avgSecondsPerSession)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Session History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-[#15527f]" />
              Session History
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Filter by associate ID…"
                value={associateFilter}
                onChange={(e) => setAssociateFilter(e.target.value)}
                className="h-8 w-44 text-sm"
              />
              {(["all", "active", "completed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    statusFilter === s
                      ? "bg-[#15527f] text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No sessions found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pick Ticket</TableHead>
                  <TableHead>Associate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Pallets</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>OpFi</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono font-semibold text-sm">{s.pickTicket}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{s.associateName || s.associateId}</p>
                        <p className="text-xs text-muted-foreground font-mono">{s.associateId}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLORS[s.status] ?? ""}`}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{s.totalPallets}</TableCell>
                    <TableCell className="text-right">{s.totalCases}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatDuration(s.durationSeconds)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {s.opfiPushed ? (
                        <span className="text-xs text-green-600 font-semibold">Sent ✓</span>
                      ) : s.status === "completed" ? (
                        <span className="text-xs text-amber-600">Pending</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => { setSelectedSessionId(s.id); setDetailOpen(true); }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SessionDetailDialog
        sessionId={selectedSessionId}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedSessionId(null); }}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        warehouseOptions={warehouseOptions}
      />
    </div>
  );
}
