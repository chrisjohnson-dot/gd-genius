import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { NotesPanel } from "@/components/NotesPanel";
import { PhotoGallery } from "@/components/photos/PhotoGallery";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Search,
  XCircle,
  ChevronRight,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = "critical" | "high" | "medium" | "low";
type Status = "open" | "in_progress" | "resolved" | "dismissed";

interface ExceptionRow {
  id: number;
  exceptionType: string;
  priority: Priority;
  status: Status;
  title: string;
  description?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  clientName?: string | null;
  warehouseId?: string | null;
  assignedToName?: string | null;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  critical: { label: "Critical", color: "text-red-700", bg: "bg-red-100 dark:bg-red-950/40", icon: <Zap className="h-3.5 w-3.5" /> },
  high: { label: "High", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  medium: { label: "Medium", color: "text-yellow-700", bg: "bg-yellow-50 dark:bg-yellow-950/30", icon: <Clock className="h-3.5 w-3.5" /> },
  low: { label: "Low", color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-800/40", icon: <Clock className="h-3.5 w-3.5" /> },
};

const STATUS_META: Record<Status, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Open", variant: "destructive" },
  in_progress: { label: "In Progress", variant: "default" },
  resolved: { label: "Resolved", variant: "secondary" },
  dismissed: { label: "Dismissed", variant: "outline" },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${m.color} ${m.bg}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

// ─── Detail Dialog ─────────────────────────────────────────────────────────────
function ExceptionDetailDialog({
  exceptionId,
  onClose,
}: {
  exceptionId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [resolutionNote, setResolutionNote] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);

  const { data, isLoading } = trpc.exceptions.get.useQuery({ id: exceptionId });

  const updateStatus = trpc.exceptions.updateStatus.useMutation({
    onSuccess: () => {
      utils.exceptions.list.invalidate();
      utils.exceptions.counts.invalidate();
      utils.exceptions.get.invalidate({ id: exceptionId });
      toast.success("Exception updated");
      setShowResolveForm(false);
      setResolutionNote("");
    },
  });

  const assignSelf = trpc.exceptions.assign.useMutation({
    onSuccess: () => {
      utils.exceptions.list.invalidate();
      utils.exceptions.get.invalidate({ id: exceptionId });
      toast.success("Assigned to you");
    },
  });

  if (isLoading || !data) {
    return (
      <DialogContent className="max-w-2xl">
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      </DialogContent>
    );
  }

  const exc = data;
  const pm = PRIORITY_META[exc.priority as Priority];
  const sm = STATUS_META[exc.status as Status];

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          <span className={`${pm.color}`}>{pm.icon}</span>
          <span>{exc.title}</span>
          <Badge variant={sm.variant}>{sm.label}</Badge>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Type</p>
            <p className="font-medium">{exc.exceptionType}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Priority</p>
            <PriorityBadge priority={exc.priority as Priority} />
          </div>
          {exc.clientName && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Client</p>
              <p className="font-medium">{exc.clientName}</p>
            </div>
          )}
          {exc.warehouseId && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Warehouse</p>
              <p className="font-medium">{exc.warehouseId}</p>
            </div>
          )}
          {exc.entityId && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Entity</p>
              <p className="font-mono text-xs">{exc.entityType}/{exc.entityId}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Assigned To</p>
            <p className="font-medium">{exc.assignedToName ?? "Unassigned"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Created</p>
            <p className="font-medium">{new Date(exc.createdAt).toLocaleString()}</p>
          </div>
        </div>

        {/* Description */}
        {exc.description && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-sm whitespace-pre-wrap">{exc.description}</p>
          </div>
        )}

        {/* Actions */}
        {(exc.status === "open" || exc.status === "in_progress") && (
          <div className="flex flex-wrap gap-2">
            {exc.status === "open" && user && !exc.assignedToId && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() =>
                  assignSelf.mutate({
                    id: exc.id,
                    assignedToId: user.id,
                    assignedToName: user.name ?? user.email ?? "Me",
                  })
                }
                disabled={assignSelf.isPending}
              >
                <User className="h-3.5 w-3.5" />
                Assign to Me
              </Button>
            )}
            {!showResolveForm && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => setShowResolveForm(true)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-gray-500"
                  onClick={() => updateStatus.mutate({ id: exc.id, status: "dismissed" })}
                  disabled={updateStatus.isPending}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Dismiss
                </Button>
              </>
            )}
          </div>
        )}

        {/* Resolution form */}
        {showResolveForm && (
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium">Resolution Note (optional)</p>
            <Textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Describe how this was resolved…"
              className="text-sm resize-none min-h-[72px]"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1"
                onClick={() =>
                  updateStatus.mutate({
                    id: exc.id,
                    status: "resolved",
                    resolutionNote: resolutionNote.trim() || undefined,
                  })
                }
                disabled={updateStatus.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {updateStatus.isPending ? "Saving…" : "Mark Resolved"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowResolveForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {exc.events && exc.events.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Activity</p>
            <div className="space-y-1.5">
              {exc.events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                  <span className="text-foreground">{ev.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <NotesPanel
          entityType="exception"
          entityId={String(exc.id)}
          defaultOpen
        />

        {/* Photos */}
        <div className="border-t border-border pt-3">
          <PhotoGallery
            entityType="exception"
            entityId={String(exc.id)}
            title="Photos"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ExceptionsQueue() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: counts } = trpc.exceptions.counts.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data: rows = [], isLoading, refetch } = trpc.exceptions.list.useQuery({
    status: statusFilter as "open" | "in_progress" | "resolved" | "dismissed" | "all",
    priority: priorityFilter as "critical" | "high" | "medium" | "low" | "all",
    search: search || undefined,
    assignedToMe,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            Exceptions Queue
            {counts && counts.total > 0 && (
              <Badge variant="destructive" className="text-sm">
                {counts.total}
              </Badge>
            )}
          </h1>
          {counts && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {counts.critical > 0 && (
                <span className="text-red-600 font-medium mr-2">{counts.critical} critical</span>
              )}
              {counts.high > 0 && (
                <span className="text-orange-600 font-medium mr-2">{counts.high} high</span>
              )}
              {counts.medium > 0 && (
                <span className="text-yellow-700 mr-2">{counts.medium} medium</span>
              )}
              {counts.low > 0 && (
                <span className="text-gray-500">{counts.low} low</span>
              )}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search exceptions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={assignedToMe ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1"
              onClick={() => setAssignedToMe((v) => !v)}
            >
              <User className="h-3.5 w-3.5" />
              Mine
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isLoading ? "Loading…" : `${rows.length} exception${rows.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && rows.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No exceptions found</p>
            </div>
          )}
          <div className="divide-y">
            {(rows as ExceptionRow[]).map((exc) => {
              const pm = PRIORITY_META[exc.priority];
              const sm = STATUS_META[exc.status];
              return (
                <button
                  key={exc.id}
                  className={`w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors ${pm.bg}`}
                  onClick={() => setSelectedId(exc.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <PriorityBadge priority={exc.priority} />
                      <Badge variant={sm.variant} className="text-xs">{sm.label}</Badge>
                      <span className="text-xs text-muted-foreground font-mono">{exc.exceptionType}</span>
                    </div>
                    <p className="font-medium text-sm truncate">{exc.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {exc.clientName && <span>{exc.clientName}</span>}
                      {exc.assignedToName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {exc.assignedToName}
                        </span>
                      )}
                      <span>{new Date(exc.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={selectedId !== null} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        {selectedId !== null && (
          <ExceptionDetailDialog
            exceptionId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
