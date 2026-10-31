// Category colours for charts and bars: muted hues around the brand green,
// distinct enough to tell apart and readable on light and dark surfaces.
const PALETTE = ['#17663a', '#2f6f8f', '#b3832d', '#8a5a44', '#5e6b8c', '#9a4d5c', '#6b7d3a', '#3f8f6b', '#7a6a9a', '#8c8a80'];

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
