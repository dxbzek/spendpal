-- Migration: add a per-account APR so the Debt payoff optimizer can use each
-- card's real interest rate instead of a single hardcoded default (20%) for
-- every card — including 0%-interest BNPL providers like Tabby, where the
-- old default badly overstated interest owed and payoff time.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS apr NUMERIC;

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_apr_nonneg;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_apr_nonneg
  CHECK (apr IS NULL OR apr >= 0);
