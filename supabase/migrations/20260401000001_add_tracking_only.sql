-- Migration: Add is_tracking_only flag to transactions
-- Tracking-only transactions are from external sources (CC, Tabby) and
-- should not affect account balance, budgets, or transaction history.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_tracking_only BOOLEAN NOT NULL DEFAULT false;

-- Update trigger to skip balance changes for tracking-only rows
CREATE OR REPLACE FUNCTION public.sync_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC := 0;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.is_tracking_only THEN RETURN NULL; END IF;
    IF NEW.type = 'income' THEN
      delta := NEW.amount;
    ELSE
      delta := -NEW.amount;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;

  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.is_tracking_only THEN RETURN NULL; END IF;
    IF OLD.type = 'income' THEN
      delta := -OLD.amount;
    ELSE
      delta := OLD.amount;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Reverse old row's effect (if it was not tracking-only)
    IF NOT OLD.is_tracking_only THEN
      IF OLD.type = 'income' THEN
        delta := -OLD.amount;
      ELSE
        delta := OLD.amount;
      END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;
    END IF;

    -- Apply new row's effect (if it is not tracking-only)
    IF NOT NEW.is_tracking_only THEN
      IF NEW.type = 'income' THEN
        delta := NEW.amount;
      ELSE
        delta := -NEW.amount;
      END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
