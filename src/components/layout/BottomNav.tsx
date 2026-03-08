import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Target, PiggyBank, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: Receipt },
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
  { path: '/goals', label: 'Goals', icon: Target },
];

interface BottomNavProps {
  onAddClick: () => void;
}

const BottomNav = ({ onAddClick }: BottomNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16 px-2">
        {NAV_ITEMS.slice(0, 2).map(item => {
          const active = location.pathname === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative">
              <item.icon size={22} className={active ? 'text-primary' : 'text-muted-foreground'} />
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
              {active && (
                <motion.div layoutId="nav-indicator" className="absolute -top-px left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}

        {/* FAB */}
        <button onClick={onAddClick}
          className="gradient-primary rounded-full w-14 h-14 flex items-center justify-center -mt-6 shadow-lg active:scale-95 transition-transform">
          <Plus size={28} className="text-primary-foreground" />
        </button>

        {NAV_ITEMS.slice(2).map(item => {
          const active = location.pathname === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative">
              <item.icon size={22} className={active ? 'text-primary' : 'text-muted-foreground'} />
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
              {active && (
                <motion.div layoutId="nav-indicator" className="absolute -top-px left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
