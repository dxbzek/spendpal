import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_MAP } from '@/utils/currencies';

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

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState('AED');
  const [secondaryCurrency, setSecondaryCurrencyState] = useState<string | null>(() => {
    return localStorage.getItem('secondaryCurrency') || null;
  });
  const [secondaryRate, setSecondaryRate] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('currency').eq('user_id', user.id).single().then(({ data }) => {
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
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${EXCHANGE_API}/${currency}`, { signal: controller.signal });
        if (!res.ok) { setSecondaryRate(null); return; }
        const data = await res.json() as { rates?: Record<string, number> };
        setSecondaryRate(data.rates?.[secondaryCurrency] ?? null);
      } catch {
        setSecondaryRate(null);
      }
    })();
    return () => controller.abort();
  }, [currency, secondaryCurrency]);

  const setSecondaryCurrency = (code: string | null) => {
    setSecondaryCurrencyState(code);
    if (code) {
      localStorage.setItem('secondaryCurrency', code);
    } else {
      localStorage.removeItem('secondaryCurrency');
      setSecondaryRate(null);
    }
  };

  const info = CURRENCY_MAP[currency] || CURRENCY_MAP.AED;
  const secondaryInfo = secondaryCurrency ? CURRENCY_MAP[secondaryCurrency] : null;

  const fmt = (n: number) => `${info.symbol} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtSigned = (n: number, type: 'income' | 'expense' | 'transfer') => {
    const prefix = type === 'income' ? '+' : type === 'expense' ? '-' : '';
    return `${prefix}${info.symbol} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtSecondary = (n: number): string | null => {
    if (!secondaryCurrency || !secondaryInfo || secondaryRate === null) return null;
    const converted = n * secondaryRate;
    return `${secondaryInfo.symbol} ${converted.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const setCurrency = (code: string) => {
    setCurrencyState(code);
  };

  return (
    <CurrencyContext.Provider value={{
      currency, symbol: info.symbol, fmt, fmtSigned, setCurrency,
      secondaryCurrency, setSecondaryCurrency, fmtSecondary, secondaryRate,
    }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
};
