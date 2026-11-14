import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConvertCurrencyDialog from '@/components/settings/ConvertCurrencyDialog';
import { userSettings } from '@/lib/userSettings';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Opens the dialog and waits for today's rate to be filled in. */
const open = async (onDone = vi.fn(), allowRelabel = true) => {
  render(
    <ConvertCurrencyDialog open from="AED" to="USD" allowRelabel={allowRelabel} onDone={onDone} onCancel={() => {}} />,
  );
  await screen.findByDisplayValue('0.2723');
  return onDone;
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ error: null });
  // The dialog looks up today's rate; the test supplies it.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { USD: 0.2723 } }) }));
  localStorage.clear();
  userSettings.stop();
});
afterEach(() => { vi.unstubAllGlobals(); userSettings.stop(); });

describe('ConvertCurrencyDialog', () => {
  // Regression: "Only change the symbol" saved the new currency on the profile
  // and left every account and transaction in the old one, so each total added
  // two currencies together under one symbol.
  it('has no way to change the symbol and leave the stored amounts behind', async () => {
    await open();
    expect(screen.queryByText(/only change the symbol/i)).toBeNull();
  });

  it('moves every row to the new currency at a rate of 1 when the amounts were already in it', async () => {
    const onDone = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Amounts are already in USD' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('convert_currency', { p_from: 'AED', p_to: 'USD', p_rate: 1 });
  });

  it('converts at the rate shown', async () => {
    const onDone = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Convert amounts' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(rpc).toHaveBeenCalledWith('convert_currency', { p_from: 'AED', p_to: 'USD', p_rate: 0.2723 });
  });

  it('keeps the monthly income figure as it is when only the currency code changes', async () => {
    await userSettings.start('u1');
    userSettings.set('monthly_income', 10000);
    const onDone = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Amounts are already in USD' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(userSettings.get('monthly_income')).toBe(10000);
  });

  // The income, goal and templates used to stay in AED under the new symbol
  // (only the browser's income figure was converted).
  it('converts the saved income, net worth goal and budget templates at the rate', async () => {
    await userSettings.start('u1');
    userSettings.update({
      monthly_income: 10000, net_worth_goal: 50000,
      budget_templates: [{ name: 'T', savedAt: '', items: [{ category: 'Food', categoryIcon: '', amount: 1200, period: 'monthly' }] }],
    });
    const onDone = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Convert amounts' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(userSettings.get('monthly_income')).toBe(2723);
    expect(userSettings.get('net_worth_goal')).toBe(13615);
    expect(userSettings.get('budget_templates')![0].items[0].amount).toBe(326.76);
  });

  it('never reports done when the database refuses', async () => {
    rpc.mockResolvedValue({ error: { message: 'not signed in' } });
    const onDone = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Amounts are already in USD' }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('offers only a conversion when old data is being fixed', async () => {
    await open(vi.fn(), false);
    expect(screen.queryByRole('button', { name: 'Amounts are already in USD' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Convert amounts' })).toBeInTheDocument();
  });
});
