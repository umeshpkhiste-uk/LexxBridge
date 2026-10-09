# Deployment & production readiness

This documents Phase 6 (spec §50 items 23-25, §55-56): what's done, what's
configured-but-inert pending your credentials, and what only you can do
(accounts, payments, store review). Per spec §58, nothing below is faked —
anything not fully wired says exactly what's missing and why.

## 1. Security audit — done

- Every RLS policy across all 20 migrations reviewed via the Supabase
  security advisor after each change; only two permanent, intentional
  findings remain (see `docs/ARCHITECTURE.md` for why `security_invoker =
  false` on the two public views is correct, not a bug).
- The spec's mandatory cross-tenant test (§57) was run for real against the
  live database — Advocate A confirmed unable to read or write Advocate B's
  clients, cases, documents, transactions, hearings, meetings, tasks, audit
  logs, or private profile data. An automated, re-runnable version of the
  same test lives in `src/__tests__/integration/authorization.test.ts` (see
  `docs/TESTING.md`).
- No secrets are committed. `.env` is gitignored; `.env.example` has
  placeholders only.

## 2. Automated tests — done (see docs/TESTING.md)

`npm test` (unit, fast, no network) and `npm run test:integration`
(cross-tenant authorization, needs a service role key) — both documented
separately.

## 3. Performance — reviewed, one class of gap fixed

- Every table has indexes on its owner column and common filter columns
  (see the `create index` statements throughout `supabase/migrations/`).
- `listCases` and `listClients` had no row limit at all — spec §43
  explicitly says never load unbounded record sets. Fixed with a 100/200-row
  cap. This is a safety net, not real pagination — once a practice has more
  cases than that, the next step is cursor-based "load more," not done yet.
- Home's recent-cases card was fetching every case just to slice 5
  client-side; fixed to request only 5 rows.

## 4. Crash monitoring — NOT installed, here's why and what's needed

I did not add Sentry (or any crash reporter) this pass. Its Expo config
plugin modifies native build files and normally wants an auth token for
source-map uploads — installing it half-configured, without a real DSN to
verify against, risked breaking the Expo Go session you're actively testing
in, the same trade-off that ruled out the native date picker earlier.

To add it:
1. Create a free Sentry project (React Native platform) → copy the DSN.
2. `npx expo install @sentry/react-native`
3. `npx @sentry/wizard@latest -i reactNative` (wires the config plugin into
   `app.json` and initializes it in `src/app/_layout.tsx`).
4. Add the DSN as an EAS secret (`eas secret:create --name SENTRY_DSN`) and
   as an Expo public env var for local testing.
5. This needs a dev-client or production build to actually test — it won't
   report from Expo Go.

## 5. Backup — Supabase-managed, plan-dependent; user-level export is done

- Supabase's free tier has no point-in-time recovery; daily backups start
  on the Pro plan. If you stay on Free, your only backup is manual (Supabase
  Dashboard → Database → Backups → on-demand, or `pg_dump` via the CLI).
  This is a plan choice for you to make, not something I can provision.
- Separately, spec §35's user-facing data export is implemented for real:
  Profile → "Export my data" bundles every row an advocate owns (profile,
  clients, cases, hearings, meetings, communications, tasks, transactions,
  document metadata, posts, connections) into JSON via the OS share sheet.
- Account deletion (also §35, and an Apple App Store hard requirement) is
  implemented: Profile → "Delete account" removes the Storage files first,
  then calls a database function that deletes `auth.users` and lets
  `on delete cascade` remove everything chained from it.

## 6. Production database — not yet separated from development

Every migration in this project has been applied to a single Supabase
project (the one linked via `.env`) for the entire build. Spec §48 wants
separate dev/test/prod environments. To split them before launch:

1. Create a second Supabase project ("LexxBridge Production").
2. Apply every file in `supabase/migrations/` to it, in order (same
   commands as `docs/BACKEND_SETUP.md`).
3. Put its URL/anon key in EAS secrets as `EXPO_PUBLIC_SUPABASE_URL_PRODUCTION`
   / `EXPO_PUBLIC_SUPABASE_ANON_KEY_PRODUCTION` — `eas.json`'s `production`
   build profile already references these, so a production build will use
   the prod project automatically once the secrets exist. The current dev
   project stays wired to plain `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` for
   local development.

I didn't create this second project myself — provisioning it (and its
billing plan) is your call, not something to do silently.

## 7. Android / iOS builds and store submission — needs your accounts

Configured, not yet run:

- `app.json` has real identifiers: `com.lexxbridge.app` for both
  `ios.bundleIdentifier` and `android.package`, version 1.0.0,
  `buildNumber`/`versionCode` 1, and an `NSPhotoLibraryUsageDescription`
  for the post-image picker. `lexxbridge.app` is registered and live
  (Vercel), so this identifier is final — bundle identifiers can't be
  changed once published, and nothing further is needed here.
- `eas.json` has `development`/`preview`/`production` build profiles.

What only you can do (needs accounts I don't have access to):

1. **Apple Developer Program** ($99/yr) — required for iOS builds/App
   Store. Needed before `eas build --platform ios` can produce a
   store-signable build.
2. **Google Play Console** ($25 one-time) — required for Android/Play
   Store.
3. **EAS account** (free tier works) — `eas login`, then
   `eas build --platform android --profile production` /
   `--platform ios --profile production`.
4. **Store listings** — app icon (already have one), screenshots, privacy
   policy URL (spec §38 — you need actual legal review here, not generated
   text), description, content rating questionnaire.
5. **Submission** — `eas submit` once builds succeed, or manual upload via
   App Store Connect / Play Console.

Per spec §56, don't consider the app store-ready until: a production build
succeeds, the critical tests pass, and auth/database/API/storage/security
all check out against the *production* Supabase project specifically (not
just the dev one this whole build has run against).
