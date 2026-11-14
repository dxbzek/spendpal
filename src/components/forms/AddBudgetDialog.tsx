import { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AmountInput } from '@/components/ui/AmountInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { FIXED_EXPENSE_CATEGORIES, type Budget } from '@/types/finance';
import { useCategories } from '@/hooks/useCategories';
import { useToday } from '@/hooks/useToday';
import { format, subMonths, parseISO } from 'date-fns';
import { asMonthly, spentByBudgetCategory, unspentOf } from '@/lib/finance/budgetSpend';
import AppIcon from '@/components/AppIcon';
import { userSettings } from '@/lib/userSettings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBudget?: Budget | null;
}

// The categories the user last chose rollover for, kept with their settings.
const getRolloverCats = () => new Set(userSettings.get('rollover_categories') ?? []);
const setRolloverCats = (cats: Set<string>) => userSettings.set('rollover_categories', [...cats]);

const AddBudgetDialog = ({ open, onOpenChange, editBudget: rawEditBudget }: Props) => {
  const { addBudget, updateBudget, budgets, transactions } = useFinance();
  const today = useToday();
  const monthKey = today.slice(0, 7);
  // An old weekly budget opens as the monthly amount it is shown as, and is
  // saved as monthly. Weekly is no longer offered (see asMonthly).
  const editBudget = useMemo(() => (rawEditBudget ? asMonthly(rawEditBudget) : rawEditBudget), [rawEditBudget]);
  const { currency, fmt } = useCurrency();
  const { getCategoriesForType } = useCategories();
  const isEdit = !!editBudget;
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  // Unspent amount currently folded into `amount` by the rollover switch, so
  // toggling it off takes it back out instead of stacking on every toggle.
  const appliedRollover = useRef(0);
  const [rollover, setRollover] = useState(false);
  const [isFixed, setIsFixed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the dialog opens or the target budget changes
  useEffect(() => {
    if (open) {
      setCategory(editBudget?.category || '');
      setAmount(editBudget?.amount?.toString() || '');
      appliedRollover.current = 0;
      setIsFixed(editBudget?.isFixed ?? false);
      setRollover(false);
    }
  }, [open, editBudget]);

  const expenseCategories = getCategoriesForType('expense');
  const selectedCat = expenseCategories.find(c => c.name === category);

  // Categories that already have a budget this month can't be added again — the
  // DB enforces one budget per (category, month, period), so offering them would
  // only produce a confusing unique-constraint error on submit. When editing, the
  // budget's own category stays selectable.
  const availableCategories = useMemo(() => {
    const taken = new Set(
      budgets
        .filter(b => b.month === monthKey && b.category !== editBudget?.category)
        .map(b => b.category)
    );
    return expenseCategories.filter(c => !taken.has(c.name));
    // expenseCategories is rebuilt each render from the same rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, editBudget, expenseCategories.length, monthKey]);

  // What was left of last month's budget for this category. Only offered when
  // last month had one. Measured against last month's spending: the budget
  // row's own `spent` is this month's, which offered nearly the whole budget.
  const lastMonthUnspent = useMemo(() => {
    if (!category || isEdit) return null;
    const prevMonth = format(subMonths(parseISO(today), 1), 'yyyy-MM');
    const prevBudgets = budgets.filter(b => b.month === prevMonth).map(asMonthly);
    const prevBudget = prevBudgets.find(b => b.category === category);
    if (!prevBudget) return null;
    const spent = spentByBudgetCategory(transactions, prevMonth, new Set(prevBudgets.map(b => b.category)));
    const unspent = unspentOf(prevBudget.amount, spent[category] ?? 0);
    return unspent > 0 ? unspent : null;
  }, [category, budgets, transactions, isEdit, today]);

  // When category changes, load rollover preference and auto-detect fixed
  useEffect(() => {
    if (!category) return;
    const saved = getRolloverCats();
    setRollover(saved.has(category));
    if (!isEdit) setIsFixed(FIXED_EXPENSE_CATEGORIES.has(category));
  }, [category]);

  // When rollover toggles (or unspent amount changes), update amount
  useEffect(() => {
    const target = rollover && !isEdit && lastMonthUnspent && lastMonthUnspent > 0 ? lastMonthUnspent : 0;
    const delta = target - appliedRollover.current;
    if (delta === 0) return;
    appliedRollover.current = target;
    setAmount(a => Math.max(0, (parseFloat(a) || 0) + delta).toFixed(2));
  }, [rollover, lastMonthUnspent, isEdit]);

  const handleSubmit = async () => {
    if (!category || !amount || submitting) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setSubmitting(true);

    // Save the rollover choice, only when it changed: each change is a write.
    const cats = getRolloverCats();
    if (cats.has(category) !== rollover) {
      if (rollover) cats.add(category);
      else cats.delete(category);
      setRolloverCats(cats);
    }

    try {
      const data = {
        category,
        categoryIcon: selectedCat?.icon || '📌',
        amount: parsedAmount,
        period: 'monthly' as const,
        // Editing keeps the budget's own month: a carried-forward budget from
        // last month must not suddenly claim to be this month's.
        month: isEdit ? editBudget.month : monthKey,
        isFixed,
      };
      const ok = isEdit
        ? await updateBudget({ ...data, id: editBudget.id, spent: editBudget.spent })
        : await addBudget(data);
      if (ok) onOpenChange(false);
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
                {availableCategories.map(c => (
                  <SelectItem key={c.name} value={c.name}><AppIcon value={c.icon} /> {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isEdit && availableCategories.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Every category already has a budget this month. Edit an existing one instead.
              </p>
            )}
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Monthly budget ({currency})</label>
            <AmountInput placeholder="0.00" value={amount} onChange={setAmount} onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} />
          </div>
          {/* Fixed expense option */}
          <div className="flex items-center justify-between p-3 bg-accent rounded-xl">
            <div>
              <p className="text-xs font-medium">Fixed expense</p>
              <p className="text-xs text-muted-foreground">Skip budget alerts (e.g. rent, utilities)</p>
            </div>
            <Switch checked={isFixed} onCheckedChange={setIsFixed} />
          </div>

          {/* Rollover option */}
          {!isEdit && lastMonthUnspent && lastMonthUnspent > 0 && (
            <div className="flex items-center justify-between p-3 bg-accent rounded-xl">
              <div className="flex items-center gap-2">
                <RotateCcw size={14} className="text-primary" />
                <div>
                  <p className="text-xs font-medium">Roll over {fmt(lastMonthUnspent)}</p>
                  <p className="text-xs text-muted-foreground">Add last month's unspent to this budget</p>
                </div>
              </div>
              <Switch checked={rollover} onCheckedChange={setRollover} />
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!category || !amount || submitting} className="w-full bg-primary text-primary-foreground">
            {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Add Budget'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddBudgetDialog;
