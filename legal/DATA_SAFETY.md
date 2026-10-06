# Google Play "Data safety" form — answers

This maps LexxBridge's actual data handling to the questions Google Play
Console asks under **App content → Data safety**. Use these answers when
filling out the form; update this file first if data handling changes.

For the underlying technical detail this is derived from (classification,
encryption, retention, access control), see
[`../DATA_SECURITY.md`](../DATA_SECURITY.md).

## Does your app collect or share any of the required user data types?
**Yes.**

## Is all user data collected by your app encrypted in transit?
**Yes** (HTTPS/TLS to Supabase and all backend calls).

## Do you provide a way for users to request that their data be deleted?
**Yes** — in-app (Profile → Settings → Delete account) and by email, see
[`ACCOUNT_DELETION.md`](./ACCOUNT_DELETION.md).

## Data types collected

| Category | Data type | Collected? | Shared? | Purpose | Optional? |
|---|---|---|---|---|---|
| Personal info | Name | Yes | With other users (if profile is Public/Connections) | Account management, App functionality | Required |
| Personal info | Email address | Yes | No | Account management, Authentication | Required |
| Personal info | Phone number | Yes | With other users (if profile visibility allows) | Account management, App functionality | Optional |
| Personal info | Address | Yes | No | App functionality (profile, ledger statements) | Optional |
| Personal info | Date of birth | Yes | No | App functionality (profile) | Optional |
| Financial info | Payment/fee history | Yes | No (private to your account) | App functionality (fee ledger) | Optional |
| Messages | In-app messages | Yes | With the message recipient only (end-to-end encrypted, not readable by us) | App functionality | Required for messaging feature |
| Photos and videos | Photos | Yes | With other users only if attached to shared content (posts, chats you send) | App functionality | Optional |
| Files and docs | Documents | Yes | No (private to your account, unless attached to a chat you send) | App functionality | Optional |
| App activity | App interactions | No | — | — | — |
| App info and performance | Crash logs, diagnostics | Yes | No | Analytics (bug fixing) | Automatically collected |
| Device or other IDs | Device ID | No | — | — | — |
| Location | Any location data | **No** | — | — | — |

## Security practices to declare

- Data is encrypted in transit: **Yes**.
- Users can request data deletion: **Yes**.
- Data is encrypted at rest: **Yes** (handled by our backend provider,
  Supabase/Postgres).
- Independent security review: **No** (declare "No" unless you commission one).

## Notes for whoever fills out the Play Console form

- Biometric authentication (Face ID / fingerprint) is handled entirely by
  the OS on-device; LexxBridge never receives or transmits biometric data,
  so it should **not** be declared as a collected data type.
- Chat messages are end-to-end encrypted — mark messages as "collected" but
  note in the description that message content is encrypted and not
  accessible to the developer.
- No advertising ID, no analytics SDKs beyond basic crash/error logging, no
  location data.
