import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LazyMotion, domAnimation } from "framer-motion";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { FinanceProvider } from "@/context/FinanceContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AppLayout from "@/components/layout/AppLayout";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { toast } from "sonner";
import { takeNotice } from "@/lib/notice";

// Route-level code splitting - heavy pages (AIAdvisor, Reports, CalendarView)
// are now loaded on demand, shrinking the initial JS bundle.
const Dashboard     = lazy(() => import("@/pages/Dashboard"));
const Transactions  = lazy(() => import("@/pages/Transactions"));
const Budgets       = lazy(() => import("@/pages/Budgets"));
const Goals         = lazy(() => import("@/pages/Goals"));
const AIAdvisor     = lazy(() => import("@/pages/AIAdvisor"));
const Settings      = lazy(() => import("@/pages/Settings"));
const AuthPage      = lazy(() => import("@/pages/AuthPage"));
const Glossary      = lazy(() => import("@/pages/Glossary"));
const Accounts      = lazy(() => import("@/pages/Accounts"));
const Reports       = lazy(() => import("@/pages/Reports"));
const Debt          = lazy(() => import("@/pages/Debt"));
const Installments  = lazy(() => import("@/pages/Installments"));
const CalendarView  = lazy(() => import("@/pages/CalendarView"));
const NotFound      = lazy(() => import("@/pages/NotFound"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

export const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="animate-spin text-primary" size={32} />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, recovering } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/auth" replace />;
  // A reset link signs the user in. If Supabase sent them to "/" and not to
  // /reset (the address is missing from its redirect list), still show the form.
  if (recovering) return <Navigate to="/reset" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// A message left by the page before a reload (see lib/notice.ts).
const NoticeAfterReload = () => {
  useEffect(() => {
    const text = takeNotice();
    if (text) toast(text, { duration: 10_000 });
  }, []);
  return null;
};

const App = () => (
    <LazyMotion features={domAnimation} strict>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <NoticeAfterReload />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
                {/* Open to both: a reset link arrives signed in, a stale one signed out. */}
                <Route path="/reset" element={<ResetPassword />} />
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
                  <Route path="/debt" element={<Debt />} />
                  <Route path="/installments" element={<Installments />} />
                  <Route path="/calendar" element={<CalendarView />} />
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
    </LazyMotion>
);

export default App;
