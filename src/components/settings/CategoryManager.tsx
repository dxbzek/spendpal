import { useState } from 'react';
import { useCategories, type Category } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { CATEGORIES } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const EMOJI_SUGGESTIONS = ['☕', '🛒', '🚗', '🍽️', '📱', '🚇', '✈️', '🎬', '🤲', '📦', '💡', '🏠', '🛍️', '🏥', '📚', '🔄', '💰', '💻', '🔁', '📌', '🎮', '🐾', '💊', '🏋️', '🎵', '🍺', '⛽', '🧹', '👶', '💇', '🎁', '🧾', '🏦', '🚌', '🍕', '🎭', '⚽', '🏖️', '💍', '🔧', '📸'];

const CategoryManager = () => {
  const { categories, customCategories, addCategory, updateCategory, removeCategory, overrideDefault } = useCategories();
  const [showAdd, setShowAdd] = useState(false);
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

  return (
    <div className="bg-card rounded-2xl p-5 card-shadow space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Categories</p>
          <p className="text-xs text-muted-foreground">Customize icons or add new categories</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          {showAdd ? 'Cancel' : 'Add'}
        </Button>
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
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                    newIcon === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'bg-background hover:bg-muted'
                  }`}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!newName.trim()} className="w-full h-10 gradient-primary text-primary-foreground">
            <Check size={14} className="mr-1.5" /> Add Category
          </Button>
        </div>
      )}

      {/* Default categories - tap icon to change */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Default Categories</p>
        <div className="grid grid-cols-2 gap-1.5">
          {defaultCategories.map(cat => (
            <div key={cat.name} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/40 group">
              {editDefaultName === cat.name ? (
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
              ) : (
                <>
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-xs truncate flex-1">{cat.name}</span>
                  <button onClick={() => { setEditDefaultName(cat.name); setDefaultNewIcon(cat.icon); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-all">
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom categories */}
      {pureCustom.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Custom Categories</p>
          <div className="space-y-1.5">
            {pureCustom.map(cat => (
              <div key={cat.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/40 group">
                {editingId === cat.id ? (
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm flex-1" />
                    </div>
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
                    <span className="text-lg">{cat.icon}</span>
                    <span className="text-xs truncate flex-1">{cat.name}</span>
                    <button onClick={() => { setEditingId(cat.id!); setEditName(cat.name); setEditIcon(cat.icon); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-all">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteId(cat.id!)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
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
