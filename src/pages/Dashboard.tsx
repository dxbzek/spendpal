import { useState, useMemo } from 'react';
import { useBalanceMask, dispatchBalanceMaskToggle } from '@/hooks/useBalanceMask';
import { extractEmoji } from '@/utils/categoryColors';
import { activeBudgets } from '@/utils/budgets';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBudgetAlerts } from '@/hooks/useBudgetAlerts';
import {
  netPosition, installmentPlans, cardPaymentDue, inferPayday, leftUntilPayday, ordinal, daysBetween,
  type CardDue,
} from '@/lib/finance/position';
import { Eye, EyeOff, Plus, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import AddAccountDialog from '@/components/forms/AddAccountDialog';
import { Skeleton } from '@/components/ui/skeleton';

const PAYDAY_KEY = 'spendpal_payday';

const readPayday = (): number | null => {
  try {
    const v = Number(localStorage.getItem(PAYDAY_KEY));
    return v >= 1 && v <= 31 ? v : null;
  } catch { return null; }
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`bg-card rounded-2xl p-4 card-shadow ${className}`}>{children}</section>
);

const Dashboard = () => {
  const { accounts, transactions, budgets, loading: dataLoading } = useFinance();
  const { fmt, fmtSigned } = useCurrency();
  const navigate = useNavigate();
  const { hidden, mask } = useBalanceMask();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [paydayOverride, setPaydayOverride] = useState<number | null>(readPayday);
  const now = useMemo(() => new Date(), []);

  // Budget alerts still fire as toasts even though budgets moved off Home.
  const activeBudgetsList = useMemo(
    () => activeBudgets(budgets, format(now, 'yyyy-MM')),
    [budgets, now]
  );
  useBudgetAlerts(activeBudgetsList);

  const position = useMemo(() => netPosition(accounts), [accounts]);

  const cardDues = useMemo(() => {
    const plans = installmentPlans(transactions);
    return accounts
      .map(a => cardPaymentDue(a, transactions, plans, now))
      .filter((d): d is CardDue => d !== null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [accounts, transactions, now]);

  const inferredPayday = useMemo(() => inferPayday(transactions), [transactions]);
  const payday = paydayOverride ?? inferredPayday;
  const runway = useMemo(
    () => payday ? leftUntilPayday({ accounts, transactions, cardDues, payday, now }) : null,
    [accounts, transactions, cardDues, payday, now]
  );

  const setPayday = (day: number) => {
    setPaydayOverride(day);
    try { localStorage.setItem(PAYDAY_KEY, String(day)); } catch { /* per-device convenience only */ }
  };

  // Merge transfer pairs into one row (same logic as the Transactions page).
  const recentTx = useMemo(() => {
    const pairedIds = new Set<string>();
    const mergedList: (typeof transactions[0] & { toAccountId?: string })[] = [];
    const transferExpenses = transactions.filter(t => t.category === 'Transfer' && t.type === 'expense');
    const transferIncomes = transactions.filter(t => t.category === 'Transfer' && t.type === 'income');
    const transferToAccount = new Map<string, string>();
    for (const exp of transferExpenses) {
      const match = transferIncomes.find(inc => inc.date === exp.date && inc.amount === exp.amount && !pairedIds.has(inc.id));
      if (match) {
        pairedIds.add(exp.id);
        pairedIds.add(match.id);
        transferToAccount.set(exp.id, match.accountId);
      }
    }
    for (const tx of transactions) {
      if (pairedIds.has(tx.id) && !transferToAccount.has(tx.id)) continue; // skip income half
      mergedList.push({ ...tx, toAccountId: transferToAccount.get(tx.id) });
    }
    return mergedList.slice(0, 8);
  }, [transactions]);

  if (dataLoading) {
    return (
      <div className="px-5 md:px-8 pt-8 pb-8 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-6 w-24" />
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="px-5 md:px-8 pt-12 pb-8 max-w-lg mx-auto">
        <h1 className="text-xl font-heading mb-1">No accounts yet</h1>
        <p className="text-muted-foreground text-sm mb-6">Add your bank, cash and card accounts. Home shows your net position once they're in.</p>
        <button
          onClick={() => setShowAddAccount(true)}
          className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          <Plus size={18} /> Add account
        </button>
        <AddAccountDialog open={showAddAccount} onOpenChange={setShowAddAccount} editAccount={null} />
      </div>
    );
  }

  const net = position.net;

  return (
    <div className="px-5 md:px-8 pt-8 md:pt-6 pb-8 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-heading">Home</h1>
        <button
          onClick={() => dispatchBalanceMaskToggle(!hidden)}
          className="text-muted-foreground p-2 -mr-2 rounded-lg"
          role="switch" aria-checked={hidden} aria-label={hidden ? 'Show balances' : 'Hide balances'}
        >
          {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      {/* 1. Net position */}
      <Card>
        <p className="text-xs text-muted-foreground mb-1">Net position</p>
        <p className={`text-financial-hero tabular-nums ${net < 0 ? 'text-expense' : 'text-foreground'}`}>{mask(fmt(net))}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {mask(fmt(position.cash))} in accounts − {mask(fmt(position.owed))} owed on cards
        </p>
      </Card>

      {/* 2. Card payments due */}
      {cardDues.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-sm">Card payments</h2>
            <button onClick={() => navigate('/debt')} className="text-xs text-primary font-medium flex items-center gap-0.5">Cards <ChevronRight size={14} /></button>
          </div>
          <div className="divide-y divide-border">
            {cardDues.map(d => {
              const daysLeft = daysBetween(now, d.dueDate);
              return (
                <div key={d.account.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium truncate">{d.account.name}</p>
                    <p className={`text-xs font-medium shrink-0 ${daysLeft <= 7 ? 'text-expense' : 'text-muted-foreground'}`}>
                      {daysLeft === 0 ? 'due today' : `${daysLeft}d left`}
                    </p>
                  </div>
                  <p className="text-base font-heading tabular-nums">
                    Pay {mask(fmt(d.amountDue))} by {format(d.dueDate, 'd MMM')}
                    {d.projected && <span className="text-xs font-normal text-muted-foreground"> · estimate</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Owed {mask(fmt(d.owed))}
                    {d.newSinceStatement > 0 && <> − {mask(fmt(d.newSinceStatement))} since statement</>}
                    {d.instalmentsRemaining > 0 && <> − {mask(fmt(d.instalmentsRemaining))} in instalments</>}
                    {d.statementDate
                      ? <> · statement {d.projected ? 'closes' : 'closed'} {format(d.statementDate, 'd MMM')}</>
                      : <> · no statement day set, showing full balance</>}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 3. Left until payday */}
      <Card>
        <div className="flex items-center justify-between mb-1 gap-2">
          <p className="text-xs text-muted-foreground">Left until payday</p>
          <Select value={payday ? String(payday) : ''} onValueChange={v => setPayday(Number(v))}>
            <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs border-0 bg-muted rounded-lg" aria-label="Payday">
              <SelectValue placeholder="Set payday" />
            </SelectTrigger>
            <SelectContent className="max-h-[240px]">
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <SelectItem key={d} value={String(d)}>Payday: {ordinal(d)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {runway ? (
          <>
            <p className={`text-financial-large tabular-nums ${runway.left < 0 ? 'text-expense' : 'text-foreground'}`}>{mask(fmt(runway.left))}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {runway.left > 0
                ? <>{mask(fmt(runway.perDay))}/day for {runway.days} days to {format(runway.nextPayday, 'd MMM')}</>
                : <>Short before {format(runway.nextPayday, 'd MMM')}, with card payments covered</>}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {mask(fmt(runway.cash))} cash
              {runway.holds > 0 && <> − {mask(fmt(runway.holds))} pending</>}
              {runway.cardsDue > 0 && <> − {mask(fmt(runway.cardsDue))} card payments</>}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Set your payday to see what's free to spend.</p>
        )}
      </Card>

      {/* 4. Recent transactions */}
      {recentTx.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-heading text-sm">Recent</h2>
            <button onClick={() => navigate('/transactions')} className="text-xs text-primary font-medium flex items-center gap-0.5">All <ChevronRight size={14} /></button>
          </div>
          <div className="divide-y divide-border">
            {recentTx.map(tx => {
              const isTransfer = tx.category === 'Transfer';
              const accName = (id?: string) => accounts.find(a => a.id === id)?.name || '';
              return (
                <div key={tx.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{extractEmoji(tx.categoryIcon)}</span>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{isTransfer ? 'Transfer' : tx.merchant}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {format(parseISO(tx.date), 'd MMM')} · {isTransfer && tx.toAccountId ? `${accName(tx.accountId)} → ${accName(tx.toAccountId)}` : accName(tx.accountId)}
                        {tx.isPending && <span className="ml-1 text-warning">· pending</span>}
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-heading tabular-nums shrink-0 ${isTransfer || tx.isInternal ? 'text-muted-foreground' : tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {mask(fmtSigned(tx.amount, isTransfer ? 'transfer' : tx.type as 'income' | 'expense'))}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
