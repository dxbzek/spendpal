-- Migration: two hand-entered fields.
--
-- accounts.exclude_from_spendable: money sitting in a non-credit account that
-- isn't yours to spend (savings held for someone else, an emergency pot).
-- Home's "Left until payday" leaves these accounts out; net position still
-- counts them.
--
-- transactions.remaining_principal: on an instalment plan's row, the
-- principal still owed as printed on the latest statement. Installments uses
-- it for "left" instead of EMI x instalments remaining, which overstates
-- what's owed whenever the EMI includes interest.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS exclude_from_spendable BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS remaining_principal NUMERIC;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_remaining_principal_nonneg;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_remaining_principal_nonneg
  CHECK (remaining_principal IS NULL OR remaining_principal >= 0);
