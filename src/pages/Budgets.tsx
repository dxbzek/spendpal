import { useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Sparkles, Plus, Loader2, Edit2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { differenceInDays, endOfMonth } from 'date-fns';
import { useAI } from '@/hooks/useAI';
import AddBudgetDialog from '@/components/forms/AddBudgetDialog';
import type { Budget } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BudgetSuggestion {
  category: string;
  suggestedAmount: number;
  reasoning: string;
}

const Budgets = () => {
  const { budgets, transactions, removeBudget, bulkRemoveBudgets } = useFinance();
  const { fmt } = useCurrency();
  const { loading: aiLoading, generateBudgetSuggestions } = useAI();
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);

  const now = new Date();
  const daysLeft = differenceInDays(endOfMonth(now), now);
  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const overallPct = totalBudgeted ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  const handleGenerateSuggestions = async () => {
    const spendingData = transactions.filter(t => t.type === 'expense').map(t => ({ category: t.category, amount: t.amount, date: t.date }));
    const result = await generateBudgetSuggestions(spendingData);
    if (result.length > 0) setSuggestions(result);
  };

  return (
    <div>
      <div className="px-5 md:px-8 pt-12 pb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-heading mb-1">Budgets</h1>
          <p className="text-sm text-muted-foreground">{now.toLocaleString('en', { month: 'long', year: 'numeric' })}</p>
        </div>
        {budgets.length > 0 && (
          <button onClick={() => setShowDeleteAll(true)} className="text-xs text-destructive font-medium flex items-center gap-1 hover:underline">
            <Trash2 size={12} /> Delete All
          </button>
        )}
      </div>

      <div className="px-5 md:px-8 space-y-4 pb-6">
        <div className="bg-card rounded-2xl p-4 card-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{overallPct}% spent</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{daysLeft} days left</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>{fmt(totalSpent)}</span><span>{fmt(totalBudgeted)}</span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(overallPct, 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`h-full rounded-full ${overallPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
          </div>
        </div>

        {budgets.length === 0 ? (
          <div className="bg-card rounded-2xl p-8 card-shadow text-center">
            <div className="text-5xl mb-3">📊</div>
            <h3 className="font-heading text-base mb-1">No budgets yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first budget to start tracking your spending limits</p>
            <button onClick={() => { setEditBudget(null); setShowAddBudget(true); }}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2">
              <Plus size={16} /> Create First Budget
            </button>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {budgets.map(b => {
          const pct = b.amount ? Math.round((b.spent / b.amount) * 100) : 0;
          const remaining = b.amount - b.spent;
          const dailyLeft = daysLeft > 0 ? remaining / daysLeft : 0;
          return (
            <div key={b.id} className="bg-card rounded-2xl p-4 card-shadow transition-shadow hover:card-shadow-hover group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-xl shrink-0">{b.categoryIcon}</span>
                  <div>
                    <p className="text-sm font-semibold">{b.category}</p>
                    <p className="text-xs text-muted-foreground capitalize">{b.period} · {daysLeft}d left</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pct >= 100 ? (
                    <Badge variant="destructive" className="text-[10px] px-2 py-0.5">Over Budget</Badge>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pct > 75 ? 'bg-warning/10 text-warning' : 'bg-accent text-accent-foreground'}`}>{pct}%</span>
                  )}
                  <button onClick={() => { setEditBudget(b); setShowAddBudget(true); }} className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1"><Edit2 size={14} /></button>
                  <button onClick={() => setDeleteBudgetId(b.id)} className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={`h-full rounded-full ${pct >= 100 ? 'bg-expense' : pct > 75 ? 'bg-warning' : 'bg-primary'}`} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs text-muted-foreground">Spent</p><p className="text-sm font-medium">{fmt(b.spent)}</p></div>
                <div><p className="text-xs text-muted-foreground">Remaining</p><p className={`text-sm font-medium ${remaining < 0 ? 'text-expense' : ''}`}>{fmt(remaining)}</p></div>
                <div><p className="text-xs text-muted-foreground">Daily left</p><p className="text-sm font-medium">{fmt(dailyLeft)}</p></div>
              </div>
            </div>
          );
        })}
        </div>
        )}

        {/* AI Suggestions */}
        <div className="bg-card rounded-2xl p-4 card-shadow border border-dashed border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-xl gradient-primary flex items-center justify-center shrink-0">
              <Sparkles size={13} className="text-primary-foreground" />
            </div>
            <h2 className="font-heading text-sm">AI Budget Suggestions</h2>
          </div>
          {suggestions.length > 0 ? (
            <div className="space-y-2.5">
              {suggestions.map((s) => (
                <div key={s.category} className="p-3 bg-accent/50 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{s.category}</span>
                    <span className="text-sm font-heading text-primary">{fmt(s.suggestedAmount)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.reasoning}</p>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">Get AI-recommended budget amounts based on your spending</p>
              <button onClick={handleGenerateSuggestions} disabled={aiLoading}
                className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><Sparkles size={14} /> Generate Suggestions</>}
              </button>
            </>
          )}
        </div>

        <button onClick={() => { setEditBudget(null); setShowAddBudget(true); }}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-border text-muted-foreground text-sm font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors">
          <Plus size={18} /> Add Budget
        </button>
      </div>

      <AddBudgetDialog open={showAddBudget} onOpenChange={setShowAddBudget} editBudget={editBudget} />

      <AlertDialog open={!!deleteBudgetId} onOpenChange={(o) => { if (!o) setDeleteBudgetId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Budget?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteBudgetId) removeBudget(deleteBudgetId); setDeleteBudgetId(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Budgets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all {budgets.length} budgets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingAll}
              onClick={async () => {
                setDeletingAll(true);
                await bulkRemoveBudgets(budgets.map(b => b.id));
                setDeletingAll(false);
                setShowDeleteAll(false);
              }}
              className="bg-destructive text-destructive-foreground"
            >
              {deletingAll ? <><Loader2 size={14} className="animate-spin mr-1" /> Deleting…</> : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Budgets;
