import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
}

export const Spinner = ({ className }: SpinnerProps) => (
  <div className={cn('w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin', className)} />
);

export const PageSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <Spinner />
  </div>
);
