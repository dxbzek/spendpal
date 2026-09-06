import { describe, it, expect } from 'vitest';
import { formatAmount, LRI, PDI } from '@/lib/finance/formatAmount';

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
