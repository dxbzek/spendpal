import { useCurrency } from '@/context/CurrencyContext';
import { Wallet } from 'lucide-react';
import GlossaryLink from '@/components/GlossaryLink';
import type { Account } from '@/types/finance';

interface Props {
  accounts: Account[];
  hidden: boolean;
  mask: (val: string) => string;
}

const NetWorthWidget = ({ accounts, hidden, mask }: Props) => {
  const { fmt } = useCurrency();

  const assets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
  const liabilities = accounts.filter(a => a.type === 'credit').reduce((s, a) => {
    const spent = a.creditLimit ? a.creditLimit - a.balance : 0;
    return s + spent;
  }, 0);
  const netWorth = assets - liabilities;

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow h-full transition-shadow hover:card-shadow-hover">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <Wallet size={13} className="text-primary" />
        </div>
        <h2 className="font-heading text-sm">Net Worth</h2>
        <GlossaryLink term="Net Worth" />
      </div>
      <p className={`text-financial-large ${netWorth >= 0 ? 'text-income' : 'text-expense'} mt-1`}>
        {mask(fmt(netWorth))}
      </p>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Assets</span>
          <span className="font-medium text-income">{mask(fmt(assets))}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Liabilities</span>
          <span className="font-medium text-expense">{mask(fmt(liabilities))}</span>
        </div>
      </div>
    </div>
  );
};

export default NetWorthWidget;
