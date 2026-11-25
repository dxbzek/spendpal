// Orbix look (2026-11-25): the shared pieces every page is built from, so
// all screens read as one app. Reference: the Orbix "Better Banking" study.
//
//  - PageHeader   big title left, round icon buttons right ("Cards  + 🔔")
//  - HeroCard     the lavender-pink-peach gradient card, dark text
//  - HeroChip     translucent stat box inside a HeroCard (dark = emphasis)
//  - HeroSwitch   translucent track with a dark pill (1M / YTD / 12M)
//  - SectionLabel "ACCOUNTS · 3 ............ See all"
//  - Tile         a plain dark card, rounded-3xl
//  - ListCard     a dark card of rows split by hairlines ("Recent Activity")
//  - ListRow      one row: round icon, title + sub line, value on the right
//  - IconButton   44 px round button on the card colour
//  - BigAmount    an amount with smaller, dimmer cents
//  - Meter        thin progress bar (lavender by default)
import React from 'react';
import { cn } from '@/lib/utils';

export const PAGE_X = 'px-4 md:px-8';

export const PageHeader = ({ title, subtitle, actions, className }: {
  title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) => (
  <div className={cn('flex items-center justify-between gap-3 pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8 pb-4', className)}>
    <div className="min-w-0">
      <h1 className="text-[1.75rem] leading-tight font-heading font-semibold tracking-tight truncate">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'card' | 'primary' }>(
  ({ className, tone = 'card', ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-50',
        tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';

export const HeroCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-hero rounded-[28px] p-5', className)}>{children}</div>
);

export const HeroChip = ({ label, value, dark, className }: {
  label: React.ReactNode; value: React.ReactNode; dark?: boolean; className?: string;
}) => (
  <div className={cn(dark ? 'hero-chip-dark' : 'hero-chip', 'rounded-2xl px-3 py-2.5 min-w-0', className)}>
    <p className="text-[11px] opacity-70 truncate">{label}</p>
    <p className="text-base font-semibold tabular-nums truncate">{value}</p>
  </div>
);

export function HeroSwitch<T extends string>({ value, options, onChange, label, className }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string;
}) {
  return (
    <div className={cn('hero-chip rounded-full p-1 grid', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-8 rounded-full text-xs font-medium transition-colors', value === o.value ? 'hero-chip-dark' : 'opacity-70')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pill tabs on the dark page (not inside a hero): muted track, lavender pill. */
export function PillTabs<T extends string>({ value, options, onChange, label, className }: {
  value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; label: string; className?: string;
}) {
  return (
    <div className={cn('bg-card rounded-full p-1 flex gap-1 overflow-x-auto scrollbar-none', className)} role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-9 px-4 shrink-0 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const SectionLabel = ({ label, count, action, className }: {
  label: React.ReactNode; count?: number; action?: React.ReactNode; className?: string;
}) => (
  <div className={cn('flex items-center justify-between mb-3 px-1', className)}>
    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-[0.16em]">
      {label}{count != null && <> · <span className="text-foreground">{count}</span></>}
    </h2>
    {action}
  </div>
);

export const SectionAction = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" className="tap-area text-sm text-foreground hover:text-primary transition-colors" {...props}>{children}</button>
);

export const Tile = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('bg-card rounded-3xl p-4', className)} {...props}>{children}</div>
);

export const ListCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-card rounded-3xl px-4 divide-y divide-border', className)}>{children}</div>
);

export const ListRow = ({ icon, title, sub, value, valueSub, onClick, className, trailing }: {
  icon?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; valueSub?: React.ReactNode;
  onClick?: () => void; className?: string; trailing?: React.ReactNode;
}) => {
  const body = (
    <>
      {icon && <span className="w-11 h-11 shrink-0 rounded-full bg-muted flex items-center justify-center text-foreground">{icon}</span>}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] font-medium truncate">{title}</span>
        {sub && <span className="block text-xs text-muted-foreground truncate mt-0.5">{sub}</span>}
      </span>
      {(value != null || valueSub != null) && (
        <span className="shrink-0 text-right">
          {value != null && <span className="block text-[15px] font-medium tabular-nums">{value}</span>}
          {valueSub != null && <span className="block text-xs text-muted-foreground mt-0.5">{valueSub}</span>}
        </span>
      )}
      {trailing}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={cn('w-full flex items-center gap-3 py-3.5', className)}>{body}</button>
    : <div className={cn('flex items-center gap-3 py-3.5', className)}>{body}</div>;
};

/** "₱ 51,370.40" with the ".40" smaller and dimmer. Leaves text without cents alone. */
export const BigAmount = ({ text }: { text: string }) => {
  const m = text.match(/^(.*\d)([.,]\d{2})(\D*)$/);
  if (!m) return <>{text}</>;
  return <>{m[1]}<span className="text-[0.55em] opacity-60 align-baseline">{m[2]}</span>{m[3]}</>;
};

export const Meter = ({ value, className, barClassName, label }: {
  value: number; className?: string; barClassName?: string; label?: string;
}) => (
  <div className={cn('h-1.5 rounded-full bg-muted overflow-hidden', className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div className={cn('h-full rounded-full bg-primary transition-all', barClassName)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);
