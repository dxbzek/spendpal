import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { CreditCard, TrendingDown, AlertCircle, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { format, addMonths, getDate, getDaysInMonth } from 'date-fns';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_APR, allocateMonth, minimumMonthlyBudget, monthsToPayoff, revolvingMinimum, simulateStrategy,
} from '@/lib/finance/debtPayoff';
import { openPlansByAccount, planPrincipalLeft, splitOwedByPlans } from '@/lib/finance/debtPlans';
import { planDisplayName, planSchedule, remainingInstallments } from '@/lib/finance/installments';
import { creditTotals, creditUtilization } from '@/lib/finance/credit';
import AppIcon from '@/components/AppIcon';

const Debt = () => {
  const { accounts, transactions, loading } = useFinance();
  const { fmt } = useCurrency();
  const { mask } = useBalanceMask();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [aprs, setAprs] = useState<Record<string, number>>({});
  const [payments, setPayments] = useState<Record<string, number>>({});
  // What's typed while editing, so a field can be cleared and retyped without
  // snapping back to the default the moment it's empty.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const setNumber = (
    key: string, raw: string,
    set: React.Dispatch<React.SetStateAction<Record<string, number>>>, id: string,
  ) => {
    setDraft(d => ({ ...d, [key]: raw }));
    const v = parseFloat(raw);
    set(m => {
      const next = { ...m };
      if (isNaN(v)) delete next[id]; else next[id] = v;
      return next;
    });
  };
  const clearDraft = (key: string) => setDraft(d => { const n = { ...d }; delete n[key]; return n; });
  const [strategyTab, setStrategyTab] = useState<'avalanche' | 'snowball'>('avalanche');
  // Total a month toward all cards; null until the user types one.
  const [budgetInput, setBudgetInput] = useState<number | null>(null);

  const todayDate = getDate(new Date());

  // Open instalment plans by the card they are billed to (the plans whose
  // principal is inside that card's balance).
  const plansByAccount = useMemo(() => openPlansByAccount(transactions), [transactions]);

  const creditDebts = useMemo(() =>
    accounts
      .filter(a => a.type === 'credit')
      .map(a => {
        // balance IS the amount owed for credit accounts (see Account type).
        const owed = Math.max(0, a.balance);
        const plans = plansByAccount[a.id] ?? [];
        return {
          ...a,
          owed,
          plans,
          // Plan principal is paid by fixed instalments at the plan's own
          // rate. Only the rest is card debt at the card APR.
          ...splitOwedByPlans(owed, plans),
          // Clamped 0–100 via the shared helper. No limit (Tabby and the like)
          // means no utilization at all, not 0% or 100%.
          utilization: a.creditLimit ? creditUtilization(a) : null,
        };
      })
      .filter(a => a.owed > 0)
  , [accounts, plansByAccount]);

  const totalOwed = creditDebts.reduce((s, d) => s + d.owed, 0);
  const limited = creditDebts.filter(d => d.utilization != null);
  // Limit and utilization come from every card with a limit, paid off or not:
  // the same totals as Home. Only the list below is limited to cards that owe.
  const { limit: totalLimit, utilization: overallUtilization } = useMemo(() => creditTotals(accounts), [accounts]);
  const overallUtil = Math.round(overallUtilization ?? 0);
  // The label follows the most-used card: a maxed-out card hurts even when
  // the total across cards looks fine.
  const worstCard = limited.reduce<(typeof limited)[number] | null>(
    (w, d) => (!w || (d.utilization ?? 0) > (w.utilization ?? 0) ? d : w), null);
  const worstUtil = worstCard?.utilization ?? 0;

  const getApr = (id: string, accountApr?: number) => aprs[id] ?? accountApr ?? DEFAULT_APR;
  // The statement's minimum when entered; otherwise there is none to show
  // (no guessing a 2% rule the card may not have). The statement bills the
  // plan instalments inside that minimum, so only the rest pays down the
  // revolving part.
  const getMinPay = (d: { statementMinDue?: number | null; planMonthly: number }) =>
    revolvingMinimum(d.statementMinDue, d.planMonthly);
  // No APR on the account and none typed here: the default is a guess, and
  // the page says so beside the number.
  const isAprAssumed = (id: string, accountApr?: number) => aprs[id] == null && accountApr == null;
  const getPayment = (id: string, minPay: number | null) => payments[id] ?? minPay;

  const utilizationColor = (pct: number) => {
    if (pct >= 75) return 'text-expense bg-destructive-soft';
    if (pct >= 30) return 'text-warning bg-warning-soft';
    return 'text-income bg-income-soft';
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
    // If already passed this month, the next occurrence is `dueDate` of next
    // month: days remaining = (days left in THIS month) + dueDate, i.e.
    // diff + getDaysInMonth(thisMonth). Using next month's length here would be
    // off by the difference in month lengths.
    return diff < 0 ? diff + getDaysInMonth(new Date()) : diff;
  };

  // Multi-card strategy data: the revolving part of each card. Plan principal
  // is left out; it is paid by its own instalments whatever the order.
  const strategyDebts = useMemo(() =>
    creditDebts.filter(d => d.revolving > 0).map(d => ({
      id: d.id,
      name: d.name,
      icon: d.icon,
      owed: d.revolving,
      hasPlans: d.inPlans > 0,
      apr: getApr(d.id, d.apr),
      aprAssumed: isAprAssumed(d.id, d.apr),
      minPay: getMinPay(d) ?? 0,
    }))
  , [creditDebts, aprs]); // eslint-disable-line react-hooks/exhaustive-deps
  const planMonthlyTotal = creditDebts.reduce((s, d) => s + d.planMonthly, 0);

  const avalancheOrder = useMemo(() =>
    [...strategyDebts].sort((a, b) => b.apr - a.apr),
    [strategyDebts]
  );

  const snowballOrder = useMemo(() =>
    [...strategyDebts].sort((a, b) => a.owed - b.owed),
    [strategyDebts]
  );

  const minimumBudget = useMemo(() => minimumMonthlyBudget(strategyDebts), [strategyDebts]);
  // Start from a budget that clearly makes progress, so the card opens on a plan.
  const monthlyBudget = budgetInput ?? Math.ceil((minimumBudget * 1.5) / 100) * 100;

  const avalancheResult = useMemo(() =>
    strategyDebts.length > 1 ? simulateStrategy(strategyDebts, avalancheOrder, monthlyBudget) : null,
    [strategyDebts, avalancheOrder, monthlyBudget]
  );

  const snowballResult = useMemo(() =>
    strategyDebts.length > 1 ? simulateStrategy(strategyDebts, snowballOrder, monthlyBudget) : null,
    [strategyDebts, snowballOrder, monthlyBudget]
  );

  const activeOrder = strategyTab === 'avalanche' ? avalancheOrder : snowballOrder;
  const activeResult = strategyTab === 'avalanche' ? avalancheResult : snowballResult;
  const otherResult = strategyTab === 'avalanche' ? snowballResult : avalancheResult;
  const thisMonth = allocateMonth(strategyDebts.map(d => ({ id: d.id, balance: d.owed, minPay: d.minPay })), activeOrder, monthlyBudget);

  if (loading) return <PageSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="bg-primary px-5 md:px-8 pt-12 pb-8 rounded-b-2xl md:rounded-b-none">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-heading text-primary-foreground mb-4">Debt</h1>
          {creditDebts.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="min-w-0 bg-primary-raised border border-primary-edge rounded-xl p-3">
                <p className="text-primary-subtle text-[11px] sm:text-xs uppercase tracking-wide mb-1">Total Owed</p>
                <p className="text-sm sm:text-lg font-heading text-primary-foreground truncate">{mask(fmt(totalOwed))}</p>
              </div>
              <div className="min-w-0 bg-primary-raised border border-primary-edge rounded-xl p-3">
                <p className="text-primary-subtle text-[11px] sm:text-xs uppercase tracking-wide mb-1">Credit Limit</p>
                <p className="text-sm sm:text-lg font-heading text-primary-foreground truncate">{mask(fmt(totalLimit))}</p>
              </div>
              <div className="min-w-0 bg-primary-raised border border-primary-edge rounded-xl p-3">
                <p className="text-primary-subtle text-[11px] sm:text-xs uppercase tracking-wide mb-1">Utilization</p>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-sm sm:text-lg font-heading text-primary-foreground">{overallUtil}%</p>
                  {worstUtil >= 30 && (
                    <span className="text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-raised text-primary-foreground shrink-0">
                      {worstUtil >= 75 ? 'High' : 'Watch'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-primary-raised rounded-xl p-4 text-center">
              <p className="text-primary-subtle text-sm">No credit card debt detected</p>
              <p className="text-primary-subtle text-xs mt-1">Add credit accounts to track debt</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 mt-4 pb-6 max-w-4xl mx-auto space-y-4">

        {/* Utilization health (cards with a limit only) */}
        {limited.length > 0 && (
          <div className={`flex items-start gap-3 p-3 rounded-xl text-xs ${worstUtil >= 30 ? 'bg-warning-soft border border-warning-line' : 'bg-income-soft border border-income-line'}`}>
            <AlertCircle size={14} className={worstUtil >= 30 ? 'text-warning mt-0.5' : 'text-income mt-0.5'} />
            <div>
              {worstUtil >= 75
                ? <p className="font-semibold text-expense">High utilization — {worstCard?.name} is at {worstUtil.toFixed(0)}%</p>
                : worstUtil >= 30
                ? <p className="font-semibold text-warning">Moderate utilization — {worstCard?.name} is at {worstUtil.toFixed(0)}%</p>
                : <p className="font-semibold text-income">Good utilization — every card is below 30%</p>}
              <p className="text-muted-foreground mt-0.5">Credit bureaus recommend keeping utilization under 30%</p>
            </div>
          </div>
        )}

        {/* Debt cards */}
        {creditDebts.length === 0 ? (
          <div className="bg-card rounded-xl p-8 card-shadow text-center">
            <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center mx-auto mb-4">
              <CreditCard size={28} className="text-muted-foreground" />
            </div>
            <h3 className="font-heading text-base mb-2">No active debt</h3>
            <p className="text-sm text-muted-foreground">When your credit cards have outstanding balances, payoff details will appear here.</p>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-heading text-muted-foreground uppercase tracking-wide">Credit Cards</h2>
            {creditDebts.map(debt => {
              const apr = getApr(debt.id, debt.apr);
              const minPay = getMinPay(debt);
              const payment = getPayment(debt.id, minPay);
              // The payoff maths works on the revolving part only. Plan
              // principal has its own fixed schedule, listed below the card.
              const hasRevolving = debt.revolving > 0;
              // No payment to work from (no minimum, nothing typed): no payoff date.
              const months = payment && hasRevolving ? monthsToPayoff(debt.revolving, apr, payment) : Infinity;
              const totalCost = months < Infinity ? payment * months : Infinity;
              const interest = months < Infinity ? totalCost - debt.revolving : Infinity;
              const payoffDate = months < Infinity ? addMonths(new Date(), months) : null;
              const isExpanded = expanded === debt.id;
              const dueDaysLeft = getDueDaysRemaining(debt.dueDate);
              const isDueSoon = dueDaysLeft !== null && dueDaysLeft <= 7;
              const isDueToday = dueDaysLeft !== null && dueDaysLeft === 0;

              return (
                <div key={debt.id} className="bg-card rounded-xl card-shadow overflow-hidden">
                  <button
                    className="w-full p-4 text-left hover:bg-muted transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : debt.id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-xl"><AppIcon value={debt.icon} /></span>
                        <div>
                          <p className="text-sm font-semibold">{debt.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {debt.utilization != null
                              ? <>{mask(fmt(debt.owed))} owed of {mask(fmt(debt.creditLimit || 0))} limit</>
                              : <>{mask(fmt(debt.owed))} owed</>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {debt.utilization != null && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${utilizationColor(debt.utilization)}`}>
                            {debt.utilization.toFixed(0)}%
                          </span>
                        )}
                        {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Utilization bar (only with a limit to measure against) */}
                    {debt.utilization != null && (
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.min(debt.utilization, 100)}%` }}
                          className={`h-full rounded-full transition-all ${utilizationBarColor(debt.utilization)}`}
                        />
                      </div>
                    )}

                    {/* Quick stats row */}
                    <div className="flex items-center justify-between mt-2 text-xs gap-2 flex-wrap">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingDown size={11} />
                        {debt.statementMinDue != null ? <>Min: {mask(fmt(debt.statementMinDue))}/mo</> : 'No minimum'}
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
                          isDueToday ? 'bg-destructive-soft text-expense' :
                          isDueSoon ? 'bg-warning-soft text-warning' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <CalendarClock size={10} />
                          {isDueToday ? 'Due today' : isDueSoon ? `Due in ${dueDaysLeft}d` : `Due day ${debt.dueDate}`}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Instalment plans billed to this card: fixed lines, not part of the payoff maths */}
                  {debt.plans.length > 0 && (
                    <div className="px-4 pb-3 text-xs">
                      <div className="flex items-center justify-between gap-2 text-muted-foreground">
                        <span>In instalment plans</span>
                        <span className="font-medium text-foreground tabular-nums">{mask(fmt(debt.inPlans))}</span>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {debt.plans.map(plan => {
                          const left = remainingInstallments(plan);
                          const endsOn = planSchedule(plan, debt, new Date())?.endsOn;
                          return (
                            <li key={plan.key} className="flex items-center justify-between gap-2 text-muted-foreground">
                              <span className="truncate">
                                {planDisplayName(plan.merchant)} · {left} × {mask(fmt(plan.amountPerInstallment))}
                                {endsOn ? ` · ends ${format(endsOn, 'MMM yyyy')}` : ''}
                              </span>
                              <span className="tabular-nums shrink-0">{mask(fmt(planPrincipalLeft(plan)))}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex items-center justify-between gap-2 text-muted-foreground mt-1.5 pt-1.5 border-t border-border">
                        <span>Rest of the balance, at the card rate</span>
                        <span className="font-medium text-foreground tabular-nums">{mask(fmt(debt.revolving))}</span>
                      </div>
                    </div>
                  )}

                  {/* Expanded payoff calculator */}
                  <AnimatePresence>
                    {isExpanded && (
                      <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-3">Payoff Calculator</p>
                          {!hasRevolving ? (
                            <p className="text-xs text-muted-foreground text-center">
                              All of this balance is in instalment plans. Each plan ends on its own date.
                            </p>
                          ) : (<>
                          {debt.inPlans > 0 && (
                            <p className="text-xs text-muted-foreground mb-3">
                              For the {mask(fmt(debt.revolving))} that is not in a plan.
                              {debt.statementMinDue != null && debt.planMonthly > 0 && (
                                <> The statement minimum includes {mask(fmt(debt.planMonthly))} of instalments.</>
                              )}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Monthly Payment</label>
                              <Input
                                type="number"
                                min="1"
                                step="10"
                                value={draft[`pay:${debt.id}`] ?? payment ?? ''}
                                placeholder="Amount"
                                onChange={e => setNumber(`pay:${debt.id}`, e.target.value, setPayments, debt.id)}
                                onBlur={() => clearDraft(`pay:${debt.id}`)}
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
                                value={draft[`apr:${debt.id}`] ?? apr}
                                onChange={e => setNumber(`apr:${debt.id}`, e.target.value, setAprs, debt.id)}
                                onBlur={() => clearDraft(`apr:${debt.id}`)}
                                className="h-9 text-sm"
                              />
                              {isAprAssumed(debt.id, debt.apr) && (
                                <p className="text-[11px] text-muted-foreground mt-1">No APR set on this card. {DEFAULT_APR}% is assumed.</p>
                              )}
                            </div>
                          </div>

                          {months < Infinity ? (
                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div className="bg-accent rounded-xl p-3">
                                <p className="text-xs text-muted-foreground mb-0.5">Payoff in</p>
                                <p className="text-sm font-heading">{months} mo</p>
                                <p className="text-[11px] text-muted-foreground">{payoffDate ? format(payoffDate, 'MMM yyyy') : ''}</p>
                              </div>
                              <div className="bg-accent rounded-xl p-3">
                                <p className="text-xs text-muted-foreground mb-0.5">Total paid</p>
                                <p className="text-sm font-heading">{mask(fmt(totalCost))}</p>
                              </div>
                              <div className="bg-destructive-soft rounded-xl p-3">
                                <p className="text-xs text-muted-foreground mb-0.5">Interest</p>
                                <p className="text-sm font-heading text-expense">{mask(fmt(interest))}</p>
                              </div>
                            </div>
                          ) : !payment ? (
                            <p className="text-xs text-muted-foreground text-center">Enter a monthly payment to see when it&apos;s paid off.</p>
                          ) : (
                            <div className="bg-destructive-soft rounded-xl p-3 text-center">
                              <p className="text-xs text-expense font-semibold">Payment too low — doesn't cover interest</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Minimum to cover interest: {mask(fmt(Math.ceil((debt.revolving * apr) / 100 / 12 * 100) / 100))}/mo
                              </p>
                            </div>
                          )}
                          </>)}
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Multi-card Payoff Optimizer */}
            {strategyDebts.length > 1 && (
              <div className="bg-card rounded-xl card-shadow border border-border p-4 space-y-4">
                <div>
                  <p className="text-sm font-heading">Payoff plan</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pay the minimum on every card, and put everything else on one card until it's gone. Then move to the next.
                  </p>
                </div>

                <div>
                  <label htmlFor="payoff-budget" className="text-xs text-muted-foreground mb-1 block">
                    How much can you pay toward these {strategyDebts.length} cards each month?
                  </label>
                  <Input
                    id="payoff-budget"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="100"
                    value={monthlyBudget}
                    onChange={e => setBudgetInput(parseFloat(e.target.value) || 0)}
                    className="h-10 text-base md:text-sm tabular-nums"
                  />
                  {planMonthlyTotal > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Instalment plans are not part of this. They take {mask(fmt(planMonthlyTotal))} a month until they end.
                    </p>
                  )}
                </div>

                <div className="flex gap-1 p-1 bg-muted rounded-lg" role="tablist">
                  {(['avalanche', 'snowball'] as const).map(tab => (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={strategyTab === tab}
                      onClick={() => setStrategyTab(tab)}
                      className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
                        strategyTab === tab ? 'bg-card text-foreground card-shadow' : 'text-muted-foreground'
                      }`}
                    >
                      {tab === 'avalanche' ? 'Least interest' : 'Smallest first'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  {strategyTab === 'avalanche'
                    ? 'Highest interest rate first (the "avalanche" method). Costs you the least overall.'
                    : 'Smallest balance first (the "snowball" method). Clears whole cards sooner, which some people find easier to stick with.'}
                </p>

                {activeResult?.hitCap ? (
                  <div className="rounded-lg border border-destructive-line bg-destructive-soft p-3">
                    <p className="text-sm font-medium text-expense">
                      {mask(fmt(monthlyBudget))} a month won't keep up with the interest
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pay at least {mask(fmt(minimumBudget))} a month across these cards to start shrinking them.
                    </p>
                    <button onClick={() => setBudgetInput(minimumBudget)} className="mt-2 text-xs font-medium text-primary">
                      Use {mask(fmt(minimumBudget))}
                    </button>
                  </div>
                ) : activeResult && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-xs text-muted-foreground">Debt-free by</p>
                      <p className="text-sm font-semibold">{format(addMonths(new Date(), activeResult.months), 'MMM yyyy')}</p>
                      <p className="text-xs text-muted-foreground">{activeResult.months} months</p>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-xs text-muted-foreground">Interest you'll pay</p>
                      <p className="text-sm font-semibold font-mono">{mask(fmt(activeResult.totalInterest))}</p>
                      {otherResult && !otherResult.hitCap && otherResult.totalInterest !== activeResult.totalInterest && (
                        <p className="text-xs text-muted-foreground">
                          {otherResult.totalInterest > activeResult.totalInterest
                            ? `${mask(fmt(otherResult.totalInterest - activeResult.totalInterest))} less than the other order`
                            : `${mask(fmt(activeResult.totalInterest - otherResult.totalInterest))} more than the other order`}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">This month</p>
                  <ol className="divide-y divide-border rounded-lg border border-border">
                    {activeOrder.map((d, i) => (
                      <li key={d.id} className="flex items-center gap-3 p-3">
                        <span className={`w-5 text-xs font-semibold tabular-nums ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}</span>
                        <AppIcon value={d.icon} className="text-base text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {mask(fmt(d.owed))} {d.hasPlans ? 'not in a plan' : 'owed'} · {d.apr}% APR{d.aprAssumed ? ' (assumed)' : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold font-mono">{mask(fmt(thisMonth[d.id] ?? 0))}</p>
                          <p className="text-xs text-muted-foreground">{i === 0 ? 'Focus card' : 'Minimum'}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {strategyDebts.some(d => !d.minPay) && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Cards without a statement minimum use an estimate of 2% of the balance. Add the real minimum on the card for an exact plan.
                    </p>
                  )}
                  {strategyDebts.some(d => d.aprAssumed) && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Cards with no APR set use {DEFAULT_APR}%. Add the real rate on the card (0 for interest-free plans).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Single card strategy tip */}
            {strategyDebts.length === 1 && (
              <div className="bg-card rounded-xl p-4 card-shadow border border-dashed border-primary-line">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payoff Strategies</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-accent rounded-xl p-3">
                    <p className="font-semibold mb-1">Debt snowball</p>
                    <p className="text-muted-foreground">Pay smallest balance first. Wins motivation through quick wins.</p>
                  </div>
                  <div className="bg-accent rounded-xl p-3">
                    <p className="font-semibold mb-1">Debt avalanche</p>
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
