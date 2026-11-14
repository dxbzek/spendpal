// The home page a signed-out visitor sees at "/". Signed-in users get the app.
// Every line describes something the code does; nothing here is a claim about
// users, ratings, prices or certifications.
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine, BarChart3, CalendarClock, CreditCard, Database, FileUp, KeyRound,
  PiggyBank, Smartphone, Sparkles, Target, Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageHead } from '@/hooks/usePageHead';
import { PublicFooter, PublicPageScroll, PublicTopBar } from '@/components/public/PublicShell';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CreditCard,
    title: 'Accounts and cards',
    body: 'Cash, debit and credit accounts. For a card, set the limit, statement day and due day, and type in what the latest statement asks you to pay.',
  },
  {
    icon: PiggyBank,
    title: 'Budgets with month-end pace',
    body: 'A monthly budget per category. After a few days of spending, each budget shows where it is heading by the end of the month.',
  },
  {
    icon: CalendarClock,
    title: 'Instalment plans',
    body: 'Card instalments and buy-now-pay-later plans, with how many payments are made, what is left and when the next one is due.',
  },
  {
    icon: Target,
    title: 'Savings goals',
    body: 'A target and an optional deadline. With a deadline, SpendPal shows how much to put aside each month to reach it.',
  },
  {
    icon: BarChart3,
    title: 'Reports',
    body: 'Income, spending and savings by month, spending by category, and trends over time. Print a month or export it as CSV.',
  },
  {
    icon: FileUp,
    title: 'Statement and screenshot import',
    body: 'Upload a statement (PDF, Excel, CSV or text) or a screenshot. AI picks out the transactions, and you check them before they are saved.',
  },
  {
    icon: Sparkles,
    title: 'AI budget advisor',
    body: "Looks at this month's spending, cards, budgets and goals, and suggests a budgeting method and an amount per category. Advice that does not refer to your own figures is not shown.",
  },
];

const DATA_POINTS: { icon: LucideIcon; text: React.ReactNode }[] = [
  { icon: Database, text: 'Your records are kept in a Supabase database. Row level security means each account can read and change only its own rows.' },
  { icon: KeyRound, text: 'Nothing is shown without signing in with your email and password.' },
  { icon: ArrowDownToLine, text: <>Settings has <strong className="font-medium text-foreground">Export</strong>, which downloads all your records as a file.</> },
  { icon: Trash2, text: <>Settings also has <strong className="font-medium text-foreground">Delete my account</strong>, which removes your sign-in and everything stored with it.</> },
];

/** A Home-style card built from the app's own styles. The numbers are made up and labelled so. */
const SamplePreview = () => (
  <figure className="bg-card text-card-foreground rounded-xl card-shadow p-4 sm:p-5 w-full max-w-sm mx-auto md:mx-0" aria-label="Example of the Home screen with sample data">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Spendable cash</p>
        <p className="text-financial-large">AED 4,250.00</p>
      </div>
      <span className="shrink-0 rounded-full bg-warning-soft border border-warning-line px-2.5 py-1 text-[11px] font-semibold">
        Sample data
      </span>
    </div>

    <div className="mt-4 rounded-xl bg-muted p-3 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-foreground">
        <CreditCard size={18} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">Sample card</p>
        <p className="text-xs text-muted-foreground">Statement due 5 Dec</p>
      </div>
      <p className="text-sm font-semibold tabular-nums">AED 1,820.00</p>
    </div>

    <div className="mt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Groceries</span>
        <span className="tabular-nums text-muted-foreground">AED 1,240 of 1,500</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-warning" style={{ width: '83%' }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Projected month-end <span className="font-semibold text-expense">AED 1,710 (114%)</span>
      </p>
    </div>
    <figcaption className="sr-only">Sample data, not a real account.</figcaption>
  </figure>
);

const Landing = () => {
  usePageHead('/');
  return (
    <PublicPageScroll>
      <header className="bg-primary px-5 md:px-8 pt-10 pb-12 md:pb-16 rounded-b-2xl md:rounded-b-none">
        <div className="max-w-5xl mx-auto">
          <PublicTopBar />
          <div className="mt-10 md:mt-14 grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-center">
            <div>
              <h1 className="text-[1.75rem] leading-tight sm:text-4xl font-heading text-primary-foreground tracking-tight">
                Track your accounts, cards, budgets and goals in one place.
              </h1>
              <p className="mt-4 text-[15px] leading-relaxed text-primary-subtle max-w-xl">
                SpendPal is a personal finance tracker. You type in or import your own records. It does not connect to your bank.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Button asChild className="h-12 px-6 text-[15px] font-semibold rounded-xl bg-card text-primary hover:bg-card hover:brightness-95">
                  <Link to="/auth" state={{ signup: true }}>Create account</Link>
                </Button>
                <Button asChild className="h-12 px-6 text-[15px] font-semibold rounded-xl bg-primary-raised text-primary-foreground hover:brightness-110">
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
            </div>
            <SamplePreview />
          </div>
        </div>
      </header>

      <main className="px-5 md:px-8">
        <section aria-labelledby="features" className="max-w-5xl mx-auto pt-12 md:pt-16">
          <h2 id="features" className="text-xl md:text-2xl font-heading">What it does</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-card rounded-xl p-5 card-shadow">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <Icon size={18} />
                </span>
                <h3 className="mt-3 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="data" className="max-w-5xl mx-auto pt-12 md:pt-16">
          <h2 id="data" className="text-xl md:text-2xl font-heading">How your data is kept</h2>
          <div className="mt-6 bg-card rounded-xl p-5 card-shadow">
            <ul className="space-y-4">
              {DATA_POINTS.map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex gap-3 text-sm text-muted-foreground leading-relaxed">
                  <Icon size={18} className="text-primary shrink-0 mt-0.5" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted-foreground">
              There are no ads, and your data is not sold. The AI features send data to an AI provider only when you use them.{' '}
              <Link to="/privacy" className="text-primary font-medium">Read the privacy policy</Link>
            </p>
          </div>
        </section>

        <section aria-labelledby="install" className="max-w-5xl mx-auto pt-12 md:pt-16 pb-14">
          <div className="bg-card rounded-xl p-5 card-shadow flex gap-4 items-start">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Smartphone size={18} />
            </span>
            <div>
              <h2 id="install" className="text-base font-semibold">Install it on your phone</h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                SpendPal runs in the browser and can be added to your home screen. On iPhone use Share, then Add to Home Screen. On Android
                use the browser menu, then Install app. It then opens full screen like any other app.
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </PublicPageScroll>
  );
};

export default Landing;
