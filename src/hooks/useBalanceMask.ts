import { useState, useEffect, useCallback } from 'react';
import { useSettingsUserId } from '@/hooks/useUserSettings';
import { browserStorage, readUserItem, userKey, writeUserItem } from '@/lib/userStorage';

// A choice for this device, but per user: kept under the user's own key, so
// the next account on this browser does not start with the last one's
// choice. The value under the old fixed name moves to the first user.
const NAME = 'balance_hidden';
const LEGACY_KEY = 'balanceHidden';
const EVENT_NAME = 'balanceMaskToggle';

const readHidden = (userId: string | null) =>
  !!userId && readUserItem(browserStorage(), userId, NAME, LEGACY_KEY) === 'true';

export function useBalanceMask() {
  const userId = useSettingsUserId();
  const [hidden, setHidden] = useState(() => readHidden(userId));

  useEffect(() => {
    setHidden(readHidden(userId));
    const handleCustom = (e: CustomEvent<boolean>) => setHidden(e.detail);
    const handleStorage = (e: StorageEvent) => {
      if (userId && e.key === userKey(userId, NAME)) setHidden(e.newValue === 'true');
    };

    window.addEventListener(EVENT_NAME as keyof WindowEventMap, handleCustom as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(EVENT_NAME as keyof WindowEventMap, handleCustom as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, [userId]);

  // Stable across renders (changes only when `hidden` flips) so memoized
  // consumers that receive `mask` as a prop aren't re-rendered needlessly.
  const mask = useCallback((val: string) => (hidden ? '••••••' : val), [hidden]);
  /** Show or hide balances on every open page. */
  const setBalancesHidden = useCallback((next: boolean) => {
    if (userId) writeUserItem(browserStorage(), userId, NAME, String(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }, [userId]);
  return { hidden, mask, setBalancesHidden };
}
