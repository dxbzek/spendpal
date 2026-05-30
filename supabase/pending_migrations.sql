-- ============================================================
-- SpendPal: Apply all pending DB migrations
-- Paste into Supabase Dashboard → SQL Editor → New query
-- URL: https://supabase.com/dashboard/project/uwvlhdkxhvcxccutaoew/sql/new
--
-- Safe to run multiple times — every statement uses
-- IF NOT EXISTS / CREATE OR REPLACE where possible.
-- ============================================================


-- ── 1. Performance indexes (20260329) ────────────────────────
CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON public.accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id
  ON public.transactions(account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_category
  ON public.transactions(user_id, category);

CREATE INDEX IF NOT EXISTS idx_budgets_user_id
  ON public.budgets(user_id);

CREATE INDEX IF NOT EXISTS idx_goals_user_id
  ON public.goals(user_id);


-- ── 2. Account balance sync trigger (20260331000001) ─────────
--    CREATE OR REPLACE is safe; trigger creation is guarded.

CREATE OR REPLACE FUNCTION public.sync_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC := 0;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.is_tracking_only THEN RETURN NULL; END IF;
    IF NEW.type = 'income' THEN delta := NEW.amount; ELSE delta := -NEW.amount; END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;

  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.is_tracking_only THEN RETURN NULL; END IF;
    IF OLD.type = 'income' THEN delta := -OLD.amount; ELSE delta := OLD.amount; END IF;
    UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF NOT OLD.is_tracking_only THEN
      IF OLD.type = 'income' THEN delta := -OLD.amount; ELSE delta := OLD.amount; END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = OLD.account_id;
    END IF;
    IF NOT NEW.is_tracking_only THEN
      IF NEW.type = 'income' THEN delta := NEW.amount; ELSE delta := -NEW.amount; END IF;
      UPDATE accounts SET balance = balance + delta WHERE id = NEW.account_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_account_balance'
  ) THEN
    CREATE TRIGGER trg_sync_account_balance
      AFTER INSERT OR UPDATE OR DELETE ON public.transactions
      FOR EACH ROW EXECUTE FUNCTION public.sync_account_balance();
  END IF;
END $$;


-- ── 3. advisor_sessions table (20260331000002) ───────────────

CREATE TABLE IF NOT EXISTS public.advisor_sessions (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('summary', 'budget-advisor', 'budget-suggestions')),
  result       JSONB NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.advisor_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_sessions' AND policyname = 'Users can view own sessions') THEN
    CREATE POLICY "Users can view own sessions" ON public.advisor_sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_sessions' AND policyname = 'Users can insert own sessions') THEN
    CREATE POLICY "Users can insert own sessions" ON public.advisor_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_sessions' AND policyname = 'Users can delete own sessions') THEN
    CREATE POLICY "Users can delete own sessions" ON public.advisor_sessions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_advisor_sessions_user_created
  ON public.advisor_sessions(user_id, created_at DESC);


-- ── 4. custom_categories.type column (20260331000003) ────────

ALTER TABLE public.custom_categories
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'both'
  CHECK (type IN ('expense', 'income', 'both'));


-- ── 5. transactions.is_tracking_only (20260401000001) ────────

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_tracking_only BOOLEAN NOT NULL DEFAULT false;


-- ── 6. transactions.loan_total_amount (20260401000002) ───────

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS loan_total_amount NUMERIC(15, 2) NULL;


-- ── 7. budgets.is_fixed (20260402000001) ─────────────────────

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT false;


-- ── 8. custom_categories.original_name (20260404000001) ──────

ALTER TABLE public.custom_categories
  ADD COLUMN IF NOT EXISTS original_name TEXT NULL;


-- ── 9. Notification preferences (20260407000001) ─────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number  TEXT,
  ADD COLUMN IF NOT EXISTS notify_email  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_sms    BOOLEAN NOT NULL DEFAULT false;


-- ── 10. goal_contributions table (20260411000001) ────────────

