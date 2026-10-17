import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';
import { cardStatuses, leftUntilPayday, nextPayday, inferPayday } from '@/lib/finance/cardPayments';
import { ordinal } from '@/lib/ordinal';
import { useCurrency } from '@/context/CurrencyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAYDAY_KEY = 'spendpal_payday';

const readPayday = (): number | null => {
  try {
    const v = Number(localStorage.getItem(PAYDAY_KEY));
    return v >= 1 && v <= 31 ? v : null;
  } catch { return null; }
};

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  mask: (s: string) => string;
  /** Opens the account dialog so the statement figures can be entered. */
  onEditAccount: (account: Account) => void;
}

/**
 * What each card's statement asks for, exactly as entered from the statement,
 * plus cash left until payday after those payments. Never shows a derived or
 * guessed amount: a card without statement figures asks for them instead.
 */
const CardPaymentsCard = ({ accounts, transactions, mask, onEditAccount }: Props) => {
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  const [paydayOverride, setPaydayOverride] = useState<number | null>(readPayday);
  const inferred = useMemo(() => inferPayday(transactions), [transactions]);
  const paydayDay = paydayOverride ?? inferred;

  const cards = useMemo(() => cardStatuses(accounts, now), [accounts, now]);
  const payday = paydayDay ? nextPayday(paydayDay, now) : null;
  const runway = useMemo(
    () => (payday ? leftUntilPayday(accounts, payday, now) : null),
    // payday is derived from paydayDay; depend on the primitive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, paydayDay, now],
  );

  if (cards.length === 0) return null;

  const setPayday = (day: number) => {
    setPaydayOverride(day);
    try { localStorage.setItem(PAYDAY_KEY, String(day)); } catch { /* per-device convenience */ }
  };
  const daysTo = (d: Date) => Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading text-sm">Card payments</h2>
        <button onClick={() => navigate('/debt')} className="text-xs text-primary font-medium flex items-center gap-0.5">Debt <ChevronRight size={14} /></button>
      </div>

      <div className="divide-y divide-border">
        {cards.map(c => (
          <div key={c.account.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{c.account.name}</p>
              {c.kind === 'due' && (
                <p className="text-[11px] text-muted-foreground">
                  {c.min != null && <>Min {mask(fmt(c.min))} · </>}
                  {daysTo(c.dueOn) === 0 ? 'due today' : `${daysTo(c.dueOn)}d left`}
                </p>
              )}
              {c.kind === 'passed' && (
                <p className="text-[11px] text-warning">Due date {format(c.dueOn, 'd MMM')} has passed</p>
              )}
            </div>
            {c.kind === 'due' ? (
              <p className="text-sm font-heading tabular-nums text-right shrink-0">
                {mask(fmt(c.total))}
                <span className="block text-[11px] font-normal text-muted-foreground">by {format(c.dueOn, 'd MMM yyyy')}</span>
              </p>
            ) : (
              <button onClick={() => onEditAccount(c.account)} className="text-xs font-medium text-primary shrink-0">
                {c.kind === 'missing' ? 'Add statement' : 'Update statement'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border mt-1 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Left until payday{payday ? ` (${format(payday, 'd MMM')})` : ''}
          </p>
          <Select value={paydayDay ? String(paydayDay) : ''} onValueChange={v => setPayday(Number(v))}>
            <SelectTrigger className="h-7 w-auto gap-1 px-2 text-[11px] border-0 bg-muted rounded-lg" aria-label="Payday">
              <SelectValue placeholder="Set payday" />
            </SelectTrigger>
            <SelectContent className="max-h-[240px]">
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <SelectItem key={d} value={String(d)}>Payday: {ordinal(d)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {runway ? (
          <>
            <p className={`text-financial-medium tabular-nums ${runway.left < 0 ? 'text-expense' : ''}`}>{mask(fmt(runway.left))}</p>
            <p className="text-[11px] text-muted-foreground">
              {mask(fmt(runway.cash))} in cash/debit − {mask(fmt(runway.due))} due before payday
              {runway.perDay != null && <> · {mask(fmt(runway.perDay))}/day for {runway.days} days</>}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">Set your payday to see this.</p>
        )}
      </div>
    </div>
  );
};

export default CardPaymentsCard;
