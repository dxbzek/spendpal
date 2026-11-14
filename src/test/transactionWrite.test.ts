import { describe, it, expect } from 'vitest';
import {
  isMissingLinkColumn, retryWithoutLinks, roundAmount, roundAmountOrNull, withoutLinkColumns,
} from '@/lib/finance/transactionWrite';
import { TransactionRowSchema } from '@/lib/schemas';

describe('amounts are saved in whole cents', () => {
  it('drops the floating-point tail', () => {
    expect(1234.56 - 1000.1).not.toBe(234.46); // 234.45999999999992
    expect(roundAmount(1234.56 - 1000.1)).toBe(234.46);
    expect(roundAmount(0.1 + 0.2)).toBe(0.3);
  });

  it('leaves a clean amount as it is', () => {
    expect(roundAmount(198.53)).toBe(198.53);
    expect(roundAmount(20_000)).toBe(20_000);
  });

  it('keeps an empty column empty', () => {
    expect(roundAmountOrNull(null)).toBeNull();
    expect(roundAmountOrNull(undefined)).toBeNull();
    expect(roundAmountOrNull(3_346.789)).toBe(3_346.79);
  });
});

describe('a database without plan_id / transfer_id', () => {
  const noPlanId = { code: 'PGRST204', message: "Could not find the 'plan_id' column of 'transactions' in the schema cache" };
  const noTransferId = { code: '42703', message: 'column "transfer_id" of relation "transactions" does not exist' };

  it('is told apart from every other failure', () => {
    expect(isMissingLinkColumn(noPlanId)).toBe(true);
    expect(isMissingLinkColumn(noTransferId)).toBe(true);
    expect(isMissingLinkColumn(null)).toBe(false);
    expect(isMissingLinkColumn({ code: '23514', message: 'violates check constraint "transactions_installments_valid"' })).toBe(false);
    expect(isMissingLinkColumn({ code: 'PGRST204', message: "Could not find the 'remaining_principal' column" })).toBe(false);
    expect(isMissingLinkColumn({ message: 'Failed to fetch' })).toBe(false);
  });

  it('strips only the link columns', () => {
    expect(withoutLinkColumns({ amount: 5, plan_id: 'p', transfer_id: 't', note: null })).toEqual({ amount: 5, note: null });
  });

  it('saves the row without them instead of failing', async () => {
    const sent: object[] = [];
    const res = await retryWithoutLinks(async prep => {
      const row = prep({ amount: 5, transfer_id: 't' });
      sent.push(row);
      return { error: 'transfer_id' in row ? noTransferId : null };
    });
    expect(res.error).toBeNull();
    expect(sent).toEqual([{ amount: 5, transfer_id: 't' }, { amount: 5 }]);
  });

  it('writes once when the columns are there', async () => {
    let calls = 0;
    const res = await retryWithoutLinks(async prep => { calls++; return { error: null, row: prep({ plan_id: 'p' }) }; });
    expect(calls).toBe(1);
    expect(res.row).toEqual({ plan_id: 'p' });
  });

  it('does not retry any other error', async () => {
    let calls = 0;
    const other = { code: '23514', message: 'check constraint' };
    const res = await retryWithoutLinks(async () => { calls++; return { error: other }; });
    expect(calls).toBe(1);
    expect(res.error).toBe(other);
  });
});

describe('plan_id and transfer_id on rows read from the database', () => {
  const row = {
    id: '00000000-0000-0000-0000-000000000002', type: 'expense', amount: 50, currency: 'AED',
    category: 'Shopping', category_icon: 'x', merchant: 'Tabby',
    account_id: '00000000-0000-0000-0000-000000000001', date: '2026-11-01',
  };

  it('a row from a database without the columns still loads', () => {
    const r = TransactionRowSchema.safeParse(row);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.plan_id).toBeUndefined();
      expect(r.data.transfer_id).toBeUndefined();
    }
  });

  it('carries the ids, and null for a row that has none', () => {
    const r = TransactionRowSchema.safeParse({ ...row, plan_id: '00000000-0000-0000-0000-00000000000a', transfer_id: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.plan_id).toBe('00000000-0000-0000-0000-00000000000a');
      expect(r.data.transfer_id).toBeNull();
    }
  });
});
