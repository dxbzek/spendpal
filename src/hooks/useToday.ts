import { useEffect, useState } from 'react';
import { dateKey, msUntilTomorrow } from '@/lib/today';

/**
 * Today's date (YYYY-MM-DD) that stays right while the app is open.
 *
 * An installed app is kept in memory for days. A date read once on mount made
 * Home leave out rows added the next day, and budgets kept last month's
 * spending on the 1st. This re-reads the clock at midnight and whenever the
 * app comes back to the front (a phone can sleep through the midnight timer).
 * The value only changes when the date does, so nothing re-renders in between.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => dateKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      setToday(dateKey(new Date()));
      clearTimeout(timer);
      // One second past midnight, so the clock has moved on when this fires.
      timer = setTimeout(check, msUntilTomorrow(new Date()) + 1000);
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  return today;
}
