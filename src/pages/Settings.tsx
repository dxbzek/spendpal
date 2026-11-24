import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/context/CurrencyContext';
import { WORLD_CURRENCIES } from '@/utils/currencies';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';
import { exportBackup, restoreBackup, RestoreError } from '@/lib/backup';
import { ArrowLeft, Camera, Loader2, LogOut, Moon, Sun, Search, Download, Upload, AlertTriangle, BookOpen, Trash2, Wallet, Bell } from 'lucide-react';
import { UserX, ShieldCheck, FileText, Mail, ChevronRight, User, Coins, Globe, AtSign, Phone } from 'lucide-react';
import { IconButton, ListCard, SectionLabel } from '@/components/orbix';
import { cn } from '@/lib/utils';
import { OPERATOR, contactEmail } from '@/lib/operator';
import { deleteEverything, deleteAccount, clearLocalData } from '@/lib/accountDeletion';
import { userSettings } from '@/lib/userSettings';
import { leaveNotice } from '@/lib/notice';
import { useUserSetting } from '@/hooks/useUserSettings';
import CategoryManager from '@/components/settings/CategoryManager';
import ConvertCurrencyDialog from '@/components/settings/ConvertCurrencyDialog';
import MonthlyReportPrint from '@/components/reports/MonthlyReportPrint';
import ChangePasswordCard from '@/components/settings/ChangePasswordCard';
import { EMAIL_ALERTS_ENABLED } from '@/lib/notifications';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '@/context/FinanceContext';
import { PAGE_NAMES } from '@/lib/pageNames';
import { NARROW_PAGE } from '@/lib/pageLayout';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// iOS-style grouped rows: one dark card per group, hairline-split rows, each
// with a round icon, a label (and optional sub line) and a control on the right.
const RowIcon = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <span className={cn('w-10 h-10 shrink-0 rounded-full flex items-center justify-center',
    danger ? 'bg-destructive-soft text-destructive' : 'bg-muted text-foreground')}>{children}</span>
);

const Row = ({ icon, label, sub, children, className }: {
  icon: React.ReactNode; label: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; className?: string;
}) => (
  <div className={cn('flex items-center gap-3 py-3 min-h-[60px]', className)}>
    <RowIcon>{icon}</RowIcon>
    <div className="min-w-0 flex-1">
      <div className="text-[15px] font-medium">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
    {children}
  </div>
);

/** A row whose value is edited in place: small label on top, the field as the value. */
const FieldRow = ({ icon, label, htmlFor, children, trailing, sub }: {
  icon: React.ReactNode; label: string; htmlFor?: string; children: React.ReactNode; trailing?: React.ReactNode; sub?: React.ReactNode;
}) => (
  <div className="flex items-center gap-3 py-3 min-h-[64px]">
    <RowIcon>{icon}</RowIcon>
    <div className="min-w-0 flex-1">
      <label htmlFor={htmlFor} className="block text-xs text-muted-foreground">{label}</label>
      {children}
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
    {trailing}
  </div>
);

