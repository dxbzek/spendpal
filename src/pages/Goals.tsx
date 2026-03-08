import { useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Plus, Edit2, Trash2, CalendarClock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { differenceInDays, parseISO } from 'date-fns';
import AddGoalDialog from '@/components/forms/AddGoalDialog';
import type { Goal } from '@/types/finance';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const Goals = () => {
  const { goals, addGoalProgress, removeGoal } = useFinance();
  const { fmt } = useCurrency();
  const [progressGoalId, setProgressGoalId] = useState<string | null>(null);
  const [progressAmount, setProgressAmount] = useState('');
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const overallPct = totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0;

  const handleAddProgress = async () => {
    if (!progressGoalId || !progressAmount) return;
    await addGoalProgress(progressGoalId, parseFloat(progressAmount));
    setProgressGoalId(null);
    setProgressAmount('');
  };

  const activeGoals = goals.filter(g => g.status === 'active');

  const getDaysRemaining = (deadline?: string) => {
    if (!deadline) return null;
    const days = differenceInDays(parseISO(deadline), new Date());
    return days;
  };

  return (
    <div className="animate-fade-in">
      <div className="gradient-primary px-5 pt-12 pb-8 rounded-b-3xl">
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
            {overallPct}% <span className="text-sm font-normal text-primary-foreground/60">of {fmt(totalTarget)}</span>
          </p>
          <div className="h-2.5 bg-primary-foreground/20 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${overallPct}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-primary-foreground" />
          </div>
        </div>
      </div>

      <div className="px-5 md:px-6 -mt-4 space-y-4 pb-6">
        <h2 className="text-sm font-heading text-muted-foreground uppercase tracking-wide pt-2">Active Goals</h2>

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
            return (
              <div key={goal.id} className="bg-card rounded-2xl p-4 card-shadow group">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{goal.name}</p>
                      <p className="text-xs text-muted-foreground">{goal.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {daysLeft !== null && (
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mr-1 ${
                        daysLeft <= 7 ? 'bg-red-100 text-red-600' : daysLeft <= 30 ? 'bg-yellow-100 text-yellow-700' : 'bg-accent text-accent-foreground'
                      }`}>
                        <CalendarClock size={12} />
                        {daysLeft <= 0 ? 'Overdue' : `${daysLeft}d left`}
                      </span>
                    )}
                    <button onClick={() => { setEditGoal(goal); setShowAddGoal(true); }} className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1"><Edit2 size={16} /></button>
                    <button onClick={() => setDeleteGoalId(goal.id)} className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1"><Trash2 size={16} /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{fmt(goal.savedAmount)}</span><span>{fmt(goal.targetAmount)}</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full gradient-primary" />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{fmt(remaining)} remaining</p>
                  <button onClick={() => { setProgressGoalId(goal.id); setProgressAmount(''); }}
                    className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium">Add Progress</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={!!progressGoalId} onOpenChange={(open) => { if (!open) setProgressGoalId(null); }}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Add Progress</DialogTitle>
            <p className="text-sm text-muted-foreground">Enter the amount to add to your goal.</p>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Amount</label>
              <Input type="number" placeholder="0.00" value={progressAmount} onChange={e => setProgressAmount(e.target.value)} className="text-lg h-12" />
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
