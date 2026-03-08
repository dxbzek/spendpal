import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Loader2, LogOut, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CURRENCIES = [
  { code: 'AED', label: 'AED (د.إ)' },
  { code: 'USD', label: 'USD ($)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'INR', label: 'INR (₹)' },
  { code: 'SAR', label: 'SAR (﷼)' },
];

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
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full h-12 gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
          </Button>
        </div>


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
