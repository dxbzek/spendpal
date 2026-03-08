import { useState, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinance } from '@/context/FinanceContext';
import { useAI } from '@/hooks/useAI';
import { Upload, FileText, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  merchant: string;
  amount: number;
  date: string;
  category: string;
  categoryIcon: string;
  type: 'expense' | 'income';
  selected: boolean;
}

const ImportStatementSheet = ({ open, onOpenChange }: Props) => {
  const { accounts, addTransaction } = useFinance();
  const { loading, categorizeCSV } = useAI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [accountId, setAccountId] = useState('');
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string || '');
    reader.readAsText(file);
  };

  const handleParse = async () => {
    if (!csvText || !accountId) {
      toast.error('Please upload a file and select an account');
      return;
    }
    const results = await categorizeCSV(csvText);
    if (results.length > 0) {
      setParsed(results.map((r: Omit<ParsedRow, 'selected'>) => ({ ...r, selected: true })));
      setStep('review');
    } else {
      toast.error('Could not parse transactions from the CSV');
    }
  };

  const toggleRow = (idx: number) => {
    setParsed(p => p.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const handleImport = async () => {
    const selected = parsed.filter(r => r.selected);
    if (selected.length === 0) { toast.error('No transactions selected'); return; }

    for (const r of selected) {
      await addTransaction({
        type: r.type,
        amount: Math.abs(r.amount),
        currency: 'AED',
        category: r.category,
        categoryIcon: r.categoryIcon,
        merchant: r.merchant,
        accountId,
        date: r.date,
      });
    }

    toast.success(`Imported ${selected.length} transactions`);
    setCsvText(''); setFileName(''); setParsed([]); setStep('upload');
    onOpenChange(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) { setStep('upload'); setParsed([]); setCsvText(''); setFileName(''); }
    onOpenChange(open);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Import Bank Statement</SheetTitle>
        </SheetHeader>

        {step === 'upload' && (
          <div className="space-y-5 mt-4">
            <div>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-2xl border-2 border-dashed border-border hover:border-primary transition-colors flex flex-col items-center gap-2">
                {fileName ? (
                  <><FileText size={32} className="text-primary" /><span className="text-sm font-medium">{fileName}</span><span className="text-xs text-muted-foreground">Click to change file</span></>
                ) : (
                  <><Upload size={32} className="text-muted-foreground" /><span className="text-sm text-muted-foreground">Upload CSV bank statement</span></>
                )}
              </button>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Import to account</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (<SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleParse} disabled={!csvText || !accountId || loading}
              className="w-full h-12 text-base gradient-primary text-primary-foreground">
              {loading ? <><Loader2 size={18} className="animate-spin mr-2" /> Analyzing with AI…</> : 'Parse & Categorize'}
            </Button>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{parsed.filter(r => r.selected).length} of {parsed.length} selected</p>
              <button onClick={() => setParsed(p => p.map(r => ({ ...r, selected: !p.every(x => x.selected) })))}
                className="text-xs text-primary font-medium">Toggle All</button>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {parsed.map((row, idx) => (
                <button key={idx} onClick={() => toggleRow(idx)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${row.selected ? 'bg-accent' : 'bg-muted/50 opacity-60'}`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${row.selected ? 'border-primary bg-primary' : 'border-border'}`}>
                    {row.selected && <Check size={12} className="text-primary-foreground" />}
                  </div>
                  <span className="text-lg">{row.categoryIcon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.merchant}</p>
                    <p className="text-xs text-muted-foreground">{row.category} · {row.date}</p>
                  </div>
                  <p className={`text-sm font-heading ${row.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {row.type === 'income' ? '+' : '-'}د.إ {Math.abs(row.amount).toFixed(2)}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('upload')} className="flex-1">Back</Button>
              <Button onClick={handleImport} className="flex-1 gradient-primary text-primary-foreground">
                Import {parsed.filter(r => r.selected).length}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ImportStatementSheet;
