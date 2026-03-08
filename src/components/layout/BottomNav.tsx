import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, PiggyBank, Target, Brain, Settings, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS_LEFT = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/transactions', label: 'Txns', icon: Receipt },
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
];

const NAV_ITEMS_RIGHT = [
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/advisor', label: 'AI', icon: Brain },
  { path: '/settings', label: 'Settings', icon: Settings },
];

interface BottomNavProps {
  onAddClick: () => void;
}

const NavButton = ({ path, label, icon: Icon, active, onClick }: {
  path: string; label: string; icon: any; active: boolean; onClick: () => void;
}) => (
  <button onClick={onClick}
    className="flex flex-col items-center gap-0.5 py-1 px-1.5 relative min-w-0">
    <Icon size={18} className={active ? 'text-primary' : 'text-muted-foreground'} />
    <span className={`text-[8px] font-medium truncate ${active ? 'text-primary' : 'text-muted-foreground'}`}>
      {label}
    </span>
    {active && (
      <motion.div layoutId="nav-indicator" className="absolute -top-px left-1 right-1 h-0.5 rounded-full bg-primary" />
    )}
  </button>
);

const BottomNav = ({ onAddClick }: BottomNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16 px-0.5">
        {NAV_ITEMS_LEFT.map(item => (
          <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => navigate(item.path)} />
        ))}

        {/* FAB - centered */}
        <button onClick={onAddClick}
          className="gradient-primary rounded-full w-9 h-9 flex items-center justify-center -mt-4 shadow-lg active:scale-95 transition-transform shrink-0">
          <Plus size={18} className="text-primary-foreground" />
        </button>

        {NAV_ITEMS_RIGHT.map(item => (
          <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => navigate(item.path)} />
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
