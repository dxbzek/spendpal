// Distinct colors for each spending category used in charts and bars
export const CATEGORY_CHART_COLORS: Record<string, string> & { _default: (i: number) => string } = {
  'Transfer': '#6366f1',       // indigo
  'Transport': '#3b82f6',      // blue
  'Dining': '#f97316',         // orange
  'Food & Dining': '#f97316',  // orange
  'Groceries': '#22c55e',      // green
  'Shopping': '#ec4899',       // pink
  'Entertainment': '#a855f7',  // purple
  'Bills & Utilities': '#eab308', // yellow
  'Health': '#ef4444',         // red
  'Education': '#6366f1',      // indigo
  'Travel': '#06b6d4',         // cyan
  'Rent': '#8b5cf6',           // violet
  'Subscriptions': '#14b8a6',  // teal
  'Other': '#64748b',          // slate
  _default: (i: number) => {
    const fallback = ['#6366f1','#3b82f6','#f97316','#22c55e','#ec4899','#a855f7','#eab308','#ef4444','#06b6d4','#64748b'];
    return fallback[i % fallback.length];
  },
};
