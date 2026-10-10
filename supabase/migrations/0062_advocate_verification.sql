-- Advocate identity verification workflow. Raises the cost of creating an
-- anonymous/disposable account on the network: an advocate submits their
-- Bar Council enrollment number/state plus a photo of their ID/enrollment
-- certificate, and an admin reviews it before granting "Verified" status.
--
-- verification_status/verification_notes/verified_at already exist on
-- advocate_profiles (0001) but have never had a real workflow. Before
-- adding one, close a real gap: advocate_profiles' only UPDATE policy is
-- "auth.uid() = id" with no column restriction, so any advocate can
-- currently self-set verification_status = 'verified' directly via a
-- PATCH. Revoke column-level UPDATE on those three columns and route every
-- change through two security-definer functions instead — same pattern as
-- admin_block_user/admin_set_report_status in 0048_decouple_admin.sql.
--
-- Per docs/ARCHITECTURE.md / 0048: admin capability must never add a new
-- RLS policy to advocate_profiles itself (that's the exact anti-pattern
-- 0048 undid). verification_requests is a new, dedicated table; admin
-- reads/writes it only through security-definer RPCs, exactly like
-- `reports` already works — no admin policy on the table itself.

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  advocate_id uuid not null references public.advocate_profiles (id) on delete cascade,
  bar_registration_number text not null check (char_length(bar_registration_number) between 1 and 100),
  bar_council_state text not null check (char_length(bar_council_state) between 1 and 100),
  document_storage_path text not null,
  status public.verification_status not null default 'pending',
  admin_notes text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_requests_advocate_id_idx on public.verification_requests (advocate_id);
create index verification_requests_pending_idx on public.verification_requests (created_at) where status = 'pending';

alter table public.verification_requests enable row level security;

create policy "advocate can read own verification requests"
  on public.verification_requests for select
  using ((select auth.uid()) = advocate_id);

create policy "advocate can submit verification requests"
  on public.verification_requests for insert
  with check ((select auth.uid()) = advocate_id);

-- Private storage bucket for the uploaded ID/certificate photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents', 'verification-documents', false, 10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

create policy "advocate can upload own verification document"
  on storage.objects for insert
  with check (bucket_id = 'verification-documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "advocate can read own verification document"
  on storage.objects for select
  using (bucket_id = 'verification-documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "admin can read verification documents"
  on storage.objects for select
  using (bucket_id = 'verification-documents' and public.is_admin((select auth.uid())));

-- Close the self-edit gap.
revoke update (verification_status, verified_at, verification_notes) on public.advocate_profiles from authenticated;

create or replace function public.submit_verification_request(
  p_bar_number text,
  p_bar_state text,
  p_document_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.verification_requests
    where advocate_id = (select auth.uid()) and status = 'pending'
  ) then
    raise exception 'You already have a pending verification request.';
  end if;

  insert into public.verification_requests (advocate_id, bar_registration_number, bar_council_state, document_storage_path)
  values ((select auth.uid()), p_bar_number, p_bar_state, p_document_path);

  update public.advocate_profiles
  set verification_status = 'pending'
  where id = (select auth.uid());
end;
$$;

revoke all on function public.submit_verification_request(text, text, text) from public;
grant execute on function public.submit_verification_request(text, text, text) to authenticated;

create or replace function public.admin_list_verification_requests()
returns table (
  id uuid,
  advocate_id uuid,
  full_name text,
  bar_registration_number text,
  bar_council_state text,
  document_storage_path text,
  status public.verification_status,
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can list verification requests';
  end if;
  return query
    select r.id, r.advocate_id, p.full_name, r.bar_registration_number, r.bar_council_state,
           r.document_storage_path, r.status, r.admin_notes, r.reviewed_at, r.created_at
    from public.verification_requests r
    join public.advocate_profiles p on p.id = r.advocate_id
    order by (r.status = 'pending') desc, r.created_at desc
    limit 100;
end;
$$;

revoke all on function public.admin_list_verification_requests() from public;
grant execute on function public.admin_list_verification_requests() to authenticated;

create or replace function public.admin_set_verification_status(
  request_id uuid,
  new_status public.verification_status,
  notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advocate_id uuid;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can review verification requests';
  end if;
  if new_status not in ('verified', 'rejected') then
    raise exception 'new_status must be verified or rejected';
  end if;

  update public.verification_requests
  set status = new_status, admin_notes = notes, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = request_id
  returning advocate_id into v_advocate_id;

  if v_advocate_id is null then
    raise exception 'Verification request not found';
  end if;

  update public.advocate_profiles
  set verification_status = new_status,
      verification_notes = notes,
      verified_at = case when new_status = 'verified' then now() else null end
  where id = v_advocate_id;

  perform public.log_audit_event(
    'admin_set_verification_status', 'verification_requests', request_id,
    jsonb_build_object('status', new_status, 'notes', notes)
  );
end;
$$;

revoke all on function public.admin_set_verification_status(uuid, public.verification_status, text) from public;
grant execute on function public.admin_set_verification_status(uuid, public.verification_status, text) to authenticated;
