import { lazy, Suspense } from "react";
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

// Route-level code splitting — each page is a separate JS chunk
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Budgets = lazy(() => import("@/pages/Budgets"));
const Goals = lazy(() => import("@/pages/Goals"));
const AIAdvisor = lazy(() => import("@/pages/AIAdvisor"));
const Settings = lazy(() => import("@/pages/Settings"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const Glossary = lazy(() => import("@/pages/Glossary"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Reports = lazy(() => import("@/pages/Reports"));
const Recurring = lazy(() => import("@/pages/Recurring"));
const NotFound = lazy(() => import("@/pages/NotFound"));

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
            <Suspense fallback={<PageFallback />}>
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
                  <Route path="/advisor" element={<AIAdvisor />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/glossary" element={<Glossary />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
