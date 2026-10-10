-- The admin account exists purely to moderate chats/content and block
-- illegal activity (see 0046_admin_and_blocking.sql) and must never appear
-- as a normal user in search, "Find colleagues" suggestions, or any public
-- profile lookup. Exclude it from public_advocate_profiles, the single view
-- every network-facing feature (search, suggestions, public profile pages)
-- reads from.
create or replace view public.public_advocate_profiles
with (security_invoker = true) as
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
from advocate_profiles p
where not public.is_admin(id)
  and (
    profile_visibility = any (array['public'::profile_visibility, 'connections_only'::profile_visibility])
    or id = (select auth.uid())
    or exists (
      select 1 from connections c
      where c.status = 'accepted'::connection_status
        and least(c.requester_id, c.addressee_id) = least(p.id, (select auth.uid()))
        and greatest(c.requester_id, c.addressee_id) = greatest(p.id, (select auth.uid()))
    )
  );
