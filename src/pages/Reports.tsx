import { savingsSummary } from '@/lib/finance/pace';
import { NARROW_PAGE } from '@/lib/pageLayout';
import { budgetCategoryOf } from '@/lib/finance/categories';
import { PageSpinner } from '@/components/ui/spinner';
import { incomeAndSpending, isCountableExpense, isCountableIncome, netSpending } from '@/lib/finance/transactionFilters';
import { activeBudgets } from '@/utils/budgets';
import { useMemo, useState, lazy, Suspense } from 'react';
import { format, parseISO, subMonths, getDay } from 'date-fns';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { useToday } from '@/hooks/useToday';
import { lastMonthSameDays } from '@/lib/today';
const MonthlyTrendChart = lazy(() => import('@/components/charts/MonthlyTrendChart'));
const SpendingPieChart = lazy(() => import('@/components/charts/SpendingPieChart'));
import { BarChart3, TrendingUp, TrendingDown, X, Receipt, Download, Printer, ChevronDown } from 'lucide-react';
import { IconButton, HeroCard, HeroChip, SectionLabel, Tile, ListCard, ListRow, BigAmount, Meter } from '@/components/orbix';
import AppIcon from '@/components/AppIcon';

const ChartSkeleton = () => <div className="h-[200px] w-full rounded-2xl bg-muted animate-pulse" />;

