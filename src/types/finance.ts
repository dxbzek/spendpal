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
  loanTotalAmount?: number | null;
  isTrackingOnly?: boolean;
}

export interface Budget {
  id: string;
  category: string;
  categoryIcon: string;
  amount: number;
  spent: number;
  period: 'monthly' | 'weekly';
  month: string; // YYYY-MM
  isFixed?: boolean;
}

export const FIXED_EXPENSE_CATEGORIES = new Set(['Rent', 'DEWA', 'Utilities', 'Insurance', 'Telecom', 'Subscriptions', 'Loans']);

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

export const EXPENSE_CATEGORIES = [
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
  { name: 'Loans', icon: '🏦' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Health', icon: '🏥' },
  { name: 'Education', icon: '📚' },
  { name: 'Subscriptions', icon: '🔄' },
  { name: 'Utilities', icon: '🔌' },
  { name: 'Insurance', icon: '🛡️' },
  { name: 'Fitness', icon: '🏋️' },
  { name: 'Personal Care', icon: '💆' },
  { name: 'Other', icon: '📌' },
] as const;

export const INCOME_CATEGORIES = [
  { name: 'Salary', icon: '💰' },
  { name: 'Freelance', icon: '💻' },
  { name: 'Gift', icon: '🎁' },
  { name: 'Bonus', icon: '🎉' },
  { name: 'Investment', icon: '📈' },
  { name: 'Business', icon: '🏢' },
  { name: 'Rental Income', icon: '🏡' },
  { name: 'Refund', icon: '💵' },
  { name: 'Other', icon: '📌' },
] as const;

// Full union kept for backward compatibility (e.g. budget dialog, category manager)
export const CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  { name: 'Salary', icon: '💰' },
  { name: 'Freelance', icon: '💻' },
  { name: 'Gift', icon: '🎁' },
  { name: 'Bonus', icon: '🎉' },
  { name: 'Investment', icon: '📈' },
  { name: 'Business', icon: '🏢' },
  { name: 'Rental Income', icon: '🏡' },
  { name: 'Refund', icon: '💵' },
  { name: 'Transfer', icon: '🔁' },
] as const;

export function getCategoriesForType(type: TransactionType) {
  if (type === 'income') return INCOME_CATEGORIES;
  return EXPENSE_CATEGORIES;
}




export const ACCOUNT_ICONS: Record<AccountType, string> = {
  cash: '💵',
  debit: '💳',
  credit: '🏦',
};
