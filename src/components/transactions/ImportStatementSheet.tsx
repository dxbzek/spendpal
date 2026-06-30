import { useState, useRef, useEffect } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useFinance } from '@/context/FinanceContext';
import { useAI } from '@/hooks/useAI';
import { useCurrency } from '@/context/CurrencyContext';
import { Upload, FileText, Loader2, Check, Image as ImageIcon, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { downscaleImage } from '@/utils/downscaleImage';
import { normalizeDate } from '@/lib/finance/normalizeDate';

// Chunk large statement text into ~10k-char pieces split on line boundaries.
function chunkText(text: string, maxChunkSize = 10_000): string[] {
  if (text.length <= maxChunkSize) return [text];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > maxChunkSize && current.length > 0) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Zod schema for AI-returned rows - validates before inserting to DB
const AIRowSchema = z.object({
  merchant: z.string().min(1).max(200),
  amount: z.number().positive().max(10_000_000),
  date: z.string().min(1),
  category: z.string().min(1).max(100),
  categoryIcon: z.string().min(1).default('💳'),
  type: z.enum(['expense', 'income']),
});

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

async function extractPdfText(file: File, onPageProgress?: (current: number, total: number) => void): Promise<string> {
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
    onPageProgress?.(i, pageCount);
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
 *  3. A standalone amount line (e.g. "43.76" or "2,900.00CR") - needed for
 *     column-format PDFs where amounts appear on their own line
 *
 * Everything else - legal disclaimers, conditions, bank contact info,
 * marketing text - is far from any transaction date and gets dropped.
 * This keeps the payload small and focused for the AI.
 */
function cleanStatementText(text: string): string {
  const allLines = text.split('\n').map(l => l.trim());
  const txDateRe = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:\d{2}|\d{4})|\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-,\s]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[\s,]+\d{1,2}[\s,]+\d{2,4})(?:[\sT]\d{1,2}:\d{2}(?::\d{2})?)?\b/i;
  const amountOnlyRe = /^[\d,]+\.\d{2}\s*(CR|DR|AED|USD|EUR|GBP)?\s*$/i;
  const borderRe = /^[+=|*~_.\s-]+$/;

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

