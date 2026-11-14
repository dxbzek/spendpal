-- Migration: fixes from the 14 Nov 2026 review.
--
-- One file because the app changes that go with it ship together. Every
-- statement can run twice: IF NOT EXISTS, DROP ... IF EXISTS then CREATE,
-- CREATE OR REPLACE, and data updates that only touch rows still in the old
-- shape. The same statements are section 22 of supabase/pending_migrations.sql.
--
-- Before the first run, also list instalment plans whose rows sit on more
-- than one account, or carry instalments more than one unit (or 1%) apart.
-- Section 22e reads each such set as separate plans and writes that into
-- plan_id for good, so decide by hand first: one plan (give its rows one
-- account and amount) or several.
--   SELECT user_id, merchant, total_installments,
--       count(DISTINCT account_id) AS accounts,
--       min(amount) AS lowest, max(amount) AS highest
--   FROM public.transactions
--   WHERE type = 'expense' AND total_installments IS NOT NULL
--   GROUP BY 1, 2, 3
--   HAVING count(DISTINCT account_id) > 1
--    OR (max(amount) - min(amount)) > greatest(1, 0.01 * max(amount));
-- After the new app is live and every device has reloaded onto it (the
-- "New version, tap to reload" prompt), run section 22e once more: an
-- old copy of the app still open on a phone saves plan rows without a
-- plan_id, and the second run gives them their plan's id. The app already
-- shows them under the right plan; this makes it permanent.

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

-- 22e. Give existing instalment rows a plan_id, by the rule the app uses for
--    rows with no plan_id (chainRows in src/lib/finance/installments.ts).
--    Rows are read oldest first (date, paid count, id). A row that already
--    has a plan_id belongs to that plan. A row without one is the next payment
--    of the plan on the same user, account, merchant and term that is still
--    open, has a lower paid count and about the same instalment (give or take
--    one unit or 1%, so 333.33 then 333.34 is one plan). Several such plans:
--    the one furthest along, then the one paid last. None: a new plan.
--    So a second purchase at the same price (paid count back at 0 or 1) is a
--    second plan, and a row an old copy of the app saved without a plan_id
--    after the first run joins its plan on the next run.
--    Only rows with no plan_id are written.
DO $$
DECLARE
  r RECORD;
  chain UUID;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS review_fix_plan_chains (
    seq BIGSERIAL, plan_id UUID, user_id UUID, account_id UUID, merchant TEXT,
    total INTEGER, last_paid INTEGER, last_cents BIGINT, last_date DATE);
  TRUNCATE review_fix_plan_chains;
  FOR r IN
    SELECT id, user_id, account_id, merchant, total_installments, current_installment,
           round(amount * 100)::BIGINT AS cents, date, plan_id
    FROM public.transactions
    WHERE type = 'expense' AND total_installments IS NOT NULL AND current_installment IS NOT NULL
    ORDER BY date, current_installment, id
  LOOP
    chain := r.plan_id;
    IF chain IS NULL THEN
      SELECT c.plan_id INTO chain FROM review_fix_plan_chains c
      WHERE c.user_id = r.user_id AND c.account_id = r.account_id AND c.merchant = r.merchant
        AND c.total = r.total_installments
        AND c.last_paid < c.total AND c.last_paid < r.current_installment
        AND abs(c.last_cents - r.cents) * 100 <= greatest(10000, abs(c.last_cents), abs(r.cents))
      ORDER BY c.last_paid DESC, c.last_date DESC, c.seq
      LIMIT 1;
      IF chain IS NULL THEN chain := gen_random_uuid(); END IF;
      UPDATE public.transactions SET plan_id = chain WHERE id = r.id;
    END IF;
    UPDATE review_fix_plan_chains
      SET user_id = r.user_id, account_id = r.account_id, merchant = r.merchant, total = r.total_installments,
          last_paid = r.current_installment, last_cents = r.cents, last_date = r.date
      WHERE plan_id = chain;
    IF NOT FOUND THEN
      INSERT INTO review_fix_plan_chains (plan_id, user_id, account_id, merchant, total, last_paid, last_cents, last_date)
      VALUES (chain, r.user_id, r.account_id, r.merchant, r.total_installments, r.current_installment, r.cents, r.date);
    END IF;
  END LOOP;
  DROP TABLE review_fix_plan_chains;
END;
$$;

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

