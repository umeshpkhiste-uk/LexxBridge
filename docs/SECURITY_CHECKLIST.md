# Security Checklist

A single checkable list pulling together what's actually been verified (or is still open) across
[`SECURITY.md`](SECURITY.md), [`DATA_SECURITY.md`](DATA_SECURITY.md),
[`THREAT_MODEL.md`](THREAT_MODEL.md), and [`AUTH.md`](AUTH.md). Each item reflects
confirmed, live state — checked via the Supabase advisor, direct SQL verification, or an actual
test call — not an assumption. Re-run this before any production release.

**Open items right now:** 2 — see below, each with an owner-actionable next step.

## Authentication & sessions

- [x] Email/password + Google/Facebook/Apple OAuth, all via Supabase Auth PKCE flow
- [x] Minimum password length raised to 8 (matches client-side validation)
- [ ] **Leaked-password protection (HaveIBeenPwned check)** — toggle exists but is grayed out on
      the Supabase Free plan. *Next step: enable after upgrading to Pro or above.*
- [x] Sessions stored in OS keychain (`expo-secure-store`) on native, not plain storage
- [x] Deep links use PKCE (code + verifier), not the older implicit/hash flow
- [x] Biometric login and app-lock PIN/pattern are device-local only — never transmitted
- [x] Password/email/phone-change security notices actually send (verified live via a direct
      test call — see `THREAT_MODEL.md` R3 history)
- [ ] **No MFA** on any account, including admin. *Next step: revisit once needed; no current
      Supabase plan blocker for TOTP specifically, just not built.*

## Database & Row Level Security

- [x] RLS enabled on every table holding owner-specific data
- [x] Automated cross-tenant test (`npm run test:integration`,
      `src/__tests__/integration/authorization.test.ts`)
- [x] `public_advocate_profiles` / `advocate_network_stats`'s `security_invoker = false` is
      documented as intentional (not a bug to "fix")
- [x] Every `SECURITY DEFINER` function performs its own internal authorization check, not just
      relying on who's allowed to call it (verified for all `admin_*`, `is_admin`,
      `is_blocked_by_admin`)
- [x] No "multiple permissive policies" performance/security smell — confirmed via Supabase
      advisor after the admin feature was decoupled (`0048_decouple_admin.sql`)

## Data protection

- [x] TLS everywhere (Supabase API/Storage/Realtime, Edge Functions, Resend, Expo)
- [x] At-rest encryption via Supabase's managed infrastructure
- [x] Messages end-to-end encrypted client-side (`tweetnacl`) — server only ever sees ciphertext
- [x] Scheduled data retention live: 4 `pg_cron` jobs purging audit logs (13mo), stale push
      tokens (180d), read notifications (90d), soft-deleted messages (24mo)
- [x] Account deletion is complete (Storage files, then `auth.users` row, then full cascade)

## API & Edge Functions

- [x] `send-feedback` requires a real caller JWT, traceable to one account
- [x] `send-push` and `send-account-notice` require a shared secret
      (`x-internal-secret`, timing-safe compared) — **verified working via a direct test call**,
      not just assumed from the code
- [x] Secret itself lives in Supabase Vault + the functions' own env var, never in git
- [x] Per-sender rate limits now enforced in Postgres: 20 connection requests/hour, 50
      follows/hour, 60 messages/5min — generous for real use, blocks a scripted burst
      (`0055_rate_limits_mime_types_admin_audit.sql`, applied live)

## Storage / file uploads

- [x] All 6 Storage buckets now have a `file_size_limit` set (`profile-photos`/`post-images`
      fixed last — see `THREAT_MODEL.md` R7 history)
- [x] `documents` bucket is private; every read goes through a short-lived signed URL
- [x] Storage-level RLS requires the uploader's `auth.uid()` to match the owning folder,
      independent of any application-level check
- [x] All 6 buckets now restrict `allowed_mime_types` (images only for `profile-photos`/
      `post-images`; documents + images + zip for `post-attachments`/`message-attachments`/
      `documents`; `video/*` already on `post-videos`) — applied live
- [ ] **No malware/virus scanning.** Lower priority — files are never executed server-side, only
      ever downloaded/displayed by other users' clients. Would need a third-party scanning
      service; not planned.

## Secrets management

- [x] `.env` never committed — confirmed across full git history, not just the current tree
- [x] No service-role key, Resend key, or other secret ever appears in any commit (full-history
      grep for JWT/AWS/Stripe/Slack/private-key patterns, clean)
- [x] Service-role access confined to 3 narrowly-scoped Edge Functions, never shipped to a client
- [x] `RESEND_API_KEY` and `INTERNAL_FUNCTION_SECRET` both live only as Edge Function
      secrets/Vault entries, set via the dashboard, never in source

## Admin & privileged access

- [x] Admin is a separate entity (`admins`, `blocked_users` tables) — not a column on the user
      table, not extra RLS policies on tables every ordinary user reads
- [x] Admin cannot read any advocate's private practice data (clients/cases/documents/financials)
      — the same isolation that holds between any two advocates holds for admin too
- [x] Admin actions now write to `audit_logs` — `admin_block_user`, `admin_unblock_user`, and
      `admin_set_report_status` all call `log_audit_event()`, applied via the Supabase SQL editor
      and confirmed live (verified each function's source actually contains the call, not just
      that the editor reported no error)
- [x] Admin login itself follows the same password policy as every other account (see
      Authentication section above — same open items apply to it too)

## Third-party / vendor exposure

- [x] Documented exactly what each vendor sees: Resend (email subject/body only), Expo (push
      token + notification title/body, never message content) — see `DATA_SECURITY.md`
- [x] No analytics SDKs, no advertising ID, no third-party trackers
- [x] No data sold or shared beyond what's needed to run the app

## Documentation itself

- [x] `SECURITY.md` — vulnerability reporting + security model overview
- [x] `DATA_SECURITY.md` — classify/protect/retain/limit for personal, payment, and credential data
- [x] `THREAT_MODEL.md` — every entry point mapped against risk and protection
- [x] `docs/AUTH.md` — full authentication implementation reference
- [x] `docs/RULES.md` — hard rules distilled from all of the above plus git/secrets/doc-placement
      hygiene, so there's one enforceable list instead of five cross-linked narratives
- [x] This file, cross-linked from all five above

## Not yet done — pre-production-launch only

These matter before a real public launch, not for ongoing development:

- [ ] Independent third-party security review (declared "No" in `legal/DATA_SAFETY.md`'s Play
      Store answers — accurate, not yet commissioned)
- [ ] Separate production Supabase project from the development one currently in use (see
      `docs/DEPLOYMENT.md` §6 — explicitly flagged there as not yet split)
- [ ] Crash/error monitoring (Sentry or equivalent) — explicitly not installed yet
      (`docs/DEPLOYMENT.md` §4), to avoid destabilizing active Expo Go testing
