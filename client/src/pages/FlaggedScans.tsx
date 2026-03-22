import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Flag, CheckCircle2, Search, AlertTriangle } from "lucide-react";

export default function FlaggedScans() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");

  const { data: flags = [], isLoading, refetch } = trpc.qcScanner.listFlaggedScans.useQuery(
    { status: statusFilter === "all" ? undefined : statusFilter },
    { refetchInterval: 30_000 }
  );

  const resolve = trpc.qcScanner.resolveFlaggedScan.useMutation({
    onSuccess: () => {
      toast.success("Flagged scan resolved");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = flags.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.upc?.toLowerCase().includes(q) ||
      f.sku?.toLowerCase().includes(q) ||
      f.description?.toLowerCase().includes(q) ||
      f.referenceNumber?.toLowerCase().includes(q) ||
      f.flaggedBy?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="w-6 h-6 text-amber-500" />
            Flagged Scans
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Unrecognised barcodes flagged during QC scanning sessions
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 w-48"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-500">
            {flags.filter((f) => f.status === "open").length}
          </div>
          <div className="text-sm text-muted-foreground">Open Flags</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-2xl font-bold text-green-500">
            {flags.filter((f) => f.status === "resolved").length}
          </div>
          <div className="text-sm text-muted-foreground">Resolved</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-2xl font-bold">{flags.length}</div>
          <div className="text-sm text-muted-foreground">Total (current filter)</div>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Barcode / UPC</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Reference #</TableHead>
              <TableHead>Flagged By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Flag className="w-8 h-8 opacity-30" />
                    <span>No flagged scans{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="font-mono text-sm">{flag.upc ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{flag.sku ?? "—"}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{flag.description ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{flag.referenceNumber ?? "—"}</TableCell>
                  <TableCell className="text-sm">{flag.flaggedBy ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {flag.createdAt ? new Date(flag.createdAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    {flag.status === "open" ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-600">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Open
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-green-400 text-green-600">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolved
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {flag.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve.mutate({ id: flag.id })}
                        disabled={resolve.isPending}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                    )}
                    {flag.status === "resolved" && (
                      <span className="text-xs text-muted-foreground">
                        by {flag.resolvedBy ?? "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
