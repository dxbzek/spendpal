import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFinance } from '@/context/FinanceContext';
import { Target } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { useCategories } from '@/hooks/useCategories';
import { type TransactionType } from '@/types/finance';
import type { Transaction } from '@/types/finance';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Prefill {
  type: TransactionType;
  merchant: string;
  amount: string;
  category: string;
  categoryIcon: string;
  isRecurring: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTransaction?: Transaction | null;
  prefill?: Prefill | null;
  recurringMode?: boolean;
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const INSTALLMENT_OPTIONS = [3, 6, 9, 12, 18, 24, 36, 48, 60];

const AddTransactionSheet = ({ open, onOpenChange, editTransaction, prefill, recurringMode }: Props) => {
  const { accounts, transactions, goals, addTransaction, updateTransaction, removeTransaction, addGoalProgress } = useFinance();
  const { currency } = useCurrency();
  const { getCategoriesForType, refresh: refreshCategories } = useCategories();
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
  const [isTrackingOnly, setIsTrackingOnly] = useState(false);
  const [loanTotalAmount, setLoanTotalAmount] = useState('');
  const [note, setNote] = useState('');
  const [allocateToGoal, setAllocateToGoal] = useState(false);
  const [goalAllocationId, setGoalAllocationId] = useState('');
  const [goalAllocationAmount, setGoalAllocationAmount] = useState('');

  // Duplicate detection state
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<Transaction | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<(() => Promise<void>) | null>(null);

  const isEditing = !!editTransaction;

  useEffect(() => {
    if (open) refreshCategories();
  }, [open]);

  useEffect(() => {
    if (editTransaction && open) {
      const isTransferTx = editTransaction.category === 'Transfer' && editTransaction.type === 'expense';
      setType(isTransferTx ? 'transfer' : editTransaction.type as TransactionType);
      setAmount(String(editTransaction.amount));
      setCategory(editTransaction.category);
      setCategoryIcon(editTransaction.categoryIcon);
      setAccountId(editTransaction.accountId);
      setMerchant(editTransaction.merchant === 'Transfer' ? '' : (editTransaction.merchant || ''));
      setDate(editTransaction.date);
      const hasInst = editTransaction.totalInstallments != null && editTransaction.totalInstallments > 0;
      // Force isRecurring true if the transaction has installments (installments imply recurring)
      setIsRecurring(hasInst ? true : (editTransaction.isRecurring || false));
      setHasInstallments(hasInst);
      setTotalInstallments(String(editTransaction.totalInstallments || 12));
      setCurrentInstallment(String(editTransaction.currentInstallment ?? 0));
      setLoanTotalAmount(editTransaction.loanTotalAmount ? String(editTransaction.loanTotalAmount) : '');
      setIsTrackingOnly(editTransaction.isTrackingOnly || false);
      setNote(editTransaction.note || '');
      if (isTransferTx) {
        // Find the matching income half to restore toAccountId
        const match = transactions.find(t =>
          t.type === 'income' &&
          t.category === 'Transfer' &&
          t.date === editTransaction.date &&
          t.amount === editTransaction.amount &&
          t.id !== editTransaction.id
        );
        setToAccountId(match?.accountId || '');
      } else {
        setToAccountId('');
      }
    } else if (prefill && open) {
      setType(prefill.type);
      setAmount(prefill.amount);
      setCategory(prefill.category);
      setCategoryIcon(prefill.categoryIcon);
      setMerchant(prefill.merchant);
      setIsRecurring(prefill.isRecurring);
    } else if (open && recurringMode) {
      setIsRecurring(true);
      setHasInstallments(true);
    } else if (!open) {
      resetForm();
    }
  }, [editTransaction, prefill, open]);

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
    setLoanTotalAmount('');
    setIsTrackingOnly(false);
    setNote('');
    setAllocateToGoal(false);
    setGoalAllocationId('');
    setGoalAllocationAmount('');
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
      const parsedTransferAmount = parseFloat(amount);
      if (!amount || isNaN(parsedTransferAmount) || parsedTransferAmount <= 0) { toast.error('Please enter a valid amount'); return; }
      if (!accountId) { toast.error('Please select an account'); return; }
      if (!toAccountId) { toast.error('Please select a destination account'); return; }
      if (accountId === toAccountId) { toast.error('Source and destination accounts must be different'); return; }
      if (isEditing) {
        // Remove both halves of the original transfer pair to avoid orphaned transactions
        const partner = transactions.find(t =>
          t.type === 'income' &&
          t.category === 'Transfer' &&
          t.date === editTransaction.date &&
          t.amount === editTransaction.amount &&
          t.id !== editTransaction.id
        );
        await removeTransaction(editTransaction.id);
        if (partner) await removeTransaction(partner.id);
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

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { toast.error('Please enter a valid amount'); return; }
    if (!category) { toast.error('Please select a category'); return; }
    if (!accountId) { toast.error('Please select an account'); return; }

    const txData = {
      type,
      amount: parsedAmount,
      currency,
      category,
      categoryIcon,
      merchant: merchant || category,
      accountId,
      date,
      note: note || null,
      isRecurring: isTransfer ? false : isRecurring,
      totalInstallments: (hasInstallments && isRecurring) ? (parseInt(totalInstallments) || 12) : null,
      currentInstallment: (hasInstallments && isRecurring) ? Math.max(0, isNaN(parseInt(currentInstallment)) ? 0 : parseInt(currentInstallment)) : null,
      loanTotalAmount: (hasInstallments && isRecurring && loanTotalAmount) ? (parseFloat(loanTotalAmount) || null) : null,
      isTrackingOnly: (hasInstallments && isRecurring) ? isTrackingOnly : false,
    };

    if (isEditing) {
      await updateTransaction({ ...txData, id: editTransaction.id });
    } else {
      await addTransaction(txData);
    }

    const parsedGoalAmount = parseFloat(goalAllocationAmount);
    if (allocateToGoal && goalAllocationId && !isNaN(parsedGoalAmount) && parsedGoalAmount > 0) {
      await addGoalProgress(goalAllocationId, parsedGoalAmount);
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

  const perInstallment = parseFloat(amount) || 0;
  const totalInst = parseInt(totalInstallments) || 0;
  const currentInst = parseInt(currentInstallment) || 0;
  const loanTotal = parseFloat(loanTotalAmount) || 0;
  const displayTotal = hasInstallments
    ? (loanTotal || perInstallment * totalInst)
    : perInstallment;
  const remainingInstCount = hasInstallments ? Math.max(0, totalInst - currentInst) : 0;
  const remainingBalance = remainingInstCount * perInstallment;
  const totalAmount = displayTotal;

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || '';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{isEditing ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            <div className="flex gap-1 p-1 bg-muted rounded-xl">
              {TYPES.filter(t => !recurringMode || t.value !== 'transfer').map(t => (
                <button key={t.value} onClick={() => { setType(t.value); setCategory(''); setCategoryIcon(''); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    type === t.value
                      ? t.value === 'expense'
                        ? 'bg-expense text-white shadow-sm'
                        : t.value === 'income'
                          ? 'bg-income text-white shadow-sm'
                          : 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {hasInstallments ? `Per Installment (${currency})` : `Amount (${currency})`}
              </label>
              <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                className="text-3xl font-heading h-16 text-center tracking-tight" />
            </div>

            {/* Recurring toggle - hidden for transfers */}
            {!isTransfer && (
              <div className="bg-muted/50 rounded-xl p-3 space-y-3">
                {!recurringMode && (
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
                )}

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
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Tracking Only</p>
                        <p className="text-xs text-muted-foreground">From CC / Tabby — no balance deduction</p>
                      </div>
                      <Switch checked={isTrackingOnly} onCheckedChange={setIsTrackingOnly} />
                    </div>
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
                          value={currentInstallment}
                          onChange={e => {
                            const v = parseInt(e.target.value);
                            const max = parseInt(totalInstallments) || 1;
                            if (!isNaN(v) && v >= 1 && v <= max) setCurrentInstallment(String(v));
                          }}
                          className="h-10" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Original Purchase Price ({currency}) — optional</label>
                      <Input type="number" placeholder="e.g. 1200 (before interest/fees)"
                        value={loanTotalAmount} onChange={e => setLoanTotalAmount(e.target.value)}
                        className="h-10" />
                      <p className="text-[10px] text-muted-foreground mt-1">Enter the actual item price, not the total of all installments. This enables accurate principal vs. interest breakdown.</p>
                    </div>
                    {amount && (
                      <div className="bg-primary/5 rounded-lg p-2.5 text-center">
                        <p className="text-xs text-muted-foreground">Total Cost</p>
                        <p className="text-sm font-heading text-foreground">
                          {totalAmount.toLocaleString()} {currency} ({currentInstallment}/{totalInstallments})
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Remaining: {remainingBalance.toLocaleString()} {currency} ({remainingInstCount} installment{remainingInstCount !== 1 ? 's' : ''})
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
                <label className="text-sm font-medium mb-2 block">Category</label>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {getCategoriesForType(type).map(c => (
                    <button key={c.name} onClick={() => selectCategory(c.name, c.icon)}
                      title={c.name}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs transition-all active:scale-95 ${
                        category === c.name ? 'bg-accent ring-2 ring-primary' : 'bg-muted/50 hover:bg-muted'
                      }`}>
                      <span className="text-2xl">{c.icon}</span>
                      <span className="truncate w-full text-center text-muted-foreground text-[10px] leading-tight">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Accounts */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
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
                <label className="text-sm font-medium mb-1.5 block">To Account</label>
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
              <label className="text-sm font-medium mb-1.5 block">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            {/* Merchant / Recipient */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {isTransfer ? 'Recipient / Note (optional)' : 'Merchant (optional)'}
              </label>
              <Input placeholder={isTransfer ? 'e.g., Mom, Ahmed' : 'e.g., Starbucks'} value={merchant} onChange={e => setMerchant(e.target.value)} maxLength={100} />
            </div>

            {!isTransfer && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Note (optional)</label>
                <Input placeholder="Add a note..." value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
              </div>
            )}

            {/* Allocate to Goal */}
            {!isEditing && !hasInstallments && !recurringMode && goals.filter(g => g.status === 'active').length > 0 && (
              <div className="bg-muted/50 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target size={14} className="text-primary" />
                    <div>
                      <p className="text-sm font-medium">Allocate to Goal</p>
                      <p className="text-xs text-muted-foreground">Add progress to a savings goal</p>
                    </div>
                  </div>
                  <Switch checked={allocateToGoal} onCheckedChange={v => { setAllocateToGoal(v); if (!v) { setGoalAllocationId(''); setGoalAllocationAmount(''); }}} />
                </div>
                {allocateToGoal && (
                  <div className="space-y-2 pt-1">
                    <Select value={goalAllocationId} onValueChange={setGoalAllocationId}>
                      <SelectTrigger><SelectValue placeholder="Select goal" /></SelectTrigger>
                      <SelectContent>
                        {goals.filter(g => g.status === 'active').map(g => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.icon} {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Amount to allocate"
                      value={goalAllocationAmount}
                      onChange={e => setGoalAllocationAmount(e.target.value)}
                      min="0.01"
                    />
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleSubmit} className="w-full h-12 text-base gradient-primary text-primary-foreground">
              {isEditing ? 'Save Changes' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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