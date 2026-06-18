import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import type { Transaction } from '@/types/finance';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface EditTxContextType {
  openEditSheet: (tx: Transaction) => void;
}

const EditTxContext = createContext<EditTxContextType>({ openEditSheet: () => {} });
export const useEditTransaction = () => useContext(EditTxContext);

const AppLayout = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  const openEditSheet = (tx: Transaction) => {
    setEditTx(tx);
    setShowAdd(true);
  };

  const handleOpenChange = (open: boolean) => {
    setShowAdd(open);
    if (!open) setEditTx(null);
  };

  return (
    <EditTxContext.Provider value={{ openEditSheet }}>
      <div className="h-screen bg-background flex overflow-hidden">
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
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <Outlet />
                </motion.div>
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
