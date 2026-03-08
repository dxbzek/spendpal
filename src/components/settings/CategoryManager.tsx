import { useState } from 'react';
import { useCategories, type Category } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { CATEGORIES } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const EMOJI_SUGGESTIONS = ['☕', '🛒', '🚗', '🍽️', '📱', '🚇', '✈️', '🎬', '🤲', '📦', '💡', '🏠', '🛍️', '🏥', '📚', '🔄', '💰', '💻', '🔁', '📌', '🎮', '🐾', '💊', '🏋️', '🎵', '🍺', '⛽', '🧹', '👶', '💇', '🎁', '🧾', '🏦', '🚌', '🍕', '🎭', '⚽', '🏖️', '💍', '🔧', '📸'];

const PREVIEW_COUNT = 6;

const CategoryManager = () => {
  const { categories, customCategories, addCategory, updateCategory, removeCategory, overrideDefault } = useCategories();
  const [showAdd, setShowAdd] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📌');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editDefaultName, setEditDefaultName] = useState<string | null>(null);
  const [defaultNewIcon, setDefaultNewIcon] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addCategory(newName, newIcon);
    setNewName('');
    setNewIcon('📌');
    setShowAdd(false);
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    await updateCategory(editingId, editName, editIcon);
    setEditingId(null);
  };

  const handleOverrideDefault = async () => {
    if (!editDefaultName) return;
    await overrideDefault(editDefaultName, defaultNewIcon);
    setEditDefaultName(null);
  };

  const defaultCategories = CATEGORIES.map(c => {
    const custom = customCategories.find(cc => cc.name === c.name);
    return { name: c.name, icon: custom ? custom.icon : c.icon, isOverridden: !!custom, customId: custom?.id };
  });

  const pureCustom = customCategories.filter(c => !CATEGORIES.some(d => d.name === c.name));
  const allItems = [...pureCustom.map(c => ({ ...c, type: 'custom' as const })), ...defaultCategories.map(c => ({ ...c, type: 'default' as const }))];
  const visibleItems = showAll ? allItems : allItems.slice(0, PREVIEW_COUNT);

  return (
    <div className="bg-card rounded-2xl p-5 card-shadow space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Categories</p>
          <p className="text-xs text-muted-foreground">Customize icons or add new</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
          {showAdd ? <X size={12} /> : <Plus size={12} />}
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* Add new category */}
      {showAdd && (
        <div className="bg-muted/50 rounded-xl p-3 space-y-3">
          <Input placeholder="Category name" value={newName} onChange={e => setNewName(e.target.value)} className="h-10" />
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Pick an icon</p>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_SUGGESTIONS.map(emoji => (
                <button key={emoji} onClick={() => setNewIcon(emoji)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all ${
                    newIcon === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'bg-background hover:bg-muted'
                  }`}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!newName.trim()} size="sm" className="w-full h-9 gradient-primary text-primary-foreground">
            <Check size={12} className="mr-1" /> Add Category
          </Button>
        </div>
      )}

      {/* Preview / All categories */}
      <div className="space-y-1.5">
        {visibleItems.map(item => (
          <div key={item.name} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/40 group">
            {(item.type === 'default' && editDefaultName === item.name) ? (
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {EMOJI_SUGGESTIONS.slice(0, 20).map(emoji => (
                    <button key={emoji} onClick={() => setDefaultNewIcon(emoji)}
                      className={`w-7 h-7 rounded flex items-center justify-center text-sm ${
                        defaultNewIcon === emoji ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                      }`}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditDefaultName(null)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleOverrideDefault}>Save</Button>
                </div>
              </div>
            ) : (item.type === 'custom' && editingId === (item as any).id) ? (
              <div className="flex-1 space-y-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm" />
                <div className="flex flex-wrap gap-1">
                  {EMOJI_SUGGESTIONS.slice(0, 20).map(emoji => (
                    <button key={emoji} onClick={() => setEditIcon(emoji)}
                      className={`w-7 h-7 rounded flex items-center justify-center text-sm ${
                        editIcon === emoji ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                      }`}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleUpdate}>Save</Button>
                </div>
              </div>
            ) : (
              <>
                <span className="text-lg">{item.icon}</span>
                <span className="text-xs truncate flex-1">{item.name}</span>
                <button onClick={() => {
                  if (item.type === 'custom') {
                    setEditingId((item as any).id!);
                    setEditName(item.name);
                    setEditIcon(item.icon);
                  } else {
                    setEditDefaultName(item.name);
                    setDefaultNewIcon(item.icon);
                  }
                }}
                  className="opacity-0 group-hover:opacity-100 active:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-all">
                  <Pencil size={12} />
                </button>
                {item.type === 'custom' && (
                  <button onClick={() => setDeleteId((item as any).id!)}
                    className="opacity-0 group-hover:opacity-100 active:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all">
                    <Trash2 size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {allItems.length > PREVIEW_COUNT && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
          {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showAll ? 'Show less' : `Show all ${allItems.length} categories`}
        </button>
      )}

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
    </div>
  );
};

export default CategoryManager;
