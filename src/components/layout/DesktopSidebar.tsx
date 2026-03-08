import { useLocation, useNavigate } from 'react-router-dom';
import logo from '@/assets/logo.png';
import { LayoutDashboard, Receipt, Target, PiggyBank, Settings, Plus, Brain } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: Receipt },
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/advisor', label: 'AI Advisor', icon: Brain },
  { path: '/settings', label: 'Settings', icon: Settings },
];

interface DesktopSidebarProps {
  onAddClick: () => void;
}

const DesktopSidebar = ({ onAddClick }: DesktopSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card h-screen sticky top-0 flex flex-col">
      {/* Brand */}
      <div className="px-5 py-6 flex items-center gap-3">
        <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center">
          <span className="text-lg">💰</span>
        </div>
        <span className="font-heading text-lg">SpendPal</span>
      </div>

      {/* Add Transaction */}
      <div className="px-4 mb-4">
        <button onClick={onAddClick}
          className="w-full gradient-primary rounded-xl py-2.5 text-sm font-medium text-primary-foreground flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform">
          <Plus size={18} /> Add Transaction
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active ? 'text-primary bg-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}>
              <item.icon size={18} />
              <span>{item.label}</span>
              {active && (
                <motion.div layoutId="sidebar-indicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-primary" />
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default DesktopSidebar;
