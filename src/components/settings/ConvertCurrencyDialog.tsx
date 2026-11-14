import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { convertSettingsAmounts, userSettings } from '@/lib/userSettings';

interface Props {
  open: boolean;
  from: string;
  to: string;
  /** Offers "Amounts are already in <to>" when the user is changing currency, not fixing old data. */
  allowRelabel?: boolean;
  /** Called once every stored amount carries the new currency. Always true now; the flag is kept for the caller. */
  onDone: (converted: boolean) => void;
  onCancel: () => void;
}

const ConvertCurrencyDialog = ({ open, from, to, allowRelabel, onDone, onCancel }: Props) => {
  const [rate, setRate] = useState('');
  const [fetching, setFetching] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRate('');
    setFetching(true);
    const controller = new AbortController();
    fetch(`https://open.er-api.com/v6/latest/${from}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { rates?: Record<string, number> } | null) => {
        const r = data?.rates?.[to];
        if (r) setRate(String(r));
      })
      .catch(() => {})
      .finally(() => setFetching(false));
    return () => controller.abort();
  }, [open, from, to]);

  const parsed = Number(rate);
  const valid = Number.isFinite(parsed) && parsed > 0;

  // Both choices go through convert_currency, which rewrites the currency
  // code on every account and transaction in one database transaction. There
  // is no way left to change only the profile's symbol: that kept old rows in
  // the old currency, and every total then added two currencies together
  // under one symbol.
  const run = async (byRate: number, doneMessage: string) => {
    setConverting(true);
    const { error } = await supabase.rpc('convert_currency', { p_from: from, p_to: to, p_rate: byRate });
    setConverting(false);
    if (error) {
      toast.error('Conversion failed: ' + error.message);
      return;
    }
    // The income, net worth goal and history, and budget templates are
    // amounts too. Left alone they would read as the new currency unconverted.
    userSettings.update(convertSettingsAmounts(userSettings.getSnapshot().data, byRate));
    toast.success(doneMessage);
    onDone(true);
  };

  const convert = () => {
    if (valid) run(parsed, `Converted your amounts to ${to}`);
  };

  // The wrong currency was set and the numbers were in the new one all along:
  // a rate of 1 keeps every number and moves every row to the new code.
  const relabel = () => run(1, `Your amounts are now in ${to}`);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !converting) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert {from} to {to}?</DialogTitle>
          <DialogDescription>
            Balances, card limits, transactions, budgets and goals are stored in {from}. Converting
            multiplies them by the rate below. Accounts in other currencies are left alone.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className="text-sm font-medium mb-1.5 block">1 {from} =</label>
          <div className="relative">
            <Input
              inputMode="decimal"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder={fetching ? 'Fetching rate…' : 'Enter rate'}
              className="h-12 pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{to}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Today's market rate is filled in. Change it to match what your bank used.
          </p>
          {allowRelabel && (
            <p className="text-xs text-muted-foreground mt-1.5">
              If the numbers you entered were in {to} all along, choose "Amounts are already in {to}". Every number stays the same.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {allowRelabel && (
            <Button variant="outline" disabled={converting} onClick={relabel}>
              Amounts are already in {to}
            </Button>
          )}
          <Button disabled={!valid || converting} onClick={convert}>
            {converting ? <Loader2 className="animate-spin" size={18} /> : 'Convert amounts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertCurrencyDialog;
