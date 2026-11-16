-- DPDP Act 2023 §8(6): on a personal data breach, the Data Fiduciary must
-- notify the Data Protection Board and every affected Data Principal. These
-- two tables are the record that it happened, when, and to whom — the
-- evidence the Board's detailed report asks for. Procedure:
-- docs/BREACH_RESPONSE.md.
--
-- RLS is on with NO policies: no app user (or the admin role) can read or
-- write these. They're used only from the Supabase dashboard / SQL editor,
-- which runs as postgres and bypasses RLS.

create table public.data_breach_incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('B-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))),
  -- The moment we became aware: the 72-hour Board-report clock starts here.
  became_aware_at timestamptz not null,
  occurred_at timestamptz,
  summary text not null,
  -- e.g. '{profile, client_data, documents, financial, messages_ciphertext}'
  data_categories text[] not null default '{}',
  affected_user_count integer,
  cause text,
  containment_actions text,
  remedial_actions text,
  board_intimated_at timestamptz,
  board_report_submitted_at timestamptz,
  cert_in_reported_at timestamptz,
  users_notified_at timestamptz,
  status text not null default 'open' check (status in ('open', 'contained', 'closed')),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.data_breach_incidents enable row level security;

-- One row per affected user per channel they were told through. Kept
-- separately from public.notifications, which purges read rows after 90
-- days (0053) — this record must outlive that.
create table public.data_breach_notifications (
  incident_id uuid not null references public.data_breach_incidents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('in_app_push', 'email')),
  notified_at timestamptz not null default now(),
  primary key (incident_id, user_id, channel)
);

alter table public.data_breach_notifications enable row level security;
