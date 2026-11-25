import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';
import { incomeAndSpending, isCountableExpense } from '@/lib/finance/transactionFilters';
import { useSearchParams } from 'react-router-dom';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { Search, Receipt, Upload, Trash2, Download, Wallet, CalendarRange, X, AlertTriangle, Tag, Check, SquareCheck, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader, IconButton, HeroCard, HeroChip, PillTabs, SectionLabel, BigAmount, PAGE_X } from '@/components/orbix';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCategories } from '@/hooks/useCategories';
import { exportTransactionsCsv } from '@/utils/exportCsv';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, isToday, isYesterday, isSameYear } from 'date-fns';
import { detectDuplicates } from '@/utils/detectDuplicates';
import { pairTransfers } from '@/lib/finance/transfers';
import { Input } from '@/components/ui/input';
import { m, AnimatePresence } from 'framer-motion';
import ImportStatementSheet from '@/components/transactions/ImportStatementSheet';
import SwipeableTransaction from '@/components/transactions/SwipeableTransaction';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEditTransaction } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import AppIcon, { IconTile } from '@/components/AppIcon';


const PAGE_SIZE = 50;

const Transactions = () => {
  const { transactions, accounts, removeTransaction, bulkRemoveTransactions, bulkUpdateCategory, updateTransaction, dismissDuplicate, loading } = useFinance();
  const { fmtSigned, fmt } = useCurrency();

  const { hidden, mask } = useBalanceMask();
  const { openEditSheet } = useEditTransaction();
  const { categories: allCategories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter values come from the URL so they stay shareable and persistent.
  const filterType = searchParams.get('type') || 'all';
  const filterCategory = searchParams.get('category') || 'all';
  const filterAccount = searchParams.get('account') || 'all';
  const dateFrom = searchParams.get('from') || '';
  const dateTo = searchParams.get('to') || '';
  const search = searchParams.get('q') || '';
  // Tapping the duplicates banner narrows the list to the flagged rows.
  const dupesOnly = searchParams.get('dupes') === '1';

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (!value || value === 'all' || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [showAccountFilter, setShowAccountFilter] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [merchantProfile, setMerchantProfile] = useState<string | null>(null);
  const [categorizeTxId, setCategorizeTxId] = useState<string | null>(null);
  // Pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const isMobile = useIsMobile();

  // Undo delete state (pending deletes still run if the page unmounts).
  const { pendingDeleteIds, scheduleDelete } = useUndoableDelete({
    deleteOne: removeTransaction,
    deleteMany: bulkRemoveTransactions,
  });

  useEffect(() => () => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
  }, []);

  // Possible duplicates: same account, merchant, amount and type within a few
  // days, minus rows marked "Not a duplicate" (O(n) algorithm).
  const duplicateIds = useMemo(() => detectDuplicates(transactions), [transactions]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const handleNotDuplicate = async (id: string) => {
    if (dismissingId) return;
    setDismissingId(id);
    try { await dismissDuplicate(id); } finally { setDismissingId(null); }
  };

  // Merge transfer pairs: the two halves show as one row. Paired on the
  // transfer id; older rows on date + amount + note (see transfers.ts).
  const { mergedTransactions, transferPairs } = useMemo(() => {
    const pairs = pairTransfers(transactions);
    const incomeHalves = new Set([...pairs.values()].map(p => p.to.id));
    const merged = transactions.filter(tx => !incomeHalves.has(tx.id));
    return { mergedTransactions: merged, transferPairs: pairs };
  }, [transactions]);

  const filtered = useMemo(() => {
    return mergedTransactions.filter(tx => {
      if (pendingDeleteIds.has(tx.id)) return false;
      if (tx.isTrackingOnly) return false;
      if (dupesOnly && !duplicateIds.has(tx.id)) return false;
      const matchSearch = !search || tx.merchant.toLowerCase().includes(search.toLowerCase()) || tx.category.toLowerCase().includes(search.toLowerCase()) || (tx.note && tx.note.toLowerCase().includes(search.toLowerCase()));
      const isTransferEntry = tx.category === 'Transfer';
      const matchType = filterType === 'all'
        || (filterType === 'transfer' ? isTransferEntry : tx.type === filterType && !isTransferEntry);

      let matchAccount = filterAccount === 'all';
      if (!matchAccount) {
        const pair = transferPairs.get(tx.id);
        if (pair) {
          matchAccount = pair.from.accountId === filterAccount || pair.to.accountId === filterAccount;
        } else {
          matchAccount = tx.accountId === filterAccount;
        }
      }

      const matchDateFrom = !dateFrom || tx.date >= dateFrom;
      const matchDateTo = !dateTo || tx.date <= dateTo;
      const matchCategory = filterCategory === 'all' || tx.category === filterCategory;

      return matchSearch && matchType && matchAccount && matchDateFrom && matchDateTo && matchCategory;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [mergedTransactions, search, filterType, filterAccount, filterCategory, transferPairs, dateFrom, dateTo, pendingDeleteIds, dupesOnly, duplicateIds]);

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, filterType, filterAccount, filterCategory, dateFrom, dateTo, dupesOnly]);

  const paginated = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || '';
  const creditAccountIds = useMemo(() => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)), [accounts]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof paginated> = {};
    paginated.forEach(tx => {
      const key = tx.date;
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map);
  }, [paginated]);

  const visibleDupeCount = useMemo(() => filtered.filter(tx => duplicateIds.has(tx.id)).length, [filtered, duplicateIds]);
  // Once the last flagged row is dismissed, go back to the full list.
  useEffect(() => { if (!loading && dupesOnly && visibleDupeCount === 0) setFilter('dupes', ''); }, [loading, dupesOnly, visibleDupeCount, setFilter]);

  // Merchant profile stats
  const merchantStats = useMemo(() => {
    if (!merchantProfile) return null;
    const txs = transactions.filter(tx => tx.merchant.toLowerCase() === merchantProfile.toLowerCase())
      .sort((a, b) => b.date.localeCompare(a.date));
    const total = txs.filter(t => isCountableExpense(t)).reduce((s, t) => s + t.amount, 0);
    const count = txs.length;
    return { txs: txs.slice(0, 20), total, count, icon: txs[0]?.categoryIcon || '🏪' };
  }, [merchantProfile, transactions]);

  // Spending after refunds, the same rule as Home.
  const { income: filteredIncome, spending: filteredExpenses, net: filteredNet } = useMemo(
    () => incomeAndSpending(filtered, creditAccountIds),
    [filtered, creditAccountIds]
  );

  const handleDeleteSingle = (txId: string) => {
    const pair = transferPairs.get(txId);
    if (pair) {
      scheduleDelete([txId, pair.to.id], 'Transfer deleted');
    } else {
      scheduleDelete([txId], 'Transaction deleted');
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group label: "Today", "Yesterday", "Mon, Nov 24" (year only when not this year).
  const groupLabel = (iso: string) => {
    const d = parseISO(iso);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, isSameYear(d, new Date()) ? 'EEE, MMM d' : 'MMM d, yyyy');
  };

  // The hero names the period the totals cover.
  const periodLabel = (() => {
    const short = (v: string) => format(parseISO(v), 'd MMM yyyy');
    if (dateFrom && dateTo) {
      if (dateFrom === dateTo) return short(dateFrom);
      return `${format(parseISO(dateFrom), 'd MMM')} – ${short(dateTo)}`;
    }
    if (dateFrom) return `Since ${short(dateFrom)}`;
    if (dateTo) return `Until ${short(dateTo)}`;
    return 'All time';
  })();

  // One "Recent Activity" row: round icon, merchant + account line, amount right.
  const renderTxContent = (tx: typeof filtered[0]) => {
    const pair = transferPairs.get(tx.id);
    const isLinkedTransfer = !!pair;
    const fromAccountName = isLinkedTransfer ? getAccountName(pair.from.accountId) : '';
    const toAccountName = isLinkedTransfer ? getAccountName(pair.to.accountId) : '';
    const isDupe = duplicateIds.has(tx.id);
    const isSelected = selectedIds.has(tx.id);
    const amountText = isLinkedTransfer
      ? fmtSigned(tx.amount, 'transfer')
      : fmtSigned(tx.amount, tx.type as 'income' | 'expense' | 'transfer');
    const amountTone = isLinkedTransfer || tx.type === 'transfer'
      ? 'text-muted-foreground'
      : tx.type === 'income' ? 'text-income' : 'text-foreground';

    return (
      <div
        className={cn('flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-muted transition-colors', isSelected && 'bg-primary-soft')}
        onClick={() => { if (selectMode) toggleSelected(tx.id); else openEditSheet(tx); }}
      >
        {selectMode && (
          <span className={cn('w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
            isSelected ? 'bg-primary border-primary' : 'border-border')}>
            {isSelected && <Check size={11} strokeWidth={3} className="text-primary-foreground" aria-hidden="true" />}
          </span>
        )}
        <IconTile value={tx.categoryIcon} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium truncate flex items-center gap-1.5">
            <button
              className="truncate hover:underline text-left"
              aria-label={`View transactions from ${tx.merchant}`}
              onClick={e => { e.stopPropagation(); setMerchantProfile(tx.merchant); }}
            >
              {isLinkedTransfer && tx.merchant === 'Transfer' ? 'Transfer' : tx.merchant}
            </button>
            {isDupe && <span title="Possible duplicate"><AlertTriangle size={12} className="text-warning shrink-0" /></span>}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {isLinkedTransfer
                ? `${fromAccountName} → ${toAccountName}`
                : [getAccountName(tx.accountId), tx.note || tx.category].filter(Boolean).join(' · ')}
            </p>
            {!isLinkedTransfer && tx.type === 'income' && creditAccountIds.has(tx.accountId) && (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                Card credit
              </span>
            )}
            {/* != null, not truthy: 0 paid is a valid count and must not print a bare "0". */}
            {tx.totalInstallments != null && tx.currentInstallment != null && (
              <span className="text-[11px] font-medium text-primary bg-primary-soft px-1.5 py-0.5 rounded-full shrink-0">
                {tx.currentInstallment}/{tx.totalInstallments}
              </span>
            )}
            {tx.isPending && (
              <span className="text-[11px] font-medium text-warning bg-warning-soft px-1.5 py-0.5 rounded-full shrink-0">
                Pending
              </span>
            )}
          </div>
          {isDupe && (
            <button
              onClick={e => { e.stopPropagation(); handleNotDuplicate(tx.id); }}
              disabled={dismissingId === tx.id}
              className="mt-1.5 text-xs font-medium text-warning bg-warning-soft px-2.5 py-0.5 rounded-full disabled:opacity-50"
            >
              Not a duplicate
            </button>
          )}
        </div>
        <span className={cn('shrink-0 text-[15px] font-medium tabular-nums tracking-tight', amountTone)}>
          {hidden ? '••••••' : <BigAmount text={amountText} />}
        </span>
        {/* Delete and categorize live in a quiet row menu, not a trash icon per row.
            The wrapper stops clicks (also from the menu's portal) reaching the row. */}
        {!selectMode && (
          <span className="shrink-0 -mr-2" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Transaction actions">
                  <MoreVertical size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem onClick={() => setCategorizeTxId(tx.id)} className="gap-2 text-xs">
                  <Tag size={12} /> Categorize
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDeleteSingle(tx.id)} className="gap-2 text-xs text-destructive focus:text-destructive">
                  <Trash2 size={12} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </div>
    );
  };

  const filterPill = (active: boolean) => cn(
    'h-9 px-3.5 shrink-0 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
    active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
  );
  const optionPill = (active: boolean) => cn(
    'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors max-w-full truncate',
    active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
  );

  // Skeleton keeps the header, hero and list layout while transactions load.
  if (loading) {
    return (
      <div className={`${PAGE_X} pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8 pb-6 space-y-4`}>
        <Skeleton className="h-9 w-48 rounded-xl" />
        <Skeleton className="h-36 w-full rounded-[28px]" />
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className={cn(PAGE_X, 'pb-6')}>
      <PageHeader
        title="Transactions"
        subtitle={<>{visibleCount < filtered.length && `${visibleCount} of `}{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</>}
        actions={<>
          <IconButton onClick={() => exportTransactionsCsv(filtered, accounts)} aria-label="Export" title="Export CSV">
            <Download size={18} />
          </IconButton>
          <IconButton onClick={() => setShowImport(true)} aria-label="Import" title="Import statement">
            <Upload size={18} />
          </IconButton>
          <IconButton
            tone={selectMode ? 'primary' : 'card'}
            aria-label={selectMode ? 'Cancel' : 'Select'}
            aria-pressed={selectMode}
            title={selectMode ? 'Cancel selection' : 'Select'}
            onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()); }}
          >
            {selectMode ? <X size={18} /> : <SquareCheck size={18} aria-hidden="true" />}
          </IconButton>
        </>}
      />

      {/* Hero: the filtered period's net, with money in and out as chips */}
      {filtered.length > 0 && (
        <HeroCard className="mb-4">
          <p className="text-sm font-medium opacity-80">Net · {periodLabel}</p>
          <p className="text-financial-hero mt-1">
            {hidden ? '••••••' : <BigAmount text={`${filteredNet >= 0 ? '+' : ''}${fmt(filteredNet)}`} />}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <HeroChip label="In" value={hidden ? '••••••' : <BigAmount text={fmt(filteredIncome)} />} />
            <HeroChip label="Out" value={hidden ? '••••••' : <BigAmount text={fmt(filteredExpenses)} />} dark />
          </div>
        </HeroCard>
      )}

      {/* Duplicate warning */}
      {visibleDupeCount > 0 && (dupesOnly ? (
        <div className="flex items-center gap-2 mb-3 px-4 py-3 bg-warning-soft rounded-2xl text-xs text-warning font-medium">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">Showing {visibleDupeCount} possible duplicate{visibleDupeCount > 1 ? 's' : ''}.</span>
          <button onClick={() => setFilter('dupes', '')} className="shrink-0 underline underline-offset-2">Show all</button>
        </div>
      ) : (
        <button onClick={() => setFilter('dupes', '1')}
          className="w-full flex items-center gap-2 mb-3 px-4 py-3 bg-warning-soft rounded-2xl text-xs text-warning font-medium text-left">
          <AlertTriangle size={14} className="shrink-0" />
          {visibleDupeCount} possible duplicate{visibleDupeCount > 1 ? 's' : ''}. Tap to review.
        </button>
      ))}

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 pl-4 pr-1.5 py-1.5 bg-card rounded-full">
          <span className="text-sm font-medium flex-1">{selectedIds.size} selected</span>
          <button
            onClick={() => setSelectedIds(new Set(filtered.map(t => t.id)))}
            className="text-xs text-muted-foreground hover:text-foreground px-3 h-8 rounded-full hover:bg-muted transition-colors">
            Select all {filtered.length}
          </button>
          <Popover open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
            <PopoverTrigger asChild>
              <button className="px-3.5 h-8 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                Change Category
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2 max-h-64 overflow-y-auto">
              {allCategories.map(cat => (
                <button
                  key={cat.name}
                  onClick={async () => {
                    await bulkUpdateCategory([...selectedIds], cat.name, cat.icon);
                    setBulkCategoryOpen(false);
                    setSelectedIds(new Set());
                    setSelectMode(false);
                  }}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground text-xs transition-colors">
                  <span><AppIcon value={cat.icon} /></span> {cat.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search merchant, category, notes…" value={searchInput} onChange={e => {
          setSearchInput(e.target.value);
          if (searchDebounce.current) clearTimeout(searchDebounce.current);
          searchDebounce.current = setTimeout(() => setFilter('q', e.target.value), 250);
        }} className="h-12 pl-11 rounded-full bg-card border-0" />
      </div>

      {/* Type pills, then the narrower filters */}
      <PillTabs
        label="Type"
        value={filterType as 'all' | 'expense' | 'income' | 'transfer'}
        onChange={v => setFilter('type', v)}
        options={(['all', 'expense', 'income', 'transfer'] as const).map(f => ({ value: f, label: f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) }))}
        className="mb-2"
      />
      <div className="flex gap-2 overflow-x-auto scrollbar-none mb-3">
        <button onClick={() => setShowAccountFilter(!showAccountFilter)} className={filterPill(filterAccount !== 'all')} aria-expanded={showAccountFilter}>
          <Wallet size={14} />
          {filterAccount !== 'all' ? getAccountName(filterAccount) : 'Account'}
        </button>
        <button onClick={() => setShowCategoryFilter(!showCategoryFilter)} className={filterPill(filterCategory !== 'all')} aria-expanded={showCategoryFilter}>
          <Tag size={14} />
          {filterCategory !== 'all' ? filterCategory : 'Category'}
        </button>
        <button onClick={() => setShowDateFilter(!showDateFilter)} className={filterPill(!!(dateFrom || dateTo))} aria-expanded={showDateFilter}>
          <CalendarRange size={14} />
          {(dateFrom || dateTo) ? 'Dates' : 'Date Range'}
        </button>
      </div>

      {showAccountFilter && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button onClick={() => { setFilter('account', 'all'); setShowAccountFilter(false); }} className={optionPill(filterAccount === 'all')}>
            All Accounts
          </button>
          {accounts.map(acc => (
            <button key={acc.id} onClick={() => { setFilter('account', acc.id); setShowAccountFilter(false); }} className={optionPill(filterAccount === acc.id)}>
              <AppIcon value={acc.icon} /> {acc.name}
            </button>
          ))}
        </div>
      )}

      {showCategoryFilter && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button onClick={() => { setFilter('category', 'all'); setShowCategoryFilter(false); }} className={optionPill(filterCategory === 'all')}>
            All Categories
          </button>
          {allCategories.map(cat => (
            <button key={cat.name} onClick={() => { setFilter('category', cat.name); setShowCategoryFilter(false); }} className={optionPill(filterCategory === cat.name)}>
              <AppIcon value={cat.icon} /> {cat.name}
            </button>
          ))}
        </div>
      )}

      {showDateFilter && (
        <div className="bg-card rounded-3xl p-4 flex flex-col gap-3 mb-4">
          {/* Quick presets */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: 'Today', from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This week', from: format(startOfWeek(new Date()), 'yyyy-MM-dd'), to: format(endOfWeek(new Date()), 'yyyy-MM-dd') },
              { label: 'This month', from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
              { label: 'Last month', from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => { setFilter('from', preset.from); setFilter('to', preset.to); }}
                className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  dateFrom === preset.from && dateTo === preset.to
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground')}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-xs text-muted-foreground shrink-0 w-9">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setFilter('from', e.target.value)}
                className="flex-1 min-w-0 text-xs rounded-full bg-muted px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-xs text-muted-foreground shrink-0 w-9">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setFilter('to', e.target.value)}
                className="flex-1 min-w-0 text-xs rounded-full bg-muted px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setFilter('from', ''); setFilter('to', ''); }}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-muted text-muted-foreground text-xs hover:text-destructive transition-colors"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Activity, one card per day */}
      <div className="pt-2">
        {grouped.length === 0 ? (
          <div className="bg-card rounded-3xl text-center py-14">
            <Receipt size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No transactions found</p>
          </div>
        ) : (
          <AnimatePresence>
            {grouped.map(([date, txs]) => (
              <m.section key={date} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5">
                <SectionLabel label={groupLabel(date)} count={txs.length} />
                <div className="bg-card rounded-3xl overflow-hidden divide-y divide-border" role="list">
                  {txs.map(tx => isMobile ? (
                    <SwipeableTransaction key={tx.id} onDelete={() => handleDeleteSingle(tx.id)} onCategorize={() => setCategorizeTxId(tx.id)}>
                      {renderTxContent(tx)}
                    </SwipeableTransaction>
                  ) : (
                    <div key={tx.id} role="listitem">{renderTxContent(tx)}</div>
                  ))}
                </div>
              </m.section>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Show more pagination */}
      {visibleCount < filtered.length && (
        <div className="pb-4 flex justify-center">
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="px-6 h-11 rounded-full bg-card text-foreground text-sm font-medium hover:bg-muted transition-colors">
            Show more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      <ImportStatementSheet open={showImport} onOpenChange={setShowImport} />

      {/* Merchant Profile Dialog */}
      <Dialog open={!!merchantProfile} onOpenChange={o => { if (!o) setMerchantProfile(null); }}>
        <DialogContent className="max-w-sm w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconTile value={merchantStats?.icon} />
              <span>{merchantProfile}</span>
            </DialogTitle>
          </DialogHeader>
          {merchantStats && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-2xl p-3 text-center">
                  <p className="text-lg font-medium tabular-nums tracking-tight">{mask(fmt(merchantStats.total))}</p>
                  <p className="text-xs text-muted-foreground">Total spent</p>
                </div>
                <div className="bg-muted rounded-2xl p-3 text-center">
                  <p className="text-lg font-medium tabular-nums">{merchantStats.count}</p>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                </div>
              </div>
              <div className="space-y-1">
                {merchantStats.txs.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-xs font-medium">{format(parseISO(tx.date), 'MMM d, yyyy')}</p>
                      <p className="text-xs text-muted-foreground">{tx.category}</p>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${tx.type === 'income' ? 'text-income' : 'text-foreground'}`}>
                      {hidden ? '••••••' : `${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick Categorize Dialog */}
      <Dialog open={!!categorizeTxId} onOpenChange={o => { if (!o) setCategorizeTxId(null); }}>
        <DialogContent className="max-w-sm w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Category</DialogTitle>
          </DialogHeader>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {allCategories.map(cat => (
              <button
                key={cat.name}
                onClick={async () => {
                  if (!categorizeTxId) return;
                  const tx = transactions.find(t => t.id === categorizeTxId);
                  if (tx) await updateTransaction({ ...tx, category: cat.name, categoryIcon: cat.icon });
                  setCategorizeTxId(null);
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <IconTile value={cat.icon} />
                <span className="text-[11px] font-medium text-center leading-tight">{cat.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Transactions;
