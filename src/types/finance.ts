export type AccountType = 'cash' | 'debit' | 'credit';
export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  // For 'credit' accounts, balance is the amount OWED, not available credit —
  // the same value everywhere (Debt tracker, account list, exports). Compute
  // available credit for display as `creditLimit - balance` where needed.
  balance: number;
  currency: string;
  icon: string;
  creditLimit?: number;
  dueDate?: number; // day of month
  statementDate?: number;
  apr?: number; // annual interest rate, % (0 for an interest-free pay-later plan)
  // From the card's latest statement, typed in by hand. Shown as-is on Home;
  // null means "not entered" and Home asks for the statement instead of guessing.
  statementTotalDue?: number | null;
  statementMinDue?: number | null;
  statementDueOn?: string | null; // YYYY-MM-DD
  // Non-credit money that isn't spendable (savings held for someone else).
  // Left out of Spendable Cash and "Left until payday"; still counted in net worth.
  // undefined = column not on the database yet.
  excludeFromSpendable?: boolean;
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
  // Internal money movement (transfer between own accounts, card payment,
  // BNPL repayment, repaying a person) — excluded from income/expense
  // totals but still affects account balance, unlike isTrackingOnly.
  isInternal?: boolean;
  // Authorized but not yet posted (a card hold). Doesn't affect the
  // account's settled balance until cleared, but is counted as a hold
  // against "available" funds for display.
  isPending?: boolean;
  // Instalment plan row only: principal still owed per the latest statement.
  // null = not entered; undefined = column not on the database yet.
  remainingPrincipal?: number | null;
  // The user said this isn't a duplicate; Transactions stops flagging it.
  dupeDismissed?: boolean;
  // One id per instalment plan, on every row of that plan.
  // null = row has none (logged before the column, or imported);
  // undefined = column not on the database yet.
  planId?: string | null;
  // One id shared by the two halves of a transfer. Same null/undefined meaning.
  transferId?: string | null;
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

// 'DEWA' is no longer a built-in name but stays here: a user who still has a
// DEWA category gets a new DEWA budget marked fixed, as before.
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

// Built-in names, offered to every new user, so none is local to one country.
// 'DEWA' (a Dubai utility) and 'Metro/Taxi' were removed: rows and budgets
// already under those names keep working, and CATEGORY_ALIASES still counts
// them toward Bills and Transport budgets.
export const EXPENSE_CATEGORIES = [
  { name: 'Coffee', icon: '☕' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Dining', icon: '🍽️' },
  { name: 'Telecom', icon: '📱' },
  { name: 'Travel', icon: '✈️' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Charity', icon: '🤲' },
  { name: 'Delivery', icon: '📦' },
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
