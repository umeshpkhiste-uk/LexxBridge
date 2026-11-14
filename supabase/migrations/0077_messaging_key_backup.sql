-- Passphrase-protected backup of a user's messaging secret key, so
-- reinstalling the app or signing in on a new device can restore the same
-- key pair instead of generating a new one (which permanently strands
-- messages encrypted under the old key). The server only ever stores
-- ciphertext: the secret key is encrypted client-side with a key derived
-- from a passphrase that is never sent to the server, so this stays
-- end-to-end — nobody with database access (including an admin) can
-- decrypt a backup or the messages it unlocks.
create table if not exists public.messaging_key_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wrapped_secret_key text not null,
  nonce text not null,
  salt text not null,
  updated_at timestamptz not null default now()
);

alter table public.messaging_key_backups enable row level security;

create policy "messaging_key_backups_select_own" on public.messaging_key_backups
  for select using (auth.uid() = user_id);

create policy "messaging_key_backups_insert_own" on public.messaging_key_backups
  for insert with check (auth.uid() = user_id);

create policy "messaging_key_backups_update_own" on public.messaging_key_backups
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "messaging_key_backups_delete_own" on public.messaging_key_backups
  for delete using (auth.uid() = user_id);
