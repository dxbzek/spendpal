import { PageSpinner } from '@/components/ui/spinner';
import { goalPace, goalDeadlineLabel, goalPaceLabel } from '@/lib/finance/pace';
import { useToday } from '@/hooks/useToday';
import { useOpenAddFromRoute } from '@/hooks/useOpenAddFromRoute';
import { useState, useCallback } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';
import { Plus, Pencil, Trash2, CalendarClock, TrendingUp, CheckCircle2, ChevronDown, Pause, Play, Trophy, ScanLine, MoreHorizontal, History } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PAGE_X, IconButton, HeroCard, HeroChip, SectionLabel, SectionAction, Tile, ListCard, ListRow, BigAmount, Meter } from '@/components/orbix';
import ScanScreenshotSheet from '@/components/forms/ScanScreenshotSheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { differenceInCalendarDays, parseISO, format } from 'date-fns';
import AddGoalDialog from '@/components/forms/AddGoalDialog';
import type { Goal } from '@/types/finance';

// Paying something down rather than saving up: "paid off", and no savings-rate hint.
const isDebtGoal = (g: Pick<Goal, 'name' | 'type'>) =>
  /debt|loan|pay ?off|repay|credit card|tabby|\bemi\b/i.test(`${g.type} ${g.name}`);
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import AppIcon from '@/components/AppIcon';

interface Contribution { id?: string; amount: number; note: string; date: string; }

