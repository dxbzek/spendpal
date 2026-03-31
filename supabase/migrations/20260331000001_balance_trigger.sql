-- Migration: Add DB trigger for atomic account balance updates
-- This replaces the race-prone client-side read-modify-write pattern.

CREATE OR REPLACE FUNCTION public.sync_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC := 0;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.type = 'income' THEN
      delta := NEW.amount;
    ELSE
      delta := -NEW.amount;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;

  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.type = 'income' THEN
      delta := -OLD.amount;
    ELSE
      delta := OLD.amount;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Reverse old row's effect on the (possibly old) account
    IF OLD.type = 'income' THEN
      delta := -OLD.amount;
    ELSE
      delta := OLD.amount;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;

    -- Apply new row's effect on the (possibly new) account
    IF NEW.type = 'income' THEN
      delta := NEW.amount;
    ELSE
      delta := -NEW.amount;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_balance();

-- Recalculate all existing account balances from transactions to ensure consistency
UPDATE public.accounts a
SET balance = COALESCE((
  SELECT SUM(
    CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END
  )
  FROM public.transactions t
  WHERE t.account_id = a.id
), 0);
