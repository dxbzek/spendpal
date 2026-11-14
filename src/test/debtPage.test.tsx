import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Account, Transaction } from '@/types/finance';
import Debt from '@/pages/Debt';

// The Debt page with fixed data, so the header and the plan lines are checked
// as they are drawn. Amounts print as plain "12400.00".
const data: { accounts: Account[]; transactions: Transaction[] } = { accounts: [], transactions: [] };

vi.mock('@/context/FinanceContext', () => ({
  useFinance: () => ({ ...data, loading: false }),
}));
vi.mock('@/context/CurrencyContext', () => ({
  useCurrency: () => ({ fmt: (n: number) => n.toFixed(2), currency: 'AED' }),
}));

const acct = (o: Partial<Account>): Account => ({
  id: o.name ?? 'x', name: 'x', type: 'credit', balance: 0, currency: 'AED', icon: '💳', ...o,
});

let n = 0;
const plan = (o: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Shopping', categoryIcon: '🛍️',
  merchant: 'x', accountId: 'Main card', date: '2026-01-10', isRecurring: true, isTrackingOnly: true, ...o,
});

/** The value shown in a header tile, found by the tile's label. */
const tile = (label: string) => screen.getByText(label).parentElement!;

beforeEach(() => {
  data.accounts = [];
  data.transactions = [];
});

describe('Debt page header', () => {
  // Regression: a paid-off card was dropped before the limits were added up,
  // so this showed limit 10000.00 and 50% where Home showed 20000.00 and 25%.
  it('counts the limit of a card with nothing owed, like Home', () => {
    data.accounts = [
      acct({ name: 'Main card', balance: 5_000, creditLimit: 10_000, apr: 36 }),
      acct({ name: 'Spare card', balance: 0, creditLimit: 10_000, apr: 36 }),
    ];
    render(<Debt />);
    expect(within(tile('Credit Limit')).getByText('20000.00')).toBeInTheDocument();
    expect(within(tile('Utilization')).getByText('25%')).toBeInTheDocument();
    expect(within(tile('Total Owed')).getByText('5000.00')).toBeInTheDocument();
    // Only the card that owes is listed.
    expect(screen.queryByText('Spare card')).toBeNull();
  });
});

describe('Debt page instalment plans', () => {
  beforeEach(() => {
    data.accounts = [
      acct({ name: 'Main card', balance: 12_400, creditLimit: 20_000, apr: 36, statementMinDue: 900 }),
      acct({ name: 'Other card', balance: 2_000, creditLimit: 5_000 }),
    ];
    data.transactions = [
      plan({ merchant: '[CC] Laptop', amount: 150, totalInstallments: 48, currentInstallment: 6, remainingPrincipal: 4_200.5 }),
      plan({ merchant: '[CC] Phone', amount: 250, totalInstallments: 4, currentInstallment: 2 }),
    ];
  });

  it('shows plan principal and the revolving rest as separate lines', () => {
    render(<Debt />);
    const plans = screen.getByText('In instalment plans').parentElement!;
    expect(within(plans).getByText('4700.50')).toBeInTheDocument();
    const rest = screen.getByText('Rest of the balance, at the card rate').parentElement!;
    expect(within(rest).getByText('7699.50')).toBeInTheDocument();
    // Plan name on one line, payments left and amount on the next.
    expect(screen.getByText('Laptop').nextElementSibling?.textContent).toMatch(/^42 × 150\.00/);
    expect(screen.getByText('Phone').nextElementSibling?.textContent).toMatch(/^2 × 250\.00/);
    // The total still counts everything that is owed.
    expect(within(tile('Total Owed')).getByText('14400.00')).toBeInTheDocument();
  });

  it('builds the payoff plan on the revolving part only', () => {
    render(<Debt />);
    expect(screen.getByText(/7699\.50 not in a plan · 36% APR/)).toBeInTheDocument();
    expect(screen.getByText(/They take 400\.00 a month until they end/)).toBeInTheDocument();
  });

  it('says when an APR is assumed', () => {
    render(<Debt />);
    expect(screen.getByText(/2000\.00 owed · 20% APR \(assumed\)/)).toBeInTheDocument();
    expect(screen.getByText(/Cards with no APR set use 20%/)).toBeInTheDocument();
  });

  it('leaves a card that is all plan principal out of the payoff plan', () => {
    data.accounts = [
      acct({ name: 'Main card', balance: 4_700.5, creditLimit: 20_000, apr: 36 }),
      acct({ name: 'Other card', balance: 2_000, creditLimit: 5_000, apr: 30 }),
    ];
    render(<Debt />);
    // One card left with revolving debt: no multi-card plan to build.
    expect(screen.queryByText('Payoff plan')).toBeNull();
    expect(screen.getByText('Main card')).toBeInTheDocument();
  });
});
