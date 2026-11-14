// Sign-in, sign-up and password rules as pure functions, so the sign-in page,
// the reset page and Settings say the same thing and each message can be
// tested without a server.

/** The one password rule. The sign-up, reset and change forms all use it. */
export const MIN_PASSWORD_LENGTH = 8;
/** Shown next to every field that sets a password. */
export const PASSWORD_RULE = `At least ${MIN_PASSWORD_LENGTH} characters`;

/** Why a new password can't be used, or null when it can. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

/** The fields of a Supabase auth error this file reads. */
export interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

export type AuthProblem =
  | 'credentials'    // wrong email or password
  | 'unconfirmed'    // the email address was never confirmed
  | 'rate_limit'     // too many tries, or an email was sent a moment ago
  | 'network'        // the request never got an answer
  | 'exists'         // sign-up with an address that already has an account
  | 'weak_password'  // the server wants a stronger password than ours
  | 'same_password'  // the new password is the old one
  | 'no_session'     // a reset link that is used up, or a session that ended
  | 'other';

/**
 * Sort an auth error into the few cases the app words differently. The sign-in
 * form used to show "Invalid email or password" for all of them, so a user who
 * was offline or rate limited kept retyping a correct password.
 */
export function authProblem(error: AuthErrorLike): AuthProblem {
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  // The client raises this when fetch itself fails (offline, blocked) and for a 502 to 504 answer.
  if (error.name === 'AuthRetryableFetchError' || message.includes('failed to fetch') || message.includes('networkerror')) return 'network';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) return 'rate_limit';
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'unconfirmed';
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'credentials';
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) return 'exists';
  if (code === 'weak_password' || error.name === 'AuthWeakPasswordError') return 'weak_password';
  if (code === 'same_password') return 'same_password';
  if (code === 'session_not_found' || code === 'otp_expired' || error.name === 'AuthSessionMissingError') return 'no_session';
  return 'other';
}

/** The line to show for an auth error. `action` starts the fallback, e.g. "Sign in failed". */
export function authErrorMessage(error: AuthErrorLike, action: string): string {
  switch (authProblem(error)) {
    case 'credentials': return 'Wrong email or password.';
    case 'unconfirmed': return 'Confirm your email first. Open the link in the email we sent you.';
    case 'rate_limit': return 'Too many attempts. Wait a minute, then try again.';
    case 'network': return 'Could not reach the server. Check your connection and try again.';
    case 'exists': return 'This email already has an account. Sign in, or reset your password.';
    case 'weak_password': return error.message ? `Password is too weak. ${error.message}` : `Password is too weak. ${PASSWORD_RULE}.`;
    case 'same_password': return 'The new password must be different from the current one.';
    case 'no_session': return 'This link has expired or was already used. Request a new one.';
    default: return error.message ? `${action}. ${error.message}` : `${action}. Try again.`;
  }
}

export type SignUpOutcome =
  | 'signed_in'      // the server opened a session: the user is in the app
  | 'confirm_email'  // the user must open the link in their inbox first
  | 'exists';        // the address already has an account

/**
 * What a sign-up without an error means. The page used to say "You can now
 * sign in" every time, which is false when the server signs the user in at
 * once, and hides the inbox step when it does not.
 */
export function signUpOutcome(data: { session: unknown; user: { identities?: unknown[] | null } | null }): SignUpOutcome {
  if (data.session) return 'signed_in';
  // With email confirmation on, the server hides that an address is taken: it
  // answers with a user that has no identities and sends no email.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return 'exists';
  return 'confirm_email';
}

/**
 * What the address bar says when the app opens from an emailed link.
 * `callback`: this tab was opened by such a link (a session in the hash, or a
 * code in the query). `recovery`: it was a password reset link. `failed`: the
 * link is expired or used. Read this before the Supabase client clears the hash.
 */
export function readAuthRedirect(hash: string, search = ''): { callback: boolean; recovery: boolean; failed: boolean } {
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''));
  const fromQuery = new URLSearchParams(search);
  const has = (key: string) => fromHash.has(key) || fromQuery.has(key);
  const callback = fromHash.has('access_token') || fromQuery.has('code');
  return {
    callback,
    recovery: callback && fromHash.get('type') === 'recovery',
    failed: has('error') || has('error_code') || has('error_description'),
  };
}
