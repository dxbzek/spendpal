import { useCurrency } from '@/context/CurrencyContext';
import { PiggyBank } from 'lucide-react';
import GlossaryLink from '@/components/GlossaryLink';
import type { Transaction } from '@/types/finance';
import { useMemo } from 'react';

interface Props {
  transactions: Transaction[];
  creditAccountIds: Set<string>;
  hidden: boolean;
  mask: (val: string) => string;
}

const MoneySavedWidget = ({ transactions, creditAccountIds, hidden, mask }: Props) => {
  const { fmt } = useCurrency();

  const { income, expenses, saved, pct } = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTx = transactions.filter(t => t.date.startsWith(currentMonth));
    const inc = monthTx.filter(t => t.type === 'income' && !creditAccountIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
    const exp = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const sav = inc - exp;
    return { income: inc, expenses: exp, saved: sav, pct: inc > 0 ? Math.round((sav / inc) * 100) : 0 };
  }, [transactions, creditAccountIds]);

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <PiggyBank size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Saved This Month</h2>
        <GlossaryLink term="Saved This Month" />
      </div>
      <p className={`text-2xl font-heading ${saved >= 0 ? 'text-income' : 'text-expense'}`}>
        {mask(fmt(saved))}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {saved >= 0 ? `${pct}% of income saved` : 'Spending more than earning'}
      </p>
    </div>
  );
};

export default MoneySavedWidget;
