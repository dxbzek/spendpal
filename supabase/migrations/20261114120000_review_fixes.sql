-- Migration: fixes from the 14 Nov 2026 review.
--
-- One file because the app changes that go with it ship together. Every
-- statement can run twice: IF NOT EXISTS, DROP ... IF EXISTS then CREATE,
-- CREATE OR REPLACE, and data updates that only touch rows still in the old
-- shape. The same statements are section 22 of supabase/pending_migrations.sql.

-- 22c. The balance trigger only moves an account that belongs to the row's
--    user. It runs as the table owner, so without this a row naming another
--    user's account moved that user's balance. Otherwise the same as before:
--    a credit account stores the amount owed, and tracking-only and pending
--    rows move nothing.
CREATE OR REPLACE FUNCTION public.sync_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC := 0;
  acct_type TEXT;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.is_tracking_only OR NEW.is_pending THEN RETURN NULL; END IF;
    SELECT type INTO acct_type FROM accounts WHERE id = NEW.account_id AND user_id = NEW.user_id;
    IF acct_type = 'credit' THEN
      delta := CASE WHEN NEW.type = 'income' THEN -NEW.amount ELSE NEW.amount END;
    ELSE
      delta := CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE -NEW.amount END;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id AND user_id = NEW.user_id;

  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.is_tracking_only OR OLD.is_pending THEN RETURN NULL; END IF;
    SELECT type INTO acct_type FROM accounts WHERE id = OLD.account_id AND user_id = OLD.user_id;
    IF acct_type = 'credit' THEN
      delta := CASE WHEN OLD.type = 'income' THEN OLD.amount ELSE -OLD.amount END;
    ELSE
      delta := CASE WHEN OLD.type = 'income' THEN -OLD.amount ELSE OLD.amount END;
    END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id AND user_id = OLD.user_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Reverse the old row's effect (if it had one), on the account it WAS
    -- posted against in case account_id changed.
    IF NOT (OLD.is_tracking_only OR OLD.is_pending) THEN
      SELECT type INTO acct_type FROM accounts WHERE id = OLD.account_id AND user_id = OLD.user_id;
      IF acct_type = 'credit' THEN
        delta := CASE WHEN OLD.type = 'income' THEN OLD.amount ELSE -OLD.amount END;
      ELSE
        delta := CASE WHEN OLD.type = 'income' THEN -OLD.amount ELSE OLD.amount END;
      END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;

    -- Apply the new row's effect (if it has one now, for example it just went
    -- from pending to settled), on the account it is NOW posted against.
    IF NOT (NEW.is_tracking_only OR NEW.is_pending) THEN
      SELECT type INTO acct_type FROM accounts WHERE id = NEW.account_id AND user_id = NEW.user_id;
      IF acct_type = 'credit' THEN
        delta := CASE WHEN NEW.type = 'income' THEN -NEW.amount ELSE NEW.amount END;
      ELSE
        delta := CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE -NEW.amount END;
      END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_account_balance() FROM PUBLIC, anon, authenticated;

-- 22d. A transaction can only be written against the writer's own account.
--    The policies checked user_id alone, which is what let a signed-in user
--    post a row on someone else's account. account_id is written with its
--    table name so it can never be read as a column of accounts.
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.account_id AND a.user_id = (select auth.uid()))
  );
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.account_id AND a.user_id = (select auth.uid()))
  );
