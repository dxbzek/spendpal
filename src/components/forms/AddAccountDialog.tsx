import { useState, useEffect } from 'react';
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
    if (!name.trim()) return;
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Account' : 'Add Account'}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEdit ? 'Update your account details below.' : 'Fill in the details for your new account.'}
          </p>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Account Name</label>
            <Input placeholder="e.g., Emirates NBD" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Type</label>
            <Select value={type} onValueChange={v => setType(v as AccountType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">💵 Cash</SelectItem>
                <SelectItem value="debit">💳 Debit</SelectItem>
                <SelectItem value="credit">🏦 Credit Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {type === 'credit' ? 'Outstanding Balance' : 'Balance'} ({currency})
            </label>
            <Input type="number" placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} />
          </div>
          {type === 'credit' && (
            <div className="space-y-4 rounded-xl bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Credit Card Details</p>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Credit Limit ({currency})</label>
                <Input type="number" placeholder="20,000" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Statement Day</label>
                  <Input type="number" placeholder="1" min="1" max="31" value={statementDate} onChange={e => setStatementDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Due Day</label>
                  <Input type="number" placeholder="15" min="1" max="31" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Day of month when your statement generates and payment is due.</p>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={!name.trim()} className="w-full gradient-primary text-primary-foreground">
            {isEdit ? 'Save Changes' : 'Add Account'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddAccountDialog;
