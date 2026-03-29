import { useState } from 'react';
import logo from '@/assets/logo.png';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const AuthPage = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

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
