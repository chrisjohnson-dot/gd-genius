import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import AllocationRules from "@/pages/AllocationRules";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
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
import QCInspections from "@/pages/QCInspections";
import QCReports from "@/pages/QCReports";
import ShippingDashboard from "@/pages/ShippingDashboard";
import ShipOrders from "@/pages/ShipOrders";
import ShippingHistory from "@/pages/ShippingHistory";
import ShippingCarriers from "@/pages/ShippingCarriers";
import OpenOrders from "@/pages/OpenOrders";

function Router() {
  return (
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
      <Route path="/print" component={PrintPage} />
      <Route path="/open" component={OpenOrders} />
      <Route path="/qc" component={QCDashboard} />
      <Route path="/qc/inspections" component={QCInspections} />
      <Route path="/qc/reports" component={QCReports} />
      <Route path="/shipping" component={ShippingDashboard} />
      <Route path="/shipping/orders" component={ShipOrders} />
      <Route path="/shipping/history" component={ShippingHistory} />
      <Route path="/shipping/carriers" component={ShippingCarriers} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
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
