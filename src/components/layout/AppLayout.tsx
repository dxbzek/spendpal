import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';

const AppLayout = () => {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto relative">
      <main className="pb-24">
        <Outlet />
      </main>
      <BottomNav onAddClick={() => setShowAdd(true)} />
      <AddTransactionSheet open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
};

export default AppLayout;
