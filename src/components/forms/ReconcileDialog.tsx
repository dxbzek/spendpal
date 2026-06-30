import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AmountInput } from '@/components/ui/AmountInput';
import { Button } from '@/components/ui/button';
import { useFinance } from '@/context/FinanceContext';
import { useCurrency } from '@/context/CurrencyContext';
import type { Account } from '@/types/finance';
import { toast } from 'sonner';
import { Scale } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
}

/**
 * Lets the user enter what their bank/card actually shows right now and
 * compares it against SpendPal's computed balance. The trigger that
 * maintains `balance` replays deltas on top of whatever base it had — if
 * that base was ever wrong (a missed transaction, a manual DB edit, an
 * import gap), the drift compounds silently with no way to notice it short
 * of comparing numbers by hand. This makes that comparison a button.
 */
const ReconcileDialog = ({ open, onOpenChange, account }: Props) => {
  const { updateAccount } = useFinance();
  const { fmt, currency } = useCurrency();
  const [actual, setActual] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setActual('');
  }, [open, account?.id]);

  if (!account) return null;

  const isCredit = account.type === 'credit';
  const label = isCredit ? 'Amount Owed' : 'Balance';
  const parsedActual = actual.trim() === '' ? null : parseFloat(actual);
  const drift = parsedActual !== null && !isNaN(parsedActual) ? parsedActual - account.balance : null;

  const handleApply = async () => {
    if (parsedActual === null || isNaN(parsedActual)) return;
    // Same constraint as AddAccountDialog: balance/owed can't be negative,
    // for credit accounts or otherwise.
    if (parsedActual < 0) {
      toast.error(isCredit ? 'Amount owed cannot be negative' : 'Balance cannot be negative');
      return;
    }
    setSubmitting(true);
    try {
      await updateAccount({ ...account, balance: parsedActual });
      toast.success(`${account.name} balance corrected`);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base flex items-center gap-2">
            <Scale size={16} /> Reconcile {account.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 p-2.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">SpendPal's {label.toLowerCase()}</span>
            <span className="font-medium">{fmt(account.balance)}</span>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground/80 mb-1 block">
              Actual {label} from your bank/card ({currency})
            </label>
            <AmountInput value={actual} onChange={setActual} className="h-11" />
          </div>
          {drift !== null && (
            drift === 0 ? (
              <p className="text-xs text-income font-medium">No drift — these match.</p>
            ) : (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5">
                <p className="text-xs text-destructive font-semibold">
                  {drift > 0 ? 'SpendPal is under by ' : 'SpendPal is over by '}{fmt(Math.abs(drift))}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Likely cause: a transaction logged outside SpendPal, or one missing/duplicated here. Applying below corrects the stored balance directly — it won't add a transaction to your history.
                </p>
              </div>
            )
          )}
          <Button
            onClick={handleApply}
            disabled={parsedActual === null || isNaN(parsedActual) || parsedActual < 0 || drift === 0 || submitting}
            className="w-full h-11 text-base gradient-primary text-primary-foreground"
          >
            {drift !== null && drift !== 0 ? `Fix it — correct to ${fmt(parsedActual!)}` : 'Apply correction'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReconcileDialog;
