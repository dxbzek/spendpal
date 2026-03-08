import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { Search, Filter, Receipt } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';

const Transactions = () => {
  const { transactions, accounts } = useFinance();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

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

  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-heading mb-4">Transactions</h1>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card" />
        </div>

        {/* Filter chips */}
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

      <div className="px-5">
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
                <div className="bg-card rounded-2xl card-shadow divide-y divide-border">
                  {txs.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between p-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{tx.categoryIcon}</span>
                        <div>
                          <p className="text-sm font-medium">{tx.merchant}</p>
                          <p className="text-xs text-muted-foreground">{tx.category} · {getAccountName(tx.accountId)}</p>
                        </div>
                      </div>
                      <p className={`text-sm font-heading ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                        {tx.type === 'income' ? '+' : '-'}د.إ {tx.amount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default Transactions;
