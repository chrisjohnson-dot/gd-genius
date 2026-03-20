import AppLayout from "@/components/AppLayout";
import { BarChart3 } from "lucide-react";

export default function QCDashboard() {
  return (
    <AppLayout>
      <div className="p-7 page-enter">
        <p className="page-breadcrumb">QC</p>
        <h1 className="page-title">QC Dashboard</h1>
        <div className="mt-8 flex flex-col items-center justify-center py-24 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mb-4 opacity-25" />
          <p className="text-sm font-medium">QC Dashboard — coming soon</p>
          <p className="text-xs mt-1 opacity-70">Quality control metrics and overview will appear here.</p>
        </div>
      </div>
    </AppLayout>
  );
}
