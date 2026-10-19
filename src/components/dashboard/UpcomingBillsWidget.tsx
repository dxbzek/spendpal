import { useCurrency } from '@/context/CurrencyContext';
import { CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import type { Transaction, Account } from '@/types/finance';
import { memo, useMemo } from 'react';
import { upcomingBills } from '@/lib/finance/upcomingBills';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
}

const UpcomingBillsWidget = ({ accounts, transactions }: Props) => {
  const { fmt } = useCurrency();

  const bills = useMemo(() => upcomingBills(accounts, transactions, new Date()), [accounts, transactions]);

  if (bills.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} className="text-primary shrink-0" />
        <h2 className="font-heading text-sm">Upcoming Bills</h2>
      </div>
      <div className="space-y-2">
        {bills.map((bill) => {
          const urgent = bill.daysLeft <= 3;
          const soon = bill.daysLeft <= 7;
          return (
            <div
              key={`${bill.name}-${bill.dueDate.getTime()}`}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                urgent
                  ? 'bg-expense/8 border border-expense/20'
                  : soon
                    ? 'bg-warning/8 border border-warning/15'
                    : 'bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-lg w-7 text-center shrink-0">{bill.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{bill.name}</p>
                  <p className="text-[11px] text-muted-foreground">{format(bill.dueDate, 'MMM d')}</p>
                </div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <p className="text-sm font-heading">{fmt(bill.amount)}</p>
                <p className={`text-[11px] font-semibold ${
                  urgent ? 'text-expense' : soon ? 'text-warning' : 'text-muted-foreground'
                }`}>
                  {bill.daysLeft === 0 ? 'Today!' : bill.daysLeft === 1 ? 'Tomorrow' : `${bill.daysLeft}d`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(UpcomingBillsWidget);
