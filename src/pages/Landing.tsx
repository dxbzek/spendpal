// The home page a signed-out visitor sees at "/". Signed-in users get the app.
// Every line describes something the code does; nothing here is a claim about
// users, ratings, prices or certifications.
// 2026-11-27: shorter copy for phones, motion on load and on scroll. Motion
// follows the visitor's reduce-motion setting (MotionConfig reducedMotion="user").
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, MotionConfig, animate, motion, useInView, useReducedMotion } from 'framer-motion';
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

const TICKS = [
  { label: 'Sample salary', amount: '+4,500.00', up: true },
  { label: 'Sample groceries', amount: '−240.50', up: false },
  { label: 'Sample coffee', amount: '−18.00', up: false },
  { label: 'Sample card payment', amount: '−600.00', up: false },
];

/** Sample transactions that slide in one after another under the balance. */
const LiveTicker = () => {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI(v => (v + 1) % TICKS.length), 2600);
    return () => clearInterval(t);
  }, [reduce]);
  const t = TICKS[i];
  return (
    <div className="mt-2 h-6 overflow-hidden" aria-hidden>
      <AnimatePresence mode="wait">
        <motion.div key={i} className="flex items-center gap-2 text-xs"
          initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }}
          transition={{ duration: 0.35, ease }}>
          <span className={`h-1.5 w-1.5 rounded-full ${t.up ? 'bg-income' : 'bg-expense'}`} />
          <span className="text-muted-foreground">{t.label}</span>
          <span className={`font-semibold tabular-nums ${t.up ? 'text-income' : 'text-foreground'}`}>{t.amount}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/** A Home-style card built from the app's own styles. The numbers are made up and labelled so. */
