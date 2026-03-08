import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Account, Transaction, Budget, Goal } from '@/types/finance';

// Map DB rows to app types
const mapAccount = (row: any): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  balance: Number(row.balance),
  currency: row.currency,
  icon: row.icon,
  creditLimit: row.credit_limit ? Number(row.credit_limit) : undefined,
  dueDate: row.due_date ?? undefined,
  statementDate: row.statement_date ?? undefined,
});

const mapTransaction = (row: any): Transaction => ({
  id: row.id,
  type: row.type,
  amount: Number(row.amount),
  currency: row.currency,
  category: row.category,
  categoryIcon: row.category_icon,
  merchant: row.merchant,
  accountId: row.account_id,
  date: row.date,
  note: row.note ?? undefined,
  isRecurring: row.is_recurring,
  totalInstallments: row.total_installments ?? null,
  currentInstallment: row.current_installment ?? null,
});

const mapBudget = (row: any): Budget => ({
  id: row.id,
  category: row.category,
  categoryIcon: row.category_icon,
  amount: Number(row.amount),
  spent: 0, // computed from transactions
  period: row.period as 'monthly' | 'weekly',
  month: row.month,
});

const mapGoal = (row: any): Goal => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  type: row.type,
  targetAmount: Number(row.target_amount),
  savedAmount: Number(row.saved_amount),
  deadline: row.deadline ?? undefined,
  status: row.status as 'active' | 'completed' | 'paused',
});

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
  addTransaction: (tx: Omit<Transaction, 'id'>, options?: { skipBalanceUpdate?: boolean }) => Promise<void>;
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

      if (accRes.data) setAccounts(accRes.data.map(mapAccount));
      if (txRes.data) {
        const txs = txRes.data.map(mapTransaction);
        setTransactions(txs);

        // Compute budget spent from transactions
        if (bgtRes.data) {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const monthTxs = txs.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth));
          const spentByCategory: Record<string, number> = {};
          monthTxs.forEach(t => {
            spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
          });
          setBudgets(bgtRes.data.map(row => ({
            ...mapBudget(row),
            spent: spentByCategory[row.category] || 0,
          })));
        }
      } else if (bgtRes.data) {
        setBudgets(bgtRes.data.map(mapBudget));
      }
      if (goalRes.data) setGoals(goalRes.data.map(mapGoal));
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // --- ACCOUNTS ---
  const addAccount = useCallback(async (account: Omit<Account, 'id'>) => {
    if (!user) return;
    const { error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      icon: account.icon,
      credit_limit: account.creditLimit ?? null,
      due_date: account.dueDate ?? null,
      statement_date: account.statementDate ?? null,
    });
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [user, fetchAll]);

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
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const removeAccount = useCallback(async (id: string) => {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  // --- TRANSACTIONS ---
  const addTransaction = useCallback(async (tx: Omit<Transaction, 'id'>, options?: { skipBalanceUpdate?: boolean }) => {
    if (!user) return;
    const { error } = await supabase.from('transactions').insert({
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
    });
    if (error) { toast.error(error.message); return; }
    // Update account balance (skip for imported historical transactions)
    if (!options?.skipBalanceUpdate) {
      const account = accounts.find(a => a.id === tx.accountId);
      if (account) {
        const isCreditCard = account.type === 'credit';
        // Credit cards: balance = available limit. Expense decreases available, income (payment) increases it.
        // Regular accounts: expenses decrease balance, income increases it
        let newBalance: number;
        if (isCreditCard) {
          newBalance = tx.type === 'income' ? account.balance + tx.amount : account.balance - tx.amount;
        } else {
          newBalance = tx.type === 'income' ? account.balance + tx.amount : account.balance - tx.amount;
        }
        await supabase.from('accounts').update({ balance: newBalance }).eq('id', tx.accountId);
      }
    }
    await fetchAll();
  }, [user, accounts, fetchAll]);

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
    }).eq('id', tx.id);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const removeTransaction = useCallback(async (id: string) => {
    // Find the transaction to reverse its balance impact
    const tx = transactions.find(t => t.id === id);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    // Reverse balance adjustment
    if (tx) {
      const account = accounts.find(a => a.id === tx.accountId);
      if (account) {
        const isCreditCard = account.type === 'credit';
        // Reverse: for credit cards (balance=available), expense had decreased it, income had increased it
        let newBalance: number;
        if (isCreditCard) {
          newBalance = tx.type === 'income' ? account.balance - tx.amount : account.balance + tx.amount;
        } else {
          newBalance = tx.type === 'income' ? account.balance - tx.amount : account.balance + tx.amount;
        }
        await supabase.from('accounts').update({ balance: newBalance }).eq('id', tx.accountId);
      }
    }
    await fetchAll();
  }, [transactions, accounts, fetchAll]);

  // --- BUDGETS ---
  const addBudget = useCallback(async (budget: Omit<Budget, 'id' | 'spent'>) => {
    if (!user) return;
    const { error } = await supabase.from('budgets').insert({
      user_id: user.id,
      category: budget.category,
      category_icon: budget.categoryIcon,
      amount: budget.amount,
      period: budget.period,
      month: budget.month,
    });
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [user, fetchAll]);

  const updateBudget = useCallback(async (budget: Budget) => {
    const { error } = await supabase.from('budgets').update({
      category: budget.category,
      category_icon: budget.categoryIcon,
      amount: budget.amount,
      period: budget.period,
    }).eq('id', budget.id);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const removeBudget = useCallback(async (id: string) => {
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const bulkRemoveTransactions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase.from('transactions').delete().in('id', ids);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const bulkRemoveBudgets = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase.from('budgets').delete().in('id', ids);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  // --- GOALS ---
  const addGoal = useCallback(async (goal: Omit<Goal, 'id'>) => {
    if (!user) return;
    const { error } = await supabase.from('goals').insert({
      user_id: user.id,
      name: goal.name,
      icon: goal.icon,
      type: goal.type,
      target_amount: goal.targetAmount,
      saved_amount: goal.savedAmount,
      deadline: goal.deadline ?? null,
      status: goal.status,
    });
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [user, fetchAll]);

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
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const removeGoal = useCallback(async (id: string) => {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const addGoalProgress = useCallback(async (goalId: string, amount: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const { error } = await supabase.from('goals').update({
      saved_amount: goal.savedAmount + amount,
    }).eq('id', goalId);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [goals, fetchAll]);

  return (
    <FinanceContext.Provider value={{
      accounts, transactions, budgets, goals, loading,
      addAccount, updateAccount, removeAccount,
      addTransaction, updateTransaction, removeTransaction,
      addBudget, updateBudget, removeBudget,
      addGoal, updateGoal, removeGoal, addGoalProgress,
      refresh: fetchAll,
    }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
};
