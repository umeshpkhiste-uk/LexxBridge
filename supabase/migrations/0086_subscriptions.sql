-- Monthly subscription via Razorpay, plus the free plan's 5-client limit.
--
--   trial  first 7 days after sign-up (or after SUBSCRIPTIONS_LAUNCH for
--          accounts that existed before subscriptions did): everything
--          unlimited, no card needed.
--   free   after the trial, without a paid subscription: up to 5 clients;
--          payment reminders and fee statements are locked (in the app).
--   paid   an active Razorpay subscription: everything unlimited.
--
-- Payment state is written ONLY by the razorpay-webhook Edge Function (service
-- role), after it has verified Razorpay's signature. Users can read their own
-- rows and nothing else — there is no insert/update/delete policy, so no one
-- can mark themselves as paid from the app.

create table public.subscriptions (
  razorpay_subscription_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Razorpay's own status: created, authenticated, active, pending, halted,
  -- cancelled, completed, expired, paused.
  status text not null,
  -- End of the period already paid for (Razorpay's current_end).
  current_period_end timestamptz,
  -- Razorpay's event time, so a late-arriving older webhook never overwrites
  -- a newer status.
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

create policy "users read own subscriptions"
  on public.subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

-- The caller's plan. SECURITY DEFINER only to read the caller's own sign-up
-- time from auth.users; it takes no arguments and only ever looks at
-- auth.uid(), so it can't reveal anything about another account.
create or replace function public.my_plan()
returns table (plan text, trial_ends_at timestamptz, paid_until timestamptz, status text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select u.id,
           -- Accounts older than subscriptions get their 7 days from launch.
           greatest(u.created_at, timestamptz '2026-11-25 00:00:00+05:30') + interval '7 days' as trial_ends_at
    from auth.users u
    where u.id = auth.uid()
  ),
  latest as (
    select s.status, s.current_period_end
    from public.subscriptions s
    where s.user_id = auth.uid()
    order by s.last_event_at desc
    limit 1
  ),
  paid as (
    select exists (
      select 1
      from public.subscriptions s
      where s.user_id = auth.uid()
        and (
          -- Active, or a renewal charge being retried: a few days' grace past
          -- the period end in case a renewal webhook is late.
          (s.status in ('active', 'pending') and s.current_period_end > now() - interval '3 days')
          -- Cancelled: keeps what was already paid for until it runs out.
          or (s.status = 'cancelled' and s.current_period_end > now())
        )
    ) as ok
  )
  select
    case when paid.ok then 'paid' when me.trial_ends_at > now() then 'trial' else 'free' end,
    me.trial_ends_at,
    latest.current_period_end,
    latest.status
  from me
  cross join paid
  left join latest on true;
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- The free plan's client limit, enforced here so it holds no matter how the
-- insert arrives. The app looks for FREE_PLAN_CLIENT_LIMIT in the error to
-- show its "subscribe" popup instead of a generic error. Archived clients
-- count too — otherwise archiving would be a way around the limit.
create or replace function public.enforce_free_plan_client_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_plan text;
  existing integer;
begin
  -- No signed-in user (server-side maintenance): not a plan question.
  if auth.uid() is null then
    return new;
  end if;

  select p.plan into current_plan from public.my_plan() p;
  if current_plan is distinct from 'free' then
    return new;
  end if;

  select count(*) into existing from public.clients where advocate_id = new.advocate_id;
  if existing >= 5 then
    raise exception 'FREE_PLAN_CLIENT_LIMIT: The free plan allows up to 5 clients. Subscribe to the monthly plan for unlimited clients.';
  end if;
  return new;
end;
$$;

create trigger clients_free_plan_limit
  before insert on public.clients
  for each row execute function public.enforce_free_plan_client_limit();
