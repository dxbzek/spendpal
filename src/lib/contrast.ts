// WCAG 2 contrast for the colour tokens in index.css, which are written as
// "H S% L%". Used by the tests that keep text tokens readable.

export type Rgb = [number, number, number];

/** "38 92% 50%" (an index.css token) to sRGB channels from 0 to 1. */
export function hslTokenToRgb(token: string): Rgb {
  const m = token.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`Not an HSL token: ${token}`);
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

/** `share` of `a` mixed into `b`, as CSS color-mix(in srgb, a share%, b). */
export function mixRgb(a: Rgb, b: Rgb, share: number): Rgb {
  return [0, 1, 2].map(i => a[i] * share + b[i] * (1 - share)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, from 1 to 21. Small text needs 4.5. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
