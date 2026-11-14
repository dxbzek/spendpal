-- Migration: fixes from the 14 Nov 2026 review.
--
-- One file because the app changes that go with it ship together. Every
-- statement can run twice: IF NOT EXISTS, DROP ... IF EXISTS then CREATE,
-- CREATE OR REPLACE, and data updates that only touch rows still in the old
-- shape. The same statements are section 22 of supabase/pending_migrations.sql.

-- 22a. Plan and transfer ids.
--    plan_id: one id per instalment plan, on every row of that plan. Plans
--    used to be matched on merchant + number of payments, so two plans at one
--    merchant merged into one.
--    transfer_id: one id on both halves of a transfer. Halves used to be
--    matched on date + amount, so two equal transfers on one day could cross.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS plan_id UUID NULL,
  ADD COLUMN IF NOT EXISTS transfer_id UUID NULL;

-- 22b. A plan with nothing paid yet is valid: current_installment may be 0.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_installments_valid;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_installments_valid
  CHECK ((total_installments IS NULL AND current_installment IS NULL)
    OR (total_installments > 0 AND current_installment >= 0 AND current_installment <= total_installments));

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

-- 22e. Give existing instalment rows a plan_id: one new id per user + account
--    + merchant + number of payments. Only rows with no plan_id are touched.
--    On a later run, a row added without one joins its group's plan when the
--    group has exactly one plan, and is left alone when it has several
--    (there is no way to tell which plan it belongs to).
WITH plan_groups AS MATERIALIZED (
  SELECT user_id, account_id, merchant, total_installments,
         count(DISTINCT plan_id) AS known_plans,
         (array_agg(plan_id) FILTER (WHERE plan_id IS NOT NULL))[1] AS known_plan,
         gen_random_uuid() AS new_plan
  FROM public.transactions
  WHERE total_installments IS NOT NULL
  GROUP BY user_id, account_id, merchant, total_installments
)
UPDATE public.transactions t
SET plan_id = COALESCE(g.known_plan, g.new_plan)
FROM plan_groups g
WHERE t.plan_id IS NULL
  AND t.total_installments IS NOT NULL
  AND g.known_plans <= 1
  AND t.user_id = g.user_id
  AND t.account_id = g.account_id
  AND t.merchant = g.merchant
  AND t.total_installments = g.total_installments;

-- 22f. goal_contributions had no UPDATE policy, so convert_currency() changed
--    zero contribution rows and said nothing. Same ownership rule as INSERT.
DROP POLICY IF EXISTS "Users can update own goal contributions" ON public.goal_contributions;
CREATE POLICY "Users can update own goal contributions"
  ON public.goal_contributions FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_contributions.goal_id AND g.user_id = (select auth.uid()))
  );

-- 22g. Avatar bucket: 2 MB and images only, enforced by storage and not just
--    by the browser. No SVG: it can carry script. Reading and deleting are
--    limited to the user's own folder. The upload uses upsert, and storage
--    needs SELECT as well as INSERT and UPDATE for that; with no SELECT policy
--    every avatar upload failed. Pictures are still shown through the public
--    URL, which does not go through these policies.
UPDATE storage.buckets
  SET file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
  WHERE id = 'avatars';

DROP POLICY IF EXISTS "Users can view own avatar" ON storage.objects;
CREATE POLICY "Users can view own avatar" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

-- 22h. profiles.phone_verified_at gates SMS sending, and a user could set it
--    on their own row. A column can only be closed by taking away the
--    table-wide grant and giving back the columns the app writes.
REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT INSERT (user_id, display_name, avatar_url, currency, notify_email, notify_sms, phone_number)
  ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, currency, notify_email, notify_sms, phone_number)
  ON public.profiles TO authenticated;

--    A new number is not a verified number. A write that sets the number and
--    the flag together (the service role, after a real check) keeps its flag.
CREATE OR REPLACE FUNCTION public.clear_phone_verification()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number
     AND NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_phone_verification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clear_phone_verification ON public.profiles;
CREATE TRIGGER trg_clear_phone_verification
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.clear_phone_verification();

-- 22i. Weekly budgets are retired: nothing in the app measured a week, so a
--    weekly amount was compared with a month of spending. Each weekly row
--    becomes monthly at amount * 52 / 12. Where the same category and month
--    already has a monthly row, the converted amount is added to it and the
--    weekly row is deleted (one row per category, month and period is allowed).
--    One block, so a failure part-way cannot add an amount twice.
DO $$
BEGIN
  UPDATE public.budgets m
  SET amount = m.amount + w.converted
  FROM (
    SELECT user_id, category, month, sum(round(amount * 52 / 12, 2)) AS converted
    FROM public.budgets WHERE period = 'weekly'
    GROUP BY user_id, category, month
  ) w
  WHERE m.period = 'monthly'
    AND m.user_id = w.user_id AND m.category = w.category AND m.month = w.month;

  DELETE FROM public.budgets w
  WHERE w.period = 'weekly'
    AND EXISTS (
      SELECT 1 FROM public.budgets m
      WHERE m.period = 'monthly'
        AND m.user_id = w.user_id AND m.category = w.category AND m.month = w.month
    );

  UPDATE public.budgets
  SET amount = round(amount * 52 / 12, 2), period = 'monthly'
  WHERE period = 'weekly';
END $$;
