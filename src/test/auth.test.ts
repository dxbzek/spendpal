// Each sign-in failure gets its own words, sign-up says what really happened,
// and one password rule holds everywhere.
import { describe, it, expect } from 'vitest';
import {
  authProblem, authErrorMessage, signUpOutcome, passwordProblem, readAuthRedirect,
  MIN_PASSWORD_LENGTH, PASSWORD_RULE,
} from '@/lib/auth';

describe('authProblem', () => {
  it('tells wrong credentials from the other sign-in failures', () => {
    // The shapes @supabase/auth-js 2.98 returns.
    expect(authProblem({ name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('credentials');
    expect(authProblem({ name: 'AuthApiError', status: 400, code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe('unconfirmed');
    expect(authProblem({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' })).toBe('rate_limit');
    expect(authProblem({ name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.' })).toBe('rate_limit');
    expect(authProblem({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toBe('network');
    expect(authProblem({ name: 'AuthRetryableFetchError', status: 503, message: '{}' })).toBe('network');
  });

  it('reads sign-up and password-change failures', () => {
    expect(authProblem({ status: 422, code: 'user_already_exists', message: 'User already registered' })).toBe('exists');
    expect(authProblem({ name: 'AuthWeakPasswordError', status: 422, code: 'weak_password', message: 'Password should contain a digit' })).toBe('weak_password');
    expect(authProblem({ status: 422, code: 'same_password', message: 'New password should be different from the old password.' })).toBe('same_password');
    expect(authProblem({ name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' })).toBe('no_session');
  });

  it('falls back to the message when the server sends no code', () => {
    expect(authProblem({ message: 'Invalid login credentials' })).toBe('credentials');
    expect(authProblem({ message: 'Email not confirmed' })).toBe('unconfirmed');
    expect(authProblem({ message: 'User already registered' })).toBe('exists');
    expect(authProblem({ message: 'TypeError: Failed to fetch' })).toBe('network');
  });

  it('does not guess', () => {
    expect(authProblem({ status: 500, code: 'unexpected_failure', message: 'Database error' })).toBe('other');
    expect(authProblem({})).toBe('other');
  });
});

describe('authErrorMessage', () => {
  it('only blames the password when the password is the problem', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' }, 'Sign in failed')).toBe('Wrong email or password.');
    const offline = authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 }, 'Sign in failed');
    const limited = authErrorMessage({ status: 429 }, 'Sign in failed');
    const unconfirmed = authErrorMessage({ code: 'email_not_confirmed' }, 'Sign in failed');
    for (const m of [offline, limited, unconfirmed]) expect(m).not.toMatch(/password/i);
    expect(offline).toMatch(/connection/);
    expect(limited).toMatch(/Too many attempts/);
    expect(unconfirmed).toMatch(/Confirm your email/);
  });

  it('names the action and keeps the server text for a failure it does not know', () => {
    expect(authErrorMessage({ code: 'signup_disabled', message: 'Signups not allowed for this instance' }, 'Sign up failed'))
      .toBe('Sign up failed. Signups not allowed for this instance');
    expect(authErrorMessage({}, 'Sign in failed')).toBe('Sign in failed. Try again.');
  });
});

describe('signUpOutcome', () => {
  const user = { identities: [{ id: 'i1' }] };

  it('is "signed in" when the server opens a session (email confirmation off)', () => {
    expect(signUpOutcome({ session: { access_token: 't' }, user })).toBe('signed_in');
  });

  it('is "confirm your email" when there is no session yet (email confirmation on)', () => {
    expect(signUpOutcome({ session: null, user })).toBe('confirm_email');
    expect(signUpOutcome({ session: null, user: {} })).toBe('confirm_email');
  });

  it('spots an address that is already taken, which the server reports without an error', () => {
    expect(signUpOutcome({ session: null, user: { identities: [] } })).toBe('exists');
  });
});

describe('password rule', () => {
  it('is one length, stated the same way everywhere', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(PASSWORD_RULE).toBe('At least 8 characters');
  });

  it('refuses a short password and takes one at the limit', () => {
    expect(passwordProblem('1234567')).toBe('Password must be at least 8 characters.');
    expect(passwordProblem('')).not.toBeNull();
    expect(passwordProblem('12345678')).toBeNull();
  });
});

describe('readAuthRedirect', () => {
  it('sees a password reset link', () => {
    expect(readAuthRedirect('#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery'))
      .toEqual({ callback: true, recovery: true, failed: false });
  });

  it('does not treat a sign-up confirmation or a plain page as a reset', () => {
    expect(readAuthRedirect('#access_token=abc&refresh_token=def&type=signup')).toEqual({ callback: true, recovery: false, failed: false });
    expect(readAuthRedirect('')).toEqual({ callback: false, recovery: false, failed: false });
    // "type=recovery" alone carries no session, so there is nothing to set a password for.
    expect(readAuthRedirect('#type=recovery')).toEqual({ callback: false, recovery: false, failed: false });
    // A code in the query (the other link style) opens the tab too; the client says later what kind it was.
    expect(readAuthRedirect('', '?code=abc')).toEqual({ callback: true, recovery: false, failed: false });
  });

  it('sees an expired or used link, in the hash or the query', () => {
    const expired = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    expect(readAuthRedirect('#' + expired)).toEqual({ callback: false, recovery: false, failed: true });
    expect(readAuthRedirect('', '?' + expired)).toEqual({ callback: false, recovery: false, failed: true });
  });
});
