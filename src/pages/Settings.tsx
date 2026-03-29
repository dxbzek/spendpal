import { useState, useEffect, useCallback, useRef } from 'react';
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
import { logger } from '@/lib/logger';
import { ArrowLeft, Camera, Loader2, LogOut, Moon, Sun, Search, Download, Upload, AlertTriangle, BookOpen } from 'lucide-react';
import CategoryManager from '@/components/settings/CategoryManager';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '@/context/FinanceContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const SecondaryCurrencyCard = () => {
  const { secondaryCurrency, setSecondaryCurrency, currency } = useCurrency();
  const [searchVal, setSearchVal] = useState('');

  const filtered = searchVal
    ? WORLD_CURRENCIES.filter(c =>
        c.code.toLowerCase().includes(searchVal.toLowerCase()) ||
        c.label.toLowerCase().includes(searchVal.toLowerCase())
      )
    : WORLD_CURRENCIES;

  return (
    <div className="bg-card rounded-2xl p-5 card-shadow space-y-3">
      <div>
        <p className="text-sm font-medium mb-1">Secondary Currency</p>
        <p className="text-xs text-muted-foreground mb-3">Show converted values alongside your primary currency</p>
        <Select value={secondaryCurrency || '__none__'} onValueChange={v => setSecondaryCurrency(v === '__none__' ? null : v)}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Search currencies…" value={searchVal}
                  onChange={e => setSearchVal(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <SelectItem value="__none__">None (disabled)</SelectItem>
            {filtered.filter(c => c.code !== currency).map(c => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
const DataBackupCard = () => {
  const { accounts, transactions, budgets, goals, refresh } = useFinance();
  const { user } = useAuth();
  const [restoring, setRestoring] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts,
      transactions,
      budgets,
      goals,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendpal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup downloaded!');
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowConfirm(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleConfirmRestore = async () => {
    if (!pendingFile || !user) return;
    setShowConfirm(false);
    setRestoring(true);

    // 1. Parse and validate the backup file
    let data: {
      version: number;
      accounts: Array<Record<string, unknown>>;
      transactions: Array<Record<string, unknown>>;
      budgets?: Array<Record<string, unknown>>;
      goals?: Array<Record<string, unknown>>;
    };
    try {
      const text = await pendingFile.text();
      data = JSON.parse(text) as typeof data;
    } catch {
      toast.error('Invalid backup file: could not parse JSON.');
      setRestoring(false);
      setPendingFile(null);
      return;
    }

    if (!data.version || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
      toast.error('Invalid backup file: missing required fields (version, accounts, transactions).');
      setRestoring(false);
      setPendingFile(null);
      return;
    }

    try {
      // 2. Delete existing data — check each result for errors
      const [delTx, delBgt, delGoal, delAcc] = await Promise.all([
        supabase.from('transactions').delete().eq('user_id', user.id),
        supabase.from('budgets').delete().eq('user_id', user.id),
        supabase.from('goals').delete().eq('user_id', user.id),
        supabase.from('accounts').delete().eq('user_id', user.id),
      ]);
      for (const res of [delTx, delBgt, delGoal, delAcc]) {
        if (res.error) throw res.error;
      }

      // 3. Re-insert accounts
      if (data.accounts.length) {
        const { error } = await supabase.from('accounts').insert(
          data.accounts.map((a) => ({
            user_id: user.id, name: a.name, type: a.type, balance: a.balance,
            currency: a.currency, icon: a.icon, credit_limit: a.creditLimit ?? null,
            due_date: a.dueDate ?? null, statement_date: a.statementDate ?? null,
          }))
        );
        if (error) throw error;
      }

      // 4. Build old→new account ID map
      const { data: newAccounts, error: accFetchErr } = await supabase
        .from('accounts').select('*').eq('user_id', user.id);
      if (accFetchErr) throw accFetchErr;
      const accountMap: Record<string, string> = {};
      data.accounts.forEach((old) => {
        const match = (newAccounts ?? []).find(
          (n) => n.name === old.name && n.type === old.type
        );
        if (match) accountMap[old.id as string] = match.id as string;
      });

      // 5. Re-insert transactions
      if (data.transactions.length) {
        const mapped = data.transactions
          .filter((t) => accountMap[t.accountId as string])
          .map((t) => ({
            user_id: user.id, account_id: accountMap[t.accountId as string], type: t.type,
            amount: t.amount, currency: t.currency, category: t.category,
            category_icon: t.categoryIcon, merchant: t.merchant, date: t.date,
            note: t.note ?? null, is_recurring: t.isRecurring ?? false,
            total_installments: t.totalInstallments ?? null,
            current_installment: t.currentInstallment ?? null,
          }));
        if (mapped.length) {
          const { error } = await supabase.from('transactions').insert(mapped);
          if (error) throw error;
        }
      }

      // 6. Re-insert budgets
      if (data.budgets?.length) {
        const { error } = await supabase.from('budgets').insert(
          data.budgets.map((b) => ({
            user_id: user.id, category: b.category, category_icon: b.categoryIcon,
            amount: b.amount, period: b.period, month: b.month,
          }))
        );
        if (error) throw error;
      }

      // 7. Re-insert goals
      if (data.goals?.length) {
        const { error } = await supabase.from('goals').insert(
          data.goals.map((g) => ({
            user_id: user.id, name: g.name, icon: g.icon, type: g.type,
            target_amount: g.targetAmount, saved_amount: g.savedAmount,
            deadline: g.deadline ?? null, status: g.status,
          }))
        );
        if (error) throw error;
      }

      await refresh();
      toast.success(
        `Restored ${data.accounts.length} accounts and ${data.transactions.length} transactions.`
      );
    } catch (err: unknown) {
      logger.error('Restore failed', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Restore failed: ${msg}`);
    } finally {
      setRestoring(false);
      setPendingFile(null);
    }
  };

  return (
    <>
      <div className="bg-card rounded-2xl p-5 card-shadow space-y-3">
        <p className="text-sm font-medium">Data Backup & Restore</p>
        <p className="text-xs text-muted-foreground">Export all your data as JSON or restore from a previous backup.</p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 h-11 gap-2" onClick={handleExport}>
            <Download size={16} /> Export
          </Button>
          <Button variant="outline" className="flex-1 h-11 gap-2" disabled={restoring}
            onClick={() => fileRef.current?.click()}>
            {restoring ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {restoring ? 'Restoring…' : 'Import'}
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelected} />
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-destructive" />
              <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              This will permanently delete all your current accounts, transactions, budgets, and goals, then replace them with the data from <span className="font-medium text-foreground">{pendingFile?.name}</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, Replace All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
    <div className="px-5 md:px-8 pt-12 pb-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h1 className="text-2xl font-heading">Settings</h1>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center gap-3 pb-8 mb-2">
        <div className="relative">
          <Avatar className="w-24 h-24 border-4 border-card card-shadow">
            <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-2xl font-heading bg-accent text-accent-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Larger touch target — 44px */}
          <label className="absolute bottom-0 right-0 w-11 h-11 rounded-full gradient-primary flex items-center justify-center cursor-pointer shadow-fab active:scale-95 transition-transform">
            {uploading ? <Loader2 size={16} className="animate-spin text-primary-foreground" /> : <Camera size={16} className="text-primary-foreground" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
          </label>
        </div>
        <div className="text-center">
          <p className="font-semibold text-base">{displayName || 'Your Name'}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Appearance */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Appearance</p>
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                  {theme === 'dark' ? <Moon size={17} className="text-primary" /> : <Sun size={17} className="text-primary" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Dark Mode</p>
                  <p className="text-xs text-muted-foreground">Switch between light and dark theme</p>
                </div>
              </div>
              <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
            </div>
          </div>
        </section>

        {/* Profile */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Profile</p>
          <div className="bg-card rounded-2xl p-5 card-shadow space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Display Name</label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className="h-12" />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Preferred Currency</label>
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
        </section>

        {/* Categories */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Categories</p>
          <CategoryManager />
        </section>

        {/* Currency */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Secondary Currency</p>
          <SecondaryCurrencyCard />
        </section>

        {/* Data */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Data</p>
          <DataBackupCard />
        </section>

        {/* More */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">More</p>
          <div className="space-y-2">
            <button onClick={() => navigate('/glossary')}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-card card-shadow text-foreground font-medium text-sm hover:bg-muted transition-colors">
              <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
                <BookOpen size={15} className="text-primary" />
              </div>
              Glossary & FAQ
            </button>

            <button onClick={signOut}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-card card-shadow text-destructive font-medium text-sm hover:bg-destructive/10 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <LogOut size={15} className="text-destructive" />
              </div>
              Sign Out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Settings;
