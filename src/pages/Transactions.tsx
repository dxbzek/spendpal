import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Search, Receipt, Upload, Trash2, Download, Wallet, CalendarRange, X, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCategories } from '@/hooks/useCategories';
import { exportTransactionsCsv } from '@/utils/exportCsv';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { detectDuplicates } from '@/utils/detectDuplicates';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import ImportStatementSheet from '@/components/transactions/ImportStatementSheet';
import SwipeableTransaction from '@/components/transactions/SwipeableTransaction';
import { extractEmoji } from '@/utils/categoryColors';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEditTransaction } from '@/context/EditTxContext';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const UNDO_DELAY_MS = 5000;

const PAGE_SIZE = 50;

const Transactions = () => {
  const { transactions, accounts, removeTransaction, bulkRemoveTransactions, bulkUpdateCategory, updateTransaction, loading } = useFinance();
  const { fmtSigned, fmt } = useCurrency();
  const { openEditSheet } = useEditTransaction();
  const { categories: allCategories } = useCategories();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [showAccountFilter, setShowAccountFilter] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [merchantProfile, setMerchantProfile] = useState<string | null>(null);
  const [categorizeTxId, setCategorizeTxId] = useState<string | null>(null);
  // Pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const isMobile = useIsMobile();

  // Undo delete state
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup all pending timers and debounce on unmount
  useEffect(() => () => {
    pendingTimers.current.forEach(t => clearTimeout(t));
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
  }, []);

  const scheduleDelete = useCallback((ids: string[], label: string) => {
    ids.forEach(id => {
      if (pendingTimers.current.has(id)) clearTimeout(pendingTimers.current.get(id)!);
    });
    setPendingDeleteIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });

    const timers = ids.map(id => {
      const t = setTimeout(async () => {
        await removeTransaction(id);
        setPendingDeleteIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        pendingTimers.current.delete(id);
      }, UNDO_DELAY_MS);
      pendingTimers.current.set(id, t);
      return t;
    });

    toast(label, {
      duration: UNDO_DELAY_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          ids.forEach(id => {
            const t = pendingTimers.current.get(id);
            if (t) { clearTimeout(t); pendingTimers.current.delete(id); }
          });
          setPendingDeleteIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
          timers.forEach(clearTimeout);
        },
      },
    });
  }, [removeTransaction]);

  // Detect duplicates: same merchant + amount + type within 24h (O(n) algorithm)
  const duplicateIds = useMemo(() => detectDuplicates(transactions), [transactions]);

  // Merge transfer pairs: match expense+income with same date, amount, category='Transfer'
  const { mergedTransactions, transferPairs } = useMemo(() => {
    const pairs = new Map<string, { from: typeof transactions[0]; to: typeof transactions[0] }>();
    const pairedIds = new Set<string>();

    const transferExpenses = transactions.filter(t => t.category === 'Transfer' && t.type === 'expense');
    const transferIncomes = transactions.filter(t => t.category === 'Transfer' && t.type === 'income');

    for (const exp of transferExpenses) {
      const match = transferIncomes.find(inc =>
        inc.date === exp.date &&
        inc.amount === exp.amount &&
        !pairedIds.has(inc.id)
      );
      if (match) {
        pairs.set(exp.id, { from: exp, to: match });
        pairedIds.add(exp.id);
        pairedIds.add(match.id);
      }
    }

    const merged = transactions.filter(tx => !pairedIds.has(tx.id) || pairs.has(tx.id));
    return { mergedTransactions: merged, transferPairs: pairs };
  }, [transactions]);

  const filtered = useMemo(() => {
    return mergedTransactions.filter(tx => {
      if (pendingDeleteIds.has(tx.id)) return false;
      const matchSearch = !search || tx.merchant.toLowerCase().includes(search.toLowerCase()) || tx.category.toLowerCase().includes(search.toLowerCase()) || (tx.note && tx.note.toLowerCase().includes(search.toLowerCase()));
      const isTransferEntry = tx.category === 'Transfer';
      const matchType = filterType === 'all' || tx.type === filterType || (filterType === 'transfer' && isTransferEntry);

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

      return matchSearch && matchType && matchAccount && matchDateFrom && matchDateTo;
    });
  }, [mergedTransactions, search, filterType, filterAccount, transferPairs, dateFrom, dateTo, pendingDeleteIds]);

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, filterType, filterAccount, dateFrom, dateTo]);

  const paginated = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || '';
  const creditAccountIds = useMemo(() => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)), [accounts]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof paginated> = {};
    paginated.forEach(tx => {
      const key = format(parseISO(tx.date), 'MMMM d, yyyy');
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map);
  }, [paginated]);

  const visibleDupeCount = useMemo(() => filtered.filter(tx => duplicateIds.has(tx.id)).length, [filtered, duplicateIds]);

  // Merchant profile stats
  const merchantStats = useMemo(() => {
    if (!merchantProfile) return null;
    const txs = transactions.filter(tx => tx.merchant.toLowerCase() === merchantProfile.toLowerCase())
      .sort((a, b) => b.date.localeCompare(a.date));
    const total = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const count = txs.length;
    return { txs: txs.slice(0, 20), total, count, icon: txs[0]?.categoryIcon || '🏪' };
  }, [merchantProfile, transactions]);

  const filteredIncome = useMemo(() =>
    filtered.filter(tx => tx.type === 'income' && tx.category !== 'Transfer').reduce((s, tx) => s + tx.amount, 0),
    [filtered]
  );
  const filteredExpenses = useMemo(() =>
    filtered.filter(tx => tx.type === 'expense' && tx.category !== 'Transfer').reduce((s, tx) => s + tx.amount, 0),
    [filtered]
  );
  const filteredNet = filteredIncome - filteredExpenses;

  const handleDeleteSingle = (txId: string) => {
    const pair = transferPairs.get(txId);
    if (pair) {
      scheduleDelete([txId, pair.to.id], 'Transfer deleted');
    } else {
      scheduleDelete([txId], 'Transaction deleted');
    }
  };

  const renderTxContent = (tx: typeof filtered[0], _idx: number) => {
    const pair = transferPairs.get(tx.id);
    const isLinkedTransfer = !!pair;
    const fromAccountName = isLinkedTransfer ? getAccountName(pair.from.accountId) : '';
    const toAccountName = isLinkedTransfer ? getAccountName(pair.to.accountId) : '';
    const isDupe = duplicateIds.has(tx.id);
    const isSelected = selectedIds.has(tx.id);

    return (
      <div
        className={`flex items-center justify-between p-4 cursor-pointer active:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
        onClick={() => {
          if (selectMode) {
            setSelectedIds(prev => {
              const next = new Set(prev);
              if (next.has(tx.id)) next.delete(tx.id);
              else next.add(tx.id);
              return next;
            });
          } else {
            openEditSheet(tx);
          }
        }}
      >
        {selectMode && (
          <div className="shrink-0 mr-2">
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected ? 'bg-primary border-primary' : 'border-border'
            }`}>
              {isSelected && <span className="text-primary-foreground text-[10px] leading-none">✓</span>}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-2xl shrink-0">{extractEmoji(tx.categoryIcon)}</span>
           <div className="min-w-0">
             <p className="text-sm font-medium truncate flex items-center gap-1.5">
               <button
                 className="truncate hover:underline text-left"
                 aria-label={`View transactions from ${tx.merchant}`}
                 onClick={e => { e.stopPropagation(); setMerchantProfile(tx.merchant); }}
               >
                 {isLinkedTransfer && tx.merchant === 'Transfer' ? 'Transfer' : tx.merchant}
               </button>
               {isDupe && <span title="Possible duplicate"><AlertTriangle size={12} className="text-warning shrink-0" /></span>}
             </p>
             <div className="flex items-center gap-1.5">
               {isLinkedTransfer ? (
                 <p className="text-xs text-muted-foreground truncate">
                   {fromAccountName} → {toAccountName}
                 </p>
               ) : (
                 <p className="text-xs text-muted-foreground truncate">{getAccountName(tx.accountId)}</p>
               )}
               {!isLinkedTransfer && tx.type === 'income' && creditAccountIds.has(tx.accountId) && (
                 <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                   💳 Card Credit
                 </span>
               )}
               {tx.totalInstallments && tx.currentInstallment && (
                 <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                   {tx.currentInstallment}/{tx.totalInstallments}
                 </span>
               )}
             </div>
             {tx.note && !isLinkedTransfer && (
               <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">📝 {tx.note}</p>
             )}
           </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLinkedTransfer ? (
            <p className="text-sm font-heading text-muted-foreground">
              {fmtSigned(tx.amount, 'transfer')}
            </p>
          ) : (
            <p className={`text-sm font-heading ${tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense'}`}>
              {fmtSigned(tx.amount, tx.type as 'income' | 'expense' | 'transfer')}
            </p>
          )}
          <button onClick={(e) => { e.stopPropagation(); handleDeleteSingle(tx.id); }}
            className="text-muted-foreground hover:text-destructive transition-colors p-1">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      <div className="px-5 md:px-8 pt-12 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-heading">Transactions</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          {visibleCount < filtered.length && ` (showing ${visibleCount})`}
        </p>

        {/* Duplicate warning banner */}
        {visibleDupeCount > 0 && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2.5 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning font-medium">
            <AlertTriangle size={14} />
            {visibleDupeCount} possible duplicate{visibleDupeCount > 1 ? 's' : ''} detected — review before deleting
          </div>
        )}

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {filtered.length > 0 && (
            <button onClick={() => setShowDeleteAll(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors">
              <Trash2 size={14} /> <span className="hidden sm:inline">Delete All</span><span className="sm:hidden">Delete</span>
            </button>
          )}
          <button onClick={() => exportTransactionsCsv(filtered, accounts)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
            <Download size={14} /> <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-medium">
            <Upload size={14} /> <span className="hidden sm:inline">Import</span>
          </button>
          <button
            onClick={() => {
              setSelectMode(s => !s);
              setSelectedIds(new Set());
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectMode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
            {selectMode ? <X size={14} /> : <span>☑</span>} <span className="hidden sm:inline">{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
        </div>

        {/* Bulk action bar */}
        {selectMode && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-xl">
            <span className="text-xs font-semibold text-primary flex-1">{selectedIds.size} selected</span>
            <button
              onClick={() => setSelectedIds(new Set(filtered.map(t => t.id)))}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors">
              Select all {filtered.length}
            </button>
            <div className="relative">
              <button
                onClick={() => setBulkCategoryOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
                Change Category
              </button>
              {bulkCategoryOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-card border border-border rounded-xl shadow-lg p-2 max-h-64 overflow-y-auto">
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
                      <span>{cat.icon}</span> {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search merchant, category, notes…" value={searchInput} onChange={e => {
            setSearchInput(e.target.value);
            if (searchDebounce.current) clearTimeout(searchDebounce.current);
            searchDebounce.current = setTimeout(() => setSearch(e.target.value), 250);
          }} className="pl-10 bg-card" />
        </div>

        <div className="relative mb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none pr-8">
            {['all', 'expense', 'income', 'transfer'].map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  filterType === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={() => setShowAccountFilter(!showAccountFilter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                filterAccount !== 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
              <Wallet size={12} />
              {filterAccount !== 'all' ? getAccountName(filterAccount) : 'Account'}
            </button>
            <button onClick={() => setShowDateFilter(!showDateFilter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                (dateFrom || dateTo) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
              <CalendarRange size={12} />
              {(dateFrom || dateTo) ? 'Dates' : 'Date Range'}
            </button>
          </div>
          <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
        </div>

        {showAccountFilter && (
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 flex-wrap">
            <button onClick={() => { setFilterAccount('all'); setShowAccountFilter(false); }}
              className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                filterAccount === 'all' ? 'bg-accent text-accent-foreground ring-1 ring-primary' : 'bg-muted/70 text-muted-foreground'
              }`}>
              All Accounts
            </button>
            {accounts.map(acc => (
              <button key={acc.id} onClick={() => { setFilterAccount(acc.id); setShowAccountFilter(false); }}
                className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                  filterAccount === acc.id ? 'bg-accent text-accent-foreground ring-1 ring-primary' : 'bg-muted/70 text-muted-foreground'
                }`}>
                {acc.icon} {acc.name}
              </button>
            ))}
          </div>
        )}

        {showDateFilter && (
          <div className="flex flex-col gap-2 mb-4">
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
                  onClick={() => { setDateFrom(preset.from); setDateTo(preset.to); }}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    dateFrom === preset.from && dateTo === preset.to
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <label className="text-[11px] text-muted-foreground shrink-0">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 min-w-0 text-xs rounded-lg border border-border bg-card px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <label className="text-[11px] text-muted-foreground shrink-0">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 min-w-0 text-xs rounded-lg border border-border bg-card px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          </div>
        )}
        </div>

      {/* Totals bar */}
      {filtered.length > 0 && (
        <div className="px-5 md:px-8 mb-3 -mt-1">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-card rounded-xl card-shadow text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Income</span>
              <span className="font-semibold text-income">{fmt(filteredIncome)}</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Expenses</span>
              <span className="font-semibold text-expense">{fmt(filteredExpenses)}</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Net</span>
              <span className={`font-semibold ${filteredNet >= 0 ? 'text-income' : 'text-expense'}`}>{filteredNet >= 0 ? '+' : ''}{fmt(filteredNet)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 md:px-8 pb-24 md:pb-6">
        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <Receipt size={64} className="mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground text-sm">No transactions found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Add your first transaction to get started</p>
          </div>
        ) : isMobile ? (
          <AnimatePresence>
            {grouped.map(([date, txs]) => (
              <motion.div key={date} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{date}</p>
                <div className="bg-card rounded-2xl card-shadow overflow-hidden divide-y divide-border">
                  {txs.map((tx, idx) => (
                    <SwipeableTransaction key={tx.id} onDelete={() => handleDeleteSingle(tx.id)} onCategorize={() => setCategorizeTxId(tx.id)}>
                      {renderTxContent(tx, idx)}
                    </SwipeableTransaction>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          /* Desktop: table layout */
          <div className="bg-card rounded-2xl card-shadow overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[150px_1fr_160px_110px_60px] gap-0 border-b border-border px-4 py-3">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Merchant / Category</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Account</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Amount</span>
              <span />
            </div>
            <AnimatePresence>
              {grouped.map(([date, txs]) => (
                <motion.div key={date} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                    {date}
                  </div>
                  {txs.map((tx, _idx) => {
                    const pair = transferPairs.get(tx.id);
                    const isLinkedTransfer = !!pair;
                    const isDupe = duplicateIds.has(tx.id);
                    const emojiOnly = (str: string) => {
                      const match = str.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u);
                      return match ? match[0] : str.charAt(0);
                    };
                    return (
                      <div key={tx.id}
                        className={`grid grid-cols-[150px_1fr_160px_110px_60px] gap-0 px-4 py-3 border-b border-border last:border-0 hover:bg-accent/30 transition-colors cursor-pointer group items-center ${isDupe ? 'bg-warning/5' : ''}`}
                        onClick={() => openEditSheet(tx)}
                      >
                        <span className="text-xs text-muted-foreground">{format(parseISO(tx.date), 'MMM d, yyyy')}</span>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl shrink-0">{emojiOnly(tx.categoryIcon)}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                              {tx.merchant}
                              {isDupe && <AlertTriangle size={12} className="text-warning shrink-0" />}
                            </p>
                            <p className="text-[11px] font-medium text-muted-foreground truncate">{tx.category}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {isLinkedTransfer ? `${getAccountName(pair!.from.accountId)} → ${getAccountName(pair!.to.accountId)}` : getAccountName(tx.accountId)}
                        </span>
                        <span className={`text-sm font-heading text-right tabular-nums ${
                          isLinkedTransfer ? 'text-muted-foreground' :
                          tx.type === 'income' ? 'text-income' : 'text-expense'
                        }`}>
                          {isLinkedTransfer ? `${tx.amount}` : `${tx.type === 'income' ? '+' : '-'}${tx.amount}`}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSingle(tx.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 ml-auto"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Show more pagination */}
      {visibleCount < filtered.length && (
        <div className="px-5 md:px-8 pb-4 flex justify-center">
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="px-6 py-2.5 rounded-full bg-muted text-muted-foreground text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
            Show more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      <ImportStatementSheet open={showImport} onOpenChange={setShowImport} />

      {/* Merchant Profile Sheet */}
      <Sheet open={!!merchantProfile} onOpenChange={o => { if (!o) setMerchantProfile(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="text-2xl">{merchantStats?.icon}</span>
              <span>{merchantProfile}</span>
            </SheetTitle>
          </SheetHeader>
          {merchantStats && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-expense">{fmt(merchantStats.total)}</p>
                  <p className="text-xs text-muted-foreground">Total spent</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold">{merchantStats.count}</p>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                </div>
              </div>
              <div className="space-y-1">
                {merchantStats.txs.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-xs font-medium">{format(parseISO(tx.date), 'MMM d, yyyy')}</p>
                      <p className="text-[11px] text-muted-foreground">{tx.category}</p>
                    </div>
                    <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Quick Categorize Sheet */}
      <Sheet open={!!categorizeTxId} onOpenChange={o => { if (!o) setCategorizeTxId(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[70vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Change Category</SheetTitle>
          </SheetHeader>
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
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-[10px] font-medium text-center leading-tight">{cat.name}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {filtered.length} {filterType !== 'all' ? filterType : ''} transactions. Account balances will be adjusted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                await bulkRemoveTransactions(filtered.map(tx => tx.id));
                setDeleting(false);
                setShowDeleteAll(false);
              }}
              className="bg-destructive text-destructive-foreground">
              {deleting ? 'Deleting...' : `Delete ${filtered.length} Transactions`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Transactions;
