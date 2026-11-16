-- DPDP Act 2023 §6(10): where consent is the basis of processing, the Data
-- Fiduciary must be able to prove the notice was given and consent was
-- obtained. One row per (user, policy version) accepted — append-only, so
-- the history of what each person agreed to, and when, is preserved.
--
-- The client shows a consent screen whenever the signed-in user has no row
-- for the current policy version (new sign-ups, Google/Apple sign-ins that
-- skip the sign-up form, existing accounts, and every later policy update).

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Identifies the exact Terms + Privacy Policy text accepted (their
  -- "Last updated" date), e.g. '2026-10-11'.
  policy_version text not null,
  -- The user affirmatively confirmed being 18 or older (DPDP §9 — the
  -- service isn't offered to children, so no parental-consent flow).
  age_confirmed boolean not null,
  -- 'signup' (ticked at the sign-up form) or 'prompt' (accepted on the
  -- in-app consent screen).
  source text not null check (source in ('signup', 'prompt')),
  -- Server time, not client-supplied, so the record can't be backdated.
  accepted_at timestamptz not null default now(),
  unique (user_id, policy_version)
);

alter table public.user_consents enable row level security;

create policy "Users read their own consents"
  on public.user_consents for select
  using (auth.uid() = user_id);

create policy "Users record their own consent"
  on public.user_consents for insert
  with check (auth.uid() = user_id and age_confirmed);

-- Deliberately no update/delete policies: a consent record is evidence and
-- must not be edited after the fact. Account deletion still removes it via
-- the cascade above (right to erasure, §12(3)).
