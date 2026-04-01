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
      const dueDate = new Date(now.getFullYear(), now.getMonth(), cc.dueDate!);
      if (dueDate < now) dueDate.setMonth(dueDate.getMonth() + 1);
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
      const nextDate = addMonths(parseISO(t.date), 1);
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
