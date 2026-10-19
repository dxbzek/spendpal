-- Migration: remember "Not a duplicate" on a transaction.
--
-- Same merchant + amount a few days apart is often two real charges (taxi
-- rides, government fees). Once the user says so, Transactions stops flagging
-- that row. A dismissed row can still be the match that flags a later
-- re-import of the same charge.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS dupe_dismissed BOOLEAN NOT NULL DEFAULT false;
