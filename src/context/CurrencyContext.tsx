import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

// Comprehensive world currency map
const CURRENCY_MAP: Record<string, { symbol: string; locale: string }> = {
  AED: { symbol: 'د.إ', locale: 'en-AE' },
  AFN: { symbol: '؋', locale: 'fa-AF' },
  ALL: { symbol: 'L', locale: 'sq-AL' },
  AMD: { symbol: '֏', locale: 'hy-AM' },
  ANG: { symbol: 'ƒ', locale: 'nl-CW' },
  AOA: { symbol: 'Kz', locale: 'pt-AO' },
  ARS: { symbol: '$', locale: 'es-AR' },
  AUD: { symbol: 'A$', locale: 'en-AU' },
  AWG: { symbol: 'ƒ', locale: 'nl-AW' },
  AZN: { symbol: '₼', locale: 'az-AZ' },
  BAM: { symbol: 'KM', locale: 'bs-BA' },
  BBD: { symbol: 'Bds$', locale: 'en-BB' },
  BDT: { symbol: '৳', locale: 'bn-BD' },
  BGN: { symbol: 'лв', locale: 'bg-BG' },
  BHD: { symbol: '.د.ب', locale: 'ar-BH' },
  BIF: { symbol: 'FBu', locale: 'fr-BI' },
  BMD: { symbol: '$', locale: 'en-BM' },
  BND: { symbol: 'B$', locale: 'ms-BN' },
  BOB: { symbol: 'Bs.', locale: 'es-BO' },
  BRL: { symbol: 'R$', locale: 'pt-BR' },
  BSD: { symbol: '$', locale: 'en-BS' },
  BTN: { symbol: 'Nu.', locale: 'dz-BT' },
  BWP: { symbol: 'P', locale: 'en-BW' },
  BYN: { symbol: 'Br', locale: 'be-BY' },
  BZD: { symbol: 'BZ$', locale: 'en-BZ' },
  CAD: { symbol: 'C$', locale: 'en-CA' },
  CDF: { symbol: 'FC', locale: 'fr-CD' },
  CHF: { symbol: 'CHF', locale: 'de-CH' },
  CLP: { symbol: '$', locale: 'es-CL' },
  CNY: { symbol: '¥', locale: 'zh-CN' },
  COP: { symbol: '$', locale: 'es-CO' },
  CRC: { symbol: '₡', locale: 'es-CR' },
  CUP: { symbol: '₱', locale: 'es-CU' },
  CVE: { symbol: '$', locale: 'pt-CV' },
  CZK: { symbol: 'Kč', locale: 'cs-CZ' },
  DJF: { symbol: 'Fdj', locale: 'fr-DJ' },
  DKK: { symbol: 'kr', locale: 'da-DK' },
  DOP: { symbol: 'RD$', locale: 'es-DO' },
  DZD: { symbol: 'د.ج', locale: 'ar-DZ' },
  EGP: { symbol: 'E£', locale: 'ar-EG' },
  ERN: { symbol: 'Nfk', locale: 'ti-ER' },
  ETB: { symbol: 'Br', locale: 'am-ET' },
  EUR: { symbol: '€', locale: 'de-DE' },
  FJD: { symbol: 'FJ$', locale: 'en-FJ' },
  FKP: { symbol: '£', locale: 'en-FK' },
  GBP: { symbol: '£', locale: 'en-GB' },
  GEL: { symbol: '₾', locale: 'ka-GE' },
  GHS: { symbol: 'GH₵', locale: 'en-GH' },
  GIP: { symbol: '£', locale: 'en-GI' },
  GMD: { symbol: 'D', locale: 'en-GM' },
  GNF: { symbol: 'FG', locale: 'fr-GN' },
  GTQ: { symbol: 'Q', locale: 'es-GT' },
  GYD: { symbol: 'GY$', locale: 'en-GY' },
  HKD: { symbol: 'HK$', locale: 'zh-HK' },
  HNL: { symbol: 'L', locale: 'es-HN' },
  HRK: { symbol: 'kn', locale: 'hr-HR' },
  HTG: { symbol: 'G', locale: 'fr-HT' },
  HUF: { symbol: 'Ft', locale: 'hu-HU' },
  IDR: { symbol: 'Rp', locale: 'id-ID' },
  ILS: { symbol: '₪', locale: 'he-IL' },
  INR: { symbol: '₹', locale: 'en-IN' },
  IQD: { symbol: 'ع.د', locale: 'ar-IQ' },
  IRR: { symbol: '﷼', locale: 'fa-IR' },
  ISK: { symbol: 'kr', locale: 'is-IS' },
  JMD: { symbol: 'J$', locale: 'en-JM' },
  JOD: { symbol: 'د.ا', locale: 'ar-JO' },
  JPY: { symbol: '¥', locale: 'ja-JP' },
  KES: { symbol: 'KSh', locale: 'en-KE' },
  KGS: { symbol: 'сом', locale: 'ky-KG' },
  KHR: { symbol: '៛', locale: 'km-KH' },
  KMF: { symbol: 'CF', locale: 'fr-KM' },
  KPW: { symbol: '₩', locale: 'ko-KP' },
  KRW: { symbol: '₩', locale: 'ko-KR' },
  KWD: { symbol: 'د.ك', locale: 'ar-KW' },
  KYD: { symbol: 'CI$', locale: 'en-KY' },
  KZT: { symbol: '₸', locale: 'kk-KZ' },
  LAK: { symbol: '₭', locale: 'lo-LA' },
  LBP: { symbol: 'ل.ل', locale: 'ar-LB' },
  LKR: { symbol: 'Rs', locale: 'si-LK' },
  LRD: { symbol: 'L$', locale: 'en-LR' },
  LSL: { symbol: 'L', locale: 'en-LS' },
  LYD: { symbol: 'ل.د', locale: 'ar-LY' },
  MAD: { symbol: 'د.م.', locale: 'ar-MA' },
  MDL: { symbol: 'L', locale: 'ro-MD' },
  MGA: { symbol: 'Ar', locale: 'mg-MG' },
  MKD: { symbol: 'ден', locale: 'mk-MK' },
  MMK: { symbol: 'K', locale: 'my-MM' },
  MNT: { symbol: '₮', locale: 'mn-MN' },
  MOP: { symbol: 'MOP$', locale: 'zh-MO' },
  MRU: { symbol: 'UM', locale: 'ar-MR' },
  MUR: { symbol: '₨', locale: 'en-MU' },
  MVR: { symbol: 'Rf', locale: 'dv-MV' },
  MWK: { symbol: 'MK', locale: 'en-MW' },
  MXN: { symbol: 'Mex$', locale: 'es-MX' },
  MYR: { symbol: 'RM', locale: 'ms-MY' },
  MZN: { symbol: 'MT', locale: 'pt-MZ' },
  NAD: { symbol: 'N$', locale: 'en-NA' },
  NGN: { symbol: '₦', locale: 'en-NG' },
  NIO: { symbol: 'C$', locale: 'es-NI' },
  NOK: { symbol: 'kr', locale: 'nb-NO' },
  NPR: { symbol: 'Rs', locale: 'ne-NP' },
  NZD: { symbol: 'NZ$', locale: 'en-NZ' },
  OMR: { symbol: 'ر.ع.', locale: 'ar-OM' },
  PAB: { symbol: 'B/.', locale: 'es-PA' },
  PEN: { symbol: 'S/.', locale: 'es-PE' },
  PGK: { symbol: 'K', locale: 'en-PG' },
  PHP: { symbol: '₱', locale: 'en-PH' },
  PKR: { symbol: '₨', locale: 'en-PK' },
  PLN: { symbol: 'zł', locale: 'pl-PL' },
  PYG: { symbol: '₲', locale: 'es-PY' },
  QAR: { symbol: 'ر.ق', locale: 'ar-QA' },
  RON: { symbol: 'lei', locale: 'ro-RO' },
  RSD: { symbol: 'дин', locale: 'sr-RS' },
  RUB: { symbol: '₽', locale: 'ru-RU' },
  RWF: { symbol: 'RF', locale: 'rw-RW' },
  SAR: { symbol: '﷼', locale: 'ar-SA' },
  SBD: { symbol: 'SI$', locale: 'en-SB' },
  SCR: { symbol: '₨', locale: 'en-SC' },
  SDG: { symbol: 'ج.س.', locale: 'ar-SD' },
  SEK: { symbol: 'kr', locale: 'sv-SE' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
  SHP: { symbol: '£', locale: 'en-SH' },
  SLE: { symbol: 'Le', locale: 'en-SL' },
  SOS: { symbol: 'Sh', locale: 'so-SO' },
  SRD: { symbol: '$', locale: 'nl-SR' },
  SSP: { symbol: '£', locale: 'en-SS' },
  STN: { symbol: 'Db', locale: 'pt-ST' },
  SYP: { symbol: '£S', locale: 'ar-SY' },
  SZL: { symbol: 'E', locale: 'en-SZ' },
  THB: { symbol: '฿', locale: 'th-TH' },
  TJS: { symbol: 'SM', locale: 'tg-TJ' },
  TMT: { symbol: 'T', locale: 'tk-TM' },
  TND: { symbol: 'د.ت', locale: 'ar-TN' },
  TOP: { symbol: 'T$', locale: 'to-TO' },
  TRY: { symbol: '₺', locale: 'tr-TR' },
  TTD: { symbol: 'TT$', locale: 'en-TT' },
  TWD: { symbol: 'NT$', locale: 'zh-TW' },
  TZS: { symbol: 'TSh', locale: 'sw-TZ' },
  UAH: { symbol: '₴', locale: 'uk-UA' },
  UGX: { symbol: 'USh', locale: 'en-UG' },
  USD: { symbol: '$', locale: 'en-US' },
  UYU: { symbol: '$U', locale: 'es-UY' },
  UZS: { symbol: 'сўм', locale: 'uz-UZ' },
  VES: { symbol: 'Bs.S', locale: 'es-VE' },
  VND: { symbol: '₫', locale: 'vi-VN' },
  VUV: { symbol: 'VT', locale: 'bi-VU' },
  WST: { symbol: 'WS$', locale: 'sm-WS' },
  XAF: { symbol: 'FCFA', locale: 'fr-CM' },
  XCD: { symbol: 'EC$', locale: 'en-AG' },
  XOF: { symbol: 'CFA', locale: 'fr-SN' },
  XPF: { symbol: '₣', locale: 'fr-PF' },
  YER: { symbol: '﷼', locale: 'ar-YE' },
  ZAR: { symbol: 'R', locale: 'en-ZA' },
  ZMW: { symbol: 'ZK', locale: 'en-ZM' },
  ZWL: { symbol: 'Z$', locale: 'en-ZW' },
};

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

export const WORLD_CURRENCIES = Object.entries(CURRENCY_MAP).map(([code, { symbol }]) => ({
  code,
  label: `${code} (${symbol})`,
}));

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

  // Fetch secondary rate using open.er-api.com (supports all currencies including AED)
  const fetchRate = useCallback(async () => {
    if (!secondaryCurrency || secondaryCurrency === currency) {
      setSecondaryRate(secondaryCurrency === currency ? 1 : null);
      return;
    }
    try {
      const res = await fetch(`${EXCHANGE_API}/${currency}`);
      if (!res.ok) { setSecondaryRate(null); return; }
      const data = await res.json();
      const rate = data.rates?.[secondaryCurrency];
      setSecondaryRate(rate ?? null);
    } catch {
      setSecondaryRate(null);
    }
  }, [currency, secondaryCurrency]);

  useEffect(() => { fetchRate(); }, [fetchRate]);

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
