import { useMemo } from 'react';
import { useCurrency } from '@/context/CurrencyContext';
import { PieChart } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Account, Transaction } from '@/types/finance';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  hidden: boolean;
  mask: (val: string) => string;
}

const TYPE_CONFIG = {
  cash: { label: '💵 Cash', color: 'bg-emerald-500' },
  debit: { label: '💳 Debit', color: 'bg-primary' },
  credit: { label: '🏦 Credit', color: 'bg-amber-500' },
} as const;

const ExpenseByAccountTypeWidget = ({ accounts, transactions, hidden, mask }: Props) => {
  const { fmt } = useCurrency();

  const breakdown = useMemo(() => {
    const accountTypeMap = new Map(accounts.map(a => [a.id, a.type]));
    const totals: Record<string, number> = { cash: 0, debit: 0, credit: 0 };

    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const aType = accountTypeMap.get(t.accountId);
        if (aType && aType in totals) totals[aType] += t.amount;
      });

    return totals;
  }, [accounts, transactions]);

  const total = breakdown.cash + breakdown.debit + breakdown.credit;
  if (total === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <PieChart size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Expenses by Account Type</h2>
      </div>

      <div className="space-y-3">
        {(Object.entries(TYPE_CONFIG) as [string, { label: string; color: string }][]).map(([key, config]) => {
          const amount = breakdown[key] || 0;
          const pct = total ? Math.round((amount / total) * 100) : 0;
          if (amount === 0) return null;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{config.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                  <span className="text-xs font-heading">{mask(fmt(amount))}</span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6 }}
                  className={`h-full rounded-full ${config.color}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
        <span>Total Expenses</span>
        <span className="font-heading text-foreground">{mask(fmt(total))}</span>
      </div>
    </div>
  );
};

export default ExpenseByAccountTypeWidget;
