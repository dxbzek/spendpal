import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { memo, useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import { useCurrency } from '@/context/CurrencyContext';
import type { Transaction } from '@/types/finance';

interface Props {
  transactions: Transaction[];
  creditAccountIds: Set<string>;
}

const MonthlyTrendChart = memo(({ transactions, creditAccountIds }: Props) => {
  const { fmt } = useCurrency();

  const data = useMemo(() => {
    const map: Record<string, { income: number; expenses: number }> = {};
    transactions.forEach(tx => {
      const month = format(parseISO(tx.date), 'yyyy-MM');
      if (!map[month]) map[month] = { income: 0, expenses: 0 };
      if (tx.type === 'income' && !creditAccountIds.has(tx.accountId)) map[month].income += tx.amount;
      else if (tx.type === 'expense') map[month].expenses += tx.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, vals]) => ({
        month: format(parseISO(month + '-01'), 'MMM'),
        Income: Math.round(vals.income),
        Expenses: Math.round(vals.expenses),
      }));
  }, [transactions, creditAccountIds]);

  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Not enough data for trends</p>;

  const maxVal = Math.max(...data.map(d => Math.max(d.Income, d.Expenses)));
  const fmtAxis = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  };

  const ariaLabel = `Monthly income and expenses trend: ${data.map(d => `${d.month}: income ${d.Income}, expenses ${d.Expenses}`).join('; ')}`;

  return (
    <div>
      {/* H6: Accessible chart wrapper with sr-only data table */}
      <figure aria-label={ariaLabel} role="img">
      <table className="sr-only" aria-label="Monthly income and expenses data">
        <thead><tr><th>Month</th><th>Income</th><th>Expenses</th></tr></thead>
        <tbody>{data.map(d => (
          <tr key={d.month}><td>{d.month}</td><td>{d.Income}</td><td>{d.Expenses}</td></tr>
        ))}</tbody>
      </table>
      <div className="h-[180px] sm:h-[200px] lg:h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(142, 72%, 36%)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(142, 72%, 36%)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.1} />
              <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} className="stroke-muted-foreground" />
          <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} className="stroke-muted-foreground" domain={[0, Math.ceil(maxVal * 1.1)]} />
          <Tooltip
            formatter={(val: number) => fmt(val)}
            contentStyle={{ borderRadius: '0.75rem', fontSize: '0.75rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'hsl(var(--card))' }}
          />
          <Area
            type="monotone"
            dataKey="Income"
            stroke="hsl(142, 72%, 36%)"
            strokeWidth={2.5}
            fill="url(#incomeGradient)"
            dot={false}
            activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={600}
          />
          <Area
            type="monotone"
            dataKey="Expenses"
            stroke="hsl(0, 72%, 51%)"
            strokeWidth={2.5}
            fill="url(#expenseGradient)"
            dot={false}
            activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      </figure>
      {/* Custom legend */}
      <div className="flex items-center justify-center gap-5 mt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full bg-income inline-block" />
          <span className="text-[11px] text-muted-foreground">Income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full bg-expense inline-block" />
          <span className="text-[11px] text-muted-foreground">Expenses</span>
        </div>
      </div>
    </div>
  );
});

export default MonthlyTrendChart;
