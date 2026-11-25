import { useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { useFinance } from '@/context/FinanceContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Check, ChevronDown, ChevronUp, Combine } from 'lucide-react';
import { SectionLabel, SectionAction } from '@/components/orbix';
import { CATEGORIES } from '@/types/finance';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AppIcon, { IconTile } from '@/components/AppIcon';
import { PICKER_ICONS } from '@/lib/appIcons';

const EMOJI_SUGGESTIONS = PICKER_ICONS;

const PREVIEW_COUNT = 6;

type CategoryType = 'expense' | 'income' | 'both';

const TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'both', label: 'Both' },
  { value: 'income', label: 'Income' },
];

const TYPE_BADGE: Record<CategoryType, string> = {
  expense: '💸',
  income: '💰',
  both: '',
};

const TypeToggle = ({ value, onChange }: { value: CategoryType; onChange: (v: CategoryType) => void }) => (
  <div className="flex gap-1 p-1 bg-muted rounded-full">
    {TYPE_OPTIONS.map(opt => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`flex-1 h-8 rounded-full text-xs font-medium transition-colors ${
          value === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const CategoryManager = () => {
  const { categories, customCategories, addCategory, updateCategory, removeCategory, overrideDefault } = useCategories();
  const { transactions, budgets, bulkUpdateCategory, updateBudget, removeBudget } = useFinance();
  const [showAdd, setShowAdd] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📌');
  const [newType, setNewType] = useState<CategoryType>('both');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editType, setEditType] = useState<CategoryType>('both');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editDefaultName, setEditDefaultName] = useState<string | null>(null);
  const [defaultNewIcon, setDefaultNewIcon] = useState('');
  const [defaultNewName, setDefaultNewName] = useState('');
  const [mergingName, setMergingName] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [merging, setMerging] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    // Keep the form open (and the typed name) if the add failed.
    if (!await addCategory(newName, newIcon, newType)) return;
    setNewName('');
    setNewIcon('📌');
    setNewType('both');
    setShowAdd(false);
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    await updateCategory(editingId, editName, editIcon, editType);
    setEditingId(null);
  };

  const handleOverrideDefault = async () => {
    if (!editDefaultName) return;
    await overrideDefault(editDefaultName, defaultNewIcon, defaultNewName || editDefaultName);
    setEditDefaultName(null);
    setDefaultNewName('');
  };

  // Merging folds a duplicate/synonym category (e.g. a custom "Restaurants"
  // that should've just been "Dining") into an existing one: every
  // transaction and budget using the old category name is repointed to the
  // target, then the now-empty custom category is removed. Without this,
  // analytics stay permanently split across synonyms — renaming a category
  // only changes the picker label going forward, it doesn't touch history.
  const handleMerge = async (sourceName: string) => {
    if (!mergeTarget || mergeTarget === sourceName) return;
    const target = categories.find(c => c.name === mergeTarget);
    if (!target) return;
    setMerging(true);
    try {
      const ids = transactions.filter(t => t.category === sourceName).map(t => t.id);
      const matchingBudgets = budgets.filter(b => b.category === sourceName);
      const results = await Promise.all([
        ids.length > 0 ? bulkUpdateCategory(ids, target.name, target.icon) : Promise.resolve(true),
        ...matchingBudgets.map(b => {
          // If the target category already has a budget for the same
          // period, reassigning would create a second budget row for the
          // same (category, month) — drop the source budget instead so the
          // target's existing one stays the single source of truth.
          const conflict = budgets.some(other =>
            other.id !== b.id && other.category === target.name && other.month === b.month && other.period === b.period
          );
          return conflict
            ? removeBudget(b.id)
            : updateBudget({ ...b, category: target.name, categoryIcon: target.icon });
        }),
      ]);
      // Don't delete the source category while anything still points at it.
      if (results.some(ok => !ok)) {
        toast.error(`Couldn't move everything from "${sourceName}". Nothing was deleted; try the merge again.`);
        return;
      }
      const custom = customCategories.find(c => c.name === sourceName);
      if (custom?.id) await removeCategory(custom.id);
      toast.success(`Merged "${sourceName}" into "${target.name}"`);
    } finally {
      setMerging(false);
      setMergingName(null);
      setMergeTarget('');
    }
  };

  const defaultCategories = CATEGORIES.map(c => {
    // Find override by original name (renamed) or by same name (icon-only override)
    const custom = customCategories.find(cc => cc.originalName === c.name || (cc.name === c.name && !cc.originalName));
    return {
      originalName: c.name,
      name: custom ? custom.name : c.name,
      icon: custom ? custom.icon : c.icon,
      isOverridden: !!custom,
      customId: custom?.id,
    };
  });

  // Pure custom = not overriding any default (no original_name and name not matching a default)
  const pureCustom = customCategories.filter(c =>
    !c.originalName && !CATEGORIES.some(d => d.name === c.name)
  );
  const allItems = [...pureCustom.map(c => ({ ...c, type: 'custom' as const })), ...defaultCategories.map(c => ({ ...c, type: 'default' as const }))];
  const visibleItems = showAll ? allItems : allItems.slice(0, PREVIEW_COUNT);

  return (
    <>
      <SectionLabel label="Categories" count={allItems.length}
        action={<SectionAction onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : 'Add'}</SectionAction>} />

      <div className="bg-card rounded-3xl px-4 divide-y divide-border">
      {/* Add new category */}
      {showAdd && (
        <div className="py-4 space-y-3">
          <Input placeholder="Category name" value={newName} onChange={e => setNewName(e.target.value)} className="h-11 rounded-full bg-muted border-0 px-4" />
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Type</p>
            <TypeToggle value={newType} onChange={setNewType} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Pick an icon</p>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_SUGGESTIONS.map(emoji => (
                <button key={emoji} onClick={() => setNewIcon(emoji)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors ${
                    newIcon === emoji ? 'bg-primary text-primary-foreground' : 'bg-muted hover:text-primary'
                  }`}>
                  <AppIcon value={emoji} />
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!newName.trim()} size="sm" className="w-full h-11 rounded-full bg-primary text-primary-foreground">
            <Check size={12} className="mr-1" /> Add Category
          </Button>
        </div>
      )}

      {/* Preview / All categories */}
        {visibleItems.map(item => (
          <div key={(item as { originalName?: string }).originalName ?? item.name} className="flex items-center gap-3 py-2.5 group">
            {(item.type === 'default' && editDefaultName === (item as { originalName?: string }).originalName) ? (
              <div className="flex-1 space-y-2">
                <Input
                  value={defaultNewName}
                  onChange={e => setDefaultNewName(e.target.value)}
                  placeholder={editDefaultName ?? ''}
                  className="h-10 text-sm rounded-full bg-muted border-0 px-4"
                />
                <div className="flex flex-wrap gap-1">
                  {EMOJI_SUGGESTIONS.slice(0, 20).map(emoji => (
                    <button key={emoji} onClick={() => setDefaultNewIcon(emoji)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                        defaultNewIcon === emoji ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                      <AppIcon value={emoji} />
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-8 text-xs rounded-full" onClick={() => { setEditDefaultName(null); setDefaultNewName(''); }}>Cancel</Button>
                  <Button size="sm" className="h-8 px-4 text-xs rounded-full" onClick={handleOverrideDefault}>Save</Button>
                </div>
              </div>
            ) : (item.type === 'custom' && editingId === item.id) ? (
              <div className="flex-1 space-y-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-10 text-sm rounded-full bg-muted border-0 px-4" />
                <TypeToggle value={editType} onChange={setEditType} />
                <div className="flex flex-wrap gap-1">
                  {EMOJI_SUGGESTIONS.slice(0, 20).map(emoji => (
                    <button key={emoji} onClick={() => setEditIcon(emoji)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                        editIcon === emoji ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                      <AppIcon value={emoji} />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-8 text-xs rounded-full" onClick={() => setEditingId(null)}>Cancel</Button>
                  <Button size="sm" className="h-8 px-4 text-xs rounded-full" onClick={handleUpdate}>Save</Button>
                  <span className="flex-1" />
                  <button onClick={() => { setEditingId(null); setMergingName(item.name); setMergeTarget(''); }}
                    title="Merge into another category"
                    className="h-8 px-3 rounded-full inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Combine size={12} /> Merge
                  </button>
                  <button onClick={() => setDeleteId(item.id!)}
                    className="h-8 px-3 rounded-full inline-flex items-center gap-1 text-xs text-destructive">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ) : (item.type === 'custom' && mergingName === item.name) ? (
              <div className="flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">Merge "{item.name}" into another category. Its transactions and budgets move over.</p>
                <Select value={mergeTarget} onValueChange={setMergeTarget}>
                  <SelectTrigger className="h-10 text-sm rounded-full bg-muted border-0 px-4"><SelectValue placeholder="Choose target category" /></SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c.name !== item.name).map(c => (
                      <SelectItem key={c.name} value={c.name}><AppIcon value={c.icon} /> {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-8 text-xs rounded-full" onClick={() => { setMergingName(null); setMergeTarget(''); }}>Cancel</Button>
                  <Button size="sm" className="h-8 px-4 text-xs rounded-full" disabled={!mergeTarget || merging} onClick={() => handleMerge(item.name)}>
                    {merging ? 'Merging…' : 'Merge'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <IconTile value={item.icon} />
                <span className="text-[15px] font-medium truncate flex-1">{item.name}</span>
                {item.type === 'custom' && (() => {
                  const cat = customCategories.find(c => c.id === (item as { id?: string }).id);
                  const badge = cat?.type && cat.type !== 'both' ? TYPE_BADGE[cat.type] : null;
                  return badge ? <span className="text-xs shrink-0">{badge}</span> : null;
                })()}
                <button onClick={() => {
                  if (item.type === 'custom') {
                    setEditingId(item.id!);
                    setEditName(item.name);
                    setEditIcon(item.icon);
                    const cat = customCategories.find(c => c.id === item.id);
                    setEditType(cat?.type ?? 'both');
                  } else {
                    const origName = (item as { originalName?: string }).originalName ?? item.name;
                    setEditDefaultName(origName);
                    setDefaultNewIcon(item.icon);
                    setDefaultNewName(item.name);
                  }
                }}
                  aria-label={`Edit ${item.name}`}
                  className="md:opacity-0 md:group-hover:opacity-100 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
                  <Pencil size={14} />
                </button>
              </>
            )}
          </div>
        ))}

      {allItems.length > PREVIEW_COUNT && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium text-primary transition-colors">
          {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showAll ? 'Show less' : `Show all ${allItems.length} categories`}
        </button>
      )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>This won't affect existing transactions using this category.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) removeCategory(deleteId); setDeleteId(null); }}
              className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CategoryManager;
