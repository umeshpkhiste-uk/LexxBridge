# Architecture

## Stack

- **Mobile**: Expo (React Native) + Expo Router, TypeScript. Targets iOS +
  Android now; the same backend can serve a web client later without
  changes (Supabase is just an HTTPS API).
- **Backend**: Supabase — managed Postgres, Auth, Storage, and (later)
  Edge Functions/Realtime. Chosen so authorization is enforced at the
  database layer (Row Level Security) rather than only in app code, which
  directly satisfies the product's core privacy requirement: private
  practice data (clients, cases, documents, finances) must never leak
  across advocates, even through a bug in the mobile client.
- **Forms/validation**: `react-hook-form` + `zod`.

## Project structure

```
src/
  app/                     Expo Router routes (file-based)
    (auth)/                Unauthenticated stack: welcome, sign-in, sign-up,
                            forgot-password, verify-email
    (app)/                 Authenticated stack
      (tabs)/               Home, Cases, Calendar, Network, Profile
      edit-profile.tsx      Modal-presented screen
  features/                Domain logic, one folder per bounded context
    auth/                   Supabase auth calls, session context, zod schemas
    profile/                Advocate profile API
    (cases/, clients/, calendar/, network/, ... added in later phases)
  shared/
    ui/                     Design-system primitives (Button, TextField, ...)
    lib/                    Cross-cutting infra (supabase client, secure storage)
supabase/
  migrations/               Versioned SQL, source of truth for the schema
docs/                       This file, backend setup, etc.
```

Routing and presentation stay in `app/`; anything talking to Supabase or
holding business rules lives in `features/*/api.ts`. This is the seam a
future web client would reuse.

## Authentication & session handling

- `src/shared/lib/supabase.ts` creates the Supabase client with a custom
  storage adapter (`LargeSecureStore`) instead of Supabase's AsyncStorage
  default. Session tokens are AES-256 encrypted before being written to
  AsyncStorage, and the encryption key itself lives in the OS
  keychain/keystore via `expo-secure-store`. Plain AsyncStorage would put
  refresh tokens on disk unencrypted; plain SecureStore can't hold a
  session payload past its ~2KB limit on Android. This is the pattern
  Supabase documents for Expo apps.
- `src/features/auth/AuthProvider.tsx` exposes the current session via
  `useAuth()`, populated from `supabase.auth.getSession()` on boot and kept
  in sync via `onAuthStateChange`.
- `src/app/_layout.tsx` uses Expo Router's `Stack.Protected` to route
  unauthenticated users into `(auth)` and authenticated users into `(app)`
  — there is no route that both groups can reach, so there's no window
  where an unauthenticated user sees authenticated screens (or vice versa).

## Authorization model (private vs. public data)

Implements spec §2 directly:

- `public.advocate_profiles` is the private, full-fidelity table (includes
  bar registration number, verification notes, contact preferences). RLS
  restricts every row to `auth.uid() = id`; the table has no public grant.
- `public.public_advocate_profiles` is a view exposing only the fields the
  spec lists as legitimately public (name, headline, city, practice areas,
  etc.), filtered to rows where `profile_visibility` opts in, and with
  contact info further gated by `contact_info_visible`. This is what
  Network search/discovery (added in a later phase) will query — it is
  structurally incapable of returning bar registration numbers or
  verification notes, because those columns aren't in the view.
- Later phases (clients, cases, documents, financial records) follow the
  same pattern: an `advocate_id` owner column plus an RLS policy scoping
  every operation to `auth.uid() = advocate_id`. Being "connected" to
  another advocate (§24 Connection System) will never grant row access —
  connections only unlock messaging and public-profile visibility tiers,
  never the private tables.

### `public_advocate_profiles` and `advocate_network_stats` are `security_invoker = false` — intentionally

Both views are created with `security_invoker = false` (Postgres's default),
and the Supabase security linter flags that as a "Security Definer View"
error. **Do not "fix" this by switching them to `security_invoker = true`**
— that was tried in an earlier migration (0001/0013) and was a real,
shipped bug (fixed in 0015): with `security_invoker = true`, a view
inherits the *caller's* RLS on the underlying table. `advocate_profiles`'
own RLS is "you may only read your own row" — so the view could
structurally never return any advocate's profile but your own, regardless
of `profile_visibility`, and Discover/search was broken for everyone by
construction, silently, until a user actually noticed.

The correct pattern here (this is Supabase's own documented approach for
exposing a safe subset of an RLS-locked table) is `security_invoker =
false`: the view runs as its owner, which bypasses the base table's RLS,
and the view's *own* definition becomes the sole security boundary instead:

- `public_advocate_profiles` only ever selects non-sensitive columns (no
  bar registration number, verification notes, `verified_at`, phone, or
  **email** — added to `advocate_profiles` in `0057_advocate_profiles_email_column.sql`
  purely so admin's own directory RPC can show it, and deliberately never
  added to this view) and filters to `profile_visibility in ('public', 'connections_only')`.
- `advocate_network_stats` only ever exposes aggregate counts, never raw
  follow/connection rows.

Known gap, not yet a bug in practice: `profile_visibility = 'connections_only'`
is currently treated identically to `'public'` by this view (no UI sets
`connections_only` yet, so this has no live effect) — tightening it to
require an accepted connection is follow-up work before that visibility
tier is exposed in the UI.

## What Phase 1 does not include

Everything under case/client management, calendar/hearings, documents,
financials, networking, messaging, notifications, and admin is out of
scope for this phase. See `docs/BACKEND_SETUP.md` for what's implemented.
