import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, RefreshCw, Truck, Download, Printer, FileCheck,
  FileX, ClipboardList, CheckCircle2, AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PickupSession {
  id: number;
  transactionId: number | null;
  referenceNum: string | null;
  clientName: string | null;
  shipToName: string | null;
  carrierName: string | null;
  driverName: string | null;
  trailerNumber: string | null;
  sealNumber: string | null;
  proNumber: string | null;
  status: string;
  shippedInExtensiv: boolean | null;
  isDemo: boolean;
  bolUrl: string | null;
  signedBolUrl: string | null;
  expectedPallets: number | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function BolCell({ session }: { session: PickupSession }) {
  const url = session.signedBolUrl ?? session.bolUrl;
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <FileX className="h-3.5 w-3.5" /> No BOL
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {session.signedBolUrl ? (
        <Badge variant="outline" className="text-[10px] border-green-500 text-green-700 dark:text-green-400 px-1.5 py-0 shrink-0">
          <FileCheck className="h-3 w-3 mr-0.5" /> Signed
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] border-indigo-400 text-indigo-600 dark:text-indigo-400 px-1.5 py-0 shrink-0">
          Draft
        </Badge>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="View BOL"
      >
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
          <Download className="h-3.5 w-3.5" />
          View
        </Button>
      </a>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        title="Print BOL"
        onClick={() => {
          const win = window.open(url, "_blank");
          win?.print();
        }}
      >
        <Printer className="h-3.5 w-3.5" />
        Print
      </Button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CarrierPickupHistory() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "scanning">("all");

  const { data, isLoading, refetch, isFetching } = trpc.carrierPickup.listHistory.useQuery(
    { limit: 200 },
    { refetchOnWindowFocus: false }
  );

  const sessions: PickupSession[] = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.referenceNum?.toLowerCase().includes(q) ||
        s.clientName?.toLowerCase().includes(q) ||
        s.driverName?.toLowerCase().includes(q) ||
        s.trailerNumber?.toLowerCase().includes(q) ||
        s.carrierName?.toLowerCase().includes(q) ||
        s.proNumber?.toLowerCase().includes(q) ||
        String(s.transactionId ?? "").includes(q)
      );
    });
  }, [sessions, search, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-blue-600" /> Carrier Pickup History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View past pickup sessions and reprint BOLs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search ref, customer, driver, trailer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(["all", "complete", "scanning"] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className="h-9 capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s === "complete" ? "Completed" : "In Progress"}
            </Button>
          ))}
        </div>
        {filtered.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} session{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No sessions found</p>
          <p className="text-sm mt-1">
            {search || statusFilter !== "all"
              ? "Try adjusting your filters."
              : "Carrier pickup sessions will appear here once created."}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[90px]">Date</TableHead>
                <TableHead>Order / Ref</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Trailer</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead className="w-[80px] text-center">Pallets</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[180px]">BOL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className="text-sm">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(s.completedAt ?? s.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{s.referenceNum ?? "—"}</div>
                    {s.transactionId && (
                      <div className="text-xs text-muted-foreground">TX {s.transactionId}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{s.clientName ?? "—"}</div>
                    {s.shipToName && (
                      <div className="text-xs text-muted-foreground truncate max-w-[160px]">{s.shipToName}</div>
                    )}
                  </TableCell>
                  <TableCell>{s.driverName ?? "—"}</TableCell>
                  <TableCell>{s.trailerNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.carrierName ?? "—"}</TableCell>
                  <TableCell className="text-center">{s.expectedPallets ?? "—"}</TableCell>
                  <TableCell>
                    {s.isDemo ? (
                      <Badge variant="outline" className="text-xs">Demo</Badge>
                    ) : s.status === "complete" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {s.shippedInExtensiv ? "Shipped" : "Complete"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        In Progress
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <BolCell session={s} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
