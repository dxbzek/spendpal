import { useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { Sparkles, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { differenceInDays, endOfMonth } from 'date-fns';

const Budgets = () => {
  const { budgets } = useFinance();

  const now = new Date();
  const daysLeft = differenceInDays(endOfMonth(now), now);
  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const overallPct = totalBudgeted ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-heading mb-1">Budgets</h1>
        <p className="text-sm text-muted-foreground">{now.toLocaleString('en', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="px-4 space-y-4">
        {/* Overall */}
        <div className="bg-card rounded-2xl p-4 card-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{overallPct}% spent</span>
            <span className="text-xs text-muted-foreground">{daysLeft} days left</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>د.إ {fmt(totalSpent)}</span>
            <span>د.إ {fmt(totalBudgeted)}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(overallPct, 100)}%` }}
              transition={{ duration: 0.6 }}
              className={`h-full rounded-full ${overallPct > 90 ? 'bg-expense' : 'bg-primary'}`} />
          </div>
        </div>

        {/* Budget cards */}
        {budgets.map(b => {
          const pct = b.amount ? Math.round((b.spent / b.amount) * 100) : 0;
          const remaining = b.amount - b.spent;
          const dailyLeft = daysLeft > 0 ? remaining / daysLeft : 0;

          return (
            <div key={b.id} className="bg-card rounded-2xl p-4 card-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{b.categoryIcon}</span>
                  <div>
                    <p className="text-sm font-medium">{b.category}</p>
                    <p className="text-xs text-muted-foreground capitalize">{b.period} · {daysLeft}d left</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  pct > 90 ? 'bg-destructive/10 text-expense' : pct > 60 ? 'bg-warning/10 text-warning' : 'bg-accent text-accent-foreground'
                }`}>{pct}%</span>
              </div>

              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }}
                  transition={{ duration: 0.5 }}
                  className={`h-full rounded-full ${pct > 90 ? 'bg-expense' : pct > 60 ? 'bg-warning' : 'bg-primary'}`} />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Spent</p>
                  <p className="text-sm font-medium">د.إ {fmt(b.spent)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`text-sm font-medium ${remaining < 0 ? 'text-expense' : ''}`}>د.إ {fmt(remaining)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Daily left</p>
                  <p className="text-sm font-medium">د.إ {fmt(dailyLeft)}</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* AI Budget Suggestions */}
        <div className="bg-card rounded-2xl p-4 card-shadow border border-dashed border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-primary" />
            <h2 className="font-heading text-sm">AI Budget Suggestions</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Get AI-recommended budget amounts based on your spending</p>
          <button className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium flex items-center justify-center gap-2">
            <Sparkles size={14} /> Generate Suggestions
          </button>
        </div>

        {/* Add Budget */}
        <button className="w-full py-3 rounded-2xl border-2 border-dashed border-border text-muted-foreground text-sm font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors">
          <Plus size={18} /> Add Budget
        </button>
      </div>

      <div className="h-4" />
    </div>
  );
};

export default Budgets;
