import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { CreditCard, TrendingDown, AlertCircle, CalendarClock, ChevronDown, ChevronUp, Zap, Snowflake } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addMonths, getDate } from 'date-fns';
import { Input } from '@/components/ui/input';

const DEFAULT_APR = 20; // %

function monthsToPayoff(principal: number, apr: number, monthlyPayment: number): number {
  if (monthlyPayment <= 0 || principal <= 0) return Infinity;
  const r = apr / 100 / 12;
  if (r === 0) return Math.ceil(principal / monthlyPayment);
  if (monthlyPayment <= principal * r) return Infinity;
  return Math.ceil(-Math.log(1 - (principal * r) / monthlyPayment) / Math.log(1 + r));
}

function totalInterest(principal: number, apr: number, monthlyPayment: number): number {
  const months = monthsToPayoff(principal, apr, monthlyPayment);
  if (months === Infinity) return Infinity;
  return monthlyPayment * months - principal;
}

function minPayment(principal: number): number {
  return Math.max(25, principal * 0.02);
}

// Simulate multi-card payoff with a fixed extra payment allocated per strategy
function simulateStrategy(
  debts: Array<{ id: string; owed: number; apr: number; minPay: number }>,
  order: typeof debts,
  extraBudget: number
): { totalInterest: number; months: number } {
  // Start with min payments for all, put extra towards priority card
  const states = debts.map(d => ({ ...d, balance: d.owed }));
  const minBudget = debts.reduce((s, d) => s + d.minPay, 0);
  const totalBudget = minBudget + extraBudget;

  let month = 0;
  let totalInt = 0;

  while (states.some(s => s.balance > 0) && month < 600) {
    month++;
    // Apply interest first
    states.forEach(s => {
      if (s.balance > 0) {
        s.balance += s.balance * (s.apr / 100 / 12);
      }
    });

    // Determine priority card (first in order that still has balance)
    const priorityId = order.find(o => states.find(s => s.id === o.id)!.balance > 0)?.id;
    let remaining = totalBudget;

    // Pay min on non-priority, full allocation on priority
    for (const state of states) {
      if (state.balance <= 0) continue;
      if (state.id === priorityId) continue;
      const pay = Math.min(state.minPay, state.balance);
      const beforeBalance = state.balance;
      state.balance = Math.max(0, state.balance - pay);
      totalInt += beforeBalance - state.balance - 0; // no int tracking needed, already added
      remaining -= pay;
    }

    // Put rest on priority
    const priorityState = states.find(s => s.id === priorityId);
    if (priorityState && priorityState.balance > 0) {
      const pay = Math.min(remaining, priorityState.balance);
      priorityState.balance = Math.max(0, priorityState.balance - pay);
    }
  }

  // Compute total interest: (total paid) - (original principal)
  const totalPaid = totalBudget * month - states.reduce((s, st) => s + Math.max(0, st.balance), 0);
  const originalPrincipal = debts.reduce((s, d) => s + d.owed, 0);
  return { totalInterest: Math.max(0, totalPaid - originalPrincipal), months: month };
}

