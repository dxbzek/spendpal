import { useState } from 'react';
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
  const [name, setName] = useState(editAccount?.name || '');
  const [type, setType] = useState<AccountType>(editAccount?.type || 'debit');
  const [balance, setBalance] = useState(editAccount?.balance?.toString() || '');
  const [creditLimit, setCreditLimit] = useState(editAccount?.creditLimit?.toString() || '');
  const [dueDate, setDueDate] = useState(editAccount?.dueDate?.toString() || '');

  // Reset form when editAccount changes
  const isEdit = !!editAccount;

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
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Account Name</label>
            <Input placeholder="e.g., Emirates NBD" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Type</label>
            <Select value={type} onValueChange={v => setType(v as AccountType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">💵 Cash</SelectItem>
                <SelectItem value="debit">💳 Debit</SelectItem>
                <SelectItem value="credit">🏦 Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Balance (AED)</label>
            <Input type="number" placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} />
          </div>
          {type === 'credit' && (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Credit Limit (AED)</label>
                <Input type="number" placeholder="20000" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Due Date (day of month)</label>
                <Input type="number" placeholder="15" min="1" max="31" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </>
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
