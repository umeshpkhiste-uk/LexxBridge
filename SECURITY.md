# Security Policy

LexxBridge handles advocates' private practice data (clients, cases, documents, finances) and
end-to-end encrypted messages. We take reports about security issues seriously and will respond
promptly.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.**

Email **<deepomeshcreation@gmail.com>** with:

- A description of the issue and its potential impact.
- Steps to reproduce (a minimal example is ideal).
- Any relevant logs, screenshots, or request/response payloads (redact anything belonging to a
  real third party).

You'll get an acknowledgement within a few days. We'll keep you updated as we investigate and fix
the issue, and we're happy to credit you in the fix's commit/changelog unless you'd prefer to stay
anonymous.

## Supported versions

LexxBridge ships continuously from the `main` branch — there are no parallel maintained release
lines. Only the latest commit on `main` (and whatever's currently deployed to production) is
supported; please test against that before reporting.

## Security model

Full detail lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and, for everything
authentication-specific (sign-up/in, password reset, deep links, biometrics, app lock, the admin
account), [`docs/AUTH.md`](docs/AUTH.md). The short version:

- **Database-enforced isolation.** Every table with owner-specific data has Row Level Security
  enabled, and ownership is checked in Postgres itself (`auth.uid() = owner_id`), not just in
  application code. Being connected to another advocate on the network never grants access to
  their clients, cases, documents, or financial records — there's no join path between that data
  and the social-graph tables at all.
- **Automated cross-tenant test.** `src/__tests__/integration/authorization.test.ts`
  (`npm run test:integration`) runs against a real Supabase project and asserts that one
  advocate's account genuinely cannot read or write another's private data. See
  [`docs/TESTING.md`](docs/TESTING.md).
- **End-to-end encrypted messaging.** Direct messages are encrypted client-side (Curve25519 via
  `tweetnacl`) with a per-device key pair; the server only ever stores ciphertext. This is a
  deliberate trade-off: there is no server-side key escrow, so a device that loses its local key
  pair (reinstall, new device, cleared storage) permanently loses the ability to decrypt its own
  past messages. The app surfaces this explicitly rather than hiding it.
- **Admin is a separate, additive entity.** Admin privileges (`public.admins`, `public.is_admin()`)
  and the moderation block list (`public.blocked_users`) are modeled as their own tables — an
  ordinary user's own data access never routes through admin-related logic. The one deliberate
  exception is a single lean check (`is_blocked_by_admin()`) inside the connect/follow/message
  policies, so a platform-level block can actually stop new contact between two accounts.
- **Secrets are never committed.** `.env` is gitignored (only `.env.example`, with placeholders,
  is tracked); the Supabase service-role key and third-party API keys (e.g. Resend) live only in
  Supabase Edge Function environment variables / secrets, never in source.
- **Account deletion is real.** Deleting an account removes Storage files first, then a database
  function deletes the `auth.users` row and lets `on delete cascade` remove every dependent row.

## Known, intentional findings

A few things Supabase's own security/performance advisors flag are deliberate design decisions,
not oversights — reporting these again won't surprise us, but we've documented the reasoning so a
report can go straight to "is the reasoning actually wrong?" instead of "did they know?":

- **`public_advocate_profiles` and `advocate_network_stats` are `security_invoker = false`.**
  This is intentional — see the "intentionally" section in `docs/ARCHITECTURE.md`. Switching them
  to `security_invoker = true` would reintroduce a real bug (the view would inherit the base
  table's own-row-only RLS and silently return nothing to other advocates).
- **Several `SECURITY DEFINER` RPC functions** (`is_admin`, `is_blocked_by_admin`, the `admin_*`
  functions, `connection_phone_numbers`, `mutual_connection_counts`, `log_audit_event`,
  `increment_post_share`, `delete_my_account`) are grantable to `authenticated` (and in a couple
  of cases `anon`) at the Postgres level. Each does its own internal authorization check — the
  `admin_*` functions raise an exception unless the caller is in `public.admins`, for example —
  so being *callable* isn't the same as being *unrestricted*.
- **`pg_net` is installed in the `public` schema.** Default for Supabase projects using
  database-triggered HTTP calls (push notifications, account-change emails); not currently
  planned to move to a dedicated schema.

## Open item — not yet enabled

**Leaked password protection** (Supabase's HaveIBeenPwned check on sign-up/password-change) is
currently **off**, and the toggle (Authentication → Policies → Email → "Prevent use of leaked
passwords") is **grayed out on the Free plan** — it requires upgrading to Supabase Pro or above.
Tracked here so it isn't forgotten and so the reason it's off is clear (a plan limit, not an
oversight).

**Fixed:** minimum password length was raised from the default of 6 to **8**, matching what the
app's own sign-up form already required client-side (`signUpSchema` in
`src/features/auth/schemas.ts`). Before this, the server was actually laxer than the app — a
direct API call bypassing the app's form could set a 6-character password.

## Scope

This covers the LexxBridge mobile/web app and its Supabase backend (database, Storage, Edge
Functions). Issues in third-party services we depend on (Supabase, Resend, Expo/EAS) should be
reported to those providers directly.
