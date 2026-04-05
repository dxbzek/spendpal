import { memo, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { getDaysInMonth, getDate } from 'date-fns';
import type { Transaction } from '@/types/finance';

const INCOME_KEY = 'spendpal_monthly_income';

interface Props {
  transactions: Transaction[];
}

const SpendingForecastWidget = ({ transactions }: Props) => {
  const { fmt } = useCurrency();

  const monthlyIncome = useMemo(() => {
    const v = parseFloat(localStorage.getItem(INCOME_KEY) || '0');
    return isNaN(v) ? 0 : v;
  }, []);

  const { spentSoFar, projected, daysElapsed, daysInMonth, dailyAvg, isOnTrack } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysElapsed = getDate(now);
    const daysInMonth = getDaysInMonth(now);

    const spentSoFar = transactions
      .filter(tx => {
        if (tx.type !== 'expense' || tx.category === 'Transfer' || tx.isTrackingOnly) return false;
        const d = new Date(tx.date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const dailyAvg = daysElapsed > 0 ? spentSoFar / daysElapsed : 0;

    // On days 1–2 the daily rate is unreliable (e.g. rent paid day 1 extrapolates to 39k).
    // Use actual spend so far instead of linear extrapolation.
    const projected = daysElapsed <= 2
      ? spentSoFar
      : Math.round(dailyAvg * daysInMonth);

    const lastMonthSpent = transactions
      .filter(tx => {
        if (tx.type !== 'expense' || tx.category === 'Transfer' || tx.isTrackingOnly) return false;
        const d = new Date(tx.date);
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const isOnTrack = lastMonthSpent === 0 || projected <= lastMonthSpent;

    return { spentSoFar, projected, daysElapsed, daysInMonth, dailyAvg, isOnTrack };
  }, [transactions]);

  if (spentSoFar === 0) return null;

  const pct = Math.min(Math.round((daysElapsed / daysInMonth) * 100), 100);
  const incomePct = monthlyIncome > 0 ? Math.round((projected / monthlyIncome) * 100) : null;
  const incomeColor = incomePct == null ? '' : incomePct > 90 ? 'text-expense' : incomePct > 70 ? 'text-warning' : 'text-income';

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Spending Forecast</h2>
      </div>

      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-[11px] text-muted-foreground mb-0.5">Projected month-end</p>
          <p className={`text-financial-large font-heading ${isOnTrack ? 'text-primary' : 'text-expense'}`}>
            {fmt(projected)}
          </p>
          {incomePct !== null && (
            <p className={`text-[11px] mt-0.5 font-medium ${incomeColor}`}>
              {incomePct}% of monthly income
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground mb-0.5">Spent so far</p>
          <p className="text-sm font-semibold">{fmt(Math.round(spentSoFar))}</p>
          {monthlyIncome > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">of {fmt(monthlyIncome)}/mo</p>
          )}
        </div>
      </div>

      {/* Progress bar showing how far through the month we are */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Day {daysElapsed} of {daysInMonth}</span>
        <span>{daysElapsed <= 2 ? 'Early — projection pending' : `${fmt(Math.round(dailyAvg))}/day avg`}</span>
      </div>
    </div>
  );
};

export default memo(SpendingForecastWidget);
