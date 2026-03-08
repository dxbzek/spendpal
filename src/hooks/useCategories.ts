import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { CATEGORIES } from '@/types/finance';

export interface Category {
  name: string;
  icon: string;
  isCustom?: boolean;
  id?: string;
}

export const useCategories = () => {
  const { user } = useAuth();
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustom = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('custom_categories' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order');
    if (error) {
      console.error('Failed to fetch custom categories', error);
    } else if (data) {
      setCustomCategories((data as any[]).map(r => ({
        name: r.name,
        icon: r.icon,
        isCustom: true,
        id: r.id,
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

  const addCategory = useCallback(async (name: string, icon: string) => {
    if (!user) return;
    const { error } = await supabase.from('custom_categories' as any).insert({
      user_id: user.id,
      name: name.trim(),
      icon,
      sort_order: customCategories.length,
    } as any);
    if (error) {
      if (error.code === '23505') toast.error('Category already exists');
      else toast.error(error.message);
      return;
    }
    toast.success('Category added');
    await fetchCustom();
  }, [user, customCategories.length, fetchCustom]);

  const updateCategory = useCallback(async (id: string, name: string, icon: string) => {
    const { error } = await supabase.from('custom_categories' as any)
      .update({ name: name.trim(), icon } as any)
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Category updated');
    await fetchCustom();
  }, [fetchCustom]);

  const removeCategory = useCallback(async (id: string) => {
    const { error } = await supabase.from('custom_categories' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Category removed');
    await fetchCustom();
  }, [fetchCustom]);

  // Override a default category (create custom with same name, different icon)
  const overrideDefault = useCallback(async (name: string, newIcon: string) => {
    if (!user) return;
    const { error } = await supabase.from('custom_categories' as any).insert({
      user_id: user.id,
      name,
      icon: newIcon,
      sort_order: customCategories.length,
    } as any);
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

  return {
    categories: allCategories,
    customCategories,
    loading,
    addCategory,
    updateCategory,
    removeCategory,
    overrideDefault,
    refresh: fetchCustom,
  };
};
