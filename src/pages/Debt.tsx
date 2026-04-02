import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { CreditCard, TrendingDown, AlertCircle, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addMonths } from 'date-fns';
import { Input } from '@/components/ui/input';

const DEFAULT_APR = 20; // %

function monthsToPayoff(principal: number, apr: number, monthlyPayment: number): number {
  if (monthlyPayment <= 0 || principal <= 0) return Infinity;
  const r = apr / 100 / 12;
  if (r === 0) return Math.ceil(principal / monthlyPayment);
  if (monthlyPayment <= principal * r) return Infinity; // payment doesn't cover interest
  return Math.ceil(-Math.log(1 - (principal * r) / monthlyPayment) / Math.log(1 + r));
}

function minPayment(principal: number): number {
  return Math.max(25, principal * 0.02); // 2% minimum, at least 25
}

const Debt = () => {
  const { accounts, loading } = useFinance();
  const { fmt } = useCurrency();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [aprs, setAprs] = useState<Record<string, number>>({});
  const [payments, setPayments] = useState<Record<string, number>>({});

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

  if (loading) return <PageSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="gradient-primary px-5 md:px-8 pt-12 pb-8 rounded-b-3xl md:rounded-b-none">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-heading text-primary-foreground mb-4">Debt Tracker</h1>
          {creditDebts.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-primary-foreground/10 rounded-2xl p-3 backdrop-blur-sm">
                <p className="text-primary-foreground/70 text-[11px] mb-0.5">Total Owed</p>
                <p className="text-lg font-heading text-primary-foreground">{fmt(totalOwed)}</p>
              </div>
              <div className="bg-primary-foreground/10 rounded-2xl p-3 backdrop-blur-sm">
                <p className="text-primary-foreground/70 text-[11px] mb-0.5">Credit Limit</p>
                <p className="text-lg font-heading text-primary-foreground">{fmt(totalLimit)}</p>
              </div>
              <div className="bg-primary-foreground/10 rounded-2xl p-3 backdrop-blur-sm">
                <p className="text-primary-foreground/70 text-[11px] mb-0.5">Utilization</p>
                <p className={`text-lg font-heading ${overallUtil >= 30 ? 'text-warning' : 'text-primary-foreground'}`}>{overallUtil.toFixed(0)}%</p>
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

              return (
                <div key={debt.id} className="bg-card rounded-2xl card-shadow overflow-hidden">
                  <button
                    className="w-full p-4 text-left"
                    onClick={() => setExpanded(isExpanded ? null : debt.id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-xl">{debt.icon}</span>
                        <div>
                          <p className="text-sm font-semibold">{debt.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmt(debt.owed)} owed of {fmt(debt.creditLimit || 0)} limit
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

                    {/* Quick stats */}
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingDown size={11} />
                        Min payment: {fmt(minPayment(debt.owed))}/mo
                      </span>
                      {payoffDate && (
                        <span className="flex items-center gap-1">
                          <CalendarClock size={11} />
                          {months} mo to pay off
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
                                <p className="text-sm font-heading">{fmt(totalCost)}</p>
                              </div>
                              <div className="bg-destructive/10 rounded-xl p-3">
                                <p className="text-[11px] text-muted-foreground mb-0.5">Interest</p>
                                <p className="text-sm font-heading text-expense">{fmt(interest)}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-destructive/10 rounded-xl p-3 text-center">
                              <p className="text-xs text-expense font-semibold">Payment too low — doesn't cover interest</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Minimum to cover interest: {fmt(Math.ceil((debt.owed * apr) / 100 / 12 * 100) / 100)}/mo
                              </p>
                            </div>
                          )}

                          {/* Debt due date */}
                          {debt.dueDate && (
                            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                              <CalendarClock size={11} /> Payment due: day {debt.dueDate} of each month
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Avalanche vs snowball tip */}
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
          </>
        )}
      </div>
    </div>
  );
};

export default Debt;
