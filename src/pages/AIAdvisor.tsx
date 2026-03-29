import { useState, useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useAI, type BudgetAnalysis } from '@/hooks/useAI';
import { parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Lightbulb, ArrowRight, RefreshCw, Wallet, BarChart3, Shield, Target, Zap, ExternalLink, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const METHOD_DETAILS: Record<string, {
  name: string; emoji: string; desc: string;
  how: string; pros: string[]; cons: string[]; bestFor: string; example: string;
}> = {
  'envelope': {
    name: 'Envelope Budgeting', emoji: '✉️',
    desc: 'Fixed cash limits per spending category',
    how: 'Divide your income into "envelopes" for each category (groceries, dining, etc.). Once an envelope is empty, you stop spending in that category.',
    pros: ['Great for controlling overspending', 'Very visual and intuitive', 'Forces prioritization'],
    cons: ['Less flexible for unexpected expenses', 'Requires discipline to not "borrow" between envelopes'],
    bestFor: 'People who tend to overspend in specific categories.',
    example: 'Income: 10,000 → Rent: 3,000 | Groceries: 1,500 | Dining: 800 | Transport: 600 | Fun: 500 | Savings: 3,600',
  },
  '50-30-20': {
    name: '50/30/20 Rule', emoji: '📊',
    desc: '50% needs, 30% wants, 20% savings',
    how: 'Split after-tax income into three buckets: 50% for needs (rent, utilities, groceries), 30% for wants (dining, entertainment), and 20% for savings & debt repayment.',
    pros: ['Simple to understand and start', 'Flexible within each bucket', 'Good balance of saving and living'],
    cons: ['May not work in high-cost-of-living areas', 'Doesn\'t account for individual priorities'],
    bestFor: 'Beginners or anyone wanting a simple, balanced framework.',
    example: 'Income: 10,000 → Needs (50%): 5,000 | Wants (30%): 3,000 | Savings (20%): 2,000',
  },
  'zero-based': {
    name: 'Zero-Based Budgeting', emoji: '🎯',
    desc: 'Every dollar gets assigned a purpose',
    how: 'Allocate every single unit of income to a specific category until your budget equals zero. Income minus all allocations = 0.',
    pros: ['Maximum control over every dollar', 'Reveals wasteful spending quickly', 'Great for debt payoff goals'],
    cons: ['Time-consuming to set up each month', 'Requires tracking every expense'],
    bestFor: 'Detail-oriented people or those aggressively paying off debt.',
    example: 'Income: 10,000 → Rent: 3,000 | Food: 1,200 | Transport: 500 | Insurance: 400 | Debt: 2,000 | Savings: 1,500 | Fun: 900 | Misc: 500 = 0 remaining',
  },
  'hybrid': {
    name: 'Hybrid Budget', emoji: '🔄',
    desc: 'Envelopes for variable + traditional for fixed costs',
    how: 'Use fixed allocations for predictable bills (rent, subscriptions) and envelope-style limits for variable spending (food, entertainment). Combines structure with flexibility.',
    pros: ['Best of both worlds', 'Fixed costs are automated', 'Variable costs stay controlled'],
    cons: ['Slightly more complex to set up', 'Need to categorize expenses as fixed vs. variable'],
    bestFor: 'People with stable income who want structure without rigidity.',
    example: 'Fixed: Rent 3,000 + Utilities 500 + Insurance 400 = auto-paid | Variable envelopes: Food 1,500 | Transport 600 | Fun 800 | Savings: remainder',
  },
};

const METHOD_LABELS = METHOD_DETAILS;

const INSIGHT_ICONS = {
  warning: <AlertTriangle size={16} className="text-warning" />,
  positive: <CheckCircle2 size={16} className="text-income" />,
  suggestion: <Lightbulb size={16} className="text-primary" />,
};

const INSIGHT_COLORS = {
  warning: 'bg-warning/10 border-warning/20',
  positive: 'bg-accent border-accent-foreground/10',
  suggestion: 'bg-primary/5 border-primary/20',
};

const AIAdvisor = () => {
  const navigate = useNavigate();
  const { transactions, accounts, budgets, goals, addBudget } = useFinance();
  const { fmt, currency } = useCurrency();
  const { loading, generateBudgetAnalysis } = useAI();
  const [analysis, setAnalysis] = useState<BudgetAnalysis | null>(null);
  const [activeSimTab, setActiveSimTab] = useState<string>('envelope');
  const [applyingEnvelopes, setApplyingEnvelopes] = useState(false);

  // monthKey is stable for the lifetime of the session — the month won't change
  // while the user has the app open, so an empty dep array is correct here.
  const monthKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const now = useMemo(() => new Date(), [new Date().getMonth(), new Date().getFullYear()]);

  // Build financial summary for AI
  const financialData = useMemo(() => {
    const monthlyTx = transactions.filter(tx => {
      const d = parseISO(tx.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const income = monthlyTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = monthlyTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const categories: Record<string, { total: number; icon: string; count: number }> = {};
    monthlyTx.filter(t => t.type === 'expense').forEach(t => {
      if (!categories[t.category]) categories[t.category] = { total: 0, icon: t.categoryIcon, count: 0 };
      categories[t.category].total += t.amount;
      categories[t.category].count++;
    });

    const recurring = transactions.filter(t => t.isRecurring);
    const creditCards = accounts.filter(a => a.type === 'credit');
    const totalBalance = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);

    return {
      currency,
      monthlyIncome: income,
      monthlyExpenses: expenses,
      netSavings: income - expenses,
      totalBalance,
      categories: Object.entries(categories).map(([name, d]) => ({ name, ...d })),
      recurringExpenses: recurring.map(r => ({ merchant: r.merchant, amount: r.amount, category: r.category })),
      creditCards: creditCards.map(c => ({
        name: c.name,
        balance: c.balance,
        creditLimit: c.creditLimit,
        utilization: c.creditLimit ? Math.round(((c.creditLimit - c.balance) / c.creditLimit) * 100) : 0,
      })),
      existingBudgets: budgets.map(b => ({ category: b.category, amount: b.amount, spent: b.spent })),
      goals: goals.map(g => ({ name: g.name, target: g.targetAmount, saved: g.savedAmount, type: g.type })),
      transactionCount: transactions.length,
      accountCount: accounts.length,
    };
  }, [transactions, accounts, budgets, goals, currency, now]);

  const handleAnalyze = async () => {
    if (transactions.length < 3) {
      toast.error('Add at least a few transactions for the AI to analyze');
      return;
    }
    const result = await generateBudgetAnalysis(financialData);
    if (result) setAnalysis(result);
  };

  const handleApplyEnvelopes = async () => {
    if (!analysis?.suggestedEnvelopes) return;
    setApplyingEnvelopes(true);
    try {
      for (const env of analysis.suggestedEnvelopes) {
        // Check if budget already exists for this category this month
        const existing = budgets.find(b => b.category === env.category && b.month === monthKey);
        if (!existing) {
          await addBudget({
            category: env.category,
            categoryIcon: env.icon,
            amount: env.amount,
            period: 'monthly',
            month: monthKey,
          });
        }
      }
      toast.success('Budget envelopes created! Check your Budgets page.');
    } catch {
      toast.error('Failed to create some envelopes');
    } finally {
      setApplyingEnvelopes(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 75) return 'text-income';
    if (score >= 50) return 'text-warning';
    return 'text-expense';
  };

  const scoreLabel = (score: number) => {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 30) return 'Needs Work';
    return 'Critical';
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="gradient-primary px-5 md:px-8 pt-12 pb-8 rounded-b-3xl md:rounded-b-none">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Brain size={28} className="text-primary-foreground" />
            <h1 className="text-2xl font-heading text-primary-foreground">AI Budget Advisor</h1>
          </div>
          <p className="text-primary-foreground/70 text-sm">
            Smart analysis of your spending habits with personalized budgeting recommendations
          </p>
        </div>
      </div>

      <div className="px-5 md:px-8 mt-4 pb-6 max-w-4xl mx-auto space-y-4">
        {/* Analyze Button */}
        {!analysis && (
          <div className="bg-card rounded-2xl p-6 card-shadow text-center">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
              <Brain size={32} className="text-primary-foreground" />
            </div>
            <h2 className="font-heading text-lg mb-2">Get Your Budget Analysis</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              AI will analyze your income, expenses, spending patterns, and goals to recommend the best budgeting strategy for you.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-left">
              {[
                { icon: Wallet, label: `${accounts.length} accounts` },
                { icon: BarChart3, label: `${transactions.length} transactions` },
                { icon: Shield, label: `${budgets.length} budgets` },
                { icon: Target, label: `${goals.length} goals` },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 bg-muted/50 rounded-xl p-3">
                  <Icon size={16} className="text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <Button onClick={handleAnalyze} disabled={loading} className="gradient-primary text-primary-foreground px-8 h-12 text-base">
              {loading ? <><Loader2 size={18} className="animate-spin mr-2" /> Analyzing…</> : <><Zap size={18} className="mr-2" /> Analyze My Finances</>}
            </Button>
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {analysis && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

              {/* Refresh button */}
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleAnalyze} disabled={loading} className="text-xs text-muted-foreground">
                  <RefreshCw size={14} className={loading ? 'animate-spin mr-1' : 'mr-1'} /> Re-analyze
                </Button>
              </div>

              {/* Recommended Method */}
              <div className="bg-card rounded-2xl p-5 card-shadow border-2 border-primary/20">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl">{METHOD_LABELS[analysis.recommendedMethod]?.emoji}</span>
                  <div>
                    <p className="text-xs text-primary font-medium uppercase tracking-wide">Recommended Method</p>
                    <h2 className="font-heading text-lg">{METHOD_LABELS[analysis.recommendedMethod]?.name}</h2>
                    <p className="text-xs text-muted-foreground">{METHOD_LABELS[analysis.recommendedMethod]?.desc}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{analysis.methodReason}</p>
              </div>

              {/* Health Score + Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card rounded-2xl p-5 card-shadow">
                  <h3 className="font-heading text-sm mb-3">Budget Health Score</h3>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative w-20 h-20">
                      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                        <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--primary))" strokeWidth="6"
                          strokeDasharray={`${(analysis.healthScore / 100) * 213.6} 213.6`}
                          strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-xl font-heading ${scoreColor(analysis.healthScore)}`}>{analysis.healthScore}</span>
                      </div>
                    </div>
                    <div>
                      <p className={`text-lg font-heading ${scoreColor(analysis.healthScore)}`}>{scoreLabel(analysis.healthScore)}</p>
                      <p className="text-xs text-muted-foreground">out of 100</p>
                    </div>
                  </div>
                </div>

                <div className="bg-card rounded-2xl p-5 card-shadow">
                  <h3 className="font-heading text-sm mb-3">Score Breakdown</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Savings Ratio', value: analysis.healthBreakdown.savingsRatio, max: 25 },
                      { label: 'Expense Stability', value: analysis.healthBreakdown.expenseStability, max: 25 },
                      { label: 'Budget Adherence', value: analysis.healthBreakdown.budgetAdherence, max: 25 },
                      { label: 'Debt Management', value: analysis.healthBreakdown.debtManagement, max: 25 },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium">{item.value}/{item.max}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(item.value / item.max) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="bg-card rounded-2xl p-5 card-shadow">
                <h3 className="font-heading text-sm mb-3">Behavior Insights</h3>
                <div className="space-y-2.5">
                  {analysis.insights.map((insight, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${INSIGHT_COLORS[insight.type]}`}>
                      <div className="shrink-0 mt-0.5">{INSIGHT_ICONS[insight.type]}</div>
                      <div>
                        <p className="text-sm font-medium">{insight.title}</p>
                        <p className="text-xs text-muted-foreground">{insight.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Envelopes */}
              <div className="bg-card rounded-2xl p-5 card-shadow">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading text-sm">Suggested Budget Envelopes</h3>
                  <Button size="sm" onClick={handleApplyEnvelopes} disabled={applyingEnvelopes}
                    className="text-xs gradient-primary text-primary-foreground h-8">
                    {applyingEnvelopes ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                    Apply All
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {analysis.suggestedEnvelopes.map((env, i) => {
                    const diff = env.amount - env.currentSpending;
                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{env.icon}</span>
                          <div>
                            <p className="text-sm font-medium">{env.category}</p>
                            <p className="text-[10px] text-muted-foreground">Currently: {fmt(env.currentSpending)}/mo</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-heading">{fmt(env.amount)}</p>
                          <p className={`text-[10px] font-medium ${diff >= 0 ? 'text-income' : 'text-expense'}`}>
                            {diff >= 0 ? <TrendingUp size={10} className="inline mr-0.5" /> : <TrendingDown size={10} className="inline mr-0.5" />}
                            {diff >= 0 ? '+' : ''}{fmt(Math.abs(diff))}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Budget Simulation */}
              <div className="bg-card rounded-2xl p-5 card-shadow">
                <h3 className="font-heading text-sm mb-3">Budget Method Simulation</h3>
                <p className="text-xs text-muted-foreground mb-3">Estimated monthly savings with each method — tap to select</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    { key: 'envelope', label: 'Envelope', value: analysis.simulation.envelope },
                    { key: '50-30-20', label: '50/30/20', value: analysis.simulation.fiftyThirtyTwenty },
                    { key: 'zero-based', label: 'Zero-Based', value: analysis.simulation.zeroBased },
                    { key: 'hybrid', label: 'Hybrid', value: analysis.simulation.hybrid },
                  ] as const).map(sim => {
                    const detail = METHOD_DETAILS[sim.key];
                    return (
                      <div key={sim.key} className="relative">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setActiveSimTab(sim.key)}
                              className={`w-full p-3 rounded-xl text-center transition-all ${
                                activeSimTab === sim.key ? 'bg-primary/10 border-2 border-primary' : 'bg-muted/30 border-2 border-transparent'
                              } ${sim.key === analysis.recommendedMethod ? 'ring-2 ring-primary/30 ring-offset-2 ring-offset-card' : ''}`}>
                              <p className="text-xs text-muted-foreground mb-1">{sim.label}</p>
                              <p className={`text-sm font-heading ${sim.value > 0 ? 'text-income' : 'text-expense'}`}>
                                {sim.value > 0 ? '+' : ''}{fmt(sim.value)}
                              </p>
                              {sim.key === analysis.recommendedMethod && (
                                <span className="text-[9px] text-primary font-medium">★ Recommended</span>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-[200px]">
                            {detail?.desc}
                          </TooltipContent>
                        </Tooltip>
                        {detail && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <button className="absolute top-1 right-1 p-1 rounded-full text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" onClick={e => e.stopPropagation()}>
                                <Info size={12} />
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg">
                                  <span>{detail.emoji}</span> {detail.name}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 text-sm">
                                <div>
                                  <h4 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">How it works</h4>
                                  <p className="text-foreground/80">{detail.how}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-income/5 border border-income/20 rounded-xl p-3">
                                    <h4 className="font-heading text-xs text-income mb-2">✅ Pros</h4>
                                    <ul className="space-y-1">
                                      {detail.pros.map((p, i) => (
                                        <li key={i} className="text-xs text-foreground/70">• {p}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div className="bg-expense/5 border border-expense/20 rounded-xl p-3">
                                    <h4 className="font-heading text-xs text-expense mb-2">⚠️ Cons</h4>
                                    <ul className="space-y-1">
                                      {detail.cons.map((c, i) => (
                                        <li key={i} className="text-xs text-foreground/70">• {c}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                                  <h4 className="font-heading text-xs text-primary mb-1">🎯 Best for</h4>
                                  <p className="text-xs text-foreground/70">{detail.bestFor}</p>
                                </div>
                                <div className="bg-muted/50 rounded-xl p-3">
                                  <h4 className="font-heading text-xs text-muted-foreground mb-1">📝 Example</h4>
                                  <p className="text-xs text-foreground/70">{detail.example}</p>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Button
                  onClick={async () => {
                    if (!analysis.suggestedEnvelopes) return;
                    setApplyingEnvelopes(true);
                    try {
                      for (const env of analysis.suggestedEnvelopes) {
                        const existing = budgets.find(b => b.category === env.category && b.month === monthKey);
                        if (!existing) {
                          await addBudget({
                            category: env.category,
                            categoryIcon: env.icon,
                            amount: env.amount,
                            period: 'monthly',
                            month: monthKey,
                          });
                        }
                      }
                      toast.success(`${METHOD_LABELS[activeSimTab]?.name} budgets created!`);
                      navigate('/budgets');
                    } catch {
                      toast.error('Failed to create budgets');
                    } finally {
                      setApplyingEnvelopes(false);
                    }
                  }}
                  disabled={applyingEnvelopes}
                  className="w-full mt-4 gradient-primary text-primary-foreground h-11 text-sm"
                >
                  {applyingEnvelopes ? (
                    <><Loader2 size={16} className="animate-spin mr-2 shrink-0" /> Creating…</>
                  ) : (
                    <><ExternalLink size={16} className="mr-2 shrink-0" /> <span className="truncate">Apply & Go to Budgets</span></>
                  )}
                </Button>
              </div>

              {/* Dynamic Adjustments */}
              <div className="bg-card rounded-2xl p-5 card-shadow">
                <h3 className="font-heading text-sm mb-3">Recommended Adjustments</h3>
                <div className="space-y-2.5">
                  {analysis.dynamicAdjustments.map((adj, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-accent/30 rounded-xl">
                      <ArrowRight size={16} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">{adj.action}</p>
                        <p className="text-xs text-muted-foreground">{adj.impact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AIAdvisor;
