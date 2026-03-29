import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from '@/context/CurrencyContext';
import { CATEGORY_CHART_COLORS } from '@/utils/categoryColors';

interface Props {
  data: { name: string; value: number; icon: string }[];
}

const SpendingPieChart = ({ data }: Props) => {
  const { fmt } = useCurrency();

  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No expense data to visualize</p>;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-full max-w-[180px] shrink-0">
        <ResponsiveContainer width="100%" aspect={1}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="72%"
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
              isAnimationActive={true}
              animationBegin={0}
              animationDuration={600}
              animationEasing="ease-out"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={CATEGORY_CHART_COLORS[entry.name] || CATEGORY_CHART_COLORS._default(i)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val: number) => fmt(val)}
              contentStyle={{ borderRadius: '0.75rem', fontSize: '0.75rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 overflow-hidden w-full">
        {data.slice(0, 5).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_CHART_COLORS[item.name] || CATEGORY_CHART_COLORS._default(i) }} />
              <span className="truncate">{item.name}</span>
            </div>
            <span className="font-medium shrink-0 ml-2">{fmt(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpendingPieChart;
