import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useRoute } from "wouter";
import AllocationRules from "@/pages/AllocationRules";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import LocationConfig from "./pages/LocationConfig";
import OrderSelection from "./pages/OrderSelection";
import AllocationReview from "./pages/AllocationReview";
import RunHistory from "./pages/RunHistory";
import RunDetail from "./pages/RunDetail";
import AuditLog from "./pages/AuditLog";
import ScheduleSettings from "./pages/ScheduleSettings";
import Diagnostics from "./pages/Diagnostics";
import PrintPage from "@/pages/PrintPage";
import QCDashboard from "@/pages/QCDashboard";
import QCReports from "@/pages/QCReports";
import ShippingDashboard from "@/pages/ShippingDashboard";
import ShipOrders from "@/pages/ShipOrders";
import ShippingHistory from "@/pages/ShippingHistory";
import ShippingCarriers from "@/pages/ShippingCarriers";
import ShipwellSettings from "@/pages/ShipwellSettings";
import SlaTracker from "@/pages/SlaTracker";
import ClientVisibility from "@/pages/ClientVisibility";
import ReturnsDashboard from "@/pages/ReturnsDashboard";
import ProcessReturns from "@/pages/ProcessReturns";
import CortexSettings from "@/pages/CortexSettings";
import QcScanner from "@/pages/QcScanner";
import FlaggedScans from "@/pages/FlaggedScans";
import PalletScanner from "@/pages/PalletScanner";
import ReceivingDashboard from "@/pages/ReceivingDashboard";
import PutAwayAssistant from "@/pages/PutAwayAssistant";
import ReceiptConfirmation from "@/pages/ReceiptConfirmation";
import PutAwayPriorityConfig from "@/pages/PutAwayPriorityConfig";
import AuditProductionDocuments from "@/pages/AuditProductionDocuments";
import AuditImages from "@/pages/AuditImages";
import AuditShippingDocuments from "@/pages/AuditShippingDocuments";
import QcScanLabel from "@/pages/QcScanLabel";
import LabelFiles from "@/pages/LabelFiles";
import LabelScanSettings from "@/pages/LabelScanSettings";
import ProductionLine from "@/pages/ProductionLine";
// Pages that should NOT have the sidebar (full-screen / print views)
function PrintRoutes() {
  return (
    <Switch>
      <Route path="/print" component={PrintPage} />
    </Switch>
  );
}

// All normal app routes share ONE AppLayout instance so the sidebar
// DOM element is never destroyed on navigation — scroll position is preserved.
function AppRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/settings" component={Settings} />
        <Route path="/locations" component={LocationConfig} />
        <Route path="/rules" component={AllocationRules} />
        <Route path="/allocate" component={OrderSelection} />
        <Route path="/review/:runId" component={AllocationReview} />
        <Route path="/history" component={RunHistory} />
        <Route path="/history/:runId" component={RunDetail} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/schedule" component={ScheduleSettings} />
        <Route path="/diagnostics" component={Diagnostics} />
        <Route path="/qc" component={QCDashboard} />
        <Route path="/qc/reports" component={QCReports} />
        <Route path="/shipping" component={ShippingDashboard} />
        <Route path="/shipping/orders" component={ShipOrders} />
        <Route path="/shipping/history" component={ShippingHistory} />
        <Route path="/shipping/carriers" component={ShippingCarriers} />
        <Route path="/shipwell-settings" component={ShipwellSettings} />
        <Route path="/sla-tracker" component={SlaTracker} />
        <Route path="/client-visibility" component={ClientVisibility} />
        <Route path="/returns" component={ReturnsDashboard} />
        <Route path="/returns/process" component={ProcessReturns} />
        <Route path="/returns/session/:id" component={ProcessReturns} />
        <Route path="/cortex-settings" component={CortexSettings} />
        <Route path="/qc/scanner" component={QcScanner} />
        <Route path="/qc/flagged" component={FlaggedScans} />
        <Route path="/shipping/pallet-scan" component={PalletScanner} />
        <Route path="/receiving" component={ReceivingDashboard} />
        <Route path="/receiving/confirm" component={ReceiptConfirmation} />
        <Route path="/receiving/put-away" component={PutAwayAssistant} />
        <Route path="/receiving/put-away/priority" component={PutAwayPriorityConfig} />
        <Route path="/audit/production-documents" component={AuditProductionDocuments} />
        <Route path="/audit/images" component={AuditImages} />
        <Route path="/audit/shipping-documents" component={AuditShippingDocuments} />
        <Route path="/qc/scan-label" component={QcScanLabel} />
        <Route path="/qc/label-files" component={LabelFiles} />
        <Route path="/config/label-scan" component={LabelScanSettings} />
        <Route path="/qc/production-line" component={ProductionLine} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  const [isPrint] = useRoute("/print");
  return isPrint ? <PrintRoutes /> : <AppRoutes />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
export default App;
