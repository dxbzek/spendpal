import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import type { Transaction } from '@/types/finance';
import { createContext, useContext } from 'react';

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
      <div className="min-h-screen bg-background flex">
        {!isMobile && (
          <DesktopSidebar
            onAddClick={() => { setEditTx(null); setShowAdd(true); }}
            collapsed={isTablet}
          />
        )}

        <div className="flex-1 min-w-0">
          <main className={isMobile ? 'pb-24' : 'pb-8'}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
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
