import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  answer: { data: [{ user_id: 'u1' }] as unknown, error: null as unknown },
  updates: [] as unknown[],
}));
const setCurrency = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    update: (v: unknown) => { db.updates.push(v); return chain; },
    eq: () => chain,
    select: () => Promise.resolve(db.answer),
  };
  return { supabase: { from: () => chain } };
});
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/context/CurrencyContext', () => ({ useCurrency: () => ({ setCurrency }) }));

import CurrencyStep from '@/components/onboarding/CurrencyStep';
import GettingStartedCard from '@/components/dashboard/GettingStartedCard';
import { checklistSteps } from '@/lib/onboarding';
import { userSettings } from '@/lib/userSettings';

describe('CurrencyStep', () => {
  beforeEach(() => {
    db.updates = [];
    db.answer = { data: [{ user_id: 'u1' }], error: null };
    setCurrency.mockReset();
    localStorage.clear();
    // No settings backend here: the store keeps the value in memory and in
    // this user's browser copy, which is what Home reads.
    void userSettings.start('u1');
  });
  afterEach(() => userSettings.stop());

  it('saves the preselected currency to the profile before moving on', async () => {
    const onSaved = vi.fn();
    render(<CurrencyStep onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.updates).toHaveLength(1);
    const saved = (db.updates[0] as { currency: string }).currency;
    expect(saved).toMatch(/^[A-Z]{3}$/);
    expect(setCurrency).toHaveBeenCalledWith(saved);
    expect(userSettings.get('currency_confirmed')).toBe(true);
  });

  it('stays on the step when the save fails', async () => {
    db.answer = { data: null, error: { message: 'offline' } };
    const onSaved = vi.fn();
    render(<CurrencyStep onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(db.updates).toHaveLength(1));
    expect(onSaved).not.toHaveBeenCalled();
    expect(setCurrency).not.toHaveBeenCalled();
    expect(userSettings.get('currency_confirmed')).toBeUndefined();
  });
});

describe('GettingStartedCard', () => {
  it('makes each step not done yet a button that starts it', () => {
    const onStep = vi.fn();
    render(<GettingStartedCard steps={checklistSteps({ accounts: 1, transactions: 0, budgets: 0, goals: 0 })} onStep={onStep} onDismiss={() => {}} />);
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add your first account/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Record a transaction/ }));
    fireEvent.click(screen.getByRole('button', { name: /Create a budget/ }));
    fireEvent.click(screen.getByRole('button', { name: /Set a savings goal/ }));
    expect(onStep.mock.calls.map(c => c[0])).toEqual(['transaction', 'budget', 'goal']);
  });

  it('can be hidden', () => {
    const onDismiss = vi.fn();
    render(<GettingStartedCard steps={checklistSteps({ accounts: 1, transactions: 0, budgets: 0, goals: 0 })} onStep={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide getting started' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
