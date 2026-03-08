import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinance } from '@/context/FinanceContext';
import { CATEGORIES, type Budget } from '@/types/finance';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBudget?: Budget | null;
}

const AddBudgetDialog = ({ open, onOpenChange, editBudget }: Props) => {
  const { addBudget, updateBudget } = useFinance();
  const isEdit = !!editBudget;
  const [category, setCategory] = useState(editBudget?.category || '');
  const [amount, setAmount] = useState(editBudget?.amount?.toString() || '');
  const [period, setPeriod] = useState<'monthly' | 'weekly'>(editBudget?.period || 'monthly');

  const selectedCat = CATEGORIES.find(c => c.name === category);

  const handleSubmit = async () => {
    if (!category || !amount) return;
    const data = {
      category,
      categoryIcon: selectedCat?.icon || '📌',
      amount: parseFloat(amount),
      period,
      month: format(new Date(), 'yyyy-MM'),
    };

    if (isEdit) {
      await updateBudget({ ...data, id: editBudget.id, spent: editBudget.spent });
    } else {
      await addBudget(data);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Budget' : 'Add Budget'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.name} value={c.name}>{c.icon} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Budget Amount (AED)</label>
            <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Period</label>
            <Select value={period} onValueChange={v => setPeriod(v as 'monthly' | 'weekly')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} disabled={!category || !amount} className="w-full gradient-primary text-primary-foreground">
            {isEdit ? 'Save Changes' : 'Add Budget'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddBudgetDialog;
