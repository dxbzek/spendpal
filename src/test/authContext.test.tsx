// The auth context against a stand-in Supabase client: what it sends for a
// reset, a password change and a sign-up, and when it counts a session as a
// password recovery.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

type Listener = (event: string, session: unknown) => void;
const fake = vi.hoisted(() => {
  const state = { listener: null as Listener | null };
  const auth = {
    onAuthStateChange: vi.fn((cb: Listener) => { state.listener = cb; return { data: { subscription: { unsubscribe: () => {} } } }; }),
    getSession: vi.fn(async () => ({ data: { session: null } })),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(async () => ({ error: null })),
    resend: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
  };
  return { state, auth };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: fake.auth } }));

import { AuthProvider, useAuth, rereadAuthRedirect } from '@/context/AuthContext';
import { userSettings } from '@/lib/userSettings';
import { onSignOut } from '@/lib/signOutReset';

type Ctx = ReturnType<typeof useAuth>;
let ctx: Ctx;
const Probe = () => { ctx = useAuth(); return null; };
const mount = async () => {
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(ctx.loading).toBe(false));
};
const emit = (event: string, session: unknown) => act(() => { fake.state.listener!(event, session); });
/** Call a context function and let React settle. */
async function run<T>(call: () => Promise<T>): Promise<T> {
  let result!: T;
  await act(async () => { result = await call(); });
  return result;
}
const session = { user: { id: 'u1', email: 'sam@example.com', updated_at: '2026-11-14T00:00:00Z' } };
/** Put the tab at this address, as if the app had just been opened there. */
const openAt = (url: string) => { window.history.replaceState(null, '', url); rereadAuthRedirect(); };
const RESET_LINK = '/reset#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery';

beforeEach(() => {
  openAt('/');
  sessionStorage.clear();
  for (const fn of Object.values(fake.auth)) fn.mockClear();
  fake.auth.signInWithPassword.mockResolvedValue({ error: null });
  fake.auth.updateUser.mockResolvedValue({ error: null });
  fake.auth.signOut.mockResolvedValue({ error: null });
});

describe('password reset', () => {
  it('asks for a link that opens /reset on this site', async () => {
    await mount();
    await run(() => ctx.requestPasswordReset('sam@example.com'));
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('sam@example.com', { redirectTo: window.location.origin + '/reset' });
  });

  it('counts the session as a recovery from the reset link until it is ended', async () => {
    openAt(RESET_LINK);
    await mount();
    // Known from the address alone, before the client reports anything.
    expect(ctx.recovering).toBe(true);
    emit('PASSWORD_RECOVERY', session);
    expect(ctx.recovering).toBe(true);
    expect(ctx.user?.email).toBe('sam@example.com');
    // Survives a reload of the tab.
    expect(sessionStorage.getItem('spendpal_password_recovery')).toBe('1');
    act(() => ctx.endRecovery());
    expect(ctx.recovering).toBe(false);
    expect(sessionStorage.getItem('spendpal_password_recovery')).toBeNull();
  });

  it('does not pull a tab that was already open onto the reset page', async () => {
    // The client repeats PASSWORD_RECOVERY in every tab when the link opens in a new one.
    await mount();
    emit('PASSWORD_RECOVERY', session);
    expect(ctx.recovering).toBe(false);
    expect(ctx.user?.email).toBe('sam@example.com');
  });

  it('takes the event as the signal when the link style puts a code in the query', async () => {
    openAt('/reset?code=abc');
    await mount();
    expect(ctx.recovering).toBe(false);
    emit('PASSWORD_RECOVERY', session);
    expect(ctx.recovering).toBe(true);
  });

  it('reports an expired link', async () => {
    openAt('/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await mount();
    expect(ctx.linkFailed).toBe(true);
    expect(ctx.recovering).toBe(false);
  });

  it('picks the recovery back up after a reload, and drops it on sign-out', async () => {
    sessionStorage.setItem('spendpal_password_recovery', '1');
    await mount();
    expect(ctx.recovering).toBe(true);
    emit('SIGNED_OUT', null);
    expect(ctx.recovering).toBe(false);
    expect(sessionStorage.getItem('spendpal_password_recovery')).toBeNull();
  });

  it('a normal sign-in is not a recovery, and ends one left over in the tab', async () => {
    sessionStorage.setItem('spendpal_password_recovery', '1');
    await mount();
    await run(() => ctx.signIn('sam@example.com', 'correct horse'));
    emit('SIGNED_IN', session);
    expect(ctx.recovering).toBe(false);
  });
});

describe('setting a password', () => {
  it('saves the new password, then signs out the other devices', async () => {
    await mount();
    const result = await run(() => ctx.updatePassword('a new password'));
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'a new password' });
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(result).toEqual({ error: null, othersSignedOut: true });
  });

  it('does not sign anyone out when the password was not saved', async () => {
    const error = { code: 'same_password', message: 'New password should be different from the old password.' };
    fake.auth.updateUser.mockResolvedValue({ error });
    await mount();
    const result = await run(() => ctx.updatePassword('a new password'));
    expect(result).toEqual({ error, othersSignedOut: false });
    expect(fake.auth.signOut).not.toHaveBeenCalled();
  });

  it('checks the current password first and changes nothing when it is wrong', async () => {
    const error = { code: 'invalid_credentials', message: 'Invalid login credentials' };
    fake.auth.signInWithPassword.mockResolvedValue({ error });
    await mount();
    emit('SIGNED_IN', session);
    const result = await run(() => ctx.changePassword('wrong one', 'a new password'));
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'wrong one' });
    expect(result).toEqual({ error, step: 'current', othersSignedOut: false });
    expect(fake.auth.updateUser).not.toHaveBeenCalled();
  });

  it('changes the password when the current one is right', async () => {
    await mount();
    emit('SIGNED_IN', session);
    const result = await run(() => ctx.changePassword('correct horse', 'a new password'));
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'a new password' });
    expect(result).toEqual({ error: null, step: 'new', othersSignedOut: true });
  });
});

