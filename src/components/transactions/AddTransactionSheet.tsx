import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { CATEGORIES, type TransactionType } from '@/types/finance';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const AddTransactionSheet = ({ open, onOpenChange }: Props) => {
  const { accounts, addTransaction } = useFinance();
  const { currency } = useCurrency();
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('');
  const [accountId, setAccountId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const handleSubmit = async () => {
    if (!amount || !category || !accountId) return;
    await addTransaction({
      type,
      amount: parseFloat(amount),
      currency,
      category,
      categoryIcon,
      merchant: merchant || category,
      accountId,
      date,
    });
    setAmount('');
    setCategory('');
    setCategoryIcon('');
    setMerchant('');
    onOpenChange(false);
  };

  const selectCategory = (name: string, icon: string) => {
    setCategory(name);
    setCategoryIcon(icon);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Add Transaction</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {TYPES.map(t => (
              <button key={t.value} onClick={() => setType(t.value)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  type === t.value ? 'bg-card card-shadow text-foreground' : 'text-muted-foreground'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Amount ({currency})</label>
            <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
              className="text-2xl font-heading h-14 text-center" />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Category</label>
            <div className="grid grid-cols-5 gap-2">
              {CATEGORIES.slice(0, 15).map(c => (
                <button key={c.name} onClick={() => selectCategory(c.name, c.icon)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-all ${
                    category === c.name ? 'bg-accent ring-2 ring-primary' : 'bg-muted/50 hover:bg-muted'
                  }`}>
                  <span className="text-xl">{c.icon}</span>
                  <span className="truncate w-full text-center text-muted-foreground">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Account</label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Merchant (optional)</label>
            <Input placeholder="e.g., Starbucks" value={merchant} onChange={e => setMerchant(e.target.value)} />
          </div>

          <Button onClick={handleSubmit} className="w-full h-12 text-base gradient-primary text-primary-foreground">
            Add {type.charAt(0).toUpperCase() + type.slice(1)}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddTransactionSheet;
