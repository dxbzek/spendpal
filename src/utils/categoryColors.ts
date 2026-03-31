// Distinct colors for each spending category used in charts and bars
const COLORS_MAP: Record<string, string> = {
  'Transfer': '#6366f1',
  'Transport': '#3b82f6',
  'Metro/Taxi': '#0ea5e9',
  'Dining': '#f97316',
  'Food & Dining': '#f97316',
  'Coffee': '#92400e',
  'Groceries': '#22c55e',
  'Shopping': '#ec4899',
  'Entertainment': '#a855f7',
  'Bills & Utilities': '#eab308',
  'DEWA': '#facc15',
  'Telecom': '#0891b2',
  'Health': '#ef4444',
  'Education': '#7c3aed',
  'Travel': '#06b6d4',
  'Rent': '#8b5cf6',
  'Subscriptions': '#14b8a6',
  'Charity': '#f472b6',
  'Delivery': '#fb923c',
  'Salary': '#10b981',
  'Freelance': '#34d399',
  'Investment': '#6366f1',
  'Utilities': '#f59e0b',
  'Insurance': '#64748b',
  'Fitness': '#22d3ee',
  'Personal Care': '#f43f5e',
  'Gift': '#c084fc',
  'Bonus': '#fbbf24',
  'Business': '#0284c7',
  'Rental Income': '#8b5cf6',
  'Refund': '#4ade80',
  'Other': '#64748b',
};

const FALLBACK = ['#6366f1','#3b82f6','#f97316','#22c55e','#ec4899','#a855f7','#eab308','#ef4444','#06b6d4','#64748b'];

export const CATEGORY_CHART_COLORS = {
  ...COLORS_MAP,
  _default: (i: number) => FALLBACK[i % FALLBACK.length],
};

export const getCategoryChartColor = (category: string, index: number): string =>
  COLORS_MAP[category] || FALLBACK[index % FALLBACK.length];

/**
 * Extract the first emoji character from a category icon string.
 * Falls back to the first character if no emoji is found.
 */
export const extractEmoji = (icon: string): string => {
  const match = icon.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u);
  return match ? match[0] : icon.charAt(0);
};