const Debt = () => {
  const { accounts, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [aprs, setAprs] = useState<Record<string, number>>({});
  const [payments, setPayments] = useState<Record<string, number>>({});
  const [strategyTab, setStrategyTab] = useState<'avalanche' | 'snowball'>('avalanche');
  const [extraBudget, setExtraBudget] = useState(200);

  const todayDate = getDate(new Date());

  const creditDebts = useMemo(() =>
    accounts
      .filter(a => a.type === 'credit')
      .map(a => ({
        ...a,
        owed: a.creditLimit ? Math.max(0, a.creditLimit - a.balance) : 0,
        utilization: a.creditLimit ? ((a.creditLimit - a.balance) / a.creditLimit) * 100 : 0,
      }))
      .filter(a => a.owed > 0)
  , [accounts]);

  const totalOwed = creditDebts.reduce((s, d) => s + d.owed, 0);
  const totalLimit = creditDebts.reduce((s, d) => s + (d.creditLimit || 0), 0);
  const overallUtil = totalLimit ? (totalOwed / totalLimit) * 100 : 0;

  const getApr = (id: string) => aprs[id] ?? DEFAULT_APR;
  const getPayment = (id: string, owed: number) => payments[id] ?? minPayment(owed);

  const utilizationColor = (pct: number) => {
    if (pct >= 75) return 'text-expense bg-destructive/10';
    if (pct >= 30) return 'text-warning bg-warning/10';
    return 'text-income bg-income/10';
  };

  const utilizationBarColor = (pct: number) => {
    if (pct >= 75) return 'bg-expense';
    if (pct >= 30) return 'bg-warning';
    return 'bg-primary';
  };

  // Due date helpers
  const getDueDaysRemaining = (dueDate?: number) => {
    if (!dueDate) return null;
    const diff = dueDate - todayDate;
    // If already passed this month, next month
    return diff < 0 ? diff + 30 : diff;
  };

  // Multi-card strategy data
  const strategyDebts = useMemo(() =>
    creditDebts.map(d => ({
      id: d.id,
      name: d.name,
      icon: d.icon,
      owed: d.owed,
      apr: getApr(d.id),
      minPay: minPayment(d.owed),
    }))
  , [creditDebts, aprs]); // eslint-disable-line react-hooks/exhaustive-deps

  const avalancheOrder = useMemo(() =>
    [...strategyDebts].sort((a, b) => b.apr - a.apr),
    [strategyDebts]
  );

  const snowballOrder = useMemo(() =>
    [...strategyDebts].sort((a, b) => a.owed - b.owed),
    [strategyDebts]
  );

  const avalancheResult = useMemo(() =>
    creditDebts.length > 1 ? simulateStrategy(strategyDebts, avalancheOrder, extraBudget) : null,
    [strategyDebts, avalancheOrder, extraBudget, creditDebts.length]
  );

  const snowballResult = useMemo(() =>
    creditDebts.length > 1 ? simulateStrategy(strategyDebts, snowballOrder, extraBudget) : null,
    [strategyDebts, snowballOrder, extraBudget, creditDebts.length]
  );

  const activeOrder = strategyTab === 'avalanche' ? avalancheOrder : snowballOrder;
  const activeResult = strategyTab === 'avalanche' ? avalancheResult : snowballResult;
  const otherResult = strategyTab === 'avalanche' ? snowballResult : avalancheResult;

  if (loading) return <PageSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="gradient-primary px-5 md:px-8 pt-12 pb-8 rounded-b-3xl md:rounded-b-none">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-heading text-primary-foreground mb-4">Debt Tracker</h1>
          {creditDebts.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="bg-primary-foreground/10 rounded-2xl p-2.5 sm:p-3 backdrop-blur-sm">
                <p className="text-primary-foreground/70 text-[10px] sm:text-[11px] mb-0.5">Total Owed</p>
                <p className="text-sm sm:text-lg font-heading text-primary-foreground truncate">{mask(fmt(totalOwed))}</p>
              </div>
              <div className="bg-primary-foreground/10 rounded-2xl p-2.5 sm:p-3 backdrop-blur-sm">
                <p className="text-primary-foreground/70 text-[10px] sm:text-[11px] mb-0.5">Credit Limit</p>
                <p className="text-sm sm:text-lg font-heading text-primary-foreground truncate">{mask(fmt(totalLimit))}</p>
              </div>
              <div className="bg-primary-foreground/10 rounded-2xl p-2.5 sm:p-3 backdrop-blur-sm">
                <p className="text-primary-foreground/70 text-[10px] sm:text-[11px] mb-0.5">Utilization</p>
                <p className={`text-sm sm:text-lg font-heading ${overallUtil >= 30 ? 'text-warning' : 'text-primary-foreground'}`}>{overallUtil.toFixed(0)}%</p>
              </div>
            </div>
          ) : (
            <div className="bg-primary-foreground/10 rounded-2xl p-4 backdrop-blur-sm text-center">
              <p className="text-primary-foreground/80 text-sm">No credit card debt detected</p>
              <p className="text-primary-foreground/50 text-xs mt-1">Add credit accounts to track debt</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 mt-4 pb-6 max-w-4xl mx-auto space-y-4">

        {/* Utilization health */}
        {creditDebts.length > 0 && (
          <div className={`flex items-start gap-3 p-3 rounded-xl text-xs ${overallUtil >= 30 ? 'bg-warning/10 border border-warning/30' : 'bg-income/10 border border-income/20'}`}>
            <AlertCircle size={14} className={overallUtil >= 30 ? 'text-warning mt-0.5' : 'text-income mt-0.5'} />
            <div>
              {overallUtil >= 75
                ? <p className="font-semibold text-expense">High utilization — this hurts your credit score</p>
                : overallUtil >= 30
                ? <p className="font-semibold text-warning">Moderate utilization — aim to keep below 30%</p>
                : <p className="font-semibold text-income">Good utilization — you're below 30%</p>}
              <p className="text-muted-foreground mt-0.5">Credit bureaus recommend keeping utilization under 30%</p>
            </div>
          </div>
        )}

        {/* Debt cards */}
        {creditDebts.length === 0 ? (
          <div className="bg-card rounded-2xl p-8 card-shadow text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
              <CreditCard size={28} className="text-muted-foreground" />
            </div>
            <h3 className="font-heading text-base mb-2">No active debt</h3>
            <p className="text-sm text-muted-foreground">When your credit cards have outstanding balances, payoff details will appear here.</p>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-heading text-muted-foreground uppercase tracking-wide">Credit Cards</h2>
            {creditDebts.map(debt => {
              const apr = getApr(debt.id);
              const payment = getPayment(debt.id, debt.owed);
              const months = monthsToPayoff(debt.owed, apr, payment);
              const totalCost = months < Infinity ? payment * months : Infinity;
              const interest = months < Infinity ? totalCost - debt.owed : Infinity;
              const payoffDate = months < Infinity ? addMonths(new Date(), months) : null;
              const isExpanded = expanded === debt.id;
              const dueDaysLeft = getDueDaysRemaining(debt.dueDate);
              const isDueSoon = dueDaysLeft !== null && dueDaysLeft <= 7;
              const isDueToday = dueDaysLeft !== null && dueDaysLeft === 0;

              return (
                <div key={debt.id} className="bg-card rounded-2xl card-shadow overflow-hidden">
                  <button
                    className="w-full p-4 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : debt.id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-xl">{debt.icon}</span>
                        <div>
                          <p className="text-sm font-semibold">{debt.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {mask(fmt(debt.owed))} owed of {mask(fmt(debt.creditLimit || 0))} limit
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${utilizationColor(debt.utilization)}`}>
                          {debt.utilization.toFixed(0)}%
                        </span>
                        {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Utilization bar */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(debt.utilization, 100)}%` }}
                        className={`h-full rounded-full transition-all ${utilizationBarColor(debt.utilization)}`}
                      />
                    </div>

                    {/* Quick stats row */}
                    <div className="flex items-center justify-between mt-2 text-xs gap-2 flex-wrap">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingDown size={11} />
                        Min: {mask(fmt(minPayment(debt.owed)))}/mo
                      </span>
                      {payoffDate && (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <CalendarClock size={11} />
                          {months} mo · {format(payoffDate, 'MMM yyyy')}
                        </span>
                      )}
                      {/* Due date badge */}
                      {debt.dueDate && (
                        <span className={`flex items-center gap-1 font-medium px-2 py-0.5 rounded-full ${
                          isDueToday ? 'bg-destructive/15 text-expense' :
                          isDueSoon ? 'bg-warning/15 text-warning' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <CalendarClock size={10} />
                          {isDueToday ? 'Due today' : isDueSoon ? `Due in ${dueDaysLeft}d` : `Due day ${debt.dueDate}`}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded payoff calculator */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-3">Payoff Calculator</p>
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Monthly Payment</label>
                              <Input
                                type="number"
                                min="1"
                                step="10"
                                value={payment}
                                onChange={e => setPayments(p => ({ ...p, [debt.id]: parseFloat(e.target.value) || minPayment(debt.owed) }))}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">APR (%)</label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={apr}
                                onChange={e => setAprs(a => ({ ...a, [debt.id]: parseFloat(e.target.value) || DEFAULT_APR }))}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>

                          {months < Infinity ? (
                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div className="bg-accent/50 rounded-xl p-3">
                                <p className="text-[11px] text-muted-foreground mb-0.5">Payoff in</p>
                                <p className="text-sm font-heading">{months} mo</p>
                                <p className="text-[10px] text-muted-foreground">{payoffDate ? format(payoffDate, 'MMM yyyy') : ''}</p>
                              </div>
                              <div className="bg-accent/50 rounded-xl p-3">
                                <p className="text-[11px] text-muted-foreground mb-0.5">Total paid</p>
                                <p className="text-sm font-heading">{mask(fmt(totalCost))}</p>
                              </div>
                              <div className="bg-destructive/10 rounded-xl p-3">
                                <p className="text-[11px] text-muted-foreground mb-0.5">Interest</p>
                                <p className="text-sm font-heading text-expense">{mask(fmt(interest))}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-destructive/10 rounded-xl p-3 text-center">
                              <p className="text-xs text-expense font-semibold">Payment too low — doesn't cover interest</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Minimum to cover interest: {mask(fmt(Math.ceil((debt.owed * apr) / 100 / 12 * 100) / 100))}/mo
                              </p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Multi-card Payoff Optimizer */}
            {creditDebts.length > 1 && (
              <div className="bg-card rounded-2xl card-shadow border border-primary/10 overflow-hidden">
                <div className="p-4 pb-3">
                  <p className="text-sm font-heading mb-1">Payoff Optimizer</p>
                  <p className="text-xs text-muted-foreground mb-3">Best order to attack your {creditDebts.length} cards</p>

                  {/* Extra budget input */}
                  <div className="flex items-center gap-3 mb-4 bg-muted/50 rounded-xl p-3">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">Extra monthly budget (above minimums)</p>
                      <Input
                        type="number"
                        min="0"
                        step="50"
                        value={extraBudget}
                        onChange={e => setExtraBudget(parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm bg-background"
                      />
                    </div>
                    {avalancheResult && snowballResult && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">Avalanche saves</p>
                        <p className="text-sm font-heading text-income">
                          {mask(fmt(Math.max(0, snowballResult.totalInterest - avalancheResult.totalInterest)))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">vs Snowball</p>
                      </div>
                    )}
                  </div>

                  {/* Strategy tabs */}
                  <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4">
                    <button
                      onClick={() => setStrategyTab('avalanche')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        strategyTab === 'avalanche' ? 'bg-card text-foreground card-shadow' : 'text-muted-foreground'
                      }`}
                    >
                      <Zap size={12} className={strategyTab === 'avalanche' ? 'text-warning' : ''} />
                      Avalanche
                    </button>
                    <button
                      onClick={() => setStrategyTab('snowball')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        strategyTab === 'snowball' ? 'bg-card text-foreground card-shadow' : 'text-muted-foreground'
                      }`}
                    >
                      <Snowflake size={12} className={strategyTab === 'snowball' ? 'text-blue-400' : ''} />
                      Snowball
                    </button>
                  </div>

                  {/* Strategy description */}
                  <p className="text-xs text-muted-foreground mb-3">
                    {strategyTab === 'avalanche'
                      ? 'Pay highest APR first — saves the most money in interest long-term'
                      : 'Pay smallest balance first — builds momentum with quick wins'}
                  </p>

                  {/* Ranked card list */}
                  <div className="space-y-2 mb-4">
                    {activeOrder.map((d, i) => (
                      <div key={d.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${i === 0 ? 'bg-primary/8 border border-primary/15' : 'bg-muted/40'}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>{i + 1}</span>
                        <span className="text-base shrink-0">{d.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {mask(fmt(d.owed))} · {d.apr}% APR
                          </p>
                        </div>
                        {i === 0 && (
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                            Focus here
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Strategy result */}
                  {activeResult && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-accent/50 rounded-xl p-3 text-center">
                        <p className="text-[11px] text-muted-foreground mb-0.5">Total interest</p>
                        <p className="text-sm font-heading text-expense">{mask(fmt(activeResult.totalInterest))}</p>
                      </div>
                      <div className="bg-accent/50 rounded-xl p-3 text-center">
                        <p className="text-[11px] text-muted-foreground mb-0.5">Debt free in</p>
                        <p className="text-sm font-heading">{activeResult.months} mo</p>
                        <p className="text-[10px] text-muted-foreground">{format(addMonths(new Date(), activeResult.months), 'MMM yyyy')}</p>
                      </div>
                    </div>
                  )}
                  {otherResult && activeResult && (
                    <p className="text-[10px] text-muted-foreground text-center mt-2">
                      {strategyTab === 'avalanche'
                        ? `Snowball would take ${otherResult.months} mo and cost ${mask(fmt(otherResult.totalInterest - activeResult.totalInterest))} more`
                        : `Avalanche would save ${mask(fmt(activeResult.totalInterest - otherResult.totalInterest))} in interest`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Single card strategy tip */}
            {creditDebts.length === 1 && (
              <div className="bg-card rounded-2xl p-4 card-shadow border border-dashed border-primary/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payoff Strategies</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-accent/50 rounded-xl p-3">
                    <p className="font-semibold mb-1">❄️ Debt Snowball</p>
                    <p className="text-muted-foreground">Pay smallest balance first. Wins motivation through quick wins.</p>
                  </div>
                  <div className="bg-accent/50 rounded-xl p-3">
                    <p className="font-semibold mb-1">🔥 Debt Avalanche</p>
                    <p className="text-muted-foreground">Pay highest APR first. Saves the most money long-term.</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Debt;
