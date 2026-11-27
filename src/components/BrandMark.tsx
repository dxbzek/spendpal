// The SpendPal mark (2026-11-26): a speech bubble shaped like a P, with a
// coin for its hole. Spend is the coin, Pal is the bubble: an app that talks
// to you in plain words about your money. Transparent, so it sits on any
// background. tone="mono" draws it in currentColor for coloured bands.
import { useId } from 'react';

const BUBBLE =
  'M108 178c0-52 40-90 92-90h82c74 0 132 56 132 126s-58 126-132 126h-46c-20 0-38 8-52 22l-50 50c-10 10-26 3-26-11z';

interface BrandMarkProps {
  className?: string;
  tone?: 'brand' | 'mono';
  title?: string;
}

export const BrandMark = ({ className, tone = 'brand', title }: BrandMarkProps) => {
  const id = useId().replace(/:/g, '');
  const fill = tone === 'mono' ? 'currentColor' : `url(#${id}g)`;
  return (
    <svg
      viewBox="91 80 340 340"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9cfff" />
          <stop offset=".55" stopColor="#a48bff" />
          <stop offset="1" stopColor="#6d4dff" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect x="0" y="0" width="512" height="512" fill="#fff" />
          <circle cx="276" cy="214" r="50" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${id}m)`}>
        <path d={BUBBLE} fill={fill} />
        {tone === 'brand' && <path d={BUBBLE} fill={`url(#${id}h)`} />}
      </g>
    </svg>
  );
};

export default BrandMark;
