import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const INCOME_KEY = 'spendpal_monthly_income';

interface Props {
  open: boolean;
  from: string;
  to: string;
  /** Offers "Only change the symbol" when the user is changing currency, not fixing old data. */
  allowRelabel?: boolean;
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

  const convert = async () => {
    if (!valid) return;
    setConverting(true);
    const { error } = await supabase.rpc('convert_currency', { p_from: from, p_to: to, p_rate: parsed });
    setConverting(false);
    if (error) {
      toast.error('Conversion failed: ' + error.message);
      return;
    }
    const income = Number(localStorage.getItem(INCOME_KEY));
    if (income > 0) localStorage.setItem(INCOME_KEY, String(Math.round(income * parsed * 100) / 100));
    toast.success(`Converted your amounts to ${to}`);
    onDone(true);
  };

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
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {allowRelabel && (
            <Button variant="outline" disabled={converting} onClick={() => onDone(false)}>
              Only change the symbol
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
