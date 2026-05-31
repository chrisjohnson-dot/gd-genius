import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, RefreshCw, Weight } from "lucide-react";

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function WeightApproval() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [rejectNotes, setRejectNotes] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading, refetch, isFetching } = trpc.skuWeight.listWeightRequests.useQuery(
    { status: statusFilter },
    { refetchOnWindowFocus: false }
  );

  const reviewWeightRequest = trpc.skuWeight.reviewWeightRequest.useMutation({
    onSuccess: (data, vars) => {
      if (vars.action === "approve") {
        toast.success("Weight approved and activated.");
      } else {
        toast.info("Weight request rejected.");
      }
      refetch();
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Weight className="w-6 h-6" /> Weight Approval
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve weight submissions from warehouse operators
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            className="capitalize h-8 text-xs"
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No {statusFilter === "all" ? "" : statusFilter} weight requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="border border-border rounded-xl p-4 space-y-3 bg-card shadow-sm">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm">{req.sku}</span>
                    <Badge className={`text-xs capitalize ${STATUS_COLORS[req.status] ?? ""}`}>
                      {req.status}
                    </Badge>
                  </div>
                  {req.customerName && (
                    <p className="text-xs text-muted-foreground">{req.customerName}</p>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Submitted by <span className="font-medium text-foreground">{req.submittedBy}</span></p>
                  <p>{formatDate(req.submittedAt)}</p>
                </div>
              </div>

              {/* Weight details */}
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Carton weight</p>
                  <p className="font-semibold">{req.cartonWeightLb} lbs</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Inner items per carton</p>
                  <p className="font-semibold">{req.unitsPerCarton}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Per-unit weight</p>
                  <p className="font-semibold">
                    {(parseFloat(String(req.cartonWeightLb)) / req.unitsPerCarton).toFixed(4)} lbs
                  </p>
                </div>
              </div>

              {/* Reviewed info */}
              {req.status !== "pending" && (
                <div className="text-xs text-muted-foreground border-t border-border pt-2">
                  {req.status === "approved" ? "Approved" : "Rejected"} by{" "}
                  <span className="font-medium text-foreground">{req.reviewedBy}</span>{" "}
                  on {formatDate(req.reviewedAt)}
                  {req.note && <span> — {req.note}</span>}
                </div>
              )}

              {/* Action buttons (pending only) */}
              {req.status === "pending" && (
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border">
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                    disabled={reviewWeightRequest.isPending}
                    onClick={() => reviewWeightRequest.mutate({ id: req.id, action: "approve" })}
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </Button>
                  <Input
                    className="h-8 text-xs flex-1 min-w-[140px] max-w-xs"
                    placeholder="Rejection reason (optional)"
                    value={rejectNotes[req.id] ?? ""}
                    onChange={(e) => setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-red-400 text-red-600 hover:bg-red-50 gap-1"
                    disabled={reviewWeightRequest.isPending}
                    onClick={() => reviewWeightRequest.mutate({
                      id: req.id,
                      action: "reject",
                      note: rejectNotes[req.id] || undefined,
                    })}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
