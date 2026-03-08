import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Search, Receipt, Upload, Trash2, Download, Filter } from 'lucide-react';
import { exportTransactionsCsv } from '@/utils/exportCsv';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import ImportStatementSheet from '@/components/transactions/ImportStatementSheet';
import SwipeableTransaction from '@/components/transactions/SwipeableTransaction';
import { getCategoryChartColor } from '@/utils/categoryColors';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEditTransaction } from '@/components/layout/AppLayout';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const Transactions = () => {
  const { transactions, accounts, removeTransaction } = useFinance();
  const { fmtSigned } = useCurrency();
  const { openEditSheet } = useEditTransaction();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteTxId, setDeleteTxId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isMobile = useIsMobile();

  // Merge transfer pairs: match expense+income with same date, amount, category='Transfer'
  const { mergedTransactions, transferPairs } = useMemo(() => {
    const pairs = new Map<string, { from: typeof transactions[0]; to: typeof transactions[0] }>();
    const pairedIds = new Set<string>();
    
    // Find transfer pairs
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
    
    // Filter out the "income" side of paired transfers
    const merged = transactions.filter(tx => !pairedIds.has(tx.id) || pairs.has(tx.id));
    return { mergedTransactions: merged, transferPairs: pairs };
  }, [transactions]);

  const filtered = useMemo(() => {
    return mergedTransactions.filter(tx => {
      const matchSearch = !search || tx.merchant.toLowerCase().includes(search.toLowerCase()) || tx.category.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || tx.type === filterType || (filterType === 'transfer' && tx.category === 'Transfer');
      const matchCategory = filterCategory === 'all' || tx.category === filterCategory;
      return matchSearch && matchType && matchCategory;
    });
  }, [mergedTransactions, search, filterType, filterCategory]);

  const uniqueCategories = useMemo(() => {
    const cats = [...new Set(transactions.map(tx => tx.category))];
    return cats.sort();
  }, [transactions]);

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || '';
  const creditAccountIds = useMemo(() => new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)), [accounts]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    filtered.forEach(tx => {
      const key = format(parseISO(tx.date), 'MMMM d, yyyy');
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map);
  }, [filtered]);

  const renderTxContent = (tx: typeof filtered[0], idx: number) => {
    const catColor = getCategoryChartColor(tx.category, idx);
    const emojiOnly = (str: string) => {
      const match = str.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u);
      return match ? match[0] : str.charAt(0);
    };
    
    const pair = transferPairs.get(tx.id);
    const isLinkedTransfer = !!pair;
    const fromAccountName = isLinkedTransfer ? getAccountName(pair.from.accountId) : '';
    const toAccountName = isLinkedTransfer ? getAccountName(pair.to.accountId) : '';
    
    return (
      <div
        className="flex items-center justify-between p-4 cursor-pointer active:bg-muted/50 transition-colors"
        onClick={() => openEditSheet(tx)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-2xl shrink-0">{emojiOnly(tx.categoryIcon)}</span>
           <div className="min-w-0">
             <p className="text-sm font-medium truncate">
               {isLinkedTransfer && tx.merchant === 'Transfer' ? 'Transfer' : tx.merchant}
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
              {fmtSigned(tx.amount, 'expense')}
            </p>
          ) : (
            <p className={`text-sm font-heading ${tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense'}`}>
              {fmtSigned(tx.amount, tx.type as 'income' | 'expense')}
            </p>
          )}
          <button onClick={(e) => { e.stopPropagation(); setDeleteTxId(tx.id); }}
            className="text-muted-foreground hover:text-destructive transition-colors p-1">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-heading">Transactions</h1>
        </div>
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
        </div>

        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card" />
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {['all', 'expense', 'income'].map(f => (
            <button key={f} onClick={() => setFilterType(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filterType === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button onClick={() => setShowCategoryFilter(!showCategoryFilter)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
              filterCategory !== 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
            <Filter size={12} />
            {filterCategory !== 'all' ? filterCategory : 'Category'}
          </button>
        </div>

        {showCategoryFilter && (
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 flex-wrap">
            <button onClick={() => { setFilterCategory('all'); setShowCategoryFilter(false); }}
              className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                filterCategory === 'all' ? 'bg-accent text-accent-foreground ring-1 ring-primary' : 'bg-muted/70 text-muted-foreground'
              }`}>
              All Categories
            </button>
            {uniqueCategories.map(cat => (
              <button key={cat} onClick={() => { setFilterCategory(cat); setShowCategoryFilter(false); }}
                className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                  filterCategory === cat ? 'bg-accent text-accent-foreground ring-1 ring-primary' : 'bg-muted/70 text-muted-foreground'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}
        </div>

      <div className="px-5 pb-24 md:pb-6">
        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <Receipt size={48} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No transactions found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Add your first transaction to get started</p>
          </div>
        ) : (
          <AnimatePresence>
            {grouped.map(([date, txs]) => (
              <motion.div key={date} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5">
                <p className="text-xs text-muted-foreground font-medium mb-2">{date}</p>
                <div className="bg-card rounded-2xl card-shadow overflow-hidden divide-y divide-border">
                  {txs.map((tx, idx) => (
                    isMobile ? (
                      <SwipeableTransaction key={tx.id} onDelete={() => setDeleteTxId(tx.id)}>
                        {renderTxContent(tx, idx)}
                      </SwipeableTransaction>
                    ) : (
                      <div key={tx.id} className="group">
                        {renderTxContent(tx, idx)}
                      </div>
                    )
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <ImportStatementSheet open={showImport} onOpenChange={setShowImport} />

      <AlertDialog open={!!deleteTxId} onOpenChange={(o) => { if (!o) setDeleteTxId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. The account balance will be adjusted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTxId) removeTransaction(deleteTxId); setDeleteTxId(null); }}
              className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                for (const tx of filtered) {
                  await removeTransaction(tx.id);
                }
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