const ImportStatementSheet = ({ open, onOpenChange }: Props) => {
  const { accounts, transactions, bulkAddTransactions, updateAccount } = useFinance();
  const { loading, categorizeStatement, categorizeStatementBatch, categorizeImage } = useAI();
  const { currency, symbol, fmt } = useCurrency();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [statementText, setStatementText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [accountId, setAccountId] = useState('');
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [inputMode, setInputMode] = useState<'file' | 'paste' | 'screenshot'>('file');
  const [pasteText, setPasteText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [lastFailedImage, setLastFailedImage] = useState<string | null>(null);

  // Pre-warm PDF and XLSX workers when the dialog opens while the user picks an account.
  useEffect(() => {
    if (!open) return;
    import('pdfjs-dist').catch(() => {/* intentional fire-and-forget */});
    import('xlsx').catch(() => {/* intentional fire-and-forget */});
  }, [open]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Guard against large files being loaded into memory before the
    // 512KB edge-function payload limit would reject the processed text.
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`);
      e.target.value = '';
      return;
    }

    setFileName(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    setParsing(true);
    try {
      let text = '';
      if (ext === 'pdf') {
        setPdfProgress(null);
        text = await extractPdfText(file, (current, total) => setPdfProgress({ current, total }));
        setPdfProgress(null);
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

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, HEIC).');
      e.target.value = '';
      return;
    }

    // Pre-downscale guard. HEIC and very large phone shots can exceed browser
    // decode limits; 20 MB is a comfortable ceiling.
    const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.`);
      e.target.value = '';
      return;
    }

    setImageName(file.name);
    setParsing(true);
    try {
      const dataUrl = await downscaleImage(file);
      setImageDataUrl(dataUrl);
    } catch (err) {
      logger.error('Image process error', err);
      toast.error('Could not read that image. Try a PNG or JPG screenshot.');
      setImageName('');
      setImageDataUrl('');
    } finally {
      setParsing(false);
    }
  };

  const clearImage = () => {
    setImageDataUrl('');
    setImageName('');
    if (imageRef.current) imageRef.current.value = '';
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

  const processResults = (results: unknown[]) => {
    const rows: ParsedRow[] = [];
    let invalidCount = 0;
    for (const r of results) {
      const parsed = AIRowSchema.safeParse(r);
      if (!parsed.success) {
        invalidCount++;
        logger.error('AI returned invalid row', { error: parsed.error.issues });
        continue;
      }
      const normalized = { ...parsed.data, date: normalizeDate(parsed.data.date) };
      const isDup = isDuplicateTransaction(normalized);
      rows.push({ ...normalized, selected: !isDup, isDuplicate: isDup });
    }
    if (invalidCount > 0) {
      toast.warning(`${invalidCount} row${invalidCount > 1 ? 's' : ''} skipped — AI returned invalid data`);
    }
    return rows;
  };

  const handleParse = async (retryText?: string, retryImage?: string) => {
    setLastFailedText(null);
    setLastFailedImage(null);

    if (!accountId) {
      toast.error('Please select an account');
      return;
    }

    let results: unknown[] | null;
    if (inputMode === 'screenshot') {
      const img = retryImage ?? imageDataUrl;
      if (!img) {
        toast.error('Please upload a screenshot');
        return;
      }
      results = await categorizeImage(img);
      if (results === null) { setLastFailedImage(img); return; }
    } else {
      const raw = retryText ?? (inputMode === 'paste' ? pasteText : statementText);
      if (!raw) {
        toast.error(inputMode === 'paste' ? 'Please paste some text' : 'Please upload a file');
        return;
      }
      const textToProcess = cleanStatementText(raw);
      if (textToProcess.replace(/\s/g, '').length < 30) {
        if (inputMode === 'file') {
          toast.error('Could not extract text from this PDF. If it is a scanned/image PDF, use the Screenshot tab instead.');
        } else {
          toast.error('The pasted content looks like a footer or table border — no transaction rows found. Copy the full statement table including dates and amounts, not just the bottom of the page.');
        }
        return;
      }
      const chunks = chunkText(textToProcess);
      if (chunks.length > 1) {
        setChunkProgress({ current: 0, total: chunks.length });
        results = await categorizeStatementBatch(chunks, (current, total) => setChunkProgress({ current, total }));
        setChunkProgress(null);
      } else {
        results = await categorizeStatement(textToProcess);
      }
      if (results === null) { setLastFailedText(raw); return; }
    }

    if (results === null) return;
    if (results.length > 0) {
      const rows = processResults(results);
      if (rows.length === 0) {
        toast.error('No valid transactions found after parsing.');
        return;
      }
      setParsed(rows);
      const dupCount = rows.filter(r => r.isDuplicate).length;
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

    const selectedDupes = selected.filter(r => r.isDuplicate);
    if (selectedDupes.length > 0) {
      toast.warning(`Importing ${selectedDupes.length} row${selectedDupes.length > 1 ? 's' : ''} flagged as potential duplicates`);
    }

    await bulkAddTransactions(selected.map(r => ({
      type: r.type,
      amount: Math.abs(r.amount),
      currency,
      category: r.category,
      categoryIcon: r.categoryIcon,
      merchant: r.merchant,
      accountId,
      date: r.date,
      // The AI categorizer can tag a row 'Transfer' (card payment, BNPL
      // repayment); without this it would silently count as real
      // income/expense everywhere that now gates on isInternal.
      isInternal: r.category === 'Transfer',
    })));

    navigator.vibrate?.(100);
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
    setImageDataUrl(''); setImageName(''); setLastFailedText(null); setLastFailedImage(null);
    setPdfProgress(null); setChunkProgress(null);
    onOpenChange(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep('upload'); setParsed([]); setStatementText(''); setFileName(''); setPasteText('');
      setImageDataUrl(''); setImageName(''); setLastFailedText(null); setLastFailedImage(null);
      setPdfProgress(null); setChunkProgress(null);
    }
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
                  File
                </button>
                <button
                  onClick={() => setInputMode('paste')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${inputMode === 'paste' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  Paste
                </button>
                <button
                  onClick={() => setInputMode('screenshot')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${inputMode === 'screenshot' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  Screenshot
                </button>
              </div>

              {inputMode === 'file' && (
                <div>
                  <input ref={fileRef} type="file" accept=".csv,.txt,.pdf,.xlsx,.xls" onChange={handleFile} className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full py-8 rounded-2xl border-2 border-dashed border-border hover:border-primary transition-colors flex flex-col items-center gap-2">
                    {parsing ? (
                      <>
                        <Loader2 size={32} className="text-primary animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          {pdfProgress ? `Reading page ${pdfProgress.current} of ${pdfProgress.total}…` : 'Reading file…'}
                        </span>
                      </>
                    ) : fileName ? (
                      <><FileText size={32} className="text-primary" /><span className="text-sm font-medium">{fileName}</span><span className="text-xs text-muted-foreground">Click to change file</span></>
                    ) : (
                      <><Upload size={32} className="text-muted-foreground" /><span className="text-sm text-muted-foreground">Upload CSV, PDF, or Excel statement</span></>
                    )}
                  </button>
                </div>
              )}

              {inputMode === 'paste' && (
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

              {inputMode === 'screenshot' && (
                <div>
                  <input ref={imageRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
                  {imageDataUrl ? (
                    <div className="relative w-full rounded-2xl border border-border overflow-hidden bg-muted/30">
                      <img src={imageDataUrl} alt={imageName || 'Screenshot preview'} className="w-full max-h-64 object-contain" />
                      <button
                        onClick={clearImage}
                        aria-label="Remove screenshot"
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/90 hover:bg-background border border-border flex items-center justify-center"
                      >
                        <X size={14} />
                      </button>
                      <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border bg-card">
                        {imageName || 'Screenshot ready'} — AI will extract transactions next
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => imageRef.current?.click()}
                      className="w-full py-8 rounded-2xl border-2 border-dashed border-border hover:border-primary transition-colors flex flex-col items-center gap-2">
                      {parsing ? (
                        <><Loader2 size={32} className="text-primary animate-spin" /><span className="text-sm text-muted-foreground">Processing image…</span></>
                      ) : (
                        <>
                          <ImageIcon size={32} className="text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Upload a screenshot of your statement</span>
                          <span className="text-xs text-muted-foreground">PNG, JPG, HEIC · auto-downscaled before upload</span>
                        </>
                      )}
                    </button>
                  )}
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
              <div className="space-y-2">
                <Button
                  onClick={() => handleParse()}
                  disabled={
                    (inputMode === 'file' && !statementText) ||
                    (inputMode === 'paste' && !pasteText) ||
                    (inputMode === 'screenshot' && !imageDataUrl) ||
                    !accountId || loading || parsing
                  }
                  className="w-full h-12 text-base gradient-primary text-primary-foreground"
                >
                  {loading
                    ? <>
                        <Loader2 size={18} className="animate-spin mr-2" />
                        {chunkProgress
                          ? `Analyzing chunk ${chunkProgress.current} of ${chunkProgress.total}…`
                          : 'Analyzing with AI…'}
                      </>
                    : 'Parse & Categorize'}
                </Button>
                {(lastFailedText || lastFailedImage) && !loading && (
                  <Button
                    variant="outline"
                    onClick={() => handleParse(lastFailedText ?? undefined, lastFailedImage ?? undefined)}
                    className="w-full h-10"
                  >
                    <RefreshCw size={15} className="mr-2" /> Try Again
                  </Button>
                )}
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="flex flex-col mt-4" style={{ minHeight: 0 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">{parsed.filter(r => r.selected).length} of {parsed.length} selected</p>
                <div className="flex items-center gap-2">
                  {parsed.some(r => r.isDuplicate) && (
                    <Badge variant="outline" className="text-xs text-warning border-warning/40">
                      {parsed.filter(r => r.isDuplicate).length} duplicates
                    </Badge>
                  )}
                  <button onClick={() => setParsed(p => p.map(r => ({ ...r, selected: !p.every(x => x.selected) })))}
                    className="text-xs text-primary font-medium">Toggle All</button>
                </div>
              </div>
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '40vh' }}>
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
              <div className="flex gap-3 pt-4 sticky bottom-0 bg-card pb-1">
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
