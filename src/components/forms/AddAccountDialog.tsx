import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import { ACCOUNT_ICONS, type AccountType, type Account } from '@/types/finance';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editAccount?: Account | null;
}

const AddAccountDialog = ({ open, onOpenChange, editAccount }: Props) => {
  const { addAccount, updateAccount } = useFinance();
  const { currency } = useCurrency();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('debit');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [statementDate, setStatementDate] = useState('');

  const isEdit = !!editAccount;
  const [submitting, setSubmitting] = useState(false);

  // Sync form when editAccount changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(editAccount?.name || '');
      setType(editAccount?.type || 'debit');
      setBalance(editAccount?.balance?.toString() || '');
      setCreditLimit(editAccount?.creditLimit?.toString() || '');
      setDueDate(editAccount?.dueDate?.toString() || '');
      setStatementDate(editAccount?.statementDate?.toString() || '');
    }
  }, [open, editAccount]);

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        type,
        balance: parseFloat(balance) || 0,
        currency,
        icon: ACCOUNT_ICONS[type],
        creditLimit: type === 'credit' && creditLimit ? parseFloat(creditLimit) : undefined,
        dueDate: type === 'credit' && dueDate ? parseInt(dueDate) : undefined,
        statementDate: type === 'credit' && statementDate ? parseInt(statementDate) : undefined,
      };
      if (isEdit) {
        await updateAccount({ ...data, id: editAccount.id });
      } else {
        await addAccount(data);
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs mx-auto p-4">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base">{isEdit ? 'Edit Account' : 'Add Account'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input placeholder="e.g., Emirates NBD" value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select value={type} onValueChange={v => setType(v as AccountType)}>
                <SelectTrigger className="h-9 text-sm w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 Cash</SelectItem>
                  <SelectItem value="debit">💳 Debit</SelectItem>
                  <SelectItem value="credit">🏦 Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {type === 'credit' ? 'Available Limit' : 'Balance'} ({currency})
            </label>
            <Input type="number" placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} className="h-9 text-sm" />
          </div>
          {type === 'credit' && (
            <div className="space-y-2.5 rounded-lg bg-muted/50 p-2.5">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Credit Limit ({currency})</label>
                <Input type="number" placeholder="20,000" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Statement Day</label>
                  <Input type="number" placeholder="1" min="1" max="31" value={statementDate} onChange={e => setStatementDate(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Due Day</label>
                  <Input type="number" placeholder="15" min="1" max="31" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting} className="w-full h-9 text-sm gradient-primary text-primary-foreground">
            {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Add Account'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddAccountDialog;
