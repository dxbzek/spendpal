-- Run this in the Supabase Dashboard SQL Editor to apply pending migrations.
-- Go to: https://supabase.com/dashboard/project/uwvlhdkxhvcxccutaoew/sql/new

-- 1. Add is_fixed to budgets (migration 20260402000001)
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT false;

-- 2. Add is_tracking_only to transactions (migration 20260401000001)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_tracking_only BOOLEAN NOT NULL DEFAULT false;

-- Update balance sync trigger to skip tracking-only transactions
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

-- 3. Add loan_total_amount to transactions (migration 20260401000002)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS loan_total_amount NUMERIC(15, 2) NULL;

-- 4. Create advisor_sessions table (migration 20260331000002)
CREATE TABLE IF NOT EXISTS public.advisor_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('summary', 'budget-advisor', 'budget-suggestions')),
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.advisor_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'advisor_sessions' AND policyname = 'Users can view own sessions'
  ) THEN
    CREATE POLICY "Users can view own sessions"
      ON public.advisor_sessions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'advisor_sessions' AND policyname = 'Users can insert own sessions'
  ) THEN
    CREATE POLICY "Users can insert own sessions"
      ON public.advisor_sessions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'advisor_sessions' AND policyname = 'Users can delete own sessions'
  ) THEN
    CREATE POLICY "Users can delete own sessions"
      ON public.advisor_sessions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_advisor_sessions_user_created
  ON public.advisor_sessions(user_id, created_at DESC);
