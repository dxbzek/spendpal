import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import logo from '@/assets/logo.png';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { authErrorMessage, authProblem, passwordProblem, MIN_PASSWORD_LENGTH, PASSWORD_RULE } from '@/lib/auth';

type Mode = 'login' | 'signup' | 'forgot';
/** An email went out: which one, and to whom. Replaces the form with "Check your inbox". */
type Sent = { kind: 'confirm' | 'reset'; email: string };

const AuthPage = () => {
  const { signIn, signUp, resendConfirmation, requestPasswordReset, linkFailed } = useAuth();
  const location = useLocation();
  // The reset page sends people here to ask for a new link.
  const [mode, setMode] = useState<Mode>(() => ((location.state as { forgot?: boolean } | null)?.forgot ? 'forgot' : 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  // Sign-in was refused because the address was never confirmed: offer the email again.
  const [unconfirmed, setUnconfirmed] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setSent(null);
    setUnconfirmed(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || (mode !== 'forgot' && !password)) return;

    setLoading(true);
    setUnconfirmed(false);

    if (mode === 'login') {
      const { error } = await signIn(address, password);
      if (error) {
        if (authProblem(error) === 'unconfirmed') setUnconfirmed(true);
        else toast.error(authErrorMessage(error, 'Sign in failed'));
      }
    } else if (mode === 'signup') {
      const weak = passwordProblem(password);
      if (weak) {
        toast.error(weak);
      } else {
        const { error, outcome } = await signUp(address, password);
        if (error) {
          toast.error(authErrorMessage(error, 'Sign up failed'));
        } else if (outcome === 'confirm_email') {
          setSent({ kind: 'confirm', email: address });
        } else if (outcome === 'exists') {
          toast.error('This email already has an account. Sign in, or reset your password.');
          setMode('login');
        } else {
          // Signed in: the route sends them into the app.
          toast.success('Account created. You are signed in.');
        }
      }
    } else {
      const { error } = await requestPasswordReset(address);
      if (error) toast.error(authErrorMessage(error, 'Could not send the reset link'));
      else setSent({ kind: 'reset', email: address });
    }
    setLoading(false);
  };

  const handleResend = async (kind: Sent['kind'], address: string) => {
    setResending(true);
    const { error } = kind === 'confirm' ? await resendConfirmation(address) : await requestPasswordReset(address);
    if (error) toast.error(authErrorMessage(error, 'Could not send the email'));
    else toast.success('Email sent again.');
    setResending(false);
  };

  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-5 py-10">
      <div className="relative w-full max-w-[min(22rem,calc(100vw-2.5rem))]">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-7">
          <img src={logo} alt="SpendPal" className="w-16 h-16 sm:w-[4.75rem] sm:h-[4.75rem] object-contain mb-4" />
          <h1 className="text-2xl sm:text-[1.625rem] font-heading font-bold tracking-tight leading-none">
            SpendPal
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">Track spending, budgets and goals</p>
        </div>

        {/* Form card */}
        <div className="bg-card rounded-xl border border-border card-shadow p-5">
          {sent ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">Check your inbox</h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {sent.kind === 'confirm'
                    ? <>We sent a link to <span className="font-medium text-foreground break-all">{sent.email}</span>. Open it to confirm your address, then sign in.</>
                    : <>If <span className="font-medium text-foreground break-all">{sent.email}</span> has an account, a reset link is on its way. Open it to set a new password.</>}
                </p>
                <p className="text-xs text-muted-foreground mt-2">No email after a few minutes? Check your spam folder, then send it again.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={resending}
                onClick={() => handleResend(sent.kind, sent.email)}
                className="w-full h-12 text-[15px] rounded-xl touch-manipulation"
              >
                {resending ? <Loader2 className="animate-spin" size={18} /> : 'Resend email'}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="block w-full text-center text-sm text-primary font-semibold py-2 touch-manipulation"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              {linkFailed && (
                <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm mb-4">
                  That email link has expired or was already used. Sign in, or use Forgot password to get a new one.
                </p>
              )}

              {mode === 'forgot' ? (
                <div className="mb-5">
                  <h2 className="text-base font-semibold">Reset your password</h2>
                  <p className="text-sm text-muted-foreground mt-1.5">Enter your email. We will send you a link to set a new password.</p>
                </div>
              ) : (
                /* Sign In / Sign Up toggle */
                <div className="relative flex p-1 bg-muted rounded-xl mb-5">
                  <div
                    className="absolute top-1 bottom-1 rounded-lg bg-card card-shadow transition-all duration-200"
                    style={{
                      left: mode === 'login' ? '4px' : '50%',
                      right: mode === 'login' ? '50%' : '4px',
                    }}
                  />
                  {(['login', 'signup'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`relative flex-1 py-3 rounded-lg text-sm font-medium transition-colors z-10 touch-manipulation ${
                        mode === m ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {m === 'login' ? 'Sign In' : 'Sign Up'}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="auth-email" className="text-sm font-medium block">Email address</label>
                  <Input
                    id="auth-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    inputMode="email"
                    className="h-12 rounded-xl px-4 text-[16px] placeholder:text-[15px]"
                  />
                </div>

                {/* Password */}
                {mode !== 'forgot' && (
                  <div className="space-y-1.5">
                    <label htmlFor="auth-password" className="text-sm font-medium block">Password</label>
                    <div className="relative">
                      <Input
                        id="auth-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        // The rule is for new passwords. Sign-in takes whatever the account has.
                        minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="h-12 rounded-xl px-4 text-[16px] placeholder:text-[15px] pr-12"
                      />
                      {/* Full-size tap target for eye toggle */}
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-colors touch-manipulation"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {mode === 'signup' ? (
                      <p className="text-xs text-muted-foreground">{PASSWORD_RULE}</p>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => switchMode('forgot')}
                          className="text-sm text-primary font-medium py-1 touch-manipulation"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {unconfirmed && (
                  <div role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm">
                    <p>Confirm your email first. Open the link in the email we sent to <span className="font-medium break-all">{email.trim()}</span>.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={resending}
                      onClick={() => handleResend('confirm', email.trim())}
                    >
                      {resending ? <Loader2 className="animate-spin" size={14} /> : 'Resend email'}
                    </Button>
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-[15px] font-semibold bg-primary text-primary-foreground rounded-xl touch-manipulation mt-1"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : mode === 'login' ? (
                    'Sign In'
                  ) : mode === 'signup' ? (
                    'Create Account'
                  ) : (
                    'Send reset link'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Mode switch link. The inbox panel has its own way back. */}
        {!sent && (
          <p className="text-center text-sm text-muted-foreground mt-5">
            {mode === 'login' ? "Don't have an account? " : mode === 'signup' ? 'Already have an account? ' : 'Remembered it? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-primary font-semibold touch-manipulation"
            >
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        )}
      </div>
    </main>
  );
};

export default AuthPage;
