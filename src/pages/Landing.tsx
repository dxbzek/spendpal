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
  PiggyBank, ShieldCheck, Smartphone, Sparkles, Target, Trash2,
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


const DATA_TILES: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: Database, title: 'Only your rows', sub: 'Row level security on every table' },
  { icon: KeyRound, title: 'Sign-in first', sub: 'Nothing shows without it' },
  { icon: ArrowDownToLine, title: 'Export anytime', sub: 'All your records as a file' },
  { icon: Trash2, title: 'Delete anytime', sub: 'Your sign-in and every record' },
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

// Sample story the hero card plays on a loop: each step changes the card.
const STEPS = [
  { label: 'Sample salary', amount: '+4,500.00', up: true, cash: 8750, card: 1820, groceries: 1240 },
  { label: 'Sample groceries', amount: '−240.50', up: false, cash: 8509.5, card: 1820, groceries: 1480.5 },
  { label: 'Sample coffee', amount: '−18.00', up: false, cash: 8491.5, card: 1820, groceries: 1480.5 },
  { label: 'Sample card payment', amount: '−600.00', up: false, cash: 7891.5, card: 1220, groceries: 1480.5 },
];
const START = { cash: 4250, card: 1820, groceries: 1240 };
const fmt2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A number that glides to each new value. */
const Glide = ({ value, decimals = 2 }: { value: number; decimals?: number }) => {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setShown(value); prev.current = value; return; }
    const c = animate(prev.current, value, { duration: 0.9, ease, onUpdate: setShown });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <span className="tabular-nums">{decimals ? fmt2(shown) : Math.round(shown).toLocaleString('en-US')}</span>;
};

/** A soft flash behind whatever just changed. */
const Flash = ({ k, up, className = '' }: { k: string | number; up?: boolean; className?: string }) => (
  <motion.span key={k} aria-hidden className={`pointer-events-none absolute inset-0 rounded-xl ${up ? 'bg-income/25' : 'bg-primary/25'} ${className}`}
    initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
);

