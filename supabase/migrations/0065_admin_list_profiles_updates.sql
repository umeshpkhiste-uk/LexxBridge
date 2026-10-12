-- Two changes to the admin user directory (admin_list_profiles):
-- 1. Exclude admin accounts themselves — an admin can't block another
--    admin's account (there's only ever been the one, but the exclusion
--    is correct regardless) or their own, so they shouldn't be listed with
--    a "Block" action in the first place.
-- 2. Return profile_photo_url, so the directory can show each user's own
--    uploaded photo instead of a generic icon.

-- Return-type change (new profile_photo_url column) means a plain
-- CREATE OR REPLACE is rejected by Postgres; drop and recreate instead.
drop function public.admin_list_profiles(text);

create function public.admin_list_profiles(search text default null)
returns table (
  id uuid,
  full_name text,
  email text,
  city text,
  state text,
  profile_photo_url text,
  verification_status verification_status,
  is_blocked boolean,
  blocked_reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can list profiles';
  end if;
  return query
    select p.id, p.full_name, p.email, p.city, p.state, p.profile_photo_url, p.verification_status,
           (b.user_id is not null) as is_blocked, b.reason as blocked_reason,
           p.created_at
    from public.advocate_profiles p
    left join public.blocked_users b on b.user_id = p.id
    where (search is null or p.full_name ilike '%' || search || '%' or p.email ilike '%' || search || '%')
      and not exists (select 1 from public.admins a where a.user_id = p.id)
    order by p.created_at desc;
end;
$$;
