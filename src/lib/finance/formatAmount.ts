// Currency string assembly, kept separate from CurrencyContext so the bidi
// handling below can be unit-tested without mounting a React provider.

/** U+2066 LEFT-TO-RIGHT ISOLATE. */
const LRI = '⁦';
/** U+2069 POP DIRECTIONAL ISOLATE. */
const PDI = '⁩';

/**
 * Formats one amount as "<sign><isolate><symbol> <digits></isolate>".
 *
 * The symbol and digits sit inside an LTR isolate so that an RTL currency
 * symbol (AED's "د.إ", for one) cannot reorder the sentence around it.
 *
 * The sign is deliberately kept OUTSIDE that isolate. Inside it, the minus is a
 * bidi-neutral character sitting next to an RTL run, so the Unicode bidi
 * algorithm resolves it to the RTL level and flushes it to the far side of the
 * digits — "-5,319.71" then renders as "5,319.71-", which reads as a positive
 * number at a glance. Outside the isolate it stays at the paragraph's own LTR
 * level and renders where it belongs, to the left of the number.
 */
export function formatAmount(
  symbol: string,
  locale: string,
  n: number,
  signOverride?: '+' | '-' | '',
): string {
  const safe = Number.isFinite(n) ? n : 0;
  const sign = signOverride ?? (safe < 0 ? '-' : '');
  const digits = Math.abs(safe).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${LRI}${symbol} ${digits}${PDI}`;
}

export { LRI, PDI };
