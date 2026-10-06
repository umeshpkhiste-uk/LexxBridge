# Rules

Hard rules for working in this repo — not guidance, not conventions that can bend with taste.
Everything here has either caused a real incident when violated, or protects an architectural
decision the user made explicitly. `docs/MEMORY.md` covers context and lessons; this file covers
what must always hold.

## Git

- **Never `git add -A` or `git add .`.** This repo has pre-existing `.agents/skills/*` and
  `.codex/*` files staged by something outside any given session that must never be swept into a
  commit. Run `git status --short` first, then stage exact paths, then commit with an explicit
  pathspec: `git commit -m "..." -- <path> <path> ...`.
- **Never force-push, `reset --hard`, or discard uncommitted work** without running `git status`
  first and confirming with the user if anything unexpected is there.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```
- Every pull request description ends with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

## Architecture invariants

- **Admin is a separate entity, with zero dependencies baked into normal user flows.** It lives in
  its own `admins` / `blocked_users` tables and its own `SECURITY DEFINER` RPC functions
  (`admin_*`). No ordinary-user table gains an "admin approval" column, no ordinary-user flow
  branches on admin state, and no extra permissive RLS policy is added to a table every normal
  user already reads just to give admin a side door — see `docs/ARCHITECTURE.md` and
  `docs/SECURITY_CHECKLIST.md`.
- **Admin never gains access to private practice data** (clients, cases, documents, financial
  records). The isolation between any two advocates holds for admin too, with no exception.
- **Practice management and the professional network never share a join.** A client/case/document
  row is never reachable from any network-side query, regardless of connection status.
- **Messages stay end-to-end encrypted client-side.** No change may introduce a path where the
  server (or an admin, or a migration) can read plaintext message content.

## Database & migrations

- Never edit a past migration file. Add a new one.
- `apply_migration` silently declines any migration containing
  `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER`, even pure-additive ones, in this environment.
  Split the migration: apply the non-`SECURITY DEFINER` parts via the tool, hand the
  `SECURITY DEFINER` parts to the user as raw SQL for the Supabase SQL editor. Always verify
  afterward against live state (`pg_proc`, `pg_policies`, `cron.job`, etc.) — never trust
  "no error" alone.
- Every table holding owner-specific data must have RLS enabled, enforced in Postgres — never
  relying on application-level checks alone.
- Every `SECURITY DEFINER` function must perform its own internal authorization check, not just
  rely on who is allowed to call it.

## Secrets

- Never commit `.env`, API keys, or service-role credentials. Secrets live only as Edge Function
  environment variables or Supabase Vault entries, set via the dashboard.
- Service-role access (which bypasses RLS) is confined to the three narrowly-scoped Edge Functions
  that already use it (`send-push`, `send-feedback`, `send-account-notice`) — never shipped to a
  client, never added to a fourth function without the same scrutiny.

## Documentation placement

- All documentation lives in `docs/`, except `README.md`, `CLAUDE.md`, and `AGENTS.md`, which stay
  at repo root because GitHub / Claude Code / agent tooling specifically expect them there.
- Design/reference images live in `design/`, not a second parallel folder.
- When a doc moves, every relative link to and from it must be re-verified — siblings within
  `docs/` link to each other with no `docs/` prefix; files outside `docs/` (e.g. `legal/`,
  `README.md`) must point into `docs/`.

## Tooling gaps (no workaround exists — don't try to invent one)

- Supabase Auth's URL Configuration, SMTP Settings, Email Templates, and the leaked-password-
  protection toggle have no MCP tool. Walk the user through the dashboard directly.
- Expo Router's typed routes (`.expo/types/router.d.ts`) only regenerate while a dev server is
  running — `expo export` does not regenerate them.
