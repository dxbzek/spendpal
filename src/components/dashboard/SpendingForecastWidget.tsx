import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { getDaysInMonth, getDate } from 'date-fns';
import type { Transaction } from '@/types/finance';

interface Props {
  transactions: Transaction[];
}

const SpendingForecastWidget = ({ transactions }: Props) => {
  const { fmt } = useCurrency();

  const { spentSoFar, projected, daysElapsed, daysInMonth, dailyAvg, isOnTrack } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysElapsed = getDate(now);
    const daysInMonth = getDaysInMonth(now);

    const spentSoFar = transactions
      .filter(tx => {
        if (tx.type !== 'expense') return false;
        const d = new Date(tx.date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const dailyAvg = daysElapsed > 0 ? spentSoFar / daysElapsed : 0;
    const projected = Math.round(dailyAvg * daysInMonth);

    const lastMonthSpent = transactions
      .filter(tx => {
        if (tx.type !== 'expense') return false;
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
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground mb-0.5">Spent so far</p>
          <p className="text-sm font-semibold">{fmt(Math.round(spentSoFar))}</p>
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
        <span>{fmt(Math.round(dailyAvg))}/day avg</span>
      </div>
    </div>
  );
};

export default SpendingForecastWidget;
