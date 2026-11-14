// One name per screen and per account type, used by both navs, the page
// titles and the 404 links. The start page was "Home" in the navs, "Overview"
// on the page and "Dashboard" on the 404 page; the advisor was "Advisor",
// "AI Advisor" and "AI Budget Advisor".
import type { AccountType } from '@/types/finance';

export const PAGE_NAMES = {
  '/': 'Home',
  '/transactions': 'Transactions',
  '/accounts': 'Accounts',
  '/budgets': 'Budgets',
  '/goals': 'Goals',
  '/debt': 'Debt',
  '/installments': 'Installments',
  '/reports': 'Reports',
  '/calendar': 'Calendar',
  '/advisor': 'AI Advisor',
  '/settings': 'Settings',
  '/glossary': 'Glossary & FAQ',
} as const;

export type PagePath = keyof typeof PAGE_NAMES;

/** An account's type, as the Add Account form offers it. */
export const ACCOUNT_TYPE_NAMES: Record<AccountType, string> = {
  cash: 'Cash',
  debit: 'Bank account',
  credit: 'Credit card',
};

/** A heading over several accounts of one type. */
export const ACCOUNT_TYPE_GROUP_NAMES: Record<AccountType, string> = {
  cash: 'Cash',
  debit: 'Bank accounts',
  credit: 'Credit cards',
};
