import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import { useCurrency } from '@/context/CurrencyContext';
import type { Transaction } from '@/types/finance';

interface Props {
  transactions: Transaction[];
}

const MonthlyTrendChart = ({ transactions }: Props) => {
  const { fmt } = useCurrency();

  const data = useMemo(() => {
    const map: Record<string, { income: number; expenses: number }> = {};
    transactions.forEach(tx => {
      const month = format(parseISO(tx.date), 'yyyy-MM');
      if (!map[month]) map[month] = { income: 0, expenses: 0 };
      if (tx.type === 'income') map[month].income += tx.amount;
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
  }, [transactions]);

  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Not enough data for trends</p>;

  const fmtAxis = (n: number) => `${(n / 1000).toFixed(1)}k`;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} className="stroke-muted-foreground" />
        <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} className="stroke-muted-foreground" />
        <Tooltip formatter={(val: number) => fmt(val)}
          contentStyle={{ borderRadius: '0.75rem', fontSize: '0.75rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'hsl(var(--card))' }} />
        <Line type="monotone" dataKey="Income" stroke="hsl(152, 62%, 42%)" strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="Expenses" stroke="hsl(152, 50%, 28%)" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default MonthlyTrendChart;
