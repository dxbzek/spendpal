// What one account leaves in memory or in this browser must never reach the
// next account that signs in on the same browser.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/context/FinanceContext', () => ({ useFinance: () => ({ transactions: [], budgets: [] }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Each custom_categories request waits until the test answers it.
const db = vi.hoisted(() => {
  const pending: Array<{ userId: string; answer: (rows: unknown[]) => void }> = [];
  const from = () => {
    let userId = '';
    const q = {
      select: () => q,
      eq: (_k: string, v: string) => { userId = v; return q; },
      order: () => new Promise(res => { pending.push({ userId, answer: rows => res({ data: rows, error: null }) }); }),
    };
    return q;
  };
  return { pending, supabase: { from } };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: db.supabase }));

import { useCategories, resetCategoryCache } from '@/hooks/useCategories';
import { useBalanceMask } from '@/hooks/useBalanceMask';
import { runSignOutResets } from '@/lib/signOutReset';
import { userSettings } from '@/lib/userSettings';
import { userKey } from '@/lib/userStorage';

const row = (name: string) => ({ id: name, name, icon: 'x', type: 'expense', original_name: null });

beforeEach(() => {
  resetCategoryCache();
  db.pending.length = 0;
  localStorage.clear();
  userSettings.stop();
});

describe('custom categories', () => {
  it("never shows A's list to B when A's request answers after the sign-out", async () => {
    auth.user = { id: 'A' };
    const a = renderHook(() => useCategories());
    await waitFor(() => expect(db.pending).toHaveLength(1));
    a.unmount();

    // A signs out, B signs in; B's own request is still out.
    runSignOutResets();
    auth.user = { id: 'B' };
    const b = renderHook(() => useCategories());
    await waitFor(() => expect(db.pending).toHaveLength(2));

    await act(async () => { db.pending[0].answer([row('Therapy')]); });
    expect(b.result.current.customCategories).toEqual([]);

    await act(async () => { db.pending[1].answer([row('Gym')]); });
    expect(b.result.current.customCategories.map(c => c.name)).toEqual(['Gym']);
  });

  it('forgets the shared copy on sign-out', async () => {
    auth.user = { id: 'A' };
    const a = renderHook(() => useCategories());
    await waitFor(() => expect(db.pending).toHaveLength(1));
    await act(async () => { db.pending[0].answer([row('Therapy')]); });
    a.unmount();
    runSignOutResets();
    // A signs in again: the list is fetched, not served from memory.
    renderHook(() => useCategories());
    await waitFor(() => expect(db.pending).toHaveLength(2));
  });
});

describe('hide balances', () => {
  it("is kept per user: B does not start with A's choice", async () => {
    await act(async () => { await userSettings.start('A'); });
    const { result } = renderHook(() => useBalanceMask());
    act(() => result.current.setBalancesHidden(true));
    expect(result.current.hidden).toBe(true);
    expect(localStorage.getItem(userKey('A', 'balance_hidden'))).toBe('true');

    await act(async () => { userSettings.stop(); await userSettings.start('B'); });
    expect(result.current.hidden).toBe(false);
    expect(result.current.mask('100')).toBe('100');

    await act(async () => { userSettings.stop(); await userSettings.start('A'); });
    expect(result.current.hidden).toBe(true);
  });

  it('moves the old shared choice to the first user, once', async () => {
    localStorage.setItem('balanceHidden', 'true');
    await act(async () => { await userSettings.start('A'); });
    const { result } = renderHook(() => useBalanceMask());
    expect(result.current.hidden).toBe(true);
    expect(localStorage.getItem('balanceHidden')).toBeNull();

    await act(async () => { userSettings.stop(); await userSettings.start('B'); });
    expect(result.current.hidden).toBe(false);
  });
});
