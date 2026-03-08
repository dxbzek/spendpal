import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Account, Transaction, Budget, Goal } from '@/types/finance';

interface FinanceState {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
}

interface FinanceContextType extends FinanceState {
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  addTransaction: (transaction: Transaction) => void;
  removeTransaction: (id: string) => void;
  addBudget: (budget: Budget) => void;
  updateBudget: (budget: Budget) => void;
  removeBudget: (id: string) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (goal: Goal) => void;
  removeGoal: (id: string) => void;
  addGoalProgress: (goalId: string, amount: number) => void;
}

const FinanceContext = createContext<FinanceContextType | null>(null);

const STORAGE_KEY = 'spendpal_data';

const loadData = (): FinanceState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { accounts: [], transactions: [], budgets: [], goals: [] };
};

const saveData = (state: FinanceState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

// Sample data for demo
const SAMPLE_DATA: FinanceState = {
  accounts: [
    { id: 'acc-1', name: 'Cash Wallet', type: 'cash', balance: 1250, currency: 'AED', icon: '💵' },
    { id: 'acc-2', name: 'Emirates NBD', type: 'debit', balance: 8420.50, currency: 'AED', icon: '💳' },
    { id: 'acc-3', name: 'Share Platinum Visa', type: 'credit', balance: -4896.22, currency: 'AED', icon: '🏦', creditLimit: 20000, dueDate: 6 },
  ],
  transactions: [
    { id: 'tx-1', type: 'expense', amount: 45, currency: 'AED', category: 'Coffee', categoryIcon: '☕', merchant: 'Starbucks', accountId: 'acc-2', date: '2026-03-07' },
    { id: 'tx-2', type: 'expense', amount: 320, currency: 'AED', category: 'Groceries', categoryIcon: '🛒', merchant: 'Carrefour', accountId: 'acc-2', date: '2026-03-06' },
    { id: 'tx-3', type: 'income', amount: 12000, currency: 'AED', category: 'Salary', categoryIcon: '💰', merchant: 'Employer', accountId: 'acc-2', date: '2026-03-01' },
    { id: 'tx-4', type: 'expense', amount: 150, currency: 'AED', category: 'Dining', categoryIcon: '🍽️', merchant: 'Zuma Dubai', accountId: 'acc-3', date: '2026-03-05' },
    { id: 'tx-5', type: 'expense', amount: 89, currency: 'AED', category: 'Telecom', categoryIcon: '📱', merchant: 'DU', accountId: 'acc-2', date: '2026-03-04', isRecurring: true },
    { id: 'tx-6', type: 'expense', amount: 52, currency: 'AED', category: 'Subscriptions', categoryIcon: '🔄', merchant: 'Apple Subscriptions', accountId: 'acc-3', date: '2026-03-03', isRecurring: true },
    { id: 'tx-7', type: 'expense', amount: 1300, currency: 'AED', category: 'Rent', categoryIcon: '🏠', merchant: 'Landlord', accountId: 'acc-2', date: '2026-03-01', isRecurring: true },
    { id: 'tx-8', type: 'expense', amount: 200, currency: 'AED', category: 'Transport', categoryIcon: '🚗', merchant: 'RTA Salik', accountId: 'acc-2', date: '2026-03-02' },
  ],
  budgets: [
    { id: 'bgt-1', category: 'Rent', categoryIcon: '🏠', amount: 2500, spent: 1300, period: 'monthly', month: '2026-03' },
    { id: 'bgt-2', category: 'Dining', categoryIcon: '🍽️', amount: 1500, spent: 150, period: 'monthly', month: '2026-03' },
    { id: 'bgt-3', category: 'Groceries', categoryIcon: '🛒', amount: 2000, spent: 320, period: 'monthly', month: '2026-03' },
    { id: 'bgt-4', category: 'Transport', categoryIcon: '🚗', amount: 800, spent: 200, period: 'monthly', month: '2026-03' },
  ],
  goals: [
    { id: 'goal-1', name: 'Emergency Fund', icon: '🛡️', type: 'Emergency', targetAmount: 10000, savedAmount: 0, status: 'active' },
    { id: 'goal-2', name: 'Vacation to Maldives', icon: '🏝️', type: 'Vacation', targetAmount: 8000, savedAmount: 2400, status: 'active' },
  ],
};

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<FinanceState>(() => {
    const saved = loadData();
    if (saved.accounts.length === 0) return SAMPLE_DATA;
    return saved;
  });

  useEffect(() => { saveData(state); }, [state]);

  const addAccount = useCallback((account: Account) => setState(s => ({ ...s, accounts: [...s.accounts, account] })), []);
  const removeAccount = useCallback((id: string) => setState(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== id) })), []);

  const addTransaction = useCallback((tx: Transaction) => setState(s => {
    const accounts = s.accounts.map(a => {
      if (a.id === tx.accountId) {
        return { ...a, balance: tx.type === 'income' ? a.balance + tx.amount : a.balance - tx.amount };
      }
      return a;
    });
    // Update budget spent
    const budgets = s.budgets.map(b => {
      if (b.category === tx.category && tx.type === 'expense') {
        return { ...b, spent: b.spent + tx.amount };
      }
      return b;
    });
    return { ...s, transactions: [tx, ...s.transactions], accounts, budgets };
  }), []);

  const removeTransaction = useCallback((id: string) => setState(s => ({ ...s, transactions: s.transactions.filter(t => t.id !== id) })), []);

  const addBudget = useCallback((budget: Budget) => setState(s => ({ ...s, budgets: [...s.budgets, budget] })), []);
  const updateBudget = useCallback((budget: Budget) => setState(s => ({ ...s, budgets: s.budgets.map(b => b.id === budget.id ? budget : b) })), []);
  const removeBudget = useCallback((id: string) => setState(s => ({ ...s, budgets: s.budgets.filter(b => b.id !== id) })), []);

  const addGoal = useCallback((goal: Goal) => setState(s => ({ ...s, goals: [...s.goals, goal] })), []);
  const updateGoal = useCallback((goal: Goal) => setState(s => ({ ...s, goals: s.goals.map(g => g.id === goal.id ? goal : g) })), []);
  const removeGoal = useCallback((id: string) => setState(s => ({ ...s, goals: s.goals.filter(g => g.id !== id) })), []);
  const addGoalProgress = useCallback((goalId: string, amount: number) => setState(s => ({
    ...s,
    goals: s.goals.map(g => g.id === goalId ? { ...g, savedAmount: g.savedAmount + amount } : g),
  })), []);

  return (
    <FinanceContext.Provider value={{
      ...state, addAccount, removeAccount, addTransaction, removeTransaction,
      addBudget, updateBudget, removeBudget, addGoal, updateGoal, removeGoal, addGoalProgress,
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
