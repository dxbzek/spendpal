import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';
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
    <form onSubmit={handleSubmit} className="bg-card rounded-xl p-5 card-shadow space-y-4">
      <div>
        <label htmlFor="current-password" className="text-sm font-medium mb-1.5 block">Current password</label>
        <Input
          id="current-password"
          name="current-password"
          type={show ? 'text' : 'password'}
          value={current}
          onChange={e => setCurrent(e.target.value)}
          autoComplete="current-password"
          className="h-12"
        />
      </div>
      <div>
        <label htmlFor="new-password" className="text-sm font-medium mb-1.5 block">New password</label>
        <div className="relative">
          <Input
            id="new-password"
            name="new-password"
            type={show ? 'text' : 'password'}
            value={next}
            onChange={e => setNext(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="h-12 pr-12"
          />
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label={show ? 'Hide passwords' : 'Show passwords'}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{PASSWORD_RULE}</p>
      </div>
      <Button type="submit" disabled={saving} className="w-full h-12 bg-primary text-primary-foreground">
        {saving ? <Loader2 className="animate-spin" size={18} /> : 'Change password'}
      </Button>
      <button
        type="button"
        onClick={handleSendLink}
        disabled={sending}
        className="block w-full text-center text-sm text-primary font-medium py-1 disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Forgot it? Email me a reset link'}
      </button>
    </form>
  );
};

export default ChangePasswordCard;
