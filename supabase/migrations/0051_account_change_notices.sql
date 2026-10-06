-- Email notifications for security-sensitive account changes: password,
-- email, and phone. Supabase Auth only ever emails for the *request* to
-- change something (reset link, new-email confirm link) — never for the
-- change actually completing — so there's no dashboard template slot for
-- any of these. Wired up the same way 0035 already wires push
-- notifications: an after-update trigger calls net.http_post straight to
-- an Edge Function (send-account-notice), no caller JWT needed since it's
-- never invoked by the client.

create or replace function public.trg_notify_password_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password and new.email is not null then
    perform net.http_post(
      url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-account-notice',
      body := jsonb_build_object('type', 'password_changed', 'email', new.email),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_notify_password_changed() from public, anon, authenticated;

create trigger auth_users_notify_password_changed
  after update on auth.users
  for each row execute function public.trg_notify_password_changed();

create or replace function public.trg_notify_email_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email is distinct from new.email and old.email is not null and new.email is not null then
    -- Sent to the OLD address — that's the one that can still catch an
    -- account takeover; the new address already gets Supabase's own
    -- "confirm your new email" link separately.
    perform net.http_post(
      url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-account-notice',
      body := jsonb_build_object('type', 'email_changed', 'email', old.email, 'old_email', old.email, 'new_email', new.email),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_notify_email_changed() from public, anon, authenticated;

create trigger auth_users_notify_email_changed
  after update on auth.users
  for each row execute function public.trg_notify_email_changed();

-- Phone lives on advocate_profiles, not auth.users (this app doesn't use
-- Supabase's phone-auth), so this one's a separate trigger on a separate
-- table, looking the account email up by id rather than having it handy.
create or replace function public.trg_notify_phone_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_email text;
begin
  if old.phone is distinct from new.phone then
    select email into account_email from auth.users where id = new.id;
    if account_email is not null then
      perform net.http_post(
        url := 'https://ujrosfflqevkytburevc.supabase.co/functions/v1/send-account-notice',
        body := jsonb_build_object(
          'type', 'phone_changed',
          'email', account_email,
          'old_phone', coalesce(old.phone, 'none'),
          'new_phone', coalesce(new.phone, 'none')
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_notify_phone_changed() from public, anon, authenticated;

create trigger advocate_profiles_notify_phone_changed
  after update on public.advocate_profiles
  for each row execute function public.trg_notify_phone_changed();
