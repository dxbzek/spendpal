// The home page a signed-out visitor sees at "/". Signed-in users get the app.
// Every line describes something the code does; nothing here is a claim about
// users, ratings, prices or certifications.
// 2026-11-27: shorter copy for phones, motion on load and on scroll. Motion
// follows the visitor's reduce-motion setting (MotionConfig reducedMotion="user").
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MotionConfig, animate, motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine, BarChart3, CalendarClock, CreditCard, Database, FileUp, KeyRound,
  PiggyBank, Smartphone, Sparkles, Target, Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandMark from '@/components/BrandMark';
import { usePageHead } from '@/hooks/usePageHead';
import { PublicFooter, PublicPageScroll, PublicTopBar } from '@/components/public/PublicShell';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: CreditCard, title: 'Accounts and cards', body: 'Cash, bank accounts and credit cards, with each card’s limit, statement day and due day.' },
  { icon: PiggyBank, title: 'Budgets with month-end pace', body: 'A budget per category that shows where your spending is heading by the end of the month.' },
  { icon: CalendarClock, title: 'Instalment plans', body: 'Card instalments and buy-now-pay-later: payments made, what is left, the next due date.' },
  { icon: Target, title: 'Savings goals', body: 'A target and a deadline, and how much to put aside each month to reach it.' },
  { icon: BarChart3, title: 'Reports', body: 'Income, spending and savings by month and by category. Print it or export a CSV.' },
  { icon: FileUp, title: 'Statement and screenshot import', body: 'Upload a statement or a screenshot. AI picks out the transactions; you check them first.' },
  { icon: Sparkles, title: 'AI Advisor', body: 'Reads your own spending, cards, budgets and goals, and suggests what to do next.' },
];

const DATA_POINTS: { icon: LucideIcon; text: React.ReactNode }[] = [
  { icon: Database, text: 'Row level security: each account can read and change only its own rows.' },
  { icon: KeyRound, text: 'Nothing is shown without signing in.' },
  { icon: ArrowDownToLine, text: <><strong className="font-medium text-foreground">Export</strong> downloads all your records as a file.</> },
  { icon: Trash2, text: <><strong className="font-medium text-foreground">Delete my account</strong> removes your sign-in and everything stored with it.</> },
];

const ease = [0.22, 1, 0.36, 1] as const;
const rise = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, ease, delay: i * 0.07 } }),
};

