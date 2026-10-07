-- Closes the one real gap flagged in docs/TASK.md / the rate-limiting
-- review: send-feedback requires a real JWT and caps word count server-side,
-- but has no frequency cap — a signed-in user could loop-call it and burn
-- the Resend send quota. Same shape as 0055's connections/follows/messages
-- rate limits: a small log table the inserting user can only see their own
-- rows of, and a before-insert trigger that counts recent rows and raises
-- past the limit. 5/hour is generous for real feedback use (nobody
-- legitimately sends 5 pieces of feedback in an hour) and tight enough to
-- stop a scripted burst.

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;

create policy "advocate can log own feedback submission"
  on public.feedback_submissions for insert
  with check ((select auth.uid()) = user_id);

create policy "advocate can read own feedback submission log"
  on public.feedback_submissions for select
  using ((select auth.uid()) = user_id);

create or replace function public.enforce_feedback_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (
    select count(*) from public.feedback_submissions
    where user_id = new.user_id and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Too much feedback sent recently — please wait before sending more.';
  end if;
  return new;
end;
$$;

create trigger feedback_submissions_rate_limit
  before insert on public.feedback_submissions
  for each row execute function public.enforce_feedback_rate_limit();

-- This table is a rate-limit ledger, not content anyone needs to keep —
-- same "retain and delete on a schedule" principle as 0052/0053.
select cron.schedule(
  'purge-old-feedback-submissions',
  '31 3 * * *',
  $$delete from public.feedback_submissions where created_at < now() - interval '30 days';$$
);
