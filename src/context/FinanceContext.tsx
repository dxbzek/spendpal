import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  AccountRowSchema,
  TransactionRowSchema,
  BudgetRowSchema,
  GoalRowSchema,
  safeParseRow,
} from '@/lib/schemas';
import type { Account, Transaction, Budget, Goal } from '@/types/finance';

// ─── DB row → app type mappers (validated via Zod) ───────────────────────────

const mapAccount = (row: unknown): Account | null => {
  const r = safeParseRow(AccountRowSchema, row, 'Account');
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    balance: r.balance,
    currency: r.currency,
    icon: r.icon,
    creditLimit: r.credit_limit,
    dueDate: r.due_date,
    statementDate: r.statement_date,
  };
};

const mapTransaction = (row: unknown): Transaction | null => {
  const r = safeParseRow(TransactionRowSchema, row, 'Transaction');
  if (!r) return null;
  return {
    id: r.id,
    type: r.type,
    amount: r.amount,
    currency: r.currency,
    category: r.category,
    categoryIcon: r.category_icon,
    merchant: r.merchant,
    accountId: r.account_id,
    date: r.date,
    note: r.note,
    isRecurring: r.is_recurring,
    totalInstallments: r.total_installments ?? null,
    currentInstallment: r.current_installment ?? null,
    loanTotalAmount: r.loan_total_amount ?? null,
    isTrackingOnly: r.is_tracking_only ?? false,
  };
};

const mapBudget = (row: unknown, spentByCategory: Record<string, number> = {}): Budget | null => {
  const r = safeParseRow(BudgetRowSchema, row, 'Budget');
  if (!r) return null;
  return {
    id: r.id,
    category: r.category,
    categoryIcon: r.category_icon,
    amount: r.amount,
    spent: spentByCategory[r.category] ?? 0,
    period: r.period,
    month: r.month,
    isFixed: r.is_fixed ?? false,
  };
};

const mapGoal = (row: unknown): Goal | null => {
  const r = safeParseRow(GoalRowSchema, row, 'Goal');
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    type: r.type,
    targetAmount: r.target_amount,
    savedAmount: r.saved_amount,
    deadline: r.deadline,
    status: r.status,
  };
};

// ─── Compute budget spent from transactions ───────────────────────────────────

function computeSpentByCategory(txs: Transaction[]): Record<string, number> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExpenses = txs.filter(t => t.type === 'expense' && !t.isTrackingOnly && t.date.startsWith(currentMonth));
  const spent: Record<string, number> = {};
  for (const t of monthExpenses) {
    spent[t.category] = (spent[t.category] ?? 0) + t.amount;
  }
  return spent;
}

// ─── Context type ─────────────────────────────────────────────────────────────

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  date: string;
  merchant: string;
  note?: string | null;
}

interface FinanceContextType {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  loading: boolean;
  // Accounts
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  // Transactions
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<void>;
  addTransfer: (transfer: TransferInput) => Promise<void>;
  bulkAddTransactions: (txs: Omit<Transaction, 'id'>[]) => Promise<void>;
  bulkUpdateCategory: (ids: string[], category: string, categoryIcon: string) => Promise<void>;
  updateTransaction: (tx: Transaction) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  bulkRemoveTransactions: (ids: string[]) => Promise<void>;
  // Budgets
  addBudget: (budget: Omit<Budget, 'id' | 'spent'>) => Promise<void>;
  updateBudget: (budget: Budget) => Promise<void>;
  removeBudget: (id: string) => Promise<void>;
  bulkRemoveBudgets: (ids: string[]) => Promise<void>;
  // Goals
  addGoal: (goal: Omit<Goal, 'id'>) => Promise<void>;
  updateGoal: (goal: Goal) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  addGoalProgress: (goalId: string, amount: number) => Promise<void>;
  // Refresh
  refresh: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | null>(null);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [accRes, txRes, bgtRes, goalRes] = await Promise.all([
        supabase.from('accounts').select('*').order('created_at'),
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('budgets').select('*').order('created_at'),
        supabase.from('goals').select('*').order('created_at'),
      ]);