/** Counts a number up from 0 the first time it scrolls into view. */
const CountUp = ({ to, decimals = 0 }: { to: number; decimals?: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const [shown, setShown] = useState(fmt(reduce ? to : 0));
  useEffect(() => {
    if (!inView || reduce) { setShown(fmt(to)); return; }
    const c = animate(0, to, { duration: 1.4, ease, onUpdate: (v) => setShown(fmt(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, to]);
  return <span ref={ref} className="tabular-nums">{shown}</span>;
};

/** A Home-style card built from the app's own styles. The numbers are made up and labelled so. */
const SamplePreview = () => {
  const reduce = useReducedMotion();
  return (
    <motion.figure
      aria-label="Example of the Home screen with sample data"
      className="relative w-full max-w-sm mx-auto md:mx-0"
      initial={{ opacity: 0, y: 30, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, ease, delay: 0.25 }}
    >
      {/* A second card peeking out behind, for depth. */}
      <motion.div
        aria-hidden
        className="absolute -right-3 -top-12 sm:-right-8 sm:-top-14 w-[78%] rounded-xl bg-card/90 card-shadow p-3 rotate-[5deg]"
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Sample instalment plan</span>
          <span className="text-muted-foreground tabular-nums">2 of 4 paid</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {[1, 1, 0, 0].map((d, i) => (
            <span key={i} className={`h-1.5 rounded-full ${d ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
      </motion.div>

      <motion.div
        className="relative bg-card text-card-foreground rounded-xl card-shadow p-4 sm:p-5"
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Spendable cash</p>
            <p className="text-financial-large">AED <CountUp to={4250} decimals={2} /></p>
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
            <motion.div
              className="h-full rounded-full bg-warning"
              initial={{ width: reduce ? '83%' : '0%' }}
              whileInView={{ width: '83%' }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease, delay: 0.6 }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Projected month-end <span className="font-semibold text-expense">AED 1,710 (114%)</span>
          </p>
        </div>
      </motion.div>
      <figcaption className="sr-only">Sample data, not a real account.</figcaption>
    </motion.figure>
  );
};

/** The 16-second landscape promo (sample data only). Plays muted on a loop;
 *  with reduce motion on it waits for a tap instead of playing by itself. */
const PromoVideo = () => {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="promo" className="max-w-5xl mx-auto pt-14 md:pt-20">
      <motion.h2 id="promo" className="text-2xl md:text-3xl font-heading tracking-tight"
        variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
        See it in 15 seconds
      </motion.h2>
      <motion.div variants={rise} custom={1} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
        className="mt-6 overflow-hidden rounded-2xl card-shadow border border-border bg-card aspect-video">
        <video
          className="h-full w-full object-cover"
          src="/promo/spendpal-promo.mp4?v=2"
          poster="/promo/spendpal-promo-poster.jpg?v=2"
          muted
          loop
          playsInline
          autoPlay={!reduce}
          controls={!!reduce}
          preload="metadata"
          aria-label="SpendPal promo video with sample data"
        />
      </motion.div>
    </section>
  );
};

const Landing = () => {
  usePageHead('/');
  return (
    <MotionConfig reducedMotion="user">
      <PublicPageScroll>
        <header className="relative overflow-hidden bg-primary px-5 md:px-8 pt-8 pb-14 md:pb-20 rounded-b-3xl md:rounded-b-none">
          {/* Two soft light blobs drifting behind the hero. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-white/25 blur-3xl animate-[drift_14s_ease-in-out_infinite]" />
            <div className="absolute -bottom-28 right-[-4rem] h-80 w-80 rounded-full bg-fuchsia-300/30 blur-3xl animate-[drift_18s_ease-in-out_infinite_reverse]" />
          </div>
          <div className="relative max-w-5xl mx-auto">
            <PublicTopBar />
            <div className="mt-10 md:mt-16 grid gap-12 md:grid-cols-[1.1fr_1fr] md:items-center">
              <motion.div initial="hidden" animate="show">
                <motion.p variants={rise} custom={0} className="inline-flex items-center gap-2 rounded-full bg-primary-raised px-3 py-1 text-xs font-medium text-primary-foreground">
                  <BrandMark tone="mono" className="h-3.5 w-3.5" /> Personal finance tracker
                </motion.p>
                <motion.h1 variants={rise} custom={1} className="mt-4 text-[2.1rem] leading-[1.08] sm:text-5xl font-heading text-primary-foreground tracking-tight">
                  Your money, in plain words.
                </motion.h1>
                <motion.p variants={rise} custom={2} className="mt-4 text-[15px] sm:text-base leading-relaxed text-primary-subtle max-w-lg">
                  SpendPal is a personal finance tracker for your accounts, cards, budgets and goals. You type in or import your own records. It does not connect to your bank.
                </motion.p>
                <motion.div variants={rise} custom={3} className="mt-7 flex flex-col sm:flex-row gap-3">
                  <Button asChild className="h-12 px-6 text-[15px] font-semibold rounded-xl bg-card text-primary hover:bg-card hover:brightness-95 transition-transform active:scale-[0.98]">
                    <Link to="/auth" state={{ signup: true }}>Create account</Link>
                  </Button>
                  <Button asChild className="h-12 px-6 text-[15px] font-semibold rounded-xl bg-primary-raised text-primary-foreground hover:brightness-110 transition-transform active:scale-[0.98]">
                    <Link to="/auth">Sign in</Link>
                  </Button>
                </motion.div>
              </motion.div>
              <SamplePreview />
            </div>
          </div>
        </header>

        <main className="px-5 md:px-8">
          <PromoVideo />
          <section aria-labelledby="features" className="max-w-5xl mx-auto pt-14 md:pt-20">
            <motion.h2 id="features" className="text-2xl md:text-3xl font-heading tracking-tight"
              variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
              What it does
            </motion.h2>
            <div className="mt-6 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <motion.div
                  key={title}
                  variants={rise} custom={i % 3} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
                  className={`group bg-card rounded-2xl p-4 sm:p-5 card-shadow flex sm:block gap-4 items-start transition-transform duration-300 hover:-translate-y-1 ${i === FEATURES.length - 1 ? 'lg:col-span-2' : ''}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                    <Icon size={19} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="sm:mt-3 text-[15px] sm:text-base font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          <section aria-labelledby="data" className="max-w-5xl mx-auto pt-14 md:pt-20">
            <motion.h2 id="data" className="text-2xl md:text-3xl font-heading tracking-tight"
              variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
              How your data is kept
            </motion.h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {DATA_POINTS.map(({ icon: Icon, text }, i) => (
                <motion.div key={i} variants={rise} custom={i % 2} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
                  className="bg-card rounded-2xl p-4 card-shadow flex gap-3 text-sm text-muted-foreground leading-relaxed">
                  <Icon size={18} className="text-primary shrink-0 mt-0.5" />
                  <span>{text}</span>
                </motion.div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No ads, and your data is not sold. The AI features send data to an AI provider only when you use them.{' '}
              <Link to="/privacy" className="text-primary font-medium">Read the privacy policy</Link>
            </p>
          </section>

          <section aria-labelledby="install" className="max-w-5xl mx-auto pt-14 md:pt-20 pb-16">
            <motion.div variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
              className="relative overflow-hidden rounded-2xl p-5 sm:p-7 bg-gradient-to-br from-primary/25 via-card to-card card-shadow flex gap-4 items-start">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Smartphone size={19} />
              </span>
              <div>
                <h2 id="install" className="text-base sm:text-lg font-semibold">Install it on your phone</h2>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  iPhone: Share, then Add to Home Screen. Android: the browser menu, then Install app. It opens full screen like any other app.
                </p>
              </div>
            </motion.div>
          </section>
        </main>

        <PublicFooter />
      </PublicPageScroll>
    </MotionConfig>
  );
};

export default Landing;
