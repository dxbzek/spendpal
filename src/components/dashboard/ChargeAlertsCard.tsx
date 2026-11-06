import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Transaction } from '@/types/finance';
import { recentFees, priceRises } from '@/lib/finance/chargeAlerts';
import { useCurrency } from '@/context/CurrencyContext';

interface Props {
  transactions: Transaction[];
  mask: (s: string) => string;
}

/** Fees paid in the last 30 days and recurring bills that went up. Hidden when there's neither. */
const ChargeAlertsCard = ({ transactions, mask }: Props) => {
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const fees = useMemo(() => recentFees(transactions, new Date()), [transactions]);
  const rises = useMemo(() => priceRises(transactions), [transactions]);

  if (fees.fees.length === 0 && rises.length === 0) return null;

  return (
    <div className="bg-card rounded-xl p-4 card-shadow mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading text-sm">Check these charges</h2>
        <button onClick={() => navigate('/transactions')} className="text-xs text-primary font-medium flex items-center gap-0.5">
          Transactions <ChevronRight size={14} />
        </button>
      </div>

      {fees.fees.length > 0 && (
        <div className="py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Fees, last 30 days</p>
            <p className="text-sm font-heading tabular-nums text-expense">{mask(fmt(fees.total))}</p>
          </div>
          <ul className="mt-1 space-y-0.5">
            {fees.fees.slice(0, 5).map(t => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{t.merchant || t.category} · {format(parseISO(t.date.slice(0, 10)), 'd MMM')}</span>
                <span className="tabular-nums shrink-0">{mask(fmt(t.amount))}</span>
              </li>
            ))}
            {fees.fees.length > 5 && (
              <li className="text-[11px] text-muted-foreground">+{fees.fees.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {rises.length > 0 && (
        <div className={`py-2 ${fees.fees.length > 0 ? 'border-t border-border' : ''}`}>
          <p className="text-sm font-medium">Bills that went up</p>
          <ul className="mt-1 space-y-0.5">
            {rises.slice(0, 5).map(r => (
              <li key={r.key} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{r.name}</span>
                <span className="tabular-nums shrink-0">
                  {mask(fmt(r.before))} → <span className="text-expense">{mask(fmt(r.now))}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default memo(ChargeAlertsCard);
