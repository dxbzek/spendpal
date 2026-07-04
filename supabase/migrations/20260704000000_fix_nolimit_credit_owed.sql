-- Migration: fix credit accounts WITHOUT a credit_limit, which the
-- 20260630010000 "store owed" migration left untouched.
--
-- That migration flipped only limit-bearing rows (balance = credit_limit -
-- balance) on the assumption that no-limit credit accounts "already store owed
-- directly." They don't: the prior balance trigger (20260331000001) maintained
-- ALL credit balances as SUM(income - expense) — an available-style running
-- total — so a used no-limit card's stored balance is NEGATIVE of what it owes,
-- not the owed amount. The new owed-convention trigger then accumulates in the
-- opposite direction from that stale base, and NetWorth/Debt read the negative
-- value as a phantom asset while owed shrinks as the user spends.
--
-- Recompute owed directly from the ledger under the new sign convention
-- (credit: expense increases owed, income decreases it), matching exactly the
-- rows the balance trigger acts on (posted = not tracking-only, not pending).
-- Idempotent: recomputing from transactions always yields the same result, and
-- it only touches no-limit credit accounts, so limit-bearing rows already fixed
-- by 20260630010000 are left as-is.
UPDATE public.accounts a
SET balance = COALESCE((
  SELECT SUM(CASE WHEN t.type = 'income' THEN -t.amount ELSE t.amount END)
  FROM public.transactions t
  WHERE t.account_id = a.id
    AND NOT t.is_tracking_only
    AND NOT t.is_pending
), 0)
WHERE a.type = 'credit' AND a.credit_limit IS NULL;
