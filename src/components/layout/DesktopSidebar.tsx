import { useLocation, useNavigate } from 'react-router-dom';
import logo from '@/assets/logo.png';
import { LayoutDashboard, Receipt, Target, PiggyBank, Settings, Plus, Brain, Wallet, BarChart3, RefreshCw, CreditCard, Layers, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const NAV_ITEMS_MAIN = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: Receipt },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/debt', label: 'Debt', icon: CreditCard },
  { path: '/installments', label: 'Installments', icon: Layers },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/recurring', label: 'Recurring', icon: RefreshCw },
  { path: '/advisor', label: 'AI Advisor', icon: Brain },
];

const NAV_ITEM_SETTINGS = { path: '/settings', label: 'Settings', icon: Settings };

interface DesktopSidebarProps {
  onAddClick: () => void;
  collapsed?: boolean;
}

const NavButton = ({ path, label, icon: Icon, active, onClick, collapsed }: {
  path: string; label: string; icon: any; active: boolean; onClick: () => void; collapsed?: boolean;
}) => {
  const btn = (
    <button
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
        collapsed ? 'justify-center' : ''
      } ${
        active ? 'text-primary bg-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon size={19} />
      {!collapsed && <span>{label}</span>}
      {active && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full bg-primary"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return btn;
};

const DesktopSidebar = ({ onAddClick, collapsed }: DesktopSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <TooltipProvider delayDuration={0}>
      <aside className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 border-r border-border bg-card h-full flex flex-col py-4 transition-all duration-200 overflow-hidden`}>
        {/* Brand */}
        <div className={`px-4 flex items-center gap-3 mb-2 ${collapsed ? 'justify-center' : ''}`}>
          <img src={logo} alt="SpendPal" className="w-8 h-8 rounded-xl object-cover shrink-0" />
          {!collapsed && (
            <div>
              <span className="font-heading text-base font-bold">SpendPal</span>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Personal Finance</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 h-px bg-border mb-4" />

        {/* Add Transaction */}
        <div className="px-4 mb-5">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onAddClick}
                  aria-label="New Transaction"
                  className="w-full gradient-primary rounded-xl p-3 flex items-center justify-center shadow-fab active:scale-95 transition-transform"
                >
                  <Plus size={18} className="text-primary-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">New Transaction</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={onAddClick}
              className="w-full gradient-primary rounded-xl py-3 text-sm font-semibold text-primary-foreground flex items-center justify-center gap-2 shadow-fab hover:brightness-105 active:scale-95 transition-all"
            >
              <Plus size={16} /> New Transaction
            </button>
          )}
        </div>

        {/* Main Nav Items */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto min-h-0">
          {NAV_ITEMS_MAIN.map(item => (
            <NavButton
              key={item.path}
              {...item}
              active={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Divider + Settings */}
        <div className="px-3">
          <div className="h-px bg-border mb-2" />
          <NavButton
            {...NAV_ITEM_SETTINGS}
            active={location.pathname === NAV_ITEM_SETTINGS.path}
            onClick={() => navigate(NAV_ITEM_SETTINGS.path)}
            collapsed={collapsed}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default DesktopSidebar;
