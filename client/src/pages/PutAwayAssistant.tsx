import { MapPin } from "lucide-react";

export default function PutAwayAssistant() {
  return (
    <div className="p-5 space-y-4 page-enter">
      {/* Page header */}
      <div>
        <p className="page-breadcrumb">Receiving</p>
        <h1 className="page-title">Put Away Assistant</h1>
      </div>

      {/* Coming soon placeholder */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-24 text-center">
        <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <p className="text-base font-semibold text-foreground">Put Away Assistant</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Guided put-away workflows, location suggestions, and FEFO-based slotting will appear here.
        </p>
      </div>
    </div>
  );
}
