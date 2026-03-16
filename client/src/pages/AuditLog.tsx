import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Loader2 } from "lucide-react";

const actionLabel: Record<string, string> = {
  "config.create": "Created API Config",
  "config.update": "Updated API Config",
  "config.delete": "Deleted API Config",
  "allocation.propose": "Proposed Allocation",
  "allocation.confirm": "Confirmed Allocation",
  "allocation.cancel": "Cancelled Allocation",
};

export default function AuditLog() {
  const { data: logs, isLoading } = trpc.audit.list.useQuery({ limit: 200 });

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm mt-1">Complete history of all actions performed in the system</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recent Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !logs || logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No audit entries yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium">Timestamp</th>
                      <th className="text-left px-4 py-3 font-medium">Action</th>
                      <th className="text-left px-4 py-3 font-medium">Entity</th>
                      <th className="text-left px-4 py-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {actionLabel[log.action] ?? log.action}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {log.entityType && log.entityId ? `${log.entityType} #${log.entityId}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                          {log.details ? JSON.stringify(log.details) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
