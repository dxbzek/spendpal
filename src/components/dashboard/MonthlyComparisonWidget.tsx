import { useMemo } from 'react';
import { useCurrency } from '@/context/CurrencyContext';
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from 'lucide-react';
import GlossaryLink from '@/components/GlossaryLink';
import { startOfMonth, subMonths, format, parseISO, isWithinInterval, endOfMonth } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  hidden: boolean;
  mask: (val: string) => string;
}

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Cash', icon: '💵' },
  debit: { label: 'Debit', icon: '💳' },
  credit: { label: 'Credit', icon: '🏦' },
};

const MonthlyComparisonWidget = ({ accounts, transactions, hidden, mask }: Props) => {
  const { fmt } = useCurrency();

  const comparison = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const accountTypeMap = new Map(accounts.map(a => [a.id, a.type]));

    const calcByType = (start: Date, end: Date) => {
      const totals: Record<string, number> = { cash: 0, debit: 0, credit: 0 };
      transactions
        .filter(t => t.type === 'expense' && isWithinInterval(parseISO(t.date), { start, end }))
        .forEach(t => {
          const aType = accountTypeMap.get(t.accountId);
          if (aType && aType in totals) totals[aType] += t.amount;
        });
      return totals;
    };

    const thisMonth = calcByType(thisMonthStart, thisMonthEnd);
    const lastMonth = calcByType(lastMonthStart, lastMonthEnd);

    const thisTotal = thisMonth.cash + thisMonth.debit + thisMonth.credit;
    const lastTotal = lastMonth.cash + lastMonth.debit + lastMonth.credit;

    return {
      thisMonth,
      lastMonth,
      thisTotal,
      lastTotal,
      thisLabel: format(thisMonthStart, 'MMM yyyy'),
      lastLabel: format(lastMonthStart, 'MMM yyyy'),
    };
  }, [accounts, transactions]);

  const { thisMonth, lastMonth, thisTotal, lastTotal, thisLabel, lastLabel } = comparison;

  const changePct = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const ChangeIndicator = ({ current, previous }: { current: number; previous: number }) => {
    const pct = changePct(current, previous);
    if (pct === 0) return <Minus size={12} className="text-muted-foreground" />;
    const isUp = pct > 0;
    return (
      <span className={`text-[11px] font-medium flex items-center gap-0.5 ${isUp ? 'text-expense' : 'text-income'}`}>
        {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {Math.abs(pct)}%
      </span>
    );
  };

  if (thisTotal === 0 && lastTotal === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Month vs Month</h2>
        <GlossaryLink term="Month vs Month" />
      </div>

      {/* Header row */}
      <div className="grid grid-cols-4 gap-2 text-[11px] text-muted-foreground mb-2 px-1">
        <span>Type</span>
        <span className="text-right">{lastLabel}</span>
        <span className="text-right">{thisLabel}</span>
        <span className="text-right">Change</span>
      </div>

      {/* Rows */}
      <div className="space-y-2.5">
        {(['cash', 'debit', 'credit'] as const).map(key => {
          const prev = lastMonth[key] || 0;
          const curr = thisMonth[key] || 0;
          if (prev === 0 && curr === 0) return null;
          const config = TYPE_LABELS[key];

          return (
            <div key={key} className="grid grid-cols-4 gap-2 items-center px-1">
              <span className="text-xs font-medium flex items-center gap-1">
                <span>{config.icon}</span> {config.label}
              </span>
              <span className="text-xs text-muted-foreground text-right">{mask(fmt(prev))}</span>
              <span className="text-xs font-heading text-right">{mask(fmt(curr))}</span>
              <div className="flex justify-end">
                <ChangeIndicator current={curr} previous={prev} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total row */}
      <div className="mt-3 pt-3 border-t border-border grid grid-cols-4 gap-2 items-center px-1">
        <span className="text-xs font-heading">Total</span>
        <span className="text-xs text-muted-foreground text-right">{mask(fmt(lastTotal))}</span>
        <span className="text-xs font-heading text-right">{mask(fmt(thisTotal))}</span>
        <div className="flex justify-end">
          <ChangeIndicator current={thisTotal} previous={lastTotal} />
        </div>
      </div>
    </div>
  );
};

export default MonthlyComparisonWidget;
