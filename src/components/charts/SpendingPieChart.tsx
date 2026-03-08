import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useCurrency } from '@/context/CurrencyContext';
import { CATEGORY_CHART_COLORS } from '@/utils/categoryColors';

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
            {data.map((entry, i) => <Cell key={i} fill={CATEGORY_CHART_COLORS[entry.name] || CATEGORY_CHART_COLORS._default(i)} />)}
          </Pie>
          <Tooltip formatter={(val: number) => fmt(val)} contentStyle={{ borderRadius: '0.75rem', fontSize: '0.75rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 overflow-hidden">
        {data.slice(0, 5).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_CHART_COLORS[item.name] || CATEGORY_CHART_COLORS._default(i) }} />
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