/** A whole row that is one button, with a chevron on the right. */
const LinkRow = ({ icon, label, sub, onClick, danger, disabled }: {
  icon: React.ReactNode; label: React.ReactNode; sub?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean;
}) => (
  <button type="button" onClick={onClick} disabled={disabled} className="w-full flex items-center gap-3 py-3 min-h-[60px] text-left disabled:opacity-60">
    <RowIcon danger={danger}>{icon}</RowIcon>
    <span className="min-w-0 flex-1">
      <span className={cn('block text-[15px] font-medium', danger && 'text-destructive')}>{label}</span>
      {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
    </span>
    <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
  </button>
);

// Inputs and selects drawn as plain text inside a row.
const FIELD = 'h-7 w-full px-0 py-0 border-0 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none';
const FIELD_SELECT = 'h-7 w-auto max-w-full px-0 py-0 gap-1.5 border-0 bg-transparent text-[15px] justify-start shadow-none focus:ring-0 focus:ring-offset-0';
// Small pills for a row's own action ("Save", "Update").
const ROW_BUTTON = 'h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0 inline-flex items-center justify-center disabled:opacity-50';
const ROW_BUTTON_QUIET = 'h-9 px-4 rounded-full bg-muted text-foreground text-sm font-medium shrink-0 inline-flex items-center justify-center disabled:opacity-50';
const SAVE_BUTTON = 'w-full h-12 rounded-full bg-primary text-primary-foreground text-[15px] font-medium inline-flex items-center justify-center disabled:opacity-50';

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
    <FieldRow icon={<Globe size={17} />} label="Second currency" htmlFor="second-currency">
        <Select value={secondaryCurrency || '__none__'} onValueChange={v => {
          const next = v === '__none__' ? null : v;
          setSecondaryCurrency(next);
          toast.success(next ? `Secondary currency set to ${next}` : 'Secondary currency disabled');
        }}>
          <SelectTrigger id="second-currency" className={FIELD_SELECT}>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Search currencies…" value={searchVal}
                  onChange={e => setSearchVal(e.target.value)}
                  // Radix Select's typeahead would steal focus on every keystroke.
                  onKeyDown={e => e.stopPropagation()}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <SelectItem value="__none__">None (disabled)</SelectItem>
            {filtered.filter(c => c.code !== currency).map(c => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
    </FieldRow>
  );
};
const DataBackupCard = () => {
  const { refresh } = useFinance();
  const { user } = useAuth();
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = (data: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // Read from the server, so the file holds everything, not just what this page has loaded.
      const backup = await exportBackup(supabase, user.id);
      download(backup, 'spendpal-backup');
      toast.success(`Backup downloaded: ${backup.transactions.length} transactions, ${backup.accounts.length} accounts`);
    } catch (err) {
      logger.error('Export failed', err);
      toast.error('Could not export your data. Check your connection and try again.');
    } finally {
      setExporting(false);
    }
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

    let data: unknown;
    try {
      data = JSON.parse(await pendingFile.text());
    } catch {
      toast.error('This file is not a backup: it could not be read as JSON. Nothing was changed.');
      setRestoring(false);
      setPendingFile(null);
      return;
    }

    try {
      // Checks the file, downloads a copy of what's there now, then replaces
      // everything in one database transaction: all of it, or nothing.
      const result = await restoreBackup(supabase, user.id, data,
        snapshot => download(snapshot, 'spendpal-before-restore'));
      await refresh();
      const skipped = result.skippedTransactions
        ? ` ${result.skippedTransactions} transactions had no account in the file and were left out.` : '';
      // Weekly budgets are retired, so the amounts of any in the file changed.
      const weekly = result.weeklyBudgets
        ? ` ${result.weeklyBudgets} weekly budgets were changed to monthly (weekly amount x 52 / 12).` : '';
      toast.success(`Restored ${result.accounts} accounts and ${result.transactions} transactions.${skipped}${weekly}`);
    } catch (err: unknown) {
      logger.error('Restore failed', err);
      if (err instanceof RestoreError && err.unchanged) {
        // The message names the reason and ends with "Nothing was changed."
        toast.error(err.message, { duration: 10000 });
      } else {
        // The answer from the database never arrived, so show what is there now.
        await refresh();
        // restoreBackup only throws RestoreError; anything else is a fault in this page.
        const msg = err instanceof Error ? err.message : 'Restore failed.';
        toast.error(`${msg} If your old data is gone and you want it back, import the "spendpal-before-restore" file that was just downloaded.`,
          { duration: Infinity });
      }
    } finally {
      setRestoring(false);
      setPendingFile(null);
    }
  };

  return (
    <>
      <ListCard>
        <LinkRow disabled={exporting} onClick={handleExport}
          icon={exporting ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
          label={exporting ? 'Exporting…' : 'Export'} sub="Backup file of all your data" />
        <LinkRow disabled={restoring} onClick={() => fileRef.current?.click()}
          icon={restoring ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
          label={restoring ? 'Restoring…' : 'Import'} sub="Replace everything with a backup file" />
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelected} />
      </ListCard>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-destructive" />
              <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              This replaces all your current accounts, transactions, budgets, and goals with the data from <span className="font-medium text-foreground">{pendingFile?.name}</span>. A copy of your current data is downloaded first, in case you need to go back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore} className="bg-destructive text-destructive-foreground hover:brightness-95">
              Yes, Replace All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Shown after the reload when storage would not let the photo go (the
// storage policy is not applied yet). The link stays, so the photo still shows.
const PHOTO_KEPT = 'Your data was deleted. Your profile photo could not be removed. Delete my account removes it.';

const DangerZoneCard = () => {
  const { accounts, transactions, budgets, goals, refresh } = useFinance();
  const { user } = useAuth();
  // Which delete the confirm dialog is for: every transaction, all data, or the account itself.
  const [confirming, setConfirming] = useState<'transactions' | 'everything' | 'account' | null>(null);
  const showConfirm = confirming !== null;
  const setShowConfirm = (open: boolean) => { if (!open) setConfirming(null); };
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDeleteTransactions = async () => {
    if (!user || confirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      // Server-side by user. The balance trigger reverses each row on its account.
      const { error } = await supabase.from('transactions').delete().eq('user_id', user.id);
      if (error) throw error;
      toast.success('All transactions deleted');
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Delete failed: ' + msg);
    } finally {
      setDeleting(false);
      setShowConfirm(false);
      setConfirmText('');
    }
  };

  const handleDeleteAll = async () => {
    if (!user || confirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      // Stop saving settings first: a change still waiting to be sent would
      // put back the settings row this is about to delete.
      await userSettings.discard();
      const { photo } = await deleteEverything(supabase, user.id);
      clearLocalData(localStorage, { userId: user.id });
      if (photo === 'kept') leaveNotice(PHOTO_KEPT);
      // Load the app again from nothing. Pages keep their own copies (the
      // category list, saved settings) and would show, or save back, what was
      // just deleted. The spinner stays on until the new page takes over.
      window.location.assign('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Delete failed: ' + msg);
      // The settings row may still be there: load it again.
      void userSettings.start(user.id);
      // Some tables may already be empty: show what is left.
      await refresh();
      setDeleting(false);
      setShowConfirm(false);
      setConfirmText('');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || confirmText !== 'DELETE') return;
    setDeleting(true);
    const outcome = await deleteAccount(supabase);
    if (outcome === 'deleted') {
      await userSettings.discard();
      clearLocalData(localStorage, { userId: user.id, account: true });
      // The server session went with the user. Drop the copy in this browser;
      // the app then shows the sign-in page.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      toast.success('Your account was deleted.');
      // Sign-out could not finish (no connection): a reload finds the session
      // dead and ends it.
      if (error) window.location.assign('/auth');
      return;
    }
    if (outcome === 'unavailable') toast.error('Account deletion is not available yet. Nothing was deleted.');
    else if (outcome === 'failed') toast.error('Account deletion failed. Your account still exists. Try again.');
    else toast.error('Could not reach the server. Check your connection and try again.');
    setDeleting(false);
    setShowConfirm(false);
    setConfirmText('');
  };

  const total = accounts.length + transactions.length + budgets.length + goals.length;

  const dialog = {
    transactions: {
      title: 'Delete All Transactions?',
      body: <>Deletes every transaction, older ones too. Balances are adjusted back. This <span className="font-semibold text-foreground">cannot be undone</span>.</>,
      action: 'Yes, Delete All Transactions',
      run: handleDeleteTransactions,
    },
    everything: {
      title: 'Delete All Data?',
      body: <>Deletes {accounts.length} accounts, {transactions.length} transactions, {budgets.length} budgets and {goals.length} goals, plus your categories, settings, advisor history, name, phone number and profile photo. Your sign-in stays. This <span className="font-semibold text-foreground">cannot be undone</span>.</>,
      action: 'Yes, Delete Everything',
      run: handleDeleteAll,
    },
    account: {
      title: 'Delete my account?',
      body: <>Deletes the sign-in for <span className="font-medium text-foreground break-all">{user?.email}</span> and all its data. This <span className="font-semibold text-foreground">cannot be undone</span>. Export a backup first.</>,
      action: 'Yes, delete my account',
      run: handleDeleteAccount,
    },
  }[confirming ?? 'transactions'];

  return (
    <>
      <section>
        <SectionLabel label={<span className="text-destructive">Danger Zone</span>} />
        <ListCard>
          <LinkRow danger icon={<Trash2 size={17} />} label="Delete All Transactions"
            sub="Accounts, budgets and goals stay. Balances are adjusted back."
            onClick={() => setConfirming('transactions')} />
          <LinkRow danger icon={<Trash2 size={17} />} label="Delete Everything"
            sub={`All ${total} records, categories, settings and profile. Your sign-in stays.`}
            onClick={() => setConfirming('everything')} />
          <LinkRow danger icon={<UserX size={17} />} label="Delete my account"
            sub="Your sign-in and all your data."
            onClick={() => setConfirming('account')} />
        </ListCard>
      </section>

      {/* Stays open while a delete runs: closing it would hide a delete that is still going. */}
      <AlertDialog open={showConfirm} onOpenChange={o => { if (deleting) return; setShowConfirm(o); if (!o) setConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-destructive" />
              <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            </div>
            <AlertDialogDescription>{dialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-1">
            <label className="text-xs text-muted-foreground">
              Type <span className="font-semibold text-foreground">DELETE</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              autoCapitalize="characters"
              className="mt-1 h-11 text-base"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || confirmText !== 'DELETE'}
              // Radix closes the dialog on this click by default. Keep it open so the spinner shows.
              onClick={e => { e.preventDefault(); dialog.run(); }}
              className="bg-destructive text-destructive-foreground hover:brightness-95"
            >
              {deleting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              {dialog.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const NotificationsCard = ({ userId }: { userId: string }) => {
  const [notifyEmail, setNotifyEmail] = useState(false);
  // A phone number saved while text alerts were offered. Text alerts are gone
  // (a number could not be verified), so all that is left is to remove it.
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('notify_email, phone_number').eq('user_id', userId).single().then(({ data }) => {
      if (data) {
        setNotifyEmail(data.notify_email ?? false);
        setSavedPhone(data.phone_number ?? null);
      }
    });
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      notify_email: notifyEmail,
    }).eq('user_id', userId);
    if (error) {
      toast.error('Failed to save notification settings');
    } else {
      toast.success('Notification settings saved');
    }
    setSaving(false);
  };

  const handleRemovePhone = async () => {
    setSaving(true);
    // The text-alert flag goes off with it: the database refuses the flag without a number.
    const { error } = await supabase.from('profiles').update({
      notify_sms: false,
      phone_number: null,
    }).eq('user_id', userId);
    if (error) {
      toast.error('Failed to remove the phone number');
    } else {
      setSavedPhone(null);
      toast.success('Phone number removed');
    }
    setSaving(false);
  };

  return (
    <>
      {EMAIL_ALERTS_ENABLED ? (
        <>
          <Row icon={<Mail size={17} />} label="Email alerts" sub="To your sign-in email">
            <Switch checked={notifyEmail} onCheckedChange={setNotifyEmail} aria-label="Email alerts" />
          </Row>
          <div className="py-3">
            <button type="button" onClick={handleSave} disabled={saving} className={SAVE_BUTTON}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : 'Save notifications'}
            </button>
          </div>
        </>
      ) : (
        <Row icon={<Mail size={17} />} label="Email alerts" sub="Email alerts are not available yet." />
      )}

      {savedPhone && (
        <Row icon={<Phone size={17} />} label="Phone number" sub={<>Text alerts ended. {savedPhone} is not used.</>}>
          <button type="button" onClick={handleRemovePhone} disabled={saving} className={ROW_BUTTON_QUIET}>
            Remove number
          </button>
        </Row>
      )}
    </>
  );
};

const EmailUpdateCard = ({ currentEmail }: { currentEmail: string }) => {
  const [newEmail, setNewEmail] = useState('');
  const [sending, setSending] = useState(false);

  const handleUpdate = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed) {
      toast.error('Please enter a new email address');
      return;
    }
    if (trimmed === currentEmail) {
      toast.error('New email must be different from your current email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Please enter a valid email address');
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) {
      toast.error('Failed to update email: ' + error.message);
    } else {
      toast.success('Confirmation sent! Check ' + trimmed + ' to confirm the change.');
      setNewEmail('');
    }
    setSending(false);
  };

  return (
    <FieldRow icon={<AtSign size={17} />} label="Email" htmlFor="settings-email"
      sub="Changes after you click the link we email."
      trailing={
        <button type="button" onClick={handleUpdate} disabled={sending} className={ROW_BUTTON_QUIET}>
          {sending ? <Loader2 size={15} className="animate-spin" /> : 'Update'}
        </button>
      }>
      <Input
        id="settings-email"
        type="email"
        placeholder={currentEmail}
        value={newEmail}
        onChange={e => setNewEmail(e.target.value)}
        className={FIELD}
      />
    </FieldRow>
  );
};

const Settings = () => {
  const { user, signOut } = useAuth();
  const { setCurrency: setGlobalCurrency } = useCurrency();
  const { accounts, refresh } = useFinance();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [savedCurrency, setSavedCurrency] = useState('AED');
  const [conversion, setConversion] = useState<{ from: string; to: string; allowRelabel: boolean } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  // What is typed, until saved; otherwise the saved figure from the user's settings.
  const savedIncome = useUserSetting('monthly_income');
  const [incomeDraft, setIncomeDraft] = useState<string | null>(null);
  const monthlyIncome = incomeDraft ?? (savedIncome ? String(savedIncome) : '');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const supportEmail = contactEmail(OPERATOR);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single();
        if (data) {
          setDisplayName(data.display_name || '');
          setCurrency(data.currency || 'AED');
          setSavedCurrency(data.currency || 'AED');
          setAvatarUrl(data.avatar_url);
        }
      } finally {
        setLoading(false);
      }
    })();
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
      toast.success('Avatar updated');
    }
    setUploading(false);
  };

  // Accounts still holding amounts in a currency other than the preferred one:
  // left behind when the preferred currency was changed without converting.
  const unconvertedCurrency = (() => {
    const counts = new Map<string, number>();
    for (const a of accounts) {
      if (a.currency && a.currency !== savedCurrency) counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1);
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  })();

  const saveProfile = async (nextCurrency: string) => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName.trim() || null,
      currency: nextCurrency,
    }).eq('user_id', user.id);

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      setSavedCurrency(nextCurrency);
      setGlobalCurrency(nextCurrency);
      toast.success('Profile updated');
    }
    setSaving(false);
  };

  const handleSave = () => {
    if (currency !== savedCurrency) {
      setConversion({ from: savedCurrency, to: currency, allowRelabel: true });
      return;
    }
    saveProfile(currency);
  };

  const handleConversionDone = async (converted: boolean) => {
    const target = conversion?.to ?? currency;
    setConversion(null);
    if (converted) {
      setCurrency(target);
      await refresh();
    }
    // convert_currency already set profiles.currency; this also saves the name.
    await saveProfile(target);
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
    <div className={`${NARROW_PAGE} pb-8`}>
      {/* Header: round back button, big title */}
      <div className="flex items-center gap-3 pt-[calc(env(safe-area-inset-top,0px)+20px)] md:pt-8 pb-4">
        <IconButton aria-label="Back" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="text-[1.75rem] leading-tight font-heading font-semibold tracking-tight">Settings</h1>
      </div>

      {/* Profile card */}
      <div className="bg-card rounded-3xl p-4 flex items-center gap-4 mb-7">
        <div className="relative shrink-0">
          <Avatar className="w-16 h-16">
            <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xl font-heading bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[17px] truncate">{displayName || 'Your Name'}</p>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
        </div>
        {/* 44px touch target */}
        <label aria-label="Change profile photo" className="w-11 h-11 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer">
          {uploading ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
        </label>
      </div>

      <div className="space-y-7">
        {/* Appearance */}
        <section>
          <SectionLabel label="Appearance" />
          <ListCard>
            <Row icon={theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />} label="Dark mode">
              <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} aria-label="Dark mode" />
            </Row>
            <SecondaryCurrencyCard />
          </ListCard>
        </section>

        {/* Profile */}
        <section>
          <SectionLabel label="Profile" />
          <ListCard>
            <FieldRow icon={<User size={17} />} label="Name" htmlFor="settings-name">
              <Input id="settings-name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className={FIELD} />
            </FieldRow>

            <EmailUpdateCard currentEmail={user?.email ?? ''} />

            <FieldRow icon={<Coins size={17} />} label="Currency" htmlFor="settings-currency">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="settings-currency" className={FIELD_SELECT}>
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
                        onKeyDown={e => e.stopPropagation()}
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
            </FieldRow>

            {unconvertedCurrency && unconvertedCurrency !== currency && (
              <div className="py-3 text-sm">
                <p className="text-warning">Your accounts are still in {unconvertedCurrency}, so their amounts show with the {savedCurrency} symbol unconverted.</p>
                <button
                  type="button"
                  className={cn(ROW_BUTTON, 'mt-2')}
                  onClick={() => setConversion({ from: unconvertedCurrency, to: savedCurrency, allowRelabel: false })}
                >
                  Convert {unconvertedCurrency} to {savedCurrency}
                </button>
              </div>
            )}
          </ListCard>

          <ConvertCurrencyDialog
            open={conversion !== null}
            from={conversion?.from ?? savedCurrency}
            to={conversion?.to ?? currency}
            allowRelabel={conversion?.allowRelabel}
            onDone={handleConversionDone}
            onCancel={() => setConversion(null)}
          />

          <button type="button" onClick={handleSave} disabled={saving} className={cn(SAVE_BUTTON, 'mt-3')}>
            {saving ? <Loader2 className="animate-spin" size={18} /> : 'Save'}
          </button>
        </section>

        {/* Password */}
        <section>
          <SectionLabel label="Password" />
          <ChangePasswordCard />
        </section>

        {/* Financial */}
        <section>
          <SectionLabel label="Financial" />
          <ListCard>
            <FieldRow icon={<Wallet size={17} />} label="Monthly income" htmlFor="settings-income" sub="Used by the forecast"
              trailing={
                <button
                  type="button"
                  className={ROW_BUTTON}
                  onClick={() => {
                    const val = parseFloat(monthlyIncome);
                    if (monthlyIncome === '' || (!isNaN(val) && val >= 0)) {
                      // Empty or 0 clears it: the forecast then shows no income line.
                      userSettings.set('monthly_income', val > 0 ? val : null);
                      setIncomeDraft(null);
                      toast.success(val > 0 ? 'Monthly income saved' : 'Monthly income cleared');
                    } else {
                      toast.error('Please enter a valid income amount');
                    }
                  }}
                >
                  Save
                </button>
              }>
              <Input
                id="settings-income"
                type="number"
                placeholder="e.g. 15000"
                value={monthlyIncome}
                onChange={e => setIncomeDraft(e.target.value)}
                className={cn(FIELD, 'tabular-nums')}
                min="0"
              />
            </FieldRow>
          </ListCard>
        </section>

        {/* Notifications */}
        <section>
          <SectionLabel label="Notifications" />
          <ListCard>
            <Row icon={<Bell size={17} />} label="Budget alerts" sub="At 75%, 90% and 100%, checked when you open the app" />
            <NotificationsCard userId={user!.id} />
          </ListCard>
        </section>

        {/* Categories */}
        <section>
          <CategoryManager />
        </section>

        {/* Data */}
        <section>
          <SectionLabel label="Data" />
          {/* The report card is shared with Reports; soften its corners to match. */}
          <div className="space-y-3 [&>div:first-child]:rounded-3xl [&>div:first-child]:shadow-none">
            <MonthlyReportPrint />
            <DataBackupCard />
          </div>
        </section>

        {/* More */}
        <section>
          <SectionLabel label="More" />
          <ListCard>
            <LinkRow icon={<BookOpen size={17} />} label={PAGE_NAMES['/glossary']} onClick={() => navigate('/glossary')} />
            <LinkRow icon={<ShieldCheck size={17} />} label="Privacy policy" onClick={() => navigate('/privacy')} />
            <LinkRow icon={<FileText size={17} />} label="Terms of use" onClick={() => navigate('/terms')} />

            {/* Only once the owner has filled in an inbox (src/lib/operator.ts). */}
            {supportEmail && (
              <a href={`mailto:${supportEmail}`} className="w-full flex items-center gap-3 py-3 min-h-[60px]">
                <RowIcon><Mail size={17} /></RowIcon>
                <span className="min-w-0 flex-1 text-[15px] font-medium">Contact support</span>
                <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
              </a>
            )}

            <LinkRow danger icon={<LogOut size={17} />} label="Sign out" onClick={() => setShowLogoutConfirm(true)} />
          </ListCard>
        </section>

        {/* Danger Zone */}
        <DangerZoneCard />
      </div>

      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>You will be returned to the sign-in screen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const { error } = await signOut();
                if (error) toast.error('Could not sign out. Check your connection and try again.');
              }}
              className="bg-destructive text-destructive-foreground hover:brightness-95">Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
