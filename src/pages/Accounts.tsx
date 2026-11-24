import GlossaryLink from '@/components/GlossaryLink';
import { PageSpinner } from '@/components/ui/spinner';
import { NARROW_PAGE } from '@/lib/pageLayout';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { type Account } from '@/types/finance';
import { creditUtilization } from '@/lib/finance/credit';
import { isCountableExpense } from '@/lib/finance/transactionFilters';
import { pendingHolds as holdsByAccount } from '@/lib/finance/cardPayments';
import AddAccountDialog from '@/components/forms/AddAccountDialog';
import ReconcileDialog from '@/components/forms/ReconcileDialog';
import { Wallet, Pencil, Trash2, Plus, ChevronDown, Scale } from 'lucide-react';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { projectBalance } from '@/lib/finance/balanceProjection';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AppIcon from '@/components/AppIcon';
import { ACCOUNT_TYPE_NAMES } from '@/lib/pageNames';
import { BigAmount, HeroCard, HeroChip, IconButton, Meter, PageHeader, SectionAction, SectionLabel, Tile } from '@/components/orbix';

/** A small pill action inside an opened account row (Reconcile / Edit / Delete). */
const RowAction = ({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={`h-9 px-3 rounded-full bg-muted text-xs font-medium flex items-center gap-1.5 hover:bg-accent transition-colors ${className ?? 'text-foreground'}`}
    {...props}
  >
    {children}
  </button>
);

const Accounts = () => {
  const { accounts, transactions, removeAccount, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();

  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reconcileAccount, setReconcileAccount] = useState<Account | null>(null);
  const navigate = useNavigate();
  const { scheduleDelete, isPending } = useUndoableDelete({ deleteOne: removeAccount });

  // The two halves of net worth; the hero shows both beside the total.
  const { assets, liabilities, netWorth } = useMemo(() => {
    const assets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
    // balance IS the amount owed for credit accounts (see Account type).
    const liabilities = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + a.balance, 0);
    return { assets, liabilities, netWorth: assets - liabilities };
  }, [accounts]);

  const accountStats = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = `${thisMonth}-${String(now.getDate()).padStart(2, '0')}`;
    const stats: Record<string, { income: number; expenses: number }> = {};
    transactions.forEach(tx => {
      if (tx.date.slice(0, 7) !== thisMonth) return;
      if (tx.date > today) return; // skip future-dated transactions
      if (!stats[tx.accountId]) stats[tx.accountId] = { income: 0, expenses: 0 };
      if (tx.type === 'income' && !tx.isInternal) stats[tx.accountId].income += tx.amount;
      else if (isCountableExpense(tx)) stats[tx.accountId].expenses += tx.amount;
    });
    return stats;
  }, [transactions]);

  // Pending expense holds per account — not yet posted, but they reduce what's
  // actually available to spend even though the settled balance doesn't reflect them yet.
  // The same helper Home's cash figures use, so "Available" here and
  // "Spendable Cash" there subtract the same holds.
  const pendingHolds = useMemo(() => holdsByAccount(transactions), [transactions]);

  // Balance projection: cash and debit balances 30 days forward, each running
  // bill and recurring income counted once (see balanceProjection.ts).
  const balanceProjection = useMemo(() => {
    const projection = projectBalance(accounts, transactions, new Date());
    if (!projection) return null;
    const { points, startBalance } = projection;
    // Build SVG path
    const vals = points.map(p => p.balance);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const W = 100, H = 36;
    const pts = points.map(p => {
      const x = (p.day / 30) * W;
      const y = H - ((p.balance - min) / range) * H;
      return `${x},${y}`;
    }).join(' ');
    return { pts, startBalance, endBalance: projection.endBalance, change: projection.change };
  }, [accounts, transactions]);

  const handleDelete = () => {
    if (!deleteId) return;
    const acct = accounts.find(a => a.id === deleteId);
    scheduleDelete([deleteId], `${acct?.name ?? 'Account'} deleted`);
    setDeleteId(null);
  };

  // Hide accounts that are pending deletion so they disappear immediately
  // (the Undo toast restores them within the window).
  const visibleAccounts = accounts.filter(a => !isPending(a.id));

  // Stats for the delete-confirmation copy.
  const deleteAccount = deleteId ? accounts.find(a => a.id === deleteId) : null;
  const deleteTxs = deleteId ? transactions.filter(t => t.accountId === deleteId) : [];
  const deleteTxCount = deleteTxs.length;
  const deleteTxSpend = deleteTxs
    .filter(isCountableExpense)
    .reduce((s, t) => s + t.amount, 0);

  if (loading) return <PageSpinner />;

  // Whole units in the narrow hero chips, as Home does.
  const fmtCompact = (n: number) => fmt(Math.round(n)).replace(/[.,]00(?=\D*$)/, '');
  /** An amount with small cents, or the mask when balances are hidden. */
  const amount = (n: number) => (hidden ? mask(fmt(n)) : <BigAmount text={fmt(n)} />);

  return (
    <div className={`${NARROW_PAGE} pb-8`}>
      <PageHeader
        title="Accounts"
        actions={
          <IconButton tone="primary" onClick={() => setAddOpen(true)} aria-label="Add account" title="Add account">
            <Plus size={20} />
          </IconButton>
        }
      />

      {/* Hero: net worth, then what you have, what you owe, how many accounts */}
      <HeroCard>
        <p className="text-sm opacity-70 flex items-center gap-1">Net worth <GlossaryLink term="Total Net Worth" /></p>
        <p className="mt-1 text-[2.5rem] leading-none font-medium tracking-tight tabular-nums">
          {netWorth < 0 ? '-' : ''}{amount(Math.abs(netWorth))}
        </p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <HeroChip label="Cash" value={mask(fmtCompact(assets))} />
          <HeroChip label="Owed" value={mask(fmtCompact(liabilities))} />
          <HeroChip dark label="Accounts" value={visibleAccounts.length} />
        </div>
      </HeroCard>

      {/* Accounts: one list card, a row per account; tap a row to open it */}
      <div className="mt-6">
        <SectionLabel label="Accounts" count={visibleAccounts.length} />
        {visibleAccounts.length === 0 ? (
          <Tile className="text-center py-14 text-muted-foreground">
            <span className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Wallet size={24} className="opacity-60" />
            </span>
            <p className="font-medium">No accounts yet</p>
          </Tile>
        ) : (
          <div className="bg-card rounded-3xl px-4 divide-y divide-border">
            {visibleAccounts.map(account => {
              const stats = accountStats[account.id] || { income: 0, expenses: 0 };
              // Clamped 0–100 (or null for no-limit) via the shared helper so the
              // displayed percentage can't read e.g. "134%" while every other page
              // caps the same account at 100%.
              const utilization = creditUtilization(account);
              const hold = pendingHolds[account.id] ?? 0;
              const isOpen = expandedId === account.id;
              const isCredit = account.type === 'credit';
              const available = isCredit
                ? (account.creditLimit != null ? account.creditLimit - account.balance - hold : null)
                : (hold ? account.balance - hold : null);
              const subParts = [
                ACCOUNT_TYPE_NAMES[account.type],
                account.excludeFromSpendable ? 'Savings' : null,
                hold ? `${mask(fmt(hold))} pending` : null,
              ].filter(Boolean).join(' · ');

              return (
                <div key={account.id} className="py-3.5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : account.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    <span className="w-11 h-11 shrink-0 rounded-full bg-muted flex items-center justify-center text-[18px]">
                      <AppIcon value={account.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium line-clamp-2 break-words">{account.name}</span>
                      <span className="block text-xs text-muted-foreground truncate mt-0.5">{subParts}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-[15px] font-medium tabular-nums tracking-tight ${isCredit && account.balance > 0 ? 'text-expense' : ''}`}>
                        {amount(account.balance)}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {available != null ? <>Available {mask(fmt(available))}</> : isCredit ? 'Owed' : 'Balance'}
                      </span>
                    </span>
                    <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Credit utilization: thin bar under the row */}
                  {utilization !== null && (
                    <div className="mt-3 pl-14 flex items-center gap-3">
                      <Meter
                        value={utilization}
                        className="flex-1 h-1"
                        barClassName={utilization > 75 ? 'bg-expense' : utilization > 30 ? 'bg-warning' : 'bg-primary'}
                        label={`${account.name} used`}
                      />
                      <span className={`text-xs font-medium tabular-nums ${utilization > 75 ? 'text-expense' : utilization > 30 ? 'text-warning' : 'text-primary'}`}>
                        {Math.round(utilization)}% used
                      </span>
                    </div>
                  )}

                  {/* Opened: this month, actions, recent transactions */}
                  {isOpen && (() => {
                    const acctTxs = transactions
                      .filter(tx => tx.accountId === account.id)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 10);
                    return (
                      <div className="mt-3 pl-14 space-y-3">
                        {(stats.income > 0 || stats.expenses > 0) && (
                          <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
                            {stats.income > 0 && <span>In <span className="font-medium text-income">{mask(fmt(stats.income))}</span></span>}
                            {stats.expenses > 0 && <span>Out <span className="font-medium text-expense">{mask(fmt(stats.expenses))}</span></span>}
                            <span>this month</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <RowAction
                            onClick={() => setReconcileAccount(account)}
                            aria-label="Reconcile account"
                            title="Reconcile with your bank/card's actual balance"
                          >
                            <Scale size={14} /> Reconcile
                          </RowAction>
                          <RowAction onClick={() => { setEditAccount(account); setAddOpen(true); }} aria-label="Edit account">
                            <Pencil size={14} /> Edit
                          </RowAction>
                          <RowAction
                            onClick={() => setDeleteId(account.id)}
                            aria-label="Delete account"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={14} />
                          </RowAction>
                        </div>
                        {acctTxs.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">No transactions yet</p>
                        ) : (
                          <div>
                            <div className="divide-y divide-border">
                              {acctTxs.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between gap-3 py-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-sm">
                                      <AppIcon value={tx.categoryIcon} />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm truncate">{tx.merchant}</p>
                                      <p className="text-[11px] text-muted-foreground">{format(parseISO(tx.date), 'MMM d, yyyy')}</p>
                                    </div>
                                  </div>
                                  <span className={`text-sm font-medium tabular-nums shrink-0 ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                                    {tx.type === 'income' ? '+' : '-'}{mask(fmt(tx.amount))}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end pt-1">
                              <SectionAction onClick={() => navigate('/transactions')}>See all</SectionAction>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Balance Projection */}
      {balanceProjection && (
        <div className="mt-6">
          <SectionLabel label="Next 30 days" />
          <Tile className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-2xl font-medium tracking-tight tabular-nums">{amount(balanceProjection.endBalance)}</p>
              <span className={`text-sm font-medium tabular-nums ${balanceProjection.change >= 0 ? 'text-income' : 'text-expense'}`}>
                {hidden ? '••••••' : `${balanceProjection.change >= 0 ? '+' : ''}${fmt(balanceProjection.change)}`}
              </span>
            </div>
            <svg viewBox="0 0 100 36" className="w-full h-14" preserveAspectRatio="none">
              <defs>
                <linearGradient id="proj-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline points={balanceProjection.pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <polygon points={`0,36 ${balanceProjection.pts} 100,36`} fill="url(#proj-grad)" />
            </svg>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Today: {mask(fmt(balanceProjection.startBalance))}</span>
              <span>+30d: {mask(fmt(balanceProjection.endBalance))}</span>
            </div>
          </Tile>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <AddAccountDialog
        open={addOpen}
        onOpenChange={o => { setAddOpen(o); if (!o) setEditAccount(null); }}
        editAccount={editAccount}
      />

      {/* Reconcile Dialog */}
      <ReconcileDialog
        open={!!reconcileAccount}
        onOpenChange={o => { if (!o) setReconcileAccount(null); }}
        account={reconcileAccount}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteAccount?.name ?? 'account'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTxCount > 0 ? (
                <>
                  Deletes the account and its {deleteTxCount} transaction{deleteTxCount !== 1 ? 's' : ''}
                  {deleteTxSpend > 0 ? <> ({fmt(deleteTxSpend)} spent)</> : null}. You can undo for a few seconds.
                </>
              ) : (
                <>Deletes the account. It has no transactions. You can undo for a few seconds.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:brightness-95"
            >
              Delete {deleteAccount?.name ?? 'account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Accounts;