/** A Home-style card built from the app's own styles. The numbers are made up and labelled so. */
const SamplePreview = () => {
  const reduce = useReducedMotion();
  const [i, setI] = useState(-1);
  useEffect(() => {
    if (reduce) return;
    const first = setTimeout(() => setI(0), 1600);
    const t = setInterval(() => setI(v => (v + 1) % (STEPS.length + 1)), 2600);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [reduce]);
  // Index STEPS.length is the pause that resets the story to the start.
  const step = i >= 0 && i < STEPS.length ? STEPS[i] : null;
  const st = step ?? START;
  const pct = Math.min(100, (st.groceries / 1500) * 100);
  const projected = Math.round(st.groceries * 1.38);
  return (
    <motion.figure
      aria-label="Example of the Home screen with sample data"
      className="relative w-full max-w-sm mx-auto md:mx-0 mt-3 md:mt-0"
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.25 }}
    >
      <motion.div
        className="relative bg-card text-card-foreground rounded-xl card-shadow p-4 sm:p-5"
        animate={reduce ? undefined : { y: [0, -8, 0], rotate: [0, -0.6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="relative min-w-0 -m-1.5 p-1.5">
            {step && <Flash k={`c${i}`} up={step.up} />}
            <p className="relative text-xs uppercase tracking-wider text-muted-foreground mb-1">Spendable cash</p>
            <p className="relative text-financial-large">AED {i < 0 ? <CountUp to={4250} decimals={2} /> : <Glide value={st.cash} />}</p>
          </div>
          <span className="shrink-0 rounded-full bg-warning-soft border border-warning-line px-2.5 py-1 text-[11px] font-semibold">Sample data</span>
        </div>

        <div className="mt-2 h-7 overflow-hidden" aria-hidden>
          <AnimatePresence mode="wait">
            {step && (
              <motion.div key={i} className="flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs w-fit"
                initial={{ y: 22, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -22, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}>
                <span className={`h-1.5 w-1.5 rounded-full ${step.up ? 'bg-income' : 'bg-expense'}`} />
                <span className="text-muted-foreground">{step.label}</span>
                <span className={`font-semibold tabular-nums ${step.up ? 'text-income' : 'text-foreground'}`}>{step.amount}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative mt-2 rounded-xl bg-muted p-3 flex items-center gap-3">
          {step && step.card !== START.card && <Flash k={`k${i}`} />}
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-foreground">
            <CreditCard size={18} strokeWidth={1.75} />
          </span>
          <div className="relative min-w-0 flex-1">
            <p className="text-sm font-medium truncate">Sample card</p>
            <p className="text-xs text-muted-foreground">Statement due 5 Dec</p>
          </div>
          <p className="relative text-sm font-semibold">AED <Glide value={st.card} /></p>
        </div>

        <div className="relative mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Groceries</span>
            <span className="text-muted-foreground">AED <Glide value={st.groceries} decimals={0} /> of 1,500</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <motion.div className={`h-full rounded-full ${pct > 95 ? 'bg-expense' : 'bg-warning'}`}
              initial={{ width: reduce ? `${pct}%` : '0%' }} animate={{ width: `${pct}%` }}
              transition={{ duration: 1.0, ease, delay: i < 0 ? 0.6 : 0 }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Projected month-end <span className="font-semibold text-expense">AED <Glide value={projected} decimals={0} /> ({Math.round((projected / 1500) * 100)}%)</span>
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

/** One row of feature icons. It cycles by itself; a tap picks one and stops the cycle. */
const FeaturePicker = () => {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reduce) return;
    const t = setInterval(() => setOpen(v => (v + 1) % FEATURES.length), 3200);
    return () => clearInterval(t);
  }, [auto, reduce]);
  const f = FEATURES[open];
  const Icon = f.icon;
  return (
    <div className="mt-4">
      <div className="flex justify-between gap-1.5 sm:justify-start sm:gap-3" role="tablist" aria-label="Features">
        {FEATURES.map(({ icon: I, title }, i) => (
          <motion.button key={title} type="button" role="tab" aria-selected={open === i} aria-label={title} title={title}
            onClick={() => { setOpen(i); setAuto(false); }} whileTap={{ scale: 0.9 }}
            className={`relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl transition-colors ${open === i ? 'text-primary-foreground' : 'bg-card card-shadow text-primary hover:bg-muted'}`}>
            {open === i && <motion.span layoutId="feature-pill" className="absolute inset-0 rounded-2xl bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
            <I size={19} className="relative" />
            <h3 className="sr-only">{title}</h3>
            {open === i && auto && !reduce && (
              <motion.span key={`bar${i}`} aria-hidden className="absolute -bottom-1.5 left-2 right-2 h-0.5 origin-left rounded-full bg-primary"
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 3.2, ease: 'linear' }} />
            )}
          </motion.button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={open} role="tabpanel"
          initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease }}
          className="mt-4 flex gap-3 items-start rounded-2xl bg-card card-shadow p-4">
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
  // The top bar is see-through over the hero and turns dark once the hero has scrolled away.
  const heroRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const scroller = heroRef.current?.parentElement;
    if (!scroller) return;
    const check = () => {
      const hero = heroRef.current, bar = barRef.current;
      if (hero && bar) setPastHero(hero.getBoundingClientRect().bottom <= bar.getBoundingClientRect().bottom);
    };
    check();
    scroller.addEventListener('scroll', check, { passive: true });
    return () => scroller.removeEventListener('scroll', check);
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <PublicPageScroll>
        {/* Frozen top bar: logo and Sign in stay on screen while the page scrolls. */}
        <div ref={barRef} className={`sticky top-0 z-30 px-5 md:px-8 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 transition-colors duration-300 ${pastHero ? 'bg-background/85 backdrop-blur-md border-b border-border' : 'bg-transparent'}`}>
          <div className="max-w-5xl mx-auto"><PublicTopBar onDark={pastHero} /></div>
        </div>
        <header ref={heroRef} className="relative overflow-hidden bg-primary px-5 md:px-8 -mt-[calc(env(safe-area-inset-top,0px)+64px)] pt-[calc(env(safe-area-inset-top,0px)+72px)] pb-10 md:pb-20 rounded-b-3xl md:rounded-b-none">
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
            <div className="mt-4 rounded-2xl bg-card card-shadow p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                  <ShieldCheck size={22} />
                </span>
                <div>
                  <p className="text-sm font-semibold">Private by design</p>
                  <p className="text-xs text-muted-foreground">No bank login. No ads. Not sold.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {DATA_TILES.map(({ icon: Icon, title, sub }, i) => (
                  <motion.div key={title} variants={rise} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-30px' }}
                    className="rounded-xl bg-muted p-3">
                    <Icon size={17} className="text-primary" />
                    <p className="mt-2 text-[13px] font-semibold leading-tight">{title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{sub}</p>
                  </motion.div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              The AI features send data to an AI provider only when you use them.{' '}
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
