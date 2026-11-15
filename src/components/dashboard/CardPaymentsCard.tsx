import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import type { Account, Transaction } from '@/types/finance';
import { cardStatuses, leftUntilPayday, nextPayday, inferPayday } from '@/lib/finance/cardPayments';
import { ordinal } from '@/lib/ordinal';
import { useCurrency } from '@/context/CurrencyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserSetting } from '@/hooks/useUserSettings';
import { userSettings } from '@/lib/userSettings';

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
  const paydayOverride = useUserSetting('payday_day') ?? null;
  const inferred = useMemo(() => inferPayday(transactions), [transactions]);
  const paydayDay = paydayOverride ?? inferred;

  const cards = useMemo(() => cardStatuses(accounts, now), [accounts, now]);
  const payday = paydayDay ? nextPayday(paydayDay, now) : null;
  const runway = useMemo(
    () => (payday ? leftUntilPayday(accounts, payday, now, transactions) : null),
    // payday is derived from paydayDay; depend on the primitive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, transactions, paydayDay, now],
  );

  if (cards.length === 0) return null;

  const setPayday = (day: number) => userSettings.set('payday_day', day);
  const daysTo = (d: Date) => Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);

  return (
    <div className="bg-card rounded-xl p-4 card-shadow mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading text-sm">Card payments</h2>
        <button onClick={() => navigate('/debt')} className="tap-area text-xs text-primary font-medium flex items-center gap-0.5">Debt <ChevronRight size={14} /></button>
      </div>

      <div className="divide-y divide-border">
        {cards.map(c => (
          <div key={c.account.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium line-clamp-2 break-words">{c.account.name}</p>
              {c.kind === 'due' && (
                <p className="text-xs text-muted-foreground">
                  {daysTo(c.dueOn) === 0 ? 'Due today' : `Due ${format(c.dueOn, 'd MMM')} · ${daysTo(c.dueOn)} days`}
                  {c.min != null && c.min > 0 && <> · min {mask(fmt(c.min))}</>}
                </p>
              )}
              {c.kind === 'passed' && (
                <p className="text-xs text-warning">
                  {c.account.dueDate ? `Next due ${format(nextPayday(c.account.dueDate, now), 'd MMM')} · ` : ''}needs new statement
                </p>
              )}
            </div>
            {c.kind === 'due' ? (
              <p className="text-sm font-heading tabular-nums text-right shrink-0">
                {mask(fmt(c.total))}
              </p>
            ) : (
              <button onClick={() => onEditAccount(c.account)} className="tap-area text-xs font-medium text-primary shrink-0">
                {c.kind === 'missing' ? 'Add' : 'Update'}
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
            <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs border-0 bg-muted rounded-lg" aria-label="Payday">
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
            {runway.perDay != null && (
              <p className="text-xs text-muted-foreground">{mask(fmt(runway.perDay))} a day for {runway.days} days</p>
            )}
            {runway.holds > 0 && (
              <p className="text-xs text-muted-foreground">Spendable is after {mask(fmt(runway.holds))} in pending holds.</p>
            )}
            {runway.bills.length > 0 && (
              <ul className="mt-2 space-y-1">
                {runway.bills.map(b => (
                  <li key={b.key} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{b.name} · {format(b.dueOn, 'd MMM')}</span>
                    <span className="tabular-nums shrink-0">{mask(fmt(b.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">Set your payday to see this.</p>
        )}
      </div>
    </div>
  );
};

export default CardPaymentsCard;