CREATE TABLE IF NOT EXISTS public.goal_contributions (
  id         UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id    UUID    NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  amount     NUMERIC NOT NULL CHECK (amount > 0),
  note       TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goal_contributions' AND policyname = 'Users can view own goal contributions') THEN
    CREATE POLICY "Users can view own goal contributions"
      ON public.goal_contributions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goal_contributions' AND policyname = 'Users can insert own goal contributions') THEN
    CREATE POLICY "Users can insert own goal contributions"
      ON public.goal_contributions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goal_contributions' AND policyname = 'Users can delete own goal contributions') THEN
    CREATE POLICY "Users can delete own goal contributions"
      ON public.goal_contributions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal
  ON public.goal_contributions(goal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_user
  ON public.goal_contributions(user_id, created_at DESC);


-- ── 11. Missing performance indexes ──────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_user_id
  ON public.profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_custom_categories_user_id
  ON public.custom_categories(user_id);

-- Composite for type-filtered transaction queries (Reports, Dashboard period filters)
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON public.transactions(user_id, type, date DESC);


-- ── 12. Security hardening (20260529000001) ──────────────────
--    Advisor: anon/authenticated SECURITY DEFINER RPC exposure + public
--    bucket listing. Idempotent.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_account_balance() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Public avatar read access" ON storage.objects;


-- ── 13. RLS initplan optimization (20260529000002) ───────────
--    Advisor 0003: wrap auth.uid() as (select auth.uid()) so it is
--    evaluated once per query instead of once per row. Idempotent.

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((select auth.uid()) = user_id);

-- accounts
DROP POLICY IF EXISTS "Users can view own accounts" ON public.accounts;
CREATE POLICY "Users can view own accounts" ON public.accounts FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own accounts" ON public.accounts;
CREATE POLICY "Users can insert own accounts" ON public.accounts FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
CREATE POLICY "Users can update own accounts" ON public.accounts FOR UPDATE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own accounts" ON public.accounts;
CREATE POLICY "Users can delete own accounts" ON public.accounts FOR DELETE USING ((select auth.uid()) = user_id);

-- transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE USING ((select auth.uid()) = user_id);

-- budgets
DROP POLICY IF EXISTS "Users can view own budgets" ON public.budgets;
CREATE POLICY "Users can view own budgets" ON public.budgets FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own budgets" ON public.budgets;
CREATE POLICY "Users can insert own budgets" ON public.budgets FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;
CREATE POLICY "Users can update own budgets" ON public.budgets FOR UPDATE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own budgets" ON public.budgets;
CREATE POLICY "Users can delete own budgets" ON public.budgets FOR DELETE USING ((select auth.uid()) = user_id);

-- goals
DROP POLICY IF EXISTS "Users can view own goals" ON public.goals;
CREATE POLICY "Users can view own goals" ON public.goals FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own goals" ON public.goals;
CREATE POLICY "Users can insert own goals" ON public.goals FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own goals" ON public.goals;
CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE USING ((select auth.uid()) = user_id);

-- custom_categories (scoped to the authenticated role)
DROP POLICY IF EXISTS "Users can view own categories" ON public.custom_categories;
CREATE POLICY "Users can view own categories" ON public.custom_categories FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own categories" ON public.custom_categories;
CREATE POLICY "Users can insert own categories" ON public.custom_categories FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own categories" ON public.custom_categories;
CREATE POLICY "Users can update own categories" ON public.custom_categories FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own categories" ON public.custom_categories;
CREATE POLICY "Users can delete own categories" ON public.custom_categories FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- advisor_sessions
DROP POLICY IF EXISTS "Users can view own sessions" ON public.advisor_sessions;
CREATE POLICY "Users can view own sessions" ON public.advisor_sessions FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.advisor_sessions;
CREATE POLICY "Users can insert own sessions" ON public.advisor_sessions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.advisor_sessions;
CREATE POLICY "Users can delete own sessions" ON public.advisor_sessions FOR DELETE USING ((select auth.uid()) = user_id);

-- goal_contributions
DROP POLICY IF EXISTS "Users can view own goal contributions" ON public.goal_contributions;
CREATE POLICY "Users can view own goal contributions" ON public.goal_contributions FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own goal contributions" ON public.goal_contributions;
CREATE POLICY "Users can insert own goal contributions" ON public.goal_contributions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own goal contributions" ON public.goal_contributions;
CREATE POLICY "Users can delete own goal contributions" ON public.goal_contributions FOR DELETE USING ((select auth.uid()) = user_id);


-- ── 14. Security hardening: RLS WITH CHECK + constraints (20260530000001) ──
--    Closes the cross-tenant row-reassignment hole and adds data-integrity
--    guardrails. Idempotent. MUST come after section 13 (which recreates the
--    UPDATE policies USING-only) so the WITH CHECK versions win.

-- 14a. Data cleanup (required before the new constraints validate).
DELETE FROM public.custom_categories cc
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cc.user_id);
UPDATE public.transactions SET current_installment = 1
  WHERE total_installments IS NOT NULL AND total_installments > 0
    AND current_installment IS NOT NULL AND current_installment < 1;

-- 14b. WITH CHECK on every UPDATE policy.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
CREATE POLICY "Users can update own accounts" ON public.accounts
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;
CREATE POLICY "Users can update own budgets" ON public.budgets
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
CREATE POLICY "Users can update own goals" ON public.goals
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own categories" ON public.custom_categories;
CREATE POLICY "Users can update own categories" ON public.custom_categories
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);
REVOKE UPDATE (user_id) ON public.transactions FROM authenticated;

