// Budget "spent" must follow the date while the app stays open. It was
// memoised on the transaction list only, so on the 1st of a month an app kept
// in memory overnight still showed last month's spending against each budget.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const tables = vi.hoisted(() => {
  const ACC = '00000000-0000-4000-8000-000000000001';
  const row = (id: string, amount: number, date: string) => ({
    id: `00000000-0000-4000-8000-0000000001${id}`, type: 'expense', amount, currency: 'AED',
    category: 'Food', category_icon: 'x', merchant: 'Shop', account_id: ACC, date,
  });
  return {
    accounts: [{ id: ACC, name: 'Bank', type: 'debit', balance: 100, currency: 'AED', icon: 'x' }],
    transactions: [row('01', 900, '2026-11-20'), row('02', 40, '2026-12-01')],
    budgets: [{ id: '00000000-0000-4000-8000-000000000201', category: 'Food', category_icon: 'x', amount: 1000, period: 'monthly', month: '2026-11' }],
    goals: [],
  } as Record<string, unknown[]>;
});

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  // Every query method chains; awaiting the chain gives the table's rows.
  const query = (rows: unknown[]) => {
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve),
    };
    return new Proxy(q, { get: (target, key: string) => (key in target ? target[key] : () => proxyOf(rows)) });
  };
  const proxyOf = (rows: unknown[]) => query(rows);
  return { supabase: { from: (table: string) => query(tables[table] ?? []) } };
});

import { FinanceProvider, useFinance } from '@/context/FinanceContext';

const Spent = () => {
  const { budgets, loading } = useFinance();
  if (loading || budgets.length === 0) return <p>loading</p>;
  return <p data-testid="spent">{budgets[0].spent}</p>;
};

describe('budget spent when the date changes with the app open', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('moves to the new month when the app comes back to the front', async () => {
    // Only the clock is faked, so promises and waitFor run as usual.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 30, 23, 0, 0));
    render(<FinanceProvider><Spent /></FinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('spent').textContent).toBe('900'));

    // The next morning, no reload and no new transaction.
    vi.setSystemTime(new Date(2026, 11, 1, 8, 0, 0));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(screen.getByTestId('spent').textContent).toBe('40'));
  });
});
