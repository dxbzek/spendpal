import { describe, it, expect } from 'vitest';
import { formatAmount, displaySymbol, latinDigits, LRI, PDI } from '@/lib/finance/formatAmount';
import { CURRENCY_MAP } from '@/utils/currencies';

const AED = 'د.إ';

describe('formatAmount', () => {
  it('puts the symbol and digits inside an LTR isolate', () => {
    expect(formatAmount('$', 'en-US', 1234.5)).toBe(`${LRI}$ 1,234.50${PDI}`);
  });

  it('keeps a negative sign outside the isolate, ahead of the number', () => {
    // Regression: with the sign inside the isolate, bidi flushed the minus past
    // the digits for RTL symbols, rendering -5,319.71 as "5,319.71-".
    const out = formatAmount(AED, 'en-AE', -5319.71);
    expect(out).toBe(`-${LRI}${AED} 5,319.71${PDI}`);
    expect(out.indexOf('-')).toBeLessThan(out.indexOf(LRI));
  });

  it('never emits a minus inside the isolate', () => {
    const body = formatAmount(AED, 'en-AE', -42).split(LRI)[1];
    expect(body).not.toContain('-');
  });

  it('formats to two decimal places', () => {
    expect(formatAmount('$', 'en-US', 5)).toContain('5.00');
    expect(formatAmount('$', 'en-US', 1.005)).toContain('1.01');
  });

  it('applies an explicit sign override', () => {
    expect(formatAmount('$', 'en-US', 10, '+')).toBe(`+${LRI}$ 10.00${PDI}`);
    expect(formatAmount('$', 'en-US', 10, '-')).toBe(`-${LRI}$ 10.00${PDI}`);
    expect(formatAmount('$', 'en-US', 10, '')).toBe(`${LRI}$ 10.00${PDI}`);
  });

  it('lets an empty override suppress the natural sign', () => {
    expect(formatAmount('$', 'en-US', -10, '')).toBe(`${LRI}$ 10.00${PDI}`);
  });

  it('falls back to zero for non-finite input', () => {
    expect(formatAmount('$', 'en-US', NaN)).toBe(`${LRI}$ 0.00${PDI}`);
    expect(formatAmount('$', 'en-US', Infinity)).toBe(`${LRI}$ 0.00${PDI}`);
  });

  it('formats -0 without a sign', () => {
    expect(formatAmount('$', 'en-US', -0)).toBe(`${LRI}$ 0.00${PDI}`);
  });
});

describe('displaySymbol', () => {
  it('shows the code for a right-to-left symbol, so the amount reads left to right', async () => {
    const { displaySymbol } = await import('@/lib/finance/formatAmount');
    expect(displaySymbol('AED', 'د.إ')).toBe('AED');
    expect(displaySymbol('ILS', '₪')).toBe('₪');
    expect(displaySymbol('SAR', '﷼')).toBe('SAR');
    expect(displaySymbol('USD', '$')).toBe('$');
    expect(formatAmount(displaySymbol('AED', 'د.إ'), 'en-AE', 699.86)).toBe(`${LRI}AED 699.86${PDI}`);
  });
});

// Regression: 19 currencies (SAR, QAR, KWD, BHD, OMR, EGP, JOD and others)
// printed Arabic-Indic, Persian, Bengali, Devanagari, Burmese or Tibetan
// numerals, because the digits followed the currency's locale.
describe('amounts use Latin digits in every currency', () => {
  const entries = Object.entries(CURRENCY_MAP);

  it('covers the whole currency map', () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it.each(entries)('%s prints 0 to 9 only', (code, { symbol, locale }) => {
    const out = formatAmount(displaySymbol(code, symbol), locale, 1234567.5);
    const digits = out.match(/\p{Nd}/gu) ?? [];
    // 1234567.50, whatever the grouping and the decimal mark are.
    expect(digits.join('')).toBe('123456750');
  });

  it('prints SAR like AED: code, then Latin digits', () => {
    const { symbol, locale } = CURRENCY_MAP.SAR;
    expect(formatAmount(displaySymbol('SAR', symbol), locale, 6830.9)).toBe(`${LRI}SAR 6,830.90${PDI}`);
  });

  it('keeps the locale grouping and decimal mark', () => {
    // German: dot for thousands, comma for decimals.
    expect(formatAmount('€', 'de-DE', 1234.5)).toBe(`${LRI}€ 1.234,50${PDI}`);
  });

  it('leaves a locale that already names a numbering system alone', () => {
    expect(latinDigits('ar-SA')).toBe('ar-SA-u-nu-latn');
    expect(latinDigits('ar-SA-u-nu-arab')).toBe('ar-SA-u-nu-arab');
  });
});
