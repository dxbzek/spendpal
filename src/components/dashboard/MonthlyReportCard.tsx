import { useState, useCallback } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Transaction, Budget, Goal, Account } from '@/types/finance';

interface Props {
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  accounts: Account[];
}

const MonthlyReportCard = ({ transactions, budgets, goals, accounts }: Props) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');

  const generateReport = useCallback(async () => {
    setLoading(true);
    setReport('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in');

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const creditAccountIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));
      const monthTx = transactions.filter(t => t.date.startsWith(currentMonth));
      const income = monthTx.filter(t => t.type === 'income' && !creditAccountIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
      const expenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

      const categoryMap: Record<string, number> = {};
      monthTx.filter(t => t.type === 'expense').forEach(t => {
        categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
      });

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-finance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: 'monthly-report',
          data: {
            month: currentMonth,
            income,
            expenses,
            netSavings: income - expenses,
            categories: Object.entries(categoryMap).map(([cat, amt]) => ({ category: cat, amount: amt })),
            budgets: budgets.map(b => ({ category: b.category, budgeted: b.amount, spent: b.spent })),
            goals: goals.map(g => ({ name: g.name, target: g.targetAmount, saved: g.savedAmount, status: g.status })),
            accounts: accounts.map(a => ({ name: a.name, type: a.type, balance: a.balance })),
            totalBalance: accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0),
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to generate report');
      }

      if (!resp.body) throw new Error('No response');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setReport(fullText);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [transactions, budgets, goals, accounts]);

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow border border-dashed border-primary/30">
      <div className="flex items-center gap-2 mb-2">
        <FileText size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Monthly AI Report</h2>
      </div>
      {report ? (
        <>
          <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">{report}</div>
          <button
            onClick={generateReport}
            disabled={loading}
            className="mt-3 w-full py-2 rounded-xl bg-accent text-accent-foreground text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Regenerating…</> : <><FileText size={14} /> Regenerate Report</>}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">AI-generated spending trends, category analysis, and goal progress</p>
          <button
            onClick={generateReport}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><FileText size={14} /> Generate Report</>}
          </button>
        </>
      )}
    </div>
  );
};

export default MonthlyReportCard;
