-- Migration: Security hardening from Supabase advisor findings
--
-- Addresses:
--   * anon/authenticated_security_definer_function_executable (0028 / 0029)
--   * public_bucket_allows_listing (0025)

-- 1. Trigger functions should not be callable over the REST API.
--
-- `handle_new_user` and `sync_account_balance` are SECURITY DEFINER trigger
-- functions. They are only ever invoked by their triggers (which run as the
-- table owner regardless of EXECUTE grants), so exposing them via
-- /rest/v1/rpc/* to the anon and authenticated roles serves no purpose and
-- widens the attack surface. Revoke EXECUTE from the API roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_account_balance() FROM PUBLIC, anon, authenticated;

-- 2. The `avatars` bucket is public, so objects are served directly through
-- the public object endpoint (getPublicUrl) without consulting RLS. The broad
-- "Public avatar read access" SELECT policy on storage.objects is therefore
-- unnecessary for displaying avatars, and its only practical effect is to let
-- any client LIST every file in the bucket. Drop it; uploads/updates remain
-- restricted to each user's own folder by the existing policies.
DROP POLICY IF EXISTS "Public avatar read access" ON storage.objects;
