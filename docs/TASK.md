# Open Tasks

Every actionable gap currently scattered across `docs/PRD.md`, `docs/SECURITY_CHECKLIST.md`,
`docs/DATA_SECURITY.md`, `docs/AUTH.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, and
`legal/PLAY_STORE_CHECKLIST.md`, pulled into one list — each tagged with who can actually act on
it and what the next step is. The detail and rationale stay in the source doc (linked); this file
is the index of what's still open, not a restatement.

**Not a backlog of ideas** — nothing here was invented for this file. Every row already existed as
a flagged gap in another doc before this file consolidated them.

## Needs you (account/business decisions, not code)

| Item | Next step | Source |
|---|---|---|
| Upgrade past Supabase Free plan | Needed to unblock leaked-password protection (HaveIBeenPwned check) and daily point-in-time backups | [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md), [`DEPLOYMENT.md`](DEPLOYMENT.md) §5 |
| Separate production Supabase project | Create a second project, apply all migrations, wire EAS secrets — steps already written out | [`DEPLOYMENT.md`](DEPLOYMENT.md) §6 |
| Apple Developer Program ($99/yr) + Google Play Console ($25 one-time) | Required before any store build/submission | [`DEPLOYMENT.md`](DEPLOYMENT.md) §7, [`legal/PLAY_STORE_CHECKLIST.md`](../legal/PLAY_STORE_CHECKLIST.md) |
| Fill in every `[bracketed placeholder]` in the legal docs | Real company name, support email, postal address, jurisdiction | [`legal/PLAY_STORE_CHECKLIST.md`](../legal/PLAY_STORE_CHECKLIST.md) §1 |
| Confirm real Netlify domain in Play Console / App Store Connect | Google/Apple review the live Privacy Policy URL | [`legal/PLAY_STORE_CHECKLIST.md`](../legal/PLAY_STORE_CHECKLIST.md) §2 |
| Design a 1024×500 feature graphic + phone/tablet screenshots | Not in this repo; store listing assets | [`legal/PLAY_STORE_CHECKLIST.md`](../legal/PLAY_STORE_CHECKLIST.md) §3 |
| Change `com.lexxbridge.app` bundle identifier if you don't control that domain | Can't be changed once published — must happen before first submission | [`DEPLOYMENT.md`](DEPLOYMENT.md) §7 |
| Commission an independent security review | Currently declared "No" in the Play Store data-safety answers, accurately | [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md) |
| Install crash/error monitoring (Sentry or equivalent) | Deliberately skipped so far to avoid destabilizing active Expo Go testing | [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md), [`DEPLOYMENT.md`](DEPLOYMENT.md) §4 |

## Open engineering work

| Item | What's missing | Source |
|---|---|---|
| `connections_only` profile visibility | Currently treated identically to `public` in `public_advocate_profiles` — no live effect yet since no UI sets it, but needs tightening to require an accepted connection before that visibility tier is exposed | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Calendar week/month views | Only the day-agenda view is built | [`PRD.md`](PRD.md) §5 |
| Admin verification workflow UI | `verification_status` enum exists in the schema; no screen for an admin to review/approve one | [`PRD.md`](PRD.md) §5, §7 |
| Admin panel: content moderation beyond reports, system analytics, subscription management | Directory, blocking, and report review are shipped; the rest of spec §36 is not | [`PRD.md`](PRD.md) §5 |
| Global omnibox search | Each feature area (clients/cases/network) has its own scoped search; no single search spanning all of them | [`PRD.md`](PRD.md) §5 |
| No MFA on any account, including admin | Not built; no current plan blocker specifically for TOTP | [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md), [`AUTH.md`](AUTH.md) |
| No dedicated "change email" screen | The Supabase template and the `email_changed` notice trigger are both ready; nothing in the app calls `supabase.auth.updateUser({ email })` yet | [`AUTH.md`](AUTH.md) |
| Offline / poor-network support | No local caching, no local write queue, no sync-conflict handling — a real gap for the low-connectivity court environments the original spec called out as the target use case | [`PRD.md`](PRD.md) §7 |

## Deferred by design — not open work, don't pick these up unprompted

These were explicitly declined per the original spec's own instructions, not forgotten:

- Payment gateway integration (Razorpay etc.) — tracking only, by design.
- Subscription tiers (Free/Pro/Team/Enterprise) — "do not require monetization in v1."
- AI features (summaries, extraction, natural-language search) — "do not make AI the foundation
  of the first release."
- Malware/virus scanning on uploads — files are never executed server-side, only downloaded/
  displayed by other clients; would need a third-party scanning service, not planned.

See [`PRD.md`](PRD.md) §8 for the full reasoning behind each.
