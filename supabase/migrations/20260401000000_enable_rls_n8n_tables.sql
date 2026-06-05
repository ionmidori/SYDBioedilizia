-- ============================================================
-- Migration: Enable RLS on n8n internal tables
-- Project: syd-n8n (ztswcobfxmlivmojsayn)
-- Date: 2026-04-01 (revised 2026-05-16 for n8n 2.20.7)
-- Reason: Supabase security alerts — rls_disabled_in_public +
--         sensitive_columns_exposed
--
-- STRATEGY:
--   n8n connects via direct PostgreSQL (role "postgres" /
--   service_role) which bypasses RLS — zero functional impact.
--   Enabling RLS with NO permissive policies = deny-all for
--   anonymous REST API callers (anon key, authenticated key).
--
--   This version iterates ALL tables in public schema
--   dynamically — no hardcoded list, version-agnostic.
-- ============================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    -- 1. Enable RLS
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      t.tablename
    );

    -- 2. Drop existing deny policy if present (idempotent)
    EXECUTE format(
      'DROP POLICY IF EXISTS "n8n_deny_all_anon" ON public.%I',
      t.tablename
    );

    -- 3. Create RESTRICTIVE deny policy for anon + authenticated
    EXECUTE format(
      $sql$
        CREATE POLICY "n8n_deny_all_anon"
        ON public.%I
        AS RESTRICTIVE
        FOR ALL
        TO anon, authenticated
        USING (false)
      $sql$,
      t.tablename
    );
  END LOOP;
END;
$$;

-- Belt-and-suspenders: revoke PostgREST direct access
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- ── Verify ───────────────────────────────────────────────────
-- Run this SELECT after applying to confirm RLS is ON:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- All tables should show rowsecurity = true.
