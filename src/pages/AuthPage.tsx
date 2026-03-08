import { useState } from 'react';
import logo from '@/assets/logo.png';
import { useAuth } from '@/context/AuthContext';
import { lovable } from '@/integrations/lovable/index';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const AuthPage = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result?.error) {
      toast.error('Google sign-in failed. Please try again.');
    }
    setGoogleLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
    } else {
      const { error } = await signUp(email, password, displayName);
      if (error) toast.error(error.message);
      else toast.success('Account created! Check your email to verify.');
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <img src={logo} alt="SpendPal" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4" />
          <h1 className="text-2xl font-heading">SpendPal</h1>
          <p className="text-sm text-muted-foreground mt-1">Your Personal Finance Companion</p>
        </div>

        {/* Toggle */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6">
          {(['login', 'signup'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all ${
                mode === m ? 'bg-card card-shadow text-foreground' : 'text-muted-foreground'
              }`}>
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Google Sign-In */}
        <Button type="button" variant="outline" onClick={handleGoogleSignIn} disabled={googleLoading}
          className="w-full h-12 text-base gap-3">
          {googleLoading ? <Loader2 className="animate-spin" size={18} /> : (
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          )}
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 my-4">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Display Name</label>
              <Input placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Email</label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Password</label>
            <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 text-base gradient-primary text-primary-foreground">
            {loading ? <Loader2 className="animate-spin" size={18} /> : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
      </div>
    </main>
  );
};

export default AuthPage;
