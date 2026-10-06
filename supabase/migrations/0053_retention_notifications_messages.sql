-- Closes the remaining gap noted in DATA_SECURITY.md §3: read
-- notifications and soft-deleted messages weren't covered by 0052's
-- retention jobs. Both are safe to hard-delete on a schedule:
--
--   - notifications: only ones already marked read are purged — an unread
--     notification still has to surface to the user, so those are left
--     alone regardless of age.
--   - messages: only ones already soft-deleted (is_deleted = true) are
--     purged. Their content is already overwritten to '[deleted]' at
--     delete time, so no message content is lost by this — it's removing
--     an empty placeholder row, not real conversation history. Safe even
--     with other messages replying to it: reply_to_id is
--     `on delete set null` (0025_chat_features.sql), so a reply just loses
--     its "replying to" pointer instead of being blocked or cascaded.

select cron.schedule(
  'purge-read-notifications',
  '31 3 * * *',
  $$delete from public.notifications where is_read and created_at < now() - interval '90 days';$$
);

select cron.schedule(
  'purge-old-deleted-messages',
  '37 3 * * *',
  $$delete from public.messages where is_deleted and created_at < now() - interval '24 months';$$
);
