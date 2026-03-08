import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = [
  'hsl(152, 62%, 42%)',
  'hsl(38, 92%, 50%)',
  'hsl(270, 60%, 55%)',
  'hsl(200, 70%, 50%)',
  'hsl(0, 72%, 55%)',
  'hsl(330, 70%, 55%)',
  'hsl(168, 55%, 40%)',
  'hsl(60, 70%, 45%)',
];

interface Props {
  data: { name: string; value: number; icon: string }[];
}

const SpendingPieChart = ({ data }: Props) => {
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No expense data to visualize</p>;

  const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value" strokeWidth={0}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(val: number) => `د.إ ${fmt(val)}`} contentStyle={{ borderRadius: '0.75rem', fontSize: '0.75rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 overflow-hidden">
        {data.slice(0, 5).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="truncate">{item.icon} {item.name}</span>
            </div>
            <span className="font-medium shrink-0 ml-2">د.إ {fmt(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpendingPieChart;
