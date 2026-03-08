import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';
import { useIsMobile } from '@/hooks/use-mobile';

const AppLayout = () => {
  const [showAdd, setShowAdd] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      {!isMobile && <DesktopSidebar onAddClick={() => setShowAdd(true)} />}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="max-w-lg md:max-w-2xl lg:max-w-5xl mx-auto relative">
          <main className={isMobile ? 'pb-24' : 'pb-8'}>
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && <BottomNav onAddClick={() => setShowAdd(true)} />}

      <AddTransactionSheet open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
};

export default AppLayout;