const Goals = () => {
  const { goals, addGoalProgress, withdrawGoalProgress, removeGoal, updateGoal, loading } = useFinance();
  const { fmt } = useCurrency();
  const { hidden, mask } = useBalanceMask();
  const { user } = useAuth();
  const [progressGoalId, setProgressGoalId] = useState<string | null>(null);
  const [progressMode, setProgressMode] = useState<'add' | 'withdraw'>('add');
  const [progressAmount, setProgressAmount] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [showLog, setShowLog] = useState<string | null>(null);
  const [showAllLog, setShowAllLog] = useState<string | null>(null);
  // Opened from the Home checklist: start with the Add dialog open.
  const openAdd = useOpenAddFromRoute();
  const [showAddGoal, setShowAddGoal] = useState(openAdd);
  const [showScan, setShowScan] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const { scheduleDelete: scheduleGoalDelete, isPending: isGoalPending } = useUndoableDelete({ deleteOne: removeGoal });
  const [showCompleted, setShowCompleted] = useState(false);

  // Contribution logs keyed by goal ID.
  const [contributionLogs, setContributionLogs] = useState<Record<string, Contribution[]>>({});

  const fetchContributions = useCallback(async (goalId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('goal_contributions')
      .select('id, amount, note, created_at')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { toast.error('Could not load contribution history'); return; }
    if (data) {
      setContributionLogs(prev => ({
        ...prev,
        [goalId]: data.map(r => ({ id: r.id, amount: r.amount, note: r.note ?? '', date: r.created_at })),
      }));
    }
  }, [user]);

  const saveContribution = useCallback(async (goalId: string, amount: number, note: string) => {
    if (!user) return false;
    const { data, error } = await supabase
      .from('goal_contributions')
      .insert({ goal_id: goalId, user_id: user.id, amount, note: note || null })
      .select('id, amount, note, created_at')
      .single();
    if (error) { toast.error('Progress was added, but its history entry could not be saved'); return false; }
    if (data) {
      setContributionLogs(prev => ({
        ...prev,
        [goalId]: [{ id: data.id, amount: data.amount, note: data.note ?? '', date: data.created_at }, ...(prev[goalId] ?? [])],
      }));
    }
    return true;
  }, [user]);

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const overallPct = totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0;

  const [savingProgress, setSavingProgress] = useState(false);
  const handleAddProgress = async () => {
    if (!progressGoalId || !progressAmount || savingProgress) return;
    const amount = parseFloat(progressAmount);
    if (isNaN(amount) || amount <= 0) return;
    setSavingProgress(true);
    try {
      if (progressMode === 'withdraw') {
        // The context shows its own "Withdrew …" toast on success.
        if (!await withdrawGoalProgress(progressGoalId, amount)) return;
      } else {
        if (!await addGoalProgress(progressGoalId, amount)) return;
        // Persist the contribution to Supabase.
        if (await saveContribution(progressGoalId, amount, progressNote.trim())) toast.success('Progress saved');
      }
    } finally {
      setSavingProgress(false);
    }
    setProgressGoalId(null);
    setProgressAmount('');
    setProgressNote('');
    setProgressMode('add');
  };

  // Paused goals stay in the active list (with their Resume button).
  // Goals waiting out their Undo window disappear straight away.
  const visibleGoals = goals.filter(g => !isGoalPending(g.id));
  const activeGoals = visibleGoals.filter(g => g.status !== 'completed');
  const completedGoals = visibleGoals.filter(g => g.status === 'completed');

  const today = useToday();
  const getDaysRemaining = (deadline?: string) => {
    if (!deadline) return null;
    return differenceInCalendarDays(parseISO(deadline), parseISO(today));
  };

  if (loading) return <PageSpinner />;

  // Whole units for the hero chips, so they fit at phone width.
  const fmtCompact = (n: number) => fmt(Math.round(n)).replace(/[.,]00(?=\D*$)/, '');
  const openAddGoal = () => { setEditGoal(null); setShowAddGoal(true); };
  const toggleLog = (goalId: string) => {
    const next = showLog === goalId ? null : goalId;
    setShowLog(next);
    if (next && !contributionLogs[next]) fetchContributions(next);
  };
  const openProgress = (goalId: string) => { setProgressGoalId(goalId); setProgressAmount(''); setProgressNote(''); setProgressMode('add'); };

  return (
    <div className={`${PAGE_X} pb-8 max-w-4xl mx-auto`}>
      {/* Header: big title, round icon buttons */}
      <div className="flex items-center justify-between gap-3 pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8 pb-4">
        <h1 className="text-[1.75rem] leading-tight font-heading font-semibold tracking-tight">Goals</h1>
        <div className="flex items-center gap-2 shrink-0">
          <IconButton onClick={() => setShowScan(true)} aria-label="Scan a goals screenshot" title="Scan a goals screenshot"><ScanLine size={19} /></IconButton>
          <IconButton onClick={openAddGoal} aria-label="New goal"><Plus size={20} /></IconButton>
        </div>
      </div>

      <div className="space-y-6">
        {/* Hero: saved across every goal against their targets */}
        <HeroCard>
          <p className="text-sm font-medium opacity-80">Total saved</p>
          <p className="mt-1 text-[2.4rem] leading-none font-medium tracking-tight tabular-nums">
            {hidden ? '••••••' : <BigAmount text={fmt(totalSaved)} />}
            <span className="text-base font-normal opacity-60"> / {mask(fmt(totalTarget))}</span>
          </p>
          <div className="mt-5 h-2 rounded-full bg-[hsl(258_30%_8%/0.12)] overflow-hidden"
            role="progressbar" aria-label="Progress" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[hsl(258_30%_8%)] transition-all" style={{ width: `${Math.min(overallPct, 100)}%` }} />
          </div>
          <div className="grid grid-cols-[0.75fr_1.4fr_0.95fr] gap-2 mt-4">
            <HeroChip label="Active" value={activeGoals.length} />
            <HeroChip label="Left to go" value={mask(fmtCompact(Math.max(0, totalTarget - totalSaved)))} />
            <HeroChip dark label="Progress" value={`${overallPct}%`} />
          </div>
        </HeroCard>

        <div>
          <SectionLabel label="Saving goals" count={activeGoals.length}
            action={<SectionAction onClick={openAddGoal}>New goal</SectionAction>} />

          {activeGoals.length === 0 ? (
            <Tile className="text-center py-12">
              <p className="text-muted-foreground text-sm">No active goals</p>
            </Tile>
          ) : (
            <ListCard>
              {activeGoals.map(goal => {
                const pct = goal.targetAmount ? Math.round((goal.savedAmount / goal.targetAmount) * 100) : 0;
                const remaining = goal.targetAmount - goal.savedAmount;
                const daysLeft = getDaysRemaining(goal.deadline);
                const debt = isDebtGoal(goal);
                const paused = goal.status === 'paused';
                // A paused goal asks for nothing until it's resumed.
                const pace = goalPace(remaining, daysLeft, paused);
                const paceLabel = goalPaceLabel(pace, n => mask(fmt(n)));
                return (
                  <div key={goal.id} className="py-4">
                    <div className={`flex items-start gap-3 ${paused ? 'opacity-60' : ''}`}>
                      <span className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-[20px] shrink-0"><AppIcon value={goal.icon} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[15px] font-medium truncate flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{goal.name}</span>
                            {paused && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Paused</span>}
                          </p>
                          <p className="text-[15px] font-medium tabular-nums text-primary shrink-0">{pct}%</p>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className="truncate tabular-nums">
                            {mask(fmt(goal.savedAmount))} of {mask(fmt(goal.targetAmount))}{debt ? ' paid off' : ''}
                          </span>
                          {daysLeft !== null && (
                            <span className={`shrink-0 flex items-center gap-1 ${daysLeft <= 7 ? 'text-expense' : daysLeft <= 30 ? 'text-warning' : ''}`}>
                              <CalendarClock size={11} /> {goalDeadlineLabel(daysLeft)}
                            </span>
                          )}
                        </div>
                        <Meter value={pct} label={`${goal.name} progress`} className="mt-2 h-1" />
                      </div>
                    </div>

                    {/* What's left, and the row's actions */}
                    <div className="flex items-center justify-between gap-2 mt-2.5 pl-14">
                      <div className="min-w-0 text-[11px]">
                        {remaining > 0 ? (
                          <>
                            <p className="text-muted-foreground truncate">{mask(fmt(remaining))} remaining · {goal.type}</p>
                            {paceLabel && (
                              <p className={`flex items-center gap-1 mt-0.5 ${pace?.kind === 'perMonth' ? 'text-primary' : 'text-warning'}`}>
                                <TrendingUp size={10} className="shrink-0" /> {paceLabel}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="font-medium text-income flex items-center gap-1"><Trophy size={12} /> Reached</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {pct >= 100 ? (
                          <button onClick={() => updateGoal({ ...goal, status: 'completed' })}
                            className="h-8 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1">
                            <CheckCircle2 size={12} /> Complete
                          </button>
                        ) : (
                          <button onClick={() => openProgress(goal.id)}
                            className="h-8 px-4 rounded-full bg-primary text-primary-foreground text-xs font-medium">Add</button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" aria-label={`${goal.name} actions`} className="tap-area p-1.5 rounded-full text-muted-foreground hover:text-foreground">
                              <MoreHorizontal size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onSelect={() => updateGoal({ ...goal, status: 'active' === goal.status ? 'paused' : 'active' })}
                              aria-label={paused ? 'Resume goal' : 'Pause goal'}>
                              {paused ? <Play size={14} className="mr-2" /> : <Pause size={14} className="mr-2" />} {paused ? 'Resume' : 'Pause'}
                            </DropdownMenuItem>
                            {pct < 100 && (
                              <DropdownMenuItem onSelect={() => toggleLog(goal.id)}>
                                <History size={14} className="mr-2" /> {showLog === goal.id ? 'Hide log' : 'Log'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => { setEditGoal(goal); setShowAddGoal(true); }} aria-label="Edit goal">
                              <Pencil size={14} className="mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDeleteGoalId(goal.id)} aria-label="Delete goal" className="text-destructive focus:text-destructive">
                              <Trash2 size={14} className="mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {showLog === goal.id && (() => {
                      const log = contributionLogs[goal.id] ?? [];
                      const isShowingAll = showAllLog === goal.id;
                      const visible = isShowingAll ? log : log.slice(0, 5);
                      return (
                        <div className="mt-3 ml-14 rounded-2xl bg-muted/60 px-3 py-2.5">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.16em] mb-2">History</p>
                          {log.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No contributions yet</p>
                          ) : (
                            <div className="space-y-1.5">
                              {visible.map((c, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <div className="min-w-0 truncate">
                                    <span className="font-medium text-income tabular-nums">+{mask(fmt(c.amount))}</span>
                                    {c.note && <span className="text-muted-foreground ml-1.5">· {c.note}</span>}
                                  </div>
                                  <span className="text-muted-foreground shrink-0 ml-2">{format(parseISO(c.date), 'MMM d, yyyy')}</span>
                                </div>
                              ))}
                              {log.length > 5 && (
                                <button onClick={() => setShowAllLog(isShowingAll ? null : goal.id)} className="text-xs text-primary mt-1">
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
            </ListCard>
          )}
        </div>

        {completedGoals.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <button onClick={() => setShowCompleted(v => !v)} aria-expanded={showCompleted}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-[0.16em] hover:text-foreground transition-colors">
                Completed · <span className="text-foreground">{completedGoals.length}</span>
                <ChevronDown size={14} className={`transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {showCompleted && (
              <ListCard>
                {completedGoals.map(goal => (
                  <ListRow key={goal.id}
                    icon={<span className="text-[20px]"><AppIcon value={goal.icon} /></span>}
                    title={goal.name}
                    sub={<span className="text-income">{mask(fmt(goal.savedAmount))} {isDebtGoal(goal) ? 'paid off' : 'saved'}</span>}
                    trailing={<CheckCircle2 size={18} className="text-income shrink-0" />} />
                ))}
              </ListCard>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!progressGoalId} onOpenChange={(open) => { if (!open) { setProgressGoalId(null); setProgressAmount(''); setProgressNote(''); setProgressMode('add'); } }}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{progressMode === 'withdraw' ? 'Withdraw from Goal' : 'Add Progress'}</DialogTitle>
            <p className="text-sm text-muted-foreground">{progressMode === 'withdraw' ? 'Enter the amount to withdraw from your goal.' : 'Enter the amount to add to your goal.'}</p>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Deposit / Withdraw toggle */}
            <div className="flex p-0.5 bg-muted rounded-xl">
              <button
                onClick={() => setProgressMode('add')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${progressMode === 'add' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              >
                Deposit
              </button>
              <button
                onClick={() => setProgressMode('withdraw')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${progressMode === 'withdraw' ? 'bg-card shadow-sm text-destructive' : 'text-muted-foreground'}`}
              >
                Withdraw
              </button>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Amount</label>
              <Input type="number" placeholder="0.00" min="0.01" step="0.01" value={progressAmount} onChange={e => setProgressAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddProgress(); }} className="text-lg h-12" />
            </div>
            {progressMode === 'add' && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Note (optional)</label>
                <Input placeholder="e.g. Monthly savings transfer" value={progressNote} onChange={e => setProgressNote(e.target.value)} className="h-10" />
              </div>
            )}
            <Button onClick={handleAddProgress} disabled={savingProgress} className={`w-full ${progressMode === 'withdraw' ? 'bg-destructive text-destructive-foreground hover:brightness-95' : 'bg-primary text-primary-foreground'}`}>
              {progressMode === 'withdraw' ? 'Withdraw' : 'Save Progress'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddGoalDialog open={showAddGoal} onOpenChange={setShowAddGoal} editGoal={editGoal} />

      <ScanScreenshotSheet open={showScan} onOpenChange={setShowScan} target="goal" />

      <AlertDialog open={!!deleteGoalId} onOpenChange={(o) => { if (!o) setDeleteGoalId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete this goal?</AlertDialogTitle><AlertDialogDescription>Deletes the goal and its history. You can undo for a few seconds.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteGoalId) scheduleGoalDelete([deleteGoalId], 'Goal deleted'); setDeleteGoalId(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Goals;
