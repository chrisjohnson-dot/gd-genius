import AppLayout from "@/components/AppLayout";
import { CheckSquare } from "lucide-react";

export default function QCInspections() {
  return (
    <AppLayout>
      <div className="p-7 page-enter">
        <p className="page-breadcrumb">QC</p>
        <h1 className="page-title">Inspection Queue</h1>
        <div className="mt-8 flex flex-col items-center justify-center py-24 text-muted-foreground">
          <CheckSquare className="h-12 w-12 mb-4 opacity-25" />
          <p className="text-sm font-medium">Inspection Queue — coming soon</p>
          <p className="text-xs mt-1 opacity-70">Pending and in-progress inspection items will appear here.</p>
        </div>
      </div>
    </AppLayout>
  );
}
