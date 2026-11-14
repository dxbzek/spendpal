// Settings > Danger Zone. A delete that could not run must say so and remove nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const del = vi.hoisted(() => ({
  deleteEverything: vi.fn(async () => {}),
  deleteAccount: vi.fn(async (): Promise<string> => 'deleted'),
  clearLocalData: vi.fn(),
}));
vi.mock('@/lib/accountDeletion', () => del);

const db = vi.hoisted(() => {
  const signOut = vi.fn(async () => ({ error: null }));
  // Every query the page makes on load resolves to "no row".
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'update', 'delete', 'single']) query[m] = () => query;
  query.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
  const from = vi.fn(() => query);
  return { signOut, from, supabase: { from, auth: { signOut } } };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: db.supabase }));

const auth = vi.hoisted(() => ({ user: { id: 'u1', email: 'sam@example.com' }, signOut: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

const refresh = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/context/FinanceContext', () => ({
  useFinance: () => ({ accounts: [{ id: 'a1', currency: 'AED' }], transactions: [{ id: 't1' }, { id: 't2' }], budgets: [], goals: [], refresh }),
}));
vi.mock('@/context/CurrencyContext', () => ({
  useCurrency: () => ({ currency: 'AED', setCurrency: () => {}, secondaryCurrency: null, setSecondaryCurrency: () => {} }),
}));
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggle: () => {} }) }));
// Not under test, and each pulls in half the app.
vi.mock('@/components/settings/CategoryManager', () => ({ default: () => null }));
vi.mock('@/components/settings/ConvertCurrencyDialog', () => ({ default: () => null }));
vi.mock('@/components/reports/MonthlyReportPrint', () => ({ default: () => null }));
vi.mock('@/components/settings/ChangePasswordCard', () => ({ default: () => null }));

import Settings from '@/pages/Settings';

const open = async () => {
  render(<MemoryRouter><Settings /></MemoryRouter>);
  await screen.findByText('Danger Zone');
};

/** Open a Danger Zone dialog, type the confirmation, press the red button. */
const confirmDelete = (openButton: RegExp, confirmButton: RegExp, typed = 'DELETE') => {
  fireEvent.click(screen.getByRole('button', { name: openButton }));
  fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: typed } });
  fireEvent.click(screen.getByRole('button', { name: confirmButton }));
};

beforeEach(() => {
  for (const fn of [toast.error, toast.success, del.deleteEverything, del.deleteAccount, del.clearLocalData,
    db.signOut, db.from, refresh]) fn.mockClear();
  del.deleteEverything.mockResolvedValue(undefined);
  db.signOut.mockResolvedValue({ error: null });
});

describe('Delete my account', () => {
  it('needs the typed DELETE, like the other deletes', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('sam@example.com');
    const confirm = screen.getByRole('button', { name: /yes, delete my account/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'delete' } });
    expect(confirm).toBeDisabled();
    expect(del.deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes through the server, clears this browser, then signs out', async () => {
    del.deleteAccount.mockResolvedValue('deleted');
    await open();
    confirmDelete(/delete my account/i, /yes, delete my account/i);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Your account was deleted.'));
    expect(del.deleteAccount).toHaveBeenCalledWith(db.supabase);
    expect(del.clearLocalData).toHaveBeenCalledWith(localStorage, { account: true });
    expect(db.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('deletes nothing and says so when the server cannot do it yet', async () => {
    del.deleteAccount.mockResolvedValue('unavailable');
    await open();
    db.from.mockClear();
    confirmDelete(/delete my account/i, /yes, delete my account/i);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Account deletion is not available yet. Nothing was deleted.'));
    // No table was touched, no local data cleared, still signed in.
    expect(db.from).not.toHaveBeenCalled();
    expect(del.deleteEverything).not.toHaveBeenCalled();
    expect(del.clearLocalData).not.toHaveBeenCalled();
    expect(db.signOut).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps the user signed in when the server failed or could not be reached', async () => {
    del.deleteAccount.mockResolvedValue('failed');
    await open();
    confirmDelete(/delete my account/i, /yes, delete my account/i);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Account deletion failed. Your account still exists. Try again.'));

    del.deleteAccount.mockResolvedValue('unreachable');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    confirmDelete(/delete my account/i, /yes, delete my account/i);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Check your connection and try again.'));
    expect(db.signOut).not.toHaveBeenCalled();
    expect(del.clearLocalData).not.toHaveBeenCalled();
  });
});

describe('Delete Everything', () => {
  // jsdom cannot load a page, and says so on the console when asked to.
  let quiet: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => quiet.mockRestore());

  it('says what it removes and what stays', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('1 accounts, 2 transactions, 0 budgets and 0 goals');
    expect(dialog).toHaveTextContent(/custom categories, advisor history, name and phone number/);
    expect(dialog).toHaveTextContent('Your sign-in and profile photo stay.');
  });

  it('removes the server data and the lists kept in this browser', async () => {
    await open();
    confirmDelete(/delete everything/i, /yes, delete everything/i);
    await waitFor(() => expect(del.deleteEverything).toHaveBeenCalledWith(db.supabase, 'u1'));
    await waitFor(() => expect(del.clearLocalData).toHaveBeenCalledWith(localStorage));
    expect(del.deleteAccount).not.toHaveBeenCalled();
    expect(db.signOut).not.toHaveBeenCalled();
  });

  it('reports a failure and shows what is left', async () => {
    del.deleteEverything.mockRejectedValue(new Error('goals: permission denied'));
    await open();
    confirmDelete(/delete everything/i, /yes, delete everything/i);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Delete failed: goals: permission denied'));
    expect(del.clearLocalData).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
