-- Migration: store amount OWED (not available credit) as a credit account's
-- balance, so the column means the same thing on every screen instead of
-- "available" on the Debt page and "raw balance" everywhere else.
--
-- One-time data fix: for credit accounts that have a credit_limit set, the
-- stored balance currently holds *available* credit (credit_limit - owed).
-- Converting to owed is a self-inverse transform: new = credit_limit - old.
-- Credit accounts without a credit_limit already store owed directly under
-- the app's existing fallback convention, so they're left untouched.
UPDATE public.accounts
SET balance = credit_limit - balance
WHERE type = 'credit' AND credit_limit IS NOT NULL;

-- Update the balance-sync trigger: for credit accounts, an expense now
-- increases the amount owed and an income (a card payment or refund)
-- decreases it — the mirror image of the non-credit sign convention, since
-- the stored value's meaning flipped from "available" to "owed".
CREATE OR REPLACE FUNCTION public.sync_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC := 0;
  acct_type TEXT;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.is_tracking_only THEN RETURN NULL; END IF;
    SELECT type INTO acct_type FROM accounts WHERE id = NEW.account_id;
    IF acct_type = 'credit' THEN
      delta := CASE WHEN NEW.type = 'income' THEN -NEW.amount ELSE NEW.amount END;
    ELSE
      delta := CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE -NEW.amount END;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;

  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.is_tracking_only THEN RETURN NULL; END IF;
    SELECT type INTO acct_type FROM accounts WHERE id = OLD.account_id;
    IF acct_type = 'credit' THEN
      delta := CASE WHEN OLD.type = 'income' THEN OLD.amount ELSE -OLD.amount END;
    ELSE
      delta := CASE WHEN OLD.type = 'income' THEN -OLD.amount ELSE OLD.amount END;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Reverse old row's effect (if it was not tracking-only), using the
    -- account it WAS posted against in case account_id changed.
    IF NOT OLD.is_tracking_only THEN
      SELECT type INTO acct_type FROM accounts WHERE id = OLD.account_id;
      IF acct_type = 'credit' THEN
        delta := CASE WHEN OLD.type = 'income' THEN OLD.amount ELSE -OLD.amount END;
      ELSE
        delta := CASE WHEN OLD.type = 'income' THEN -OLD.amount ELSE OLD.amount END;
      END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;
    END IF;

    -- Apply new row's effect (if it is not tracking-only), using the
    -- account it's NOW posted against.
    IF NOT NEW.is_tracking_only THEN
      SELECT type INTO acct_type FROM accounts WHERE id = NEW.account_id;
      IF acct_type = 'credit' THEN
        delta := CASE WHEN NEW.type = 'income' THEN -NEW.amount ELSE NEW.amount END;
      ELSE
        delta := CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE -NEW.amount END;
      END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
