import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import { useIsMobile } from '@/hooks/use-mobile';
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
        {!isMobile && <DesktopSidebar onAddClick={() => { setEditTx(null); setShowAdd(true); }} />}

        <div className="flex-1 min-w-0">
          <div className="max-w-lg md:max-w-2xl lg:max-w-5xl mx-auto relative">
            <main className={isMobile ? 'pb-24' : 'pb-8'}>
              <Outlet />
            </main>
          </div>
        </div>

        {isMobile && <BottomNav onAddClick={() => { setEditTx(null); setShowAdd(true); }} />}

        <AddTransactionSheet open={showAdd} onOpenChange={handleOpenChange} editTransaction={editTx} />
      </div>
    </EditTxContext.Provider>
  );
};

export default AppLayout;
