import { useState } from 'react';
import logo from '@/assets/logo.png';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const AuthPage = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) toast.error('Invalid email or password.');
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('Email already registered. Try signing in.');
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
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-5 py-10">
      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-primary/6" />
        <div className="absolute -bottom-14 -left-14 w-44 h-44 rounded-full bg-primary/5" />
      </div>

      <div className="relative w-full max-w-[min(22rem,calc(100vw-2.5rem))]">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-7">
          <img src={logo} alt="SpendPal" className="w-14 h-14 sm:w-16 sm:h-16 object-contain mb-4" />
          <h1 className="text-2xl sm:text-[1.625rem] font-heading font-bold tracking-tight leading-none">
            SpendPal
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">Your Personal Finance Companion</p>
        </div>

        {/* Form card */}
        <div className="bg-card rounded-2xl border border-border/60 card-shadow p-5">
          {/* Sign In / Sign Up toggle */}
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
                onClick={() => setMode(m)}
                className={`relative flex-1 py-3 rounded-lg text-sm font-medium transition-colors z-10 touch-manipulation ${
                  mode === m ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

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
                  minLength={8}
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
              {mode === 'signup' && (
                <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-[15px] font-semibold gradient-primary text-primary-foreground rounded-xl touch-manipulation mt-1"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : mode === 'login' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        </div>

        {/* Mode switch link */}
        <p className="text-center text-sm text-muted-foreground mt-5">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-primary font-semibold touch-manipulation"
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </main>
  );
};

export default AuthPage;
