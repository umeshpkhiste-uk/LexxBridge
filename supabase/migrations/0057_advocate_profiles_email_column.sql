-- Stores a persisted copy of the advocate's own email on advocate_profiles,
-- kept in sync with auth.users.email going forward by handle_new_user()
-- (on signup) and trg_notify_email_changed() (on change) — both
-- SECURITY DEFINER functions, so their updated bodies are run manually; see
-- the trailing comment block in this file for the exact SQL.
--
-- Why: admin_list_profiles() (the admin directory RPC) had no way to show
-- an advocate's email — the only real contact detail besides name — since
-- admin never touches auth.users directly (docs/RULES.md: admin stays a
-- separate entity, never routed through auth internals). This column is
-- what admin_list_profiles() reads from instead.

alter table public.advocate_profiles add column email text;

update public.advocate_profiles p
set email = u.email
from auth.users u
where u.id = p.id;

alter table public.advocate_profiles alter column email set not null;

create index advocate_profiles_email_idx on public.advocate_profiles (lower(email));

-- =====================================================================
-- Run manually in the Supabase SQL editor (SECURITY DEFINER — apply_migration
-- silently declines these per docs/RULES.md "Database & migrations"):
-- =====================================================================
--
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path to 'public'
-- as $$
-- begin
--   insert into public.advocate_profiles (id, full_name, profile_photo_url, email)
--   values (
--     new.id,
--     coalesce(
--       nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
--       nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
--       nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
--       'New Advocate'
--     ),
--     coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
--     new.email
--   );
--   return new;
-- end;
-- $$;
--
-- create or replace function public.trg_notify_email_changed()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path to 'public'
-- as $$
-- declare
--   internal_secret text;
-- begin
--   if old.email is distinct from new.email and old.email is not null and new.email is not null then
--     update public.advocate_profiles set email = new.email where id = new.id;
--     select decrypted_secret into internal_secret from vault.decrypted_secrets where name = 'internal_function_secret';
--     perform net.http_post(
--       url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-account-notice',
--       body := jsonb_build_object('type', 'email_changed', 'email', old.email, 'old_email', old.email, 'new_email', new.email),
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', internal_secret)
--     );
--   end if;
--   return new;
-- end;
-- $$;
--
-- create or replace function public.admin_list_profiles(search text default null)
-- returns table(
--   id uuid, full_name text, email text, city text, state text,
--   verification_status verification_status, is_blocked boolean,
--   blocked_reason text, created_at timestamptz
-- )
-- language plpgsql
-- stable
-- security definer
-- set search_path to 'public'
-- as $$
-- begin
--   if not public.is_admin((select auth.uid())) then
--     raise exception 'Only admins can list profiles';
--   end if;
--   return query
--     select p.id, p.full_name, p.email, p.city, p.state, p.verification_status,
--            (b.user_id is not null) as is_blocked, b.reason as blocked_reason,
--            p.created_at
--     from public.advocate_profiles p
--     left join public.blocked_users b on b.user_id = p.id
--     where search is null or p.full_name ilike '%' || search || '%' or p.email ilike '%' || search || '%'
--     order by p.created_at desc;
-- end;
-- $$;
