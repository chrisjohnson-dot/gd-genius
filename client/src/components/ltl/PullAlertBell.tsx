import { useState } from "react";
import { Bell, BellRing, Check, CheckCheck, Clock, MessageSquare, Warehouse, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

function formatElapsed(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

interface AlertRowProps {
  alert: {
    id: number;
    associateName?: string | null;
    associateId?: string | null;
    alertLevel?: number;
    elapsedMinutes: number;
    thresholdMinutes: number;
    warehouseId?: string | null;
    pickTicket?: string | null;
    alertedAt: number;
    managerNote?: string | null;
  };
  onAcknowledge: (id: number) => void;
  acknowledging: boolean;
}

function AlertRow({ alert, onAcknowledge, acknowledging }: AlertRowProps) {
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState(alert.managerNote ?? "");
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const utils = trpc.useUtils();

  const { data: noteHistory = [], isLoading: historyLoading } = trpc.pullAlerts.getNoteHistory.useQuery(
    { alertId: alert.id },
    { enabled: showHistory }
  );

  const saveNote = trpc.pullAlerts.saveNote.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      utils.pullAlerts.getAlerts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const alertLevel = alert.alertLevel ?? 1;
  const isEscalation = alertLevel >= 2;

  return (
    <div className="px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isEscalation ? "bg-red-500/10" : "bg-orange-500/10"
        }`}>
          {isEscalation ? (
            <span className="text-base leading-none">🚨</span>
          ) : (
            <Clock className="h-4 w-4 text-orange-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">
              {alert.associateName ?? alert.associateId ?? "Unknown associate"}
            </p>
            {isEscalation && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-red-500 bg-red-500/10 px-1 rounded">
                ESCALATION
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-xs font-semibold ${isEscalation ? "text-red-600" : "text-orange-600"}`}>
              {formatElapsed(alert.elapsedMinutes)} elapsed
            </span>
            <span className="text-xs text-muted-foreground">
              (limit: {formatElapsed(alert.thresholdMinutes)})
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {alert.warehouseId && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Warehouse className="h-3 w-3" />
                {alert.warehouseId}
              </span>
            )}
            {alert.pickTicket && (
              <span className="text-xs text-muted-foreground">
                · Ticket: {alert.pickTicket}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {timeAgo(alert.alertedAt)}
          </p>

          {/* Existing note preview */}
          {alert.managerNote && !showNote && (
            <div className="mt-1.5 flex items-start gap-1">
              <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground italic line-clamp-2">{alert.managerNote}</p>
            </div>
          )}

          {/* Note editor */}
          {showNote && (
            <div className="mt-2 space-y-1.5">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this alert…"
                className="text-xs min-h-[64px] resize-none"
                maxLength={1000}
              />
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => saveNote.mutate({ alertId: alert.id, note: noteText })}
                  disabled={saveNote.isPending}
                >
                  {saved ? "Saved ✓" : saveNote.isPending ? "Saving…" : "Save Note"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 text-muted-foreground"
                  onClick={() => { setShowNote(false); setNoteText(alert.managerNote ?? ""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Toggle note button */}
          {!showNote && (
            <div className="mt-1.5 flex items-center gap-3">
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowNote(true)}
              >
                <MessageSquare className="h-3 w-3" />
                {alert.managerNote ? "Edit note" : "Add note"}
              </button>
              {alert.managerNote && (
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowHistory((v) => !v)}
                >
                  <Clock className="h-3 w-3" />
                  {showHistory ? "Hide history" : "View history"}
                </button>
              )}
            </div>
          )}

          {/* Note history panel */}
          {showHistory && (
            <div className="mt-2 rounded-md border bg-muted/20 p-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Edit History</p>
              {historyLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : noteHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No history yet.</p>
              ) : (
                noteHistory.map((entry) => (
                  <div key={entry.id} className="text-xs border-l-2 border-border pl-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{entry.writtenBy}</span>
                      <span>·</span>
                      <span>{timeAgo(entry.writtenAt)}</span>
                    </div>
                    <p className="mt-0.5 italic text-muted-foreground">{entry.note}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-green-600"
          onClick={() => onAcknowledge(alert.id)}
          disabled={acknowledging}
          title="Acknowledge"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function PullAlertBell() {
  const [open, setOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: countData } = trpc.pullAlerts.getUnreadCount.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const { data: alerts = [], isLoading } = trpc.pullAlerts.getAlerts.useQuery(
    { includeAcknowledged: false, limit: 50 },
    { enabled: open, refetchInterval: open ? 30000 : false }
  );

  const escalationCount = alerts.filter((a) => (a as any).alertLevel >= 2).length;

  const acknowledge = trpc.pullAlerts.acknowledge.useMutation({
    onSuccess: () => {
      utils.pullAlerts.getUnreadCount.invalidate();
      utils.pullAlerts.getAlerts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const unreadCount = countData?.count ?? 0;

  function handleAcknowledgeOne(alertId: number) {
    acknowledge.mutate({ alertId });
  }

  function handleAcknowledgeAll() {
    acknowledge.mutate({});
    toast.success("All alerts acknowledged.");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Pull session alerts"
        >
          {unreadCount > 0 ? (
            <BellRing className={`h-5 w-5 ${escalationCount > 0 ? "text-red-500" : "text-orange-500"}`} />
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground" />
          )}
          {unreadCount > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${escalationCount > 0 ? "bg-red-500" : "bg-orange-500"}`}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[420px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-orange-500" />
            <span className="font-semibold text-sm">Overdue Pull Sessions</span>
            {unreadCount > 0 && (
              <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={handleAcknowledgeAll}
              disabled={acknowledge.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Alert list */}
        <ScrollArea className="max-h-[480px]">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : alerts.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No overdue sessions</p>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert as any}
                  onAcknowledge={handleAcknowledgeOne}
                  acknowledging={acknowledge.isPending}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-4 py-2 text-xs text-muted-foreground text-center">
          Alerts auto-check every 5 minutes · Configure in Pull Manager settings
        </div>
      </PopoverContent>
    </Popover>
  );
}
