// A refund lowers spending on every screen, not only on Home. Before, Home
// took it off spending while Reports, Calendar, Transactions, Saved This
// Month, the trend chart, the monthly report and the AI data left it out of
// income and still added the purchase: the refund counted nowhere.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Transaction } from '@/types/finance';
import { incomeAndSpending } from '@/lib/finance/transactionFilters';
import { buildAdvisorData } from '@/lib/finance/advisorData';

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `r${n++}`, type: 'expense', amount: 0, currency: 'AED', category: 'Shopping', categoryIcon: 'x',
  merchant: 'Shop', accountId: 'debit', date: '2026-11-05', ...o,
});

const november = [
  tx({ type: 'income', amount: 1000, category: 'Freelance', merchant: 'Client' }),
  tx({ amount: 4000, category: 'Rent', merchant: 'Landlord' }),
  tx({ amount: 800, merchant: 'Ikea' }),
  tx({ type: 'income', amount: 800, category: 'Refund', merchant: 'Ikea' }),
  tx({ amount: 200, category: 'Dining', merchant: 'Cafe' }),
];
const credit = new Set<string>(['card']);

describe('income, spending and net with a refund', () => {
  it('takes the refund off spending and never counts it as income', () => {
    expect(incomeAndSpending(november, credit)).toEqual({ income: 1000, spending: 4200, net: -3200 });
  });

  it('a refund on a card lowers spending the same way', () => {
    const onCard = november.map(t => (t.category === 'Refund' ? { ...t, accountId: 'card' } : t));
    expect(incomeAndSpending(onCard, credit)).toEqual({ income: 1000, spending: 4200, net: -3200 });
  });

  it('the AI data uses the same figures', () => {
    const data = buildAdvisorData(november, [{ id: 'debit', type: 'debit' } as never], [], [], new Date(2026, 10, 14), 'AED');
    expect(JSON.stringify(data)).toContain('4200');
    expect(JSON.stringify(data)).not.toContain('5000');
  });
});

describe('every screen that shows income next to spending uses the one rule', () => {
  const screens = [
    'src/pages/Dashboard.tsx',
    'src/pages/Reports.tsx',
    'src/pages/CalendarView.tsx',
    'src/pages/Transactions.tsx',
    'src/components/dashboard/MoneySavedWidget.tsx',
    'src/components/dashboard/MonthlyReportCard.tsx',
    'src/components/charts/MonthlyTrendChart.tsx',
    'src/components/reports/MonthlyReportPrint.tsx',
    'src/lib/finance/advisorData.ts',
  ];
  for (const file of screens) {
    it(file, () => {
      const src = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(src).toContain('incomeAndSpending(');
      // An income total summed by hand next to a gross expense total is the old bug.
      expect(src).not.toMatch(/isCountableIncome\([^)]*\)\)\s*\.reduce\(/);
      expect(src).not.toMatch(/isCountableIncome\([^)]*\)\s*\?\s*s\s*\+/);
    });
  }
});
