-- Security audit finding: is_admin(check_uid) is granted EXECUTE to
-- `authenticated` (needed so RLS policies evaluated as an ordinary user can
-- call it), which means PostgREST also exposes it as a directly callable
-- RPC endpoint — `select public.is_admin('<any-uuid>')`. Every actual
-- internal caller (admin_* functions, the advocate_profiles/reports admin
-- policies in 0046/0048) only ever passes its own `(select auth.uid())`, so
-- there's no legitimate reason for an arbitrary non-admin to learn whether
-- some other uuid is an admin — and 0060 already hides admin accounts from
-- search specifically so they can't be targeted, which this RPC undermined.
--
-- Fix, in place (`create or replace function`, same name/signature/schema,
-- so nothing that already calls `public.is_admin(...)` needs to change):
-- the self-check path is untouched (so every existing caller behaves
-- identically), an actual admin may still check anyone else's status, and a
-- non-admin probing a different uuid now gets `false` instead of the real
-- answer — closing the oracle without breaking anything that depends on it.
create or replace function public.is_admin(check_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when check_uid = (select auth.uid())
      then exists (select 1 from public.admins where user_id = check_uid)
    when exists (select 1 from public.admins where user_id = (select auth.uid()))
      then exists (select 1 from public.admins where user_id = check_uid)
    else false
  end;
$$;

-- is_blocked_by_admin(check_uid) is NOT changed here: unlike is_admin, every
-- connect/follow/message policy in 0048 legitimately calls it with the
-- OTHER party's id (not the caller's own), since an ordinary user sending a
-- message needs to know whether the recipient is banned. There is no
-- "caller must already know X" gate available for that case without
-- breaking the feature, so this stays a documented, low-severity, accepted
-- tradeoff (confirm/deny on a single banned-status bit) rather than a bug
-- fixed here.
