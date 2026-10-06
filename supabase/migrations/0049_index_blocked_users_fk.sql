-- Supabase's performance advisor flagged blocked_users.blocked_by as an
-- unindexed foreign key after 0048 — same "index every FK" standard 0045
-- already applied everywhere else.
create index blocked_users_blocked_by_idx on public.blocked_users (blocked_by);
