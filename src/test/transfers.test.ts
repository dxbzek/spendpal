import { describe, it, expect } from 'vitest';
import type { Transaction } from '@/types/finance';
import { pairTransfers, transferPartner } from '@/lib/finance/transfers';

let n = 0;
const half = (type: 'expense' | 'income', accountId: string, o: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, type, amount: 500, currency: 'AED', category: 'Transfer', categoryIcon: 'x',
  merchant: 'Transfer', accountId, date: '2026-11-10', isInternal: true, ...o,
});

const route = (txs: Transaction[]) =>
  [...pairTransfers(txs).values()].map(p => `${p.from.accountId}->${p.to.accountId}`).sort();

describe('two transfers of the same amount on the same day', () => {
  it('pair on the transfer id, whatever order the rows load in', () => {
    const aOut = half('expense', 'A', { transferId: 'x' });
    const bIn = half('income', 'B', { transferId: 'x' });
    const cOut = half('expense', 'C', { transferId: 'y' });
    const dIn = half('income', 'D', { transferId: 'y' });
    // The income rows in the other order used to give A->D and C->B.
    expect(route([aOut, cOut, dIn, bIn])).toEqual(['A->B', 'C->D']);
    expect(route([dIn, bIn, cOut, aOut])).toEqual(['A->B', 'C->D']);
  });

  it('delete and edit find the income row of the same transfer', () => {
    const aOut = half('expense', 'A', { transferId: 'x' });
    const bIn = half('income', 'B', { transferId: 'x' });
    const cOut = half('expense', 'C', { transferId: 'y' });
    const dIn = half('income', 'D', { transferId: 'y' });
    const all = [aOut, cOut, dIn, bIn];
    expect(transferPartner(all, aOut)?.id).toBe(bIn.id);
    expect(transferPartner(all, cOut)?.id).toBe(dIn.id);
  });

  it('without ids, pair on the matching note', () => {
    const aOut = half('expense', 'A', { note: 'A → B' });
    const bIn = half('income', 'B', { note: 'A → B' });
    const cOut = half('expense', 'C', { note: 'C → D' });
    const dIn = half('income', 'D', { note: 'C → D' });
    expect(route([aOut, cOut, dIn, bIn])).toEqual(['A->B', 'C->D']);
  });
});

describe('rows without a transfer id', () => {
  it('still pair when each half has its own note (the oldest transfers)', () => {
    const out = half('expense', 'A', { note: 'Transfer to B' });
    const into = half('income', 'B', { note: 'Transfer from A' });
    expect(route([out, into])).toEqual(['A->B']);
  });

  it('take the partner with the same note before one that only shares date and amount', () => {
    const out = half('expense', 'A', { note: 'A → B' });
    const stray = half('income', 'Z', { note: 'Refund' });
    const into = half('income', 'B', { note: 'A → B' });
    expect(route([out, stray, into])).toEqual(['A->B']);
  });

  it('never pair with a row that belongs to a transfer with an id', () => {
    const oldOut = half('expense', 'A');
    const newOut = half('expense', 'C', { transferId: 'y' });
    const newIn = half('income', 'D', { transferId: 'y' });
    expect(route([oldOut, newIn, newOut])).toEqual(['C->D']);
  });

  it('need the same date and the same amount', () => {
    expect(route([half('expense', 'A'), half('income', 'B', { date: '2026-11-11' })])).toEqual([]);
    expect(route([half('expense', 'A'), half('income', 'B', { amount: 400 })])).toEqual([]);
  });
});

describe('each row is in one transfer at most', () => {
  it('one income row is not shared by two expense rows', () => {
    const txs = [half('expense', 'A'), half('expense', 'C'), half('income', 'B')];
    expect(pairTransfers(txs).size).toBe(1);
  });

  it('other categories are never transfers', () => {
    const txs = [half('expense', 'A', { category: 'Dining' }), half('income', 'B')];
    expect(pairTransfers(txs).size).toBe(0);
  });
});
