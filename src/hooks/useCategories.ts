import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TransactionType } from '@/types/finance';

export interface Category {
  name: string;
  icon: string;
  isCustom?: boolean;
  id?: string;
  type?: 'expense' | 'income' | 'both';
}

export const useCategories = () => {
  const { user } = useAuth();
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustom = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order');
    if (error) {
      logger.error('Failed to fetch custom categories', error);
    } else if (data) {
      setCustomCategories(data.map(r => ({
        name: r.name,
        icon: r.icon,
        isCustom: true,
        id: r.id,
        type: (r.type as 'expense' | 'income' | 'both') ?? 'both',
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCustom(); }, [fetchCustom]);

  // Merge: custom categories override defaults with same name
  const allCategories: Category[] = (() => {
    const customNames = new Set(customCategories.map(c => c.name));
    const defaults: Category[] = CATEGORIES
      .filter(c => !customNames.has(c.name))
      .map(c => ({ name: c.name, icon: c.icon, isCustom: false }));
    return [...customCategories, ...defaults];
  })();

  const addCategory = useCallback(async (name: string, icon: string, type: 'expense' | 'income' | 'both' = 'both') => {
    if (!user) return;
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
      return;
    }
    toast.success('Category added');
    await fetchCustom();
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

  // Override a default category (create custom with same name, different icon)
  const overrideDefault = useCallback(async (name: string, newIcon: string) => {
    if (!user) return;
    const { error } = await supabase.from('custom_categories').insert({
      user_id: user.id,
      name,
      icon: newIcon,
      type: 'both',
      sort_order: customCategories.length,
    });
    if (error) {
      if (error.code === '23505') {
        // Already overridden, update instead
        const existing = customCategories.find(c => c.name === name);
        if (existing?.id) {
          await updateCategory(existing.id, name, newIcon);
          return;
        }
      }
      toast.error(error.message);
      return;
    }
    toast.success('Category icon updated');
    await fetchCustom();
  }, [user, customCategories, fetchCustom, updateCategory]);

  const getCategoriesForType = (type: TransactionType): Category[] => {
    const typeDefaults = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const customNames = new Set(customCategories.map(c => c.name));
    // Include custom categories that match the type (or are set to 'both')
    const filteredCustom = customCategories.filter(c => !c.type || c.type === 'both' || c.type === type);
    const defaults: Category[] = (typeDefaults as readonly { name: string; icon: string }[])
      .filter(c => !customNames.has(c.name))
      .map(c => ({ name: c.name, icon: c.icon, isCustom: false }));
    return [...filteredCustom, ...defaults];
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
