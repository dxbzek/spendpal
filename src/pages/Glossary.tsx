import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, BookOpen } from 'lucide-react';

interface FaqItem {
  term: string;
  definition: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    term: 'Net Worth',
    definition:
      'The difference between your total assets (cash + debit balances) and total liabilities (credit card outstanding balances). A positive net worth means you own more than you owe.',
  },
  {
    term: 'Credit Utilization',
    definition:
      'The percentage of your credit card limit that you have spent. For example, if your limit is 10,000 and you have used 3,000, your utilization is 30%. Keeping it below 30% is generally recommended.',
  },
  {
    term: 'Available Limit',
    definition:
      'The remaining amount you can still spend on a credit card. It equals Credit Limit minus your outstanding balance (what you have spent).',
  },
  {
    term: 'Statement Date',
    definition:
      'The day of each month when your credit card issuer generates your billing statement. All transactions made before this date appear on the current statement.',
  },
  {
    term: 'Due Date',
    definition:
      'The deadline to pay your credit card bill to avoid late fees and interest charges. This is typically 15-25 days after the statement date.',
  },
  {
    term: 'Credit Limit',
    definition:
      'The maximum amount your credit card issuer allows you to borrow. Exceeding this limit may result in declined transactions or over-limit fees.',
  },
  {
    term: 'Recurring Transaction',
    definition:
      'A transaction that repeats every month, like subscriptions, rent, or loan payments. Marking a transaction as recurring helps track ongoing expenses.',
  },
  {
    term: 'Installment Plan',
    definition:
      'A payment arrangement where a large purchase is split into equal monthly payments. The app tracks which installment you are on and how much remains.',
  },
  {
    term: 'Total Installments',
    definition:
      'The total number of monthly payments in an installment plan (e.g., 12 months, 24 months).',
  },
  {
    term: 'Current Installment',
    definition:
      'Which payment number you are currently on in an installment plan. For example, "4 of 12" means you have made 4 out of 12 payments.',
  },
  {
    term: 'Budget',
    definition:
      'A spending limit you set for a specific category (like Groceries or Dining) for a given month. The app tracks how much you have spent versus your budgeted amount.',
  },
  {
    term: 'Goal',
    definition:
      'A savings target you are working toward, such as an emergency fund or vacation. You can track progress and add contributions over time.',
  },
  {
    term: 'Transfer',
    definition:
      'Moving money between your own accounts or to others. Transfers have their own categories like Card Payment, Family, Gift, Loan, Allowance, Savings, etc. They do not count as income or expenses.',
  },
  {
    term: 'Expense',
    definition:
      'Money spent on goods or services. Expenses reduce your account balance and count toward your budget and spending totals.',
  },
  {
    term: 'Income',
    definition:
      'Money received, such as salary, freelance earnings, or refunds. Income increases your account balance. Credit card credits are not counted as income.',
  },
  {
    term: 'Card Credit',
    definition:
      'A refund, reversal, or cashback posted to your credit card. These reduce your outstanding credit card balance but are not counted as regular income.',
  },
  {
    term: 'Saved This Month',
    definition:
      'The difference between your income and expenses for the current month. A positive number means you spent less than you earned.',
  },
  {
    term: 'Monthly Trends',
    definition:
      'A chart showing your income and expense totals over recent months, helping you spot patterns and seasonal changes in your finances.',
  },
  {
    term: 'Spending Breakdown',
    definition:
      'A visual pie chart showing what percentage of your total expenses goes to each category (like Groceries, Transport, Dining, etc.).',
  },
  {
    term: 'Month vs Month',
    definition:
      'A comparison widget showing how your spending this month differs from last month, broken down by account type (Cash, Debit, Credit).',
  },
  {
    term: 'Secondary Currency',
    definition:
      'An optional second currency displayed alongside your primary currency for reference. Useful if you track finances across different countries.',
  },
];

const Glossary = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setOpenIndex(prev => (prev === idx ? null : idx));
  };

  return (
    <div className="animate-fade-in pb-8">
      <div className="gradient-primary px-5 pt-12 pb-8 rounded-b-3xl mb-6">
        <div className="flex items-center gap-3">
          <BookOpen size={24} className="text-primary-foreground" />
          <h1 className="text-xl text-primary-foreground font-heading">Glossary & FAQ</h1>
        </div>
        <p className="text-primary-foreground/70 text-sm mt-2">
          Learn what every term in SpendPal means
        </p>
      </div>

      <div className="px-5 md:px-6 space-y-2">
        {FAQ_ITEMS.map((item, idx) => (
          <div key={item.term} className="bg-card rounded-xl card-shadow overflow-hidden">
            <button
              onClick={() => toggle(idx)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
            >
              <span className="text-sm font-heading">{item.term}</span>
              <motion.div
                animate={{ rotate: openIndex === idx ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={16} className="text-muted-foreground" />
              </motion.div>
            </button>
            <AnimatePresence>
              {openIndex === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {item.definition}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Glossary;
