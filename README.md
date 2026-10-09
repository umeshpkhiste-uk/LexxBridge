# LexxBridge

**The Professional Network & Practice Platform for Advocates.**

LexxBridge (formerly LexConnect, formerly CounselConnect) combines advocate practice management (clients, cases,
hearings, documents, finances) with a professional network for advocates
across India. See [`docs/PRD.md`](docs/PRD.md) for the full product requirements,
including what's shipped versus what's still a gap.

## Status: all six build phases implemented

Everything below runs against a real Supabase backend — real Postgres,
real Row Level Security, real Storage, real triggers. Nothing is mocked.

1. **Foundation** — auth (sign-up/in/out, forgot/reset password via deep
   link), advocate profile, database + RLS foundation, navigation, home
   dashboard.
2. **Practice management** — clients, cases (with a tabbed case workspace),
   hearings (schedule + record outcome), calendar (day agenda), meetings,
   client communications, tasks.
3. **Documents & money** — private document storage (signed URLs, never
   public), a transactions ledger (income/expense, partial payments),
   per-case and per-client financial summaries.
4. **Advocate network** — public profiles, search/discover, follow,
   connections (request/accept/reject/remove), a professional feed with
   posts/likes/comments.
5. **Messaging** — connection-gated 1-to-1 chat, in-app notifications
   (message/connection/follow/like/comment events), blocking, reporting.
6. **Production readiness** — automated tests (unit + a live cross-tenant
   authorization suite), the spec's mandatory security test run and
   passing, account deletion + data export, production build
   configuration. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for what's
   configured versus what still needs your own accounts (Apple/Google
   developer programs, a separate production Supabase project, Sentry).

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up a Supabase project and environment variables — see
   [`docs/BACKEND_SETUP.md`](docs/BACKEND_SETUP.md).

3. Start the app:

   ```bash
   npx expo start
   ```

   Open it in a [development build](https://docs.expo.dev/develop/development-builds/introduction/),
   an Android emulator, an iOS simulator, or Expo Go.

## Testing

```bash
npm test                    # unit tests
npm run test:integration    # cross-tenant authorization tests (needs a service role key)
```

See [`docs/TESTING.md`](docs/TESTING.md).

## Project structure

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the production
readiness checklist — security audit results, what's configured for
Android/iOS builds, and what still needs your accounts.

### Push to GitHub

```bash
git add -A
git commit -m "LexxBridge app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

`.env` (your Supabase keys) is git-ignored and never pushed; `.env.example`
shows which variables are needed.

### Deploy the web version to Vercel

The repo includes [`vercel.json`](vercel.json), so Vercel needs no build
settings typed in by hand.

1. Vercel → **Add New → Project → Import Git Repository**, pick this
   repository. Build command (`npx expo export --platform web`), output
   directory (`dist`) and the SPA/caching rules come from `vercel.json`;
   set Node.js Version to 22.x in Project Settings.
2. **Settings → Environments → Production → Domains / Environment
   Variables**, add:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

   (same values as your local `.env`; they're baked in at build time, so
   redeploy after changing them). Type these as **Config**, not **Secret** —
   `EXPO_PUBLIC_*` variables are inlined into the client bundle at build
   time, so they're never actually hidden regardless of type.
3. Deploy. Every push to `main` redeploys automatically.
4. In **Supabase → Authentication → URL Configuration**, set **Site URL**
   to your domain (e.g. `https://lexxbridge.app`) and add
   `https://lexxbridge.app/**` to **Redirect URLs**, so sign-up
   confirmation and password-reset emails open the website.

Build the web version locally with `npm run build:web` (output in `dist/`).

Phone-only features — Face ID / fingerprint, PIN or pattern app lock,
push notifications and calendar reminders — are not available in the
browser; the rest of the app works the same.

## Design references

`design/Auth UI Design.png` and `design/Profile Page.png` are layout/style
references (from a generic UI kit) — the shipped screens follow their
structure but are restyled to the spec's professional/minimal visual
language (no illustrations, no bright gradients). See
[`docs/DESIGN.md`](docs/DESIGN.md) for the actual design tokens and UI
primitives this restyling is built from.
