import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinance } from '@/context/FinanceContext';
import { ACCOUNT_ICONS, type AccountType } from '@/types/finance';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddAccountDialog = ({ open, onOpenChange }: Props) => {
  const { addAccount } = useFinance();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('debit');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    addAccount({
      id: `acc-${Date.now()}`,
      name: name.trim(),
      type,
      balance: parseFloat(balance) || 0,
      currency: 'AED',
      icon: ACCOUNT_ICONS[type],
      ...(type === 'credit' && creditLimit ? { creditLimit: parseFloat(creditLimit) } : {}),
      ...(type === 'credit' && dueDate ? { dueDate: parseInt(dueDate) } : {}),
    });
    setName('');
    setBalance('');
    setCreditLimit('');
    setDueDate('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
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
            Add Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddAccountDialog;
