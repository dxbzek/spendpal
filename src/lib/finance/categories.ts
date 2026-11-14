// One answer to "which category is this?" for the pickers and the budgets.
//
// A transaction's category is free text. Rows arrive from the Add form, from
// statement and screenshot imports, and from outside the app, so the names in
// the data drift from the built-in list (the data says "Food", the form
// offered "Dining"). A row saved under a name no budget has was silently
// counted as unbudgeted. Pure, so it's unit-tested.
import type { Transaction, TransactionType } from '@/types/finance';

/**
 * Built-in names that mean the same as a broader one. Used two ways: a row
 * under the left name counts toward a budget under the right name (when no
 * budget has the left name), and the pickers stop offering the left name once
 * the right one is in use.
 */
export const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  Dining: 'Food',
  Coffee: 'Food',
  Delivery: 'Food',
  Telecom: 'Bills',
  DEWA: 'Bills',
  Utilities: 'Bills',
  'Metro/Taxi': 'Transport',
};

/** The budget a row's spending belongs to: its own category, or the one it's an alias of. */
export function budgetCategoryOf(category: string, budgetNames: ReadonlySet<string>): string {
  if (budgetNames.has(category)) return category;
  const target = CATEGORY_ALIASES[category];
  return target && budgetNames.has(target) ? target : category;
}

export interface PickerCategory {
  name: string;
  icon: string;
  isCustom?: boolean;
}

/** How far back a row still says "this is a category I use". */
export const RECENT_DAYS = 90;
/** One row is a one-off (a car rental on a trip), not a category to offer every day. */
export const MIN_USES = 2;

/**
 * Categories the user's recent rows use for this type, most used first, with
 * the icon most of those rows carry (the newest of them on a tie). One row
 * with its own icon, a concert under Entertainment, doesn't restyle the category. Only rows on or after `since` (YYYY-MM-DD) count,
 * and a name needs MIN_USES of them: all of history would bring back every
 * name an old import ever produced.
 */
export function usedCategories(
  transactions: Pick<Transaction, 'type' | 'category' | 'categoryIcon' | 'date' | 'isInternal'>[],
  type: TransactionType,
  since = '',
): PickerCategory[] {
  const seen = new Map<string, { count: number; icons: Map<string, { n: number; latest: string }> }>();
  for (const t of transactions) {
    if (t.type !== type || t.isInternal || !t.category || t.date < since) continue;
    let e = seen.get(t.category);
    if (!e) seen.set(t.category, e = { count: 0, icons: new Map() });
    e.count++;
    const i = e.icons.get(t.categoryIcon);
    if (!i) e.icons.set(t.categoryIcon, { n: 1, latest: t.date });
    else { i.n++; if (t.date > i.latest) i.latest = t.date; }
  }
  return [...seen.entries()]
    .filter(([, e]) => e.count >= MIN_USES)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([name, e]) => ({
      name,
      icon: [...e.icons.entries()].sort((a, b) => b[1].n - a[1].n || b[1].latest.localeCompare(a[1].latest))[0][0],
    }));
}

/**
 * What a category picker offers: the user's categories first (used ones by
 * how often, then their other custom ones), then the built-in ones they
 * haven't replaced. A built-in alias ("Dining") is left out once its broader
 * name ("Food") is on the list, so one kind of spending has one button.
 */
export function pickerCategories(
  used: PickerCategory[],
  custom: (PickerCategory & { originalName?: string | null })[],
  defaults: readonly PickerCategory[],
): PickerCategory[] {
  const key = (n: string) => n.trim().toLowerCase();
  const out: PickerCategory[] = [];
  const have = new Set<string>();
  const add = (c: PickerCategory) => {
    if (have.has(key(c.name))) return;
    have.add(key(c.name));
    out.push(c);
  };
  const customByName = new Map(custom.map(c => [key(c.name), c]));
  // A custom category's icon is the user's choice; it wins over the icon on a row.
  for (const c of used) add(customByName.get(key(c.name)) ?? c);
  for (const c of custom) add(c);
  const replaced = new Set(custom.map(c => c.originalName).filter((n): n is string => !!n).map(key));
  for (const c of defaults) {
    if (replaced.has(key(c.name))) continue;
    const broader = CATEGORY_ALIASES[c.name];
    if (broader && have.has(key(broader))) continue;
    add({ name: c.name, icon: c.icon, isCustom: false });
  }
  return out;
}
