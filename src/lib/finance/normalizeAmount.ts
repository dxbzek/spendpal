// Free-form money text to a clean decimal string that parseFloat reads
// correctly. Pure, so every separator case is unit-tested.
//
// A comma or a dot can be a decimal mark or a thousands separator. Turning
// every comma into a dot saved "20,000" as 20, so the meaning is decided by
// where the separators sit:
//   - both kinds present: the one written last is the decimal mark
//     ("1,234.50" and "1.234,50" are both 1234.50)
//   - commas only, in whole groups of three ("20,000", "1,234,567"):
//     thousands separators
//   - dots only, repeated, in whole groups of three ("1.234.567"): thousands
//     separators. One dot alone is always a decimal ("1.234" stays 1.234).
//   - one kind repeated, with groups of two or three between them (Indian
//     lakh grouping, "1,50,000" and "12,34,567"): thousands separators when
//     the last group has three digits; with one or two digits after the last
//     one ("1,234,56") that last one is the decimal. Two commas cannot both
//     be decimals, and reading the first as one saved 150,000 as 1.50.
//   - anything else: the first separator is the decimal ("1,50" is 1.50) and
//     extra ones are dropped ("1.2.3" is 1.23)

/** Keeps the first dot as the decimal point and drops any later ones. */
const firstDotOnly = (s: string): string => {
  const i = s.indexOf('.');
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
};

/** "1" + "234" + "567": a leading group of 1 to 3 digits, then groups of exactly 3. */
const isGrouped = (groups: string[]): boolean =>
  groups.length > 1 && /^[1-9][0-9]{0,2}$/.test(groups[0]) && groups.slice(1).every(g => /^[0-9]{3}$/.test(g));

/** Indian or western grouping: a leading group of 1 to 3 digits, then groups of 2 or 3 between the separators. */
const isLooselyGrouped = (groups: string[]): boolean =>
  groups.length > 2 && /^[1-9][0-9]{0,2}$/.test(groups[0]) && groups.slice(1, -1).every(g => /^[0-9]{2,3}$/.test(g));

export interface NormalizeAmountOptions {
  /** Keep a leading minus (an overdrawn account, a card in credit). */
  allowNegative?: boolean;
}

/**
 * Normalizes typed or pasted money text to a plain decimal string such as
 * "1234.50". Letters, spaces and currency symbols are dropped. An unfinished
 * entry stays unfinished ("12." stays "12."), so it can run on every keystroke.
 */
export function normalizeAmount(raw: string, options: NormalizeAmountOptions = {}): string {
  const sign = options.allowNegative && /^\s*[-−]/.test(raw) ? '-' : '';
  const s = raw.replace(/[^0-9.,]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (!hasComma && !hasDot) return sign + s;

  if (hasComma && hasDot) {
    const decimalIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
    const withoutGroups = s.replace(decimalIsComma ? /\./g : /,/g, '');
    return sign + firstDotOnly(withoutGroups.replace(/,/g, '.'));
  }

  const groups = s.split(hasComma ? ',' : '.');
  // One dot alone is a decimal even when three digits follow it.
  if (isGrouped(groups) && (hasComma || groups.length > 2)) return sign + groups.join('');
  if (isLooselyGrouped(groups)) {
    const last = groups[groups.length - 1];
    const whole = groups.slice(0, -1).join('');
    if (/^[0-9]{3}$/.test(last)) return sign + whole + last;
    if (/^[0-9]{1,2}$/.test(last)) return sign + whole + '.' + last;
  }
  return sign + firstDotOnly(s.replace(/,/g, '.'));
}

/**
 * A balance field's text as a number, or null when it is not one. An empty
 * field is 0. A negative figure is valid: a bank account can be overdrawn and
 * a card can be in credit (a refund larger than what is owed), and refusing it
 * blocked every edit of such an account.
 */
export function parseBalance(text: string): number | null {
  if (text.trim() === '') return 0;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}
