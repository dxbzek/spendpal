import { describe, it, expect } from 'vitest';
import type { Transaction, Budget } from '@/types/finance';

// ─── Budget spent computation (extracted from FinanceContext) ─────────────────

function computeSpentByCategory(txs: Transaction[]): Record<string, number> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExpenses = txs.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth));
  const spent: Record<string, number> = {};
  for (const t of monthExpenses) {
    spent[t.category] = (spent[t.category] ?? 0) + t.amount;
  }
  return spent;
}

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 100,
  currency: 'AED',
  category: 'Dining',
  categoryIcon: '🍽️',
  merchant: 'Test',
  accountId: 'acc-1',
  date: new Date().toISOString().slice(0, 10), // today
  ...overrides,
});

describe('computeSpentByCategory', () => {
  it('sums expenses in the current month by category', () => {
    const txs = [
      makeTransaction({ id: 'tx-1', amount: 50, category: 'Dining' }),
      makeTransaction({ id: 'tx-2', amount: 30, category: 'Dining' }),
      makeTransaction({ id: 'tx-3', amount: 100, category: 'Groceries' }),
    ];
    const spent = computeSpentByCategory(txs);
    expect(spent['Dining']).toBe(80);
    expect(spent['Groceries']).toBe(100);
  });

  it('ignores income transactions', () => {
    const txs = [
      makeTransaction({ id: 'tx-1', type: 'income', amount: 5000, category: 'Salary' }),
      makeTransaction({ id: 'tx-2', amount: 200, category: 'Transport' }),
    ];
    const spent = computeSpentByCategory(txs);
    expect(spent['Salary']).toBeUndefined();
    expect(spent['Transport']).toBe(200);
  });

  it('ignores transactions from previous months', () => {
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const oldDate = lastMonthDate.toISOString().slice(0, 10);
    const txs = [
      makeTransaction({ id: 'tx-1', amount: 999, category: 'Shopping', date: oldDate }),
      makeTransaction({ id: 'tx-2', amount: 50, category: 'Shopping' }),
    ];
    const spent = computeSpentByCategory(txs);
    expect(spent['Shopping']).toBe(50);
  });

  it('returns empty object when no transactions', () => {
    expect(computeSpentByCategory([])).toEqual({});
  });
});

// ─── Transfer pair detection (mirroring Transactions.tsx logic) ──────────────

type TransactionPair = { expense: Transaction; income: Transaction };

function detectTransferPairs(txs: Transaction[]): Map<string, TransactionPair> {
  const pairs = new Map<string, TransactionPair>();
  const expenses = txs.filter(t => t.type === 'expense' && t.category === 'Transfer');
  const incomes = txs.filter(t => t.type === 'income' && t.category === 'Transfer');

  for (const exp of expenses) {
    const match = incomes.find(inc =>
      inc.date === exp.date &&
      Math.abs(inc.amount - exp.amount) < 0.001 &&
      inc.accountId !== exp.accountId
    );
    if (match) pairs.set(exp.id, { expense: exp, income: match });
  }
  return pairs;
}

const makeTransfer = (id: string, type: 'expense' | 'income', accountId: string, amount = 500): Transaction => ({
  id,
  type,
  amount,
  currency: 'AED',
  category: 'Transfer',
  categoryIcon: '🔁',
  merchant: 'Transfer',
  accountId,
  date: '2025-01-10',
});

describe('detectTransferPairs', () => {
  it('detects matching expense/income transfer pair', () => {
    const txs = [
      makeTransfer('exp-1', 'expense', 'acc-1', 500),
      makeTransfer('inc-1', 'income', 'acc-2', 500),
    ];
    const pairs = detectTransferPairs(txs);
    expect(pairs.size).toBe(1);
    expect(pairs.get('exp-1')).toBeDefined();
  });

  it('does not pair transfers with different amounts', () => {
    const txs = [
      makeTransfer('exp-1', 'expense', 'acc-1', 500),
      makeTransfer('inc-1', 'income', 'acc-2', 450),
    ];
    const pairs = detectTransferPairs(txs);
    expect(pairs.size).toBe(0);
  });

  it('does not pair transfers within the same account', () => {
    const txs = [
      makeTransfer('exp-1', 'expense', 'acc-1', 500),
      makeTransfer('inc-1', 'income', 'acc-1', 500),
    ];
    const pairs = detectTransferPairs(txs);
    expect(pairs.size).toBe(0);
  });

  it('does not pair transfers on different dates', () => {
    const expense: Transaction = { ...makeTransfer('exp-1', 'expense', 'acc-1'), date: '2025-01-10' };
    const income: Transaction = { ...makeTransfer('inc-1', 'income', 'acc-2'), date: '2025-01-11' };
    const pairs = detectTransferPairs([expense, income]);
    expect(pairs.size).toBe(0);
  });

  it('returns empty map for non-transfer transactions', () => {
    const txs = [
      makeTransaction({ id: 'tx-1', category: 'Dining' }),
    ];
    expect(detectTransferPairs(txs).size).toBe(0);
  });
});

// ─── Budget utilisation helpers ───────────────────────────────────────────────

function getBudgetStatus(budget: Budget): 'ok' | 'warning' | 'over' {
  const ratio = budget.spent / budget.amount;
  if (ratio >= 1) return 'over';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

const makeBudget = (spent: number, amount: number): Budget => ({
  id: 'bgt-1',
  category: 'Dining',
  categoryIcon: '🍽️',
  amount,
  spent,
  period: 'monthly',
  month: '2025-01',
});

describe('getBudgetStatus', () => {
  it('returns "ok" when under 80%', () => {
    expect(getBudgetStatus(makeBudget(500, 1000))).toBe('ok');
  });

  it('returns "warning" when between 80% and 100%', () => {
    expect(getBudgetStatus(makeBudget(850, 1000))).toBe('warning');
    expect(getBudgetStatus(makeBudget(800, 1000))).toBe('warning');
  });

  it('returns "over" when at or above 100%', () => {
    expect(getBudgetStatus(makeBudget(1000, 1000))).toBe('over');
    expect(getBudgetStatus(makeBudget(1200, 1000))).toBe('over');
  });

  it('returns "ok" for zero spent', () => {
    expect(getBudgetStatus(makeBudget(0, 500))).toBe('ok');
  });
});
