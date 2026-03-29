import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { FinanceProvider } from "@/context/FinanceContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AppLayout from "@/components/layout/AppLayout";
import { Loader2 } from "lucide-react";

import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Budgets from "@/pages/Budgets";
import Goals from "@/pages/Goals";
import AIAdvisor from "@/pages/AIAdvisor";
import Settings from "@/pages/Settings";
import AuthPage from "@/pages/AuthPage";
import Glossary from "@/pages/Glossary";
import Accounts from "@/pages/Accounts";
import Reports from "@/pages/Reports";
import Recurring from "@/pages/Recurring";
import Debt from "@/pages/Debt";
import Installments from "@/pages/Installments";
import CalendarView from "@/pages/CalendarView";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="animate-spin text-primary" size={32} />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
              <Route element={
                <ProtectedRoute>
                  <CurrencyProvider>
                    <FinanceProvider>
                      <AppLayout />
                    </FinanceProvider>
                  </CurrencyProvider>
                </ProtectedRoute>
              }>
                <Route path="/" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/recurring" element={<Recurring />} />
                <Route path="/debt" element={<Debt />} />
                <Route path="/installments" element={<Installments />} />
                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/advisor" element={<AIAdvisor />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/glossary" element={<Glossary />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
