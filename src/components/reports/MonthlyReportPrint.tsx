import { budgetCategoryOf } from '@/lib/finance/categories';
import { useState, useMemo } from 'react';
import { incomeAndSpending, isCountableExpense } from '@/lib/finance/transactionFilters';
import { activeBudgets } from '@/utils/budgets';
import { FileText, Printer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { useCurrency } from '@/context/CurrencyContext';
import { useFinance } from '@/context/FinanceContext';
import { buildMonthlyReportHtml } from '@/lib/monthlyReportHtml';

const MonthlyReportPrint = () => {
  const { transactions, budgets, accounts } = useFinance();
  const { fmt, currency } = useCurrency();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, 'yyyy-MM'));

  const report = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(start);

    // Exclude future-dated transactions: they haven't been spent/earned yet,
    // same convention as Reports.tsx and FinanceContext's computeSpentByCategory.
    // Computed fresh here (not from the component-scope `now`) so the memo
    // doesn't pin a stale "today" across re-renders that don't change deps.
    const today = new Date();
    const monthTxs = transactions.filter(tx => {
      const d = parseISO(tx.date);
      return d >= start && d <= end && d <= today;
    });

    const creditAccountIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));
    // Spending after refunds, the same rule as Home.
    const { income: totalIncome, spending: totalExpenses, net: netSavings } = incomeAndSpending(monthTxs, creditAccountIds);

    // Expenses by category
    const byCategory: Record<string, { icon: string; total: number }> = {};
    monthTxs
      .filter(tx => isCountableExpense(tx))
      .forEach(tx => {
        if (!byCategory[tx.category]) byCategory[tx.category] = { icon: tx.categoryIcon, total: 0 };
        byCategory[tx.category].total += tx.amount;
      });
    const categories = Object.entries(byCategory)
      .map(([cat, v]) => ({ category: cat, icon: v.icon, total: v.total }))
      .sort((a, b) => b.total - a.total);

    // Budget performance — use the budgets ACTIVE for the selected month
    // (carried forward from the most recent prior month if this month has no
    // budgets of its own, matching the Dashboard) rather than a strict
    // month-equality filter that would show nothing for carry-forward months.
    // Spend is recomputed from monthTxs rather than Budget.spent, which is
    // always the real current month's spend regardless of which budget it's on.
    const active = activeBudgets(budgets, selectedMonth).filter(b => b.period === 'monthly');
    const names = new Set(active.map(b => b.category));
    const spentByBudget: Record<string, number> = {};
    for (const [cat, v] of Object.entries(byCategory)) {
      const target = budgetCategoryOf(cat, names);
      spentByBudget[target] = (spentByBudget[target] ?? 0) + v.total;
    }
    const monthBudgets = active.map(b => ({ ...b, spent: spentByBudget[b.category] ?? 0 }));

    return { totalIncome, totalExpenses, netSavings, categories, monthBudgets, txCount: monthTxs.length };
  }, [transactions, budgets, accounts, selectedMonth]);

  const handlePrint = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Every value is escaped inside buildMonthlyReportHtml: a category name
    // must never reach this window as markup.
    printWindow.document.write(buildMonthlyReportHtml({
      monthLabel,
      currency,
      txCount: report.txCount,
      totalIncome: report.totalIncome,
      totalExpenses: report.totalExpenses,
      netSavings: report.netSavings,
      categories: report.categories,
      budgets: report.monthBudgets,
      generatedOn: format(new Date(), 'MMM d, yyyy'),
    }, fmt));
    printWindow.document.close();
  };

  // Build a list of last 12 months for the selector
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
    });
  }, []);

  return (
    <div className="bg-card rounded-xl p-5 card-shadow space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-primary" />
        <p className="text-sm font-medium">Monthly Report</p>
      </div>
      <p className="text-xs text-muted-foreground">Generate a printable summary of income, expenses, and budget performance for any month.</p>
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="flex-1 min-w-[160px] text-sm rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {monthOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-accent p-3">
          <p className="text-[11px] text-muted-foreground mb-1">Income</p>
          <p className="text-sm font-heading text-income">{fmt(Math.round(report.totalIncome))}</p>
        </div>
        <div className="rounded-xl bg-accent p-3">
          <p className="text-[11px] text-muted-foreground mb-1">Expenses</p>
          <p className="text-sm font-heading text-expense">{fmt(Math.round(report.totalExpenses))}</p>
        </div>
        <div className="rounded-xl bg-accent p-3">
          <p className="text-[11px] text-muted-foreground mb-1">Net</p>
          <p className={`text-sm font-heading ${report.netSavings >= 0 ? 'text-income' : 'text-expense'}`}>
            {fmt(Math.round(report.netSavings))}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MonthlyReportPrint;
