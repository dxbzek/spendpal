import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Search, Receipt, Upload, Trash2, Download } from 'lucide-react';
import { exportTransactionsCsv } from '@/utils/exportCsv';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import ImportStatementSheet from '@/components/transactions/ImportStatementSheet';
import SwipeableTransaction from '@/components/transactions/SwipeableTransaction';
import { getCategoryChartColor } from '@/utils/categoryColors';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const Transactions = () => {
  const { transactions, accounts, removeTransaction } = useFinance();
  const { fmtSigned } = useCurrency();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showImport, setShowImport] = useState(false);
  const [deleteTxId, setDeleteTxId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      const matchSearch = !search || tx.merchant.toLowerCase().includes(search.toLowerCase()) || tx.category.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || tx.type === filterType;
      return matchSearch && matchType;
    });
  }, [transactions, search, filterType]);

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || '';

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
    return (
      <div className="flex items-center justify-between p-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: catColor + '1A', color: catColor }}>
            {tx.categoryIcon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{tx.merchant}</p>
            <p className="text-xs text-muted-foreground truncate">{tx.category} · {getAccountName(tx.accountId)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className={`text-sm font-heading ${tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense'}`}>
            {fmtSigned(tx.amount, tx.type as 'income' | 'expense')}
          </p>
          {!isMobile && (
            <button onClick={() => setDeleteTxId(tx.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading">Transactions</h1>
          <div className="flex items-center gap-2">
            {filtered.length > 0 && (
              <button onClick={() => setShowDeleteAll(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors">
                <Trash2 size={14} /> Delete All
              </button>
            )}
            <button onClick={() => exportTransactionsCsv(filtered, accounts)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-medium">
              <Upload size={14} /> Import
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card" />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {['all', 'expense', 'income', 'transfer'].map(f => (
            <button key={f} onClick={() => setFilterType(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filterType === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-6">
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
    </div>
  );
};

export default Transactions;
