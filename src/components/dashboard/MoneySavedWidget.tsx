import { useCurrency } from '@/context/CurrencyContext';
import { PiggyBank, TrendingUp, TrendingDown } from 'lucide-react';
import GlossaryLink from '@/components/GlossaryLink';
import type { Transaction } from '@/types/finance';
import { memo, useMemo } from 'react';

interface Props {
  transactions: Transaction[];
  creditAccountIds: Set<string>;
  hidden: boolean;
  mask: (val: string) => string;
}

const MoneySavedWidget = ({ transactions, creditAccountIds, hidden: _hidden, mask }: Props) => {
  const { fmt } = useCurrency();

  const { saved, pct } = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTx = transactions.filter(t => t.date.startsWith(currentMonth));
    const inc = monthTx.filter(t => t.type === 'income' && !creditAccountIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
    const exp = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const sav = inc - exp;
    return { income: inc, expenses: exp, saved: sav, pct: inc > 0 ? Math.round((sav / inc) * 100) : 0 };
  }, [transactions, creditAccountIds]);

  const positive = saved >= 0;

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow h-full transition-shadow hover:card-shadow-hover">
      <div className="flex items-center gap-2 mb-2">
        <PiggyBank size={16} className="text-primary shrink-0" />
        <h2 className="font-heading text-sm">Saved This Month</h2>
        <GlossaryLink term="Saved This Month" />
      </div>
      <p className={`text-financial-large ${positive ? 'text-income' : 'text-expense'} mt-1`}>
        {mask(fmt(saved))}
      </p>
      <div className="flex items-center gap-1 mt-2">
        {positive
          ? <TrendingUp size={12} className="text-income shrink-0" />
          : <TrendingDown size={12} className="text-expense shrink-0" />}
        <p className={`text-xs font-medium ${positive ? 'text-income' : 'text-expense'}`}>
          {positive ? `${pct}% of income` : 'Over income'}
        </p>
      </div>
    </div>
  );
};

export default memo(MoneySavedWidget);
