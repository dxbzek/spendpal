import { useLocation, useNavigate } from 'react-router-dom';
import logo from '@/assets/logo.png';
import { LayoutDashboard, Receipt, Target, PiggyBank, Settings, Plus, Brain, Wallet, BarChart3, RefreshCw, CreditCard, Layers, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { path: '/', label: 'Home', icon: LayoutDashboard },
      { path: '/transactions', label: 'Transactions', icon: Receipt },
      { path: '/accounts', label: 'Accounts', icon: Wallet },
    ],
  },
  {
    label: 'Planning',
    items: [
      { path: '/budgets', label: 'Budgets', icon: PiggyBank },
      { path: '/goals', label: 'Goals', icon: Target },
      { path: '/debt', label: 'Debt', icon: CreditCard },
      { path: '/installments', label: 'Installments', icon: Layers },
      { path: '/recurring', label: 'Recurring', icon: RefreshCw },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { path: '/reports', label: 'Reports', icon: BarChart3 },
      { path: '/calendar', label: 'Calendar', icon: CalendarDays },
      { path: '/advisor', label: 'AI Advisor', icon: Brain },
    ],
  },
];

const NAV_ITEM_SETTINGS = { path: '/settings', label: 'Settings', icon: Settings };

interface DesktopSidebarProps {
  onAddClick: () => void;
  collapsed?: boolean;
}

const NavButton = ({ path, label, icon: Icon, active, onClick, collapsed }: {
  path: string; label: string; icon: any; active: boolean; onClick: () => void; collapsed?: boolean;
}) => {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`border-0 w-full flex items-center justify-center p-3 rounded-xl text-sm font-medium transition-colors ${
              active ? 'text-primary bg-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon size={19} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="relative">
      {active && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`border-0 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          active ? 'text-primary bg-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Icon size={19} />
        <span>{label}</span>
      </button>
    </div>
  );
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
        <nav className="flex-1 px-3 overflow-y-auto min-h-0 space-y-4">
          {NAV_SECTIONS.map(section => (
            <div key={section.label}>
              {!collapsed && (
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-3 mb-1">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <NavButton
                    key={item.path}
                    {...item}
                    active={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
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
