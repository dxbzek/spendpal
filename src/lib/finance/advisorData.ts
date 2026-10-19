// What the AI Advisor is told, and what of its answer is shown. Pure, so the
// numbers and the filtering are unit-tested.
//
// Every figure comes from countable rows only (no internal movements, no
// tracking-only instalment bookkeeping), the same rule Home and Reports use.
// Recurring expenses are listed once per merchant at their latest amount, so
// the model can't add up thirteen months of repeats (or card instalments)
// into a "monthly" subscription bill.
import type { Account, Budget, Goal, Transaction } from '@/types/finance';
import type { BudgetAnalysis } from '@/hooks/useAI';
import { isCountableExpense, isCountableIncome } from '@/lib/finance/transactionFilters';
import { isSpendable } from '@/lib/finance/cardPayments';
import { creditUtilization } from '@/lib/finance/credit';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildAdvisorData(
  transactions: Transaction[],
  accounts: Account[],
  budgets: Pick<Budget, 'category' | 'amount' | 'spent'>[],
  goals: Goal[],
  now: Date,
  currency: string,
) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = `${month}-${String(now.getDate()).padStart(2, '0')}`;
  const creditIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));

  // This month so far; future-dated rows haven't happened yet.
  const monthTx = transactions.filter(t => t.date.startsWith(month) && t.date <= today);
  const spend = monthTx.filter(isCountableExpense);
  const income = monthTx.filter(t => isCountableIncome(t, creditIds)).reduce((s, t) => s + t.amount, 0);
  const expenses = spend.reduce((s, t) => s + t.amount, 0);

  const categories: Record<string, { total: number; icon: string; count: number }> = {};
  for (const t of spend) {
    const c = (categories[t.category] ??= { total: 0, icon: t.categoryIcon, count: 0 });
    c.total += t.amount;
    c.count++;
  }

  // One entry per recurring merchant, at its latest amount. Instalment plans
  // are debt repayments, not recurring spending.
  // Only ones seen in the last two months; a stopped subscription isn't one.
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 62);
  const sinceDay = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const latestRecurring = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.isRecurring || !isCountableExpense(t) || t.totalInstallments != null) continue;
    if (t.date < sinceDay || t.date > today) continue;
    const key = t.merchant.trim().toLowerCase();
    const prev = latestRecurring.get(key);
    if (!prev || t.date > prev.date) latestRecurring.set(key, t);
  }

  return {
    currency,
    monthlyIncome: round2(income),
    monthlyExpenses: round2(expenses),
    netSavings: round2(income - expenses),
    // Cash/debit you can spend; savings marked not-for-spending left out.
    spendableCash: round2(accounts.filter(isSpendable).reduce((s, a) => s + a.balance, 0)),
    categories: Object.entries(categories)
      .map(([name, d]) => ({ name, total: round2(d.total), icon: d.icon, count: d.count }))
      .sort((a, b) => b.total - a.total),
    // The Subscriptions category this month, nothing else folded in.
    subscriptionsThisMonth: round2(categories.Subscriptions?.total ?? 0),
    recurringExpenses: [...latestRecurring.values()].map(r => ({ merchant: r.merchant, amount: r.amount, category: r.category })),
    creditCards: accounts.filter(a => a.type === 'credit').map(c => ({
      name: c.name,
      owed: c.balance,
      creditLimit: c.creditLimit ?? null,
      utilization: c.creditLimit ? Math.round(creditUtilization(c) ?? 0) : null,
      statementMinDue: c.statementMinDue ?? null,
    })),
    existingBudgets: budgets.map(b => ({ category: b.category, amount: b.amount, spent: b.spent })),
    goals: goals.map(g => ({ name: g.name, target: g.targetAmount, saved: g.savedAmount, type: g.type })),
    transactionCount: transactions.length,
    accountCount: accounts.length,
  };
}

export type AdvisorData = ReturnType<typeof buildAdvisorData>;

/** "The user's savings…" → "Your savings…". Older saved analyses were written in the third person. */
export function toSecondPerson(text: string): string {
  const cap = (s: string, like: string) => (like[0] === like[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s);
  return text
    .replace(/\bthe user's\b/gi, m => cap("your", m))
    .replace(/\bthe user (has|is|was|does)\b/gi, (m, verb: string) =>
      cap(`you ${({ has: 'have', is: 'are', was: 'were', does: 'do' } as Record<string, string>)[verb.toLowerCase()]}`, m))
    .replace(/\bthe user\b/gi, m => cap('you', m));
}

/**
 * Advice counts as coming from your data when it names one of your own
 * categories, merchants, cards or goals, or quotes one of your figures.
 * "Increase income by 10%" does neither, so it isn't shown.
 */
export function isGrounded(text: string, data: AdvisorData): boolean {
  const lower = text.toLowerCase();
  const names = [
    ...data.categories.map(c => c.name),
    ...data.recurringExpenses.map(r => r.merchant),
    ...data.creditCards.map(c => c.name),
    ...data.goals.map(g => g.name),
    ...data.existingBudgets.map(b => b.category),
  ].filter(n => n && n.trim().length >= 3);
  if (names.some(n => lower.includes(n.toLowerCase()))) return true;

  const figures = [
    data.monthlyIncome, data.monthlyExpenses, Math.abs(data.netSavings), data.spendableCash, data.subscriptionsThisMonth,
    ...data.categories.map(c => c.total),
    ...data.recurringExpenses.map(r => r.amount),
    ...data.creditCards.map(c => c.owed),
  ].filter(f => f >= 10);
  const quoted = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => Number(m[0].replace(/,/g, '')));
  return quoted.some(q => figures.some(f => Math.abs(q - f) <= Math.max(1, f * 0.01)));
}

/** The analysis as shown: second person throughout, and only advice tied to your data. */
export function presentAnalysis(analysis: BudgetAnalysis, data: AdvisorData): BudgetAnalysis {
  return {
    ...analysis,
    methodReason: toSecondPerson(analysis.methodReason),
    insights: analysis.insights
      .map(i => ({ ...i, title: toSecondPerson(i.title), description: toSecondPerson(i.description) }))
      .filter(i => isGrounded(`${i.title} ${i.description}`, data)),
    dynamicAdjustments: analysis.dynamicAdjustments
      .map(a => ({ action: toSecondPerson(a.action), impact: toSecondPerson(a.impact) }))
      .filter(a => isGrounded(`${a.action} ${a.impact}`, data)),
  };
}
