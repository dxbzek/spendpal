import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_MAP } from '@/utils/currencies';
import { formatAmount } from '@/lib/finance/formatAmount';
import { toast } from 'sonner';

interface CurrencyContextType {
  currency: string;
  symbol: string;
  fmt: (n: number) => string;
  fmtSigned: (n: number, type: 'income' | 'expense' | 'transfer') => string;
  setCurrency: (code: string) => void;
  secondaryCurrency: string | null;
  setSecondaryCurrency: (code: string | null) => void;
  fmtSecondary: (n: number) => string | null;
  secondaryRate: number | null;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

const EXCHANGE_API = 'https://open.er-api.com/v6/latest';
const RATE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// Maximum age beyond which a stale cached rate is not trusted as a fallback.
// A months-old cached rate could mislead users significantly.
const RATE_MAX_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

function rateCacheKey(base: string, target: string) {
  return `spendpal_rate_${base}_${target}`;
}

function getCachedRate(base: string, target: string): { rate: number; fresh: boolean; tooStale: boolean } | null {
  try {
    const raw = localStorage.getItem(rateCacheKey(base, target));
    if (!raw) return null;
    const { rate, timestamp } = JSON.parse(raw) as { rate: number; timestamp: number };
    const age = Date.now() - timestamp;
    return {
      rate,
      fresh: age < RATE_CACHE_TTL_MS,
      // Don't use cache older than 24h as a fallback - it may be wildly inaccurate
      tooStale: age > RATE_MAX_STALE_MS,
    };
  } catch {
    return null;
  }
}

function setCachedRate(base: string, target: string, rate: number) {
  try {
    localStorage.setItem(rateCacheKey(base, target), JSON.stringify({ rate, timestamp: Date.now() }));
  } catch {
    // Ignore storage errors
  }
}

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState('AED');
  const [secondaryCurrency, setSecondaryCurrencyState] = useState<string | null>(() => {
    return localStorage.getItem('secondaryCurrency') || null;
  });
  const [secondaryRate, setSecondaryRate] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('currency').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.currency) setCurrencyState(data.currency);
    });
  }, [user]);

  // Fetch secondary rate; inline effect avoids the useCallback→useEffect dependency chain
  // that caused spurious refetches. AbortController cancels stale requests on re-run.
  useEffect(() => {
    if (!secondaryCurrency || secondaryCurrency === currency) {
      setSecondaryRate(secondaryCurrency === currency ? 1 : null);
      return;
    }

    // Use fresh cache if available - skip network request
    const cached = getCachedRate(currency, secondaryCurrency);
    if (cached?.fresh) {
      setSecondaryRate(cached.rate);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${EXCHANGE_API}/${currency}`, { signal: controller.signal });
        if (cancelled) return;

        if (res.status === 429) {
          // Rate-limited - fall back to stale cache if not too old
          if (cached && !cached.tooStale) {
            setSecondaryRate(cached.rate);
            toast.warning('Exchange rate API rate-limited. Using cached rate.');
          } else if (cached && cached.tooStale) {
            setSecondaryRate(null);
            toast.warning('Exchange rate data is too outdated to use. Conversion unavailable.');
          } else {
            setSecondaryRate(null);
            toast.warning('Exchange rate temporarily unavailable.');
          }
          return;
        }

        if (!res.ok) {
          const usable = cached && !cached.tooStale ? cached.rate : null;
          setSecondaryRate(usable);
          toast.warning('Could not fetch exchange rates. Secondary currency display unavailable.');
          return;
        }
        const data = await res.json() as { rates?: Record<string, number> };
        if (cancelled) return;
        const rate = data.rates?.[secondaryCurrency] ?? null;
        if (rate !== null) {
          setCachedRate(currency, secondaryCurrency, rate);
        }
        setSecondaryRate(rate);
      } catch (err) {
        if (!cancelled && err instanceof Error && err.name !== 'AbortError') {
          const usable = cached && !cached.tooStale ? cached.rate : null;
          setSecondaryRate(usable);
          toast.warning('Could not fetch exchange rates. Secondary currency display unavailable.');
        }
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [currency, secondaryCurrency]);

  const setSecondaryCurrency = useCallback((code: string | null) => {
    setSecondaryCurrencyState(code);
    if (code) {
      localStorage.setItem('secondaryCurrency', code);
    } else {
      localStorage.removeItem('secondaryCurrency');
      setSecondaryRate(null);
    }
  }, []);

  const info = CURRENCY_MAP[currency] || CURRENCY_MAP.AED;
  const secondaryInfo = secondaryCurrency ? CURRENCY_MAP[secondaryCurrency] : null;

  // Amounts are wrapped in an LTR isolate, with the sign outside it, so that an
  // RTL currency symbol cannot flush a minus to the wrong side of the digits.
  // See formatAmount() for the full explanation.
  // Memoized so consumers (and their React.memo children) don't re-render on
  // every provider render; non-finite input falls back to 0 rather than "NaN".
  const fmt = useCallback(
    (n: number) => formatAmount(info.symbol, info.locale, n),
    [info]
  );

  const fmtSigned = useCallback((n: number, type: 'income' | 'expense' | 'transfer') => {
    // Transfers carry no sign of their own, so they fall back to the amount's.
    const prefix = type === 'income' ? '+' : type === 'expense' ? '-' : undefined;
    return formatAmount(info.symbol, info.locale, n, prefix);
  }, [info]);

  const fmtSecondary = useCallback((n: number): string | null => {
    if (!secondaryCurrency || !secondaryInfo || secondaryRate === null) return null;
    const converted = (Number.isFinite(n) ? n : 0) * secondaryRate;
    return formatAmount(secondaryInfo.symbol, secondaryInfo.locale, converted);
  }, [secondaryCurrency, secondaryInfo, secondaryRate]);

  const setCurrency = useCallback((code: string) => {
    setCurrencyState(code);
  }, []);

  const value = useMemo(() => ({
    currency, symbol: info.symbol, fmt, fmtSigned, setCurrency,
    secondaryCurrency, setSecondaryCurrency, fmtSecondary, secondaryRate,
  }), [currency, info.symbol, fmt, fmtSigned, setCurrency, secondaryCurrency, setSecondaryCurrency, fmtSecondary, secondaryRate]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
};
