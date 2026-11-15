import { memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { Transaction } from '@/types/finance';
import { notLoggedThisMonth } from '@/lib/finance/recurringBills';

interface Props {
  transactions: Transaction[];
}

const RecurringDueBanner = ({ transactions }: Props) => {
  const navigate = useNavigate();
  // Running bills with no row this month. Instalment plans, tracking-only
  // rows and bills not logged for 3 months are not asked for.
  const overdue = notLoggedThisMonth(transactions, new Date());

  if (overdue.length === 0) return null;

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="bg-accent border border-primary-line rounded-xl px-4 py-3 flex items-start gap-3 cursor-pointer"
        onClick={() => navigate('/transactions')}
      >
        <RefreshCw size={16} className="shrink-0 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-accent-foreground">
            {overdue.length} recurring not logged
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {overdue.map(tx => tx.merchant || tx.category).join(', ')}
          </p>
        </div>
        <span className="text-xs text-primary font-medium shrink-0 mt-0.5">Log now →</span>
      </m.div>
    </AnimatePresence>
  );
};

export default memo(RecurringDueBanner);
