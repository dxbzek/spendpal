export type AccountType = 'cash' | 'debit' | 'credit';
export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  icon: string;
  creditLimit?: number;
  dueDate?: number; // day of month
  statementDate?: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  category: string;
  categoryIcon: string;
  merchant: string;
  accountId: string;
  date: string; // ISO
  note?: string;
  isRecurring?: boolean;
  totalInstallments?: number | null;
  currentInstallment?: number | null;
}

export interface Budget {
  id: string;
  category: string;
  categoryIcon: string;
  amount: number;
  spent: number;
  period: 'monthly' | 'weekly';
  month: string; // YYYY-MM
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  type: string;
  targetAmount: number;
  savedAmount: number;
  deadline?: string;
  status: 'active' | 'completed' | 'paused';
}

export const CATEGORIES = [
  { name: 'Coffee', icon: '☕' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Dining', icon: '🍽️' },
  { name: 'Telecom', icon: '📱' },
  { name: 'Metro/Taxi', icon: '🚇' },
  { name: 'Travel', icon: '✈️' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Charity', icon: '🤲' },
  { name: 'Delivery', icon: '📦' },
  { name: 'DEWA', icon: '💡' },
  { name: 'Rent', icon: '🏠' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Health', icon: '🏥' },
  { name: 'Education', icon: '📚' },
  { name: 'Subscriptions', icon: '🔄' },
  { name: 'Salary', icon: '💰' },
  { name: 'Freelance', icon: '💻' },
  { name: 'Transfer', icon: '🔁' },
  { name: 'Other', icon: '📌' },
] as const;

export const TRANSFER_CATEGORIES = [
  { name: 'Card Payment', icon: '💳' },
  { name: 'Family', icon: '👨‍👩‍👧' },
  { name: 'Allowance', icon: '🤝' },
  { name: 'Gift', icon: '🎁' },
  { name: 'Loan', icon: '🏦' },
  { name: 'Repayment', icon: '💸' },
  { name: 'Savings', icon: '🐖' },
  { name: 'Investment', icon: '📈' },
  { name: 'Personal', icon: '👤' },
  { name: 'Other Transfer', icon: '🔁' },
] as const;

export const ACCOUNT_ICONS: Record<AccountType, string> = {
  cash: '💵',
  debit: '💳',
  credit: '🏦',
};
