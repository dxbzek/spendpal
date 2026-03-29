import { useCurrency } from '@/context/CurrencyContext';
import { CreditCard } from 'lucide-react';
import GlossaryLink from '@/components/GlossaryLink';
import { motion } from 'framer-motion';
import type { Account } from '@/types/finance';

interface Props {
  accounts: Account[];
  hidden: boolean;
  mask: (val: string) => string;
}

const CreditUtilizationWidget = ({ accounts, hidden, mask }: Props) => {
  const { fmt } = useCurrency();
  const creditCards = accounts.filter(a => a.type === 'credit' && a.creditLimit);

  if (creditCards.length === 0) return null;

  const totalLimit = creditCards.reduce((s, a) => s + (a.creditLimit || 0), 0);
  const totalUsed = creditCards.reduce((s, a) => s + ((a.creditLimit || 0) - a.balance), 0);
  const overallUtil = totalLimit ? Math.min(Math.round((totalUsed / totalLimit) * 100), 100) : 0;
  const overallColor = overallUtil > 75 ? 'text-expense' : overallUtil > 50 ? 'text-warning' : 'text-primary';
  const overallBarColor = overallUtil > 75 ? 'bg-expense' : overallUtil > 50 ? 'bg-warning' : 'bg-primary';

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Credit Utilization</h2>
        <GlossaryLink term="Credit Utilization" />
      </div>

      {/* Overall */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Overall</span>
          <span className={`text-sm font-heading ${overallColor}`}>{overallUtil}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${overallUtil}%` }}
            transition={{ duration: 0.6 }}
            className={`h-full rounded-full ${overallBarColor}`}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
          <span>Used: {mask(fmt(totalUsed))}</span>
          <span>Limit: {mask(fmt(totalLimit))}</span>
        </div>
      </div>

      {/* Per card */}
      <div className="space-y-3">
        {creditCards.map(card => {
          const limit = card.creditLimit || 0;
          const used = limit - card.balance;
          const util = limit ? Math.min(Math.round((used / limit) * 100), 100) : 0;
          const barColor = util > 75 ? 'bg-expense' : util > 50 ? 'bg-warning' : 'bg-primary';

          return (
            <div key={card.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <span>{card.icon}</span> {card.name}
                </span>
                <span className="text-xs text-muted-foreground">{util}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${util}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className={`h-full rounded-full ${barColor}`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>{mask(fmt(used))}</span>
                <span>{mask(fmt(limit))}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CreditUtilizationWidget;
