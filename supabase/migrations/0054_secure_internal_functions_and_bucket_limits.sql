-- Closes two gaps THREAT_MODEL.md flagged (R3, R7):
--
-- R3: send-push and send-account-notice had no caller verification at all
-- (verify_jwt: false, no secret check) — anyone who found either URL could
-- call it directly. Both now require an `x-internal-secret` header
-- matching a shared secret kept in Supabase Vault
-- (`internal_function_secret`, created out-of-band — see THREAT_MODEL.md;
-- never committed here) and checked by each function against its own
-- INTERNAL_FUNCTION_SECRET env var. Every trigger that calls either
-- function is updated here to send it.
--
-- R7: profile-photos and post-images were the only 2 of 6 Storage buckets
-- with no file_size_limit set — relying entirely on client-side behavior.
-- 10 MB each is generous for a photo (well above a typical compressed
-- camera photo) while closing the "upload anything, any size" gap.

create or replace function public.trg_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_secret text;
begin
  if exists (select 1 from public.push_tokens where user_id = new.recipient_id) then
    select decrypted_secret into internal_secret from vault.decrypted_secrets where name = 'internal_function_secret';
    perform net.http_post(
      url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-push',
      body := jsonb_build_object('notification_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', internal_secret)
    );
  end if;
  return new;
end;
$$;

create or replace function public.trg_notify_password_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_secret text;
begin
  if old.encrypted_password is distinct from new.encrypted_password and new.email is not null then
    select decrypted_secret into internal_secret from vault.decrypted_secrets where name = 'internal_function_secret';
    perform net.http_post(
      url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-account-notice',
      body := jsonb_build_object('type', 'password_changed', 'email', new.email),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', internal_secret)
    );
  end if;
  return new;
end;
$$;

create or replace function public.trg_notify_email_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_secret text;
begin
  if old.email is distinct from new.email and old.email is not null and new.email is not null then
    select decrypted_secret into internal_secret from vault.decrypted_secrets where name = 'internal_function_secret';
    perform net.http_post(
      url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-account-notice',
      body := jsonb_build_object('type', 'email_changed', 'email', old.email, 'old_email', old.email, 'new_email', new.email),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', internal_secret)
    );
  end if;
  return new;
end;
$$;

create or replace function public.trg_notify_phone_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_email text;
  internal_secret text;
begin
  if old.phone is distinct from new.phone then
    select email into account_email from auth.users where id = new.id;
    if account_email is not null then
      select decrypted_secret into internal_secret from vault.decrypted_secrets where name = 'internal_function_secret';
      perform net.http_post(
        url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-account-notice',
        body := jsonb_build_object(
          'type', 'phone_changed',
          'email', account_email,
          'old_phone', coalesce(old.phone, 'none'),
          'new_phone', coalesce(new.phone, 'none')
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', internal_secret)
      );
    end if;
  end if;
  return new;
end;
$$;

update storage.buckets set file_size_limit = 10485760 where id in ('profile-photos', 'post-images');
