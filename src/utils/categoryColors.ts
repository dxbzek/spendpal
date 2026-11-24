// Category colours for charts and bars: Orbix pastels (lavender, pink, peach,
// mint, sky...), distinct from each other and readable on the dark surfaces.
const PALETTE = ['#b6a3ff', '#f2a7d0', '#fbc3a4', '#7fe0b0', '#9cc8ff', '#ff8fa3', '#f5dc8c', '#6fd3d0', '#d9c9ff', '#8e8a9c'];

const ORDER = [
  'Transfer',
  'Transport',
  'Metro/Taxi',
  'Dining',
  'Food & Dining',
  'Coffee',
  'Groceries',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'DEWA',
  'Telecom',
  'Health',
  'Education',
  'Travel',
  'Rent',
  'Subscriptions',
  'Charity',
  'Delivery',
  'Salary',
  'Freelance',
  'Investment',
  'Utilities',
  'Insurance',
  'Fitness',
  'Personal Care',
  'Gift',
  'Bonus',
  'Business',
  'Rental Income',
  'Refund',
  'Other',
];

const COLORS_MAP: Record<string, string> = Object.fromEntries(ORDER.map((c, i) => [c, PALETTE[i % PALETTE.length]]));

const FALLBACK = PALETTE;

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
// The first whole emoji: a flag is two regional-indicator letters, and family
// or skin-tone emoji are several code points joined, so matching one code
// point would cut "🇬🇪" down to a lone "🇬".
const WHOLE_EMOJI = /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*|[#*0-9]\uFE0F?\u20E3/u;

export const extractEmoji = (icon: string): string => {
  const match = icon.match(WHOLE_EMOJI);
  return match ? match[0] : icon.charAt(0);
};
