-- DPDP Act 2023 §14 (right to nominate) and §13 (grievance redressal).

-- §14: the individual a user nominates to exercise their data rights if they
-- die or become incapacitated. One per user. The nominee acts by writing to
-- the Grievance Officer with proof — this row is what that request is
-- checked against.
create table public.data_nominees (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  relationship text not null check (length(trim(relationship)) between 1 and 60),
  email text check (email is null or length(email) <= 254),
  phone text check (phone is null or length(phone) <= 20),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

alter table public.data_nominees enable row level security;

create policy "Users read their own nominee" on public.data_nominees
  for select using (auth.uid() = user_id);
create policy "Users add their own nominee" on public.data_nominees
  for insert with check (auth.uid() = user_id);
create policy "Users change their own nominee" on public.data_nominees
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users remove their own nominee" on public.data_nominees
  for delete using (auth.uid() = user_id);

-- §13: grievances about how personal data is handled. Kept as rows (not
-- only emails) so each one has a reference number and a server-recorded
-- receipt time — the clock the response deadline runs from. Users can file
-- and read their own; they can't edit or delete them (status changes are
-- made by the team from the dashboard).
create table public.data_grievances (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('G-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('access', 'correction', 'erasure', 'consent', 'nominee', 'breach', 'other')),
  description text not null check (length(trim(description)) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.data_grievances enable row level security;

create policy "Users read their own grievances" on public.data_grievances
  for select using (auth.uid() = user_id);
-- Status/resolved_at aren't user-settable: insert must leave the defaults.
create policy "Users file their own grievances" on public.data_grievances
  for insert with check (auth.uid() = user_id and status = 'open' and resolved_at is null);

create index data_grievances_user_id_idx on public.data_grievances (user_id, created_at desc);
