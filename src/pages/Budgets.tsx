import { useState, useMemo } from 'react';
import { isCountableExpense } from '@/lib/finance/transactionFilters';
import { PageSpinner } from '@/components/ui/spinner';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';
import { Lightbulb, Plus, Loader2, Edit2, Trash2, TrendingUp, History, BookmarkPlus, FolderOpen, Copy, RotateCcw, ScanLine, MoreHorizontal, X, ChartPie } from 'lucide-react';
import ScanScreenshotSheet from '@/components/forms/ScanScreenshotSheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { m } from 'framer-motion';
import { differenceInDays, endOfMonth, getDaysInMonth, subMonths, format, parseISO } from 'date-fns';
import { useAI } from '@/hooks/useAI';
import { toast } from 'sonner';
import AddBudgetDialog from '@/components/forms/AddBudgetDialog';
import type { Budget } from '@/types/finance';
import { budgetPace } from '@/lib/finance/pace';
import { budgetCategoryOf } from '@/lib/finance/categories';
import { asMonthly, budgetPercent, includedCategories, isBudgetAmount, rolloverAmount, spentByBudgetCategory } from '@/lib/finance/budgetSpend';
import { oneOffLimit } from '@/lib/finance/spendingForecast';
import { budgetsForMonth } from '@/utils/budgets';
import { useToday } from '@/hooks/useToday';
import { useOpenAddFromRoute } from '@/hooks/useOpenAddFromRoute';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IconTile } from '@/components/AppIcon';

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
  const { budgets, transactions, removeBudget, bulkRemoveBudgets, addBudget, updateBudget, loading } = useFinance();
  const { fmt } = useCurrency();
  const { loading: aiLoading, generateBudgetSuggestions } = useAI();
  const { hidden, mask } = useBalanceMask();
  // Opened from the Home checklist: start with the Add dialog open.
  const openAdd = useOpenAddFromRoute();
  const [showAddBudget, setShowAddBudget] = useState(openAdd);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const { scheduleDelete: scheduleBudgetDelete, isPending: isBudgetPending } = useUndoableDelete({ deleteOne: removeBudget });
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);
  const [tab, setTab] = useState<'this' | 'last'>('this');
  const [templates, setTemplates] = useState<BudgetTemplate[]>(() => loadTemplates());
  const [showTemplates, setShowTemplates] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showAI, setShowAI] = useState(false);

  // Follows the date while the page stays open, so the month and the days
  // left are right after midnight.
  const today = useToday();
  const now = useMemo(() => parseISO(today), [today]);
  const daysLeft = differenceInDays(endOfMonth(now), now);
  const totalDays = getDaysInMonth(now);
  const daysElapsed = totalDays - daysLeft;

  const currentMonthKey = format(now, 'yyyy-MM');
  // "This Month" is this month's budgets only. Carrying last month's forward
  // here made deleted budgets look like they came back (and their Delete
  // button removed last month's history). Copy/Rollover bring them over.
  // Budgets waiting out their Undo window disappear straight away.
  const thisMonthBudgets = useMemo(
    () => budgetsForMonth(budgets, currentMonthKey).filter(b => !isBudgetPending(b.id)),
    [budgets, currentMonthKey, isBudgetPending],
  );

  const totalBudgeted = thisMonthBudgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = thisMonthBudgets.reduce((s, b) => s + b.spent, 0);
  const overallPct = budgetPercent(totalSpent, totalBudgeted);

  // What counts as a one-off for this user, from their own purchases.
  const oneOffOver = useMemo(() => oneOffLimit(transactions, today), [transactions, today]);

  // Where each budget ends the month: everyday spending projected forward,
  // bills and one-offs counted once. Not capped at the budget.
  const paces = useMemo(() => {
    const names = new Set(thisMonthBudgets.map(b => b.category));
    const byCategory: Record<string, typeof transactions> = {};
    for (const t of transactions) {
      if (!isCountableExpense(t) || !t.date.startsWith(currentMonthKey) || t.date > today) continue;
      (byCategory[budgetCategoryOf(t.category, names)] ??= []).push(t);
    }
    return Object.fromEntries(thisMonthBudgets.map(b =>
      [b.id, budgetPace(b, byCategory[b.category] ?? [], daysElapsed, totalDays, oneOffOver)]));
  }, [transactions, thisMonthBudgets, currentMonthKey, daysElapsed, totalDays, today, oneOffOver]);
  const projectedSpend = thisMonthBudgets.reduce((s, b) => s + (paces[b.id]?.projected ?? b.spent), 0);
  const projectedPct = budgetPercent(projectedSpend, totalBudgeted);

  const lastMonthLabel = format(subMonths(now, 1), 'MMMM');
  const lastMonthKey = format(subMonths(now, 1), 'yyyy-MM');

  const lastMonthBudgets = useMemo(
    () => budgetsForMonth(budgets, lastMonthKey).filter(b => !isBudgetPending(b.id)),
    [budgets, lastMonthKey, isBudgetPending]
  );

  // Last month's spending, grouped the way last month's budgets were named.
  // This is what the Last Month tab shows and what Rollover measures against.
  const lastMonthSpent = useMemo(
    () => spentByBudgetCategory(transactions, lastMonthKey, new Set(lastMonthBudgets.map(b => b.category))),
    [transactions, lastMonthKey, lastMonthBudgets],
  );
  // The same month grouped by this month's budget names, for "Last mo" on each card.
  const lastMonthData = useMemo(
    () => spentByBudgetCategory(transactions, lastMonthKey, new Set(thisMonthBudgets.map(b => b.category))),
    [transactions, lastMonthKey, thisMonthBudgets],
  );

  // Other category names whose rows a card's figure counts (a Dining row in
  // a Food budget). Same rows as the spent figures: this month up to today,
  // last month whole. The names are every budget of the month, as the spent
  // figures use, including one waiting out its Undo window.
  const thisMonthIncludes = useMemo(
    () => includedCategories(transactions, currentMonthKey, new Set(budgetsForMonth(budgets, currentMonthKey).map(b => b.category)), today),
    [transactions, currentMonthKey, budgets, today],
  );
  const lastMonthIncludes = useMemo(
    () => includedCategories(transactions, lastMonthKey, new Set(lastMonthBudgets.map(b => b.category))),
    [transactions, lastMonthKey, lastMonthBudgets],
  );

  const hasCopiedLastMonth = useMemo(
    () => lastMonthBudgets.every(b => budgets.some(cb => cb.month === currentMonthKey && cb.category === b.category)),
    [budgets, lastMonthBudgets, currentMonthKey]
  );

  const [copyingLastMonth, setCopyingLastMonth] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);

  const copyFromLastMonth = async () => {
    if (lastMonthBudgets.length === 0) return;
    setCopyingLastMonth(true);
    try {
      let copied = 0;
      for (const b of lastMonthBudgets) {
        const exists = budgets.some(cb => cb.month === currentMonthKey && cb.category === b.category);
        if (!exists) {
          if (await addBudget({ category: b.category, categoryIcon: b.categoryIcon, amount: b.amount, period: b.period, month: currentMonthKey, isFixed: b.isFixed })) copied++;
        }
      }
      if (copied > 0) toast.success(`Copied ${copied} budget${copied > 1 ? 's' : ''} from ${lastMonthLabel}`);
      else if (hasCopiedLastMonth) toast.info('All budgets already exist for this month');
    } catch {
      toast.error('Failed to copy budgets');
    } finally {
      setCopyingLastMonth(false);
    }
  };

  const copyWithRollover = async () => {
    if (lastMonthBudgets.length === 0) return;
    setRollingOver(true);
    try {
      let rolled = 0;
      for (const b of lastMonthBudgets) {
        const exists = budgets.some(cb => cb.month === currentMonthKey && cb.category === b.category);
        if (!exists) {
          // Unspent against last month's spending. b.spent is this month's.
          const newAmount = rolloverAmount(b.amount, lastMonthSpent[b.category] ?? 0);
          if (await addBudget({ category: b.category, categoryIcon: b.categoryIcon, amount: newAmount, period: b.period, month: currentMonthKey, isFixed: b.isFixed })) rolled++;
        }
      }
      if (rolled > 0) toast.success(`Rolled over ${rolled} budget${rolled > 1 ? 's' : ''} with unspent amounts added`);
      else if (hasCopiedLastMonth) toast.info('All budgets already exist for this month');
    } catch {
      toast.error('Failed to roll over budgets');
    } finally {
      setRollingOver(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    const spendingData = transactions.filter(t => isCountableExpense(t)).map(t => ({ category: t.category, amount: t.amount, date: t.date }));
    if (spendingData.length === 0) { toast.info('Log some expenses first so there is spending to base suggestions on.'); return; }
    const result = await generateBudgetSuggestions(spendingData);
    if (result.length > 0) setSuggestions(result);
    else toast.info("Couldn't get suggestions this time. Try again in a moment.");
  };

  // Apply one AI suggestion: update this month's budget for the category, or create it.
  const [applyingSuggestion, setApplyingSuggestion] = useState<string | null>(null);
  const applySuggestion = async (s: BudgetSuggestion) => {
    if (!isBudgetAmount(s.suggestedAmount)) {
      toast.error(`${s.category}: the suggested amount is not above zero, so nothing was saved.`);
      setSuggestions(prev => prev.filter(x => x.category !== s.category));
      return;
    }
    setApplyingSuggestion(s.category);
    try {
      const existing = budgets.find(b => b.month === currentMonthKey && b.category === s.category);
      const icon = existing?.categoryIcon
        ?? transactions.find(t => t.category === s.category)?.categoryIcon
        ?? '📌';
      const ok = existing
        // The suggestion is a monthly amount. A weekly row not converted yet
        // (the migration is applied by hand) would otherwise keep 'weekly'
        // and be read back as amount x 52 / 12.
        ? await updateBudget({ ...asMonthly(existing), amount: s.suggestedAmount })
        : await addBudget({ category: s.category, categoryIcon: icon, amount: s.suggestedAmount, period: 'monthly', month: currentMonthKey });
      if (ok) {
        toast.success(`${s.category} budget set to ${fmt(s.suggestedAmount)}`);
        setSuggestions(prev => prev.filter(x => x.category !== s.category));
      }
    } finally {
      setApplyingSuggestion(null);
    }
  };

  const saveTemplate = () => {
    if (thisMonthBudgets.length === 0) return;
    const monthKey = format(now, 'MMMM yyyy');
    const template: BudgetTemplate = {
      name: monthKey,
      savedAt: new Date().toISOString(),
      // Only the month in view: saving every month's budgets repeated each category.
      items: thisMonthBudgets.map(b => ({ category: b.category, categoryIcon: b.categoryIcon, amount: b.amount, period: b.period })),
    };
    const updated = [template, ...templates.filter(t => t.name !== monthKey)].slice(0, 12);
    setTemplates(updated);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(updated));
    toast.success(`Template saved: ${monthKey}`);
  };

  const applyTemplate = async (template: BudgetTemplate) => {
    setApplyingTemplate(true);
    const monthKey = format(now, 'yyyy-MM');
    try {
      let addedCount = 0;
      let skippedCount = 0;
      // `budgets` doesn't see rows added during this loop, so track them here
      // (older templates can list the same category more than once).
      const taken = new Set(budgets.filter(b => b.month === monthKey).map(b => b.category));
      for (const item of template.items) {
        if (taken.has(item.category)) { skippedCount++; continue; }
        taken.add(item.category);
        // A template saved while weekly budgets existed is applied as monthly.
        const { amount, period } = asMonthly(item);
        if (await addBudget({ category: item.category, categoryIcon: item.categoryIcon, amount, period, month: monthKey })) addedCount++;
      }
      if (addedCount === 0 && skippedCount > 0) {
        toast.info('All budgets from this template already exist for this month');
      } else if (addedCount > 0) {
        const skippedNote = skippedCount > 0 ? ` (${skippedCount} already existed)` : '';
        toast.success(`Added ${addedCount} budget${addedCount !== 1 ? 's' : ''} from template${skippedNote}`);
      }
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
      <div className="px-5 md:px-8 pt-12 pb-4">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h1 className="text-2xl font-heading mb-1">Budgets</h1>
            <p className="text-sm text-muted-foreground">{now.toLocaleString('en', { month: 'long', year: 'numeric' })}</p>
          </div>
          {/* Occasional tools live here, out of the main view. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground" aria-label="More budget actions">
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setShowAI(true)}>
                <Lightbulb size={14} className="mr-2" /> AI budget suggestions
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowScan(true)}>
                <ScanLine size={14} className="mr-2" /> Scan a screenshot
              </DropdownMenuItem>
              {budgets.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setShowDeleteAll(true)} className="text-destructive focus:text-destructive">
                    <Trash2 size={14} className="mr-2" /> Delete all budgets…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastMonthBudgets.length > 0 && !hasCopiedLastMonth && (
            <>
              <button
                onClick={copyFromLastMonth}
                disabled={copyingLastMonth}
                className="tap-area text-xs text-primary font-medium flex items-center gap-1 hover:underline disabled:opacity-50"
                title="Copy last month's budgets with the same amounts"
              >
                {copyingLastMonth ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                Copy {lastMonthLabel}
              </button>
              <button
                onClick={copyWithRollover}
                disabled={rollingOver}
                className="tap-area text-xs text-income font-medium flex items-center gap-1 hover:underline disabled:opacity-50"
                title="Copy budgets and add any unspent balance from last month"
              >
                {rollingOver ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Rollover
              </button>
            </>
          )}
          {budgets.length > 0 && (
            <button onClick={saveTemplate} className="tap-area text-xs text-muted-foreground font-medium flex items-center gap-1 hover:underline">
              <BookmarkPlus size={12} /> Save
            </button>
          )}
          {templates.length > 0 && (
            <button onClick={() => setShowTemplates(!showTemplates)} className="tap-area text-xs text-muted-foreground font-medium flex items-center gap-1 hover:underline">
              <FolderOpen size={12} /> Templates
            </button>
          )}
        </div>
      </div>

      {/* Template picker */}
      {showTemplates && (
        <div className="mx-5 md:mx-8 mb-2 bg-card rounded-xl border border-border p-4 space-y-2">
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
        <div className="bg-card rounded-xl p-4 card-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{overallPct}% spent</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{daysLeft} days left</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>{mask(fmt(totalSpent))}</span><span>{mask(fmt(totalBudgeted))}</span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden mb-2">
            <m.div initial={{ width: 0 }} animate={{ width: `${Math.min(overallPct, 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`h-full rounded-full ${overallPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
          </div>
          {/* Velocity row */}
          {daysElapsed > 0 && totalBudgeted > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground flex items-center gap-1">
                {projectedPct > 100 ? <TrendingUp size={11} /> : null}
                Projected month-end
              </span>
              <span className={`font-semibold ${velocityColor(projectedPct)}`}>
                {mask(fmt(projectedSpend))} ({projectedPct}%)
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
          <div className="bg-card rounded-xl p-8 card-shadow text-center">
            <ChartPie className="mx-auto mb-3 text-primary" size={40} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="font-heading text-base mb-1">No budgets yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first budget to start tracking your spending limits</p>
            <button onClick={() => { setEditBudget(null); setShowAddBudget(true); }}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2">
              <Plus size={16} /> Create First Budget
            </button>
          </div>
        ) : tab === 'this' && thisMonthBudgets.length === 0 ? (
          <div className="bg-card rounded-xl p-6 card-shadow text-center">
            <h3 className="font-heading text-base mb-1">No budgets for {format(now, 'MMMM')} yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {lastMonthBudgets.length > 0 ? `Bring over ${lastMonthLabel}'s budgets or add new ones.` : 'Add a budget to start tracking this month.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {lastMonthBudgets.length > 0 && (
                <button onClick={copyFromLastMonth} disabled={copyingLastMonth}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
                  <Copy size={14} /> Copy {lastMonthLabel}
                </button>
              )}
              <button onClick={() => { setEditBudget(null); setShowAddBudget(true); }}
                className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center gap-2">
                <Plus size={14} /> Add Budget
              </button>
            </div>
          </div>
        ) : tab === 'this' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {thisMonthBudgets.map(b => {
              const pct = budgetPercent(b.spent, b.amount);
              const remaining = b.amount - b.spent;
              const dailyLeft = daysLeft > 0 ? remaining / daysLeft : 0;
              // Velocity for this budget
              const pace = paces[b.id] ?? { projected: b.spent, hasPace: false };
              const projected = pace.projected;
              const projPct = budgetPercent(projected, b.amount);
              const lastMonthAmt = lastMonthData[b.category];
              return (
                <div key={b.id} className="bg-card rounded-xl p-4 card-shadow transition-shadow hover:card-shadow-hover group">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <IconTile value={b.categoryIcon} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold break-words">{b.category}</p>
                        <p className="text-xs text-muted-foreground">Monthly · {daysLeft}d left</p>
                        {thisMonthIncludes[b.category] && (
                          <p className="text-xs text-muted-foreground break-words">Includes {thisMonthIncludes[b.category].join(', ')}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {pct > 100 ? (
                        <Badge variant="destructive" className="text-[11px] px-2 py-0.5">Over Budget</Badge>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pct > 75 ? 'bg-warning-soft text-warning' : 'bg-accent text-accent-foreground'}`}>{pct}%</span>
                      )}
                      <button onClick={() => { setEditBudget(b); setShowAddBudget(true); }} aria-label="Edit budget" className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-2"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteBudgetId(b.id)} aria-label="Delete budget" className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-2"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                    <m.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${pct > 100 ? 'bg-expense' : pct > 75 ? 'bg-warning' : 'bg-primary'}`} />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center mb-2">
                    <div><p className="text-[11px] sm:text-xs text-muted-foreground">Spent</p><p className="text-xs sm:text-sm font-medium truncate">{mask(fmt(b.spent))}</p></div>
                    <div><p className="text-[11px] sm:text-xs text-muted-foreground">Remaining</p><p className={`text-xs sm:text-sm font-medium truncate ${remaining < 0 ? 'text-expense' : ''}`}>{mask(fmt(remaining))}</p></div>
                    <div><p className="text-[11px] sm:text-xs text-muted-foreground">Daily left</p><p className="text-xs sm:text-sm font-medium truncate">{mask(fmt(dailyLeft))}</p></div>
                  </div>
                  {/* Velocity + last month */}
                  {daysElapsed > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                      {pace.hasPace ? (
                        <span className={`flex items-center gap-1 ${velocityColor(projPct)}`}>
                          {projPct > 100 ? <TrendingUp size={10} /> : null}
                          {projPct > 100 ? 'Heading for' : 'On pace for'} {mask(fmt(projected))}
                        </span>
                      ) : <span />}
                      {lastMonthAmt !== undefined && (
                        <span className="text-muted-foreground">Last mo: {mask(fmt(lastMonthAmt))}</span>
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
            {lastMonthBudgets.map(b => {
              const lastSpent = lastMonthSpent[b.category] ?? 0;
              const pct = budgetPercent(lastSpent, b.amount);
              const diff = lastSpent - b.spent;
              return (
                <div key={b.id} className="bg-card rounded-xl p-4 card-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <IconTile value={b.categoryIcon} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{b.category}</p>
                      <p className="text-xs text-muted-foreground">{lastMonthLabel} · budget {mask(fmt(b.amount))}</p>
                      {lastMonthIncludes[b.category] && (
                        <p className="text-xs text-muted-foreground break-words">Includes {lastMonthIncludes[b.category].join(', ')}</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pct > 100 ? 'bg-destructive-soft text-expense' : pct > 75 ? 'bg-warning-soft text-warning' : 'bg-accent text-accent-foreground'}`}>{pct}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                    <div style={{ width: `${Math.min(pct, 100)}%` }} className={`h-full rounded-full ${pct > 100 ? 'bg-expense' : pct > 75 ? 'bg-warning' : 'bg-primary'}`} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Spent: <span className="text-foreground font-medium">{mask(fmt(lastSpent))}</span></span>
                    {b.spent > 0 && (
                      <span className={diff > 0 ? 'text-expense' : 'text-income'}>
                        {hidden ? '••••••' : `${diff > 0 ? '+' : ''}${fmt(diff)}`} vs now
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* AI Suggestions — opened from the ⋯ menu */}
        {showAI && (
        <div className="bg-card rounded-xl p-4 card-shadow border border-dashed border-primary-line">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Lightbulb size={13} className="text-primary-foreground" />
            </div>
            <h2 className="font-heading text-sm flex-1">AI Budget Suggestions</h2>
            <button onClick={() => { setShowAI(false); setSuggestions([]); }} className="text-muted-foreground p-1" aria-label="Close suggestions">
              <X size={14} />
            </button>
          </div>
          {suggestions.length > 0 ? (
            <div className="space-y-2.5">
              {suggestions.map((s) => (
                <div key={s.category} className="p-3 bg-accent rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{s.category}</span>
                    <span className="text-sm font-heading text-primary">{mask(fmt(s.suggestedAmount))}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.reasoning}</p>
                  <button onClick={() => applySuggestion(s)} disabled={applyingSuggestion !== null}
                    className="mt-2 text-xs font-medium text-primary disabled:opacity-50">
                    {applyingSuggestion === s.category ? 'Applying…' : 'Apply'}
                  </button>
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <button onClick={handleGenerateSuggestions} disabled={aiLoading} className="tap-area text-xs font-medium text-primary disabled:opacity-50">
                  {aiLoading ? 'Analyzing…' : 'Regenerate'}
                </button>
                <button onClick={() => { setSuggestions([]); setShowAI(false); }} className="text-xs font-medium text-muted-foreground">Dismiss</button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">Get AI-recommended budget amounts based on your spending</p>
              <button onClick={handleGenerateSuggestions} disabled={aiLoading}
                className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><Lightbulb size={14} /> Generate Suggestions</>}
              </button>
            </>
          )}
        </div>
        )}

        <button onClick={() => { setEditBudget(null); setShowAddBudget(true); }}
          className="w-full py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground text-sm font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors">
          <Plus size={18} /> Add Budget
        </button>
      </div>

      <AddBudgetDialog open={showAddBudget} onOpenChange={setShowAddBudget} editBudget={editBudget} />

      <ScanScreenshotSheet open={showScan} onOpenChange={setShowScan} target="budget" />

      <AlertDialog open={!!deleteBudgetId} onOpenChange={(o) => { if (!o) setDeleteBudgetId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete this budget?</AlertDialogTitle><AlertDialogDescription>This removes the budget limit only — your transactions and spending history are unaffected. We'll hold it for a few seconds so you can undo.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteBudgetId) scheduleBudgetDelete([deleteBudgetId], 'Budget deleted'); setDeleteBudgetId(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
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
                try {
                  await bulkRemoveBudgets(budgets.map(b => b.id));
                  setShowDeleteAll(false);
                } finally {
                  setDeletingAll(false);
                }
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
