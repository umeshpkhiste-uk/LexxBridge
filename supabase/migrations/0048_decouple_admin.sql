-- Redesign: make admin a fully separate entity instead of something woven
-- into advocate_profiles and the policies every ordinary user's
-- connect/follow/message action runs through.
--
-- 0046/0047 put is_blocked straight on advocate_profiles and gave admin a
-- *second* permissive SELECT/UPDATE policy on advocate_profiles and
-- reports — meaning every single profile read in the app, for every user,
-- forever, now ran two RLS checks instead of one, purely so one admin
-- screen could work. That's the dependency this migration removes.
--
-- New shape:
--   - blocked_users: its own table, admin-only, not a column on
--     advocate_profiles. advocate_profiles goes back to exactly its
--     original single owner-only policy — zero added cost for anyone.
--   - is_blocked_by_admin(uuid): the one lean, cheap check the four
--     connect/follow/message policies call — same idea as is_admin(),
--     a security definer boolean function, not a join against a table
--     those policies would otherwise need read access to.
--   - Every other admin capability (directory, reports) moves to
--     dedicated admin_* functions instead of extra RLS policies, so
--     advocate_profiles/reports carry no admin-shaped weight at all.

-- Undo 0046/0047's coupling into advocate_profiles --------------------

drop trigger if exists advocate_profiles_protect_admin_scope on public.advocate_profiles;
drop function if exists public.protect_admin_block_update();

-- 0046 only ever ADDED these two alongside the original 0001 policies — it
-- never touched "advocate can read own profile"/"advocate can update own
-- profile", so those are still live and correct as-is. Dropping just the
-- admin additions is enough to restore the original single-policy shape.
drop policy if exists "admin can read all profiles" on public.advocate_profiles;
drop policy if exists "admin can update block status" on public.advocate_profiles;
-- These two only exist if 0047 (never applied live) had been run first.
drop policy if exists "advocate can read own profile or admin can read any" on public.advocate_profiles;
drop policy if exists "advocate can update own profile or admin can update any" on public.advocate_profiles;

alter table public.advocate_profiles
  drop column if exists is_blocked,
  drop column if exists blocked_at,
  drop column if exists blocked_reason;

-- Same story: "advocate can read own reports" (from 0016) was never
-- touched by 0046, only added to.
drop policy if exists "admin can read all reports" on public.reports;
drop policy if exists "admin can review reports" on public.reports;
drop policy if exists "advocate can read own reports or admin can read any" on public.reports;

-- The new, separate entity ---------------------------------------------

create table public.blocked_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  blocked_by uuid not null references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.blocked_users enable row level security;

-- Admin-only. Regular policies never read this table directly — they go
-- through is_blocked_by_admin() below instead, so this stays admin-only
-- without needing to also be readable by whoever's being checked.
create policy "admin can read blocked users"
  on public.blocked_users for select
  using (public.is_admin((select auth.uid())));

create or replace function public.is_blocked_by_admin(check_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.blocked_users where user_id = check_uid);
$$;

revoke all on function public.is_blocked_by_admin(uuid) from public;
grant execute on function public.is_blocked_by_admin(uuid) to authenticated;

create or replace function public.admin_block_user(target_id uuid, block_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can block a user';
  end if;
  insert into public.blocked_users (user_id, blocked_by, reason)
  values (target_id, (select auth.uid()), block_reason)
  on conflict (user_id) do update set blocked_by = excluded.blocked_by, reason = excluded.reason, created_at = now();
end;
$$;

revoke all on function public.admin_block_user(uuid, text) from public;
grant execute on function public.admin_block_user(uuid, text) to authenticated;

create or replace function public.admin_unblock_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can unblock a user';
  end if;
  delete from public.blocked_users where user_id = target_id;
end;
$$;

revoke all on function public.admin_unblock_user(uuid) from public;
grant execute on function public.admin_unblock_user(uuid) to authenticated;

-- Admin's read access to the directory and reports now lives entirely in
-- these functions instead of as extra RLS policies on the underlying
-- tables — so advocate_profiles/reports carry no trace of admin at all.

create or replace function public.admin_list_profiles(search text default null)
returns table (
  id uuid,
  full_name text,
  city text,
  state text,
  verification_status public.verification_status,
  is_blocked boolean,
  blocked_reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can list profiles';
  end if;
  return query
    select p.id, p.full_name, p.city, p.state, p.verification_status,
           (b.user_id is not null) as is_blocked, b.reason as blocked_reason,
           p.created_at
    from public.advocate_profiles p
    left join public.blocked_users b on b.user_id = p.id
    where search is null or p.full_name ilike '%' || search || '%'
    order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_profiles(text) from public;
grant execute on function public.admin_list_profiles(text) to authenticated;

create or replace function public.admin_list_reports()
returns setof public.reports
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can list reports';
  end if;
  return query select * from public.reports order by created_at desc limit 50;
end;
$$;

revoke all on function public.admin_list_reports() from public;
grant execute on function public.admin_list_reports() to authenticated;

create or replace function public.admin_set_report_status(report_id uuid, new_status public.report_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can review reports';
  end if;
  update public.reports set status = new_status where id = report_id;
end;
$$;

revoke all on function public.admin_set_report_status(uuid, public.report_status) from public;
grant execute on function public.admin_set_report_status(uuid, public.report_status) to authenticated;

-- Point the four social-graph insert policies at the new function instead
-- of the old advocate_profiles.is_blocked column.

alter policy "advocate can send connection request" on public.connections
  with check (
    (select auth.uid()) = requester_id
    and not exists (
      select 1 from public.blocks
      where (blocker_id = requester_id and blocked_id = addressee_id)
         or (blocker_id = addressee_id and blocked_id = requester_id)
    )
    and not public.is_blocked_by_admin(requester_id)
    and not public.is_blocked_by_admin(addressee_id)
  );

alter policy "advocate can follow others" on public.follows
  with check (
    (select auth.uid()) = follower_id
    and not exists (
      select 1 from public.blocks
      where (blocker_id = follower_id and blocked_id = following_id)
         or (blocker_id = following_id and blocked_id = follower_id)
    )
    and not public.is_blocked_by_admin(follower_id)
    and not public.is_blocked_by_admin(following_id)
  );

alter policy "advocate can start conversation with a connection" on public.conversations
  with check (
    (select auth.uid()) in (participant_one_id, participant_two_id)
    and exists (
      select 1 from public.connections
      where status = 'accepted'
        and least(requester_id, addressee_id) = least(participant_one_id, participant_two_id)
        and greatest(requester_id, addressee_id) = greatest(participant_one_id, participant_two_id)
    )
    and not exists (
      select 1 from public.blocks
      where (blocker_id = participant_one_id and blocked_id = participant_two_id)
         or (blocker_id = participant_two_id and blocked_id = participant_one_id)
    )
    and not public.is_blocked_by_admin(participant_one_id)
    and not public.is_blocked_by_admin(participant_two_id)
  );

alter policy "advocate can send messages in own conversations" on public.messages
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.participant_one_id, c.participant_two_id)
    )
    and not public.is_blocked_by_admin(sender_id)
  );
