# Project Memory

Read this before working in this repo. `AGENTS.md` and `CLAUDE.md` cover tool-specific
instructions (Expo version warning, code-review-graph MCP usage); this file covers what those
don't — what the app actually is, where things live, and hard-won operational lessons so they
don't get re-learned the expensive way.

## What this is

**LexxBridge** (formerly LexConnect, formerly CounselConnect — same app, renamed twice; old
references to either name in filenames/comments are historical, not errors) is a practice
management + professional network platform for advocates in India. Two halves in one app:

1. **Practice management** — clients, cases, hearings, documents, financial/fee ledger. Private
   to each advocate, enforced in Postgres, never joined to the network side.
2. **Professional network** — profiles, connections, posts, messaging (end-to-end encrypted).

Stack: Expo/React Native (iOS, Android, web via `react-native-web`), Expo Router (file-based,
`src/app/`), Supabase (Postgres + Auth/GoTrue + Storage + Realtime + Edge Functions), TypeScript.
No custom backend server — Supabase is the entire backend.

Supabase project ref: `ujrosfflqevkytburevc` (used throughout migrations/Edge Function URLs).

## Where things live

- `src/app/` — routes (Expo Router). `(auth)/` = signed-out, `(app)/(tabs)/` = the 5 bottom tabs,
  everything else under `(app)/` = pushed screens.
- `src/features/<name>/api.ts` — one file per feature holding all its Supabase calls; UI
  components live alongside.
- `src/shared/ui/` — the design-system primitives (`Button`, `TextField`, `SettingsGroup`, etc.) —
  reuse these, don't build one-off styled components.
- `supabase/migrations/NNNN_description.sql` — sequential, never edit a past one; the live
  database's actual state only matches what's been *applied*, not necessarily every file here (see
  "Migrations that need a human" below).
- `supabase/functions/<name>/` — Edge Functions. Excluded from ESLint (see `eslint.config.js`).

## Docs map — what to read for what

- `README.md` — product overview, phase status.
- `PRD.md` — the full product requirements, each feature tagged against what's actually
  shipped/partial/not-built — read this before assuming a spec'd feature exists.
- `docs/ARCHITECTURE.md` — the RLS/data-isolation model, the two intentionally
  `security_invoker = false` views.
- `docs/AUTH.md` — full auth implementation reference (sign-up/in, password reset, deep links,
  biometrics, app lock, the admin account's creation quirk).
- `docs/BACKEND_SETUP.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md` — exactly what they say.
- `SECURITY.md`, `DATA_SECURITY.md`, `THREAT_MODEL.md`, `SECURITY_CHECKLIST.md` — the security
  documentation set, cross-linked with each other. Start at `SECURITY_CHECKLIST.md` for current
  open items.
- `docs/RULES.md` — hard rules, not lessons: git hygiene, architecture invariants (admin
  separation, practice/network isolation, E2E encryption), migration constraints, secrets, and doc
  placement. If something below reads like a lesson learned, it's probably promoted to a rule
  there instead — check it before any commit or schema change.
- `legal/` — Play Store submission material (Privacy Policy, Terms, Data Safety form answers).

## Operational lessons (learned the hard way this session — don't re-learn these)

- **Supabase migrations containing `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER` get silently
  declined** when applied via the `apply_migration` MCP tool in this environment — even
  pure-additive ones with no drops. Plain DDL (tables, columns, policies, triggers that aren't
  `SECURITY DEFINER`, plain `UPDATE`/`INSERT` statements) goes through fine. When a migration mixes
  both, split it: apply the non-`SECURITY DEFINER` parts via the tool, then hand the
  `SECURITY DEFINER` parts to the user as raw SQL to paste into the Supabase SQL editor
  themselves. Always verify afterward by checking live state (`pg_proc`, `pg_policies`,
  `cron.job`, etc.) — never trust "no error" alone.
- **Several Supabase Auth settings have no MCP tool at all**: URL Configuration (Site
  URL/Redirect URLs), SMTP settings, Email Templates, and the leaked-password-protection toggle.
  These always require walking the user through the dashboard — give exact navigation paths and/or
  the direct `https://supabase.com/dashboard/project/ujrosfflqevkytburevc/...` URL.
- **Expo Router's typed routes (`.expo/types/router.d.ts`) only regenerate while a dev server is
  running** (`expo start`) — `expo export` does NOT regenerate them. After adding a new route,
  `tsc` will fail on `router.push("/new-route")` until you briefly run
  `npx expo start --web --port <free-port>` in the background, wait ~15–20s, then kill it.
- **A direct SQL-inserted `auth.users` row (e.g. seeding an admin account) needs
  `confirmation_token`, `recovery_token`, `email_change_token_new`, and `email_change` set to
  `''`, not left `NULL`** (the column default) — GoTrue scans them into non-nullable Go strings
  when authenticating, and `NULL` there fails every login with "Database error querying schema."
- **Deep links (`lexxbridge://...`) silently redirect to the wrong place** (looking like "the
  database's own domain") if Supabase's Auth → URL Configuration doesn't have both the app's
  scheme (`lexxbridge://**`) and the web domain in **Redirect URLs**, and a correct **Site URL** —
  Supabase falls back to Site URL rather than erroring when the redirect target isn't allow-listed.
- **Before every commit**, run `git status --short` first — this repo has pre-existing
  `.agents/`/`.codex/` files staged by something outside this session that must never be swept
  into a commit. Always `git add` exact paths and commit with an explicit pathspec
  (`git commit ... -- <paths>`), never `git add -A`.
