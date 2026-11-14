// The 30-day projection on Accounts: cash and debit balances carried forward
// through the recurring bills and recurring income due in that time.
// Pure, so it is unit-tested.
//
// Each bill counts once, from its latest row. Every row ever logged used to be
// applied again, so a bill logged for six months came off six times.
// Left out: instalment rows (the Installments page owns them), bills not
// logged for 3 months, and anything on a credit card, which moves that
// card's debt and not these balances.
import { addMonths, differenceInDays, parseISO } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';
import { activeRecurring } from '@/lib/finance/recurringBills';

export interface BalanceProjection {
  /** One point per day, day 0 (today) to `days`. */
  points: Array<{ day: number; balance: number }>;
  startBalance: number;
  endBalance: number;
  change: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Null when there is no cash or debit account to project. */
export function projectBalance(accounts: Account[], transactions: Transaction[], now: Date, days = 30): BalanceProjection | null {
  const assets = accounts.filter(a => a.type !== 'credit');
  if (assets.length === 0) return null;
  const assetIds = new Set(assets.map(a => a.id));
  const today = startOfDay(now);
  const startBalance = assets.reduce((s, a) => s + a.balance, 0);

  // Money in or out on each day ahead.
  const moves = new Array<number>(days + 1).fill(0);
  const apply = (rows: Transaction[], sign: 1 | -1) => {
    for (const t of rows) {
      if (!assetIds.has(t.accountId)) continue;
      // Step from the logged date so the day of month survives short months.
      const base = parseISO(t.date.slice(0, 10));
      for (let offset = 1; offset <= 24; offset++) {
        const day = differenceInDays(addMonths(base, offset), today);
        if (day > days) break;
        // Due today and not logged yet: it is still to come, so it lands on day 1.
        if (day >= 0) moves[Math.max(1, day)] += sign * t.amount;
      }
    }
  };
  apply(activeRecurring(transactions, now, 'expense'), -1);
  apply(activeRecurring(transactions, now, 'income'), 1);

  const points = [{ day: 0, balance: startBalance }];
  let running = startBalance;
  for (let d = 1; d <= days; d++) {
    running = round2(running + moves[d]);
    points.push({ day: d, balance: running });
  }
  return { points, startBalance, endBalance: running, change: round2(running - startBalance) };
}