      if (accRes.error) throw accRes.error;
      if (txRes.error) throw txRes.error;
      if (bgtRes.error) throw bgtRes.error;
      if (goalRes.error) throw goalRes.error;

      const validAccounts = (accRes.data ?? []).map(mapAccount).filter((a): a is Account => a !== null);
      setAccounts(validAccounts);

      const validTxs = (txRes.data ?? []).map(mapTransaction).filter((t): t is Transaction => t !== null);
      setTransactions(validTxs);

      const spentByCategory = computeSpentByCategory(validTxs);
      const validBudgets = (bgtRes.data ?? []).map(row => mapBudget(row, spentByCategory)).filter((b): b is Budget => b !== null);
      setBudgets(validBudgets);

      const validGoals = (goalRes.data ?? []).map(mapGoal).filter((g): g is Goal => g !== null);
      setGoals(validGoals);
    } catch (err) {
      logger.error('Failed to fetch finance data', err);
      toast.error('Failed to load your financial data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── ACCOUNTS ─────────────────────────────────────────────────────────────

  const addAccount = useCallback(async (account: Omit<Account, 'id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      icon: account.icon,
      credit_limit: account.creditLimit ?? null,
      due_date: account.dueDate ?? null,
      statement_date: account.statementDate ?? null,
    }).select().single();
    if (error) { toast.error(`Failed to add account: ${error.message}`); return; }
    const mapped = mapAccount(data);
    if (mapped) setAccounts(prev => [...prev, mapped]);
  }, [user]);

  const updateAccount = useCallback(async (account: Account) => {
    const { error } = await supabase.from('accounts').update({
      name: account.name,
      type: account.type,
      balance: account.balance,
      icon: account.icon,
      credit_limit: account.creditLimit ?? null,
      due_date: account.dueDate ?? null,
      statement_date: account.statementDate ?? null,
    }).eq('id', account.id);
    if (error) { toast.error(`Failed to update account: ${error.message}`); return; }
    setAccounts(prev => prev.map(a => a.id === account.id ? account : a));
  }, []);

  const removeAccount = useCallback(async (id: string) => {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) { toast.error(`Failed to delete account: ${error.message}`); return; }
    setAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

  // ─── TRANSACTIONS ─────────────────────────────────────────────────────────

  const addTransaction = useCallback(async (tx: Omit<Transaction, 'id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: tx.accountId,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      category: tx.category,
      category_icon: tx.categoryIcon,
      merchant: tx.merchant,
      date: tx.date,
      note: tx.note ?? null,
      is_recurring: tx.isRecurring ?? false,
      total_installments: tx.totalInstallments ?? null,
      current_installment: tx.currentInstallment ?? null,
      loan_total_amount: tx.loanTotalAmount ?? null,
    }).select().single();
    if (error) { toast.error(`Failed to add transaction: ${error.message}`); return; }

    const mapped = mapTransaction(data);
    if (mapped) {
      setTransactions(prev => {
        const updated = [mapped, ...prev];
        setBudgets(b => {
          const spentByCategory = computeSpentByCategory(updated);
          return b.map(bgt => ({ ...bgt, spent: spentByCategory[bgt.category] ?? 0 }));
        });
        return updated;
      });
    }

    // Refresh account balance from DB (updated atomically by DB trigger)
    const { data: freshAccount } = await supabase
      .from('accounts').select('balance').eq('id', tx.accountId).single();
    if (freshAccount) {
      setAccounts(prev => prev.map(a =>
        a.id === tx.accountId ? { ...a, balance: Number(freshAccount.balance) } : a
      ));
    }
  }, [user]);

  const addTransfer = useCallback(async (transfer: TransferInput) => {
    if (!user) return;
    const rows = [
      {
        user_id: user.id,
        account_id: transfer.fromAccountId,
        type: 'expense' as const,
        amount: transfer.amount,
        currency: transfer.currency,
        category: 'Transfer',
        category_icon: '🔄',
        merchant: transfer.merchant || 'Transfer',
        date: transfer.date,
        note: transfer.note ?? null,
        is_recurring: false,
        total_installments: null,
        current_installment: null,
      },
      {
        user_id: user.id,
        account_id: transfer.toAccountId,
        type: 'income' as const,
        amount: transfer.amount,
        currency: transfer.currency,
        category: 'Transfer',
        category_icon: '🔄',
        merchant: transfer.merchant || 'Transfer',
        date: transfer.date,
        note: transfer.note ?? null,
        is_recurring: false,
        total_installments: null,
        current_installment: null,
      },
    ];
    const { data, error } = await supabase.from('transactions').insert(rows).select();
    if (error) { toast.error(`Failed to add transfer: ${error.message}`); return; }

    const mapped = (data ?? []).map(mapTransaction).filter(Boolean) as Transaction[];
    setTransactions(prev => {
      const updated = [...mapped, ...prev];
      setBudgets(b => {
        const spentByCategory = computeSpentByCategory(updated);
        return b.map(bgt => ({ ...bgt, spent: spentByCategory[bgt.category] ?? 0 }));
      });
      return updated;
    });

    // Refresh both account balances from DB (updated atomically by DB trigger)
    const accountIds = [transfer.fromAccountId, transfer.toAccountId];
    const { data: freshAccounts } = await supabase
      .from('accounts').select('id, balance').in('id', accountIds);
    if (freshAccounts) {
      setAccounts(prev => prev.map(a => {
        const fresh = freshAccounts.find(f => f.id === a.id);
        return fresh ? { ...a, balance: Number(fresh.balance) } : a;
      }));
    }
  }, [user]);

  const bulkAddTransactions = useCallback(async (txs: Omit<Transaction, 'id'>[]) => {
    if (!user || txs.length === 0) return;
    const rows = txs.map(tx => ({
      user_id: user.id,
      account_id: tx.accountId,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      category: tx.category,
      category_icon: tx.categoryIcon,
      merchant: tx.merchant,
      date: tx.date,
      note: tx.note ?? null,
      is_recurring: tx.isRecurring ?? false,
      total_installments: tx.totalInstallments ?? null,
      current_installment: tx.currentInstallment ?? null,
      loan_total_amount: tx.loanTotalAmount ?? null,
    }));
    const { data, error } = await supabase.from('transactions').insert(rows).select();
    if (error) { toast.error(`Failed to import transactions: ${error.message}`); return; }
    const mapped = (data ?? []).map(mapTransaction).filter(Boolean) as Transaction[];
    setTransactions(prev => {
      const updated = [...mapped, ...prev];
      setBudgets(b => {
        const spentByCategory = computeSpentByCategory(updated);
        return b.map(bgt => ({ ...bgt, spent: spentByCategory[bgt.category] ?? 0 }));
      });
      return updated;
    });
  }, [user]);

  const updateTransaction = useCallback(async (tx: Transaction) => {
    const { error } = await supabase.from('transactions').update({
      account_id: tx.accountId,
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      category_icon: tx.categoryIcon,
      merchant: tx.merchant,
      date: tx.date,
      note: tx.note ?? null,
      is_recurring: tx.isRecurring ?? false,
      total_installments: tx.totalInstallments ?? null,
      current_installment: tx.currentInstallment ?? null,
      loan_total_amount: tx.loanTotalAmount ?? null,
    }).eq('id', tx.id);
    if (error) { toast.error(`Failed to update transaction: ${error.message}`); return; }
    setTransactions(prev => {
      const updated = prev.map(t => t.id === tx.id ? tx : t);
      setBudgets(b => {
        const spentByCategory = computeSpentByCategory(updated);
        return b.map(bgt => ({ ...bgt, spent: spentByCategory[bgt.category] ?? 0 }));
      });
      return updated;
    });
  }, []);

  const removeTransaction = useCallback(async (id: string) => {
    const tx = transactions.find(t => t.id === id);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) { toast.error(`Failed to delete transaction: ${error.message}`); return; }

    setTransactions(prev => {
      const updated = prev.filter(t => t.id !== id);
      setBudgets(b => {
        const spentByCategory = computeSpentByCategory(updated);
        return b.map(bgt => ({ ...bgt, spent: spentByCategory[bgt.category] ?? 0 }));
      });
      return updated;
    });

    // Refresh account balance from DB (updated atomically by DB trigger)
    if (tx) {
      const { data: freshAccount } = await supabase
        .from('accounts').select('balance').eq('id', tx.accountId).single();
      if (freshAccount) {
        setAccounts(prev => prev.map(a =>
          a.id === tx.accountId ? { ...a, balance: Number(freshAccount.balance) } : a
        ));
      }
    }
  }, [transactions]);

  const bulkRemoveTransactions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    // Capture affected account IDs before deletion
    const affectedAccountIds = [...new Set(
      transactions.filter(t => ids.includes(t.id)).map(t => t.accountId)
    )];

    const { error } = await supabase.from('transactions').delete().in('id', ids);
    if (error) { toast.error(`Failed to delete transactions: ${error.message}`); return; }

    setTransactions(prev => {
      const updated = prev.filter(t => !ids.includes(t.id));
      setBudgets(b => {
        const spentByCategory = computeSpentByCategory(updated);
        return b.map(bgt => ({ ...bgt, spent: spentByCategory[bgt.category] ?? 0 }));
      });
      return updated;
    });

    // Refresh balances for all affected accounts (updated by DB trigger)
    if (affectedAccountIds.length > 0) {
      const { data: freshAccounts } = await supabase
        .from('accounts').select('id, balance').in('id', affectedAccountIds);
      if (freshAccounts) {
        setAccounts(prev => prev.map(a => {
          const fresh = freshAccounts.find(f => f.id === a.id);
          return fresh ? { ...a, balance: Number(fresh.balance) } : a;
        }));
      }
    }
  }, [transactions]);

  const bulkUpdateCategory = useCallback(async (ids: string[], category: string, categoryIcon: string) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('transactions')
      .update({ category, category_icon: categoryIcon })
      .in('id', ids);
    if (error) { toast.error(`Failed to update categories: ${error.message}`); return; }
    setTransactions(prev => {
      const updated = prev.map(t =>
        ids.includes(t.id) ? { ...t, category, categoryIcon } : t
      );
      setBudgets(b => {
        const spentByCategory = computeSpentByCategory(updated);
        return b.map(bgt => ({ ...bgt, spent: spentByCategory[bgt.category] ?? 0 }));
      });
      return updated;
    });
  }, []);

  // ─── BUDGETS ──────────────────────────────────────────────────────────────

  const addBudget = useCallback(async (budget: Omit<Budget, 'id' | 'spent'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('budgets').insert({
      user_id: user.id,
      category: budget.category,
      category_icon: budget.categoryIcon,
      amount: budget.amount,
      period: budget.period,
      month: budget.month,
      is_fixed: budget.isFixed ?? false,
    }).select().single();
    if (error) { toast.error(`Failed to add budget: ${error.message}`); return; }
    const spentByCategory = computeSpentByCategory(transactions);
    const mapped = mapBudget(data, spentByCategory);
    if (mapped) setBudgets(prev => [...prev, mapped]);
  }, [user, transactions]);

  const updateBudget = useCallback(async (budget: Budget) => {
    const { error } = await supabase.from('budgets').update({
      category: budget.category,
      category_icon: budget.categoryIcon,
      amount: budget.amount,
      period: budget.period,
      is_fixed: budget.isFixed ?? false,
    }).eq('id', budget.id);
    if (error) { toast.error(`Failed to update budget: ${error.message}`); return; }
    setBudgets(prev => prev.map(b => b.id === budget.id ? budget : b));
  }, []);

  const removeBudget = useCallback(async (id: string) => {
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (error) { toast.error(`Failed to delete budget: ${error.message}`); return; }
    setBudgets(prev => prev.filter(b => b.id !== id));
  }, []);

  const bulkRemoveBudgets = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase.from('budgets').delete().in('id', ids);
    if (error) { toast.error(`Failed to delete budgets: ${error.message}`); return; }
    setBudgets(prev => prev.filter(b => !ids.includes(b.id)));
  }, []);

  // ─── GOALS ────────────────────────────────────────────────────────────────

  const addGoal = useCallback(async (goal: Omit<Goal, 'id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('goals').insert({
      user_id: user.id,
      name: goal.name,
      icon: goal.icon,
      type: goal.type,
      target_amount: goal.targetAmount,
      saved_amount: goal.savedAmount,
      deadline: goal.deadline ?? null,
      status: goal.status,
    }).select().single();
    if (error) { toast.error(`Failed to add goal: ${error.message}`); return; }
    const mapped = mapGoal(data);
    if (mapped) setGoals(prev => [...prev, mapped]);
  }, [user]);

  const updateGoal = useCallback(async (goal: Goal) => {
    const { error } = await supabase.from('goals').update({
      name: goal.name,
      icon: goal.icon,
      type: goal.type,
      target_amount: goal.targetAmount,
      saved_amount: goal.savedAmount,
      deadline: goal.deadline ?? null,
      status: goal.status,
    }).eq('id', goal.id);
    if (error) { toast.error(`Failed to update goal: ${error.message}`); return; }
    setGoals(prev => prev.map(g => g.id === goal.id ? goal : g));
  }, []);

  const removeGoal = useCallback(async (id: string) => {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) { toast.error(`Failed to delete goal: ${error.message}`); return; }
    setGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const addGoalProgress = useCallback(async (goalId: string, amount: number) => {
    if (amount <= 0) { toast.error('Progress amount must be greater than zero'); return; }
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const newSaved = goal.savedAmount + amount;
    const isNowComplete = newSaved >= goal.targetAmount;
    const updates: Record<string, unknown> = { saved_amount: newSaved };
    if (isNowComplete) updates.status = 'completed';
    const { error } = await supabase.from('goals').update(updates).eq('id', goalId);
    if (error) { toast.error(`Failed to update goal progress: ${error.message}`); return; }
    setGoals(prev => prev.map(g =>
      g.id === goalId ? { ...g, savedAmount: newSaved, status: isNowComplete ? 'completed' : g.status } : g
    ));
    if (isNowComplete) toast.success(`🎉 Goal "${goal.name}" completed!`);
  }, [goals]);

  const contextValue = useMemo(() => ({
    accounts, transactions, budgets, goals, loading,
    addAccount, updateAccount, removeAccount,
    addTransaction, addTransfer, bulkAddTransactions, bulkUpdateCategory, updateTransaction, removeTransaction, bulkRemoveTransactions,
    addBudget, updateBudget, removeBudget, bulkRemoveBudgets,
    addGoal, updateGoal, removeGoal, addGoalProgress,
    refresh: fetchAll,
  }), [
    accounts, transactions, budgets, goals, loading,
    addAccount, updateAccount, removeAccount,
    addTransaction, addTransfer, bulkAddTransactions, bulkUpdateCategory, updateTransaction, removeTransaction, bulkRemoveTransactions,
    addBudget, updateBudget, removeBudget, bulkRemoveBudgets,
    addGoal, updateGoal, removeGoal, addGoalProgress,
    fetchAll,
  ]);

  return (
    <FinanceContext.Provider value={contextValue}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
};
