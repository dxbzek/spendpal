/**
 * Normalize a free-form date string (as found in bank statements / AI-extracted
 * rows) into ISO `YYYY-MM-DD`. Handles ISO, slash/dash numeric formats, and
 * textual month names. Ambiguous numeric dates are interpreted as day-first
 * (DMY), matching the statement formats SpendPal targets. If the input can't be
 * recognized, the (time-stripped) input is returned unchanged.
 */
export function normalizeDate(d: string): string {
  // Strip any trailing time component (e.g. "23/03/2026 14:30:00", "2026-03-23T08:00:00Z")
  const stripped = d.trim().replace(/[\sT]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/, '').trim();

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(stripped)) return stripped;

  // YYYY/MM/DD
  const isoSlash = stripped.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (isoSlash) return `${isoSlash[1]}-${isoSlash[2]}-${isoSlash[3]}`;

  const MONTHS: Record<string, string> = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
    january:'01', february:'02', march:'03', april:'04', june:'06',
    july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
  };
  const toYear = (y: string) => y.length === 2 ? `20${y}` : y;
  const pad = (n: string) => n.padStart(2, '0');

  // DD-Mon-YYYY or DD-Mon-YY (e.g. "23-Mar-2026", "23-Mar-26")
  const dmtSep = stripped.match(/^(\d{1,2})[-]([A-Za-z]+)[-](\d{2,4})$/);
  if (dmtSep) { const mo = MONTHS[dmtSep[2].toLowerCase()]; if (mo) return `${toYear(dmtSep[3])}-${mo}-${pad(dmtSep[1])}`; }

  // DD Mon YYYY or DD Mon YY (e.g. "23 Mar 2026", "5 Jan 26")
  const dmtSpace = stripped.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (dmtSpace) { const mo = MONTHS[dmtSpace[2].toLowerCase()]; if (mo) return `${toYear(dmtSpace[3])}-${mo}-${pad(dmtSpace[1])}`; }

  // Mon DD, YYYY or Month DD YYYY (e.g. "Mar 23, 2026", "March 23 2026")
  const mdtSpace = stripped.match(/^([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{2,4})$/);
  if (mdtSpace) { const mo = MONTHS[mdtSpace[1].toLowerCase()]; if (mo) return `${toYear(mdtSpace[3])}-${mo}-${pad(mdtSpace[2])}`; }

  // DD/MM/YYYY or DD-MM-YYYY (strict 2-digit day+month, 4-digit year) - DMY
  const dmy4 = stripped.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy4) return `${dmy4[3]}-${dmy4[2]}-${dmy4[1]}`;

  // DD/MM/YY or DD-MM-YY (2-digit year) - DMY
  const dmy2 = stripped.match(/^(\d{2})[/-](\d{2})[/-](\d{2})$/);
  if (dmy2) return `${toYear(dmy2[3])}-${dmy2[2]}-${dmy2[1]}`;

  // D/M/YYYY or D/M/YY with single-digit day or month - DMY fallback
  const dmyLoose = stripped.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyLoose) return `${toYear(dmyLoose[3])}-${pad(dmyLoose[2])}-${pad(dmyLoose[1])}`;

  return stripped;
}
