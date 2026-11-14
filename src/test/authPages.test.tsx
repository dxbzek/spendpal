// The sign-in page and the reset page, driven through a stand-in for the auth
// context: what each one says for each answer from the server.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }));

import AuthPage from '@/pages/AuthPage';
import ResetPassword from '@/pages/ResetPassword';

const ok = { error: null };
const setAuth = (over: Record<string, unknown> = {}) => {
  auth.current = {
    user: null,
    loading: false,
    recovering: false,
    linkFailed: false,
    signIn: vi.fn(async () => ok),
    signUp: vi.fn(async () => ({ error: null, outcome: 'signed_in' })),
    resendConfirmation: vi.fn(async () => ok),
    requestPasswordReset: vi.fn(async () => ok),
    updatePassword: vi.fn(async () => ({ error: null, othersSignedOut: true })),
    endRecovery: vi.fn(),
    ...over,
  };
  return auth.current as Record<string, ReturnType<typeof vi.fn>>;
};

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const renderAt = (path: string, state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/" element={<Where />} />
        <Route path="/settings" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
// "Sign In" is on the tab and on the submit button, so the form is submitted directly.
const submit = () => fireEvent.submit(screen.getByLabelText(/email address/i).closest('form')!);
const fillAndSubmit = (password = 'correct horse') => {
  type(/email address/i, 'sam@example.com');
  type(/^password$/i, password);
  submit();
};

beforeEach(() => {
  toast.error.mockClear();
  toast.success.mockClear();
});

describe('sign in', () => {
  const signInFailing = (error: Record<string, unknown>) => setAuth({ signIn: vi.fn(async () => ({ error })) });

  it('says "wrong email or password" only for wrong credentials', async () => {
    signInFailing({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 });
    renderAt('/auth');
    fillAndSubmit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Wrong email or password.'));
  });

  it('says there is no connection when the request never got out', async () => {
    signInFailing({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 });
    renderAt('/auth');
    fillAndSubmit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Check your connection and try again.'));
  });

  it('says to wait when rate limited', async () => {
    signInFailing({ code: 'over_request_rate_limit', message: 'Request rate limit reached', status: 429 });
    renderAt('/auth');
    fillAndSubmit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Too many attempts. Wait a minute, then try again.'));
  });

  it('offers the confirmation email again when the address is not confirmed', async () => {
    const a = signInFailing({ code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 });
    renderAt('/auth');
    fillAndSubmit();
    expect(await screen.findByText(/confirm your email first/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /resend email/i }));
    await waitFor(() => expect(a.resendConfirmation).toHaveBeenCalledWith('sam@example.com'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Email sent again.'));
  });

  it('does not hold an existing short password to the new-password rule', () => {
    setAuth();
    renderAt('/auth');
    expect(screen.getByLabelText(/^password$/i)).not.toHaveAttribute('minlength');
  });
});

describe('sign up', () => {
  const openSignUp = () => fireEvent.click(screen.getAllByRole('button', { name: /^sign up$/i })[0]);

  it('does not tell a signed-in user to sign in', async () => {
    const a = setAuth({ signUp: vi.fn(async () => ({ error: null, outcome: 'signed_in' })) });
    renderAt('/auth');
    openSignUp();
    fillAndSubmit();
    await waitFor(() => expect(a.signUp).toHaveBeenCalledWith('sam@example.com', 'correct horse'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Account created. You are signed in.'));
    expect(screen.queryByText(/check your inbox/i)).toBeNull();
  });

  it('sends the user to their inbox when the email must be confirmed, with a resend', async () => {
    const a = setAuth({ signUp: vi.fn(async () => ({ error: null, outcome: 'confirm_email' })) });
    renderAt('/auth');
    openSignUp();
    fillAndSubmit();
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /resend email/i }));
    await waitFor(() => expect(a.resendConfirmation).toHaveBeenCalledWith('sam@example.com'));
  });

  it('says the address is taken, with or without an error from the server', async () => {
    setAuth({ signUp: vi.fn(async () => ({ error: null, outcome: 'exists' })) });
    const first = renderAt('/auth');
    openSignUp();
    fillAndSubmit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This email already has an account. Sign in, or reset your password.'));
    first.unmount();
    toast.error.mockClear();

    setAuth({ signUp: vi.fn(async () => ({ error: { code: 'user_already_exists', message: 'User already registered', status: 422 }, outcome: null })) });
    renderAt('/auth');
    openSignUp();
    fillAndSubmit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This email already has an account. Sign in, or reset your password.'));
  });

  it('states the password rule next to the field', () => {
    setAuth();
    renderAt('/auth');
    openSignUp();
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('minlength', '8');
  });
});

describe('forgot password', () => {
  it('emails a reset link from the sign-in page', async () => {
    const a = setAuth();
    renderAt('/auth');
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(screen.queryByLabelText(/^password$/i)).toBeNull();
    type(/email address/i, '  sam@example.com ');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(a.requestPasswordReset).toHaveBeenCalledWith('sam@example.com'));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    // True whether or not the address has an account.
    expect(screen.getByText(/has an account, a reset link is on its way/i)).toBeInTheDocument();
  });

  it('says so when the email could not be sent', async () => {
    setAuth({ requestPasswordReset: vi.fn(async () => ({ error: { code: 'over_email_send_rate_limit', status: 429, message: 'wait' } })) });
    renderAt('/auth');
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    type(/email address/i, 'sam@example.com');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Too many attempts. Wait a minute, then try again.'));
    expect(screen.queryByText(/check your inbox/i)).toBeNull();
  });

  it('explains a dead email link on the sign-in page', () => {
    setAuth({ linkFailed: true });
    renderAt('/auth');
    expect(screen.getByRole('alert')).toHaveTextContent(/expired or was already used/i);
  });
});

describe('reset page', () => {
  const user = { id: 'u1', email: 'sam@example.com' };

  it('sets the new password for a reset link, then opens the app', async () => {
    const a = setAuth({ user, recovering: true });
    renderAt('/reset');
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    type(/new password/i, 'a new password');
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));
    await waitFor(() => expect(a.updatePassword).toHaveBeenCalledWith('a new password'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/'));
    expect(a.endRecovery).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Password changed. Other devices were signed out.');
  });

  it('refuses a password shorter than the rule without calling the server', () => {
    const a = setAuth({ user, recovering: true });
    renderAt('/reset');
    type(/new password/i, 'short');
    fireEvent.submit(screen.getByRole('button', { name: /save new password/i }).closest('form')!);
    expect(toast.error).toHaveBeenCalledWith('Password must be at least 8 characters.');
    expect(a.updatePassword).not.toHaveBeenCalled();
  });

  it('shows no password form without a reset link', () => {
    setAuth({ user });
    renderAt('/reset');
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
    expect(screen.getByRole('button', { name: /go to settings/i })).toBeInTheDocument();
  });

  it('offers a new link when the link is expired and nobody is signed in', async () => {
    setAuth({ linkFailed: true });
    renderAt('/reset');
    expect(screen.getByText(/expired or was already used/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /request a new link/i }));
    // Lands on the sign-in page, already on the reset form.
    expect(await screen.findByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('is kept out of search results', () => {
    setAuth({ linkFailed: true });
    renderAt('/reset');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });
});
