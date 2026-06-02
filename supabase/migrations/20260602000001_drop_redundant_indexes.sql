-- Migration: Drop redundant duplicate indexes (advisor finding 0005 unused_index)
--
-- The performance advisor flags five "unused" indexes. Three of them are true
-- DUPLICATES — another UNIQUE constraint already indexes the same leading
-- column, so the standalone copy can never win a plan and is pure write/storage
-- overhead. Those we drop. The remaining two are the SOLE index backing an
-- access path (RLS user_id filter / rate-limit lookup); they read as "unused"
-- only because the table is young and low-traffic, and dropping them would
-- regress once data grows. Those we deliberately KEEP.
--
-- Drop (redundant):
--   * idx_profiles_user_id            -> profiles.user_id is UNIQUE
--                                        (profiles_user_id_key already indexes it)
--   * idx_custom_categories_user_id   -> UNIQUE(user_id, name) already provides a
--                                        user_id-leading index
--   * idx_budgets_user_id             -> uniq_budgets_user_category_month
--                                        UNIQUE(user_id, category, month, period)
--                                        already provides a user_id-leading index
--                                        (created in 20260530000001, applied first)
--
-- Keep (sole index for the path — do NOT drop):
--   * idx_goals_user_id               -> only index serving goals RLS user_id filter
--   * idx_notification_log_user_created -> backs the send-notification rate limiter
--                                          (count by user_id, channel, created_at)

DROP INDEX IF EXISTS public.idx_profiles_user_id;
DROP INDEX IF EXISTS public.idx_custom_categories_user_id;
DROP INDEX IF EXISTS public.idx_budgets_user_id;

-- ─────────────────────────────────────────────────────────────────────────
-- Manual step (not SQL): advisor "Auth DB Connection Strategy is not
-- Percentage" (auth_db_connections_absolute). The Auth server is pinned to an
-- absolute 10 DB connections, so scaling the instance up won't help Auth.
-- Switch to a percentage-based allocation in the Supabase Dashboard →
-- Project Settings → Database → Connection pooling / Auth. No SQL equivalent.
-- https://supabase.com/docs/guides/deployment/going-into-prod
-- ─────────────────────────────────────────────────────────────────────────
