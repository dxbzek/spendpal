import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const [name, setName] = useState(editGoal?.name || '');
  const [goalType, setGoalType] = useState(editGoal?.type || '');
  const [targetAmount, setTargetAmount] = useState(editGoal?.targetAmount?.toString() || '');

  const selected = GOAL_TYPES.find(g => g.name === goalType);

  const handleSubmit = async () => {
    if (!name.trim() || !goalType || !targetAmount) return;
    const data = {
      name: name.trim(),
      icon: selected?.icon || '🎯',
      type: goalType,
      targetAmount: parseFloat(targetAmount),
      savedAmount: editGoal?.savedAmount || 0,
      status: (editGoal?.status || 'active') as 'active' | 'completed' | 'paused',
    };

    if (isEdit) {
      await updateGoal({ ...data, id: editGoal.id });
    } else {
      await addGoal(data);
    }
    onOpenChange(false);
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
            <label className="text-sm text-muted-foreground mb-1 block">Target Amount (AED)</label>
            <Input type="number" placeholder="10000" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={!name.trim() || !goalType || !targetAmount}
            className="w-full gradient-primary text-primary-foreground">
            {isEdit ? 'Save Changes' : 'Create Goal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddGoalDialog;
