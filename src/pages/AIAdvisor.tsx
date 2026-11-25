import { useState, useMemo, useEffect, useCallback } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { useAI, type BudgetAnalysis, type AdvisorSession } from '@/hooks/useAI';
import { activeBudgets } from '@/utils/budgets';
import { isCountableExpense } from '@/lib/finance/transactionFilters';
import { buildAdvisorData, presentAnalysis } from '@/lib/finance/advisorData';
import { nextResetAt, usageLine } from '@/lib/aiUsage';
import { format, parseISO, subMonths, getMonth, getYear, differenceInCalendarDays } from 'date-fns';
import { m, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertTriangle, CheckCircle2,
  Lightbulb, ArrowRight, RefreshCw, Zap, ExternalLink, Info,
  Trash2, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroCard, HeroChip, IconButton, ListCard, SectionLabel, SectionAction, PAGE_X } from '@/components/orbix';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import AppIcon, { IconTile } from '@/components/AppIcon';

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
  warning: <AlertTriangle size={17} className="text-warning" />,
  positive: <CheckCircle2 size={17} className="text-income" />,
  suggestion: <Lightbulb size={17} className="text-primary" />,
};

// Budget Health Score: a big number that counts up on mount.
// Honors prefers-reduced-motion by landing on the final value immediately.
const HealthScore = ({ score }: { score: number }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVal(score);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const dur = 900;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setVal(score * ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const safety = window.setTimeout(() => setVal(score), dur + 450);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [score]);
  return (
    <p className="text-[3.25rem] leading-none font-medium tracking-tight tabular-nums">
      {Math.round(val)}<span className="text-[0.45em] opacity-60">/100</span>
    </p>
  );
};

