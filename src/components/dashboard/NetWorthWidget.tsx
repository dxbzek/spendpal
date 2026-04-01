import { useCurrency } from '@/context/CurrencyContext';
import { Wallet, TrendingUp, TrendingDown, Target } from 'lucide-react';
import GlossaryLink from '@/components/GlossaryLink';
import type { Account } from '@/types/finance';
import { memo, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';

interface Props {
  accounts: Account[];
  hidden: boolean;
  mask: (val: string) => string;
}

const STORAGE_KEY = 'spendpal_networth_history';
const NW_GOAL_KEY = 'spendpal_nw_goal';

function loadGoal(): number | null {
  const v = localStorage.getItem(NW_GOAL_KEY);
  return v ? parseFloat(v) : null;
}
const MAX_MONTHS = 7;

function loadHistory(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveHistory(history: Record<string, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

const NetWorthWidget = ({ accounts, hidden, mask }: Props) => {
  const { fmt } = useCurrency();
  const [goal, setGoal] = useState<number | null>(() => loadGoal());
  const [editingGoal, setEditingGoal] = useState(false);

  const assets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
  const liabilities = accounts.filter(a => a.type === 'credit').reduce((s, a) => {
    const spent = a.creditLimit ? a.creditLimit - a.balance : 0;
    return s + spent;
  }, 0);
  const netWorth = assets - liabilities;

  // Persist current month's net worth snapshot
  useEffect(() => {
    if (accounts.length === 0) return;
    const key = format(new Date(), 'yyyy-MM');
    const history = loadHistory();
    history[key] = netWorth;
    // Keep only last MAX_MONTHS entries
    const sorted = Object.keys(history).sort();
    if (sorted.length > MAX_MONTHS) {
      sorted.slice(0, sorted.length - MAX_MONTHS).forEach(k => delete history[k]);
    }
    saveHistory(history);
  }, [netWorth, accounts.length]);

  const history = useMemo(() => {
    const raw = loadHistory();
    return Object.entries(raw)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-MAX_MONTHS);
  }, [netWorth]); // recompute when netWorth changes

  const sparkPoints = useMemo(() => {
    if (history.length < 2) return null;
    const vals = history.map(([, v]) => v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const W = 100, H = 28;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x},${y}`;
    }).join(' ');
    return { pts, vals, min, max };
  }, [history]);

  const trend = history.length >= 2
    ? history[history.length - 1][1] - history[history.length - 2][1]
    : 0;

  const goalProgress = goal && goal > 0 ? Math.min(Math.round((netWorth / goal) * 100), 100) : null;

  const saveGoal = (val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      setGoal(n);
      localStorage.setItem(NW_GOAL_KEY, String(n));
    } else if (val === '') {
      setGoal(null);
      localStorage.removeItem(NW_GOAL_KEY);
    }
    setEditingGoal(false);
  };

  return (
    <div className="bg-card rounded-2xl p-4 card-shadow h-full transition-shadow hover:card-shadow-hover">
      <div className="flex items-center gap-2 mb-2">
        <Wallet size={16} className="text-primary shrink-0" />
        <h2 className="font-heading text-sm">Net Worth</h2>
        <GlossaryLink term="Net Worth" />
        {trend !== 0 && !hidden && (
          <span className={`ml-auto flex items-center gap-0.5 text-[11px] font-medium ${trend >= 0 ? 'text-income' : 'text-expense'}`}>
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend >= 0 ? '+' : ''}{fmt(trend)}
          </span>
        )}
      </div>
      <p className="text-financial-large mt-1">
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

      {/* Sparkline */}
      {sparkPoints && !hidden && (
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground mb-1">{history.length}-month trend</p>
          <svg viewBox={`0 0 100 28`} className="w-full h-7" preserveAspectRatio="none">
            <defs>
              <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={sparkPoints.pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polygon
              points={`0,28 ${sparkPoints.pts} 100,28`}
              fill="url(#nw-grad)"
            />
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>{history[0]?.[0]?.slice(0, 7)}</span>
            <span>{history[history.length - 1]?.[0]?.slice(0, 7)}</span>
          </div>
        </div>
      )}

      {/* Net Worth Goal */}
      {!hidden && (
        <div className="mt-3 pt-2 border-t border-border">
          {editingGoal ? (
            <div className="flex items-center gap-1.5">
              <Target size={11} className="text-primary shrink-0" />
              <input
                type="number"
                min="1"
                autoFocus
                placeholder="Set goal…"
                defaultValue={goal ?? ''}
                className="flex-1 text-xs bg-muted rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
                onBlur={e => saveGoal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveGoal((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingGoal(false); }}
              />
            </div>
          ) : goalProgress !== null ? (
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span className="flex items-center gap-1"><Target size={10} /> Goal progress</span>
                <button onClick={() => setEditingGoal(true)} className="hover:text-primary">{goalProgress}% · {fmt(goal!)}</button>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${goalProgress >= 100 ? 'bg-income' : 'bg-primary'}`} style={{ width: `${goalProgress}%` }} />
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingGoal(true)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
              <Target size={10} /> Set net worth goal
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(NetWorthWidget);
