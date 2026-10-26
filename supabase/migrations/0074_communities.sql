-- Communities: each advocate may create at most one (enforced by the unique
-- constraint on creator_id), with up to 50 added members drawn only from
-- their accepted connections. Membership is immediate — no invite/accept
-- step, since it's restricted to advocates already mutually connected.
--
-- Group chat: there is no group-encryption primitive available (the
-- existing 1:1 scheme in features/messaging/encryption.ts is a pairwise
-- Curve25519 box), so each message is fanned out: the sender's device
-- individually encrypts the same plaintext once per current member
-- (including itself, so it can re-read its own history later) and stores
-- one ciphertext row per recipient. The server only ever sees ciphertext.

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null unique references public.advocate_profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  advocate_id uuid not null references public.advocate_profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (community_id, advocate_id)
);

create index community_members_community_id_idx on public.community_members (community_id);
create index community_members_advocate_id_idx on public.community_members (advocate_id);

create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  sender_id uuid not null references public.advocate_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index community_messages_community_id_idx on public.community_messages (community_id, created_at);

-- One ciphertext per (message, recipient) — see header note on fan-out.
create table public.community_message_payloads (
  message_id uuid not null references public.community_messages (id) on delete cascade,
  recipient_id uuid not null references public.advocate_profiles (id) on delete cascade,
  content text not null,
  nonce text not null,
  primary key (message_id, recipient_id)
);

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_message_payloads enable row level security;

-- SECURITY DEFINER so membership-check policies below don't recurse into
-- community_members' own RLS (a policy on that table querying itself inside
-- `using` would otherwise re-trigger the same policy).
create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community_id and advocate_id = (select auth.uid())
  ) or exists (
    select 1 from public.communities
    where id = p_community_id and creator_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_community_member(uuid) from public, anon;
grant execute on function public.is_community_member(uuid) to authenticated;

create policy "member or creator can read community"
  on public.communities for select
  using (creator_id = (select auth.uid()) or public.is_community_member(id));

create policy "advocate can create own community"
  on public.communities for insert
  with check (creator_id = (select auth.uid()));

create policy "creator can rename own community"
  on public.communities for update
  using (creator_id = (select auth.uid()))
  with check (creator_id = (select auth.uid()));

create policy "creator can delete own community"
  on public.communities for delete
  using (creator_id = (select auth.uid()));

create policy "member can read community roster"
  on public.community_members for select
  using (public.is_community_member(community_id));

-- Membership writes only go through the SECURITY DEFINER RPCs below, which
-- enforce the connection requirement, the 50-member cap, and creator-only
-- access — direct table inserts/deletes are blocked so none of that can be
-- bypassed from the client.
create policy "no direct membership inserts"
  on public.community_members for insert
  with check (false);

create policy "no direct membership deletes"
  on public.community_members for delete
  using (false);

create or replace function public.add_community_member(p_community_id uuid, p_advocate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_count int;
begin
  select creator_id into v_creator from public.communities where id = p_community_id;
  if v_creator is null then
    raise exception 'Community not found';
  end if;
  if v_creator <> (select auth.uid()) then
    raise exception 'Only the community creator can add members';
  end if;
  if p_advocate_id = v_creator then
    raise exception 'The creator is already part of the community';
  end if;
  if not exists (
    select 1 from public.connections
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(v_creator, p_advocate_id)
      and greatest(requester_id, addressee_id) = greatest(v_creator, p_advocate_id)
  ) then
    raise exception 'You can only add advocates you are connected with';
  end if;
  select count(*) into v_count from public.community_members where community_id = p_community_id;
  if v_count >= 50 then
    raise exception 'A community can have at most 50 added members';
  end if;
  insert into public.community_members (community_id, advocate_id)
  values (p_community_id, p_advocate_id)
  on conflict (community_id, advocate_id) do nothing;
end;
$$;

revoke execute on function public.add_community_member(uuid, uuid) from public, anon;
grant execute on function public.add_community_member(uuid, uuid) to authenticated;

create or replace function public.remove_community_member(p_community_id uuid, p_advocate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select creator_id from public.communities where id = p_community_id) <> (select auth.uid()) then
    raise exception 'Only the community creator can remove members';
  end if;
  delete from public.community_members where community_id = p_community_id and advocate_id = p_advocate_id;
end;
$$;

revoke execute on function public.remove_community_member(uuid, uuid) from public, anon;
grant execute on function public.remove_community_member(uuid, uuid) to authenticated;

create policy "member can read community messages"
  on public.community_messages for select
  using (public.is_community_member(community_id));

create policy "member can send community messages"
  on public.community_messages for insert
  with check (sender_id = (select auth.uid()) and public.is_community_member(community_id));

create policy "recipient can read own payload"
  on public.community_message_payloads for select
  using (recipient_id = (select auth.uid()));

create policy "sender can write payloads for own message"
  on public.community_message_payloads for insert
  with check (
    exists (
      select 1 from public.community_messages m
      where m.id = message_id and m.sender_id = (select auth.uid())
    )
  );