const AIAdvisor = () => {
  const navigate = useNavigate();
  const { transactions, accounts, budgets, goals, addBudget } = useFinance();
  const { fmt, currency } = useCurrency();
  const { loading, generateBudgetAnalysis, fetchAdvisorHistory, deleteAdvisorSession, remaining, refreshUsage } = useAI();

  // AI uses left today. The server counts them; ask once when the page opens.
  useEffect(() => { refreshUsage(); }, [refreshUsage]);
  const limitReached = remaining === 0;
  const usageText = usageLine(remaining, format(nextResetAt(new Date()), 'HH:mm'));

  const { hidden, mask } = useBalanceMask();
  const [analysis, setAnalysis] = useState<BudgetAnalysis | null>(null);
  const [activeSimTab, setActiveSimTab] = useState<string>('envelope');
  const [applyingEnvelopes, setApplyingEnvelopes] = useState(false);
  // When the analysis on screen was made. Its figures are from that day, not today.
  const [analysisAt, setAnalysisAt] = useState<string | null>(null);
  const [history, setHistory] = useState<AdvisorSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    const sessions = await fetchAdvisorHistory();
    setHistory(sessions);
    // Pre-load the most recent session so the last results show without re-running.
    if (sessions.length > 0 && !analysis) {
      setAnalysis(sessions[0].result);
      setAnalysisAt(sessions[0].created_at);
    }
  }, [fetchAdvisorHistory, analysis]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // monthKey is fixed for the session, so the empty dep array is intentional.
  const monthKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const now = useMemo(() => new Date(), []);

  // What the model is told: countable rows only, recurring merchants once.
  const financialData = useMemo(
    () => buildAdvisorData(transactions, accounts, activeBudgets(budgets, monthKey), goals, now, currency),
    [transactions, accounts, budgets, goals, currency, now, monthKey],
  );
  // What's shown: in the second person, and only advice tied to your own data.
  const shown = useMemo(() => (analysis ? presentAnalysis(analysis, financialData) : null), [analysis, financialData]);

  // Flag categories where this month's spend is 2x+ the 3-month average.
  const anomalies = useMemo(() => {
    const n = new Date();
    const thisM = n.getMonth(), thisY = n.getFullYear();

    // Current month spending by category
    const curMap: Record<string, number> = {};
    transactions.forEach(tx => {
      if (!isCountableExpense(tx)) return;
      const d = parseISO(tx.date);
      if (d.getMonth() !== thisM || d.getFullYear() !== thisY) return;
      curMap[tx.category] = (curMap[tx.category] || 0) + tx.amount;
    });

    // Last 3 months average by category
    const histMap: Record<string, number[]> = {};
    for (let i = 1; i <= 3; i++) {
      const prev = subMonths(n, i);
      const pm = getMonth(prev), py = getYear(prev);
      const monthMap: Record<string, number> = {};
      transactions.forEach(tx => {
        if (!isCountableExpense(tx)) return;
        const d = parseISO(tx.date);
        if (d.getMonth() !== pm || d.getFullYear() !== py) return;
        monthMap[tx.category] = (monthMap[tx.category] || 0) + tx.amount;
      });
      Object.entries(monthMap).forEach(([cat, amt]) => {
        if (!histMap[cat]) histMap[cat] = [];
        histMap[cat].push(amt);
      });
    }

    return Object.entries(curMap)
      .filter(([cat, amt]) => {
        const hist = histMap[cat];
        if (!hist || hist.length === 0) return false;
        const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
        return avg > 0 && amt >= avg * 2;
      })
      .map(([cat, amt]) => {
        const hist = histMap[cat]!;
        const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
        const icon = transactions.find(tx => tx.category === cat)?.categoryIcon || '📌';
        return { category: cat, icon, current: amt, avg, multiple: Math.round((amt / avg) * 10) / 10 };
      })
      .sort((a, b) => b.multiple - a.multiple);
  }, [transactions]);

  const handleAnalyze = async () => {
    if (transactions.length < 3) {
      toast.error('Add at least a few transactions for the AI to analyze');
      return;
    }
    const result = await generateBudgetAnalysis(financialData);
    if (result) {
      setAnalysis(result);
      setAnalysisAt(new Date().toISOString());
      loadHistory(); // refresh history list
    }
  };

  const handleApplyEnvelopes = async () => {
    if (!analysis?.suggestedEnvelopes) return;
    setApplyingEnvelopes(true);
    try {
      let created = 0, failed = 0;
      for (const env of analysis.suggestedEnvelopes) {
        // Check if budget already exists for this category this month
        const existing = budgets.find(b => b.category === env.category && b.month === monthKey);
        if (!existing) {
          const ok = await addBudget({
            category: env.category,
            categoryIcon: env.icon,
            amount: env.amount,
            period: 'monthly',
            month: monthKey,
          });
          if (ok) created++; else failed++;
        }
      }
      if (created > 0) toast.success(`${created} budget envelope${created > 1 ? 's' : ''} created. Check your Budgets page.`);
      else if (failed === 0) toast.info('Budgets already exist for this month. Check your Budgets page.');
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

  const outOfDate = analysisAt ? differenceInCalendarDays(new Date(), parseISO(analysisAt)) > 7 : false;

  return (
    <div className={`${PAGE_X} pb-6 max-w-4xl mx-auto`}>
      {/* Header: big title, round re-analyze button */}
      <div className="flex items-center justify-between gap-3 pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8 pb-4">
        <h1 className="text-[1.75rem] leading-tight font-heading font-semibold tracking-tight truncate">AI Advisor</h1>
        {analysis && (
          <IconButton aria-label="Re-analyze" title="Re-analyze" onClick={handleAnalyze} disabled={loading || limitReached}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </IconButton>
        )}
      </div>

      <div className="space-y-7">
        {/* Hero: the health score, or the start of an analysis */}
        {analysis ? (
          <HeroCard>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium opacity-80">Health score</p>
              <span className="hero-chip rounded-full px-2.5 py-1 text-xs font-medium">{scoreLabel(analysis.healthScore)}</span>
            </div>
            <div className="mt-2">
              <HealthScore score={analysis.healthScore} />
            </div>
            <p className="text-sm mt-2 opacity-80">
              {METHOD_LABELS[analysis.recommendedMethod]?.name}
              {analysisAt && <> · From {format(parseISO(analysisAt), 'd MMM')}{outOfDate ? ' · out of date' : ''}</>}
            </p>
            {(() => {
              const parts = [
                { label: 'Savings', value: analysis.healthBreakdown.savingsRatio },
                { label: 'Stability', value: analysis.healthBreakdown.expenseStability },
                { label: 'Budgets', value: analysis.healthBreakdown.budgetAdherence },
                { label: 'Debt', value: analysis.healthBreakdown.debtManagement },
              ];
              // The weakest part is the dark chip: that is where the points are.
              const weakest = parts.reduce((a, b) => (b.value < a.value ? b : a)).label;
              return (
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {parts.map(item => (
                    <div key={item.label} role="progressbar" aria-label={item.label} aria-valuenow={item.value} aria-valuemin={0} aria-valuemax={25}>
                      <HeroChip label={item.label} value={<>{item.value}<span className="text-[0.7em] opacity-60">/25</span></>}
                        dark={item.label === weakest} className="px-2.5" />
                    </div>
                  ))}
                </div>
              );
            })()}
            {usageText && (
              <p className={`text-xs mt-3 ${limitReached ? 'font-medium' : 'opacity-70'}`}>{usageText}</p>
            )}
          </HeroCard>
        ) : (
          <HeroCard>
            <p className="text-sm font-medium opacity-80">Budget analysis</p>
            <p className="text-[1.6rem] leading-tight font-medium tracking-tight mt-1">See where your money goes and what to change</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <HeroChip label="Accounts" value={accounts.length} className="px-2.5" />
              <HeroChip label="Transactions" value={transactions.length} className="px-2.5" />
              <HeroChip label="Budgets" value={budgets.length} className="px-2.5" />
              <HeroChip label="Goals" value={goals.length} className="px-2.5" />
            </div>
            <button type="button" onClick={handleAnalyze} disabled={loading || limitReached}
              className="hero-chip-dark mt-4 w-full h-12 rounded-full text-[15px] font-medium inline-flex items-center justify-center disabled:opacity-60">
              {loading ? <><Loader2 size={18} className="animate-spin mr-2" /> Analyzing…</> : <><Zap size={18} className="mr-2" /> Analyze</>}
            </button>
            {usageText && (
              <p className={`text-xs mt-3 text-center ${limitReached ? 'font-medium' : 'opacity-70'}`}>{usageText}</p>
            )}
          </HeroCard>
        )}

        {/* Loading skeleton */}
        {loading && !analysis && (
          <div className="bg-card rounded-3xl px-4 divide-y divide-border">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 py-3.5 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-muted shrink-0" />
                <div className="flex-1">
                  <div className="h-3.5 bg-muted rounded-full w-2/3 mb-2" />
                  <div className="h-3 bg-muted rounded-full w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Spending Anomalies */}
        {anomalies.length > 0 && (
          <section>
            <SectionLabel label="Unusual spending" count={anomalies.length} />
            <ListCard>
              {anomalies.map(a => (
                <div key={a.category} className="flex items-center gap-3 py-3.5">
                  <IconTile value={a.icon} className="w-11 h-11" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium truncate">{a.category}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Avg: {mask(fmt(a.avg))}/mo</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-medium tabular-nums">{mask(fmt(a.current))}</p>
                    <p className="text-xs font-medium text-warning mt-0.5">{a.multiple}× average</p>
                  </div>
                </div>
              ))}
            </ListCard>
          </section>
        )}

        {/* Results */}
        <AnimatePresence>
          {analysis && (
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-7">

              {shown?.methodReason && (
                <details className="bg-card rounded-3xl px-4 group">
                  <summary className="flex items-center justify-between gap-3 py-4 cursor-pointer list-none">
                    <span className="text-[15px] font-medium">Why {METHOD_LABELS[analysis.recommendedMethod]?.name ?? 'this method'}</span>
                    <ChevronDown size={16} className="text-muted-foreground shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="text-sm text-muted-foreground leading-relaxed pb-4">{shown.methodReason}</p>
                </details>
              )}

              {/* Insights */}
              {!!shown?.insights.length && (
                <section>
                  <SectionLabel label="Insights" count={shown.insights.length} />
                  <ListCard>
                    {shown.insights.map((insight) => (
                      <details key={insight.title} className="group">
                        <summary className="flex items-center gap-3 cursor-pointer list-none py-3">
                          <span className="w-11 h-11 shrink-0 rounded-full bg-muted flex items-center justify-center">{INSIGHT_ICONS[insight.type]}</span>
                          <span className="text-[15px] font-medium flex-1">{insight.title}</span>
                          <ChevronDown size={16} className="text-muted-foreground shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <p className="text-sm text-muted-foreground leading-relaxed pb-3.5 pl-14">{insight.description}</p>
                      </details>
                    ))}
                  </ListCard>
                </section>
              )}

              {/* Suggested Envelopes */}
              <section>
                <SectionLabel label="Suggested budgets" count={analysis.suggestedEnvelopes.length}
                  action={
                    <SectionAction onClick={handleApplyEnvelopes} disabled={applyingEnvelopes}>
                      {applyingEnvelopes ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}
                      Apply All
                    </SectionAction>
                  } />
                {(() => {
                  // Only envelopes that move by at least 1 are worth a row; the rest is one line.
                  const changed = analysis.suggestedEnvelopes.filter(env => Math.abs(env.amount - env.currentSpending) >= 1);
                  const same = analysis.suggestedEnvelopes.length - changed.length;
                  return (
                    <ListCard>
                      {changed.map((env) => {
                        const diff = env.amount - env.currentSpending;
                        return (
                          <div key={env.category} className="flex items-center gap-3 py-3">
                            <IconTile value={env.icon} className="w-11 h-11" />
                            <span className="text-[15px] font-medium truncate flex-1 min-w-0">{env.category}</span>
                            <div className="text-right shrink-0">
                              <p className="text-[15px] font-medium tabular-nums">{mask(fmt(env.amount))}</p>
                              <p className={`text-xs tabular-nums mt-0.5 ${diff >= 0 ? 'text-income' : 'text-expense'}`}>
                                {hidden ? '••' : `${diff >= 0 ? '+' : '−'}${Math.round(Math.abs(diff)).toLocaleString('en')}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      {same > 0 && <p className="text-xs text-muted-foreground py-3">{same} unchanged</p>}
                    </ListCard>
                  );
                })()}
              </section>

              {/* Budget Simulation */}
              <details className="bg-card rounded-3xl px-4 group">
                <summary className="text-[15px] font-medium cursor-pointer list-none flex items-center justify-between py-4">
                  Compare methods <ChevronDown size={16} className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    { key: 'envelope', label: 'Envelope', value: analysis.simulation.envelope },
                    { key: '50-30-20', label: '50/30/20', value: analysis.simulation.fiftyThirtyTwenty },
                    { key: 'zero-based', label: 'Zero-Based', value: analysis.simulation.zeroBased },
                    { key: 'hybrid', label: 'Hybrid', value: analysis.simulation.hybrid },
                  ] as const).map(sim => {
                    const detail = METHOD_DETAILS[sim.key];
                    const active = activeSimTab === sim.key;
                    return (
                      <div key={sim.key} className="relative">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setActiveSimTab(sim.key)}
                              aria-pressed={active}
                              className={`w-full px-3 py-3 rounded-2xl text-left transition-colors ${
                                active ? 'bg-primary text-primary-foreground' : 'bg-muted'
                              }`}>
                              <p className={`text-xs mb-1 ${active ? 'opacity-70' : 'text-muted-foreground'}`}>
                                {sim.label}
                                {sim.key === analysis.recommendedMethod && (
                                  <span className={`ml-1.5 font-medium ${active ? '' : 'text-primary'}`}>· Best</span>
                                )}
                              </p>
                              <p className={`text-[15px] font-medium tabular-nums ${active ? '' : sim.value > 0 ? 'text-income' : 'text-expense'}`}>
                                {hidden ? '••••••' : `${sim.value > 0 ? '+' : ''}${fmt(sim.value)}`}
                              </p>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-[200px]">
                            {detail?.desc}
                          </TooltipContent>
                        </Tooltip>
                        {detail && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <button aria-label={`About ${detail.name}`}
                                className={`absolute top-1.5 right-1.5 p-1.5 rounded-full transition-colors ${active ? 'text-primary-foreground/70' : 'text-muted-foreground hover:text-primary'}`}
                                onClick={e => e.stopPropagation()}>
                                <Info size={13} />
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg">
                                  <AppIcon value={detail.emoji} /> {detail.name}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 text-sm">
                                <div>
                                  <h4 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">How it works</h4>
                                  <p className="text-foreground">{detail.how}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-income-soft border border-income-line rounded-xl p-3">
                                    <h4 className="font-heading text-xs text-income mb-2">Pros</h4>
                                    <ul className="space-y-1">
                                      {detail.pros.map((p) => (
                                        <li key={p} className="text-xs text-muted-foreground">• {p}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div className="bg-expense-soft border border-expense-line rounded-xl p-3">
                                    <h4 className="font-heading text-xs text-expense mb-2">Cons</h4>
                                    <ul className="space-y-1">
                                      {detail.cons.map((c) => (
                                        <li key={c} className="text-xs text-muted-foreground">• {c}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                                <div className="bg-primary-soft border border-primary-line rounded-xl p-3">
                                  <h4 className="font-heading text-xs text-primary mb-1">Best for</h4>
                                  <p className="text-xs text-muted-foreground">{detail.bestFor}</p>
                                </div>
                                <div className="bg-muted rounded-xl p-3">
                                  <h4 className="font-heading text-xs text-muted-foreground mb-1">Example</h4>
                                  <p className="text-xs text-muted-foreground">{detail.example}</p>
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
                    const income = financialData.monthlyIncome;
                    // Build the list of budgets to apply based on the active method
                    let toApply: Array<{ category: string; categoryIcon: string; amount: number }> = [];
                    if (activeSimTab === '50-30-20') {
                      if (income <= 0) {
                        toast.error('No income recorded this month — add income transactions first');
                        return;
                      }
                      toApply = [
                        { category: 'Needs', categoryIcon: '🏠', amount: Math.round(income * 0.5) },
                        { category: 'Wants', categoryIcon: '🎉', amount: Math.round(income * 0.3) },
                        { category: 'Savings', categoryIcon: '💰', amount: Math.round(income * 0.2) },
                      ];
                    } else {
                      if (!analysis.suggestedEnvelopes?.length) {
                        toast.error('No budget envelopes available — run the AI analysis first');
                        return;
                      }
                      toApply = analysis.suggestedEnvelopes.map(env => ({
                        category: env.category,
                        categoryIcon: env.icon,
                        amount: env.amount,
                      }));
                    }
                    setApplyingEnvelopes(true);
                    try {
                      let created = 0, failed = 0;
                      for (const item of toApply) {
                        const existing = budgets.find(b => b.category === item.category && b.month === monthKey);
                        if (!existing) {
                          const ok = await addBudget({
                            category: item.category,
                            categoryIcon: item.categoryIcon,
                            amount: item.amount,
                            period: 'monthly',
                            month: monthKey,
                          });
                          if (ok) created++; else failed++;
                        }
                      }
                      // Every insert failed: stay here (the errors are already toasted).
                      if (created === 0 && failed > 0) return;
                      if (created === 0) {
                        toast.info('Budgets already exist for this month — check your Budgets page');
                      } else {
                        toast.success(`${METHOD_LABELS[activeSimTab]?.name} budgets created`);
                      }
                      navigate('/budgets');
                    } catch {
                      toast.error('Failed to create budgets');
                    } finally {
                      setApplyingEnvelopes(false);
                    }
                  }}
                  disabled={applyingEnvelopes}
                  className="w-full mt-3 mb-4 rounded-full bg-primary text-primary-foreground h-12 text-[15px] font-medium"
                >
                  {applyingEnvelopes ? (
                    <><Loader2 size={16} className="animate-spin mr-2 shrink-0" /> Creating…</>
                  ) : (
                    <><ExternalLink size={16} className="mr-2 shrink-0" /> <span className="truncate">Apply & Go to Budgets</span></>
                  )}
                </Button>
              </details>

              {/* Dynamic Adjustments */}
              {!!shown?.dynamicAdjustments.length && (
                <section>
                  <SectionLabel label="Next steps" count={shown.dynamicAdjustments.length} />
                  {(() => {
                    const row = (adj: { action: string; impact: string }) => (
                      <div key={adj.action} className="flex items-start gap-3 py-3.5">
                        <span className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                          <ArrowRight size={14} className="text-primary" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[15px]">{adj.action}</p>
                          <p className="text-xs text-primary mt-0.5">{adj.impact}</p>
                        </div>
                      </div>
                    );
                    const first = shown.dynamicAdjustments.slice(0, 3);
                    const rest = shown.dynamicAdjustments.slice(3);
                    return (
                      <ListCard>
                        {first.map(row)}
                        {rest.length > 0 && (
                          <details>
                            <summary className="text-sm text-primary font-medium cursor-pointer list-none py-3.5">{rest.length} more</summary>
                            <div className="divide-y divide-border border-t border-border">{rest.map(row)}</div>
                          </details>
                        )}
                      </ListCard>
                    );
                  })()}
                </section>
              )}
            </m.div>
          )}
        </AnimatePresence>

        {/* Past Sessions */}
        {history.length > 0 && (
          <section>
            <SectionLabel label="Past analyses" count={history.length}
              action={history.length > 1 ? <SectionAction onClick={() => setShowHistory(h => !h)} aria-expanded={showHistory}>{showHistory ? 'Hide' : 'See all'}</SectionAction> : undefined} />
            <ListCard>
              {(showHistory ? history : history.slice(0, 1)).map(session => (
                <div key={session.id} className="flex items-center gap-1">
                  <button
                    onClick={() => { setAnalysis(session.result); setAnalysisAt(session.created_at); setActiveSimTab(session.result.recommendedMethod); }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left py-3.5">
                    <span className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0 text-[18px]">
                      <AppIcon value={METHOD_DETAILS[session.result.recommendedMethod]?.emoji ?? '📊'} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium truncate">
                        {METHOD_DETAILS[session.result.recommendedMethod]?.name ?? session.result.recommendedMethod}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(session.created_at), 'MMM d, yyyy · h:mm a')}
                      </span>
                    </span>
                    <span className={`text-[15px] font-medium tabular-nums shrink-0 ${scoreColor(session.result.healthScore)}`}>
                      {session.result.healthScore}<span className="text-xs text-muted-foreground">/100</span>
                    </span>
                  </button>
                  <button
                    aria-label="Delete analysis"
                    onClick={async () => {
                      const ok = await deleteAdvisorSession(session.id);
                      if (ok) setHistory(prev => prev.filter(s => s.id !== session.id));
                    }}
                    className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full text-muted-foreground/60 hover:text-destructive transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </ListCard>
          </section>
        )}
      </div>
    </div>
  );
};

export default AIAdvisor;
