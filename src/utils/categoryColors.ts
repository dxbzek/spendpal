// Distinct colors for each spending category used in charts and bars
const COLORS_MAP: Record<string, string> = {
  'Transfer': '#6366f1',
  'Transport': '#3b82f6',
  'Dining': '#f97316',
  'Food & Dining': '#f97316',
  'Groceries': '#22c55e',
  'Shopping': '#ec4899',
  'Entertainment': '#a855f7',
  'Bills & Utilities': '#eab308',
  'Health': '#ef4444',
  'Education': '#6366f1',
  'Travel': '#06b6d4',
  'Rent': '#8b5cf6',
  'Subscriptions': '#14b8a6',
  'Other': '#64748b',
};

const FALLBACK = ['#6366f1','#3b82f6','#f97316','#22c55e','#ec4899','#a855f7','#eab308','#ef4444','#06b6d4','#64748b'];

export const CATEGORY_CHART_COLORS = {
  ...COLORS_MAP,
  _default: (i: number) => FALLBACK[i % FALLBACK.length],
};

export const getCategoryChartColor = (category: string, index: number): string =>
  COLORS_MAP[category] || FALLBACK[index % FALLBACK.length];
