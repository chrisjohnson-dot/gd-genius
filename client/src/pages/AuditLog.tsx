import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Loader2, Filter, X, User } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

// Human-readable labels for known action types
const ACTION_LABELS: Record<string, string> = {
  "config.create": "Created API Config",
  "config.update": "Updated API Config",
  "config.delete": "Deleted API Config",
  "allocation.propose": "Proposed Allocation",
  "allocation.confirm": "Confirmed Allocation",
  "allocation.cancel": "Cancelled Allocation",
  "pickSchedule.updateStatus": "Updated Order Status",
  "pickSchedule.undoStatus": "Undid Order Status",
  "pickSchedule.syncNow": "Manual Sync",
  "pickSchedule.sendToShipwell": "Sent to Shipwell",
  "pickSchedule.dismissZeroBidWarning": "Dismissed Zero-Bid Warning",
  "overdueAlert.triggerNow": "Triggered Overdue Alert",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Group an action key into a category for colour-coding. */
function actionCategory(action: string): "allocation" | "order" | "config" | "alert" | "other" {
  if (action.startsWith("allocation.")) return "allocation";
  if (action.startsWith("pickSchedule.")) return "order";
  if (action.startsWith("config.")) return "config";
  if (action.includes("alert") || action.includes("Alert")) return "alert";
  return "other";
}

const CATEGORY_STYLES: Record<string, string> = {
  allocation: "bg-blue-50 text-blue-700 border border-blue-200",
  order: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  config: "bg-purple-50 text-purple-700 border border-purple-200",
  alert: "bg-amber-50 text-amber-700 border border-amber-200",
  other: "bg-muted text-muted-foreground border border-border",
};

/** Display name for a user: prefer name, fall back to email, then "Unknown User". */
function displayName(name: string | null, email: string | null): string {
  if (name) return name;
  if (email) return email;
  return "Unknown User";
}

export default function AuditLog() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");

  const { data: distinctActions = [] } = trpc.audit.distinctActions.useQuery();
  const { data: auditUsers = [] } = trpc.audit.users.useQuery();

  const { data: logs, isLoading } = trpc.audit.list.useQuery({
    limit: 200,
    action: actionFilter === "all" ? undefined : actionFilter,
    userId: userFilter === "all" ? undefined : Number(userFilter),
  });

  const hasFilter = actionFilter !== "all" || userFilter !== "all";

  function clearFilters() {
    setActionFilter("all");
    setUserFilter("all");
  }

  // Summary line
  let filterDesc = "";
  if (actionFilter !== "all" && userFilter !== "all") {
    const user = auditUsers.find((u) => String(u.id) === userFilter);
    filterDesc = `"${formatAction(actionFilter)}" by ${displayName(user?.name ?? null, user?.email ?? null)}`;
  } else if (actionFilter !== "all") {
    filterDesc = `"${formatAction(actionFilter)}"`;
  } else if (userFilter !== "all") {
    const user = auditUsers.find((u) => String(u.id) === userFilter);
    filterDesc = `by ${displayName(user?.name ?? null, user?.email ?? null)}`;
  }

  return (

      <div className="p-6 space-y-6 max-w-5xl">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Complete history of all actions performed in the system
            </p>
          </div>

          {/* Filter controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Action filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-52 h-9 text-sm">
                  <SelectValue placeholder="Filter by action…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {distinctActions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {formatAction(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User filter */}
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-muted-foreground" />
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-44 h-9 text-sm">
                  <SelectValue placeholder="Filter by user…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {auditUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {displayName(u.name, u.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear button — only shown when a filter is active */}
            {hasFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={clearFilters}
                title="Clear all filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Results count */}
        {!isLoading && logs && (
          <p className="text-xs text-muted-foreground -mt-3">
            {hasFilter
              ? `Showing ${logs.length} entr${logs.length !== 1 ? "ies" : "y"} for ${filterDesc}`
              : `Showing ${logs.length} most recent entr${logs.length !== 1 ? "ies" : "y"}`}
          </p>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {hasFilter ? `Filtered: ${filterDesc}` : "Recent Actions"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !logs || logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {hasFilter
                    ? `No entries found for ${filterDesc}.`
                    : "No audit entries yet."}
                </p>
                {hasFilter && (
                  <button
                    className="mt-2 text-xs text-primary underline"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Timestamp</th>
                      <th className="text-left px-4 py-3 font-medium">User</th>
                      <th className="text-left px-4 py-3 font-medium">Action</th>
                      <th className="text-left px-4 py-3 font-medium">Entity</th>
                      <th className="text-left px-4 py-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const cat = actionCategory(log.action);
                      const name = displayName(log.userName ?? null, log.userEmail ?? null);
                      return (
                        <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2">
                            {log.userId ? (
                              <button
                                className="flex items-center gap-1.5 group"
                                title={`Filter by ${name}`}
                                onClick={() => setUserFilter(String(log.userId))}
                              >
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                  {name.charAt(0).toUpperCase()}
                                </span>
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                                  {name}
                                </span>
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">System</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${CATEGORY_STYLES[cat]}`}
                            >
                              {formatAction(log.action)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {log.entityType && log.entityId
                              ? `${log.entityType} #${log.entityId}`
                              : "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                            {log.details ? JSON.stringify(log.details) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

  );
}
