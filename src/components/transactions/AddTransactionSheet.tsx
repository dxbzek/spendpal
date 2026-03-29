import { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useCategories } from '@/hooks/useCategories';
import { type TransactionType } from '@/types/finance';
import type { Transaction } from '@/types/finance';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTransaction?: Transaction | null;
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const INSTALLMENT_OPTIONS = [3, 6, 9, 12, 18, 24, 36, 48, 60];

const AddTransactionSheet = ({ open, onOpenChange, editTransaction }: Props) => {
  const { accounts, transactions, addTransaction, updateTransaction, removeTransaction } = useFinance();
  const { currency } = useCurrency();
  const { categories } = useCategories();
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
  const [note, setNote] = useState('');
  
  // Duplicate detection state
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<Transaction | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<(() => Promise<void>) | null>(null);

  const isEditing = !!editTransaction;

  useEffect(() => {
    if (editTransaction && open) {
      setType(editTransaction.type as TransactionType);
      setAmount(String(editTransaction.amount));
      setCategory(editTransaction.category);
      setCategoryIcon(editTransaction.categoryIcon);
      setAccountId(editTransaction.accountId);
      setMerchant(editTransaction.merchant || '');
      setDate(editTransaction.date);
      setIsRecurring(editTransaction.isRecurring || false);
      setHasInstallments(!!(editTransaction.totalInstallments && editTransaction.currentInstallment));
      setTotalInstallments(String(editTransaction.totalInstallments || 12));
      setCurrentInstallment(String(editTransaction.currentInstallment || 1));
      setNote(editTransaction.note || '');
      setToAccountId('');
    } else if (!open) {
      resetForm();
    }
  }, [editTransaction, open]);

  const resetForm = () => {
    setType('expense');
    setAmount('');
    setCategory('');
    setCategoryIcon('');
    setMerchant('');
    setAccountId('');
    setToAccountId('');
    setIsRecurring(false);
    setHasInstallments(false);
    setTotalInstallments('12');
    setCurrentInstallment('1');
    setNote('');
    setShowDuplicateWarning(false);
    setDuplicateMatch(null);
    setPendingSubmit(null);
  };

  const isTransfer = type === 'transfer';

  // Build a lookup map once per transactions change so findDuplicate is O(1) instead of O(n).
  const duplicateLookup = useMemo(() => {
    const map = new Map<string, Transaction>();
    for (const t of transactions) {
      const key = `${t.accountId}|${t.type}|${t.date}|${t.amount.toFixed(2)}|${t.merchant.toLowerCase().trim()}`;
      if (!map.has(key)) map.set(key, t);
    }
    return map;
  }, [transactions]);

  const findDuplicate = (txAmount: number, txMerchant: string, txDate: string, txAccountId: string, txType: string): Transaction | null => {
    const key = `${txAccountId}|${txType}|${txDate}|${txAmount.toFixed(2)}|${txMerchant.toLowerCase().trim()}`;
    const match = duplicateLookup.get(key) ?? null;
    // Don't flag the transaction being edited as its own duplicate
    if (isEditing && match?.id === editTransaction?.id) return null;
    return match;
  };

  const executeSubmit = async () => {
    if (isTransfer) {
      if (!amount || !accountId || !toAccountId || accountId === toAccountId) return;
      if (isEditing) {
        await removeTransaction(editTransaction.id);
      }
      const transferNote = note || `Transfer to ${accounts.find(a => a.id === toAccountId)?.name || 'account'}`;
      const transferNoteIn = note || `Transfer from ${accounts.find(a => a.id === accountId)?.name || 'account'}`;
      await addTransaction({
        type: 'expense',
        amount: parseFloat(amount),
        currency,
        category: 'Transfer',
        categoryIcon: '🔁',
        merchant: merchant || 'Transfer',
        accountId,
        date,
        note: transferNote,
        isRecurring: false,
        totalInstallments: null,
        currentInstallment: null,
      });
      await addTransaction({
        type: 'income',
        amount: parseFloat(amount),
        currency,
        category: 'Transfer',
        categoryIcon: '🔁',
        merchant: merchant || 'Transfer',
        accountId: toAccountId,
        date,
        note: transferNoteIn,
        isRecurring: false,
        totalInstallments: null,
        currentInstallment: null,
      });
      resetForm();
      onOpenChange(false);
      return;
    }

    if (!amount || !category || !accountId) return;

    const txData = {
      type,
      amount: parseFloat(amount),
      currency,
      category,
      categoryIcon,
      merchant: merchant || category,
      accountId,
      date,
      note: note || null,
      isRecurring: isTransfer ? false : isRecurring,
      totalInstallments: (hasInstallments && isRecurring) ? (parseInt(totalInstallments) || 12) : null,
      currentInstallment: (hasInstallments && isRecurring) ? (parseInt(currentInstallment) || 1) : null,
    };

    if (isEditing) {
      await updateTransaction({ ...txData, id: editTransaction.id });
    } else {
      await addTransaction(txData);
    }

    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    // Skip duplicate check when editing
    if (!isEditing) {
      const txAmount = parseFloat(amount);
      const txMerchant = isTransfer ? (merchant || 'Transfer') : (merchant || category);
      const txType = isTransfer ? 'expense' : type;
      const txAccountIdCheck = accountId;
      
      if (txAmount && txMerchant && date && txAccountIdCheck) {
        const dup = findDuplicate(txAmount, txMerchant, date, txAccountIdCheck, txType);
        if (dup) {
          setDuplicateMatch(dup);
          setPendingSubmit(() => executeSubmit);
          setShowDuplicateWarning(true);
          return;
        }
      }
    }
    
    await executeSubmit();
  };

  const selectCategory = (name: string, icon: string) => {
    setCategory(name);
    setCategoryIcon(icon);
  };

  const totalAmount = hasInstallments
    ? (parseFloat(amount) || 0) * (parseInt(totalInstallments) || 0)
    : parseFloat(amount) || 0;

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || '';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto md:max-w-lg md:mx-auto md:left-1/2 md:-translate-x-1/2 md:right-auto">
          <SheetHeader>
            <SheetTitle className="text-lg">{isEditing ? 'Edit Transaction' : 'Add Transaction'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 mt-4">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {TYPES.map(t => (
                <button key={t.value} onClick={() => { setType(t.value); if (t.value !== 'transfer') { setCategory(''); setCategoryIcon(''); } }}
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
                  {categories.map(c => (
                    <button key={c.name} onClick={() => selectCategory(c.name, c.icon)}
                      title={c.name}
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

            {/* Merchant / Recipient */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                {isTransfer ? 'Recipient / Note (optional)' : 'Merchant (optional)'}
              </label>
              <Input placeholder={isTransfer ? 'e.g., Mom, Ahmed' : 'e.g., Starbucks'} value={merchant} onChange={e => setMerchant(e.target.value)} maxLength={100} />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Note (optional)</label>
              <Input placeholder="Add a note..." value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
            </div>

            <Button onClick={handleSubmit} className="w-full h-12 text-base gradient-primary text-primary-foreground">
              {isEditing ? 'Save Changes' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Duplicate transaction warning */}
      <AlertDialog open={showDuplicateWarning} onOpenChange={(o) => { if (!o) { setShowDuplicateWarning(false); setPendingSubmit(null); setDuplicateMatch(null); } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Possible Duplicate</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>A similar transaction already exists:</p>
                {duplicateMatch && (
                  <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                    <p className="font-medium text-foreground">{duplicateMatch.merchant}</p>
                    <p>{duplicateMatch.amount} {duplicateMatch.currency} • {duplicateMatch.date}</p>
                    <p className="text-muted-foreground">{getAccountName(duplicateMatch.accountId)} • {duplicateMatch.category}</p>
                  </div>
                )}
                <p>Do you still want to add this transaction?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setShowDuplicateWarning(false);
              if (pendingSubmit) await pendingSubmit();
              setPendingSubmit(null);
              setDuplicateMatch(null);
            }}>
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AddTransactionSheet;