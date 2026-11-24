import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { authErrorMessage, authProblem, passwordProblem, MIN_PASSWORD_LENGTH, PASSWORD_RULE } from '@/lib/auth';

const ChangePasswordCard = () => {
  const { user, changePassword, requestPasswordReset } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) { toast.error('Enter your current password.'); return; }
    const weak = passwordProblem(next);
    if (weak) { toast.error(weak); return; }
    if (next === current) { toast.error('The new password must be different from the current one.'); return; }

    setSaving(true);
    const { error, step, othersSignedOut } = await changePassword(current, next);
    setSaving(false);
    if (error) {
      // "Wrong email or password" would point at the wrong field here.
      if (step === 'current' && authProblem(error) === 'credentials') toast.error('Current password is wrong.');
      else toast.error(authErrorMessage(error, 'Could not change the password'));
      return;
    }
    setCurrent('');
    setNext('');
    toast.success(othersSignedOut ? 'Password changed. Other devices were signed out.' : 'Password changed.');
  };

  // Signed in but the current password is forgotten: the emailed link is the only way.
  const handleSendLink = async () => {
    if (!user?.email) return;
    setSending(true);
    const { error } = await requestPasswordReset(user.email);
    setSending(false);
    if (error) toast.error(authErrorMessage(error, 'Could not send the reset link'));
    else toast.success(`Reset link sent to ${user.email}.`);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-card rounded-3xl px-4 divide-y divide-border">
        <div className="flex items-center gap-3 py-3 min-h-[64px]">
          <span className="w-10 h-10 shrink-0 rounded-full bg-muted flex items-center justify-center"><KeyRound size={17} /></span>
          <div className="min-w-0 flex-1">
            <label htmlFor="current-password" className="block text-xs text-muted-foreground">Current password</label>
            <Input
              id="current-password"
              name="current-password"
              type={show ? 'text' : 'password'}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter current password"
              className="h-7 w-full px-0 py-0 border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 py-3 min-h-[64px]">
          <span className="w-10 h-10 shrink-0 rounded-full bg-muted flex items-center justify-center"><Lock size={17} /></span>
          <div className="min-w-0 flex-1">
            <label htmlFor="new-password" className="block text-xs text-muted-foreground">New password</label>
            <Input
              id="new-password"
              name="new-password"
              type={show ? 'text' : 'password'}
              value={next}
              onChange={e => setNext(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              placeholder="Enter new password"
              className="h-7 w-full px-0 py-0 border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
            />
            <p className="text-xs text-muted-foreground mt-1">{PASSWORD_RULE}</p>
          </div>
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label={show ? 'Hide passwords' : 'Show passwords'}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="mt-3 w-full h-12 rounded-full bg-primary text-primary-foreground text-[15px] font-medium inline-flex items-center justify-center disabled:opacity-50">
        {saving ? <Loader2 className="animate-spin" size={18} /> : 'Change password'}
      </button>
      <button
        type="button"
        onClick={handleSendLink}
        disabled={sending}
        className="block w-full text-center text-sm text-primary font-medium py-3 disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Forgot it? Email me a reset link'}
      </button>
    </form>
  );
};

export default ChangePasswordCard;