-- 14c. goal_contributions INSERT requires ownership of the goal.
DROP POLICY IF EXISTS "Users can insert own goal contributions" ON public.goal_contributions;
CREATE POLICY "Users can insert own goal contributions"
  ON public.goal_contributions FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_id AND g.user_id = (select auth.uid()))
  );

-- 14d. custom_categories.user_id FK.
ALTER TABLE public.custom_categories DROP CONSTRAINT IF EXISTS custom_categories_user_id_fkey;
ALTER TABLE public.custom_categories ADD CONSTRAINT custom_categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 14e. Numeric / range / uniqueness / non-empty constraints.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_amount_nonneg;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_nonneg CHECK (amount >= 0);
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_amount_nonneg;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_amount_nonneg CHECK (amount >= 0);
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_target_positive;
ALTER TABLE public.goals ADD CONSTRAINT goals_target_positive CHECK (target_amount > 0);
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_saved_nonneg;
ALTER TABLE public.goals ADD CONSTRAINT goals_saved_nonneg CHECK (saved_amount >= 0);
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_credit_limit_nonneg;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_credit_limit_nonneg CHECK (credit_limit IS NULL OR credit_limit >= 0);
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_due_date_valid;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_due_date_valid CHECK (due_date IS NULL OR (due_date BETWEEN 1 AND 31));
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_statement_date_valid;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_statement_date_valid CHECK (statement_date IS NULL OR (statement_date BETWEEN 1 AND 31));
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_installments_valid;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_installments_valid
  CHECK ((total_installments IS NULL AND current_installment IS NULL)
    OR (total_installments > 0 AND current_installment > 0 AND current_installment <= total_installments));
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS uniq_budgets_user_category_month;
ALTER TABLE public.budgets ADD CONSTRAINT uniq_budgets_user_category_month UNIQUE (user_id, category, month, period);
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_merchant_nonempty;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_merchant_nonempty CHECK (length(btrim(merchant)) > 0);
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_category_nonempty;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_category_nonempty CHECK (length(btrim(category)) > 0);
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_name_nonempty;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_name_nonempty CHECK (length(btrim(name)) > 0);
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_name_nonempty;
ALTER TABLE public.goals ADD CONSTRAINT goals_name_nonempty CHECK (length(btrim(name)) > 0);
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_category_nonempty;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_category_nonempty CHECK (length(btrim(category)) > 0);

-- 14f. Phone hygiene + verification state.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_e164;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_e164
  CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sms_requires_phone;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sms_requires_phone
  CHECK (notify_sms = false OR phone_number IS NOT NULL);

-- 14g. notification_log for per-user SMS/email rate limiting.
CREATE TABLE IF NOT EXISTS public.notification_log (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notification log" ON public.notification_log;
CREATE POLICY "Users can view own notification log"
  ON public.notification_log FOR SELECT USING ((select auth.uid()) = user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_user_created
  ON public.notification_log(user_id, channel, created_at DESC);


-- ── 15. Manual step (not SQL) ────────────────────────────────
--    Advisor: "Leaked Password Protection Disabled". Enable in the
--    Supabase Dashboard → Authentication → Policies → Password security
--    → toggle "Check against HaveIBeenPwned". No SQL equivalent.
