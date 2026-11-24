import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, Wallet, BarChart3, Plus,
  MoreHorizontal, PiggyBank, Target, Layers, CalendarDays,
  Brain, Settings, CreditCard, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { m } from 'framer-motion';
import { NAV_SHORT_NAMES, PAGE_NAMES } from '@/lib/pageNames';

// Three slots either side of +. Installments and Accounts moved out of More
// (Zek, 2026-11-22): they are the pages he opens most.
const NAV_ITEMS_LEFT = [
  { path: '/', label: PAGE_NAMES['/'], icon: LayoutDashboard },
  { path: '/transactions', label: PAGE_NAMES['/transactions'], short: NAV_SHORT_NAMES['/transactions'], icon: Receipt },
  { path: '/installments', label: PAGE_NAMES['/installments'], short: NAV_SHORT_NAMES['/installments'], icon: Layers },
];

const NAV_ITEMS_RIGHT = [
  { path: '/accounts', label: PAGE_NAMES['/accounts'], icon: Wallet },
  { path: '/budgets', label: PAGE_NAMES['/budgets'], icon: PiggyBank },
];

const MORE_ITEMS = [
  { path: '/goals', label: PAGE_NAMES['/goals'], icon: Target },
  { path: '/reports', label: PAGE_NAMES['/reports'], icon: BarChart3 },
  { path: '/debt', label: PAGE_NAMES['/debt'], icon: CreditCard },
  { path: '/advisor', label: PAGE_NAMES['/advisor'], icon: Brain },
  { path: '/calendar', label: PAGE_NAMES['/calendar'], icon: CalendarDays },
  { path: '/settings', label: PAGE_NAMES['/settings'], icon: Settings },
];

const ALL_MORE_PATHS = MORE_ITEMS.map(i => i.path);

interface BottomNavProps {
  onAddClick: () => void;
}

// Orbix look (2026-11-24): a floating light pill. Idle slots are icons; the
// open page grows into a lavender pill with its name.
const NavButton = ({ label, short, icon: Icon, active, onClick }: {
  path: string; label: string; short?: string; icon: LucideIcon; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    className={`h-12 shrink-0 rounded-full flex items-center justify-center gap-1.5 transition-[background-color,padding] duration-200 ${
      active ? 'bg-primary text-primary-foreground px-3.5' : 'w-10 text-[hsl(258_12%_32%)]'
    }`}
  >
    <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
    {active && (
      <span title={label} aria-hidden="true" className="hidden min-[370px]:inline text-[13px] font-semibold whitespace-nowrap">
        {short ?? label}
      </span>
    )}
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
          animating panel can never knock it off-centre.
          It unmounts the moment showMore is false. It used to wait for an
          exit animation, and when that stalled (iOS pauses animations in
          the background) the sheet stayed on screen with showMore already
          false, so its X did nothing. */}
      {createPortal(
        showMore && (
            <>
              {/* Backdrop */}
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[44] bg-black/30"
                onPointerDown={(e) => { e.stopPropagation(); setShowMore(false); }}
              />

              {/* Centering wrapper: full-width, pinned just above the nav bar.
                  pointer-events-none so taps in the side gutters fall through
                  to the backdrop; the panel re-enables pointer events. */}
              <div className="fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[62] flex justify-center px-3 pointer-events-none">
                <m.div
                  role="dialog"
                  aria-label="More"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="pointer-events-auto w-full max-w-md bg-card border border-border rounded-[28px] shadow-overlay overflow-y-auto max-h-[60vh]"
                >
                  <div className="flex justify-center pt-2 pb-0.5">
                    <div className="w-9 h-1 rounded-full bg-border" />
                  </div>
                  <div className="flex items-center justify-between pl-5 pr-3 pt-1 pb-2">
                    <span className="text-sm font-semibold text-foreground">More</span>
                    <button
                      type="button"
                      onClick={() => setShowMore(false)}
                      aria-label="Close menu"
                      className="flex items-center justify-center w-11 h-11 -mr-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
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
                          className={`flex flex-col items-center justify-center gap-1.5 py-3.5 px-1 min-h-[64px] rounded-xl transition-colors ${
                            active ? 'bg-accent text-primary' : 'hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon size={22} className={active ? 'text-primary' : 'text-muted-foreground'} />
                          <span className={`text-xs font-medium leading-tight text-center ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </m.div>
              </div>
            </>
        ),
        document.body,
      )}

      {/* Bottom bar */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-[45] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pointer-events-none">
        <div className="nav-pill pointer-events-auto max-w-md mx-auto h-[60px] rounded-full flex items-center justify-between px-1.5">
          {NAV_ITEMS_LEFT.map(item => (
            <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => handleNavClick(item.path)} />
          ))}

          {/* Add */}
          <button
            onClick={onAddClick}
            className="w-12 h-12 shrink-0 rounded-full bg-[hsl(258_30%_8%)] flex items-center justify-center"
            aria-label="Add transaction"
          >
            <Plus size={24} className="text-primary" />
          </button>

          {NAV_ITEMS_RIGHT.map(item => (
            <NavButton key={item.path} {...item} active={location.pathname === item.path} onClick={() => handleNavClick(item.path)} />
          ))}

          {/* More */}
          <button
            onClick={() => setShowMore(v => !v)}
            aria-expanded={showMore}
            aria-label="More options"
            className={`h-12 shrink-0 rounded-full flex items-center justify-center gap-1.5 transition-[background-color,padding] duration-200 ${
              showMore || isMoreActive ? 'bg-primary text-primary-foreground px-3.5' : 'w-10 text-[hsl(258_12%_32%)]'
            }`}
          >
            {showMore ? <X size={20} /> : <MoreHorizontal size={20} />}
            {(showMore || isMoreActive) && (
              <span aria-hidden="true" className="hidden min-[370px]:inline text-[13px] font-semibold">{showMore ? 'Close' : 'More'}</span>
            )}
          </button>
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
