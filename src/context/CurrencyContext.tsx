import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

const CURRENCY_MAP: Record<string, { symbol: string; locale: string }> = {
  AED: { symbol: 'د.إ', locale: 'en-AE' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  INR: { symbol: '₹', locale: 'en-IN' },
  SAR: { symbol: '﷼', locale: 'ar-SA' },
};

interface CurrencyContextType {
  currency: string;
  symbol: string;
  fmt: (n: number) => string;
  fmtSigned: (n: number, type: 'income' | 'expense' | 'transfer') => string;
  setCurrency: (code: string) => void;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState('AED');

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('currency').eq('user_id', user.id).single().then(({ data }) => {
      if (data?.currency) setCurrencyState(data.currency);
    });
  }, [user]);

  const info = CURRENCY_MAP[currency] || CURRENCY_MAP.AED;

  const fmt = (n: number) => `${info.symbol} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtSigned = (n: number, type: 'income' | 'expense' | 'transfer') => {
    const prefix = type === 'income' ? '+' : type === 'expense' ? '-' : '';
    return `${prefix}${info.symbol} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const setCurrency = (code: string) => {
    setCurrencyState(code);
  };

  return (
    <CurrencyContext.Provider value={{ currency, symbol: info.symbol, fmt, fmtSigned, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
};
