import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, Wallet, BarChart3, Plus,
  MoreHorizontal, PiggyBank, Target, Layers, CalendarDays,
  RefreshCw, Brain, Settings, CreditCard, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_ITEMS_LEFT = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/transactions', label: 'Txns', icon: Receipt },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
];

const NAV_ITEMS_RIGHT = [
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/debt', label: 'Debt', icon: CreditCard },
];

const MORE_ITEMS = [
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/installments', label: 'Installments', icon: Layers },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/recurring', label: 'Recurring', icon: RefreshCw },
  { path: '/advisor', label: 'AI Advisor', icon: Brain },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const ALL_MORE_PATHS = MORE_ITEMS.map(i => i.path);

interface BottomNavProps {
  onAddClick: () => void;
}

const NavButton = ({ path, label, icon: Icon, active, onClick }: {
  path: string; label: string; icon: React.ComponentType<{ size: number; className?: string }>; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className="flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl min-w-[52px] min-h-[48px] relative transition-colors active:scale-95"
  >
    {active && (
      <motion.div
        layoutId={`nav-indicator-${path}`}
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
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = ALL_MORE_PATHS.includes(location.pathname);

  const handleMoreItem = (path: string) => {
    setShowMore(false);
    navigate(path);
  };

  return (
    <>
      {/* More overlay */}
      <AnimatePresence>
        {showMore && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              onClick={() => setShowMore(false)}
            />

            {/* Panel */}
            <motion.div
              key="more-panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed bottom-[76px] left-0 right-0 z-50 mx-3 mb-1 bg-card border border-border rounded-3xl shadow-overlay overflow-hidden safe-bottom"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-sm font-semibold text-foreground">More</span>
                <button onClick={() => setShowMore(false)} className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1 px-3 pb-4">
                {MORE_ITEMS.map(item => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleMoreItem(item.path)}
                      className={`flex flex-col items-center gap-1 py-3 px-1 rounded-2xl transition-colors active:scale-95 ${
                        active ? 'bg-accent text-primary' : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon size={22} className={active ? 'text-primary' : 'text-muted-foreground'} />
                      <span className={`text-[10px] font-medium leading-tight text-center ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
        <div className="flex items-end justify-around max-w-lg mx-auto h-[68px] px-2 pb-1">
          {NAV_ITEMS_LEFT.map(item => (
            <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => navigate(item.path)} />
          ))}

          {/* FAB */}
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

          {/* More button */}
          <button
            onClick={() => setShowMore(v => !v)}
            className={`flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl min-w-[52px] min-h-[48px] relative transition-colors active:scale-95 ${showMore || isMoreActive ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {(showMore || isMoreActive) && (
              <motion.div
                layoutId="nav-indicator-more"
                className="absolute inset-0 rounded-2xl bg-accent"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {showMore
              ? <X size={20} className="relative z-10" />
              : <MoreHorizontal size={20} className="relative z-10" />
            }
            <span className="relative z-10 text-[10px] font-medium">{showMore ? 'Close' : 'More'}</span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
