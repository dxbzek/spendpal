import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useCurrency } from '@/context/CurrencyContext';

const COLORS = [
  'hsl(152, 62%, 42%)',
  'hsl(140, 50%, 50%)',
  'hsl(165, 55%, 38%)',
  'hsl(148, 40%, 55%)',
  'hsl(155, 60%, 30%)',
  'hsl(160, 45%, 65%)',
  'hsl(145, 50%, 45%)',
  'hsl(168, 40%, 75%)',
];

interface Props {
  data: { name: string; value: number; icon: string }[];
}

const SpendingPieChart = ({ data }: Props) => {
  const { fmt } = useCurrency();

  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No expense data to visualize</p>;

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value" strokeWidth={0}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(val: number) => fmt(val)} contentStyle={{ borderRadius: '0.75rem', fontSize: '0.75rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 overflow-hidden">
        {data.slice(0, 5).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="truncate">{item.icon} {item.name}</span>
            </div>
            <span className="font-medium shrink-0 ml-2">{fmt(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpendingPieChart;
