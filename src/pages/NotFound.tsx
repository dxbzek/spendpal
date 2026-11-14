import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Loader2, Receipt, PiggyBank, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNoIndex } from "@/hooks/useNoIndex";
import { PAGE_NAMES } from "@/lib/pageNames";

const QUICK_LINKS = [
  { to: "/", label: PAGE_NAMES["/"], icon: LayoutDashboard },
  { to: "/transactions", label: PAGE_NAMES["/transactions"], icon: Receipt },
  { to: "/budgets", label: PAGE_NAMES["/budgets"], icon: PiggyBank },
  { to: "/settings", label: PAGE_NAMES["/settings"], icon: Settings },
];

const NotFound = () => {
  const { user, loading } = useAuth();
  useNoIndex();

  // Wait for the session before choosing: a signed-in user must not see the
  // visitor page flash first.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // A visitor has no data here and every app link would bounce to the sign-in
  // form, so they get the plain fact and one way forward.
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-5xl font-bold text-primary">404</p>
          <h1 className="mt-3 text-xl font-semibold">Page not found</h1>
          <Button asChild className="mt-6 h-12 w-full">
            <Link to="/auth">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-5xl font-bold text-primary">404</p>
        <h1 className="mt-3 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be broken or the page may have moved. Your data is safe. Pick a place to go back to.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {QUICK_LINKS.map(({ to, label, icon: Icon }) => (
            <Button key={to} asChild variant="outline" className="h-12 justify-start gap-2">
              <Link to={to}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
