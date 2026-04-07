import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import type { Transaction } from '@/types/finance';
import { EditTxContext } from '@/context/EditTxContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
export { useEditTransaction } from '@/context/EditTxContext';

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
        {!isMobile && (
          <DesktopSidebar
            onAddClick={() => { setEditTx(null); setShowAdd(true); }}
            collapsed={isTablet}
          />
        )}

        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto">
          <main className={isMobile ? 'pb-28' : 'pb-8'}>
            <AnimatePresence mode="wait">
              <ErrorBoundary>
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
