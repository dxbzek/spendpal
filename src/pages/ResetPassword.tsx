import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandMark from '@/components/BrandMark';
import { useAuth } from '@/context/AuthContext';
import { useNoIndex } from '@/hooks/useNoIndex';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { authErrorMessage, authProblem, passwordProblem, MIN_PASSWORD_LENGTH, PASSWORD_RULE } from '@/lib/auth';

// Where the emailed reset link lands. The link signs the user in (Supabase
// calls this a recovery session); this page then sets the new password.
const ResetPassword = () => {
  const { user, loading, recovering, linkFailed, updatePassword, endRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  // The session ended between opening the link and saving.
  const [expired, setExpired] = useState(false);
  // Set in the same step as the move to another page, so no other view of this page shows on the way out.
  const [leaving, setLeaving] = useState(false);
  useNoIndex();

  if (loading || leaving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // form: a reset link opened this page and its session is live.
  // expired: the link is used up. signed_in: a normal session, no link; the
  // password is changed in Settings, which asks for the current one.
  const view = user && recovering && !expired ? 'form'
    : linkFailed || expired ? 'expired'
    : user ? 'signed_in'
    : 'no_link';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weak = passwordProblem(password);
    if (weak) { toast.error(weak); return; }
    setSaving(true);
    const { error, othersSignedOut } = await updatePassword(password);
    setSaving(false);
    if (error) {
      if (authProblem(error) === 'no_session') setExpired(true);
      else toast.error(authErrorMessage(error, 'Could not change the password'));
      return;
    }
    toast.success(othersSignedOut ? 'Password changed. Other devices were signed out.' : 'Password changed.');
    leave('/');
  };

  const leave = (to: string, state?: { forgot: boolean }) => {
    setLeaving(true);
    endRecovery();
    navigate(to, { replace: true, state });
  };

  const title = {
    form: 'Set a new password',
    expired: 'Reset link expired',
    signed_in: 'You are signed in',
    no_link: 'Reset your password',
  }[view];

  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-5 py-10">
      <div className="relative w-full max-w-[min(22rem,calc(100vw-2.5rem))]">
        <div className="flex flex-col items-center mb-7">
          <BrandMark title="SpendPal" className="w-16 h-16 sm:w-[4.75rem] sm:h-[4.75rem] mb-4" />
          <h1 className="text-2xl sm:text-[1.625rem] font-heading font-bold tracking-tight leading-none">
            {title}
          </h1>
        </div>

        <div className="bg-card rounded-xl border border-border card-shadow p-5">
          {view === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For <span className="font-medium text-foreground break-all">{user?.email}</span>
              </p>
              <div className="space-y-1.5">
                <label htmlFor="reset-password" className="text-sm font-medium block">New password</label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    name="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    autoFocus
                    className="h-12 rounded-xl px-4 text-[16px] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-colors touch-manipulation"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{PASSWORD_RULE}</p>
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="w-full h-12 text-[15px] font-semibold bg-primary text-primary-foreground rounded-xl touch-manipulation"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : 'Save new password'}
              </Button>
              <button
                type="button"
                onClick={() => leave('/')}
                className="block w-full text-center text-sm text-muted-foreground py-2 touch-manipulation"
              >
                Keep my old password
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {view === 'expired' && 'This reset link has expired or was already used.'}
                {view === 'no_link' && 'Open this page from the reset link in your email. If you do not have one, request it now.'}
                {view === 'signed_in' && 'Change your password in Settings.'}
                {view === 'expired' && user && ' You are still signed in. Change your password, or send a new link, in Settings.'}
              </p>
              <Button
                type="button"
                onClick={() => (user ? leave('/settings') : leave('/auth', { forgot: true }))}
                className="w-full h-12 text-[15px] font-semibold bg-primary text-primary-foreground rounded-xl touch-manipulation"
              >
                {user ? 'Go to settings' : 'Request a new link'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default ResetPassword;
