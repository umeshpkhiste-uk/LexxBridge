-- Closes three of the five open items in SECURITY_CHECKLIST.md:
--
--   R6 (rate limiting): per-sender throttles on connections, follows, and
--   messages — generous enough that no real user should ever hit them,
--   tight enough to stop a scripted spam burst.
--
--   R8 (content-type allow-list): every bucket now restricts
--   allowed_mime_types instead of accepting anything. post-videos already
--   had this (video/*) from its own migration; the rest didn't.
--
--   Admin audit trail: admin_block_user/admin_unblock_user/
--   admin_set_report_status now call log_audit_event() so there's a real
--   history of who did what and when, not just blocked_users' current
--   state (which loses the previous admin's identity on a re-block).

-- Rate limiting --------------------------------------------------------

create or replace function public.enforce_connection_request_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (
    select count(*) from public.connections
    where requester_id = new.requester_id and created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Too many connection requests — please wait before sending more.';
  end if;
  return new;
end;
$$;

create trigger connections_rate_limit
  before insert on public.connections
  for each row execute function public.enforce_connection_request_rate_limit();

create or replace function public.enforce_follow_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (
    select count(*) from public.follows
    where follower_id = new.follower_id and created_at > now() - interval '1 hour'
  ) >= 50 then
    raise exception 'Too many follows — please wait before following more people.';
  end if;
  return new;
end;
$$;

create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function public.enforce_follow_rate_limit();

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (
    select count(*) from public.messages
    where sender_id = new.sender_id and created_at > now() - interval '5 minutes'
  ) >= 60 then
    raise exception 'You are sending messages too quickly — please slow down.';
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

-- Content-type allow-lists ----------------------------------------------

update storage.buckets
set allowed_mime_types = array['image/*']
where id in ('profile-photos', 'post-images');

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/*',
  'application/zip'
]
where id in ('post-attachments', 'message-attachments', 'documents');

-- Admin audit trail -------------------------------------------------------
-- This part could not be applied automatically (SECURITY DEFINER function
-- changes keep getting declined in this session, same as 0048's admin
-- functions did) — run it manually via the Supabase SQL editor.

create or replace function public.admin_block_user(target_id uuid, block_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can block a user';
  end if;
  insert into public.blocked_users (user_id, blocked_by, reason)
  values (target_id, (select auth.uid()), block_reason)
  on conflict (user_id) do update set blocked_by = excluded.blocked_by, reason = excluded.reason, created_at = now();
  perform public.log_audit_event('admin_block_user', 'advocate_profiles', target_id, jsonb_build_object('reason', block_reason));
end;
$$;

create or replace function public.admin_unblock_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can unblock a user';
  end if;
  delete from public.blocked_users where user_id = target_id;
  perform public.log_audit_event('admin_unblock_user', 'advocate_profiles', target_id);
end;
$$;

create or replace function public.admin_set_report_status(report_id uuid, new_status public.report_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can review reports';
  end if;
  update public.reports set status = new_status where id = report_id;
  perform public.log_audit_event('admin_set_report_status', 'reports', report_id, jsonb_build_object('status', new_status));
end;
$$;
