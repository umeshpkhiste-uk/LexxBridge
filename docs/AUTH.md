# Authentication

How sign-up, sign-in, password reset, social login, biometrics, app lock, and the admin account
actually work — pulled together in one place since the implementation is spread across roughly a
dozen files. For the database-level security model (RLS, encryption, admin's data model), see
[`SECURITY.md`](SECURITY.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md); for auth's entry points
specifically mapped against risk, see [`THREAT_MODEL.md`](THREAT_MODEL.md).

## Provider: Supabase Auth, PKCE everywhere

All auth — email/password, social login, password reset, email confirmation — goes through
Supabase Auth (GoTrue) using the **PKCE** flow, not the older implicit/hash flow. That's set once
in `src/shared/lib/supabase.ts` (`flowType: "pkce"`, `detectSessionInUrl: false` — that option is
browser-only; native exchanges the code itself, see "Deep links" below).

Session storage:

- **Native (iOS/Android):** `LargeSecureStore` (`src/shared/lib/largeSecureStore.ts`), backed by
  `expo-secure-store` — the OS keychain, encrypted at rest.
- **Web:** Supabase's own default (`localStorage`) — `authStorage` is `undefined` on web in
  `supabase.ts`.

Token refresh is tied to app foreground/background (`AppState` listener in `supabase.ts`) so a
session doesn't silently expire while the app is suspended.

## Sign-up

`signUpWithEmail()` in `src/features/auth/api.ts` → `supabase.auth.signUp()`.

- Validated client-side by `signUpSchema` (`src/features/auth/schemas.ts`): full name, a valid
  email, and a password that's ≥8 characters with at least one uppercase letter and one digit.
  This is a UX check only — Supabase's own password policy (minimum length is set to match this,
  8 characters; leaked-password check if enabled) is the real enforcement.
- `emailRedirectTo` is explicitly set to `authRedirect("verify-email")` (see "Deep links" below).
  Without this, Supabase falls back to the project's Site URL, which has nothing to do with this
  app.
- **Email confirmation is on** (Supabase dashboard → Authentication → Sign In / Providers →
  "Confirm email"). New users land on `(auth)/verify-email` instead of straight into the app until
  they click the link.
- The moment the `auth.users` row is inserted, a database trigger (`handle_new_user`,
  `supabase/migrations/0001_advocate_profiles.sql`) auto-creates the matching
  `public.advocate_profiles` row. First sign-in after confirming redirects to
  `basic-info?onboarding=1` if that profile hasn't been filled in yet
  (`src/app/(app)/_layout.tsx`).

## Sign-in

`signInWithEmail()` → `supabase.auth.signInWithPassword()`. On success, also calls
`onPasswordSignIn()` (`src/features/biometric/biometric.ts`) to persist the refresh token for
biometric re-login later (see below).

## Password reset

1. `requestPasswordReset(email)` → `supabase.auth.resetPasswordForEmail()` with
   `redirectTo: authRedirect("reset-password")`. The UI (`src/app/(auth)/forgot-password.tsx`)
   shows the same neutral "reset link is on its way" message whether the call succeeds or fails,
   and never surfaces Supabase's own error text — `resetPasswordForEmail` is deliberately built to
   never reveal whether an email has an account (it returns success either way), and surfacing an
   error here would undo that and let the form be used to enumerate registered emails
   (OWASP/CWE-204). A genuine send failure (rate limit, SMTP outage) is still visible in
   Supabase's own Auth logs, just not to the person submitting the form.
