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
    <div className="bg-card rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={16} className="text-primary" />
        <h2 className="font-heading text-sm">Net Worth</h2>
        <GlossaryLink term="Net Worth" />
      </div>
      <p className={`text-2xl font-heading ${netWorth >= 0 ? 'text-income' : 'text-expense'}`}>
        {mask(fmt(netWorth))}
      </p>
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
        <span>Assets: {mask(fmt(assets))}</span>
        <span>Liabilities: {mask(fmt(liabilities))}</span>
      </div>
    </div>
  );
};

export default NetWorthWidget;
