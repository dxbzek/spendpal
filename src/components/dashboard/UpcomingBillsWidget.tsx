import { useCurrency } from '@/context/CurrencyContext';
import { CalendarClock } from 'lucide-react';
import { differenceInDays, addMonths, parseISO, format } from 'date-fns';
import type { Transaction, Account } from '@/types/finance';
import { memo, useMemo } from 'react';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
}

const UpcomingBillsWidget = ({ accounts, transactions }: Props) => {
  const { fmt } = useCurrency();
  const now = new Date();

  const upcomingBills = useMemo(() => {
    const bills: Array<{ name: string; icon: string; amount: number; dueDate: Date; daysLeft: number }> = [];

    // Credit card due dates
    accounts.filter(a => a.type === 'credit' && a.dueDate).forEach(cc => {
      // Compare day-of-month numbers: if the due day has already passed this month, use next month.
      // Using day comparison (not Date object comparison) avoids the midnight-vs-now false positive
      // where a bill due today gets pushed to next month because midnight < current time.
      const dueDate = new Date(now.getFullYear(), now.getMonth(), cc.dueDate!);
      if (cc.dueDate! < now.getDate()) dueDate.setMonth(dueDate.getMonth() + 1);
      const spent = cc.creditLimit ? cc.creditLimit - cc.balance : 0;
      if (spent > 0) {
        bills.push({
          name: cc.name,
          icon: cc.icon,
          amount: spent,
          dueDate,
          daysLeft: differenceInDays(dueDate, now),
        });
      }
    });

    // Recurring transactions
    transactions.filter(t => t.isRecurring && t.type === 'expense').forEach(t => {
      // Advance month-by-month from the original date until the next occurrence
      // is in the future. Stepping from the original date (not the last computed
      // date) preserves the day-of-month correctly across month-length boundaries
      // (e.g. Jan 31 → Feb 28 → Mar 31, not Mar 28).
      const origDate = parseISO(t.date);
      let offset = 1;
      let nextDate = addMonths(origDate, offset);
      while (differenceInDays(nextDate, now) < 0 && offset < 13) {
        offset++;
        nextDate = addMonths(origDate, offset);
      }
      const daysLeft = differenceInDays(nextDate, now);
      if (daysLeft >= 0 && daysLeft <= 30) {
        bills.push({
          name: t.merchant,
          icon: t.categoryIcon,
          amount: t.amount,
          dueDate: nextDate,
          daysLeft,
        });
      }
    });

    return bills.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  }, [accounts, transactions]);

  if (upcomingBills.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} className="text-primary shrink-0" />
        <h2 className="font-heading text-sm">Upcoming Bills</h2>
      </div>
      <div className="space-y-2">
        {upcomingBills.map((bill) => {
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
              <div className="flex items-center gap-2.5">
                <span className="text-lg w-7 text-center">{bill.icon}</span>
                <div>
                  <p className="text-sm font-medium leading-tight">{bill.name}</p>
                  <p className="text-[11px] text-muted-foreground">{format(bill.dueDate, 'MMM d')}</p>
                </div>
              </div>
              <div className="text-right">
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
