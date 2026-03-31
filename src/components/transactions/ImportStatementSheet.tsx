import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useFinance } from '@/context/FinanceContext';
import { useAI } from '@/hooks/useAI';
import { useCurrency } from '@/context/CurrencyContext';
import { Upload, FileText, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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
  isDuplicate?: boolean;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Use the statically-imported worker URL so Vite bundles and serves the
  // worker file correctly in production (the ?url import copies it to output).
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  // Process up to 30 pages to avoid timeouts on large statements.
  const pageCount = Math.min(pdf.numPages, 30);

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items by approximate Y coordinate.
    // PDF Y is bottom-up, so sort descending (top of page first).
    // Use a 3-unit tolerance band to handle font-baseline micro-shifts
    // that cause items on the same visual row to have slightly different Ys.
    const lineMap = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str.trim()) continue;
      const rawY = item.transform[5];
      const x = item.transform[4];
      // Find an existing bucket within ±3 units, or create a new one.
      const bucketY = Array.from(lineMap.keys()).find(k => Math.abs(k - rawY) <= 3) ?? Math.round(rawY);
      if (!lineMap.has(bucketY)) lineMap.set(bucketY, []);
      lineMap.get(bucketY)!.push({ x, str: item.str });
    }

    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lines = sortedYs.map(y =>
      lineMap.get(y)!.sort((a, b) => a.x - b.x).map(it => it.str).join('  ')
    );
    pages.push(lines.join('\n'));
  }

  return pages.join('\n\n');
}

async function extractExcelText(file: File): Promise<string> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(firstSheet);
}

/**
 * Smart pre-filter for bank statement text.
 *
 * Keeps ONLY lines that are:
 *  1. A transaction row containing a date (DD/MM/YYYY)
 *  2. Within 12 lines of a date-bearing line (catches merchants, amounts,
 *     FX conversion notes that appear near transaction rows)
 *  3. A standalone amount line (e.g. "43.76" or "2,900.00CR") — needed for
 *     column-format PDFs where amounts appear on their own line
 *
 * Everything else — legal disclaimers, conditions, bank contact info,
 * marketing text — is far from any transaction date and gets dropped.
 * This keeps the payload small and focused for the AI.
 */
function cleanStatementText(text: string): string {
  const allLines = text.split('\n').map(l => l.trim());
  const txDateRe = /\b\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})\b/;
  const amountOnlyRe = /^[\d,]+\.\d{2}\s*(CR|DR|AED|USD|EUR|GBP)?\s*$/i;
  const borderRe = /^[\+\-\=\|\*\~\_\.\s]+$/;

  const hasDate = allLines.map(l => txDateRe.test(l));

  return allLines
    .filter((line, i) => {
      if (!line) return false;
      if (borderRe.test(line)) return false;
      if (!/[a-zA-Z0-9]/.test(line)) return false;
      // Always keep lines that contain a date
      if (hasDate[i]) return true;
      // Keep standalone amount lines (column-format tables)
      if (amountOnlyRe.test(line)) return true;
      // Keep lines within 12 lines of any date line
      const lo = Math.max(0, i - 12);
      const hi = Math.min(allLines.length - 1, i + 12);
      for (let j = lo; j <= hi; j++) {
        if (hasDate[j]) return true;
      }
      return false;
    })
    .map(line => line.replace(/\s{5,}/g, '    '))
    .join('\n');
}

function normalizeDate(d: string): string {
  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = d.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  // MM/DD/YYYY fallback
  const mdy = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  return d;
}

