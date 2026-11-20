-- "Pin chat" from the chat list: keeps a chat at the top of the signed-in
-- user's own list. Personal to each user — the other participant never sees
-- it and their list is untouched.

create table public.conversation_pins (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.conversation_pins enable row level security;

create policy "Users read their own chat pins" on public.conversation_pins
  for select using (auth.uid() = user_id);

-- Only for conversations the user is actually part of.
create policy "Users pin their own chats" on public.conversation_pins
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one_id, c.participant_two_id)
    )
  );

create policy "Users unpin their own chats" on public.conversation_pins
  for delete using (auth.uid() = user_id);
