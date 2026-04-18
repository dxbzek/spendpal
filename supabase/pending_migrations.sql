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
