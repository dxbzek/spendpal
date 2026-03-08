import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFinance } from '@/context/FinanceContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

const AddGoalDialog = ({ open, onOpenChange }: Props) => {
  const { addGoal } = useFinance();
  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState('');
  const [targetAmount, setTargetAmount] = useState('');

  const selected = GOAL_TYPES.find(g => g.name === goalType);

  const handleSubmit = () => {
    if (!name.trim() || !goalType || !targetAmount) return;
    addGoal({
      id: `goal-${Date.now()}`,
      name: name.trim(),
      icon: selected?.icon || '🎯',
      type: goalType,
      targetAmount: parseFloat(targetAmount),
      savedAmount: 0,
      status: 'active',
    });
    setName('');
    setGoalType('');
    setTargetAmount('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>New Goal</DialogTitle>
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
            Create Goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddGoalDialog;
