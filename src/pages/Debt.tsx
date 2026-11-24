import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { CreditCard, AlertCircle, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
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
import { BigAmount, Meter, SectionLabel } from '@/components/orbix';

const Debt = () => {
  const { accounts, transactions, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();

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

  // Sum of the statement minimums that are entered; none entered means none to show.
  const minDues = creditDebts.filter(d => d.statementMinDue != null);
  const minDueTotal = minDues.reduce((s, d) => s + (d.statementMinDue ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 pb-8">
      {/* Header: big title, Orbix style */}
      <div className="pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8 pb-4">
        <h1 className="text-[1.75rem] leading-tight font-heading font-semibold tracking-tight">Debt</h1>
      </div>

      {/* Hero: total owed, then limit, utilization, minimums */}
      <div className="bg-hero rounded-[28px] p-5">
        <div>
          <p className="text-sm opacity-70">Total owed</p>
          <p className="mt-1 text-[2.5rem] leading-none font-medium tracking-tight tabular-nums">
            {hidden ? mask(fmt(totalOwed)) : <BigAmount text={fmt(totalOwed)} />}
          </p>
        </div>
        {creditDebts.length > 0 ? (
          <>
            {/* The limit is the longest figure, so its chip gets more room. */}
            <div className="grid grid-cols-[1.4fr_0.85fr_1.15fr] gap-2 mt-5">
              <div className="hero-chip rounded-2xl px-3 py-2.5 min-w-0">
                <p className="text-[11px] opacity-70 truncate">Credit limit</p>
                <p className="text-base font-semibold tabular-nums truncate">{mask(fmt(totalLimit))}</p>
              </div>
              <div className="hero-chip-dark rounded-2xl px-3 py-2.5 min-w-0">
                <p className="text-[11px] opacity-70 truncate">Utilization</p>
                <p className="text-base font-semibold tabular-nums truncate">{overallUtil}%</p>
              </div>
              <div className="hero-chip rounded-2xl px-3 py-2.5 min-w-0">
                <p className="text-[11px] opacity-70 truncate">Min due</p>
                <p className="text-base font-semibold tabular-nums truncate">{minDues.length > 0 ? mask(fmt(minDueTotal)) : '—'}</p>
              </div>
            </div>
            {/* Utilization health (cards with a limit only), as a quiet pill */}
            {limited.length > 0 && (
              <div className="hero-chip rounded-2xl px-3 py-2.5 mt-2 flex items-center gap-2 text-xs">
                <AlertCircle size={14} className="shrink-0 opacity-70" />
                <span className="min-w-0 flex-1">
                  {worstUtil >= 30
                    ? <>{worstCard?.name} at {worstUtil.toFixed(0)}%. Aim under 30%.</>
                    : <>Every card under 30%</>}
                </span>
                {worstUtil >= 30 && (
                  <span className="hero-chip-dark text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0">
                    {worstUtil >= 75 ? 'High' : 'Watch'}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm opacity-70 mt-3">No credit card debt</p>
        )}
      </div>

      <div className="mt-6 space-y-6">
        {/* Debt cards */}
        {creditDebts.length === 0 ? (
          <div className="bg-card rounded-3xl p-8 text-center">
            <span className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <CreditCard size={24} className="text-muted-foreground" />
            </span>
            <h3 className="font-heading font-medium text-base">No active debt</h3>
          </div>
        ) : (
          <>
            <div>
              <SectionLabel label="Cards" count={creditDebts.length} />
              <div className="space-y-3">
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
                <div key={debt.id} className="bg-card rounded-3xl overflow-hidden">
                  <button
                    className="w-full p-4 text-left"
                    onClick={() => setExpanded(isExpanded ? null : debt.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-11 h-11 shrink-0 rounded-full bg-muted flex items-center justify-center text-[18px]"><AppIcon value={debt.icon} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium truncate">{debt.name}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {debt.utilization != null
                            ? <>{mask(fmt(debt.owed))} of {mask(fmt(debt.creditLimit || 0))}</>
                            : <>{mask(fmt(debt.owed))} owed</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[15px] font-medium tabular-nums tracking-tight text-expense">
                          {hidden ? mask(fmt(debt.owed)) : <BigAmount text={fmt(debt.owed)} />}
                        </p>
                        {debt.utilization != null && (
                          <p className={`text-xs font-medium mt-0.5 ${debt.utilization >= 75 ? 'text-expense' : debt.utilization >= 30 ? 'text-warning' : 'text-primary'}`}>
                            {debt.utilization.toFixed(0)}%
                          </p>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
                    </div>

                    {/* Utilization bar (only with a limit to measure against) */}
                    {debt.utilization != null && (
                      <Meter
                        value={Math.min(debt.utilization, 100)}
                        className="mt-3.5 h-1"
                        barClassName={utilizationBarColor(debt.utilization)}
                        label={`${debt.name} utilization`}
                      />
                    )}

                    {/* Quick stats line */}
                    <div className="flex items-center mt-2.5 text-xs gap-x-3 gap-y-1 flex-wrap text-muted-foreground">
                      <span>
                        {debt.statementMinDue != null ? <>Min {mask(fmt(debt.statementMinDue))}/mo</> : 'No minimum'}
                      </span>
                      {payoffDate && (
                        <span className="flex items-center gap-1">
                          <CalendarClock size={11} />
                          {months} mo · {format(payoffDate, 'MMM yyyy')}
                        </span>
                      )}
                      {/* Due date */}
                      {debt.dueDate && (
                        <span className={`ml-auto font-medium ${
                          isDueToday ? 'text-expense' : isDueSoon ? 'text-warning' : ''
                        }`}>
                          {isDueToday ? 'Due today' : isDueSoon ? `Due in ${dueDaysLeft}d` : `Due day ${debt.dueDate}`}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Instalment plans billed to this card: fixed lines, not part of the payoff maths */}
                  {debt.plans.length > 0 && (
                    <div className="mx-4 mb-4 pt-3 border-t border-border text-xs">
                      <div className="flex items-center justify-between gap-2 text-muted-foreground">
                        <span>In plans</span>
                        <span className="font-medium text-foreground tabular-nums">{mask(fmt(debt.inPlans))}</span>
                      </div>
                      <ul className="mt-2 space-y-2">
                        {debt.plans.map(plan => {
                          const left = remainingInstallments(plan);
                          const endsOn = planSchedule(plan, debt, new Date())?.endsOn;
                          return (
                            <li key={plan.key} className="flex items-start justify-between gap-2 text-muted-foreground">
                              {/* Two lines, not one truncated line: on a phone the
                                  instalment count and end date were cut off. */}
                              <span className="min-w-0">
                                <span className="block text-sm text-foreground break-words">{planDisplayName(plan.merchant)}</span>
                                <span className="block text-xs">
                                  {left} × {mask(fmt(plan.amountPerInstallment))}
                                  {endsOn ? ` · ends ${format(endsOn, 'MMM yyyy')}` : ''}
                                </span>
                              </span>
                              <span className="text-sm tabular-nums shrink-0 text-foreground">{mask(fmt(planPrincipalLeft(plan)))}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex items-center justify-between gap-2 text-muted-foreground mt-2 pt-2 border-t border-border">
                        <span>Rest, at card rate</span>
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
                        <div className="mx-4 pb-4 border-t border-border">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.16em] mb-3 mt-3">Payoff calculator</p>
                          {!hasRevolving ? (
                            <p className="text-xs text-muted-foreground text-center">
                              All of this is in instalment plans.
                            </p>
                          ) : (<>
                          {debt.inPlans > 0 && (
                            <p className="text-xs text-muted-foreground mb-3">
                              For the {mask(fmt(debt.revolving))} not in a plan.
                              {debt.statementMinDue != null && debt.planMonthly > 0 && (
                                <> Minimum includes {mask(fmt(debt.planMonthly))} of instalments.</>
                              )}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Monthly payment</label>
                              <Input
                                type="number"
                                min="1"
                                step="10"
                                value={draft[`pay:${debt.id}`] ?? payment ?? ''}
                                placeholder="Amount"
                                onChange={e => setNumber(`pay:${debt.id}`, e.target.value, setPayments, debt.id)}
                                onBlur={() => clearDraft(`pay:${debt.id}`)}
                                className="h-10 text-sm rounded-xl"
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
                                className="h-10 text-sm rounded-xl"
                              />
                              {isAprAssumed(debt.id, debt.apr) && (
                                <p className="text-[11px] text-muted-foreground mt-1">{DEFAULT_APR}% assumed</p>
                              )}
                            </div>
                          </div>

                          {months < Infinity ? (
                            <div className="grid grid-cols-3 divide-x divide-border rounded-2xl bg-muted/50 py-3">
                              <div className="px-3">
                                <p className="text-[11px] text-muted-foreground mb-0.5">Payoff in</p>
                                <p className="text-sm font-medium tabular-nums">{months} mo</p>
                                <p className="text-[11px] text-muted-foreground">{payoffDate ? format(payoffDate, 'MMM yyyy') : ''}</p>
                              </div>
                              <div className="px-3">
                                <p className="text-[11px] text-muted-foreground mb-0.5">Total paid</p>
                                <p className="text-sm font-medium tabular-nums">{mask(fmt(totalCost))}</p>
                              </div>
                              <div className="px-3">
                                <p className="text-[11px] text-muted-foreground mb-0.5">Interest</p>
                                <p className="text-sm font-medium tabular-nums text-expense">{mask(fmt(interest))}</p>
                              </div>
                            </div>
                          ) : !payment ? (
                            <p className="text-xs text-muted-foreground text-center">Enter a payment to see the payoff date.</p>
                          ) : (
                            <div className="rounded-2xl bg-muted/50 p-3 text-center">
                              <p className="text-xs text-expense font-medium">Too low to cover interest</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Needs over {mask(fmt(Math.ceil((debt.revolving * apr) / 100 / 12 * 100) / 100))}/mo
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
              </div>
            </div>

            {/* Multi-card Payoff Optimizer */}
            {strategyDebts.length > 1 && (
              <div>
                <SectionLabel label="Payoff plan" />
                <div className="bg-card rounded-3xl p-4 space-y-4">
                  <div>
                    <label htmlFor="payoff-budget" className="text-xs text-muted-foreground mb-1 block">
                      Monthly payment, {strategyDebts.length} cards
                    </label>
                    <Input
                      id="payoff-budget"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="100"
                      value={monthlyBudget}
                      onChange={e => setBudgetInput(parseFloat(e.target.value) || 0)}
                      className="h-11 text-base md:text-sm tabular-nums rounded-xl"
                    />
                    {planMonthlyTotal > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Plans are separate. They take {mask(fmt(planMonthlyTotal))} a month until they end.
                      </p>
                    )}
                  </div>

                  <div className="bg-muted rounded-full p-1 grid grid-cols-2 gap-1" role="tablist" aria-label="Payoff order">
                    {(['avalanche', 'snowball'] as const).map(tab => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={strategyTab === tab}
                        onClick={() => setStrategyTab(tab)}
                        className={`h-9 rounded-full text-sm font-medium transition-colors ${
                          strategyTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab === 'avalanche' ? 'Least interest' : 'Smallest first'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2 px-1">
                    {strategyTab === 'avalanche'
                      ? 'Highest rate first. Minimums on the rest.'
                      : 'Smallest balance first. Minimums on the rest.'}
                  </p>

                  {activeResult?.hitCap ? (
                    <div className="rounded-2xl bg-muted/50 p-3">
                      <p className="text-sm font-medium text-expense">
                        {mask(fmt(monthlyBudget))} a month won't cover the interest
                      </p>
                      <button onClick={() => setBudgetInput(minimumBudget)} className="mt-2 text-xs font-medium text-primary">
                        Use {mask(fmt(minimumBudget))}
                      </button>
                    </div>
                  ) : activeResult && (
                    <div className="grid grid-cols-2 divide-x divide-border rounded-2xl bg-muted/50 py-3">
                      <div className="px-3">
                        <p className="text-[11px] text-muted-foreground">Debt-free by</p>
                        <p className="text-base font-medium">{format(addMonths(new Date(), activeResult.months), 'MMM yyyy')}</p>
                        <p className="text-xs text-muted-foreground">{activeResult.months} months</p>
                      </div>
                      <div className="px-3">
                        <p className="text-[11px] text-muted-foreground">Interest</p>
                        <p className="text-base font-medium tabular-nums text-expense">{mask(fmt(activeResult.totalInterest))}</p>
                        {otherResult && !otherResult.hitCap && otherResult.totalInterest !== activeResult.totalInterest && (
                          <p className="text-xs text-muted-foreground">
                            {otherResult.totalInterest > activeResult.totalInterest
                              ? `${mask(fmt(otherResult.totalInterest - activeResult.totalInterest))} less than other order`
                              : `${mask(fmt(activeResult.totalInterest - otherResult.totalInterest))} more than other order`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.16em] mb-1 px-1">This month</p>
                    <ol className="divide-y divide-border">
                      {activeOrder.map((d, i) => (
                        <li key={d.id} className="flex items-center gap-3 py-3">
                          <span className={`relative w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-base ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                            <AppIcon value={d.icon} />
                            <span className="sr-only">{i + 1}</span>
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{d.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {mask(fmt(d.owed))} {d.hasPlans ? 'not in a plan' : 'owed'} · {d.apr}% APR{d.aprAssumed ? ' (assumed)' : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium tabular-nums">{mask(fmt(thisMonth[d.id] ?? 0))}</p>
                            <p className={`text-xs ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}>{i === 0 ? 'Focus card' : 'Minimum'}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {strategyDebts.some(d => !d.minPay) && (
                      <p className="text-xs text-muted-foreground mt-2 px-1">
                        Cards with no minimum use 2% of the balance.
                      </p>
                    )}
                    {strategyDebts.some(d => d.aprAssumed) && (
                      <p className="text-xs text-muted-foreground mt-2 px-1">
                        Cards with no APR set use {DEFAULT_APR}%.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Single card strategy tip */}
            {strategyDebts.length === 1 && (
              <div>
                <SectionLabel label="Payoff strategies" />
                <div className="bg-card rounded-3xl px-4 divide-y divide-border text-sm">
                  <div className="py-3.5">
                    <p className="font-medium">Debt snowball</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Smallest balance first.</p>
                  </div>
                  <div className="py-3.5">
                    <p className="font-medium">Debt avalanche</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Highest APR first. Least interest.</p>
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
