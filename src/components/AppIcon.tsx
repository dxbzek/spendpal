import { cn } from '@/lib/utils';
import { iconFor } from '@/lib/appIcons';

interface AppIconProps {
  /** A stored icon value (an emoji). */
  value: string | null | undefined;
  className?: string;
}

/** Draws a stored category/account/goal icon as a line icon sized to the surrounding text. */
const AppIcon = ({ value, className }: AppIconProps) => {
  const Icon = iconFor(value);
  return <Icon aria-hidden="true" size="1em" strokeWidth={1.75} className={cn('inline-block shrink-0 align-[-0.125em]', className)} />;
};

export default AppIcon;