describe('sign up', () => {
  it('reports what the server did, not a fixed "you can now sign in"', async () => {
    await mount();
    fake.auth.signUp.mockResolvedValueOnce({ data: { session: { access_token: 't' }, user: { identities: [{}] } }, error: null });
    expect(await run(() => ctx.signUp('sam@example.com', 'correct horse'))).toEqual({ error: null, outcome: 'signed_in' });
    fake.auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { identities: [{}] } }, error: null });
    expect(await run(() => ctx.signUp('sam@example.com', 'correct horse'))).toEqual({ error: null, outcome: 'confirm_email' });
    fake.auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { identities: [] } }, error: null });
    expect(await run(() => ctx.signUp('sam@example.com', 'correct horse'))).toEqual({ error: null, outcome: 'exists' });
  });

  it('hands back a thrown failure as an error, so the page can word it', async () => {
    await mount();
    const boom = new TypeError('Failed to fetch');
    fake.auth.signUp.mockRejectedValueOnce(boom);
    expect(await run(() => ctx.signUp('sam@example.com', 'correct horse'))).toEqual({ error: boom, outcome: null });
    fake.auth.signInWithPassword.mockRejectedValueOnce(boom);
    expect(await run(() => ctx.signIn('sam@example.com', 'correct horse'))).toEqual({ error: boom });
  });

  it('resends the confirmation email for a sign-up', async () => {
    await mount();
    await run(() => ctx.resendConfirmation('sam@example.com'));
    expect(fake.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'sam@example.com', options: { emailRedirectTo: window.location.origin } });
  });
});

describe('sign-out and the next user', () => {
  it("loads the user's settings on sign-in and forgets them on sign-out", async () => {
    await mount();
    emit('SIGNED_IN', session);
    await waitFor(() => expect(userSettings.getSnapshot().userId).toBe('u1'));
    act(() => userSettings.set('monthly_income', 10000));

    emit('SIGNED_OUT', null);
    expect(userSettings.getSnapshot()).toMatchObject({ userId: null, data: {} });
  });

  it('sends a waiting settings change before signing out', async () => {
    await mount();
    emit('SIGNED_IN', session);
    await waitFor(() => expect(userSettings.getSnapshot().userId).toBe('u1'));
    const order: string[] = [];
    const flush = vi.spyOn(userSettings, 'flush').mockImplementation(async () => { order.push('flush'); return true; });
    fake.auth.signOut.mockImplementationOnce(async () => { order.push('signOut'); return { error: null }; });
    await run(() => ctx.signOut());
    expect(order).toEqual(['flush', 'signOut']);
    expect(userSettings.getSnapshot().userId).toBeNull();
    flush.mockRestore();
  });

  it('keeps the settings when the sign-out did not reach the server', async () => {
    await mount();
    emit('SIGNED_IN', session);
    await waitFor(() => expect(userSettings.getSnapshot().userId).toBe('u1'));
    act(() => userSettings.set('monthly_income', 10000));
    // auth-js keeps the session on a network error and fires no SIGNED_OUT.
    fake.auth.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch', name: 'AuthRetryableFetchError' } as never });
    let result: { error: unknown } | undefined;
    await run(async () => { result = await ctx.signOut(); });
    expect(result?.error).toBeTruthy();
    expect(userSettings.getSnapshot()).toMatchObject({ userId: 'u1', data: { monthly_income: 10000 } });
    // A change made now is still kept.
    act(() => userSettings.set('payday_day', 25));
    expect(userSettings.get('payday_day')).toBe(25);
  });

  it('runs the sign-out resets when another user signs in', async () => {
    const reset = vi.fn();
    const off = onSignOut(reset);
    await mount();
    emit('SIGNED_IN', session);
    await waitFor(() => expect(userSettings.getSnapshot().userId).toBe('u1'));
    emit('SIGNED_IN', { user: { id: 'u2', email: 'kim@example.com', updated_at: '2026-11-14T00:00:00Z' } });
    await waitFor(() => expect(userSettings.getSnapshot().userId).toBe('u2'));
    expect(reset).toHaveBeenCalled();
    off();
  });
});
