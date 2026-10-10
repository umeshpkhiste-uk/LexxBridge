-- Fix a bug from 0060: that migration recreated public_advocate_profiles
-- with `security_invoker = true`, which (per docs/ARCHITECTURE.md, and the
-- exact same mistake previously made and fixed in 0015) makes the view
-- inherit the caller's RLS on the underlying advocate_profiles table.
-- advocate_profiles' own RLS is "you may only read your own row", so with
-- security_invoker = true the view could structurally never return any
-- advocate's profile but your own, regardless of profile_visibility —
-- breaking search, "Find colleagues" suggestions and the connections list
-- for every advocate's public/connections_only/connected profiles, for
-- everyone. Restore the correct, intentional security_invoker = false
-- (where the view's own WHERE clause is the sole security boundary) while
-- keeping 0060's admin exclusion.
create or replace view public.public_advocate_profiles
with (security_invoker = false) as
select
  id,
  full_name,
  headline,
  about,
  city,
  state,
  languages,
  practice_areas,
  courts,
  years_of_experience,
  website,
  profile_photo_url,
  verification_status = 'verified'::verification_status as is_verified,
  case when contact_info_visible then contact_preferences else '{}'::jsonb end as contact_preferences,
  created_at,
  education,
  bar_memberships,
  messaging_public_key
from public.advocate_profiles p
where not public.is_admin(id)
  and (
    profile_visibility = any (array['public'::profile_visibility, 'connections_only'::profile_visibility])
    or id = (select auth.uid())
    or exists (
      select 1 from public.connections c
      where c.status = 'accepted'::connection_status
        and least(c.requester_id, c.addressee_id) = least(p.id, (select auth.uid()))
        and greatest(c.requester_id, c.addressee_id) = greatest(p.id, (select auth.uid()))
    )
  );
