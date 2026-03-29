import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import type { Goal } from '@/types/finance';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editGoal?: Goal | null;
}

const GOAL_TYPES = [
  { name: 'Emergency', icon: '🛡️' },
  { name: 'Vacation', icon: '🏝️' },
  { name: 'Car', icon: '🚗' },
  { name: 'House', icon: '🏠' },
  { name: 'Education', icon: '📚' },
  { name: 'Wedding', icon: '💍' },
  { name: 'Gadget', icon: '📱' },
  { name: 'Other', icon: '🎯' },
];

const AddGoalDialog = ({ open, onOpenChange, editGoal }: Props) => {
  const { addGoal, updateGoal } = useFinance();
  const { currency } = useCurrency();
  const isEdit = !!editGoal;
  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setName(editGoal?.name || '');
      setGoalType(editGoal?.type || '');
      setTargetAmount(editGoal?.targetAmount?.toString() || '');
      setDeadline(editGoal?.deadline ? new Date(editGoal.deadline) : undefined);
    }
  }, [open, editGoal]);

  const selected = GOAL_TYPES.find(g => g.name === goalType);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !goalType || !targetAmount || submitting) return;
    setSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        icon: selected?.icon || '🎯',
        type: goalType,
        targetAmount: parseFloat(targetAmount),
        savedAmount: editGoal?.savedAmount || 0,
        deadline: deadline ? format(deadline, 'yyyy-MM-dd') : undefined,
        status: (editGoal?.status || 'active') as 'active' | 'completed' | 'paused',
      };
      if (isEdit) {
        await updateGoal({ ...data, id: editGoal.id });
      } else {
        await addGoal(data);
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Goal' : 'New Goal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Goal Name</label>
            <Input placeholder="e.g., Emergency Fund" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {GOAL_TYPES.map(g => (
                <button key={g.name} onClick={() => setGoalType(g.name)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs transition-all ${
                    goalType === g.name ? 'bg-accent ring-2 ring-primary' : 'bg-muted/50 hover:bg-muted'
                  }`}>
                  <span className="text-xl">{g.icon}</span>
                  <span className="text-muted-foreground">{g.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Target Amount ({currency})</label>
            <Input type="number" placeholder="10000" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Deadline (optional)</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background text-sm">
                  {deadline ? format(deadline, 'MMM d, yyyy') : <span className="text-muted-foreground">Pick a date</span>}
                  <CalendarIcon size={16} className="text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={deadline} onSelect={setDeadline} disabled={(date) => date < new Date()} initialFocus />
              </PopoverContent>
            </Popover>
            {deadline && (
              <button onClick={() => setDeadline(undefined)} className="text-xs text-muted-foreground mt-1 hover:text-foreground">
                Clear deadline
              </button>
            )}
          </div>
          <Button onClick={handleSubmit} disabled={!name.trim() || !goalType || !targetAmount || submitting}
            className="w-full gradient-primary text-primary-foreground">
            {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Create Goal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddGoalDialog;
