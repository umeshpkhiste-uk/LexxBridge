alter table public.cases
  add column discontinued_at timestamptz,
  add column discontinuation_reason text;
