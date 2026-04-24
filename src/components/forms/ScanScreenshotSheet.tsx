import { useRef, useState } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, Image as ImageIcon, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { downscaleImage } from '@/utils/downscaleImage';
import { useAI } from '@/hooks/useAI';
import { useFinance } from '@/context/FinanceContext';
import { useCategories } from '@/hooks/useCategories';
import { format } from 'date-fns';

type Target = 'budget' | 'goal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Target;
}

// Two discriminated row shapes — the review UI branches on `target`.
interface BudgetRow {
  category: string;
  categoryIcon: string;
  amount: number;
  selected: boolean;
  isNewCategory: boolean;
}

interface GoalRow {
  name: string;
  icon: string;
  type: string;
  targetAmount: number;
  deadline?: string;
  selected: boolean;
}

const BudgetAIRowSchema = z.object({
  category: z.string().min(1).max(100),
  categoryIcon: z.string().min(1).default('📌'),
  amount: z.number().positive().max(10_000_000),
});

const GoalAIRowSchema = z.object({
  name: z.string().min(1).max(200),
  icon: z.string().min(1).default('🎯'),
  type: z.string().min(1).default('other'),
  targetAmount: z.number().positive().max(100_000_000),
  deadline: z.string().min(1).optional(),
});

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const ScanScreenshotSheet = ({ open, onOpenChange, target }: Props) => {
  const imageRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [goalRows, setGoalRows] = useState<GoalRow[]>([]);

  const { loading: aiLoading, extractBudgetsFromImage, extractGoalsFromImage } = useAI();
  const { addBudget, addGoal } = useFinance();
  const { categories, addCategory } = useCategories();

  const resetAll = () => {
    setImageDataUrl('');
    setImageName('');
    setStep('upload');
    setBudgetRows([]);
    setGoalRows([]);
    if (imageRef.current) imageRef.current.value = '';
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetAll();
    onOpenChange(nextOpen);
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, HEIC).');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.`);
      e.target.value = '';
      return;
    }

    setImageName(file.name);
    setProcessing(true);
    try {
      const dataUrl = await downscaleImage(file);
      setImageDataUrl(dataUrl);
    } catch (err) {
      logger.error('Image process error', err);
      toast.error('Could not read that image. Try a PNG or JPG screenshot.');
      setImageName('');
      setImageDataUrl('');
    } finally {
      setProcessing(false);
    }
  };

  const clearImage = () => {
    setImageDataUrl('');
    setImageName('');
    if (imageRef.current) imageRef.current.value = '';
  };

  const existingCategoryNames = new Set(categories.map(c => c.name.toLowerCase()));

  const handleExtract = async () => {
    if (!imageDataUrl) {
      toast.error('Please upload a screenshot');
      return;
    }

    if (target === 'budget') {
      const results = await extractBudgetsFromImage(imageDataUrl);
      if (results === null) return;
      const rows: BudgetRow[] = [];
      let invalid = 0;
      for (const r of results) {
        const parsed = BudgetAIRowSchema.safeParse(r);
        if (!parsed.success) { invalid++; continue; }
        rows.push({
          ...parsed.data,
          selected: true,
          isNewCategory: !existingCategoryNames.has(parsed.data.category.toLowerCase()),
        });
      }
      if (invalid > 0) toast.warning(`${invalid} row${invalid > 1 ? 's' : ''} skipped — AI returned invalid data`);
      if (rows.length === 0) { toast.error('No budget categories found in this screenshot.'); return; }
      setBudgetRows(rows);
      setStep('review');
    } else {
      const results = await extractGoalsFromImage(imageDataUrl);
      if (results === null) return;
      const rows: GoalRow[] = [];
      let invalid = 0;
      for (const r of results) {
        const parsed = GoalAIRowSchema.safeParse(r);
        if (!parsed.success) { invalid++; continue; }
        rows.push({ ...parsed.data, selected: true });
      }
      if (invalid > 0) toast.warning(`${invalid} row${invalid > 1 ? 's' : ''} skipped — AI returned invalid data`);
      if (rows.length === 0) { toast.error('No savings goals found in this screenshot.'); return; }
      setGoalRows(rows);
      setStep('review');
    }
  };

  const handleApplyBudgets = async () => {
    const selected = budgetRows.filter(r => r.selected);
    if (selected.length === 0) { toast.error('Select at least one row to apply.'); return; }
    const monthKey = format(new Date(), 'yyyy-MM');

    let createdCategories = 0;
    for (const row of selected) {
      if (row.isNewCategory) {
        try {
          await addCategory(row.category, row.categoryIcon, 'expense');
          createdCategories++;
        } catch (e) {
          // Non-fatal — the budget still writes even if the category create fails
          logger.error('addCategory failed during scan', e);
        }
      }
      await addBudget({
        category: row.category,
        categoryIcon: row.categoryIcon,
        amount: row.amount,
        period: 'monthly',
        month: monthKey,
      });
    }
    toast.success(
      createdCategories > 0
        ? `Added ${selected.length} budget${selected.length > 1 ? 's' : ''} (created ${createdCategories} new categor${createdCategories > 1 ? 'ies' : 'y'})`
        : `Added ${selected.length} budget${selected.length > 1 ? 's' : ''}`
    );
    handleClose(false);
  };

  const handleApplyGoals = async () => {
    const selected = goalRows.filter(r => r.selected);
    if (selected.length === 0) { toast.error('Select at least one row to apply.'); return; }
    for (const row of selected) {
      await addGoal({
        name: row.name,
        icon: row.icon,
        type: row.type,
        targetAmount: row.targetAmount,
        savedAmount: 0,
        deadline: row.deadline,
        status: 'active',
      });
    }
    toast.success(`Added ${selected.length} goal${selected.length > 1 ? 's' : ''}`);
    handleClose(false);
  };

  const title = target === 'budget' ? 'Scan budget screenshot' : 'Scan goals screenshot';
  const subtitle = target === 'budget'
    ? 'Upload a screenshot of a budget plan, envelope list, or spreadsheet. SpendPal will extract the categories and monthly amounts.'
    : 'Upload a screenshot listing savings goals with target amounts. SpendPal will extract them for review.';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">{subtitle}</p>

            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              onChange={handleImage}
              className="hidden"
            />

            {!imageDataUrl ? (
              <button
                onClick={() => imageRef.current?.click()}
                disabled={processing}
                className="w-full border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-2 hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {processing
                  ? <Loader2 size={28} className="text-muted-foreground animate-spin" />
                  : <ImageIcon size={28} className="text-muted-foreground" />}
                <span className="text-sm font-medium">Tap to upload image</span>
                <span className="text-xs text-muted-foreground">PNG, JPG, HEIC up to 20 MB</span>
              </button>
            ) : (
              <div className="relative border border-border rounded-2xl p-3 flex items-center gap-3">
                <img src={imageDataUrl} alt="preview" className="w-16 h-16 rounded-xl object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{imageName}</p>
                  <p className="text-xs text-muted-foreground">Ready to scan</p>
                </div>
                <button
                  onClick={clearImage}
                  aria-label="Remove image"
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={handleExtract}
                disabled={!imageDataUrl || aiLoading || processing}
                className="w-full h-11 gradient-primary text-primary-foreground"
              >
                {aiLoading
                  ? <><Loader2 size={16} className="animate-spin mr-2" /> Scanning…</>
                  : <><Upload size={16} className="mr-2" /> Extract {target === 'budget' ? 'budgets' : 'goals'}</>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'review' && target === 'budget' && (
          <div className="space-y-3 mt-2">
            <p className="text-xs text-muted-foreground">
              {budgetRows.length} row{budgetRows.length !== 1 ? 's' : ''} found. Uncheck any to skip; edit amounts inline. Rows tagged <span className="inline-flex items-center px-1 rounded bg-primary/10 text-primary text-[10px] font-semibold">NEW</span> will create a new category when applied.
            </p>
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {budgetRows.map((row, i) => (
                <div key={i} className={`flex items-center gap-2 p-2.5 rounded-xl border ${row.selected ? 'bg-card border-border' : 'bg-muted/30 border-transparent opacity-60'}`}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => setBudgetRows(rs => rs.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r))}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="text-xl shrink-0">{row.categoryIcon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium truncate">{row.category}</span>
                      {row.isNewCategory && (
                        <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">NEW</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">monthly budget</p>
                  </div>
                  <Input
                    type="number"
                    value={row.amount}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setBudgetRows(rs => rs.map((r, idx) => idx === i ? { ...r, amount: isNaN(v) ? 0 : v } : r));
                    }}
                    className="w-24 h-9 text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleApplyBudgets} className="gradient-primary text-primary-foreground">
                <Check size={16} className="mr-2" /> Apply {budgetRows.filter(r => r.selected).length}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'review' && target === 'goal' && (
          <div className="space-y-3 mt-2">
            <p className="text-xs text-muted-foreground">
              {goalRows.length} goal{goalRows.length !== 1 ? 's' : ''} found. Uncheck any to skip; edit targets inline.
            </p>
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {goalRows.map((row, i) => (
                <div key={i} className={`flex items-center gap-2 p-2.5 rounded-xl border ${row.selected ? 'bg-card border-border' : 'bg-muted/30 border-transparent opacity-60'}`}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => setGoalRows(rs => rs.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r))}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="text-xl shrink-0">{row.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.type}{row.deadline ? ` · by ${row.deadline}` : ''}
                    </p>
                  </div>
                  <Input
                    type="number"
                    value={row.targetAmount}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setGoalRows(rs => rs.map((r, idx) => idx === i ? { ...r, targetAmount: isNaN(v) ? 0 : v } : r));
                    }}
                    className="w-28 h-9 text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleApplyGoals} className="gradient-primary text-primary-foreground">
                <Check size={16} className="mr-2" /> Apply {goalRows.filter(r => r.selected).length}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ScanScreenshotSheet;
