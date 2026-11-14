import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/context/CurrencyContext';
import { WORLD_CURRENCIES } from '@/utils/currencies';
import { browserLocales, saveProfileCurrency, suggestedCurrency } from '@/lib/onboarding';
import { userSettings } from '@/lib/userSettings';
import { logger } from '@/lib/logger';

interface Props {
  /** Called after the currency is saved on the profile. */
  onSaved: () => void;
}

/**
 * First step for a new user. Every profile started in AED; the first account
 * was then saved and shown in AED wherever the user lived.
 */
const CurrencyStep = ({ onSaved }: Props) => {
  const { user } = useAuth();
  const { setCurrency } = useCurrency();
  const [code, setCode] = useState(() => suggestedCurrency(browserLocales()));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const q = search.trim().toLowerCase();
  const options = q
    ? WORLD_CURRENCIES.filter(c => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
    : WORLD_CURRENCIES;

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const ok = await saveProfileCurrency(supabase, user.id, code);
      if (!ok) {
        toast.error('Could not save your currency. Check your connection and try again.');
        return;
      }
      setCurrency(code);
      userSettings.set('currency_confirmed', true);
      onSaved();
    } catch (err) {
      logger.error('Saving the first-use currency failed', err);
      toast.error('Could not save your currency. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-xl card-shadow p-4 space-y-3">
      <div>
        <label htmlFor="onboarding-currency" className="text-sm font-medium block">Your currency</label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your accounts and amounts are saved in this currency. You can change it later in Settings.
        </p>
      </div>
      <Select value={code} onValueChange={setCode}>
        <SelectTrigger id="onboarding-currency" className="h-12 text-base">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[280px]">
          <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search currencies…"
                aria-label="Search currencies"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          {options.map(c => (
            <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
          ))}
          {options.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">No currencies found</p>}
        </SelectContent>
      </Select>
      <Button onClick={save} disabled={saving} className="w-full h-12 text-base">
        {saving ? <Loader2 size={18} className="animate-spin" /> : 'Continue'}
      </Button>
    </div>
  );
};

export default CurrencyStep;
