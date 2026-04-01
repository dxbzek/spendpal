-- Add loan_total_amount to transactions for accurate installment tracking.
-- This stores the actual total principal of a loan (as stated on the loan
-- agreement), so remaining balance can be calculated correctly rather than
-- approximating via perInstallment × totalInstallments.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS loan_total_amount NUMERIC(15, 2) NULL;
