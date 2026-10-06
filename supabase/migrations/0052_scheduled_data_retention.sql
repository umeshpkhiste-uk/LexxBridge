-- Scheduled data retention (DATA_SECURITY.md §3: "retain and delete on a
-- schedule" instead of forever). Previously nothing purged automatically —
-- only full account deletion did. These two jobs run daily via pg_cron,
-- as postgres (bypassing RLS, same as any other maintenance job), and only
-- ever touch rows that have genuinely outlived their purpose:
--
--   - audit_logs older than 13 months: an activity trail, not something
--     anyone needs indefinitely. 13 months (not 12) so a full year is
--     always available even right after a monthly review.
--   - push_tokens not refreshed in 180 days: a token this stale almost
--     certainly belongs to a reinstalled/replaced device. send-push
--     already reactively removes tokens Expo reports as
--     DeviceNotRegistered; this catches the ones that just went quiet
--     without ever triggering that.
--
-- Retention windows are a product decision, not a security requirement —
-- change them here if the business ever wants something different.

create extension if not exists pg_cron;

select cron.schedule(
  'purge-old-audit-logs',
  '17 3 * * *',
  $$delete from public.audit_logs where created_at < now() - interval '13 months';$$
);

select cron.schedule(
  'purge-stale-push-tokens',
  '23 3 * * *',
  $$delete from public.push_tokens where updated_at < now() - interval '180 days';$$
);
