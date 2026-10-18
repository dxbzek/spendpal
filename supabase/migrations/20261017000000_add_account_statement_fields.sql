-- Migration: what the card's latest statement actually asks for, entered by
-- hand from the statement. Home shows these numbers as-is instead of deriving
-- an "amount due" from transactions and instalment plans, which can't see
-- what the bank put on the statement.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS statement_total_due NUMERIC,
  ADD COLUMN IF NOT EXISTS statement_min_due NUMERIC,
  ADD COLUMN IF NOT EXISTS statement_due_on DATE;

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_statement_due_nonneg;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_statement_due_nonneg
  CHECK (
    (statement_total_due IS NULL OR statement_total_due >= 0) AND
    (statement_min_due IS NULL OR statement_min_due >= 0)
  );
