import { memo, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import type { Transaction } from '@/types/finance';
import { ONE_OFF_OVER, spendingForecast } from '@/lib/finance/spendingForecast';

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

  // Hidden before day 10; see lib/finance/spendingForecast for how it's worked out.
  const forecast = useMemo(() => spendingForecast(transactions, new Date()), [transactions]);
  if (!forecast) return null;
  const { spentSoFar, projected, low, high, daysElapsed, daysInMonth, everydayPerDay, oneOffs, lastMonthSpent } = forecast;
  const isOnTrack = lastMonthSpent === 0 || projected <= lastMonthSpent;

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
            <span className="text-sm font-normal text-muted-foreground">about </span>{fmt(projected)}
          </p>
          {high - low >= 1 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{fmt(low)} – {fmt(high)}</p>
          )}
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
        <span>{fmt(Math.round(everydayPerDay))}/day everyday spend</span>
      </div>
      {oneOffs.count > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {oneOffs.count} one-off{oneOffs.count > 1 ? 's' : ''} over {fmt(ONE_OFF_OVER)} ({fmt(Math.round(oneOffs.total))}) counted once, not projected.
        </p>
      )}
    </div>
  );
};

export default memo(SpendingForecastWidget);
