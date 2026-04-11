import { useState } from "react";
import { Bell, BellRing, Check, CheckCheck, Clock, Warehouse, X } from "lucide-react";
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

export function PullAlertBell() {
  const [open, setOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: countData } = trpc.pullAlerts.getUnreadCount.useQuery(undefined, {
    refetchInterval: 60000, // poll every minute
  });

  const { data: alerts = [], isLoading } = trpc.pullAlerts.getAlerts.useQuery(
    { includeAcknowledged: false, limit: 50 },
    { enabled: open, refetchInterval: open ? 30000 : false }
  );

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
            <BellRing className="h-5 w-5 text-orange-500" />
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
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
        <ScrollArea className="max-h-80">
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
                <div
                  key={alert.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {alert.associateName ?? alert.associateId ?? "Unknown associate"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-orange-600 font-semibold">
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
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-green-600"
                    onClick={() => handleAcknowledgeOne(alert.id)}
                    disabled={acknowledge.isPending}
                    title="Acknowledge"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
