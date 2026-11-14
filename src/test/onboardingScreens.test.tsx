import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { checklistSteps, currencyConfirmedKey } from '@/lib/onboarding';

describe('CurrencyStep', () => {
  beforeEach(() => {
    db.updates = [];
    db.answer = { data: [{ user_id: 'u1' }], error: null };
    setCurrency.mockReset();
    localStorage.clear();
  });

  it('saves the preselected currency to the profile before moving on', async () => {
    const onSaved = vi.fn();
    render(<CurrencyStep onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.updates).toHaveLength(1);
    const saved = (db.updates[0] as { currency: string }).currency;
    expect(saved).toMatch(/^[A-Z]{3}$/);
    expect(setCurrency).toHaveBeenCalledWith(saved);
    expect(localStorage.getItem(currencyConfirmedKey('u1'))).toBe('1');
  });

  it('stays on the step when the save fails', async () => {
    db.answer = { data: null, error: { message: 'offline' } };
    const onSaved = vi.fn();
    render(<CurrencyStep onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(db.updates).toHaveLength(1));
    expect(onSaved).not.toHaveBeenCalled();
    expect(setCurrency).not.toHaveBeenCalled();
    expect(localStorage.getItem(currencyConfirmedKey('u1'))).toBeNull();
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
