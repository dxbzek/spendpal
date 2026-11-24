import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { memo, useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import { useCurrency } from '@/context/CurrencyContext';
import type { Transaction } from '@/types/finance';
import { incomeAndSpending } from '@/lib/finance/transactionFilters';

interface Props {
  transactions: Transaction[];
  creditAccountIds: Set<string>;
}

// Orbix strokes: lavender for income, pink for expenses.
const INCOME = 'hsl(var(--primary))';
const EXPENSE = 'hsl(var(--pink, 326 75% 80%))';
const INK = 'hsl(258 30% 8%)';

/** White pill tooltip, like the Orbix "$50,000 · Milestone" bubble. */
const PillTooltip = ({ active, payload, label, fmt }: {
  active?: boolean; label?: string; fmt: (n: number) => string;
  payload?: { dataKey?: string | number; value?: number }[];
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl bg-white px-3 py-2 shadow-lg" style={{ color: INK }}>
      <p className="text-[11px] opacity-60 mb-0.5">{label}</p>
      {payload.map(p => (
        <p key={String(p.dataKey)} className="text-sm font-semibold tabular-nums leading-snug">
          {fmt(Number(p.value ?? 0))}
          <span className="ml-1.5 text-[11px] font-medium" style={{ color: p.dataKey === 'Income' ? 'hsl(252 60% 58%)' : 'hsl(330 70% 55%)' }}>{String(p.dataKey)}</span>
        </p>
      ))}
    </div>
  );
};

const MonthlyTrendChart = memo(({ transactions, creditAccountIds }: Props) => {
  const { fmt } = useCurrency();

  const data = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    // The same rule as Home's cards (incomeAndSpending): transfers and
    // tracking-only rows left out, spending after refunds. Future-dated rows
    // have not happened yet.
    const byMonth: Record<string, Transaction[]> = {};
    transactions.forEach(tx => {
      if (tx.date > today) return;
      (byMonth[tx.date.slice(0, 7)] ??= []).push(tx);
    });
    const map: Record<string, { income: number; expenses: number }> = {};
    for (const [month, rows] of Object.entries(byMonth)) {
      const { income, spending } = incomeAndSpending(rows, creditAccountIds);
      if (income || spending) map[month] = { income, expenses: spending };
    }
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
      {/* Accessible chart wrapper with sr-only data table */}
      <figure aria-label={ariaLabel} role="img">
      <table className="sr-only" aria-label="Monthly income and expenses data">
        <thead><tr><th>Month</th><th>Income</th><th>Expenses</th></tr></thead>
        <tbody>{data.map(d => (
          <tr key={d.month}><td>{d.month}</td><td>{d.Income}</td><td>{d.Expenses}</td></tr>
        ))}</tbody>
      </table>
      <div className="h-[180px] sm:h-[200px] lg:h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INCOME} stopOpacity={0.28} />
              <stop offset="100%" stopColor={INCOME} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EXPENSE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={EXPENSE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickMargin={8} />
          <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} orientation="right" domain={[0, Math.ceil(maxVal * 1.1)]} />
          <Tooltip
            content={<PillTooltip fmt={fmt} />}
            cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.35, strokeDasharray: '2 4' }}
          />
          <Area
            type="monotone"
            dataKey="Income"
            stroke={INCOME}
            strokeWidth={3}
            strokeLinecap="round"
            fill="url(#incomeGradient)"
            dot={false}
            activeDot={{ r: 5, fill: INCOME, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={600}
          />
          <Area
            type="monotone"
            dataKey="Expenses"
            stroke={EXPENSE}
            strokeWidth={3}
            strokeLinecap="round"
            fill="url(#expenseGradient)"
            dot={false}
            activeDot={{ r: 5, fill: EXPENSE, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      </figure>
      {/* Custom legend */}
      <div className="flex items-center gap-4 mt-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: INCOME }} />
          <span className="text-xs text-muted-foreground">Income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: EXPENSE }} />
          <span className="text-xs text-muted-foreground">Expenses</span>
        </div>
      </div>
    </div>
  );
});

export default MonthlyTrendChart;