-- 22j. user_settings: one row per user for the settings that used to live in
--    the browser (monthly income, payday, budget templates, second currency),
--    where the next person to sign in on that browser could read them.
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own settings" ON public.user_settings;
CREATE POLICY "Users can delete own settings" ON public.user_settings
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--    Writes go through merge_user_settings: the keys a browser changed are
--    merged into the row in one statement, and net worth history by month, so
--    a phone or tab holding an old copy cannot put its old values back over a
--    newer one. `removed` names the keys that were cleared. The caller's own
--    row only: it runs as the caller, under the policies above.
CREATE OR REPLACE FUNCTION public.merge_user_settings(patch JSONB, removed TEXT[] DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  merged JSONB;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF patch IS NULL OR jsonb_typeof(patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be an object' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.user_settings (user_id, data) VALUES (uid, '{}'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT data - coalesce(removed, '{}'::TEXT[]) INTO merged
  FROM public.user_settings WHERE user_id = uid FOR UPDATE;
  IF jsonb_typeof(patch -> 'net_worth_history') = 'object' THEN
    patch := jsonb_set(patch, '{net_worth_history}',
      (CASE WHEN jsonb_typeof(merged -> 'net_worth_history') = 'object'
            THEN merged -> 'net_worth_history' ELSE '{}'::jsonb END) || (patch -> 'net_worth_history'));
  END IF;
  merged := coalesce(merged, '{}'::jsonb) || patch;
  UPDATE public.user_settings SET data = merged WHERE user_id = uid;
  RETURN merged;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_user_settings(JSONB, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_user_settings(JSONB, TEXT[]) TO authenticated;

-- 22k. ai_usage: AI calls per user per day, so the ai-finance function can
--    stop at a daily limit. The function counts with the service role, which
--    skips row level security. A user can read their own count and nothing
--    else: there is no policy for writing, and the write grants are removed.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     DATE NOT NULL,
  calls   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai usage" ON public.ai_usage;
CREATE POLICY "Users can view own ai usage" ON public.ai_usage
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

REVOKE ALL ON public.ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_usage TO anon, authenticated;
GRANT ALL ON public.ai_usage TO service_role;

-- 22l. restore_backup(payload): replace everything the caller owns with the
--    rows of a backup, in one transaction. The app did this as many separate
--    requests, so a closed tab or one refused row left the account half
--    written. Here any error undoes the whole call and the old data stays.
--
--    payload = { accounts, balances: [{id, balance}], transactions, budgets,
--    goals, goal_contributions }, rows keyed by column name as
--    src/lib/backup.ts prepareRestore() builds them. Only the columns named
--    below are read, and user_id is always the caller, never the payload's.
--    SECURITY INVOKER: row level security still applies to every statement.
--    statement_timeout: a signed-in user's requests are stopped after 8 s by
--    default, and this call deletes and re-inserts every transaction with the
--    balance trigger firing per row. The API applies a function's own
--    statement_timeout to the request, so a large backup gets 60 s. A restore
--    that still runs out is stopped with nothing changed (error 57014).
CREATE OR REPLACE FUNCTION public.restore_backup(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public SET statement_timeout TO '60s' AS $$
DECLARE
  uid UUID := auth.uid();
  k TEXT;
  n_accounts INTEGER := 0;
  n_transactions INTEGER := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  -- Check the shape before anything is deleted.
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid backup: not an object';
  END IF;
  FOREACH k IN ARRAY ARRAY['accounts', 'transactions'] LOOP
    IF jsonb_typeof(payload->k) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid backup: % must be a list', k;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['balances', 'budgets', 'goals', 'goal_contributions'] LOOP
    IF payload->k IS NULL OR jsonb_typeof(payload->k) = 'null' THEN
      payload := payload || jsonb_build_object(k, '[]'::jsonb);
    ELSIF jsonb_typeof(payload->k) <> 'array' THEN
      RAISE EXCEPTION 'invalid backup: % must be a list', k;
    END IF;
  END LOOP;

  DELETE FROM goal_contributions WHERE user_id = uid;
  DELETE FROM transactions WHERE user_id = uid;
  DELETE FROM budgets WHERE user_id = uid;
  DELETE FROM goals WHERE user_id = uid;
  DELETE FROM accounts WHERE user_id = uid;

  -- Accounts start at 0: inserting the transactions replays them onto the
  -- balance through the trigger, then the backed-up balance is set.
  -- Lists are ordered by created_at and every row of one transaction would
  -- share now(), so each row is one microsecond after the one before it.
  -- A missing value takes the column's default (icon: credit card emoji).
  INSERT INTO accounts (
    id, user_id, name, type, balance, currency, icon, credit_limit, due_date, statement_date, apr,
    statement_total_due, statement_min_due, statement_due_on, exclude_from_spendable, created_at)
  SELECT r.id, uid, r.name, r.type, 0, COALESCE(r.currency, 'AED'), COALESCE(r.icon, U&'\+01F4B3'),
         r.credit_limit, r.due_date, r.statement_date, r.apr,
         r.statement_total_due, r.statement_min_due, r.statement_due_on,
         COALESCE(r.exclude_from_spendable, false), now() + e.ord * interval '1 microsecond'
  FROM jsonb_array_elements(payload->'accounts') WITH ORDINALITY AS e(item, ord)
  CROSS JOIN LATERAL jsonb_to_record(e.item) AS r(
    id UUID, name TEXT, type TEXT, currency TEXT, icon TEXT, credit_limit NUMERIC, due_date INTEGER,
    statement_date INTEGER, apr NUMERIC, statement_total_due NUMERIC, statement_min_due NUMERIC,
    statement_due_on DATE, exclude_from_spendable BOOLEAN);
  GET DIAGNOSTICS n_accounts = ROW_COUNT;

  -- Default category icon: pushpin emoji.
  INSERT INTO transactions (
    user_id, account_id, type, amount, currency, category, category_icon, merchant, date, note,
    is_recurring, total_installments, current_installment, loan_total_amount, is_tracking_only,
    is_internal, is_pending, remaining_principal, dupe_dismissed, plan_id, transfer_id)
  SELECT uid, r.account_id, r.type, r.amount, COALESCE(r.currency, 'AED'), r.category,
         COALESCE(r.category_icon, U&'\+01F4CC'), r.merchant, COALESCE(r.date, CURRENT_DATE), r.note,
         COALESCE(r.is_recurring, false), r.total_installments, r.current_installment, r.loan_total_amount,
         COALESCE(r.is_tracking_only, false), COALESCE(r.is_internal, false), COALESCE(r.is_pending, false),
         r.remaining_principal, COALESCE(r.dupe_dismissed, false), r.plan_id, r.transfer_id
  FROM jsonb_to_recordset(payload->'transactions') AS r(
    account_id UUID, type TEXT, amount NUMERIC, currency TEXT, category TEXT, category_icon TEXT,
    merchant TEXT, date DATE, note TEXT, is_recurring BOOLEAN, total_installments INTEGER,
    current_installment INTEGER, loan_total_amount NUMERIC, is_tracking_only BOOLEAN,
    is_internal BOOLEAN, is_pending BOOLEAN, remaining_principal NUMERIC, dupe_dismissed BOOLEAN,
    plan_id UUID, transfer_id UUID);
  GET DIAGNOSTICS n_transactions = ROW_COUNT;

  UPDATE accounts a SET balance = b.balance
  FROM jsonb_to_recordset(payload->'balances') AS b(id UUID, balance NUMERIC)
  WHERE a.id = b.id AND a.user_id = uid AND b.balance IS NOT NULL;

  INSERT INTO budgets (user_id, category, category_icon, amount, period, month, is_fixed)
  SELECT uid, r.category, COALESCE(r.category_icon, U&'\+01F4CC'), r.amount,
         COALESCE(r.period, 'monthly'), r.month, COALESCE(r.is_fixed, false)
  FROM jsonb_to_recordset(payload->'budgets') AS r(
    category TEXT, category_icon TEXT, amount NUMERIC, period TEXT, month TEXT, is_fixed BOOLEAN);

  -- An older backup can hold weekly budgets. Same rule as the one-time
  -- conversion in 22i, for this user's rows.
  UPDATE budgets m
  SET amount = m.amount + w.converted
  FROM (
    SELECT category, month, sum(round(amount * 52 / 12, 2)) AS converted
    FROM budgets WHERE user_id = uid AND period = 'weekly'
    GROUP BY category, month
  ) w
  WHERE m.user_id = uid AND m.period = 'monthly' AND m.category = w.category AND m.month = w.month;
  DELETE FROM budgets w
  WHERE w.user_id = uid AND w.period = 'weekly'
    AND EXISTS (
      SELECT 1 FROM budgets m
      WHERE m.user_id = uid AND m.period = 'monthly' AND m.category = w.category AND m.month = w.month
    );
  UPDATE budgets SET amount = round(amount * 52 / 12, 2), period = 'monthly'
  WHERE user_id = uid AND period = 'weekly';

  -- Default goal icon: target emoji.
  INSERT INTO goals (id, user_id, name, icon, type, target_amount, saved_amount, deadline, status, created_at)
  SELECT r.id, uid, r.name, COALESCE(r.icon, U&'\+01F3AF'), r.type, r.target_amount,
         COALESCE(r.saved_amount, 0), r.deadline, COALESCE(r.status, 'active'),
         now() + e.ord * interval '1 microsecond'
  FROM jsonb_array_elements(payload->'goals') WITH ORDINALITY AS e(item, ord)
  CROSS JOIN LATERAL jsonb_to_record(e.item) AS r(
    id UUID, name TEXT, icon TEXT, type TEXT, target_amount NUMERIC, saved_amount NUMERIC,
    deadline DATE, status TEXT);

  -- The log shows created_at as the contribution's date, so it is kept.
  INSERT INTO goal_contributions (user_id, goal_id, amount, note, created_at)
  SELECT uid, r.goal_id, r.amount, r.note, COALESCE(r.created_at, now())
  FROM jsonb_to_recordset(payload->'goal_contributions') AS r(
    goal_id UUID, amount NUMERIC, note TEXT, created_at TIMESTAMPTZ);

  RETURN jsonb_build_object('accounts', n_accounts, 'transactions', n_transactions);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_backup(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_backup(JSONB) TO authenticated;

-- 22m. Tell the API about the new tables, columns and function now.
NOTIFY pgrst, 'reload schema';
