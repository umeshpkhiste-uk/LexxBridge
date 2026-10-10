-- Fix: 0062's `revoke update (verification_status, verified_at,
-- verification_notes) on advocate_profiles from authenticated` had no
-- effect. Verified live: a direct client-style update (simulated via `set
-- local role authenticated`) still succeeded and silently wrote
-- 'verified'. Postgres column-level REVOKE cannot override an existing
-- table-level UPDATE grant ("advocate can update own profile" grants the
-- whole table) — the column grant/revoke machinery only matters when the
-- table-level grant was never given in the first place.
--
-- The correct mechanism here (and the one this codebase already uses
-- elsewhere, see protect_message_ownership in 0017_messaging.sql) is a
-- trigger. submit_verification_request/admin_set_verification_status are
-- both SECURITY DEFINER, owned by `postgres` (confirmed live via pg_proc),
-- so inside them current_user is 'postgres' — a normal client request
-- (PostgREST sets role to `authenticated` per request) is current_user =
-- 'authenticated'. That's what this trigger checks, instead of a
-- column-grant that doesn't work for this case.

create or replace function public.protect_verification_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user = 'authenticated' and (
    new.verification_status is distinct from old.verification_status
    or new.verified_at is distinct from old.verified_at
    or new.verification_notes is distinct from old.verification_notes
  ) then
    raise exception 'verification_status can only be changed via submit_verification_request / admin review';
  end if;
  return new;
end;
$$;

create trigger advocate_profiles_protect_verification
  before update on public.advocate_profiles
  for each row execute function public.protect_verification_columns();
