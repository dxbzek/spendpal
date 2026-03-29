import { useState, useEffect, useMemo } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { CATEGORIES, type Budget } from '@/types/finance';
import { format, subMonths, getMonth, getYear, parseISO } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBudget?: Budget | null;
}

const ROLLOVER_KEY = 'spendpal_rollover_cats';

function getRolloverCats(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ROLLOVER_KEY) || '[]')); }
  catch { return new Set(); }
}
function setRolloverCats(cats: Set<string>) {
  localStorage.setItem(ROLLOVER_KEY, JSON.stringify([...cats]));
}

const AddBudgetDialog = ({ open, onOpenChange, editBudget }: Props) => {
  const { addBudget, updateBudget, budgets, transactions } = useFinance();
  const { currency, fmt } = useCurrency();
  const isEdit = !!editBudget;
  const [category, setCategory] = useState(editBudget?.category || '');
  const [amount, setAmount] = useState(editBudget?.amount?.toString() || '');
  const [period, setPeriod] = useState<'monthly' | 'weekly'>(editBudget?.period || 'monthly');
  const [rollover, setRollover] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedCat = CATEGORIES.find(c => c.name === category);

  // Last month's unspent for this category
  const lastMonthUnspent = useMemo(() => {
    if (!category || isEdit) return null;
    const prev = subMonths(new Date(), 1);
    const pm = getMonth(prev), py = getYear(prev);
    const prevMonth = format(prev, 'yyyy-MM');

    // Find last month's budget for this category
    const prevBudget = budgets.find(b => b.category === category && b.month === prevMonth);
    if (prevBudget) {
      const unspent = prevBudget.amount - prevBudget.spent;
      return unspent > 0 ? unspent : null;
    }

    // Fall back to spending-based calculation
    const spent = transactions
      .filter(t => {
        const d = parseISO(t.date);
        return t.type === 'expense' && t.category === category && getMonth(d) === pm && getYear(d) === py;
      })
      .reduce((s, t) => s + t.amount, 0);

    return spent > 0 ? null : null; // Only show rollover if there was a budget
  }, [category, budgets, transactions, isEdit]);

  // When category changes, load rollover preference
  useEffect(() => {
    if (!category) return;
    const saved = getRolloverCats();
    setRollover(saved.has(category));
  }, [category]);

  // When rollover toggles, update amount
  useEffect(() => {
    if (!rollover || !lastMonthUnspent || !amount) return;
    const base = parseFloat(amount) || 0;
    if (!isEdit && lastMonthUnspent > 0) {
      setAmount((base + lastMonthUnspent).toFixed(2));
    }
  }, [rollover]);

  const handleSubmit = async () => {
    if (!category || !amount || submitting) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setSubmitting(true);

    // Save rollover preference
    const cats = getRolloverCats();
    if (rollover) cats.add(category);
    else cats.delete(category);
    setRolloverCats(cats);

    try {
      const data = {
        category,
        categoryIcon: selectedCat?.icon || '📌',
        amount: parsedAmount,
        period,
        month: format(new Date(), 'yyyy-MM'),
      };
      if (isEdit) {
        await updateBudget({ ...data, id: editBudget.id, spent: editBudget.spent });
      } else {
        await addBudget(data);
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
            <label className="text-sm text-muted-foreground mb-1 block">Budget Amount ({currency})</label>
            <Input type="number" placeholder="0.00" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
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

          {/* Rollover option */}
          {!isEdit && lastMonthUnspent && lastMonthUnspent > 0 && (
            <div className="flex items-center justify-between p-3 bg-accent/50 rounded-xl">
              <div className="flex items-center gap-2">
                <RotateCcw size={14} className="text-primary" />
                <div>
                  <p className="text-xs font-medium">Roll over {fmt(lastMonthUnspent)}</p>
                  <p className="text-[11px] text-muted-foreground">Add last month's unspent to this budget</p>
                </div>
              </div>
              <Switch checked={rollover} onCheckedChange={setRollover} />
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!category || !amount || submitting} className="w-full gradient-primary text-primary-foreground">
            {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Add Budget'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddBudgetDialog;
