import { memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMonth, getYear, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { Transaction } from '@/types/finance';

interface Props {
  transactions: Transaction[];
}

const RecurringDueBanner = ({ transactions }: Props) => {
  const navigate = useNavigate();
  const now = new Date();
  const currentMonth = getMonth(now);
  const currentYear = getYear(now);

  // Find unique recurring transaction templates (by merchant+category) that have been logged before
  const recurringTemplates = transactions.filter(tx => tx.isRecurring && tx.type === 'expense');

  // Group by merchant+category to get unique recurring items
  const seen = new Set<string>();
  const unique = recurringTemplates.filter(tx => {
    const key = `${tx.merchant}|${tx.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // For each unique recurring item, check if it was logged this month
  const overdue = unique.filter(template => {
    const key = `${template.merchant}|${template.category}`;
    const loggedThisMonth = transactions.some(tx => {
      const d = parseISO(tx.date);
      return (
        tx.isRecurring &&
        `${tx.merchant}|${tx.category}` === key &&
        getMonth(d) === currentMonth &&
        getYear(d) === currentYear
      );
    });
    return !loggedThisMonth;
  });

  if (overdue.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="bg-accent border border-primary/20 rounded-xl px-4 py-3 flex items-start gap-3 cursor-pointer"
        onClick={() => navigate('/transactions')}
      >
        <RefreshCw size={16} className="shrink-0 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-accent-foreground">
            {overdue.length} recurring {overdue.length === 1 ? 'expense' : 'expenses'} not logged this month
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {overdue.map(tx => `${tx.categoryIcon} ${tx.merchant || tx.category}`).join(', ')}
          </p>
        </div>
        <span className="text-xs text-primary font-medium shrink-0 mt-0.5">Log now →</span>
      </motion.div>
    </AnimatePresence>
  );
};

export default memo(RecurringDueBanner);