const Reports = () => {
  const { transactions, accounts, budgets, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();

  // Kept current while the page stays open, so "today" in the cut-offs below
  // moves on after midnight.
  const today = useToday();
  const [selectedMonth, setSelectedMonth] = useState(() => today.slice(0, 7));
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const creditAccountIds = useMemo(
    () => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)),
    [accounts]
  );

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(parseISO(`${today.slice(0, 7)}-01`), i);
      return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
    });
  }, [today]);

  const monthTxs = useMemo(
    // Exclude future-dated transactions (only relevant when viewing the current month).
    () => transactions.filter(tx => tx.date.startsWith(selectedMonth) && tx.date <= today),
    [transactions, selectedMonth, today]
  );

  const prevMonthStr = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return format(subMonths(new Date(y, m - 1), 1), 'yyyy-MM');
  }, [selectedMonth]);

  // The current month is only part of a month, so it's compared with the same
  // days of the month before, not all of it (that always read as a big drop).
  // A finished month is compared with the whole month before.
  const partialCompare = useMemo(() => {
    if (selectedMonth !== today.slice(0, 7)) return null;
    const range = lastMonthSameDays(today);
    return range.monthComplete ? null : range;
  }, [selectedMonth, today]);

  const prevMonthTxs = useMemo(
    () => transactions.filter(tx => tx.date.startsWith(prevMonthStr) && (!partialCompare || tx.date <= partialCompare.end)),
    [transactions, prevMonthStr, partialCompare]
  );

  // Spending after refunds, the same rule as Home (incomeAndSpending).
  const { income, spending: expenses } = useMemo(
    () => incomeAndSpending(monthTxs, creditAccountIds),
    [monthTxs, creditAccountIds]
  );

  const prevExpenses = useMemo(() => netSpending(prevMonthTxs), [prevMonthTxs]);

  const expenseChange = prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : null;
  const net = income - expenses;
  // No rate when more went out than came in: the Net tile already says by how much.
  const savings = savingsSummary(income, expenses);
  const savingsRate = savings.kind === 'saved' ? savings.rate : null;

  const exportCsv = () => {
    const rows = [
      ['Date', 'Merchant', 'Category', 'Type', 'Amount'],
      ...monthTxs.map(tx => [tx.date, tx.merchant, tx.category, tx.type, tx.amount.toFixed(2)]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendpal-${selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const categoryData = useMemo(() => {
    const map: Record<string, { value: number; icon: string }> = {};
    monthTxs.filter(tx => isCountableExpense(tx)).forEach(tx => {
      if (!map[tx.category]) map[tx.category] = { value: 0, icon: tx.categoryIcon };
      map[tx.category].value += tx.amount;
    });
    return Object.entries(map)
      .map(([name, { value, icon }]) => ({ name, value, icon }))
      .sort((a, b) => b.value - a.value);
  }, [monthTxs]);

  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxs.filter(tx => isCountableExpense(tx)).forEach(tx => {
      map[tx.merchant] = (map[tx.merchant] || 0) + tx.amount;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([merchant, amount]) => ({ merchant, amount }));
  }, [monthTxs]);

  // Budgets in effect for the selected month: its own, or the most recent
  // earlier month's when it has none, so a month without budgets still has
  // something to measure against. Never a later month's. (Home and the
  // Budgets page show only the month's own budgets; this is the report's rule.)
  const monthBudgets = useMemo(() => activeBudgets(budgets, selectedMonth), [budgets, selectedMonth]);

  // Budget.spent (from FinanceContext) is always the real current month's spend,
  // regardless of which budget it's attached to — fine for "this month" views,
  // but wrong here once the user picks a different month from the dropdown.
  // Recompute spend-by-category scoped to the selected month from monthTxs instead.
  const monthSpentByCategory = useMemo(() => {
    const names = new Set(monthBudgets.map(b => b.category));
    const spent: Record<string, number> = {};
    for (const tx of monthTxs) {
      if (tx.type !== 'expense' || tx.isTrackingOnly || tx.isInternal) continue;
      const category = budgetCategoryOf(tx.category, names);
      spent[category] = (spent[category] ?? 0) + tx.amount;
    }
    return spent;
  }, [monthTxs, monthBudgets]);

  const incomeBySource = useMemo(() => {
    const map: Record<string, { value: number; icon: string }> = {};
    monthTxs.filter(tx => isCountableIncome(tx, creditAccountIds)).forEach(tx => {
      if (!map[tx.merchant]) map[tx.merchant] = { value: 0, icon: tx.categoryIcon };
      map[tx.merchant].value += tx.amount;
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [monthTxs, creditAccountIds]);

  const dayOfWeekData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totals = new Array(7).fill(0);
    monthTxs.filter(tx => isCountableExpense(tx)).forEach(tx => {
      // getDay: 0=Sun, 1=Mon... convert to Mon=0
      const d = (getDay(parseISO(tx.date)) + 6) % 7;
      totals[d] += tx.amount;
    });
    const max = Math.max(...totals, 1);
    return days.map((label, i) => ({ label, total: totals[i], pct: Math.round((totals[i] / max) * 100) }));
  }, [monthTxs]);

  const hasData = categoryData.length > 0 || topMerchants.length > 0;

  // The same rows the category total is made of, so the list adds up to it.
  const drillTxs = useMemo(
    () => drillCategory ? monthTxs.filter(tx => isCountableExpense(tx) && tx.category === drillCategory) : [],
    [drillCategory, monthTxs]
  );

  if (loading) return <PageSpinner />;

  // Whole units for the hero chips, so they fit at phone width.
  const fmtCompact = (n: number) => fmt(Math.round(n)).replace(/[.,]00(?=\D*$)/, '');
  const monthLabel = format(parseISO(selectedMonth + '-01'), 'MMMM yyyy');
  const peakDay = Math.max(...dayOfWeekData.map(d => d.total));

  return (
    <div className={`${NARROW_PAGE} pb-8 space-y-6`}>
      {/* Header: big title, round icon buttons */}
      <div className="flex items-center justify-between gap-3 pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8">
        <h1 className="text-[1.75rem] leading-tight font-heading font-semibold tracking-tight">Reports</h1>
        {hasData && (
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <IconButton onClick={() => window.print()} aria-label="Print or save as PDF" title="Print or save as PDF"><Printer size={18} /></IconButton>
            <IconButton onClick={exportCsv} aria-label="Export CSV" title="Export CSV"><Download size={18} /></IconButton>
          </div>
        )}
      </div>

      {/* Hero: the month and its totals */}
      <HeroCard>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium opacity-80">Spent</p>
          <label className="relative hero-chip rounded-full h-8 pl-3 pr-7 flex items-center text-xs font-medium shrink-0">
            <span className="sr-only">Month</span>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              aria-label="Month"
              className="appearance-none bg-transparent outline-none cursor-pointer pr-1 text-[hsl(258_30%_8%)]"
            >
              {months.map(m => (
                <option key={m.value} value={m.value} className="text-foreground bg-popover">{m.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 pointer-events-none opacity-70" />
          </label>
        </div>
        <div className="mt-1 flex items-end gap-2 flex-wrap">
          <p className="text-[2.4rem] leading-none font-medium tracking-tight tabular-nums">
            {hidden ? '••••••' : <BigAmount text={fmt(expenses)} />}
          </p>
          {expenseChange !== null && (
            <span className="hero-chip rounded-full px-2 py-0.5 mb-1 text-[11px] font-medium tabular-nums flex items-center gap-1">
              {expenseChange > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {expenseChange > 0 ? '+' : ''}{expenseChange.toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-xs opacity-70 mt-1.5">
          {monthLabel}
          {expenseChange !== null && <> · vs {partialCompare ? `${format(parseISO(partialCompare.start), 'MMM')} 1-${partialCompare.endDay}` : 'prev'}</>}
        </p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <HeroChip label="Income" value={mask(fmtCompact(income))} />
          <HeroChip label="Net" value={hidden ? '••••••' : `${net < 0 ? '-' : ''}${fmtCompact(Math.abs(net))}`} />
          <HeroChip dark label="Savings rate" value={savingsRate === null ? '—' : `${savingsRate}%`} />
        </div>
      </HeroCard>

      {/* 6-Month Trend */}
      <section>
        <SectionLabel label="6 months" />
        <Tile>
          <Suspense fallback={<ChartSkeleton />}>
            <MonthlyTrendChart transactions={transactions} creditAccountIds={creditAccountIds} />
          </Suspense>
        </Tile>
      </section>

      {/* Spending by Category */}
      {categoryData.length > 0 && (
        <section>
          <SectionLabel label="By category" count={categoryData.length} />
          <div className="bg-card rounded-3xl overflow-hidden">
            <div className="p-4 pb-5">
              <Suspense fallback={<ChartSkeleton />}>
                <SpendingPieChart data={categoryData} />
              </Suspense>
            </div>
            <ListCard className="rounded-none border-t border-border">
            {categoryData.map(cat => (
              <ListRow
                key={cat.name}
                onClick={() => setDrillCategory(drillCategory === cat.name ? null : cat.name)}
                icon={<span className="text-[18px]"><AppIcon value={cat.icon} /></span>}
                title={<span className={drillCategory === cat.name ? 'text-primary' : ''}>{cat.name}</span>}
                sub={expenses > 0 ? `${Math.round((cat.value / expenses) * 100)}% of spending` : undefined}
                value={mask(fmt(cat.value))}
              />
            ))}
            </ListCard>
          </div>

          {/* Drill-through panel */}
          {drillCategory && (
            <div className="mt-3">
              <SectionLabel label={`${drillCategory} transactions`} count={drillTxs.length}
                action={(
                  <button onClick={() => setDrillCategory(null)} aria-label="Close" className="tap-area p-1 text-muted-foreground hover:text-foreground"><X size={16} /></button>
                )} />
              <ListCard className="max-h-80 overflow-y-auto">
                {drillTxs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No transactions</p>
                ) : drillTxs.map(tx => (
                  <ListRow key={tx.id}
                    icon={<Receipt size={16} className="text-muted-foreground" />}
                    title={tx.merchant}
                    sub={format(parseISO(tx.date), 'MMM d')}
                    value={<span className="text-expense">{mask(fmt(tx.amount))}</span>} />
                ))}
              </ListCard>
            </div>
          )}
        </section>
      )}

      {/* Budget Performance */}
      {monthBudgets.length > 0 && (
        <section>
          <SectionLabel label="Budgets" count={monthBudgets.length} />
          <ListCard>
            {monthBudgets.map(b => {
              const spent = monthSpentByCategory[b.category] ?? 0;
              const pct = b.amount > 0 ? Math.min((spent / b.amount) * 100, 100) : 0;
              const over = spent > b.amount;
              return (
                <div key={b.id} className="flex items-center gap-3 py-3.5">
                  <span className="w-11 h-11 shrink-0 rounded-full bg-muted flex items-center justify-center text-[18px]"><AppIcon value={b.categoryIcon} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-medium truncate">{b.category}</span>
                      <span className="text-sm tabular-nums shrink-0">
                        <span className={over ? 'text-expense' : ''}>{mask(fmt(spent))}</span>
                        <span className="text-muted-foreground"> / {mask(fmt(b.amount))}</span>
                      </span>
                    </div>
                    <Meter value={pct} label={`${b.category} budget used`} className="mt-2 h-1"
                      barClassName={over ? 'bg-expense' : pct > 75 ? 'bg-warning' : undefined} />
                  </div>
                </div>
              );
            })}
          </ListCard>
        </section>
      )}

      {/* Top Merchants */}
      {topMerchants.length > 0 && (
        <section>
          <SectionLabel label="Top merchants" count={topMerchants.length} />
          <ListCard>
            {topMerchants.map(({ merchant, amount }, i) => (
              <ListRow key={merchant}
                icon={<span className="text-sm font-medium tabular-nums text-muted-foreground">{i + 1}</span>}
                title={merchant}
                value={mask(fmt(amount))} />
            ))}
          </ListCard>
        </section>
      )}

      {/* Income by Source */}
      {incomeBySource.length > 0 && (
        <section>
          <SectionLabel label="Income sources" count={incomeBySource.length} />
          <ListCard>
            {incomeBySource.map(([source, data]) => {
              const pct = income > 0 ? Math.round((data.value / income) * 100) : 0;
              return (
                <div key={source} className="flex items-center gap-3 py-3.5">
                  <span className="w-11 h-11 shrink-0 rounded-full bg-muted flex items-center justify-center text-[18px]"><AppIcon value={data.icon} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-medium truncate">{source}</span>
                      <span className="text-sm tabular-nums shrink-0">{mask(fmt(data.value))} <span className="text-primary">{pct}%</span></span>
                    </div>
                    <Meter value={pct} label={`${source} share of income`} className="mt-2 h-1" />
                  </div>
                </div>
              );
            })}
          </ListCard>
        </section>
      )}

      {/* Day of Week */}
      {dayOfWeekData.some(d => d.total > 0) && (
        <section>
          <SectionLabel label="By weekday" />
          <Tile className="pt-5">
            <div className="flex items-end gap-2 h-32">
              {dayOfWeekData.map(({ label, total, pct }) => {
                const isPeak = total > 0 && total === peakDay;
                return (
                  <div key={label} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
                    <span className={`text-[10px] leading-none tabular-nums ${isPeak ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {total > 0 && !hidden ? Math.round(total).toLocaleString('en') : ''}
                    </span>
                    <div
                      className={`w-full max-w-[28px] rounded-full transition-all ${total > 0 ? (isPeak ? 'bg-[hsl(var(--pink,326_75%_80%))]' : 'bg-primary') : 'bg-muted'}`}
                      style={{ height: `${Math.max(pct * 0.8, total > 0 ? 6 : 4)}px` }}
                    />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </Tile>
        </section>
      )}

      {/* Empty state */}
      {!hasData && (
        <Tile className="text-center py-14 text-muted-foreground">
          <span className="mx-auto mb-3 w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <BarChart3 size={24} className="text-primary" />
          </span>
          <p className="font-medium">No data for {monthLabel}</p>
        </Tile>
      )}
    </div>
  );
};

export default Reports;
