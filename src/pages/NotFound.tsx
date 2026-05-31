import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Receipt, PiggyBank, Settings } from "lucide-react";

const QUICK_LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/settings", label: "Settings", icon: Settings },
];

const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-muted px-4">
    <div className="w-full max-w-sm text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="mt-3 text-xl font-semibold">We couldn't find that page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may be broken or the page may have moved. Your data is safe — pick a place to jump back in.
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

export default NotFound;
