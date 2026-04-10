import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Package,
  Printer,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  Hash,
  Search,
  X,
} from "lucide-react";
import { useDirectPrint } from "@/hooks/useDirectPrint";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Session {
  id: number;
  referenceNum: string | null;
  clientName: string | null;
  facilityName: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  veeqoTrackingNumber: string | null;
  veeqoCarrierService: string | null;
  status: "scanning" | "ready" | "label_purchased" | "cancelled";
  labelPurchasedAt: Date | null;
  createdAt: Date;
  labelZpl: string | null;
}

// ─── Reprint Button ───────────────────────────────────────────────────────────
function ReprintButton({ sessionId, hasZpl }: { sessionId: number; hasZpl: boolean }) {
  const [reprinting, setReprinting] = useState(false);
  const { selectedPrinter, printZpl } = useDirectPrint();

  // Fetch ZPL on demand (lazy query)
  const zplQuery = trpc.smallParcel.getSessionZpl.useQuery(
    { id: sessionId },
    { enabled: false, retry: false }
  );

  const handleReprint = async () => {
    if (!selectedPrinter) {
      toast.error("No printer configured", {
        description: (
          <span>
            Go to{" "}
            <Link href="/small-parcel/printer-settings" className="underline">
              Printer Settings
            </Link>{" "}
            to set up your Zebra printer.
          </span>
        ) as unknown as string,
      });
      return;
    }

    setReprinting(true);
    try {
      // Fetch the stored ZPL from the server
      const result = await zplQuery.refetch();
      if (!result.data?.labelZpl) {
        toast.error("No ZPL label found for this session");
        return;
      }

      // Add DUPLICATE watermark to the ZPL label
      const zplWithDuplicate = addDuplicateWatermark(result.data.labelZpl);

      const ok = await printZpl(zplWithDuplicate);
      if (ok) {
        toast.success("Label reprinted!", {
          description: `Sent to ${selectedPrinter.name} — marked DUPLICATE`,
        });
      }
    } catch (err) {
      toast.error("Reprint failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setReprinting(false);
    }
  };

  if (!hasZpl) {
    return (
      <Button size="sm" variant="ghost" disabled className="text-muted-foreground text-xs">
        No ZPL
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleReprint}
      disabled={reprinting}
      className="gap-1.5"
    >
      {reprinting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Printer className="w-3.5 h-3.5" />
      )}
      Reprint
    </Button>
  );
}

/**
 * Injects a DUPLICATE text field into a ZPL label.
 * Inserts after the ^XA command so it appears at the top of the label.
 */
function addDuplicateWatermark(zpl: string): string {
  // Insert a bold DUPLICATE label near the top-right of the 4x6" label
  const watermark = "^FO480,30^A0N,28,28^FDDUPLICATE^FS\n";
  return zpl.replace(/(\^XA\n?)/, `$1${watermark}`);
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Session["status"] }) {
  switch (status) {
    case "label_purchased":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Label Purchased
        </Badge>
      );
    case "ready":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0 gap-1">
          <Package className="w-3 h-3" />
          Ready
        </Badge>
      );
    case "scanning":
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 gap-1">
          <Clock className="w-3 h-3" />
          Scanning
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="w-3 h-3" />
          Cancelled
        </Badge>
      );
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SmallParcelHistory() {
  const [statusFilter, setStatusFilter] = useState<Session["status"] | "all">("all");
  const [search, setSearch] = useState("");

  const { data: sessions, isLoading, refetch } = trpc.smallParcel.listSessions.useQuery(
    statusFilter !== "all" ? { status: statusFilter, limit: 200 } : { limit: 200 }
  );

  const filtered = (sessions ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.referenceNum ?? "").toLowerCase().includes(q) ||
      (s.clientName ?? "").toLowerCase().includes(q) ||
      (s.shipToName ?? "").toLowerCase().includes(q) ||
      (s.veeqoTrackingNumber ?? "").toLowerCase().includes(q) ||
      (s.pickTicketNum ?? "").toLowerCase().includes(q) ||
      String(s.extensivOrderId ?? "").includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Label is Printed</h1>
            <p className="text-muted-foreground text-sm">
              Recent Pack &amp; Ship sessions — reprint any label directly to your Zebra printer.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 pr-9"
          placeholder="Search by transaction ID, client, customer, tracking number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "label_purchased", "scanning", "ready", "cancelled"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
            className="capitalize text-xs"
          >
            {s === "all" ? "All" : s === "label_purchased" ? "Label Purchased" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Sessions table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {filtered.length} Session{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading sessions…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Package className="w-8 h-8" />
              <p className="text-sm">No sessions found.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4"
                >
                  {/* Left: order info */}
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Reference + status */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono font-semibold text-sm truncate">
                          {session.referenceNum ?? "—"}
                        </span>
                      </div>
                      <StatusBadge status={session.status} />
                    </div>

                    {/* Client + carrier */}
                    <div className="flex flex-col gap-1 text-sm">
                      <span className="font-medium truncate">{session.clientName ?? "—"}</span>
                      {session.veeqoCarrierService && (
                        <span className="text-muted-foreground text-xs truncate">
                          {session.veeqoCarrierService}
                        </span>
                      )}
                      {session.veeqoTrackingNumber && (
                        <span className="font-mono text-xs text-muted-foreground truncate">
                          {session.veeqoTrackingNumber}
                        </span>
                      )}
                    </div>

                    {/* Ship-to + date */}
                    <div className="flex flex-col gap-1 text-sm">
                      {(session.shipToName || session.shipToCity) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate text-muted-foreground">
                            {[session.shipToName, session.shipToCity, session.shipToState]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(session.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Right: reprint button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <ReprintButton
                      sessionId={session.id}
                      hasZpl={!!session.labelZpl}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