2. User gets an email (template: Supabase dashboard → Authentication → Email Templates → "Reset
   Password" — branded LexxBridge HTML, see below) with a link back into the app.
3. Clicking it fires `PASSWORD_RECOVERY` on `onAuthStateChange` (`AuthProvider.tsx`) — this **does**
   establish a real session (that's what lets `updateUser()` work), which is why `AuthProvider`
   tracks a separate `isPasswordRecovery` flag: the root navigator uses it to keep the user on a
   "set new password" screen instead of treating them as a normal logged-in session.
4. `updatePassword(newPassword)` → `supabase.auth.updateUser({ password })`. This also fires the
   `trg_notify_password_changed` database trigger (see "Account-change notices" below).

## Deep links (`lexxbridge://`)

`authRedirect()` in `src/features/auth/api.ts` picks the target based on platform:

```ts
if (Platform.OS === "web" && typeof window !== "undefined") return `${window.location.origin}/${path}`;
return `lexxbridge://${path}`;
```

`src/shared/lib/authDeepLink.ts`'s `consumeAuthDeepLink()` is what actually turns the incoming
`lexxbridge://<path>?code=...` URL into a session, via
`supabase.auth.exchangeCodeForSession(code)`. `AuthProvider` calls it on both cold start
(`Linking.getInitialURL()`) and warm start (`Linking.addEventListener("url", ...)`).

**This only works if both of the following are set in Supabase → Authentication → URL
Configuration:**

- **Redirect URLs** includes `lexxbridge://**` (native) and your web domain, e.g.
  `https://<your-site>.netlify.app/**` (web).
- **Site URL** is set to your real web domain — if the redirect URL isn't in the allow-list,
  Supabase silently falls back to Site URL instead of erroring, which is why a bad link can
  "work" but land somewhere that looks wrong (we hit exactly this once — see commit history around
  the reset-password email investigation).

## Social login (Google / Facebook / Apple)

`src/features/auth/socialLogin.ts`. Also PKCE OAuth through Supabase:
`signInWithProvider(provider)` opens the provider's page in a secure in-app browser
(`expo-web-browser`), which redirects to `lexxbridge://auth-callback?code=...`, exchanged the same
way as above. `getEnabledProviders()` checks the project's `/auth/v1/settings` endpoint at runtime
so the sign-in screen only shows buttons for providers actually turned on in the dashboard. New
social sign-ups get a profile row the same way email sign-ups do (same `handle_new_user` trigger)
and go through the same onboarding.

## Biometric "login" (Face ID / Touch ID / fingerprint)

`src/features/biometric/biometric.ts`. **Important: this is not a second factor and does not
re-authenticate against the server on its own.** Two different things share the "biometrics" label:

1. **Gating an already-restored session.** While a Supabase session is still valid, enabling
   biometrics just means the app requires a biometric check on cold start before showing the
   restored session (`RootNavigator`'s `lockState`). The session itself was already established
   normally.
2. **Logging back in after a manual sign-out.** On sign-out, instead of just discarding
   everything, the refresh token is kept in the keychain (`REFRESH_TOKEN_KEY`). "Log in with Face
   ID" proves presence biometrically, then exchanges that stored refresh token for a fresh
   session — no password re-entry. Disabling biometrics, a password sign-in, or deleting the
   account all clear the stored token.

Everything here is device-local (`expo-secure-store`); nothing biometric-related is ever sent to
Supabase or stored server-side.

## App lock (PIN / pattern)

`src/features/applock/`. Fully separate from biometrics and from the Supabase session — this is a
local screen lock, per account, per device:

- A 6-digit PIN or a ≥4-dot pattern, salted and SHA-256 hashed (`expo-crypto`), stored only in
  the device keychain (`expo-secure-store`). **The raw PIN/pattern is never stored or
  transmitted anywhere, ever.**
- `pinError()`/`patternError()` (`rules.ts`) reject obviously weak choices (repeated digit,
  `123456`-style sequences, too few dots).
- 3 wrong attempts (`MAX_ATTEMPTS`) locks the app; `resetAppLockFailures()` clears the counter on
  a correct entry.

## Root navigator gating (`src/app/_layout.tsx`)

On every cold start, `RootNavigator` decides one of four states before showing anything:

| State | Meaning |
|---|---|
| `checking` | Still deciding — show a spinner. |
| `locked` | A session was restored, and this user has biometrics and/or a PIN/pattern set — show the lock screen. |
| `login` | No session, but a PIN/pattern was set before the last sign-out — offer quick re-login via the stored refresh token instead of the password screen. |
| `unlocked` | Proceed to the app (or the sign-in screen, if no session at all). |

A password-recovery session (`isPasswordRecovery`) always skips straight to `unlocked`, since the
user needs to reach the "set new password" screen, not get stuck behind their own lock screen.

Also relevant to session security: `usePreventScreenCapture()` and
`enableAppSwitcherProtectionAsync()` (from `expo-screen-capture`) are enabled at the root layout,
so the app's content — including anything auth-adjacent shown while signed in — doesn't appear in
screenshots/screen recordings or the OS app switcher preview.

## Account-change security notices

Supabase only emails for the *request* to change something (reset link, confirm-new-email link),
never for the change completing — so password/email/phone changes get a separate, custom
notification, documented fully in `SECURITY.md`'s security model section and implemented in
`supabase/migrations/0051_account_change_notices.sql` +
`supabase/functions/send-account-notice/`. Fires automatically off existing writes; no extra app
code needed when password/phone change.

## Admin account

The one admin login (`admins` table membership — see `ARCHITECTURE.md` / the admin migrations
`0046`–`0048`) was **not** created through the normal sign-up flow. It was inserted directly into
`auth.users`/`auth.identities` via SQL, which has one real gotcha worth remembering:
`confirmation_token`, `recovery_token`, `email_change_token_new`, and `email_change` must be set
to `''`, not left `NULL` (the column default) — GoTrue scans them into non-nullable Go strings
when authenticating a login, and a `NULL` there fails every login attempt with "Database error
querying schema." (We hit this live — see the fix in `0046_admin_and_blocking.sql`'s history.)
There's no separate admin login UI; the admin account signs in through the exact same screen as
everyone else, and is distinguished purely by its `admins` table row.

## Email branding

Reset Password, Confirm Signup, and Change Email Address all have custom LexxBridge-branded HTML
templates (Supabase dashboard → Authentication → Email Templates) instead of the generic
Supabase-branded default. To remove the "Supabase Auth" sender name and "powered by Supabase ⚡"
footer entirely, Custom SMTP is required (Authentication → Emails → SMTP Settings) — this project
uses Resend for that, with the same `RESEND_API_KEY` the feedback form and account-change notices
also use.

## Known gaps

- **Leaked password protection is off, and blocked on the Free plan** (Supabase dashboard toggle,
  HaveIBeenPwned check — grayed out until the project is on Pro or above). Minimum password
  length is set to 8, matching the app's own sign-up validation. See `SECURITY.md`.
- **No MFA.** Not implemented; email/password (or social OAuth) plus optional device-local
  biometrics/PIN is the full story today.
- **No dedicated "change email" screen in the app yet** — the Supabase template and the
  `email_changed` notice trigger are both ready for whenever that UI gets built; nothing in the
  app currently calls `supabase.auth.updateUser({ email })`.
