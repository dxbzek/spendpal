import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, Wallet, BarChart3, Plus,
  MoreHorizontal, PiggyBank, Target, Layers, CalendarDays,
  Brain, Settings, CreditCard, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';

const NAV_ITEMS_LEFT = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/transactions', label: 'Txns', icon: Receipt },
];

const NAV_ITEMS_RIGHT = [
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/advisor', label: 'Advisor', icon: Brain },
];

const MORE_ITEMS = [
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/debt', label: 'Debt', icon: CreditCard },
  { path: '/installments', label: 'Installments', icon: Layers },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const ALL_MORE_PATHS = MORE_ITEMS.map(i => i.path);

interface BottomNavProps {
  onAddClick: () => void;
}

const NavButton = ({ path, label, icon: Icon, active, onClick }: {
  path: string; label: string; icon: LucideIcon; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className="flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl min-w-[52px] min-h-[48px] relative transition-colors active:scale-95"
  >
    {active && (
      <m.div
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

  // Close on route change
  useEffect(() => { setShowMore(false); }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMore(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showMore]);

  const handleMoreItem = (path: string) => {
    setShowMore(false);
    navigate(path);
  };

  const handleNavClick = (path: string) => {
    setShowMore(false);
    navigate(path);
  };

  return (
    <>
      {/* More overlay — rendered in a portal on document.body so no ancestor
          stacking/overflow/transform context can clip or offset it, and
          centered with flexbox (not margin-auto) so a transform on the
          animating panel can never knock it off-centre. */}
      {createPortal(
        <AnimatePresence>
          {showMore && (
            <>
              {/* Backdrop */}
              <m.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[52] bg-black/30 backdrop-blur-sm"
                onPointerDown={(e) => { e.stopPropagation(); setShowMore(false); }}
              />

              {/* Centering wrapper: full-width, pinned just above the nav bar.
                  pointer-events-none so taps in the side gutters fall through
                  to the backdrop; the panel re-enables pointer events. */}
              <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[62] flex justify-center px-3 pointer-events-none">
                <m.div
                  key="more-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="pointer-events-auto w-full max-w-md bg-card border border-border rounded-3xl shadow-overlay overflow-y-auto max-h-[60vh]"
                >
                  <div className="flex items-center justify-between pl-5 pr-3 pt-3 pb-2">
                    <span className="text-sm font-semibold text-foreground">More</span>
                    <button
                      type="button"
                      onClick={() => setShowMore(false)}
                      aria-label="Close menu"
                      className="flex items-center justify-center w-9 h-9 -mr-1 rounded-full hover:bg-muted active:scale-95 text-muted-foreground transition-colors"
                    >
                      <X size={18} />
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
                          className={`flex flex-col items-center justify-center gap-1.5 py-3.5 px-1 min-h-[64px] rounded-2xl transition-colors active:scale-95 ${
                            active ? 'bg-accent text-primary' : 'hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon size={22} className={active ? 'text-primary' : 'text-muted-foreground'} />
                          <span className={`text-[11px] font-medium leading-tight text-center ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </m.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Bottom bar */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-[54] bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
        <div className="flex items-end justify-around max-w-lg mx-auto h-[68px] px-2 pb-1">
          {NAV_ITEMS_LEFT.map(item => (
            <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => handleNavClick(item.path)} />
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
            <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => handleNavClick(item.path)} />
          ))}

          {/* More button */}
          <button
            onClick={() => setShowMore(v => !v)}
            aria-expanded={showMore}
            aria-label="More options"
            className={`flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl min-w-[52px] min-h-[48px] relative transition-colors active:scale-95 ${showMore || isMoreActive ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {(showMore || isMoreActive) && (
              <m.div
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
