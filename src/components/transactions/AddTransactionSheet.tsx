import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { CATEGORIES, TRANSFER_CATEGORIES, type TransactionType } from '@/types/finance';
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

const INSTALLMENT_OPTIONS = [3, 6, 9, 12, 18, 24, 36, 48, 60];

const AddTransactionSheet = ({ open, onOpenChange }: Props) => {
  const { accounts, addTransaction } = useFinance();
  const { currency } = useCurrency();
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isRecurring, setIsRecurring] = useState(false);
  const [hasInstallments, setHasInstallments] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('12');
  const [currentInstallment, setCurrentInstallment] = useState('1');

  const isTransfer = type === 'transfer';

  const handleSubmit = async () => {
    if (isTransfer) {
      if (!amount || !accountId || !toAccountId) return;
      await addTransaction({
        type,
        amount: parseFloat(amount),
        currency,
        category: 'Transfer',
        categoryIcon: '🔁',
        merchant: 'Transfer',
        accountId,
        date,
        isRecurring: false,
        totalInstallments: null,
        currentInstallment: null,
      });
    } else if (hasInstallments && isRecurring) {
      if (!amount || !category || !accountId) return;
      const total = parseInt(totalInstallments) || 12;
      const current = parseInt(currentInstallment) || 1;
      await addTransaction({
        type,
        amount: parseFloat(amount),
        currency,
        category,
        categoryIcon,
        merchant: merchant || category,
        accountId,
        date,
        isRecurring: true,
        totalInstallments: total,
        currentInstallment: current,
      });
    } else {
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
        isRecurring,
        totalInstallments: null,
        currentInstallment: null,
      });
    }

    // Reset
    setAmount('');
    setCategory('');
    setCategoryIcon('');
    setMerchant('');
    setToAccountId('');
    setIsRecurring(false);
    setHasInstallments(false);
    setTotalInstallments('12');
    setCurrentInstallment('1');
    onOpenChange(false);
  };

  const selectCategory = (name: string, icon: string) => {
    setCategory(name);
    setCategoryIcon(icon);
  };

  const totalAmount = hasInstallments
    ? (parseFloat(amount) || 0) * (parseInt(totalInstallments) || 0)
    : parseFloat(amount) || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto md:max-w-lg md:mx-auto md:left-1/2 md:-translate-x-1/2 md:right-auto">
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
            <label className="text-sm text-muted-foreground mb-1 block">
              {hasInstallments ? `Per Installment (${currency})` : `Amount (${currency})`}
            </label>
            <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
              className="text-2xl font-heading h-14 text-center" />
          </div>

          {/* Recurring toggle - hidden for transfers */}
          {!isTransfer && (
            <div className="bg-muted/50 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Recurring</p>
                  <p className="text-xs text-muted-foreground">Monthly recurring expense</p>
                </div>
                <Switch checked={isRecurring} onCheckedChange={(v) => {
                  setIsRecurring(v);
                  if (v) setHasInstallments(true);
                  if (!v) setHasInstallments(false);
                }} />
              </div>

              {isRecurring && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Installment Plan</p>
                    <p className="text-xs text-muted-foreground">Track payment progress</p>
                  </div>
                  <Switch checked={hasInstallments} onCheckedChange={setHasInstallments} />
                </div>
              )}

              {hasInstallments && isRecurring && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Total Installments</label>
                      <Select value={totalInstallments} onValueChange={setTotalInstallments}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INSTALLMENT_OPTIONS.map(n => (
                            <SelectItem key={n} value={String(n)}>{n} months</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Current Installment</label>
                      <Input type="number" min="1" max={totalInstallments}
                        value={currentInstallment} onChange={e => setCurrentInstallment(e.target.value)}
                        className="h-10" />
                    </div>
                  </div>
                  {amount && (
                    <div className="bg-primary/5 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Total Cost</p>
                      <p className="text-sm font-heading text-foreground">
                        {totalAmount.toLocaleString()} {currency} ({currentInstallment}/{totalInstallments})
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Remaining: {((parseInt(totalInstallments) - parseInt(currentInstallment)) * (parseFloat(amount) || 0)).toLocaleString()} {currency}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Category - hidden for transfers */}
          {!isTransfer && (
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
          )}

          {/* Accounts */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              {isTransfer ? 'From Account' : 'Account'}
            </label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isTransfer && (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">To Account</label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter(a => a.id !== accountId).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Merchant - hidden for transfers */}
          {!isTransfer && (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Merchant (optional)</label>
              <Input placeholder="e.g., Starbucks" value={merchant} onChange={e => setMerchant(e.target.value)} />
            </div>
          )}

          <Button onClick={handleSubmit} className="w-full h-12 text-base gradient-primary text-primary-foreground">
            Add {type.charAt(0).toUpperCase() + type.slice(1)}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddTransactionSheet;
