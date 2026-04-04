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
  originalName?: string | null;
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
        originalName: r.original_name ?? null,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCustom(); }, [fetchCustom]);

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

  // Override a default category — supports renaming (newName can differ from originalName)
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

  const getCategoriesForType = (type: TransactionType): Category[] => {
    const typeDefaults = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    // Names shadowed by custom overrides (same name or renamed)
    const shadowed = new Set([
      ...customCategories.map(c => c.name),
      ...customCategories.map(c => c.originalName).filter(Boolean) as string[],
    ]);
    // Include custom categories that match the type (or are set to 'both')
    const filteredCustom = customCategories.filter(c => !c.type || c.type === 'both' || c.type === type);
    const defaults: Category[] = (typeDefaults as readonly { name: string; icon: string }[])
      .filter(c => !shadowed.has(c.name))
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
