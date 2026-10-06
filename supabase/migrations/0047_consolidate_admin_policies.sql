-- Performance fix: 0046 added admin policies as *extra* permissive
-- policies alongside the existing owner-only ones. Postgres has to
-- evaluate every permissive policy for a given table/action and OR the
-- results together, so every single advocate_profiles/reports read or
-- update was now running two policy checks instead of one — flagged by
-- Supabase's own performance advisor ("Multiple Permissive Policies").
-- Fix: merge each pair into one policy with an OR inside it, which is one
-- check instead of two and behaves identically.

drop policy "advocate can read own profile" on public.advocate_profiles;
drop policy "admin can read all profiles" on public.advocate_profiles;
create policy "advocate can read own profile or admin can read any"
  on public.advocate_profiles for select
  using ((select auth.uid()) = id or public.is_admin((select auth.uid())));

drop policy "advocate can update own profile" on public.advocate_profiles;
drop policy "admin can update block status" on public.advocate_profiles;
create policy "advocate can update own profile or admin can update any"
  on public.advocate_profiles for update
  using ((select auth.uid()) = id or public.is_admin((select auth.uid())))
  with check ((select auth.uid()) = id or public.is_admin((select auth.uid())));

drop policy "advocate can read own reports" on public.reports;
drop policy "admin can read all reports" on public.reports;
create policy "advocate can read own reports or admin can read any"
  on public.reports for select
  using ((select auth.uid()) = reporter_id or public.is_admin((select auth.uid())));
