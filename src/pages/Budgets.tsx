import GlossaryLink from '@/components/GlossaryLink';
import { useState, useMemo } from 'react';
import { isCountableExpense } from '@/lib/finance/transactionFilters';
import { PageSpinner } from '@/components/ui/spinner';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';
import { Lightbulb, Plus, Loader2, Pencil, Trash2, TrendingUp, History, BookmarkPlus, FolderOpen, Copy, RotateCcw, ScanLine, MoreHorizontal, X, ChartPie } from 'lucide-react';
import ScanScreenshotSheet from '@/components/forms/ScanScreenshotSheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { PAGE_X, PageHeader, IconButton, HeroCard, HeroChip, PillTabs, SectionLabel, SectionAction, Tile, ListCard, ListRow, BigAmount, Meter } from '@/components/orbix';
import { useUserSetting } from '@/hooks/useUserSettings';
import { userSettings, MAX_TEMPLATES, type BudgetTemplate } from '@/lib/userSettings';

const NO_TEMPLATES: BudgetTemplate[] = [];

/** Quiet per-row menu, so Edit and Delete are not icons on every row. */
const RowMenu = ({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={label} className="tap-area -mr-1 mt-0.5 p-1.5 rounded-full text-muted-foreground hover:text-foreground">
        <MoreHorizontal size={16} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40">
      <DropdownMenuItem onSelect={onEdit} aria-label="Edit budget"><Pencil size={14} className="mr-2" /> Edit</DropdownMenuItem>
      <DropdownMenuItem onSelect={onDelete} aria-label="Delete budget" className="text-destructive focus:text-destructive"><Trash2 size={14} className="mr-2" /> Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

interface BudgetSuggestion {
  category: string;
  suggestedAmount: number;
  reasoning: string;
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
  // Saved with the user's settings, so they follow the user and no one else.
  const templates = useUserSetting('budget_templates') ?? NO_TEMPLATES;
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
    const updated = [template, ...templates.filter(t => t.name !== monthKey)].slice(0, MAX_TEMPLATES);
    userSettings.set('budget_templates', updated);
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

  if (loading) return <PageSpinner />;

  // Hero bar: one segment per category, biggest spend first, as a share of
  // the month's total budget (or of the spend when it is over).
  const barBase = Math.max(totalBudgeted, totalSpent);
  const segments = [...thisMonthBudgets]
    .filter(b => b.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .map(b => ({ id: b.id, name: b.category, width: barBase > 0 ? (b.spent / barBase) * 100 : 0 }));
  const leftOverall = totalBudgeted - totalSpent;
  // Whole units where space is tight (hero chips).
  const fmtCompact = (n: number) => fmt(Math.round(n)).replace(/[.,]00(?=\D*$)/, '');
  const openAddBudget = () => { setEditBudget(null); setShowAddBudget(true); };

  return (
    <div className={`${PAGE_X} pb-8 max-w-4xl mx-auto`}>
      <PageHeader
        title="Budgets"
        subtitle={now.toLocaleString('en', { month: 'long', year: 'numeric' })}
        actions={(
          <>
            <IconButton onClick={openAddBudget} aria-label="Add budget"><Plus size={20} /></IconButton>
            {/* Occasional tools live here, out of the main view. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="More budget actions"><MoreHorizontal size={20} /></IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setShowAI(true)}>
                  <Lightbulb size={14} className="mr-2" /> AI budget suggestions
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowScan(true)}>
                  <ScanLine size={14} className="mr-2" /> Scan a screenshot
                </DropdownMenuItem>
                {budgets.length > 0 && (
                  <DropdownMenuItem onSelect={saveTemplate}>
                    <BookmarkPlus size={14} className="mr-2" /> Save as template
                  </DropdownMenuItem>
                )}
                {templates.length > 0 && (
                  <DropdownMenuItem onSelect={() => setShowTemplates(v => !v)}>
                    <FolderOpen size={14} className="mr-2" /> Templates
                  </DropdownMenuItem>
                )}
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
          </>
        )}
      />

      <div className="space-y-6">
        {/* Hero: spent against the month's total budget */}
        <HeroCard>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium opacity-80">Spent in {format(now, 'MMMM')}</p>
            <span className="hero-chip rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0">{daysLeft} days left</span>
          </div>
          <p className="mt-1 text-[2.4rem] leading-none font-medium tracking-tight tabular-nums">
            {hidden ? '••••••' : <BigAmount text={fmt(totalSpent)} />}
            <span className="text-base font-normal opacity-60"> / {mask(fmt(totalBudgeted))}</span>
          </p>

          {/* Segmented thin bar */}
          <div className="mt-5 h-2 rounded-full bg-[hsl(258_30%_8%/0.12)] flex gap-[3px] overflow-hidden"
            role="progressbar" aria-label="Budget spent" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100}>
            {segments.map((s, i) => (
              <div key={s.id} className="h-full rounded-full transition-all"
                style={{ width: `${s.width}%`, background: `hsl(258 30% 8% / ${[1, 0.62, 0.4, 0.26][Math.min(i, 3)]})` }} />
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-3 min-w-0 overflow-hidden">
              {segments.slice(0, 2).map((s, i) => (
                <span key={s.id} className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `hsl(258 30% 8% / ${[1, 0.62, 0.4][i]})` }} />
                  <span className="truncate opacity-80">{s.name}</span>
                </span>
              ))}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {leftOverall >= 0 ? `${mask(fmt(leftOverall))} left` : `${mask(fmt(-leftOverall))} over`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <HeroChip label="Spent" value={`${overallPct}%`} />
            <div className="hero-chip rounded-2xl px-3 py-2.5 min-w-0">
              <p className="text-[11px] opacity-70 flex items-center gap-1 truncate">
                Month-end <GlossaryLink term="Projected month-end" className="text-[hsl(258_30%_8%/0.7)]" />
              </p>
              <p className="text-base font-semibold tabular-nums truncate">
                {daysElapsed > 0 && totalBudgeted > 0 ? `${projectedPct}%` : '—'}
              </p>
            </div>
            <HeroChip dark label="On pace for" value={daysElapsed > 0 && totalBudgeted > 0 ? mask(fmtCompact(projectedSpend)) : '—'} />
          </div>
        </HeroCard>

        {/* Bring last month's budgets over */}
        {lastMonthBudgets.length > 0 && !hasCopiedLastMonth && (
          <Tile className="flex items-center gap-3">
            <span className="w-11 h-11 shrink-0 rounded-full bg-muted flex items-center justify-center"><History size={18} /></span>
            <p className="flex-1 min-w-0 text-sm">Bring over {lastMonthLabel}'s budgets</p>
            <button onClick={copyFromLastMonth} disabled={copyingLastMonth}
              className="h-9 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              title="Copy last month's budgets with the same amounts">
              {copyingLastMonth ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} Copy
            </button>
            <button onClick={copyWithRollover} disabled={rollingOver}
              className="h-9 px-3.5 rounded-full bg-muted text-foreground text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              title="Copy budgets and add any unspent balance from last month">
              {rollingOver ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Rollover
            </button>
          </Tile>
        )}

        {/* Template picker */}
        {showTemplates && (
          <div>
            <SectionLabel label="Templates" count={templates.length}
              action={<SectionAction onClick={() => setShowTemplates(false)}>Close</SectionAction>} />
            <ListCard>
              {templates.map(t => (
                <ListRow key={t.name} icon={<FolderOpen size={18} />} title={t.name} sub={`${t.items.length} budgets`}
                  trailing={(
                    <button onClick={() => applyTemplate(t)} disabled={applyingTemplate}
                      className="h-8 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
                      {applyingTemplate ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
                    </button>
                  )} />
              ))}
            </ListCard>
          </div>
        )}

        {/* AI Suggestions — opened from the ⋯ menu */}
        {showAI && (
          <div>
            <SectionLabel label="AI suggestions"
              action={(
                <button onClick={() => { setShowAI(false); setSuggestions([]); }} className="tap-area text-muted-foreground p-1" aria-label="Close suggestions">
                  <X size={16} />
                </button>
              )} />
            {suggestions.length > 0 ? (
              <ListCard>
                {suggestions.map((s) => (
                  <div key={s.category} className="py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[15px] font-medium truncate">{s.category}</span>
                      <span className="text-[15px] font-medium tabular-nums text-primary">{mask(fmt(s.suggestedAmount))}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.reasoning}</p>
                    <button onClick={() => applySuggestion(s)} disabled={applyingSuggestion !== null}
                      className="mt-2 h-8 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
                      {applyingSuggestion === s.category ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                ))}
                <div className="flex gap-4 py-3">
                  <button onClick={handleGenerateSuggestions} disabled={aiLoading} className="tap-area text-sm text-primary disabled:opacity-50">
                    {aiLoading ? 'Analyzing…' : 'Regenerate'}
                  </button>
                  <button onClick={() => { setSuggestions([]); setShowAI(false); }} className="tap-area text-sm text-muted-foreground">Dismiss</button>
                </div>
              </ListCard>
            ) : (
              <Tile>
                <button onClick={handleGenerateSuggestions} disabled={aiLoading}
                  className="w-full h-11 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                  {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><Lightbulb size={14} /> Suggest budgets</>}
                </button>
              </Tile>
            )}
          </div>
        )}

        {/* This month / last month */}
        {budgets.length > 0 && (
          <PillTabs label="Budget month" value={tab} onChange={setTab} className="w-fit"
            options={[
              { value: 'this', label: 'This month' },
              { value: 'last', label: lastMonthLabel },
            ]} />
        )}

        {budgets.length === 0 ? (
          <Tile className="p-8 text-center">
            <span className="mx-auto mb-3 w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <ChartPie className="text-primary" size={26} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <h3 className="font-heading text-base mb-4">No budgets yet</h3>
            <button onClick={openAddBudget}
              className="h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2">
              <Plus size={16} /> Add budget
            </button>
          </Tile>
        ) : tab === 'this' && thisMonthBudgets.length === 0 ? (
          <Tile className="p-6 text-center">
            <h3 className="font-heading text-base mb-4">No budgets for {format(now, 'MMMM')} yet</h3>
            <div className="flex flex-wrap justify-center gap-2">
              {lastMonthBudgets.length > 0 && (
                <button onClick={copyFromLastMonth} disabled={copyingLastMonth}
                  className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
                  <Copy size={14} /> Copy {lastMonthLabel}
                </button>
              )}
              <button onClick={openAddBudget}
                className="h-10 px-4 rounded-full bg-muted text-foreground text-sm font-medium inline-flex items-center gap-2">
                <Plus size={14} /> Add Budget
              </button>
            </div>
          </Tile>
        ) : tab === 'this' ? (
          <div>
            <SectionLabel label="Categories" count={thisMonthBudgets.length}
              action={<SectionAction onClick={openAddBudget}>Add</SectionAction>} />
            <ListCard>
              {thisMonthBudgets.map(b => {
                const pct = budgetPercent(b.spent, b.amount);
                const remaining = b.amount - b.spent;
                const dailyLeft = daysLeft > 0 ? remaining / daysLeft : 0;
                const pace = paces[b.id] ?? { projected: b.spent, hasPace: false };
                const projected = pace.projected;
                const projPct = budgetPercent(projected, b.amount);
                const lastMonthAmt = lastMonthData[b.category];
                const over = pct > 100;
                return (
                  <div key={b.id} className="flex items-start gap-3 py-4">
                    <button type="button" onClick={() => { setEditBudget(b); setShowAddBudget(true); }} aria-label="Edit budget"
                      className="flex items-start gap-3 flex-1 min-w-0 text-left">
                      <IconTile value={b.categoryIcon} className="w-11 h-11" />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[15px] font-medium truncate">{b.category}</span>
                          <span className={`text-[15px] shrink-0 font-medium tabular-nums ${over ? 'text-expense' : pct > 75 ? 'text-warning' : 'text-primary'}`}>{pct}%</span>
                        </span>
                        <span className="flex items-center justify-between gap-2 mt-0.5 text-xs tabular-nums">
                          <span className="text-muted-foreground truncate">
                            <span className={over ? 'text-expense' : 'text-foreground/80'}>{mask(fmt(b.spent))}</span> of {mask(fmt(b.amount))}
                          </span>
                          <span className={`shrink-0 ${remaining < 0 ? 'text-expense' : 'text-muted-foreground'}`}>
                            {remaining >= 0 ? `${mask(fmt(remaining))} left` : `${mask(fmt(-remaining))} over`}
                          </span>
                        </span>
                        <Meter value={pct} label={`${b.category} spent`} className="mt-2 h-1"
                          barClassName={over ? 'bg-expense' : pct > 75 ? 'bg-warning' : undefined} />
                        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                          {daysElapsed > 0 && pace.hasPace && (
                            <span className={`flex items-center gap-1 ${projPct > 100 ? 'text-expense' : ''}`}>
                              {projPct > 100 ? <TrendingUp size={10} /> : null}
                              {projPct > 100 ? 'Heading for' : 'On pace for'} {mask(fmt(projected))}
                            </span>
                          )}
                          <span>{mask(fmt(dailyLeft))}/day</span>
                          {daysElapsed > 0 && lastMonthAmt !== undefined && <span className="shrink-0">Last mo {mask(fmt(lastMonthAmt))}</span>}
                        </span>
                        {thisMonthIncludes[b.category] && (
                          <span className="block mt-1 text-[11px] text-muted-foreground break-words">Includes {thisMonthIncludes[b.category].join(', ')}</span>
                        )}
                      </span>
                    </button>
                    <RowMenu label={`${b.category} actions`}
                      onEdit={() => { setEditBudget(b); setShowAddBudget(true); }}
                      onDelete={() => setDeleteBudgetId(b.id)} />
                  </div>
                );
              })}
            </ListCard>
          </div>
        ) : (
          /* Last Month view */
          <div>
            <SectionLabel label={lastMonthLabel} count={lastMonthBudgets.length} />
            <ListCard>
              {lastMonthBudgets.map(b => {
                const lastSpent = lastMonthSpent[b.category] ?? 0;
                const pct = budgetPercent(lastSpent, b.amount);
                const diff = lastSpent - b.spent;
                const over = pct > 100;
                return (
                  <div key={b.id} className="flex items-start gap-3 py-4">
                    <IconTile value={b.categoryIcon} className="w-11 h-11" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[15px] font-medium truncate">{b.category}</p>
                        <p className={`text-[15px] shrink-0 font-medium tabular-nums ${over ? 'text-expense' : pct > 75 ? 'text-warning' : 'text-primary'}`}>{pct}%</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5 text-xs tabular-nums">
                        <span className="text-muted-foreground truncate">
                          Spent <span className={over ? 'text-expense' : 'text-foreground/80'}>{mask(fmt(lastSpent))}</span> of {mask(fmt(b.amount))}
                        </span>
                        {b.spent > 0 && (
                          <span className={`shrink-0 ${diff > 0 ? 'text-expense' : 'text-income'}`}>
                            {hidden ? '••••••' : `${diff > 0 ? '+' : ''}${fmt(diff)}`} vs now
                          </span>
                        )}
                      </div>
                      <Meter value={pct} label={`${b.category} spent in ${lastMonthLabel}`} className="mt-2 h-1"
                        barClassName={over ? 'bg-expense' : pct > 75 ? 'bg-warning' : undefined} />
                      {lastMonthIncludes[b.category] && (
                        <p className="mt-1 text-[11px] text-muted-foreground break-words">Includes {lastMonthIncludes[b.category].join(', ')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </ListCard>
          </div>
        )}
      </div>

      <AddBudgetDialog open={showAddBudget} onOpenChange={setShowAddBudget} editBudget={editBudget} />

      <ScanScreenshotSheet open={showScan} onOpenChange={setShowScan} target="budget" />

      <AlertDialog open={!!deleteBudgetId} onOpenChange={(o) => { if (!o) setDeleteBudgetId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete this budget?</AlertDialogTitle><AlertDialogDescription>Your transactions stay. You can undo for a few seconds.</AlertDialogDescription></AlertDialogHeader>
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
              Deletes all {budgets.length} budgets. This cannot be undone.
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
