import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  ClipboardList,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Tag,
  Warehouse,
  Package,
  CloudUpload,
  ScanLine,
  CalendarDays,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type MuLabelEntry = { muLabel: string; muType: string; qty: number };

type PutAwayRow = {
  id: number;
  configId: number;
  facilityId: number;
  facilityName?: string | null;
  customerId: number;
  customerName?: string | null;
  sku: string;
  description?: string | null;
  lotNumber?: string | null;
  expirationDate?: string | null;
  confirmedLocation?: string | null;
  confirmedLocationType?: "pick_face" | "warehouse" | "staging" | null;
  qty: number;
  sessionId: string;
  transactionId?: number | null;
  commitMode?: "extensiv" | "scan" | null;
  scannedAt: Date | string;
  muLabels: MuLabelEntry[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function CommitModeBadge({ mode }: { mode?: "extensiv" | "scan" | null }) {
  if (mode === "extensiv") {
    return (
      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs gap-1">
        <CloudUpload className="h-3 w-3" /> Genius
      </Badge>
    );
  }
  if (mode === "scan") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs gap-1">
        <ScanLine className="h-3 w-3" /> Operator
      </Badge>
    );
  }
  return <Badge variant="secondary" className="text-xs">—</Badge>;
}

function LocationTypeBadge({ type }: { type?: "pick_face" | "warehouse" | "staging" | null }) {
  if (type === "pick_face") {
    return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Pick Face</Badge>;
  }
  if (type === "warehouse") {
    return <Badge className="bg-muted text-muted-foreground border-border text-xs">Warehouse</Badge>;
  }
  if (type === "staging") {
    return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">Staging</Badge>;
  }
  return null;
}

// ─── Print ─────────────────────────────────────────────────────────────────

