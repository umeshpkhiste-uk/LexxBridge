-- "Delete chat" from the chat list, WhatsApp-style: removes the chat and its
-- history for the person who deletes it only. The other participant keeps
-- theirs. Messages aren't deleted — each user just stops seeing anything
-- older than their own cleared_at. A new message from either side brings the
-- chat back with only the messages after that point.

create table public.conversation_clears (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.conversation_clears enable row level security;

create policy "Users read their own chat clears" on public.conversation_clears
  for select using (auth.uid() = user_id);

-- Only for conversations the user is actually part of.
create policy "Users clear their own chats" on public.conversation_clears
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one_id, c.participant_two_id)
    )
  );

create policy "Users clear their own chats again" on public.conversation_clears
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The cut-off is always server time, never the device clock: a phone with a
-- wrong clock would otherwise hide new messages or leave old ones visible.
create or replace function public.trg_conversation_clears_now()
returns trigger
language plpgsql
as $$
begin
  new.cleared_at := now();
  return new;
end;
$$;

create trigger conversation_clears_set_now
  before insert or update on public.conversation_clears
  for each row execute function public.trg_conversation_clears_now();
