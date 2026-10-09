# Product Requirements Document

The canonical, version-controlled product spec for **LexxBridge** (formerly LexConnect, formerly
CounselConnect — the app has been renamed twice; this is the same product). This supersedes the
original `CounselConnect Master Development Prompt.pdf/.docx` that lived in the parent folder,
outside the repo — that was the initial build brief handed to an AI assistant to kick the project
off; this is the living requirements doc that stays in the repo, in git history, and gets updated
as the product evolves.

Every major requirement below is tagged with its actual current status:

- ✅ **Shipped** — built, working against the real Supabase backend, not mocked.
- 🔶 **Partial** — some of it exists; the gap is noted.
- ⚪ **Not built** — explicitly deferred per the original spec's own instructions ("do not require
  monetization in v1", "do not make AI the foundation of the first release", etc.) or simply not
  reached yet.

For implementation detail behind any ✅, see the cross-referenced doc rather than duplicating it
here — this file tracks *what*, the other docs track *how*.

## 1. Product vision

LexxBridge combines two products in one app, for advocates across India:

- **A. Practice management** — clients, cases, court hearings, meetings, client communications,
  documents, tasks, fees/payments/expenses.
- **B. Professional network** — profiles, search/discovery, follow, connections, messaging, a
  professional feed.

Built as a real production application — real auth, real persistence, real authorization, real
file storage, real messaging, real notifications — never a UI prototype with mocked data. This was
the original spec's single non-negotiable instruction (§58: "Do not finish with a mockup"), and it
held: every ✅ below runs against a live Supabase project, nothing is hard-coded.

**Status: ✅ all six original build phases shipped** — see `README.md`'s phase list for the
chronological breakdown (Foundation → Practice management → Documents & money → Advocate network →
Messaging → Production readiness).

## 2. The core privacy principle (non-negotiable)

Two fundamentally different categories of data:

- **Private practice data** (clients, cases, notes, documents, financials, internal
  tasks/reminders) — private by default, owned by exactly one advocate. Being connected to another
  advocate on the network must never grant access to it.
- **Professional network data** (name, photo, headline, practice areas, courts, city/state,
  public posts) — public by the advocate's own choice.

