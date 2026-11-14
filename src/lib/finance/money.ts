// Money is stored to the cent. Sums and differences of decimals are not exact
// in floating point (1234.56 - 1000.1 is 234.45999999999992), and the money
// columns have no fixed scale, so an unrounded value is saved with its tail.
// Round with this before every write of a computed amount.

/**
 * Rounds to 2 decimals, halves away from zero. The tiny upward nudge is there
 * because a typed 1.005 is held as 1.00499999999999989 and would otherwise
 * round down to 1.00.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return n;
  const cents = Math.round(Math.abs(n) * 100 * (1 + Number.EPSILON));
  // "+ 0" turns a negative zero into a plain zero.
  return (n < 0 ? -cents : cents) / 100 + 0;
}

/**
 * The gap between two amounts, to the cent. Anything under half a cent is
 * floating point noise, not a real difference, and comes back as exactly 0.
 */
export const moneyDifference = (a: number, b: number): number => roundMoney(a - b);

/** roundMoney for a field that may be empty: null and undefined pass through. */
export function roundMoneyOrEmpty<T extends number | null | undefined>(n: T): T {
  return (typeof n === 'number' ? roundMoney(n) : n) as T;
}

/** a + b to the cent (0.1 + 0.2 is 0.3, not 0.30000000000000004). */
export const addMoney = (a: number, b: number): number => roundMoney(a + b);

/** The money fields an account write sends, each to the cent. Other fields are untouched. */
export function roundAccountMoney<T extends {
  balance?: number;
  creditLimit?: number;
  statementTotalDue?: number | null;
  statementMinDue?: number | null;
}>(account: T): T {
  // Only keys the caller set are written back, so a field left out stays left
  // out (the statement columns are only sent when the account carries them).
  const out = { ...account };
  if (account.balance !== undefined) out.balance = roundMoney(account.balance);
  if (account.creditLimit !== undefined) out.creditLimit = roundMoney(account.creditLimit);
  if (account.statementTotalDue !== undefined) out.statementTotalDue = roundMoneyOrEmpty(account.statementTotalDue);
  if (account.statementMinDue !== undefined) out.statementMinDue = roundMoneyOrEmpty(account.statementMinDue);
  return out;
}