function printList(rows: PutAwayRow[], title: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p.sub { font-size: 11px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f0f0f0; text-align: left; padding: 6px 8px; border: 1px solid #ccc; font-size: 11px; }
        td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }
        .mu { font-family: monospace; font-size: 11px; color: #333; }
        .loc { font-family: monospace; font-weight: bold; }
        @media print { @page { margin: 15mm; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p class="sub">Generated ${new Date().toLocaleString()} · ${rows.length} row${rows.length !== 1 ? "s" : ""}</p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>SKU</th>
            <th>Description</th>
            <th>Qty</th>
            <th>MU(s)</th>
            <th>Location</th>
            <th>Customer</th>
            <th>Warehouse</th>
            <th>Lot</th>
            <th>Exp. Date</th>
            <th>Mode</th>
            <th>Date/Time</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="mu">${r.sku}</td>
              <td>${r.description ?? ""}</td>
              <td>${r.qty}</td>
              <td class="mu">${r.muLabels.map((m) => m.muLabel).join(", ") || "—"}</td>
              <td class="loc">${r.confirmedLocation ?? "—"}</td>
              <td>${r.customerName ?? "—"}</td>
              <td>${r.facilityName ?? "—"}</td>
              <td>${r.lotNumber ?? "—"}</td>
              <td>${r.expirationDate ? new Date(r.expirationDate).toLocaleDateString() : "—"}</td>
              <td>${r.commitMode === "extensiv" ? "Genius" : r.commitMode === "scan" ? "Operator" : "—"}</td>
              <td>${formatDate(r.scannedAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </body>
    </html>
  `;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function PutAwayList() {
  // Config
  const configQuery = trpc.config.list.useQuery();
  const configs = configQuery.data ?? [];
  const defaultConfigId = configs[0]?.id ?? null;
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const configId = selectedConfigId ?? defaultConfigId;

  // Filters
  const [search, setSearch] = useState("");
  const [commitModeFilter, setCommitModeFilter] = useState<"all" | "extensiv" | "scan">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Query
  const listQuery = trpc.putAway.putAwayList.useQuery(
    {
      configId: configId!,
      commitMode: commitModeFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
      limit: 500,
    },
    { enabled: !!configId, staleTime: 30_000 }
  );

  const rows: PutAwayRow[] = (listQuery.data ?? []) as PutAwayRow[];

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.confirmedLocation ?? "").toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q) ||
        (r.facilityName ?? "").toLowerCase().includes(q) ||
        r.muLabels.some((m) => m.muLabel.toLowerCase().includes(q))
    );
  }, [rows, search]);

  // Unique warehouses and customers for info display
  const warehouses = useMemo(() => Array.from(new Set(rows.map((r) => r.facilityName ?? "Unknown"))).sort(), [rows]);
  const customers = useMemo(() => Array.from(new Set(rows.map((r) => r.customerName ?? "Unknown"))).sort(), [rows]);

  const handlePrint = () => {
    const title = "Put Away List";
    printList(filtered, title);
  };

  return (
    <div className="p-5 space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="page-breadcrumb">Receiving</p>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Put Away List
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All SKUs, MUs, and locations committed via the Put Away Wizard.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            {listQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={handlePrint}
            disabled={filtered.length === 0}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Config selector (if multiple configs) */}
      {configs.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Config:</span>
          <Select
            value={String(configId ?? "")}
            onValueChange={(v) => setSelectedConfigId(Number(v))}
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Select config" />
            </SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                  {c.name ?? `Config #${c.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, location, MU…"
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Commit mode */}
        <Select value={commitModeFilter} onValueChange={(v) => setCommitModeFilter(v as typeof commitModeFilter)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All modes</SelectItem>
            <SelectItem value="extensiv" className="text-xs">Genius only</SelectItem>
            <SelectItem value="scan" className="text-xs">Operator scan only</SelectItem>
          </SelectContent>
        </Select>

        {/* Date from */}
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-36 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-36 text-xs"
          />
        </div>

        {/* Clear filters */}
        {(search || commitModeFilter !== "all" || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setSearch(""); setCommitModeFilter("all"); setDateFrom(""); setDateTo(""); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Summary chips */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />
            {filtered.length} row{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== rows.length && ` (of ${rows.length})`}
          </span>
          {warehouses.length > 0 && (
            <span className="flex items-center gap-1">
              <Warehouse className="h-3.5 w-3.5" />
              {warehouses.join(", ")}
            </span>
          )}
          {customers.length > 0 && (
            <span className="flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              {customers.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {listQuery.isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading put-away records…</span>
        </div>
      )}

      {/* Error */}
      {listQuery.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          Failed to load put-away list. Please refresh.
        </div>
      )}

      {/* Empty state */}
      {!listQuery.isLoading && !listQuery.isError && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No put-away records found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {rows.length === 0
              ? "Put-aways committed via the wizard will appear here."
              : "No records match the current filters."}
          </p>
        </div>
      )}

      {/* Table */}
      {!listQuery.isLoading && filtered.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold w-10">#</TableHead>
                <TableHead className="text-xs font-semibold">SKU</TableHead>
                <TableHead className="text-xs font-semibold">Description</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
                <TableHead className="text-xs font-semibold">MU(s)</TableHead>
                <TableHead className="text-xs font-semibold">Location</TableHead>
                <TableHead className="text-xs font-semibold">Customer</TableHead>
                <TableHead className="text-xs font-semibold">Warehouse</TableHead>
                <TableHead className="text-xs font-semibold">Lot</TableHead>
                <TableHead className="text-xs font-semibold">Exp. Date</TableHead>
                <TableHead className="text-xs font-semibold">Mode</TableHead>
                <TableHead className="text-xs font-semibold">Date / Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, idx) => (
                <TableRow key={row.id} className="hover:bg-muted/20">
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-foreground">{row.sku}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                    {row.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">{row.qty}</TableCell>
                  <TableCell>
                    {row.muLabels.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {row.muLabels.map((m) => (
                          <span key={m.muLabel} className="font-mono text-xs text-primary">
                            {m.muLabel}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {row.confirmedLocation ?? "—"}
                      </span>
                      {row.confirmedLocationType && (
                        <LocationTypeBadge type={row.confirmedLocationType} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.customerName ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.facilityName ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{row.lotNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.expirationDate ? new Date(row.expirationDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <CommitModeBadge mode={row.commitMode} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(row.scannedAt)}
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