const SamplePreview = () => {
  const reduce = useReducedMotion();
  return (
    <motion.figure
      aria-label="Example of the Home screen with sample data"
      className="relative w-full max-w-sm mx-auto md:mx-0 mt-3 md:mt-0"
      initial={{ opacity: 0, y: 30, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, ease, delay: 0.25 }}
    >

      <motion.div
        className="relative bg-card text-card-foreground rounded-xl card-shadow p-4 sm:p-5"
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Spendable cash</p>
            <p className="text-financial-large">AED <CountUp to={4250} decimals={2} /></p>
            <LiveTicker />
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

/** The 20-second landscape promo: real app screens with sample data in phone
 *  frames. Full bleed, edge to edge. Plays muted on a loop; with reduce
 *  motion it shows controls and waits for a tap. */
const PromoVideo = () => {
  const reduce = useReducedMotion();
  return (
    <section aria-label="SpendPal promo video" className="w-full bg-black">
      <video
        className="block w-full aspect-video object-cover"
        src="/promo/spendpal-promo.mp4?v=6"
        poster="/promo/spendpal-promo-poster.jpg?v=6"
        muted
        loop
        playsInline
        autoPlay={!reduce}
        controls={!!reduce}
        preload="metadata"
        aria-label="SpendPal promo video with sample data"
      />
    </section>
  );
};

/** Compact feature tiles; tapping one pops its description open below. */
const FeaturePicker = () => {
  const [open, setOpen] = useState(0);
  const f = FEATURES[open];
  const Icon = f.icon;
  return (
    <div className="mt-4">
      <div className="-mx-5 px-5 md:mx-0 md:px-0 flex gap-2 overflow-x-auto snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Features">
        {FEATURES.map(({ icon: I, title }, i) => (
          <motion.button key={title} type="button" role="tab" aria-selected={open === i} onClick={() => setOpen(i)}
            whileTap={{ scale: 0.96 }}
            className={`relative shrink-0 snap-start flex items-center gap-2 rounded-full px-3.5 py-2 whitespace-nowrap transition-colors ${open === i ? 'text-primary-foreground' : 'bg-card card-shadow hover:bg-muted'}`}>
            {open === i && <motion.span layoutId="feature-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <I size={16} className={`relative shrink-0 ${open === i ? '' : 'text-primary'}`} />
            <h3 className="relative text-[13px] font-semibold leading-tight">{title}</h3>
          </motion.button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={open} role="tabpanel"
          initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.3, ease }}
          className="mt-3 flex gap-3 items-start rounded-2xl bg-card card-shadow p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 text-primary"><Icon size={18} /></span>
          <div>
            <p className="text-sm font-semibold">{f.title}</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const Landing = () => {
  usePageHead('/');
  return (
    <MotionConfig reducedMotion="user">
      <PublicPageScroll>
        {/* Frozen top bar: logo and Sign in stay on screen while the page scrolls. */}
        <div className="sticky top-0 z-30 bg-primary/90 backdrop-blur-md px-5 md:px-8 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3">
          <div className="max-w-5xl mx-auto"><PublicTopBar /></div>
        </div>
        <header className="relative overflow-hidden bg-primary px-5 md:px-8 pt-2 pb-10 md:pb-20 rounded-b-3xl md:rounded-b-none">
          {/* Moving colour behind the hero: four large soft blobs on their own loops. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 -left-24 h-[26rem] w-[26rem] rounded-full bg-white/45 blur-3xl motion-reduce:animate-none animate-[blob-a_11s_ease-in-out_infinite]" />
            <div className="absolute top-10 -right-32 h-[24rem] w-[24rem] rounded-full bg-fuchsia-400/45 blur-3xl motion-reduce:animate-none animate-[blob-b_13s_ease-in-out_infinite]" />
            <div className="absolute -bottom-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-indigo-500/40 blur-3xl motion-reduce:animate-none animate-[blob-c_15s_ease-in-out_infinite]" />
            <div className="absolute bottom-0 -right-20 h-72 w-72 rounded-full bg-orange-200/45 blur-3xl motion-reduce:animate-none animate-[blob-b_10s_ease-in-out_infinite_reverse]" />
          </div>
          <div className="relative max-w-5xl mx-auto">
            <div className="mt-7 md:mt-16 grid gap-4 md:gap-12 md:grid-cols-[1.1fr_1fr] md:items-center">
              <motion.div initial="hidden" animate="show">
                <motion.p variants={rise} custom={0} className="inline-flex items-center gap-2 rounded-full bg-primary-raised px-3 py-1 text-xs font-medium text-primary-foreground">
                  <BrandMark tone="mono" className="h-3.5 w-3.5" /> Personal finance tracker
                </motion.p>
                <motion.h1 variants={rise} custom={1} className="mt-3 text-[1.9rem] leading-[1.08] sm:text-5xl font-heading text-primary-foreground tracking-tight">
                  {['Your', 'money,', 'in'].map((w, k) => (
                    <motion.span key={w} className="inline-block mr-[0.25em]"
                      initial={{ y: '0.6em', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.6, ease, delay: 0.15 + k * 0.08 }}>{w}</motion.span>
                  ))}
                  <motion.span className="inline-block hero-shimmer"
                    initial={{ y: '0.6em', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, ease, delay: 0.4 }}>plain words.</motion.span>
                </motion.h1>
                <motion.p variants={rise} custom={2} className="mt-3 text-[14px] sm:text-base leading-relaxed text-primary-subtle max-w-lg">
                  SpendPal is a personal finance tracker. Private by design: it does not connect to your bank.
                </motion.p>
                <motion.div variants={rise} custom={3} className="mt-5 grid grid-cols-2 sm:flex gap-2.5 sm:gap-3">
                  <Button asChild className="h-11 px-5 text-[15px] font-semibold rounded-xl bg-card text-primary hover:bg-card hover:brightness-95 transition-transform active:scale-[0.98]">
                    <Link to="/auth" state={{ signup: true }}>Create account</Link>
                  </Button>
                  <Button asChild className="h-11 px-5 text-[15px] font-semibold rounded-xl bg-primary-raised text-primary-foreground hover:brightness-110 transition-transform active:scale-[0.98]">
                    <Link to="/auth">Sign in</Link>
                  </Button>
                </motion.div>
              </motion.div>
              <SamplePreview />
            </div>
          </div>
        </header>

        <PromoVideo />

        <main className="px-5 md:px-8">
          <section aria-labelledby="features" className="max-w-5xl mx-auto pt-10 md:pt-16">
            <motion.h2 id="features" className="text-2xl md:text-3xl font-heading tracking-tight"
              variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
              What it does
            </motion.h2>
            <FeaturePicker />
          </section>

          <section aria-labelledby="data" className="max-w-5xl mx-auto pt-10 md:pt-16">
            <motion.h2 id="data" className="text-2xl md:text-3xl font-heading tracking-tight"
              variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
              How your data is kept
            </motion.h2>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
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

          <section aria-labelledby="install" className="max-w-5xl mx-auto pt-10 md:pt-16 pb-12">
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
