import { memo, useMemo } from 'react';
import { isCountableExpense } from '@/lib/finance/transactionFilters';
import { useCurrency } from '@/context/CurrencyContext';
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from 'lucide-react';
import GlossaryLink from '@/components/GlossaryLink';
import { ACCOUNT_TYPE_NAMES } from '@/lib/pageNames';
import { format, parseISO } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';
import AppIcon from '@/components/AppIcon';
import { useToday } from '@/hooks/useToday';
import { lastMonthSameDays } from '@/lib/today';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  hidden: boolean;
  mask: (val: string) => string;
}

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  cash: { label: ACCOUNT_TYPE_NAMES.cash, icon: '💵' },
  debit: { label: ACCOUNT_TYPE_NAMES.debit, icon: '💳' },
  credit: { label: ACCOUNT_TYPE_NAMES.credit, icon: '🏦' },
};

const MonthlyComparisonWidget = ({ accounts, transactions, hidden: _hidden, mask }: Props) => {
  const { fmt } = useCurrency();
  const today = useToday();

  const comparison = useMemo(() => {
    // This month to today against the same days of last month. Against the
    // whole of last month, any day before month end read as a large drop.
    const thisStart = `${today.slice(0, 7)}-01`;
    const last = lastMonthSameDays(today);

    const accountTypeMap = new Map(accounts.map(a => [a.id, a.type]));

    const calcByType = (start: string, end: string) => {
      const totals: Record<string, number> = { cash: 0, debit: 0, credit: 0 };
      transactions
        .filter(t => isCountableExpense(t) && t.date >= start && t.date <= end)
        .forEach(t => {
          const aType = accountTypeMap.get(t.accountId);
          if (aType && aType in totals) totals[aType] += t.amount;
        });
      return totals;
    };

    // Ends at today, so future-dated rows aren't counted.
    const thisMonth = calcByType(thisStart, today);
    const lastMonth = calcByType(last.start, last.end);

    const thisTotal = thisMonth.cash + thisMonth.debit + thisMonth.credit;
    const lastTotal = lastMonth.cash + lastMonth.debit + lastMonth.credit;

    // The headers say which days are compared, unless both months are whole.
    const label = (start: string, endDay: number) => last.monthComplete
      ? format(parseISO(start), 'MMM yyyy')
      : `${format(parseISO(start), 'MMM')} 1-${endDay}`;

    return {
      thisMonth,
      lastMonth,
      thisTotal,
      lastTotal,
      thisLabel: label(thisStart, Number(today.slice(8, 10))),
      lastLabel: label(last.start, last.endDay),
    };
  }, [accounts, transactions, today]);

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
      <span className={`text-xs font-medium flex items-center gap-0.5 ${isUp ? 'text-expense' : 'text-income'}`}>
        {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {Math.abs(pct)}%
      </span>
    );
  };

  if (thisTotal === 0 && lastTotal === 0) return null;

  return (
    <div className="bg-card rounded-xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Month vs Month</h2>
        <GlossaryLink term="Month vs Month" />
      </div>

      {/* Header row */}
      <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground mb-2 px-1">
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
                <span><AppIcon value={config.icon} /></span> {config.label}
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

export default memo(MonthlyComparisonWidget);
