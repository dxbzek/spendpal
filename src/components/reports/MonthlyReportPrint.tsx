import { useState, useMemo } from 'react';
import { FileText, Printer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { useCurrency } from '@/context/CurrencyContext';
import { useFinance } from '@/context/FinanceContext';

const MonthlyReportPrint = () => {
  const { transactions, budgets, accounts } = useFinance();
  const { fmt, currency } = useCurrency();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, 'yyyy-MM'));

  const report = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(start);

    const monthTxs = transactions.filter(tx => {
      const d = parseISO(tx.date);
      return d >= start && d <= end;
    });

    const totalIncome = monthTxs
      .filter(tx => tx.type === 'income' && !new Set(accounts.filter(a => a.type === 'credit').map(a => a.id)).has(tx.accountId))
      .reduce((s, tx) => s + tx.amount, 0);

    const totalExpenses = monthTxs
      .filter(tx => tx.type === 'expense')
      .reduce((s, tx) => s + tx.amount, 0);

    const netSavings = totalIncome - totalExpenses;

    // Expenses by category
    const byCategory: Record<string, { icon: string; total: number }> = {};
    monthTxs
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        if (!byCategory[tx.category]) byCategory[tx.category] = { icon: tx.categoryIcon, total: 0 };
        byCategory[tx.category].total += tx.amount;
      });
    const categories = Object.entries(byCategory)
      .map(([cat, v]) => ({ category: cat, icon: v.icon, total: v.total }))
      .sort((a, b) => b.total - a.total);

    // Budget performance
    const monthBudgets = budgets.filter(b => b.period === 'monthly');

    return { totalIncome, totalExpenses, netSavings, categories, monthBudgets, txCount: monthTxs.length };
  }, [transactions, budgets, accounts, selectedMonth]);

  const handlePrint = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = report.categories.map(c =>
      `<tr><td>${c.icon} ${c.category}</td><td style="text-align:right">${fmt(Math.round(c.total))}</td></tr>`
    ).join('');

    const budgetRows = report.monthBudgets.length > 0
      ? report.monthBudgets.map(b => {
          const pct = b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0;
          const status = pct >= 100 ? '🔴 Over' : pct >= 75 ? '🟡 High' : '🟢 OK';
          return `<tr><td>${b.categoryIcon} ${b.category}</td><td style="text-align:right">${fmt(Math.round(b.spent))}</td><td style="text-align:right">${fmt(b.amount)}</td><td style="text-align:center">${status}</td></tr>`;
        }).join('')
      : '<tr><td colspan="4" style="color:#888">No budgets set</td></tr>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SpendPal — ${monthLabel} Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #111; max-width: 700px; margin: 0 auto; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          .subtitle { color: #666; font-size: 14px; margin-bottom: 32px; }
          .summary { display: flex; gap: 24px; margin-bottom: 32px; flex-wrap: wrap; }
          .summary-card { background: #f8faf8; border: 1px solid #d1e8d4; border-radius: 12px; padding: 16px 24px; flex: 1; min-width: 140px; }
          .summary-card .label { font-size: 12px; color: #666; margin-bottom: 4px; }
          .summary-card .value { font-size: 20px; font-weight: 700; }
          .income { color: #1e7a3c; }
          .expense { color: #c0392b; }
          .savings { color: ${report.netSavings >= 0 ? '#1e7a3c' : '#c0392b'}; }
          h2 { font-size: 16px; margin-bottom: 12px; color: #333; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 13px; }
          th { text-align: left; padding: 8px 10px; background: #f0f9f4; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
          td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
          .footer { margin-top: 40px; font-size: 11px; color: #aaa; text-align: center; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>SpendPal Monthly Report</h1>
        <div class="subtitle">${monthLabel} &nbsp;·&nbsp; ${report.txCount} transactions &nbsp;·&nbsp; ${currency}</div>

        <div class="summary">
          <div class="summary-card"><div class="label">Income</div><div class="value income">${fmt(Math.round(report.totalIncome))}</div></div>
          <div class="summary-card"><div class="label">Expenses</div><div class="value expense">${fmt(Math.round(report.totalExpenses))}</div></div>
          <div class="summary-card"><div class="label">Net Savings</div><div class="value savings">${fmt(Math.round(report.netSavings))}</div></div>
        </div>

        <h2>Expenses by Category</h2>
        <table>
          <thead><tr><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2" style="color:#888">No expenses this month</td></tr>'}</tbody>
        </table>

        <h2>Budget Performance</h2>
        <table>
          <thead><tr><th>Budget</th><th style="text-align:right">Spent</th><th style="text-align:right">Limit</th><th style="text-align:center">Status</th></tr></thead>
          <tbody>${budgetRows}</tbody>
        </table>

        <div class="footer">Generated by SpendPal on ${format(new Date(), 'MMM d, yyyy')}</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
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
    <div className="bg-card rounded-2xl p-5 card-shadow space-y-4">
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
          <p className="text-[10px] text-muted-foreground mb-1">Income</p>
          <p className="text-sm font-heading text-income">{fmt(Math.round(report.totalIncome))}</p>
        </div>
        <div className="rounded-xl bg-accent p-3">
          <p className="text-[10px] text-muted-foreground mb-1">Expenses</p>
          <p className="text-sm font-heading text-expense">{fmt(Math.round(report.totalExpenses))}</p>
        </div>
        <div className="rounded-xl bg-accent p-3">
          <p className="text-[10px] text-muted-foreground mb-1">Net</p>
          <p className={`text-sm font-heading ${report.netSavings >= 0 ? 'text-income' : 'text-expense'}`}>
            {fmt(Math.round(report.netSavings))}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MonthlyReportPrint;
