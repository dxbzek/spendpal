import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { readAuthRedirect, signUpOutcome, type SignUpOutcome } from '@/lib/auth';
import { userSettings, connectUserSettings } from '@/lib/userSettings';
import { runSignOutResets } from '@/lib/signOutReset';

connectUserSettings(supabase);

/** Forget everything the last user left in memory: settings, categories, AI count. */
const forgetUser = () => {
  userSettings.stop();
  runSignOutResets();
};
// Sign-out waits this long at most for a waiting settings change to be sent.
const SETTINGS_FLUSH_MS = 3000;

type AuthResult = { error: AuthError | null };

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** `outcome` says what a sign-up without an error means: signed in, confirm the email, or address taken. */
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthResult & { outcome: SignUpOutcome | null }>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Send the "confirm your email" message again. */
  resendConfirmation: (email: string) => Promise<AuthResult>;
  /** Email a link that opens /reset. */
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  /**
   * Set a new password for the signed-in user. `othersSignedOut`: every other
   * device was signed out. The reset page calls endRecovery() itself when it leaves.
   */
  updatePassword: (password: string) => Promise<AuthResult & { othersSignedOut: boolean }>;
  /** Check the current password, then set the new one. `step` names which of the two failed. */
  changePassword: (current: string, next: string) => Promise<AuthResult & { step: 'current' | 'new'; othersSignedOut: boolean }>;
  /** True from the moment a reset link opens the app until a new password is set or the user skips it. */
  recovering: boolean;
  endRecovery: () => void;
  /** The app was opened from an emailed link that is expired or already used. */
  linkFailed: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Supabase hands over a new user object on every auth event (initial session,
// token refresh, tab focus). Everything keyed on `user` then refetched: the
// profile and category lists loaded four times on one page load. Keep the
// object we have unless the user actually changed.
const sameUser = (a: User | null, b: User | null) =>
  a?.id === b?.id && a?.email === b?.email && a?.updated_at === b?.updated_at;

// Read once, when this file loads: the Supabase client clears the hash as soon
// as it has taken the session out of it, and the PASSWORD_RECOVERY event can
// fire before any page is listening.
let openedFrom = readAuthRedirect(window.location.hash, window.location.search);
/** Test hook: read the address bar again. */
export const rereadAuthRedirect = () => { openedFrom = readAuthRedirect(window.location.hash, window.location.search); };

// Kept for the tab, so a reload on the reset page still shows the form.
const RECOVERY_KEY = 'spendpal_password_recovery';
const storedRecovery = () => {
  try { return sessionStorage.getItem(RECOVERY_KEY) === '1'; } catch { return false; }
};
const storeRecovery = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch { /* private mode: the flag lives in memory only */ }
};

// The client returns most failures as { error }, but throws a few. One shape for the pages.
const asError = (e: unknown) => e as AuthError;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUserState] = useState<User | null>(null);
  const lastUserId = useRef<string | null>(null);
  const setUser = useCallback((next: User | null) => {
    // Load this user's settings before React renders their pages, so the
    // first render already reads this user's values (a hidden balance must
    // not show for a frame). Another user signing in (in another tab) first
    // drops what the last one left in memory; start() replaces the settings.
    if (next) {
      if (lastUserId.current && lastUserId.current !== next.id) runSignOutResets();
      lastUserId.current = next.id;
      void userSettings.start(next.id);
    }
    setUserState(prev => (sameUser(prev, next) ? prev : next));
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecoveringState] = useState(() => openedFrom.recovery || storedRecovery());

  const setRecovering = useCallback((on: boolean) => {
    storeRecovery(on);
    setRecoveringState(on);
  }, []);
  const endRecovery = useCallback(() => setRecovering(false), [setRecovering]);

  useEffect(() => {
    if (openedFrom.recovery) storeRecovery(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // The client repeats this event in every open tab. Only the tab the link
      // opened shows the reset form; the others stay where they are.
      if (event === 'PASSWORD_RECOVERY' && openedFrom.callback) setRecovering(true);
      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        forgetUser();
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [setUser, setRecovering]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { display_name: displayName },
        },
      });
      if (error) return { error, outcome: null };
      setRecovering(false);
      return { error: null, outcome: signUpOutcome(data) };
    } catch (e) {
      return { error: asError(e), outcome: null };
    }
  }, [setRecovering]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      // A normal sign-in ends any half-finished reset in this tab.
      if (!error) setRecovering(false);
      return { error };
    } catch (e) {
      return { error: asError(e) };
    }
  }, [setRecovering]);

  const signOut = useCallback(async () => {
    // A change made in the last second (income, payday) is still waiting to
    // be sent. Send it, but never hold the sign-out up for long: what does
    // not get through stays in this browser under the user's own key.
    await Promise.race([
      userSettings.flush().catch(() => false),
      new Promise(resolve => setTimeout(resolve, SETTINGS_FLUSH_MS)),
    ]);
    await supabase.auth.signOut();
    forgetUser();
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      return { error };
    } catch (e) {
      return { error: asError(e) };
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset',
      });
      return { error };
    } catch (e) {
      return { error: asError(e) };
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error, othersSignedOut: false };
    } catch (e) {
      return { error: asError(e), othersSignedOut: false };
    }
    // A password is changed after a leak or a lost device, so the old sessions
    // on other devices must not keep working. The password is saved by now: a
    // failure here is reported as "others not signed out", never as a failed change.
    try {
      const others = await supabase.auth.signOut({ scope: 'others' });
      return { error: null, othersSignedOut: !others.error };
    } catch {
      return { error: null, othersSignedOut: false };
    }
  }, []);

  const email = user?.email;
  const changePassword = useCallback(async (current: string, next: string) => {
    try {
      // The server changes a password for any open session. Asking for the
      // current one stops someone who picks up an unlocked phone.
      const check = await supabase.auth.signInWithPassword({ email: email ?? '', password: current });
      if (check.error) return { error: check.error, step: 'current' as const, othersSignedOut: false };
    } catch (e) {
      return { error: asError(e), step: 'current' as const, othersSignedOut: false };
    }
    return { ...(await updatePassword(next)), step: 'new' as const };
  }, [email, updatePassword]);

  const value = useMemo(
    () => ({
      user, session, loading, signUp, signIn, signOut,
      resendConfirmation, requestPasswordReset, updatePassword, changePassword,
      recovering, endRecovery, linkFailed: openedFrom.failed,
    }),
    [user, session, loading, signUp, signIn, signOut,
      resendConfirmation, requestPasswordReset, updatePassword, changePassword,
      recovering, endRecovery]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
