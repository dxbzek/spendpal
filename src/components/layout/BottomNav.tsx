import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, PiggyBank, CreditCard, BarChart3, Settings, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS_LEFT = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/transactions', label: 'Txns', icon: Receipt },
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
];

const NAV_ITEMS_RIGHT = [
  { path: '/debt', label: 'Debt', icon: CreditCard },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

interface BottomNavProps {
  onAddClick: () => void;
}

const NavButton = ({ path, label, icon: Icon, active, onClick }: {
  path: string; label: string; icon: any; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className="flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl min-w-[52px] min-h-[48px] relative transition-colors active:scale-95"
  >
    {active && (
      <motion.div
        layoutId="nav-indicator"
        className="absolute inset-0 rounded-2xl bg-accent"
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    )}
    <Icon size={20} className={`relative z-10 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
    <span className={`relative z-10 text-[10px] font-medium truncate ${active ? 'text-primary' : 'text-muted-foreground'}`}>
      {label}
    </span>
  </button>
);

const BottomNav = ({ onAddClick }: BottomNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
      <div className="flex items-end justify-around max-w-lg mx-auto h-[68px] px-2 pb-1">
        {NAV_ITEMS_LEFT.map(item => (
          <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => navigate(item.path)} />
        ))}

        {/* FAB - centered and elevated */}
        <button
          onClick={onAddClick}
          className="gradient-primary rounded-2xl w-12 h-12 flex items-center justify-center -mt-6 shadow-fab ring-4 ring-card active:scale-90 transition-transform shrink-0"
          aria-label="Add transaction"
        >
          <Plus size={22} className="text-primary-foreground" />
        </button>

        {NAV_ITEMS_RIGHT.map(item => (
          <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => navigate(item.path)} />
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
