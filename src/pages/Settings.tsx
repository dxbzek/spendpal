import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCurrency, WORLD_CURRENCIES } from '@/context/CurrencyContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Loader2, LogOut, Moon, Sun, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FRANKFURTER_API = 'https://api.frankfurter.app';

const CurrencyConverter = ({ baseCurrency }: { baseCurrency: string }) => {
  const [amount, setAmount] = useState('1');
  const [targetCurrency, setTargetCurrency] = useState(baseCurrency === 'USD' ? 'EUR' : 'USD');
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetSearch, setTargetSearch] = useState('');

  const filteredTarget = targetSearch
    ? WORLD_CURRENCIES.filter(c =>
        c.code.toLowerCase().includes(targetSearch.toLowerCase()) ||
        c.label.toLowerCase().includes(targetSearch.toLowerCase())
      )
    : WORLD_CURRENCIES;

  const fetchRate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FRANKFURTER_API}/latest?from=${baseCurrency}&to=${targetCurrency}`);
      if (!res.ok) throw new Error('Failed to fetch rate');
      const data = await res.json();
      setRate(data.rates?.[targetCurrency] ?? null);
    } catch {
      setRate(null);
      toast.error('Could not fetch exchange rate. Currency may not be supported.');
    }
    setLoading(false);
  }, [baseCurrency, targetCurrency]);

  useEffect(() => { fetchRate(); }, [fetchRate]);

  const numAmount = parseFloat(amount) || 0;
  const converted = rate !== null ? (numAmount * rate) : null;

  const baseSymbol = WORLD_CURRENCIES.find(c => c.code === baseCurrency)?.code ?? baseCurrency;
  const targetSymbol = WORLD_CURRENCIES.find(c => c.code === targetCurrency)?.code ?? targetCurrency;

  return (
    <div className="bg-card rounded-2xl p-5 card-shadow space-y-4">
      <div className="flex items-center gap-2">
        <ArrowRightLeft size={18} className="text-primary" />
        <h2 className="text-sm font-heading">Currency Converter</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Amount ({baseSymbol})</label>
          <Input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="h-12 text-lg font-heading"
            min="0"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Convert to</label>
          <Select value={targetCurrency} onValueChange={setTargetCurrency}>
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search currencies…"
                    value={targetSearch}
                    onChange={e => setTargetSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              {filteredTarget.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
              {filteredTarget.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">No currencies found</p>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Result */}
        <div className="bg-muted/50 rounded-xl p-4 text-center">
          {loading ? (
            <Loader2 size={20} className="animate-spin text-primary mx-auto" />
          ) : converted !== null ? (
            <>
              <p className="text-2xl font-heading text-foreground">
                {converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {targetSymbol}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                1 {baseSymbol} = {rate?.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} {targetSymbol}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Rate unavailable for this pair</p>
          )}
        </div>

        <button onClick={fetchRate} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-primary font-medium hover:bg-accent rounded-lg transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Rate
        </button>
      </div>
    </div>
  );
};

const Settings = () => {
  const { user, signOut } = useAuth();
  const { setCurrency: setGlobalCurrency } = useCurrency();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name || '');
        setCurrency(data.currency || 'AED');
        setAvatarUrl(data.avatar_url);
      }
      setLoading(false);
    });
  }, [user]);

  const filteredCurrencies = currencySearch
    ? WORLD_CURRENCIES.filter(c =>
        c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
        c.label.toLowerCase().includes(currencySearch.toLowerCase())
      )
    : WORLD_CURRENCIES;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const newUrl = urlData.publicUrl + '?t=' + Date.now();

    const { error } = await supabase.from('profiles').update({ avatar_url: newUrl }).eq('user_id', user.id);
    if (error) {
      toast.error('Failed to update avatar');
    } else {
      setAvatarUrl(newUrl);
      toast.success('Avatar updated!');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName.trim() || null,
      currency,
    }).eq('user_id', user.id);

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      setGlobalCurrency(currency);
      toast.success('Profile updated!');
    }
    setSaving(false);
  };

  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : (user?.email?.slice(0, 2).toUpperCase() ?? '?');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h1 className="text-xl">Settings</h1>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative">
          <Avatar className="w-24 h-24 border-4 border-card card-shadow">
            <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-2xl font-heading bg-accent text-accent-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full gradient-primary flex items-center justify-center cursor-pointer shadow-md">
            {uploading ? <Loader2 size={14} className="animate-spin text-primary-foreground" /> : <Camera size={14} className="text-primary-foreground" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      {/* Form */}
      <div className="space-y-5">
        {/* Appearance */}
        <div className="bg-card rounded-2xl p-5 card-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon size={18} className="text-primary" /> : <Sun size={18} className="text-primary" />}
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Switch between light and dark theme</p>
              </div>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </div>
        </div>

        <div className="bg-card rounded-2xl p-5 card-shadow space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Display Name</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className="h-12" />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Preferred Currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search currencies…"
                      value={currencySearch}
                      onChange={e => setCurrencySearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                {filteredCurrencies.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
                {filteredCurrencies.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3">No currencies found</p>
                )}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full h-12 gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
          </Button>
        </div>

        {/* Currency Converter */}
        <CurrencyConverter baseCurrency={currency} />

        {/* Sign Out */}
        <button onClick={signOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-card card-shadow text-muted-foreground font-medium text-sm hover:bg-muted transition-colors">
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default Settings;
