# Threat Model

Map the app → assess what could go wrong at each point → confirm (or flag) what actually stops it.
This is the companion to [`SECURITY.md`](SECURITY.md) (vulnerability reporting, high-level model),
[`DATA_SECURITY.md`](DATA_SECURITY.md) (classify/protect/retain/limit for data specifically), and
[`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md) (the checkable, run-before-release summary of all
three); this document is about *entry points and attack surface*, not data categories.

Built from the actual schema, RLS policies, and Edge Functions as they exist today — not a
generic template. Re-derive the "Entry points" and "Protections" tables whenever a migration or
Edge Function is added; this file goes stale otherwise.

## 1. Entry points

Every way data or a request gets *into* the system.

### Public / unauthenticated

| Entry point | What it accepts |
|---|---|
| Sign-up, sign-in, forgot-password forms | Email, password, full name |
| Social OAuth (Google/Facebook/Apple) callback | Provider-issued auth code |
| Deep link `lexxbridge://<path>?code=...` | PKCE auth code (email confirm, password reset, OAuth callback) |
| `public_advocate_profiles` / `advocate_network_stats` views | Read-only, no input — but publicly queryable by anyone with the anon key |
| `send-push` Edge Function | `{ notification_id }` — called only by a database trigger, no caller JWT |
| `send-account-notice` Edge Function | `{ type, email, ... }` — called only by a database trigger, no caller JWT |

### Authenticated (signed-in advocate)

| Entry point | What it accepts |
|---|---|
| Every table's PostgREST CRUD surface (`clients`, `cases`, `hearings`, `messages`, `posts`, `transactions`, `documents`, …) | Full read/write per that table's RLS policies |
| `send-feedback` Edge Function | `{ comment }` (≤500 words) — requires a valid caller JWT |
| File uploads — 6 Storage buckets: `profile-photos`, `post-images`, `post-videos`, `post-attachments`, `message-attachments`, `documents` | Binary file content + metadata |
| ~19 `SECURITY DEFINER` RPC functions grantable to `authenticated` (`admin_block_user`, `admin_unblock_user`, `admin_list_profiles`, `admin_list_reports`, `admin_set_report_status`, `is_admin`, `is_blocked_by_admin`, `connection_phone_numbers`, `mutual_connection_counts`, `log_audit_event`, `increment_post_share`, `record_partial_payment`, `delete_my_account`, `can_see_post(s)`, `can_see_comment`, `is_conversation_participant`, …) | Function-specific arguments |
| Realtime subscriptions (`postgres_changes` on `messages`, `conversations`, `notifications`) | No input — a live read channel |

### Internal only (never called by the app or a client)

| Entry point | Trigger |
|---|---|
| `trg_notify_password_changed`, `trg_notify_email_changed` | `auth.users` row update |
| `trg_notify_phone_changed` | `advocate_profiles.phone` update |
| `trg_push_notification` | `notifications` insert |
| 4 `pg_cron` retention jobs (§`DATA_SECURITY.md`) | Daily schedule |

## 2. Assets

What's actually worth protecting, roughly in order of sensitivity.

1. **Credentials** — password hash (never plaintext, never in our schema), app-lock PIN/pattern hash, device refresh tokens (biometric re-login).
2. **Private practice data** — clients, cases, hearings, documents, financial/transaction records. The core promise of this app: never visible to any other advocate, admin included.
3. **Message content** — end-to-end encrypted; the server never sees plaintext.
4. **Account identity** — email, phone, profile data, bar registration number.
5. **Admin privilege** — the `admins` table membership and everything it gates.
6. **Service-role access** — exists only inside 3 Edge Functions; if leaked, bypasses all RLS.
7. **Third-party API keys** — Resend (`RESEND_API_KEY`), Supabase service-role key.
8. **Availability / cost** — Storage quota, Resend send quota, database/compute — abuse here is a
   denial-of-service / cost concern, not a data-leak one.

## 3. Risks

| # | Entry point / asset | Risk | Status |
|---|---|---|---|
| R1 | Any table's RLS policy | Cross-tenant data leak — advocate A reads advocate B's private data | **Mitigated.** RLS on every table, enforced in Postgres, plus an automated test (`authorization.test.ts`) asserting it. |
| R2 | `public_advocate_profiles` | Bulk scraping of the public directory | **Partially mitigated.** No pagination abuse limit beyond the app's own `.limit(30)` query shape — nothing stops a direct API call from paging through everyone. Low severity: this view already excludes sensitive fields by design. |
| R3 | `send-account-notice`, `send-push` | No caller verification — anyone who discovers the function URL could call it directly with a crafted payload. | **Fixed.** Both now require an `x-internal-secret` header (timing-safe compared, not `===`) matching a shared secret kept in Supabase Vault and set as each function's `INTERNAL_FUNCTION_SECRET` env var — only the database triggers know it. `0054_secure_internal_functions_and_bucket_limits.sql`. |
| R4 | `send-feedback` | Spam / cost abuse of the Resend quota by a signed-in but malicious user | **Mitigated.** Requires a real JWT (traceable to one account), 500-word cap enforced server-side (not just client-side). |
| R5 | `admin_*` RPC functions | Privilege escalation if `is_admin()` had a bug, since these are grantable to `authenticated` at the Postgres level | **Mitigated, documented.** Each function re-checks `is_admin(auth.uid())` internally and raises on failure; `admins` table itself has no insert/update/delete policy at all (grants only via direct SQL). Already called out as an intentional pattern in `SECURITY.md`. |
| R6 | Connection requests, follows, messages (no admin block) | Spam — a malicious account mass-sending connection requests or messages | **Partially mitigated.** Admin can block a specific abusive account after the fact (`is_blocked_by_admin()`); there's no rate limit stopping the *first* wave before someone reports it. |
| R7 | Storage uploads (`profile-photos`, `post-images`) | Unbounded file size — these were the only 2 of 6 buckets with no `file_size_limit` set at the Storage layer | **Fixed.** Both capped at 10 MB (`0054_secure_internal_functions_and_bucket_limits.sql`) — generous for a photo, closes the "upload anything, any size" gap. All 6 buckets now have a Storage-level cap. |
| R8 | Any upload bucket | Malicious file content (not just size) — no content-type/malware scanning | **Open gap.** `post-videos` restricts `allowed_mime_types` to `video/*` at the Storage layer; no other bucket does, and none of them scan content. Low-moderate severity: files are never executed server-side, only ever downloaded/displayed by other users' clients. |
| R9 | Admin account itself | Single admin login, no MFA, password-based | **Known, accepted for now.** Same password policy as every other account (8-char minimum; leaked-password check blocked by Supabase's Free plan — see `docs/AUTH.md`). A compromised admin account can block/unblock users and read the directory + reports, but **cannot** read any advocate's private practice data (R1's protection applies to admin too). |
| R10 | Deep link PKCE code exchange | Auth code interception/replay | **Mitigated.** PKCE flow (code + verifier, not the older implicit/hash flow); refresh tokens live in the OS keychain (`expo-secure-store`), not in plain storage. |
| R11 | OS notification tray | Push notification title/body (e.g. "New message from X") visible on a locked device's lock screen | **Accepted trade-off**, not fixed — standard for any app with push notifications; outside this app's control once it's in the OS notification layer. |
| R12 | E2E message keys | Device loses its local key pair → permanently loses access to its own past messages | **Documented, intentional** (`SECURITY.md`) — the cost of not having server-side key escrow. |

## 4. Protections

Organized the way they're actually implemented — validate, authorize, limit — rather than
per-risk, since most protections cover more than one risk at once.

### Validate

- Client-side: `zod` schemas on every form (sign-up, profile, client/case, transactions, …).
- Database: `check` constraints bounding content length (e.g. `content between 1 and 2000` on
  messages, `reason between 1 and 1000` on reports) — the real enforcement, not just UX.
- Edge Functions: `send-feedback` and `send-account-notice` both re-validate shape and type
  server-side (word count, email regex, enum membership) rather than trusting the client.
- File size: enforced in two places for 4 of 6 buckets — client-side (fail fast, friendly message)
  and at the Storage `file_size_limit` (the real enforcement) — `post-videos` (50 MB),
  `post-attachments` (20 MB), `message-attachments` (25 MB). `profile-photos` and `post-images`
  are **not** covered this way (R7).

### Authorize

- Row Level Security on every table holding owner-specific data, checked by Postgres itself.
- Storage-level RLS: a file's owning folder must equal the caller's `auth.uid()` — enforced
  independently of (in addition to) any signed-URL logic.
- `SECURITY DEFINER` functions that need elevated access (`is_admin`, `admin_*`,
  `is_blocked_by_admin`) perform their own internal authorization check rather than relying solely
  on who's allowed to *call* them.
- Service-role access (full RLS bypass) is confined to 3 Edge Functions, each touching only the
  specific rows its one job needs — never a general-purpose query surface, and the key itself
  never reaches any client.

### Limit

- Every list-fetching query has a row cap (posts 50, conversations 100, messages/conversation 500,
  notifications 50, network search 20–30) — nothing loads an unbounded table.
- File size caps per bucket (see above, and the gap in R7).
- Feedback comments capped at 500 words, enforced server-side.
- The chat-list realtime subscription is scoped to the caller's own conversation ids
  (`conversation_id=in.(...)`) rather than the whole `messages` table — see `docs/DATA_SECURITY.md`
  history / the realtime-scoping fix for why this mattered at scale.
- Scheduled data retention (4 `pg_cron` jobs — see `DATA_SECURITY.md`) limits how long stale data
  (old audit logs, dead push tokens, read notifications, soft-deleted messages) sits around to be
  a target at all.

## 5. Open gaps and recommended next steps

R3 and R7 are now fixed (see the risk table above). Remaining, in priority order:

1. **R6 — no rate limiting on connection requests / messages / follows.** Would need either a
   Postgres-level throttle (e.g. a trigger counting recent inserts) or an application-level one.
   Not urgent — admin's after-the-fact block is the current mitigation — but worth planning before
   real abuse shows up.
2. **R8 — no content-type restriction or malware scanning on most upload buckets.** Lower
   priority given files are never executed server-side; still worth an `allowed_mime_types`
   allow-list per bucket as a cheap improvement.
3. **R9 — admin has no MFA.** Revisit once Supabase's plan allows it, or consider a TOTP-based
   app-level check for the admin account specifically.
