import { useState, useMemo } from 'react';
import { PageSpinner } from '@/components/ui/spinner';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Sparkles, Plus, Loader2, Edit2, Trash2, TrendingUp, TrendingDown, History, BookmarkPlus, FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { differenceInDays, endOfMonth, getDaysInMonth, subMonths, format, parseISO, getMonth, getYear } from 'date-fns';
import { useAI } from '@/hooks/useAI';
import { toast } from 'sonner';
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

const TEMPLATE_KEY = 'spendpal_budget_templates';

interface BudgetTemplate {
  name: string;
  savedAt: string;
  items: Array<{ category: string; categoryIcon: string; amount: number; period: string }>;
}

function loadTemplates(): BudgetTemplate[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]'); } catch { return []; }
}

const Budgets = () => {
  const { budgets, transactions, removeBudget, bulkRemoveBudgets, addBudget, loading } = useFinance();
  const { fmt } = useCurrency();
  const { loading: aiLoading, generateBudgetSuggestions } = useAI();
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);
  const [tab, setTab] = useState<'this' | 'last'>('this');
  const [templates, setTemplates] = useState<BudgetTemplate[]>(() => loadTemplates());
  const [showTemplates, setShowTemplates] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const now = useMemo(() => new Date(), []);
  const daysLeft = differenceInDays(endOfMonth(now), now);
  const totalDays = getDaysInMonth(now);
  const daysElapsed = totalDays - daysLeft;

  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const overallPct = totalBudgeted ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  // Projected spend at current daily rate
  const projectedSpend = daysElapsed > 0 ? (totalSpent / daysElapsed) * totalDays : 0;
  const projectedPct = totalBudgeted ? Math.round((projectedSpend / totalBudgeted) * 100) : 0;

  // Last month's spending per category
  const lastMonthData = useMemo(() => {
    const prev = subMonths(now, 1);
    const pm = getMonth(prev);
    const py = getYear(prev);
    const map: Record<string, number> = {};
    transactions
      .filter(t => {
        const d = parseISO(t.date);
        return t.type === 'expense' && getMonth(d) === pm && getYear(d) === py;
      })
      .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }, [transactions, now]);

  const lastMonthLabel = format(subMonths(now, 1), 'MMMM');

  const handleGenerateSuggestions = async () => {
    const spendingData = transactions.filter(t => t.type === 'expense').map(t => ({ category: t.category, amount: t.amount, date: t.date }));
    const result = await generateBudgetSuggestions(spendingData);
    if (result.length > 0) setSuggestions(result);
  };

  const saveTemplate = () => {
    if (budgets.length === 0) return;
    const monthKey = format(now, 'MMMM yyyy');
    const template: BudgetTemplate = {
      name: monthKey,
      savedAt: new Date().toISOString(),
      items: budgets.map(b => ({ category: b.category, categoryIcon: b.categoryIcon, amount: b.amount, period: b.period })),
    };
    const updated = [template, ...templates.filter(t => t.name !== monthKey)].slice(0, 5);
    setTemplates(updated);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(updated));
    toast.success(`Template saved: ${monthKey}`);
  };

  const applyTemplate = async (template: BudgetTemplate) => {
    setApplyingTemplate(true);
    const monthKey = format(now, 'yyyy-MM');
    try {
      for (const item of template.items) {
        const exists = budgets.find(b => b.category === item.category && b.month === monthKey);
        if (!exists) {
          await addBudget({ category: item.category, categoryIcon: item.categoryIcon, amount: item.amount, period: item.period as 'monthly' | 'weekly', month: monthKey });
        }
      }
      toast.success(`Applied ${template.items.length} budgets from template`);
    } catch {
      toast.error('Failed to apply template');
    } finally {
      setApplyingTemplate(false);
      setShowTemplates(false);
    }
  };

  const velocityColor = (pct: number) => {
    if (pct >= 100) return 'text-expense';
    if (pct >= 80) return 'text-warning';
    return 'text-income';
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      <div className="px-5 md:px-8 pt-12 pb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-heading mb-1">Budgets</h1>
          <p className="text-sm text-muted-foreground">{now.toLocaleString('en', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2">
          {budgets.length > 0 && (
            <button onClick={saveTemplate} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
              <BookmarkPlus size={12} /> Save Template
            </button>
          )}
          {templates.length > 0 && (
            <button onClick={() => setShowTemplates(!showTemplates)} className="text-xs text-muted-foreground font-medium flex items-center gap-1 hover:underline">
              <FolderOpen size={12} /> Templates
            </button>
          )}
          {budgets.length > 0 && (
            <button onClick={() => setShowDeleteAll(true)} className="text-xs text-destructive font-medium flex items-center gap-1 hover:underline">
              <Trash2 size={12} /> Delete All
            </button>
          )}
        </div>
      </div>

      {/* Template picker */}
      {showTemplates && (
        <div className="mx-5 md:mx-8 mb-2 bg-card rounded-2xl border border-border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Load a Template</p>
          {templates.map(t => (
            <div key={t.name} className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.items.length} budgets</p>
              </div>
              <button
                onClick={() => applyTemplate(t)}
                disabled={applyingTemplate}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
              >
                {applyingTemplate ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 md:px-8 space-y-4 pb-6">
        {/* Overall progress card */}
        <div className="bg-card rounded-2xl p-4 card-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{overallPct}% spent</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{daysLeft} days left</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>{fmt(totalSpent)}</span><span>{fmt(totalBudgeted)}</span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden mb-2">
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(overallPct, 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`h-full rounded-full ${overallPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
          </div>
          {/* Velocity row */}
          {daysElapsed > 0 && totalBudgeted > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground flex items-center gap-1">
                {projectedPct > 100 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                Projected month-end
              </span>
              <span className={`font-semibold ${velocityColor(projectedPct)}`}>
                {fmt(projectedSpend)} ({projectedPct}%)
              </span>
            </div>
          )}
        </div>

        {/* Tab: This Month / Last Month */}
        {budgets.length > 0 && (
          <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
            <button onClick={() => setTab('this')}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === 'this' ? 'bg-card text-foreground card-shadow' : 'text-muted-foreground'}`}>
              This Month
            </button>
            <button onClick={() => setTab('last')}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${tab === 'last' ? 'bg-card text-foreground card-shadow' : 'text-muted-foreground'}`}>
              <History size={11} /> {lastMonthLabel}
            </button>
          </div>
        )}

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
        ) : tab === 'this' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgets.map(b => {
              const pct = b.amount ? Math.round((b.spent / b.amount) * 100) : 0;
              const remaining = b.amount - b.spent;
              const dailyLeft = daysLeft > 0 ? remaining / daysLeft : 0;
              // Velocity for this budget
              const dailyRate = daysElapsed > 0 ? b.spent / daysElapsed : 0;
              const projected = dailyRate * totalDays;
              const projPct = b.amount ? Math.round((projected / b.amount) * 100) : 0;
              const lastMonthAmt = lastMonthData[b.category];
              return (
                <div key={b.id} className="bg-card rounded-2xl p-4 card-shadow transition-shadow hover:card-shadow-hover group">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">{b.categoryIcon}</span>
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
                      <button onClick={() => { setEditBudget(b); setShowAddBudget(true); }} aria-label="Edit budget" className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-2"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteBudgetId(b.id)} aria-label="Delete budget" className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-2"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${pct >= 100 ? 'bg-expense' : pct > 75 ? 'bg-warning' : 'bg-primary'}`} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-2">
                    <div><p className="text-xs text-muted-foreground">Spent</p><p className="text-sm font-medium">{fmt(b.spent)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Remaining</p><p className={`text-sm font-medium ${remaining < 0 ? 'text-expense' : ''}`}>{fmt(remaining)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Daily left</p><p className="text-sm font-medium">{fmt(dailyLeft)}</p></div>
                  </div>
                  {/* Velocity + last month */}
                  {daysElapsed > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-border text-[11px]">
                      <span className={`flex items-center gap-1 ${velocityColor(projPct)}`}>
                        {projPct > 100 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        On pace: {fmt(projected)}
                      </span>
                      {lastMonthAmt !== undefined && (
                        <span className="text-muted-foreground">Last mo: {fmt(lastMonthAmt)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Last Month view */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgets.map(b => {
              const lastSpent = lastMonthData[b.category] ?? 0;
              const pct = b.amount ? Math.round((lastSpent / b.amount) * 100) : 0;
              const diff = lastSpent - b.spent;
              return (
                <div key={b.id} className="bg-card rounded-2xl p-4 card-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl shrink-0">{b.categoryIcon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{b.category}</p>
                      <p className="text-xs text-muted-foreground">{lastMonthLabel} · budget {fmt(b.amount)}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pct >= 100 ? 'bg-destructive/10 text-expense' : pct > 75 ? 'bg-warning/10 text-warning' : 'bg-accent text-accent-foreground'}`}>{pct}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                    <div style={{ width: `${Math.min(pct, 100)}%` }} className={`h-full rounded-full ${pct >= 100 ? 'bg-expense' : pct > 75 ? 'bg-warning' : 'bg-primary'}`} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Spent: <span className="text-foreground font-medium">{fmt(lastSpent)}</span></span>
                    {b.spent > 0 && (
                      <span className={diff > 0 ? 'text-expense' : 'text-income'}>
                        {diff > 0 ? '+' : ''}{fmt(diff)} vs now
                      </span>
                    )}
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
