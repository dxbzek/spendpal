// The words SpendPal puts on screen, and what each one means in this app.
// Each entry is written from the label and the code behind it; when a label
// or a rule changes, change its entry too. src/test/glossary.test.ts checks
// that every "?" link names a term here.

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Spendable Cash',
    definition:
      'The large figure at the top of Home. It adds up your Cash and Bank account balances, leaves out accounts marked "Savings, not for spending", and takes off pending holds. Credit cards are not in it.',
  },
  {
    term: 'Left until payday',
    definition:
      'Shown on Home in Card payments, when you have a credit card. It is your Spendable Cash minus each card statement due before your next payday and each recurring bill paid from cash or a bank account before then. Set your payday there to see it.',
  },
  {
    term: 'Total Net Worth',
    definition:
      'On Accounts. Your Cash and Bank account balances, savings included, minus what you owe on your credit cards.',
  },
  {
    term: 'Owed',
    definition:
      'A credit card\'s balance is the amount you owe on it, not the money you can still spend. "Available" next to it is your credit limit minus that amount.',
  },
  {
    term: 'Credit Utilization',
    definition:
      'How much of a card\'s credit limit you owe, as a percentage. With a 10,000 limit and 3,000 owed it is 30%. SpendPal shows it in orange above 50% and in red above 75%.',
  },
  {
    term: 'Statement Day',
    definition:
      'The day of the month your card issuer closes the statement. You enter it on the card\'s account.',
  },
  {
    term: 'Due Day',
    definition: 'The day of the month your card statement must be paid by. You enter it on the card\'s account.',
  },
  {
    term: 'Latest statement',
    definition:
      'The total due, minimum due and due date from your card\'s most recent statement, typed in by you. Card payments on Home shows exactly these numbers; SpendPal does not work them out.',
  },
  {
    term: 'APR',
    definition:
      'A card\'s yearly interest rate. The Debt page uses it to work out payoff plans. Leave it blank to use 20%, or enter 0 for an interest-free pay-later plan.',
  },
  {
    term: 'Expense',
    definition:
      'Money you spent. It lowers the account it was paid from (or adds to what you owe on a card) and counts toward your spending and budgets.',
  },
  {
    term: 'Income',
    definition:
      'Money you received, such as salary. It raises the account\'s balance. Money back on a credit card is not counted as income (see Card credit), and neither is a refund.',
  },
  {
    term: 'Refund',
    definition:
      'An income row in the Refund category. It is money back for a purchase, so it lowers your spending total instead of counting as income. Category totals and budgets are not lowered by it, because a refund does not say which category it undoes.',
  },
  {
    term: 'Card credit',
    definition:
      'An income row on a credit card account, such as a refund or cashback. It lowers what you owe on the card and is not counted as income.',
  },
  {
    term: 'Transfer',
    definition:
      'Money moved from one of your accounts to another. It is saved as two rows in the Transfer category, one out and one in, and shows as one row. It changes both balances and is not counted as income or spending.',
  },
  {
    term: 'Internal / not real spending',
    definition:
      'A switch on a transaction for money that moves but is not spending or income, like paying your card bill or paying back a person. The account balance still changes; income and spending totals leave it out.',
  },
  {
    term: 'Pending',
    definition:
      'A charge that is authorized but not posted yet. It does not change the account\'s balance until you mark it settled, but Spendable Cash already takes it off, and it counts toward your budgets.',
  },
  {
    term: 'Recurring',
    definition:
      'A switch on a transaction that comes in or goes out every month. A recurring expense shows in Recurring Expenses on Home.',
  },
  {
    term: 'Installment Plan',
    definition:
      'A purchase paid in a fixed number of monthly payments. Turn on Recurring and Installment Plan when you add it. Plans show on the Installments page with how many payments are left.',
  },
  {
    term: 'Tracking Only',
    definition:
      'A switch on an installment plan paid by credit card or a pay-later service. The plan is tracked on Installments, but the account\'s balance is not reduced and it is not counted as spending.',
  },
  {
    term: 'Remaining Principal',
    definition:
      'Optional, on an installment plan: what is still owed on the purchase according to your latest statement. When it is blank, SpendPal works it out from the original purchase price and the payments made.',
  },
  {
    term: 'Budget',
    definition:
      'A monthly spending limit for one category. Each month has its own budgets; Copy and Rollover on the Budgets page bring last month\'s over. Spending under a closely related built-in name counts toward it when that name has no budget of its own, and the budget card says which names it includes.',
  },
  {
    term: 'Projected month-end',
    definition:
      'On Budgets: where your spending lands by the end of the month if the rest of the month goes like the days so far. Bills and one-off purchases are counted once, not projected.',
  },
  {
    term: 'Savings Rate',
    definition:
      'On Home: income this month minus spending this month, as a percentage of income. It shows when there is income this month and it covers the spending.',
  },
  {
    term: 'Goal',
    definition:
      'An amount you are saving toward, with an optional deadline. You add or withdraw progress by hand on the Goals page, or from a transaction with Allocate to Goal.',
  },
  {
    term: 'Month vs Month',
    definition:
      'On Home: your spending this month so far against the same days of last month, split by account type (Cash, Bank account, Credit card).',
  },
  {
    term: 'Monthly Trends',
    definition: 'A chart on Home of your income and spending in each recent month.',
  },
  {
    term: 'Secondary Currency',
    definition:
      'An optional second currency, set in Settings. Amounts are shown converted into it next to your main currency, at a rate fetched from the internet. It changes nothing that is saved.',
  },
];

export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ: FaqEntry[] = [
  {
    question: 'Who can see my data?',
    answer:
      'Your records are stored with your sign-in, and the database lets a signed-in user read and change only their own rows. When you use an AI feature, the data it needs is sent to the AI model to get an answer.',
  },
  {
    question: 'How do I get a copy of my data?',
    answer: 'Settings, Data Backup & Restore, Export. You get one JSON file with your accounts, transactions, budgets and goals. Restore in the same place reads it back.',
  },
  {
    question: 'How do I delete my data or my account?',
    answer:
      'Settings, Danger Zone. Delete All Data removes your records and keeps your sign-in. Delete my account removes your sign-in and everything stored with it. Neither can be undone.',
  },
  {
    question: 'Why does my credit card show a balance as "Owed"?',
    answer:
      'For a credit card, the balance is what you owe, not money you have. Spending on the card raises it and a payment lowers it. Your available credit is the limit minus that amount.',
  },
  {
    question: 'How do I change my currency?',
    answer:
      'Settings, Profile, Preferred Currency. If you already have amounts saved, you can convert them at an exchange rate you can check and change, or keep the numbers and only change the currency.',
  },
];

/** The entry a "?" link asks for, matched without regard to case. -1 when none. */
export function findTerm(entries: readonly GlossaryEntry[], term: string | null | undefined): number {
  if (!term) return -1;
  const want = term.trim().toLowerCase();
  return entries.findIndex(e => e.term.toLowerCase() === want);
}

/** The glossary address for one term, for a "?" link. */
export const glossaryHref = (term: string) => `/glossary?term=${encodeURIComponent(term)}`;
