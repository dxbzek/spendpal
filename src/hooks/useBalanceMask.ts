import { useState, useEffect } from 'react';

const STORAGE_KEY = 'balanceHidden';
const EVENT_NAME = 'balanceMaskToggle';

export function useBalanceMask() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

  useEffect(() => {
    const handleCustom = (e: CustomEvent<boolean>) => setHidden(e.detail);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setHidden(e.newValue === 'true');
    };

    window.addEventListener(EVENT_NAME as keyof WindowEventMap, handleCustom as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(EVENT_NAME as keyof WindowEventMap, handleCustom as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const mask = (val: string) => (hidden ? '••••••' : val);
  return { hidden, mask };
}

export function dispatchBalanceMaskToggle(next: boolean) {
  localStorage.setItem(STORAGE_KEY, String(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
}
