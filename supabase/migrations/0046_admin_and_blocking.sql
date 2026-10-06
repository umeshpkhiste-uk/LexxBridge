-- Admin role + platform-level user blocking.
--
-- Two distinct kinds of "block" now exist in this app: the peer-to-peer
-- `blocks` table from 0016 (an advocate hiding one other advocate from
-- themselves), and the new `advocate_profiles.is_blocked` flag here (an
-- admin cutting a user off from the whole network). Both are enforced the
-- same way — as extra `and not exists (...)` clauses on the same insert
-- policies — so they compose instead of conflicting.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- A caller can only ever see their own admin row — just enough for the app
-- to ask "am I admin?". No insert/update/delete policy exists at all, so
-- admin grants can only ever happen via direct SQL (this migration, or a
-- future one), never through the client API — nobody can self-promote.
create policy "user can read own admin row"
  on public.admins for select
  using ((select auth.uid()) = user_id);

-- security definer so this can be called from inside other tables' RLS
-- policies without those policies also needing read access to `admins`
-- itself (same reasoning as handle_new_user's security definer below).
create or replace function public.is_admin(check_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where user_id = check_uid);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- Platform-level block, set only by an admin via the policy below.
alter table public.advocate_profiles
  add column is_blocked boolean not null default false,
  add column blocked_at timestamptz,
  add column blocked_reason text;

create policy "admin can read all profiles"
  on public.advocate_profiles for select
  using (public.is_admin((select auth.uid())));

create policy "admin can update block status"
  on public.advocate_profiles for update
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- The policy above lets an admin UPDATE any row, but only to flip the block
-- columns — this trigger is what actually stops that turning into a
-- backdoor for an admin to rewrite someone else's name/bio/etc. It compares
-- whole rows as jsonb (minus the columns an admin is allowed to touch) so
-- it stays correct as advocate_profiles gains more columns over time,
-- instead of hardcoding a column list that would silently go stale.
create or replace function public.protect_admin_block_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_rest jsonb;
  new_rest jsonb;
begin
  if (select auth.uid()) <> old.id then
    old_rest := to_jsonb(old) - 'is_blocked' - 'blocked_at' - 'blocked_reason' - 'updated_at';
    new_rest := to_jsonb(new) - 'is_blocked' - 'blocked_at' - 'blocked_reason' - 'updated_at';
    if old_rest <> new_rest then
      raise exception 'Admin updates to advocate_profiles may only change is_blocked, blocked_at, blocked_reason';
    end if;
  end if;
  return new;
end;
$$;

create trigger advocate_profiles_protect_admin_scope
  before update on public.advocate_profiles
  for each row execute function public.protect_admin_block_update();

-- Retroactively make connection requests, follows, conversation starts, and
-- in-conversation messages all respect the admin block too (same technique
-- 0016 used to retrofit the peer-to-peer `blocks` table into these same
-- policies — each `alter policy` below is that same with_check clause plus
-- one more `and not exists (...)` guard).

alter policy "advocate can send connection request" on public.connections
  with check (
    (select auth.uid()) = requester_id
    and not exists (
      select 1 from public.blocks
      where (blocker_id = requester_id and blocked_id = addressee_id)
         or (blocker_id = addressee_id and blocked_id = requester_id)
    )
    and not exists (
      select 1 from public.advocate_profiles
      where id in (requester_id, addressee_id) and is_blocked
    )
  );

alter policy "advocate can follow others" on public.follows
  with check (
    (select auth.uid()) = follower_id
    and not exists (
      select 1 from public.blocks
      where (blocker_id = follower_id and blocked_id = following_id)
         or (blocker_id = following_id and blocked_id = follower_id)
    )
    and not exists (
      select 1 from public.advocate_profiles
      where id in (follower_id, following_id) and is_blocked
    )
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
    and not exists (
      select 1 from public.advocate_profiles
      where id in (participant_one_id, participant_two_id) and is_blocked
    )
  );

-- Connections/follows/conversations only stop *new* edges from being
-- created. A user blocked after a conversation already exists could still
-- send messages into it without this: stop that too.
alter policy "advocate can send messages in own conversations" on public.messages
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.participant_one_id, c.participant_two_id)
    )
    and not exists (
      select 1 from public.advocate_profiles
      where id = sender_id and is_blocked
    )
  );

-- Reports (from 0016) were write-only-from-the-reporter's-perspective
-- pending an admin role — that role now exists, so give it read+review
-- access. Still nobody but the reporter can create a report.
create policy "admin can read all reports"
  on public.reports for select
  using (public.is_admin((select auth.uid())));

create policy "admin can review reports"
  on public.reports for update
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- Seed one real admin login. Fixed id so re-running this migration is a
-- no-op (`on conflict do nothing`) rather than creating duplicates.
-- email_confirmed_at is set directly so this account can sign in
-- immediately without going through the email-confirmation flow.
-- The real password used when this ran live is intentionally not committed
-- here — same "no secrets in version control" rule as `.env` (see
-- docs/BACKEND_SETUP.md). It was generated once, applied directly against
-- the project via the Supabase SQL console, and handed to the account
-- owner out-of-band. Re-running this file verbatim would create the admin
-- user with the literal placeholder password below instead — change it
-- first if you ever need to re-seed this on another project.
do $$
declare
  admin_id uuid := '2db734b2-50b8-45c9-b8e6-42eb1d9f5801';
  admin_email text := 'admin@lexxbridge.app';
  admin_password text := 'REPLACE_WITH_A_REAL_PASSWORD_BEFORE_RUNNING';
begin
  if not exists (select 1 from auth.users where id = admin_id) then
    -- confirmation_token/recovery_token/email_change_token_new/email_change
    -- are nullable in the table but GoTrue scans them into plain (non-null)
    -- Go strings when it loads a user to authenticate — leaving them NULL
    -- (the column default) makes every login attempt fail with "Database
    -- error querying schema". A normal sign-up never hits this because
    -- GoTrue's own insert path always sets '', not NULL.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      admin_id, 'authenticated', 'authenticated', admin_email,
      extensions.crypt(admin_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Admin"}'::jsonb,
      false, false,
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), admin_id::text, admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end if;

  insert into public.admins (user_id) values (admin_id)
  on conflict (user_id) do nothing;
end;
$$;
