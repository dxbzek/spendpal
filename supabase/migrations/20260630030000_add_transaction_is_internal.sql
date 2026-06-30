-- Migration: add is_internal flag to transactions.
--
-- Internal movements (transfers between the user's own accounts, card
-- payments, BNPL/Tabby repayments, money sent to another person that isn't
-- real consumption) were only ever excluded from income/expense totals by
-- matching category = 'Transfer' as a string. That's fragile: anything not
-- explicitly tagged with that exact category — e.g. a card payment logged
-- as a plain expense, or a repayment to a person — silently counted as real
-- spending/income. is_internal is a structural flag any transaction can
-- carry, independent of its category, and becomes the authoritative signal
-- for "exclude this from spending/income totals."
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every transaction already using the Transfer convention is, by
-- definition, an internal movement.
UPDATE public.transactions SET is_internal = true WHERE category = 'Transfer';
