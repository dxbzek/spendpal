import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import type { Transaction } from '@/types/finance';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFinance } from '@/context/FinanceContext';
import { Button } from '@/components/ui/button';
import { WifiOff } from 'lucide-react';

interface EditTxContextType {
  openEditSheet: (tx: Transaction) => void;
  /** The same blank New Transaction sheet as the + button. */
  openAddSheet: () => void;
}

const EditTxContext = createContext<EditTxContextType>({ openEditSheet: () => {}, openAddSheet: () => {} });
export const useEditTransaction = () => useContext(EditTxContext);

const AppLayout = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { loadError, loading, accounts, refresh } = useFinance();
  // A failed load with nothing on screen must not look like an empty account.
  const nothingLoaded = loadError && !loading && accounts.length === 0 && location.pathname !== '/settings';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  const openEditSheet = (tx: Transaction) => {
    setEditTx(tx);
    setShowAdd(true);
  };

  const openAddSheet = () => {
    setEditTx(null);
    setShowAdd(true);
  };

  const handleOpenChange = (open: boolean) => {
    setShowAdd(open);
    if (!open) setEditTx(null);
  };

  return (
    <EditTxContext.Provider value={{ openEditSheet, openAddSheet }}>
      <div className="h-full bg-background flex overflow-hidden">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to content
        </a>
        {!isMobile && (
          <DesktopSidebar
            onAddClick={() => { setEditTx(null); setShowAdd(true); }}
            collapsed={isTablet}
          />
        )}

        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto bg-[hsl(142,32%,96.5%)] dark:bg-background">
          <main id="main-content" className={isMobile
            ? 'pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[calc(7rem+env(safe-area-inset-bottom))]'
            : 'pb-8'}>
            <AnimatePresence mode="wait">
              <ErrorBoundary key={location.pathname}>
                <m.div
                  key={location.pathname}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {loadError && !nothingLoaded && accounts.length > 0 && (
                    <div role="alert" className="mx-5 md:mx-8 mt-4 flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                      <span>Couldn't refresh. These numbers may be out of date.</span>
                      <Button size="sm" variant="outline" onClick={() => refresh()}>Retry</Button>
                    </div>
                  )}
                  {nothingLoaded ? (
                    <div role="alert" className="px-5 md:px-8 pt-16 max-w-md mx-auto text-center">
                      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <WifiOff size={28} className="text-muted-foreground" />
                      </div>
                      <h1 className="text-xl font-heading mb-2">Couldn't load your data</h1>
                      <p className="text-sm text-muted-foreground mb-5">Your data is safe. Check your connection and try again.</p>
                      <Button className="h-11 px-6" onClick={() => refresh()}>Try again</Button>
                    </div>
                  ) : <Outlet />}
                </m.div>
              </ErrorBoundary>
            </AnimatePresence>
          </main>
        </div>

        {isMobile && <BottomNav onAddClick={() => { setEditTx(null); setShowAdd(true); }} />}

        <AddTransactionSheet open={showAdd} onOpenChange={handleOpenChange} editTransaction={editTx} />
      </div>
    </EditTxContext.Provider>
  );
};

export default AppLayout;
