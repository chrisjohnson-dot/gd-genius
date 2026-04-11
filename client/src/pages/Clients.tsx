import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  Users,
  AlertTriangle,
  Package,
  ChevronRight,
  Building2,
  RefreshCw,
} from "lucide-react";

export default function Clients() {
  const [search, setSearch] = useState("");

  const { data: clients = [], isLoading, refetch } = trpc.clientProfiles.list.useQuery(
    { search: search || undefined },
    { refetchInterval: 60_000 }
  );

  const filtered = clients.filter((c) =>
    !search || c.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const totalOpen = filtered.reduce((s, c) => s + Number(c.openOrderCount ?? 0), 0);
  const totalUnalloc = filtered.reduce((s, c) => s + Number(c.unallocatedCount ?? 0), 0);
  const totalExc = filtered.reduce((s, c) => s + Number(c.activeExceptions ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Profiles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} client{filtered.length !== 1 ? "s" : ""} · manage SLA, QC, packaging & billing settings
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Package className="h-4 w-4" />
            Open Orders
          </div>
          <div className="text-3xl font-bold text-foreground">{totalOpen.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Package className="h-4 w-4 text-amber-500" />
            Unallocated
          </div>
          <div className="text-3xl font-bold text-amber-500">{totalUnalloc.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Active Exceptions
          </div>
          <div className="text-3xl font-bold text-red-500">{totalExc.toLocaleString()}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Client list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No clients found</p>
          <p className="text-sm mt-1">Clients appear here once orders are synced from Extensiv</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((client) => (
            <Link
              key={`${client.configId}-${client.clientId}`}
              href={`/clients/${client.configId}/${client.clientId}`}
            >
              <div className="flex items-center gap-4 rounded-lg border bg-card p-4 hover:bg-accent/40 transition-colors cursor-pointer group">
                {/* Brand color dot */}
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ backgroundColor: client.brandColor ?? "#3B82F6" }}
                >
                  {client.clientName.charAt(0).toUpperCase()}
                </div>

                {/* Client info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground truncate">{client.clientName}</span>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {client.orderChannel ?? "b2b"}
                    </Badge>
                    {client.profileId ? null : (
                      <Badge variant="secondary" className="text-xs shrink-0">No Profile</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    {client.contactName && (
                      <span className="truncate">{client.contactName}</span>
                    )}
                    {client.slaStandardHours && (
                      <span>SLA {client.slaStandardHours}h</span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <div className="text-lg font-bold text-foreground">{Number(client.openOrderCount ?? 0).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Open</div>
                  </div>
                  {Number(client.unallocatedCount ?? 0) > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-amber-500">{Number(client.unallocatedCount ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Unalloc.</div>
                    </div>
                  )}
                  {Number(client.activeExceptions ?? 0) > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-500">{Number(client.activeExceptions ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Exceptions</div>
                    </div>
                  )}
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
