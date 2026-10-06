# Data Security

How LexxBridge handles personal data, payment/financial records, and credentials, organized
around four things: **classify** what's sensitive, **protect** it in transit and at rest,
**retain and delete** it on a schedule instead of forever, and **limit access** to only what's
approved. The guiding principle: collect less, protect what we do collect, delete it on schedule.

This is the data-focused companion to [`SECURITY.md`](SECURITY.md) (vulnerability reporting,
overall security model) and [`docs/AUTH.md`](docs/AUTH.md) (how credentials and sessions work).

## 1. Classify

| Category | What | Where it lives | Notes |
|---|---|---|---|
| **Credentials** | Password | Never in our schema — Supabase Auth (GoTrue) stores only a bcrypt hash in `auth.users.encrypted_password`. | We never see or store a plaintext password. |
| | App-lock PIN / pattern | Device keychain only (`expo-secure-store`), salted SHA-256 hash. | Never transmitted anywhere — see `docs/AUTH.md`. |
| | Biometric data (Face ID / fingerprint) | Never leaves the device — handled entirely by the OS. | LexxBridge never receives this data in any form. |
| **Personal data (the advocate's own)** | Name, email, phone, DOB, gender, address, bar registration number, profile photo | `public.advocate_profiles` | Bar registration number and other verification fields are excluded from the public profile view (`public_advocate_profiles`) regardless of profile visibility settings. |
| **Personal data (third parties — the advocate's clients)** | Client names, contact details, case particulars | `public.clients`, `public.cases`, and related tables | Owned and controlled entirely by the advocate; never visible to any other advocate (see `docs/ARCHITECTURE.md`). |
| **Payment / financial data** | Fee ledger: amount, category, a free-text payment-method label, reference number, notes | `public.transactions` | **Not cardholder data.** There is no payment gateway integration — this is a manual bookkeeping ledger, not a store of card/bank credentials. No PCI-DSS scope. |
| **Messages** | 1:1 chat content | `public.messages.content` | End-to-end encrypted client-side (Curve25519 via `tweetnacl`) before it ever reaches the server — see below. |
| **Documents** | Uploaded files (pleadings, orders, evidence, identification, etc.) | Supabase Storage, private `documents` bucket | Can contain highly sensitive content depending on what the advocate uploads; never public. |
| **Operational / diagnostic** | Audit log entries, crash/error logs | `public.audit_logs` | Explicitly documented as never containing passwords, tokens, or document contents (see the table comment in `0002_audit_log.sql`). |

## 2. Protect

**In transit:** everything goes over TLS/HTTPS — the Supabase REST/Storage/Realtime APIs, Edge
Function calls, and outbound calls to Resend (email) and Expo (push). There is no unencrypted
transport anywhere in this app.

**At rest:** the Postgres database and Storage buckets are encrypted at rest by Supabase's
underlying infrastructure (AWS). We don't manage these keys ourselves — see Supabase's own
security documentation for the specifics of their at-rest encryption.

**An extra layer beyond "at rest":** direct messages are encrypted **client-side**, before they're
ever sent to the server, using `tweetnacl` (Curve25519). The server only ever stores ciphertext —
even someone with full database access couldn't read message content. The trade-off (documented in
`SECURITY.md`): there's no server-side key escrow, so losing a device's local key permanently loses
access to that device's past messages. This is intentional, not an oversight.

**Documents** are never served from a public URL — every read goes through a short-lived signed
URL, and Storage-level RLS additionally requires the requester's `auth.uid()` to match the file's
owning folder (`0010_documents.sql`). Two independent layers have to both agree, not just one.

**Secrets** (Supabase service-role key, Resend API key) are never committed to git and never
shipped to the client — they exist only as Edge Function environment variables. See `SECURITY.md`
for the full secrets-handling policy.

## 3. Retain and delete

**What works today:** account deletion is real and complete. Profile → Settings → Delete account
removes Storage files first, then a database function deletes the `auth.users` row, and
`on delete cascade` removes every row chained from it across every table (`0020`/`0030` migrations).

**Scheduled deletion is now live** (`supabase/migrations/0052_scheduled_data_retention.sql`), via
`pg_cron`, running daily as `postgres` (bypassing RLS, same as any other maintenance job):

| Job | Deletes | Retention window |
|---|---|---|
| `purge-old-audit-logs` | `public.audit_logs` rows | Older than **13 months** (not 12, so a full year stays available right after a monthly review) |
| `purge-stale-push-tokens` | `public.push_tokens` rows | Not refreshed in **180 days** (almost certainly a reinstalled/replaced device — `send-push` already reactively removes tokens Expo reports as gone; this catches the ones that just went quiet instead) |

Check what's scheduled at any time with `select * from cron.job;`; see run history with
`select * from cron.job_run_details order by start_time desc limit 20;`.

**Still not covered** (a smaller remaining gap, not a blocker): read notifications and
soft-deleted messages (content is already overwritten to `[deleted]`, so no sensitive data
remains — just an empty row) aren't purged yet. Can be added the same way if wanted.

Retention windows above are a product decision, adjustable in the migration if the business wants
something different — not a fixed security requirement.

## 4. Limit access

**Within the database:** every table holding owner-specific data has Row Level Security enabled,
checked by Postgres itself (`auth.uid() = owner_id`), not just application code. An advocate can
read and write only their own clients/cases/documents/transactions — full detail in
`docs/ARCHITECTURE.md`.

**Admin access is narrow and separate.** The one admin account can see the user directory and
abuse reports (for moderation — "keep an eye out for conflicts and bad behavior") through
dedicated functions, and can block a user. It cannot read private practice data (clients, cases,
documents, financial records) — that boundary holds for admin exactly as it does for every other
advocate. See `SECURITY.md`'s security model section.

**Service-role access** (which bypasses RLS entirely) exists only inside three narrowly-scoped
Edge Functions — `send-push`, `send-feedback`, `send-account-notice` — each of which only touches
the specific rows it needs for its one job, never a general-purpose query surface. No client ever
holds a service-role key.

**Third parties that incidentally see data, and what they see:**

| Service | What it receives | What it doesn't |
|---|---|---|
| Supabase | Everything (it's the infrastructure provider) | — |
| Resend | Email subject/body for transactional emails (feedback, account-change notices, auth emails) | Never sees message content, documents, or financial records |
| Expo (push) | Push token + notification title/body (e.g. "New message from...") | Never the message content itself |

No analytics SDKs, no advertising ID, no third-party trackers, and no data is sold or shared for
any purpose beyond operating the app.

## Open items

- **Scheduled retention covers audit logs and stale push tokens** (see §3); read notifications and
  soft-deleted message rows aren't purged yet — a smaller remaining gap, not a blocker.
- **Independent security review:** not yet commissioned (also declared as "No" in
  `legal/DATA_SAFETY.md`'s Play Store answers).
