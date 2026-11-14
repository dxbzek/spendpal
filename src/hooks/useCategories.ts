import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TransactionType } from '@/types/finance';
import { useFinance } from '@/context/FinanceContext';
import { pickerCategories, usedCategories, RECENT_DAYS } from '@/lib/finance/categories';
import { format, subDays } from 'date-fns';

export interface Category {
  name: string;
  icon: string;
  isCustom?: boolean;
  id?: string;
  type?: 'expense' | 'income' | 'both';
  originalName?: string | null;
}

// One copy of the custom categories for the whole app. Every picker used to
// fetch its own on mount, so the same list loaded again on each page.
let cache: { userId: string; rows: Category[] } | null = null;
let inflight: { userId: string; promise: Promise<Category[] | null> } | null = null;
const listeners = new Set<(rows: Category[]) => void>();

async function loadCustom(userId: string, force: boolean): Promise<Category[] | null> {
  if (!force && cache?.userId === userId) return cache.rows;
  if (!force && inflight?.userId === userId) return inflight.promise;
  const promise = (async () => {
    const { data, error } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');
    if (error || !data) {
      logger.error('Failed to fetch custom categories', error);
      return null;
    }
    const rows: Category[] = data.map(r => ({
      name: r.name,
      icon: r.icon,
      isCustom: true,
      id: r.id,
      type: (r.type as 'expense' | 'income' | 'both') ?? 'both',
      originalName: r.original_name ?? null,
    }));
    cache = { userId, rows };
    listeners.forEach(l => l(rows));
    return rows;
  })();
  inflight = { userId, promise };
  try { return await promise; } finally { if (inflight?.promise === promise) inflight = null; }
}

/** Test hook: forget the shared copy. */
export const resetCategoryCache = () => { cache = null; inflight = null; };

export const useCategories = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { transactions, budgets } = useFinance();
  const [customCategories, setCustomCategories] = useState<Category[]>(() => (cache && cache.userId === userId ? cache.rows : []));
  const [loading, setLoading] = useState(!(cache && cache.userId === userId));

  // `force` after a change; otherwise the shared copy is used.
  const fetchCustom = useCallback(async (force = true) => {
    if (!userId) { setLoading(false); return; }
    const rows = await loadCustom(userId, force);
    if (rows) setCustomCategories(rows);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchCustom(false);
    listeners.add(setCustomCategories);
    return () => { listeners.delete(setCustomCategories); };
  }, [fetchCustom]);

  // Names that shadow or replace a default (either same name or via original_name rename)
  const shadowedDefaultNames = new Set([
    ...customCategories.map(c => c.name),
    ...customCategories.map(c => c.originalName).filter(Boolean) as string[],
  ]);

  // Merge: custom categories override defaults with same name (or via original_name rename)
  const allCategories: Category[] = (() => {
    const defaults: Category[] = CATEGORIES
      .filter(c => !shadowedDefaultNames.has(c.name))
      .map(c => ({ name: c.name, icon: c.icon, isCustom: false }));
    return [...customCategories, ...defaults];
  })();

  const addCategory = useCallback(async (name: string, icon: string, type: 'expense' | 'income' | 'both' = 'both') => {
    if (!user) return false;
    const { error } = await supabase.from('custom_categories').insert({
      user_id: user.id,
      name: name.trim(),
      icon,
      type,
      sort_order: customCategories.length,
    });
    if (error) {
      if (error.code === '23505') toast.error('Category already exists');
      else toast.error(error.message);
      return false;
    }
    toast.success('Category added');
    await fetchCustom();
    return true;
  }, [user, customCategories.length, fetchCustom]);

  const updateCategory = useCallback(async (id: string, name: string, icon: string, type?: 'expense' | 'income' | 'both') => {
    const update: { name: string; icon: string; type?: string } = { name: name.trim(), icon };
    if (type) update.type = type;
    const { error } = await supabase.from('custom_categories')
      .update(update)
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Category updated');
    await fetchCustom();
  }, [fetchCustom]);

  const removeCategory = useCallback(async (id: string) => {
    const { error } = await supabase.from('custom_categories').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Category removed');
    await fetchCustom();
  }, [fetchCustom]);

  // Override a default category - supports renaming (newName can differ from originalName)
  const overrideDefault = useCallback(async (originalName: string, newIcon: string, newName?: string) => {
    if (!user) return;
    const finalName = newName?.trim() || originalName;
    const existing = customCategories.find(c => c.originalName === originalName || c.name === originalName);
    if (existing?.id) {
      // Update existing override
      const { error } = await supabase.from('custom_categories')
        .update({ name: finalName, icon: newIcon, original_name: originalName })
        .eq('id', existing.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Category updated');
    } else {
      const { error } = await supabase.from('custom_categories').insert({
        user_id: user.id,
        name: finalName,
        icon: newIcon,
        type: 'both',
        sort_order: customCategories.length,
        original_name: finalName !== originalName ? originalName : null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Category updated');
    }
    await fetchCustom();
  }, [user, customCategories, fetchCustom]);

  // What the pickers offer: the categories this user's rows already use
  // (most used first), then their other custom ones, then the built-in rest.
  const getCategoriesForType = (type: TransactionType): Category[] => {
    const kind = type === 'income' ? 'income' : 'expense';
    const typeDefaults = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const custom = customCategories.filter(c => !c.type || c.type === 'both' || c.type === kind);
    const used = usedCategories(transactions, kind, format(subDays(new Date(), RECENT_DAYS), 'yyyy-MM-dd'));
    if (kind === 'expense') {
      // A category with a budget this month is always offered, used yet or not.
      const month = format(new Date(), 'yyyy-MM');
      const have = new Set(used.map(c => c.name));
      for (const b of budgets) {
        if (b.month === month && !have.has(b.category)) { have.add(b.category); used.push({ name: b.category, icon: b.categoryIcon }); }
      }
    }
    return pickerCategories(used, custom, typeDefaults);
  };

  return {
    categories: allCategories,
    getCategoriesForType,
    customCategories,
    loading,
    addCategory,
    updateCategory,
    removeCategory,
    overrideDefault,
    refresh: fetchCustom,
  };
};
