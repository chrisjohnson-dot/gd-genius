import AppLayout from "@/components/AppLayout";
import { FolderOpen } from "lucide-react";

export default function OpenOrders() {
  return (
    <AppLayout>
      <div className="p-7 page-enter">
        <p className="page-breadcrumb">Allocation</p>
        <h1 className="page-title">Open</h1>
        <div className="mt-8 flex flex-col items-center justify-center py-24 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mb-4 opacity-25" />
          <p className="text-sm font-medium">Open — coming soon</p>
          <p className="text-xs mt-1 opacity-70">Open allocation items will appear here.</p>
        </div>
      </div>
    </AppLayout>
  );
}
