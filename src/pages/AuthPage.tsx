import { useState } from 'react';
import logo from '@/assets/logo.png';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const toEmail = (username: string) => `${username.toLowerCase().trim()}@spendpal.app`;

const AuthPage = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  const handleUsernameChange = (val: string) => {
    const cleaned = val.replace(/[^a-zA-Z0-9_]/g, '');
    setUsername(cleaned);
    if (mode === 'signup' && cleaned.length > 0 && cleaned.length < 3) {
      setUsernameError('At least 3 characters');
    } else {
      setUsernameError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    const email = toEmail(username);
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) toast.error('Invalid username or password.');
    } else {
      if (username.length < 3) {
        setUsernameError('At least 3 characters');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, username);
      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('Username already taken. Try another.');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Account created! You can now sign in.');
      }
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-fab">
            <img src={logo} alt="SpendPal" className="w-12 h-12 object-cover rounded-xl" />
          </div>
          <h1 className="text-2xl font-heading">SpendPal</h1>
          <p className="text-sm text-muted-foreground mt-1">Your Personal Finance Companion</p>
        </div>

        {/* Toggle — animated active pill */}
        <div className="relative flex p-1 bg-muted rounded-xl mb-6">
          <div
            className="absolute top-1 bottom-1 rounded-lg bg-card card-shadow transition-all duration-200"
            style={{
              left: mode === 'login' ? '4px' : '50%',
              right: mode === 'login' ? '50%' : '4px',
            }}
          />
          {(['login', 'signup'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setUsernameError(''); }}
              className={`relative flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors z-10 ${
                mode === m ? 'text-foreground' : 'text-muted-foreground'
              }`}>
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Username</label>
            <Input
              placeholder="yourname"
              value={username}
              onChange={e => handleUsernameChange(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              className={usernameError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {usernameError ? (
              <p className="text-xs text-destructive mt-1">{usernameError}</p>
            ) : mode === 'signup' && (
              <p className="text-xs text-muted-foreground mt-1">Letters, numbers and _ only · min 3 chars</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="text-xs text-muted-foreground mt-1">Minimum 6 characters</p>
            )}
          </div>
          <Button
            type="submit"
            disabled={loading || !!usernameError}
            className="w-full h-12 text-base gradient-primary text-primary-foreground mt-2"
          >
            {loading
              ? <Loader2 className="animate-spin" size={18} />
              : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
      </div>
    </main>
  );
};

export default AuthPage;
