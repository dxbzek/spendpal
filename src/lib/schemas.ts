import { z } from 'zod';
import { logger } from '@/lib/logger';

// ─── Raw DB row schemas (what Supabase returns) ───────────────────────────────

export const AccountRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['cash', 'debit', 'credit']),
  balance: z.union([z.number(), z.string()]).transform(Number),
  currency: z.string().min(1),
  icon: z.string(),
  credit_limit: z.union([z.number(), z.string(), z.null()]).optional().transform(v =>
    v != null ? Number(v) : undefined
  ),
  due_date: z.number().nullable().optional().transform(v => v ?? undefined),
  statement_date: z.number().nullable().optional().transform(v => v ?? undefined),
});

export const TransactionRowSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['expense', 'income', 'transfer']),
  amount: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive()),
  currency: z.string().min(1),
  category: z.string().min(1),
  category_icon: z.string(),
  merchant: z.string(),
  account_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  note: z.string().nullable().optional().transform(v => v ?? undefined),
  is_recurring: z.boolean().optional().default(false),
  total_installments: z.number().nullable().optional(),
  current_installment: z.number().nullable().optional(),
  loan_total_amount: z.union([z.number(), z.string(), z.null()]).optional().transform(v =>
    v != null && v !== '' ? Number(v) : null
  ),
  is_tracking_only: z.boolean().optional().default(false),
});

export const BudgetRowSchema = z.object({
  id: z.string().uuid(),
  category: z.string().min(1),
  category_icon: z.string(),
  amount: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive()),
  period: z.enum(['monthly', 'weekly']),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
  is_fixed: z.boolean().optional().default(false),
});

export const GoalRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  icon: z.string(),
  type: z.string().min(1),
  target_amount: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive()),
  saved_amount: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().min(0)),
  deadline: z.string().nullable().optional().transform(v => v ?? undefined),
  status: z.enum(['active', 'completed', 'paused']),
});

// ─── Safe parse helpers (return null on failure) ──────────────────────────────

export type AccountRow = z.infer<typeof AccountRowSchema>;
export type TransactionRow = z.infer<typeof TransactionRowSchema>;
export type BudgetRow = z.infer<typeof BudgetRowSchema>;
export type GoalRow = z.infer<typeof GoalRowSchema>;

export function safeParseRow<T>(
  schema: z.ZodType<T>,
  row: unknown,
  label: string
): T | null {
  const result = schema.safeParse(row);
  if (!result.success) {
    logger.warn(`Invalid ${label} row`, result.error.flatten());
    return null;
  }
  return result.data;
}
