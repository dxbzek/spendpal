import { describe, it, expect } from 'vitest';
import {
  AccountRowSchema,
  TransactionRowSchema,
  BudgetRowSchema,
  GoalRowSchema,
  safeParseRow,
} from '@/lib/schemas';

// ─── AccountRowSchema ─────────────────────────────────────────────────────────

describe('AccountRowSchema', () => {
  const validRow = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Savings',
    type: 'debit',
    balance: 1000,
    currency: 'AED',
    icon: '💳',
  };

  it('parses a valid account row', () => {
    const result = AccountRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.balance).toBe(1000);
      expect(result.data.credit_limit).toBeUndefined();
    }
  });

  it('coerces string balance to number', () => {
    const result = AccountRowSchema.safeParse({ ...validRow, balance: '500.50' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.balance).toBe(500.5);
  });

  it('rejects an unknown account type', () => {
    const result = AccountRowSchema.safeParse({ ...validRow, type: 'savings' });
    expect(result.success).toBe(false);
  });

  it('maps null credit_limit to undefined', () => {
    const result = AccountRowSchema.safeParse({ ...validRow, credit_limit: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.credit_limit).toBeUndefined();
  });
});

// ─── TransactionRowSchema ─────────────────────────────────────────────────────

describe('TransactionRowSchema', () => {
  const validRow = {
    id: '00000000-0000-0000-0000-000000000002',
    type: 'expense',
    amount: 50,
    currency: 'AED',
    category: 'Dining',
    category_icon: '🍽️',
    merchant: 'Shake Shack',
    account_id: '00000000-0000-0000-0000-000000000001',
    date: '2025-01-15',
  };

  it('parses a valid transaction row', () => {
    const result = TransactionRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid date format', () => {
    const result = TransactionRowSchema.safeParse({ ...validRow, date: '15/01/2025' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid transaction type', () => {
    const result = TransactionRowSchema.safeParse({ ...validRow, type: 'refund' });
    expect(result.success).toBe(false);
  });

  it('defaults is_recurring to false when not provided', () => {
    const result = TransactionRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_recurring).toBe(false);
  });

  it('maps null note to undefined', () => {
    const result = TransactionRowSchema.safeParse({ ...validRow, note: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeUndefined();
  });
});

// ─── BudgetRowSchema ──────────────────────────────────────────────────────────

describe('BudgetRowSchema', () => {
  const validRow = {
    id: '00000000-0000-0000-0000-000000000003',
    category: 'Groceries',
    category_icon: '🛒',
    amount: 1500,
    period: 'monthly',
    month: '2025-01',
  };

  it('parses a valid budget row', () => {
    const result = BudgetRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid month format', () => {
    const result = BudgetRowSchema.safeParse({ ...validRow, month: '01-2025' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown period', () => {
    const result = BudgetRowSchema.safeParse({ ...validRow, period: 'yearly' });
    expect(result.success).toBe(false);
  });
});

// ─── GoalRowSchema ────────────────────────────────────────────────────────────

describe('GoalRowSchema', () => {
  const validRow = {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Emergency Fund',
    icon: '🏦',
    type: 'savings',
    target_amount: 10000,
    saved_amount: 2500,
    status: 'active',
  };

  it('parses a valid goal row', () => {
    const result = GoalRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('rejects unknown status', () => {
    const result = GoalRowSchema.safeParse({ ...validRow, status: 'archived' });
    expect(result.success).toBe(false);
  });

  it('maps null deadline to undefined', () => {
    const result = GoalRowSchema.safeParse({ ...validRow, deadline: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deadline).toBeUndefined();
  });
});

// ─── safeParseRow helper ──────────────────────────────────────────────────────

describe('safeParseRow', () => {
  it('returns null for invalid data', () => {
    const result = safeParseRow(AccountRowSchema, { name: 'bad' }, 'Account');
    expect(result).toBeNull();
  });

  it('returns the parsed value for valid data', () => {
    const validRow = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Cash',
      type: 'cash',
      balance: 100,
      currency: 'USD',
      icon: '💵',
    };
    const result = safeParseRow(AccountRowSchema, validRow, 'Account');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Cash');
  });
});
