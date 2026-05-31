-- Migration: Security hardening — RLS WITH CHECK, ownership tightening, and
-- schema-level data-integrity guardrails.
--
-- Closes the cross-tenant row-reassignment hole (every UPDATE policy lacked a
-- WITH CHECK clause, so an authenticated user could UPDATE ... SET user_id =
-- '<victim>' or reparent account_id to a victim's account, weaponizing the
-- SECURITY DEFINER sync_account_balance trigger). Also adds the numeric /
-- uniqueness / non-empty CHECK constraints, a real FK on custom_categories,
-- per-user notification rate-limit logging, and phone-verification state.
--
-- Every statement is idempotent (DROP ... IF EXISTS + CREATE, IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS + ADD) so it is safe to run against the live DB,
-- which has no migration history and is updated via pending_migrations.sql.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Data cleanup (required before the new constraints will validate).
--    Verified against production: exactly one orphaned custom_categories row
--    (owner deleted) and one transaction with current_installment = 0.
-- ─────────────────────────────────────────────────────────────────────────
DELETE FROM public.custom_categories cc
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cc.user_id);

UPDATE public.transactions
  SET current_installment = 1
  WHERE total_installments IS NOT NULL AND total_installments > 0
    AND current_installment IS NOT NULL AND current_installment < 1;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. WITH CHECK on every UPDATE policy. We DROP + CREATE with the optimized
--    (select auth.uid()) initplan form so the new row's user_id is validated
--    against the caller, not just the old row.
-- ─────────────────────────────────────────────────────────────────────────

-- profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- accounts
DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
CREATE POLICY "Users can update own accounts" ON public.accounts
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- transactions
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- budgets
DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;
CREATE POLICY "Users can update own budgets" ON public.budgets
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- goals
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
CREATE POLICY "Users can update own goals" ON public.goals
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- custom_categories (scoped to the authenticated role, like its siblings)
DROP POLICY IF EXISTS "Users can update own categories" ON public.custom_categories;
CREATE POLICY "Users can update own categories" ON public.custom_categories
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- storage.objects (avatars) — same primitive lets a user rename a file into
-- another user's folder without WITH CHECK.
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

-- Belt-and-suspenders: even with WITH CHECK in place, forbid reassigning a
-- transaction's owner column outright.
REVOKE UPDATE (user_id) ON public.transactions FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tighten goal_contributions INSERT to require ownership of the goal, not
--    just a matching user_id.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own goal contributions" ON public.goal_contributions;
CREATE POLICY "Users can insert own goal contributions"
  ON public.goal_contributions FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_id AND g.user_id = (select auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. custom_categories.user_id had no FK (orphan risk on auth.users delete).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.custom_categories
  DROP CONSTRAINT IF EXISTS custom_categories_user_id_fkey;
ALTER TABLE public.custom_categories
  ADD CONSTRAINT custom_categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Numeric / range / uniqueness / non-empty data-integrity constraints.
--    All verified clean against production after the section-1 cleanup.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_amount_nonneg;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_nonneg CHECK (amount >= 0);

ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_amount_nonneg;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_amount_nonneg CHECK (amount >= 0);

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_target_positive;
ALTER TABLE public.goals ADD CONSTRAINT goals_target_positive CHECK (target_amount > 0);

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_saved_nonneg;
ALTER TABLE public.goals ADD CONSTRAINT goals_saved_nonneg CHECK (saved_amount >= 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_credit_limit_nonneg;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_credit_limit_nonneg
  CHECK (credit_limit IS NULL OR credit_limit >= 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_due_date_valid;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_due_date_valid
  CHECK (due_date IS NULL OR (due_date BETWEEN 1 AND 31));

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_statement_date_valid;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_statement_date_valid
  CHECK (statement_date IS NULL OR (statement_date BETWEEN 1 AND 31));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_installments_valid;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_installments_valid
  CHECK (
    (total_installments IS NULL AND current_installment IS NULL)
    OR (total_installments > 0 AND current_installment > 0 AND current_installment <= total_installments)
  );

-- One budget per (user, category, month, period).
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS uniq_budgets_user_category_month;
ALTER TABLE public.budgets ADD CONSTRAINT uniq_budgets_user_category_month
  UNIQUE (user_id, category, month, period);

-- Non-empty text on the columns that drive the UI.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_merchant_nonempty;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_merchant_nonempty
  CHECK (length(btrim(merchant)) > 0);

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_category_nonempty;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_category_nonempty
  CHECK (length(btrim(category)) > 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_name_nonempty;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_name_nonempty
  CHECK (length(btrim(name)) > 0);

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_name_nonempty;
ALTER TABLE public.goals ADD CONSTRAINT goals_name_nonempty
  CHECK (length(btrim(name)) > 0);

ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_category_nonempty;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_category_nonempty
  CHECK (length(btrim(category)) > 0);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Phone hygiene for SMS notifications (toll-fraud surface).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_e164;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_e164
  CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sms_requires_phone;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sms_requires_phone
  CHECK (notify_sms = false OR phone_number IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. notification_log — per-user rate limiting for the send-notification
--    edge function (≤5 SMS/hour, ≤20/day enforced in the function).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_log (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Read-only to the owner; writes are performed by the edge function with the
-- service role, so no INSERT policy is granted to authenticated users.
DROP POLICY IF EXISTS "Users can view own notification log" ON public.notification_log;
CREATE POLICY "Users can view own notification log"
  ON public.notification_log FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_created
  ON public.notification_log(user_id, channel, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Carry forward the 20260529000001 hardening (not yet applied to the live
--    DB per the security advisor): keep SECURITY DEFINER trigger functions
--    off the REST API and stop public listing of the avatars bucket.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_account_balance() FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Public avatar read access" ON storage.objects;
