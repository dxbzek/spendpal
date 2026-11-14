// A budget of 0 passes the database CHECK (amount >= 0) and is then dropped
// when the app loads its rows, so it is a row the user can never see or
// delete. Restore now accepts such a row; the app must stop making new ones.
// The form refuses 0 itself; AI envelopes, AI suggestions and scanned
// screenshots call addBudget / updateBudget directly.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const db = vi.hoisted(() => {
  const BUDGET = {
    id: '00000000-0000-4000-8000-000000000201', category: 'Food', category_icon: 'x',
    amount: 400, period: 'monthly', month: '2026-11',
  };
  const writes: Array<{ table: string; op: string; row: Record<string, unknown> }> = [];
  return { BUDGET, writes };
});

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  // Every query method chains; awaiting the chain gives the rows. Inserts and
  // updates are recorded, and a budget insert answers with the row it was given.
  const query = (table: string, rows: unknown): Record<string, unknown> => {
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null, count: Array.isArray(rows) ? rows.length : 1 }).then(resolve),
      insert: (row: Record<string, unknown>) => {
        db.writes.push({ table, op: 'insert', row });
        return query(table, { ...db.BUDGET, ...row, id: '00000000-0000-4000-8000-000000000202' });
      },
      update: (row: Record<string, unknown>) => {
        db.writes.push({ table, op: 'update', row });
        return query(table, null);
      },
    };
    return new Proxy(q, { get: (target, key: string) => (key in target ? target[key] : () => query(table, rows)) });
  };
  return { supabase: { from: (table: string) => query(table, table === 'budgets' ? [db.BUDGET] : []) } };
});

import { FinanceProvider, useFinance } from '@/context/FinanceContext';
import type { Budget } from '@/types/finance';

let finance: ReturnType<typeof useFinance>;
const Grab = () => { finance = useFinance(); return null; };

const load = async () => {
  render(<FinanceProvider><Grab /></FinanceProvider>);
  await waitFor(() => expect(finance.loading).toBe(false));
  await waitFor(() => expect(finance.budgets).toHaveLength(1));
};
const budgetWrites = () => db.writes.filter(w => w.table === 'budgets');
const newBudget = (amount: number) =>
  ({ category: 'Fun', categoryIcon: 'x', amount, period: 'monthly' as const, month: '2026-11' });

beforeEach(() => { db.writes.length = 0; toast.error.mockClear(); });

describe('a budget of zero is never saved', () => {
  it('addBudget refuses 0, less than half a cent, a negative and NaN, and writes nothing', async () => {
    await load();
    for (const amount of [0, 0.004, -50, NaN]) {
      let ok = true;
      await act(async () => { ok = await finance.addBudget(newBudget(amount)); });
      expect(ok, String(amount)).toBe(false);
    }
    expect(budgetWrites()).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('Fun: a budget must be above zero');
  });

  it('updateBudget refuses 0 and leaves the budget as it was', async () => {
    await load();
    const existing: Budget = finance.budgets[0];
    let ok = true;
    await act(async () => { ok = await finance.updateBudget({ ...existing, amount: 0 }); });
    expect(ok).toBe(false);
    expect(budgetWrites()).toEqual([]);
    expect(finance.budgets[0].amount).toBe(400);
  });

  it('a real amount is still saved, to the cent', async () => {
    await load();
    let ok = false;
    await act(async () => { ok = await finance.addBudget(newBudget(250.005)); });
    expect(ok).toBe(true);
    expect(budgetWrites()).toHaveLength(1);
    expect(budgetWrites()[0]).toMatchObject({ op: 'insert', row: { category: 'Fun', amount: 250.01, period: 'monthly' } });
  });
});