✅ **Shipped, enforced at the database level**, not just in application code — see
`docs/ARCHITECTURE.md`. The mandatory cross-tenant test (§57 of the original spec — "create two
advocate accounts, confirm A cannot read B's private data") is automated and passing:
`src/__tests__/integration/authorization.test.ts`.

## 3. Platform & localization

- ✅ iOS, Android, and **web** (the original spec only required Android/iOS with web as a later
  architectural option — web shipped alongside, via `react-native-web`, deployed to Vercel).
- ✅ INR currency default, `Asia/Kolkata` handling, no hard-coded single city/state.
- 🔶 Indian court/state/city data is free-text input, not a curated reference dataset — advocates
  type their own values rather than selecting from a maintained list.

## 4. UX principles & navigation

- ✅ Five primary tabs (Home, Cases, Calendar, Network, Profile) with a prominent central
  "Add" action, light/dark mode, restrained professional visual system — see
  `src/shared/ui/theme.ts` and `src/shared/ui/CenterFabTabBar.tsx`.

## 5. Feature areas

| Area | Status | Notes |
|---|---|---|
| Authentication | ✅ | Email/password + Google/Facebook/Apple OAuth, forgot/reset password, session management, biometric + app-lock. No phone/OTP auth. See `docs/AUTH.md`. |
| Advocate profile | ✅ | All spec'd fields; sensitive verification fields excluded from the public view by design. |
| Home dashboard | ✅ | Today's hearings/meetings, pending tasks, outstanding payments, recent cases. |
| Client management | ✅ | Full CRUD, search, archive, per-client case/transaction/document history. |
| Case management + case workspace | ✅ | Tabbed single-workspace view (overview, hearings, timeline, meetings, communications, documents, tasks, financials) per §11's explicit instruction not to fragment into separate screens. |
| Court hearing management | ✅ | Schedule + record outcome, auto-updates case timeline. |
| Calendar | 🔶 | Day-agenda view shipped; week/month views from the original spec not built. |
| Meeting management | ✅ | |
| Client communication records | ✅ | Manual record system only, as the spec explicitly required (no WhatsApp/SMS scraping). |
| Transactions & financial tracking | ✅ | Income/expense ledger, partial payments, per-case/per-client summaries, PDF receipts/statements. |
| Invoices / payment gateway | 🔶 | Payment *tracking* is real; no payment gateway (Razorpay etc.) integrated — explicitly deferred per the original spec ("do not integrate a payment gateway in the first version"). |
| Document management | ✅ | Private Storage bucket, signed URLs only, categorized, never a public URL. |
| Case timeline | ✅ | |
| Task management | ✅ | |
| Notifications | ✅ | In-app + push (Expo), category-aware. |
| Advocate network (search/discover/follow/connect) | ✅ | |
| Professional feed (posts/comments/reactions/shares) | ✅ | |
| Private messaging | ✅ | 1-to-1, connection-gated, **end-to-end encrypted** (beyond what the original spec asked for — see `SECURITY.md`). No group chat, voice notes, or case-collaboration messaging (explicitly deferred as "future" in the original spec). |
| Global search (one box across advocates/cases/clients/documents/posts) | 🔶 | Each feature area has its own scoped search (clients, cases, network); there's no single omnibox search spanning all of them as §28/§53 originally envisioned. |
| Privacy settings | ✅ | Per-field profile visibility, independent of private practice data (which is never affected by these settings). |
| Admin panel | 🔶 | User directory, platform-level blocking, report review all shipped (`SECURITY.md`'s admin model) — but advocate *verification* review, content-moderation-beyond-reports, system analytics, and subscription management from the original spec's §36 are not built. |
| Reporting & moderation | ✅ | Report advocate/post/comment/message/conversation, block (both peer-to-peer and admin-level), rate limiting on connection requests/follows/messages. |
| Legal & compliance | ✅ | Privacy Policy, Terms, account deletion, data export — see `legal/`. |
| Professional verification | 🔶 | Database architecture exists (`verification_status` enum: unverified/pending/verified/rejected/expired) exactly as the spec required — no verification *workflow UI* for an admin to actually review and approve one yet. |
| Subscription tiers (Free/Pro/Team/Enterprise) | ⚪ | Explicitly deferred per the original spec ("do not require monetization in v1"). No plan/tier system exists. |
| AI features (summaries, extraction, NL search) | ⚪ | Explicitly deferred per the original spec ("do not make AI the foundation of the first release"). No AI integration or extensibility hook built yet. |

## 6. Data model

✅ Shipped as a real relational Postgres schema (not arbitrary JSON blobs), with proper foreign
keys, indexes, constraints, and sequential migrations — 55 migrations as of this writing,
covering every entity the original spec listed (`advocate_profiles`, `clients`, `cases`,
`hearings`, `meetings`, `communications`, `tasks`, `documents`, `transactions`, `connections`,
`follows`, `posts`, `comments`, `reactions`, `conversations`, `messages`, `notifications`,
`audit_logs`, plus `admins`/`blocked_users` added this session) and no `Subscription` table (§6
above). 54 sequential migrations as of this writing — `supabase/migrations/`. See
`docs/ARCHITECTURE.md`.

## 7. Non-functional requirements

| Requirement | Status | Notes |
|---|---|---|
| Security (authN/authZ, input validation, rate limiting, audit log, OWASP) | ✅ | See `SECURITY.md`, `THREAT_MODEL.md`, `SECURITY_CHECKLIST.md`, `DATA_SECURITY.md` — the full security documentation set, each with verified-not-assumed status. |
| Secrets never committed | ✅ | Audited across full git history, not just the current tree. |
| Automated tests (unit, integration, mandatory cross-tenant) | ✅ | See `docs/TESTING.md`. |
| Performance (pagination, no unbounded loads, efficient queries) | ✅ | Every list query capped; realtime subscriptions scoped, not table-wide. |
| Offline / poor-network support | ⚪ | Not built. No local caching, no local write queue, no sync-conflict handling. The original spec explicitly called for this (§34); it remains a real gap for advocates working in low-connectivity court environments, which the spec specifically called out as the target use case. |
| Data backup | 🔶 | Scheduled retention/purge jobs exist (`DATA_SECURITY.md`); full database backup is a Supabase plan feature (Pro+), not yet upgraded to. User-level data export (§35) is shipped. |
| Error handling | ✅ | Consistent user-facing messages; no stack traces surfaced to users. |
| Store readiness (icons, identifiers, permissions, release config) | 🔶 | Configured; actual submission needs the account owner's Apple/Google developer accounts — see `docs/DEPLOYMENT.md`. |

## 8. What's deliberately not done, and why

Per the original spec's own instructions, three things are intentionally absent from v1, not
overlooked:

- **Subscriptions/monetization** (§40) — "do not require monetization in v1."
- **AI features** (§41) — "do not make AI the foundation of the first release."
- **Payment gateway integration** (§17) — "do not integrate a payment gateway in the first version
  unless required."

All three were explicitly designed to be addable later without a rewrite (modular financial
tracking, extensible notification/data architecture) — see `docs/ARCHITECTURE.md` for why the
schema supports that.

## 9. Real remaining gaps (not deferred by design — just not reached yet)

- Offline support (§7 above) — the most significant one, given the spec's own target user
  (advocates moving between courtrooms with unreliable connectivity).
- Single global/omnibox search.
- Advocate verification workflow UI (the data model is ready; nobody can act on it yet).
- Week/month calendar views.
- Full admin suite (analytics, subscription management, content moderation beyond reports).
