import { FileBarChart2 } from "lucide-react";

export default function QCReports() {
  return (

      <div className="p-7 page-enter">
        <p className="page-breadcrumb">QC</p>
        <h1 className="page-title">QC Reports</h1>
        <div className="mt-8 flex flex-col items-center justify-center py-24 text-muted-foreground">
          <FileBarChart2 className="h-12 w-12 mb-4 opacity-25" />
          <p className="text-sm font-medium">QC Reports — coming soon</p>
          <p className="text-xs mt-1 opacity-70">Quality control reports and analytics will appear here.</p>
        </div>
      </div>

  );
}
