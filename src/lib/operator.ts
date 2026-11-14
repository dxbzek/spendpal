// Who runs SpendPal and how to reach them. The Privacy and Terms pages read
// these fields and nothing else, so the owner fills them in here, once.
//
// They are empty on purpose: nobody may guess a name, an address, a country or
// a court for the owner. While a field is empty the pages say so plainly.

export interface Operator {
  /** The person or company that runs the service, as it should appear to users. */
  name: string;
  /** The country the operator is based in. */
  country: string;
  /** An inbox someone reads, for privacy requests and support. */
  contactEmail: string;
  /**
   * The law the Terms are under, written out in full, for example
   * "the laws of the Emirate of Dubai and the federal laws of the UAE".
   * A lawyer or the owner sets this; it is not worked out from `country`.
   */
  governingLaw: string;
}

export const OPERATOR: Operator = {
  name: '',
  country: '',
  contactEmail: '',
  governingLaw: '',
};

/** Shown in place of any operator detail that is not filled in yet. */
export const OPERATOR_PENDING = 'Contact details will be added here before sign-up opens to the public.';
/** Shown in the Terms while governingLaw is empty. */
export const GOVERNING_LAW_PENDING = 'The governing law will be added here before sign-up opens to the public.';

export interface OperatorLine {
  label: string;
  value: string;
  /** Set when the value is an email address, so the page can link it. */
  href?: string;
}

const filled = (s: string | undefined) => (s ?? '').trim();

/**
 * The operator details a page shows, in order, and whether any are missing.
 * Missing ones are left out, never filled with a placeholder name or address;
 * the page shows OPERATOR_PENDING once instead.
 */
export function operatorLines(op: Operator): { lines: OperatorLine[]; incomplete: boolean } {
  const lines: OperatorLine[] = [];
  const name = filled(op.name);
  const country = filled(op.country);
  const email = filled(op.contactEmail);
  if (name) lines.push({ label: 'Run by', value: name });
  if (country) lines.push({ label: 'Based in', value: country });
  if (email) lines.push({ label: 'Contact', value: email, href: `mailto:${email}` });
  return { lines, incomplete: !name || !country || !email };
}

/** The contact address, or null while there is none. */
export function contactEmail(op: Operator): string | null {
  return filled(op.contactEmail) || null;
}

/** The governing-law sentence for the Terms, or null while it is not set. */
export function governingLawLine(op: Operator): string | null {
  const law = filled(op.governingLaw);
  return law ? `These terms are governed by ${law.replace(/\.$/, '')}.` : null;
}
