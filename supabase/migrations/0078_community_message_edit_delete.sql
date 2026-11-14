-- Reply/edit/delete for community (group) messages, mirroring the direct
-- message feature. reply_to_id is a plain pointer (never re-encrypted) —
-- the referenced message's text is already decrypted client-side from the
-- same payload fan-out every other message uses, so resolving a quote is
-- just a local lookup, not a new ciphertext field.
alter table public.community_messages
  add column reply_to_id uuid references public.community_messages (id) on delete set null,
  add column is_deleted boolean not null default false,
  add column edited_at timestamptz;

create policy "sender can update own community message"
  on public.community_messages for update
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

-- Editing re-encrypts the new text once per current member (same fan-out as
-- sending), so the sender needs to write every recipient's payload row, not
-- just their own. Deleting a message removes its payloads outright instead
-- of leaving stale ciphertext around.
create policy "sender can update payloads for own message"
  on public.community_message_payloads for update
  using (
    exists (select 1 from public.community_messages m where m.id = message_id and m.sender_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.community_messages m where m.id = message_id and m.sender_id = (select auth.uid()))
  );

create policy "sender can delete payloads for own message"
  on public.community_message_payloads for delete
  using (
    exists (select 1 from public.community_messages m where m.id = message_id and m.sender_id = (select auth.uid()))
  );