const ImportStatementSheet = ({ open, onOpenChange }: Props) => {
  const { accounts, transactions, bulkAddTransactions, updateAccount } = useFinance();
  const { loading, categorizeStatement } = useAI();
  const { currency, symbol, fmt } = useCurrency();
  const fileRef = useRef<HTMLInputElement>(null);
  const [statementText, setStatementText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [accountId, setAccountId] = useState('');
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    setParsing(true);
    try {
      let text = '';
      if (ext === 'pdf') {
        text = await extractPdfText(file);
        if (text.replace(/\s/g, '').length < 50) {
          toast.error('This PDF appears to be image-based (scanned). Please export as text or use the Paste Text option.');
          setFileName('');
          return;
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        text = await extractExcelText(file);
      } else {
        text = await file.text();
      }
      // Truncate to ~60 000 chars to stay within AI context limits
      if (text.length > 60_000) {
        text = text.slice(0, 60_000);
        toast.warning('Statement truncated to first 60 000 characters. For best results, export a shorter date range.');
      }
      setStatementText(text);
    } catch (err) {
      logger.error('File parse error', err);
      toast.error('Failed to read file. Please try a different format.');
      setFileName('');
    } finally {
      setParsing(false);
    }
  };

  const isDuplicateTransaction = (row: Omit<ParsedRow, 'selected' | 'isDuplicate'>) => {
    return transactions.some(t =>
      t.accountId === accountId &&
      Math.abs(t.amount) === Math.abs(row.amount) &&
      t.date === row.date &&
      t.merchant.toLowerCase().trim() === row.merchant.toLowerCase().trim() &&
      t.type === row.type
    );
  };

  const handleParse = async () => {
    const raw = inputMode === 'paste' ? pasteText : statementText;
    if (!raw || !accountId) {
      toast.error(inputMode === 'paste' ? 'Please paste some text and select an account' : 'Please upload a file and select an account');
      return;
    }
    const textToProcess = cleanStatementText(raw);
    if (textToProcess.replace(/\s/g, '').length < 30) {
      if (inputMode === 'file') {
        toast.error('Could not extract text from this PDF. If it is a scanned/image PDF, open it in your browser, select all (Ctrl+A), copy, then use the Paste Text tab.');
      } else {
        toast.error('The pasted content looks like a footer or table border — no transaction rows found. Copy the full statement table including dates and amounts, not just the bottom of the page.');
      }
      return;
    }
    const results = await categorizeStatement(textToProcess);
    if (results === null) return; // fetch/network error already shown by useAI
    if (results.length > 0) {
      const rows = results.map((r: Omit<ParsedRow, 'selected' | 'isDuplicate'>) => {
        const normalized = { ...r, date: normalizeDate(r.date) };
        const isDup = isDuplicateTransaction(normalized);
        return { ...normalized, selected: !isDup, isDuplicate: isDup };
      });
      setParsed(rows);
      const dupCount = rows.filter((r: ParsedRow) => r.isDuplicate).length;
      if (dupCount > 0) {
        toast.warning(`${dupCount} potential duplicate${dupCount > 1 ? 's' : ''} detected and deselected`);
      }
      setStep('review');
    } else {
      toast.error('No transactions found. Make sure the text includes dates, merchant names, and amounts — not just headers or footers.');
    }
  };

  const toggleRow = (idx: number) => {
    setParsed(p => p.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const handleImport = async () => {
    const selected = parsed.filter(r => r.selected);
    if (selected.length === 0) { toast.error('No transactions selected'); return; }

    await bulkAddTransactions(selected.map(r => ({
      type: r.type,
      amount: Math.abs(r.amount),
      currency,
      category: r.category,
      categoryIcon: r.categoryIcon,
      merchant: r.merchant,
      accountId,
      date: r.date,
    })));

    toast.success(`Imported ${selected.length} transactions`);
    
    // Show balance confirmation dialog
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setBalanceInput(String(account.balance));
      setShowBalanceDialog(true);
    } else {
      resetAndClose();
    }
  };

  const handleBalanceConfirm = async () => {
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      const newBalance = parseFloat(balanceInput);
      if (!isNaN(newBalance) && newBalance !== account.balance) {
        await updateAccount({ ...account, balance: newBalance });
        toast.success('Account balance updated');
      }
    }
    setShowBalanceDialog(false);
    resetAndClose();
  };

  const resetAndClose = () => {
    setStatementText(''); setFileName(''); setParsed([]); setStep('upload'); setPasteText('');
    onOpenChange(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) { setStep('upload'); setParsed([]); setStatementText(''); setFileName(''); setPasteText(''); }
    onOpenChange(open);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Import Bank Statement</DialogTitle>
          </DialogHeader>

          {step === 'upload' && (
            <div className="space-y-5 mt-4">
              {/* Mode toggle */}
              <div className="flex p-0.5 bg-muted rounded-xl">
                <button
                  onClick={() => setInputMode('file')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${inputMode === 'file' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  Upload File
                </button>
                <button
                  onClick={() => setInputMode('paste')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${inputMode === 'paste' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  Paste Text
                </button>
              </div>

              {inputMode === 'file' ? (
                <div>
                  <input ref={fileRef} type="file" accept=".csv,.txt,.pdf,.xlsx,.xls" onChange={handleFile} className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full py-8 rounded-2xl border-2 border-dashed border-border hover:border-primary transition-colors flex flex-col items-center gap-2">
                    {parsing ? (
                      <><Loader2 size={32} className="text-primary animate-spin" /><span className="text-sm text-muted-foreground">Reading file…</span></>
                    ) : fileName ? (
                      <><FileText size={32} className="text-primary" /><span className="text-sm font-medium">{fileName}</span><span className="text-xs text-muted-foreground">Click to change file</span></>
                    ) : (
                      <><Upload size={32} className="text-muted-foreground" /><span className="text-sm text-muted-foreground">Upload CSV, PDF, or Excel statement</span></>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Paste bank statement text</label>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Paste CSV rows, copied table text, or any bank statement format…"
                    rows={7}
                    className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              )}

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Import to account</label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (<SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleParse}
                disabled={(inputMode === 'file' ? !statementText : !pasteText) || !accountId || loading || parsing}
                className="w-full h-12 text-base gradient-primary text-primary-foreground"
              >
                {loading ? <><Loader2 size={18} className="animate-spin mr-2" /> Analyzing with AI…</> : 'Parse & Categorize'}
              </Button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{parsed.filter(r => r.selected).length} of {parsed.length} selected</p>
                <div className="flex items-center gap-2">
                  {parsed.some(r => r.isDuplicate) && (
                    <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">
                      {parsed.filter(r => r.isDuplicate).length} duplicates
                    </Badge>
                  )}
                  <button onClick={() => setParsed(p => p.map(r => ({ ...r, selected: !p.every(x => x.selected) })))}
                    className="text-xs text-primary font-medium">Toggle All</button>
                </div>
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{row.merchant}</p>
                        {row.isDuplicate && <Badge variant="outline" className="text-[10px] px-1 py-0 border-destructive text-destructive">Dup</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{row.category} · {row.date}</p>
                    </div>
                    <p className={`text-sm font-heading ${row.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {row.type === 'income' ? '+' : '-'}{fmt(Math.abs(row.amount))}
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
        </DialogContent>
      </Dialog>

      <Dialog open={showBalanceDialog} onOpenChange={setShowBalanceDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Account Balance</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Since these are historical transactions, your balance wasn't adjusted. What is your current account balance?
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{symbol}</span>
            <Input
              type="number"
              step="0.01"
              value={balanceInput}
              onChange={e => setBalanceInput(e.target.value)}
              className="flex-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBalanceDialog(false); resetAndClose(); }}>
              Skip
            </Button>
            <Button onClick={handleBalanceConfirm} className="gradient-primary text-primary-foreground">
              Update Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImportStatementSheet;
