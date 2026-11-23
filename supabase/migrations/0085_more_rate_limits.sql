-- Rate limits for the tables 0055/0056 didn't cover: posts, comments,
-- reports, privacy grievances, and the practice-side records (clients,
-- cases, documents). Same idea as 0055 — generous enough that no real
-- advocate ever hits them, tight enough to stop a scripted burst.
--
-- One shared trigger function instead of a copy per table. Its arguments:
--   tg_argv[0] the column holding the author/owner's user id
--   tg_argv[1] how many inserts are allowed in the window
--   tg_argv[2] the window, as a Postgres interval ('1 hour', '1 day')
--   tg_argv[3] the message the user sees when they hit it — keep "please
--              wait" / "please slow down" in it: the app only shows a
--              database error to the user verbatim when it matches that
--              (see isRateLimitMessage in src/shared/lib/errors.ts)
--
-- security invoker: the count runs under the caller's own RLS, which
-- always lets them see their own rows, so no SECURITY DEFINER is needed.

create or replace function public.enforce_insert_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_column text := tg_argv[0];
  max_rows integer := tg_argv[1]::integer;
  time_window interval := tg_argv[2]::interval;
  recent integer;
begin
  execute format(
    'select count(*) from %I.%I where %I = $1 and created_at > now() - $2',
    tg_table_schema, tg_table_name, owner_column
  )
  into recent
  using (to_jsonb(new) ->> owner_column)::uuid, time_window;

  if recent >= max_rows then
    raise exception '%', tg_argv[3];
  end if;
  return new;
end;
$$;

-- Professional network
create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.enforce_insert_rate_limit(
    'author_id', '10', '1 hour', 'You have posted a lot in the last hour — please wait a little before posting again.');

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_insert_rate_limit(
    'author_id', '60', '1 hour', 'You are commenting too quickly — please wait a little before commenting again.');

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_insert_rate_limit(
    'reporter_id', '20', '1 hour', 'Too many reports sent recently — please wait before sending more.');

create trigger data_grievances_rate_limit
  before insert on public.data_grievances
  for each row execute function public.enforce_insert_rate_limit(
    'user_id', '5', '1 day', 'You have raised several grievances today — please wait until tomorrow to raise another. We will respond to each one.');

-- Practice management (per advocate)
create trigger clients_rate_limit
  before insert on public.clients
  for each row execute function public.enforce_insert_rate_limit(
    'advocate_id', '100', '1 hour', 'Too many clients added in the last hour — please wait a little before adding more.');

create trigger cases_rate_limit
  before insert on public.cases
  for each row execute function public.enforce_insert_rate_limit(
    'advocate_id', '100', '1 hour', 'Too many cases added in the last hour — please wait a little before adding more.');

create trigger documents_rate_limit
  before insert on public.documents
  for each row execute function public.enforce_insert_rate_limit(
    'advocate_id', '100', '1 hour', 'Too many documents uploaded in the last hour — please wait a little before uploading more.');
