import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { SecurityProvider } from "@/store/securityStore";
import { Layout } from "@/components/Layout";
import { AlertPopup } from "@/components/AlertPopup";
import MFAChallengeDialog from "@/components/MFAChallengeDialog";
import PageTransition from "@/components/PageTransition";
import OverviewPage from "@/pages/OverviewPage";
import BehaviorAnalyticsPage from "@/pages/BehaviorAnalyticsPage";
import RiskPropagationPage from "@/pages/RiskPropagationPage";
import IncidentCenterPage from "@/pages/IncidentCenterPage";
import AdminPanel from "@/pages/AdminPanel";
import LoginPage3D from "@/pages/LoginPage3D";
import NotFound from "./pages/NotFound";
import type { ReactNode } from "react";
import NetworkActivityPage from "@/pages/NetworkActivityPage";
import { AuthProvider, useAuth } from "@/store/authContext";

const queryClient = new QueryClient();

const withDashboardShell = (page: ReactNode) => (
  <PageTransition>
    <Layout>{page}</Layout>
  </PageTransition>
);

function DashboardRoutes() {
  const location = useLocation();
  const { hasPermission } = useAuth();

  return (
    <SecurityProvider>
      <AlertPopup />
      <MFAChallengeDialog />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/security-overview" element={<OverviewPage />} />
          <Route path="/behavior" element={<BehaviorAnalyticsPage />} />
          <Route path="/behavior-analytics" element={<BehaviorAnalyticsPage />} />
          <Route path="/network-activity" element={<NetworkActivityPage />} />
          <Route path="/threat-map" element={<NetworkActivityPage />} />
          <Route path="/behavior-live" element={<BehaviorAnalyticsPage />} />
          <Route path="/propagation" element={<RiskPropagationPage />} />
          <Route path="/risk-propagation" element={<RiskPropagationPage />} />
          <Route path="/propagation-live" element={<RiskPropagationPage />} />
          <Route path="/incidents" element={<IncidentCenterPage />} />
          <Route path="/incidents-live" element={<IncidentCenterPage />} />
          <Route path="/response" element={<IncidentCenterPage />} />
          <Route path="/admin" element={hasPermission("manage_users") ? withDashboardShell(<AdminPanel />) : withDashboardShell(<NotFound />)} />
          <Route path="*" element={withDashboardShell(<NotFound />)} />
        </Routes>
      </AnimatePresence>
    </SecurityProvider>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const isLoginRoute = location.pathname === "/" || location.pathname === "/login";
  const routeGroup = isLoginRoute ? "login" : "dashboard";
  const { isAuthenticated, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Restoring your session…
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={routeGroup}>
        <Route path="/" element={<PageTransition><LoginPage3D /></PageTransition>} />
        <Route path="/login" element={<PageTransition><LoginPage3D /></PageTransition>} />
        <Route path="/*" element={isAuthenticated ? <DashboardRoutes /> : <Navigate to="/login" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AnimatedRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
