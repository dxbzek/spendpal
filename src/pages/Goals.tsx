import { PageSpinner } from '@/components/ui/spinner';
import { useState, useMemo } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { Plus, Edit2, Trash2, CalendarClock, TrendingUp, CheckCircle2, ChevronDown, Pause, Play, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { differenceInDays, parseISO, subMonths, getMonth, getYear, format } from 'date-fns';
import AddGoalDialog from '@/components/forms/AddGoalDialog';
import type { Goal } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const LOG_KEY = (id: string) => `spendpal_goal_log_${id}`;
interface Contribution { amount: number; note: string; date: string; }

function loadLog(id: string): Contribution[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY(id)) || '[]'); } catch { return []; }
}
function saveLog(id: string, log: Contribution[]) {
  localStorage.setItem(LOG_KEY(id), JSON.stringify(log.slice(0, 100)));
}

const Goals = () => {
  const { goals, transactions, accounts, addGoalProgress, removeGoal, updateGoal, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();
  const [progressGoalId, setProgressGoalId] = useState<string | null>(null);
  const [progressAmount, setProgressAmount] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [showLog, setShowLog] = useState<string | null>(null);
  const [showAllLog, setShowAllLog] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const overallPct = totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0;

  // Compute avg monthly savings from the last 3 full months
  const monthlySavingsRate = useMemo(() => {
    const creditIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));
    const now = new Date();
    let totalRate = 0;
    let validMonths = 0;
    for (let i = 1; i <= 3; i++) {
      const d = subMonths(now, i);
      const m = getMonth(d);
      const y = getYear(d);
      const monthTx = transactions.filter(tx => {
        const td = parseISO(tx.date);
        return getMonth(td) === m && getYear(td) === y;
      });
      const inc = monthTx.filter(t => t.type === 'income' && !creditIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
      const exp = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const savings = inc - exp;
      if (savings > 0) { totalRate += savings; validMonths++; }
    }
    return validMonths > 0 ? totalRate / validMonths : 0;
  }, [transactions, accounts]);

  const handleAddProgress = async () => {
    if (!progressGoalId || !progressAmount) return;
    const amount = parseFloat(progressAmount);
    if (isNaN(amount) || amount <= 0) return;
    await addGoalProgress(progressGoalId, amount);
    // Save to contribution log
    const log = loadLog(progressGoalId);
    log.unshift({ amount, note: progressNote.trim(), date: new Date().toISOString() });
    saveLog(progressGoalId, log);
    setProgressGoalId(null);
    setProgressAmount('');
    setProgressNote('');
  };

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status !== 'active');

  const getDaysRemaining = (deadline?: string) => {
    if (!deadline) return null;
    return differenceInDays(parseISO(deadline), new Date());
  };

  const getCompletionEstimate = (remaining: number): string | null => {
    if (remaining <= 0) return null;
    if (monthlySavingsRate <= 0) return 'Add income transactions to estimate timeline';
    const months = remaining / monthlySavingsRate;
    if (months < 1) return 'Less than a month';
    if (months < 12) return `~${Math.ceil(months)} month${Math.ceil(months) > 1 ? 's' : ''}`;
    const years = months / 12;
    return `~${years.toFixed(1)} year${years >= 2 ? 's' : ''}`;
  };

  if (loading) return <PageSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="gradient-primary px-5 md:px-8 pt-12 pb-8 md:rounded-b-none rounded-b-3xl">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-heading text-primary-foreground">Your Goals</h1>
            <button onClick={() => { setEditGoal(null); setShowAddGoal(true); }}
              className="bg-primary-foreground/20 rounded-full px-3 py-1.5 text-xs text-primary-foreground font-medium flex items-center gap-1">
              <Plus size={14} /> New Goal
            </button>
          </div>
          <div className="bg-primary-foreground/10 rounded-2xl p-4 backdrop-blur-sm">
            <p className="text-primary-foreground/70 text-xs mb-1">Total Progress</p>
            <p className="text-2xl font-heading text-primary-foreground mb-2">
              {overallPct}% <span className="text-sm font-normal text-primary-foreground/60">of {mask(fmt(totalTarget))}</span>
            </p>
            <div className="h-3.5 bg-primary-foreground/20 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${overallPct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} className="h-full rounded-full bg-primary-foreground" />
            </div>
            {monthlySavingsRate > 0 && (
              <p className="text-primary-foreground/60 text-[11px] mt-2 flex items-center gap-1">
                <TrendingUp size={11} /> Avg monthly savings: {mask(fmt(monthlySavingsRate))}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 md:px-8 mt-4 pb-6 max-w-4xl mx-auto">
        <h2 className="text-sm font-heading text-muted-foreground uppercase tracking-wide mb-4">Active Goals</h2>

        {activeGoals.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl card-shadow">
            <p className="text-muted-foreground text-sm">No active goals</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Create a goal to start saving</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeGoals.map(goal => {
              const pct = goal.targetAmount ? Math.round((goal.savedAmount / goal.targetAmount) * 100) : 0;
              const remaining = goal.targetAmount - goal.savedAmount;
              const daysLeft = getDaysRemaining(goal.deadline);
              const estimate = getCompletionEstimate(remaining);
              return (
                <div key={goal.id} className={`bg-card rounded-2xl p-4 card-shadow transition-shadow hover:card-shadow-hover group ${goal.status === 'paused' ? 'opacity-70' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center text-2xl shrink-0">{goal.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-semibold truncate">{goal.name}</p>
                          {goal.status === 'paused' && (
                            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Paused</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{goal.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {daysLeft !== null && (
                        <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          daysLeft <= 7 ? 'bg-destructive/10 text-expense' : daysLeft <= 30 ? 'bg-warning/10 text-warning' : 'bg-accent text-accent-foreground'
                        }`}>
                          <CalendarClock size={10} />
                          {daysLeft <= 0 ? 'Overdue' : `${daysLeft}d`}
                        </span>
                      )}
                      <button
                        onClick={() => updateGoal({ ...goal, status: 'active' === goal.status ? 'paused' : 'active' })}
                        aria-label={goal.status === 'paused' ? 'Resume goal' : 'Pause goal'}
                        title={goal.status === 'paused' ? 'Resume' : 'Pause'}
                        className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-2">
                        {goal.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                      <button onClick={() => { setEditGoal(goal); setShowAddGoal(true); }} aria-label="Edit goal" className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-2"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteGoalId(goal.id)} aria-label="Delete goal" className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-2"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {/* Prominent percentage */}
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-2xl font-heading text-primary">{pct}%</p>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{mask(fmt(goal.savedAmount))} saved</p>
                      <p className="text-xs text-muted-foreground">of {mask(fmt(goal.targetAmount))}</p>
                    </div>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden mb-3">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full gradient-primary" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      {remaining > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground">{mask(fmt(remaining))} remaining</p>
                          {estimate && (
                            <p className="text-[11px] text-primary/70 flex items-center gap-0.5 mt-0.5">
                              <TrendingUp size={10} /> {estimate} at current rate
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-income flex items-center gap-1">
                          <Trophy size={12} /> Goal reached!
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {pct >= 100 ? (
                        <button
                          onClick={() => updateGoal({ ...goal, status: 'completed' })}
                          className="px-3 py-1.5 rounded-lg bg-income/10 text-income text-xs font-semibold flex items-center gap-1 active:scale-95 transition-transform">
                          <CheckCircle2 size={12} /> Complete
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setShowLog(showLog === goal.id ? null : goal.id)}
                            className="px-2 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium"
                          >
                            Log
                          </button>
                          <button onClick={() => { setProgressGoalId(goal.id); setProgressAmount(''); setProgressNote(''); }}
                            className="px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold shadow-fab active:scale-95 transition-transform">Add</button>
                        </>
                      )}
                    </div>
                  </div>
                  {showLog === goal.id && (() => {
                    const log = loadLog(goal.id);
                    const isShowingAll = showAllLog === goal.id;
                    const visible = isShowingAll ? log : log.slice(0, 5);
                    return (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contribution History</p>
                        {log.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No contributions yet</p>
                        ) : (
                          <div className="space-y-1.5">
                            {visible.map((c, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <div>
                                  <span className="font-medium text-income">+{mask(fmt(c.amount))}</span>
                                  {c.note && <span className="text-muted-foreground ml-1.5">· {c.note}</span>}
                                </div>
                                <span className="text-muted-foreground">{format(parseISO(c.date), 'MMM d, yyyy')}</span>
                              </div>
                            ))}
                            {log.length > 5 && (
                              <button
                                onClick={() => setShowAllLog(isShowingAll ? null : goal.id)}
                                className="text-[11px] text-primary hover:underline mt-1"
                              >
                                {isShowingAll ? 'Show less' : `Show all ${log.length} entries`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {completedGoals.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowCompleted(v => !v)}
              className="flex items-center gap-2 text-sm font-heading text-muted-foreground uppercase tracking-wide mb-4 hover:text-foreground transition-colors"
            >
              <CheckCircle2 size={14} className="text-income" />
              Completed · {completedGoals.length}
              <ChevronDown size={14} className={`transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
            </button>
            {showCompleted && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedGoals.map(goal => (
                  <div key={goal.id} className="bg-card rounded-2xl p-4 card-shadow opacity-70 flex items-center gap-4">
                    <span className="w-12 h-12 rounded-2xl bg-income/10 flex items-center justify-center text-2xl shrink-0">{goal.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{goal.name}</p>
                      <p className="text-xs text-income font-medium">{mask(fmt(goal.savedAmount))} saved</p>
                    </div>
                    <CheckCircle2 size={18} className="text-income shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!progressGoalId} onOpenChange={(open) => { if (!open) { setProgressGoalId(null); setProgressAmount(''); setProgressNote(''); } }}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Add Progress</DialogTitle>
            <p className="text-sm text-muted-foreground">Enter the amount to add to your goal.</p>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Amount</label>
              <Input type="number" placeholder="0.00" min="0.01" step="0.01" value={progressAmount} onChange={e => setProgressAmount(e.target.value)} className="text-lg h-12" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Note (optional)</label>
              <Input placeholder="e.g. Monthly savings transfer" value={progressNote} onChange={e => setProgressNote(e.target.value)} className="h-10" />
            </div>
            <Button onClick={handleAddProgress} className="w-full gradient-primary text-primary-foreground">Save Progress</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddGoalDialog open={showAddGoal} onOpenChange={setShowAddGoal} editGoal={editGoal} />

      <AlertDialog open={!!deleteGoalId} onOpenChange={(o) => { if (!o) setDeleteGoalId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Goal?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteGoalId) removeGoal(deleteGoalId); setDeleteGoalId(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Goals;
