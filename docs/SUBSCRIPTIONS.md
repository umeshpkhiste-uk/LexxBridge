# Subscriptions

## The plans

| Plan | Who | What they get |
|---|---|---|
| **Trial** | First 7 days after sign-up, no card. Accounts created before subscriptions launched get 7 days from 25 Nov 2026. | Everything, unlimited. |
| **Free** | After the trial, without a subscription. | Up to **5 clients** (archived ones count). No payment reminders, no fee statements (WhatsApp / email / SMS / PDF). Everything else, and all existing records, stay available. |
| **Monthly** | An active Razorpay subscription. | Everything, unlimited. |

The network (feed, connections, messages) is free on every plan.

A cancelled subscription keeps everything unlocked until the end of the month already paid for, then
drops to Free. Nothing is ever deleted when a plan ends.

## How it works

- **`public.my_plan()`** (migration 0086) answers `trial` / `free` / `paid` for the signed-in user. It's
  the single source of truth — the app and the database both use it.
- **The 5-client limit is enforced in Postgres** (trigger `clients_free_plan_limit`), so it holds even if
  the app is bypassed. The app checks first so it can show the "Free plan limit reached" popup before the
  form opens; if the database refuses the insert anyway, the form shows the same popup.
- **Payment reminders and statements** are gated in the app only (they're generated on the device, so
  there's nothing server-side to enforce): `canUseMoneyTools()` in `src/features/subscription/paywall.ts`.
  The automatic hearing-day payment reminders are simply switched off on the Free plan.
- **Payments** (web only for now):
  1. Subscription page → **Subscribe monthly** calls the `razorpay-subscription` Edge Function, which
     creates a Razorpay subscription with the user's id in its notes.
  2. Razorpay Checkout opens in the browser; the user pays by UPI Autopay or card.
  3. Razorpay calls the `razorpay-webhook` Edge Function, which checks the signature and records the
     status in `public.subscriptions`. The page polls `my_plan()` until it shows `paid`.
  Users can only read their own `subscriptions` rows; only the webhook can write them.
- **Phone app:** the Subscription page explains that subscribing happens on lexxbridge.app for now (it
  unlocks the phone too — same account). Android will use Google Play Billing next; Play's rules don't
  allow selling it through Razorpay inside the Android app.

## One-time setup

1. **Razorpay account** — sign up at razorpay.com and complete KYC (business details, bank account,
   website). Razorpay checks the website for a pricing page, Terms, Privacy Policy, a Refund &
   Cancellation policy, and contact details.
2. **Enable Subscriptions** — Dashboard → Subscriptions (ask Razorpay support to enable it if it isn't).
3. **Create the plan** — Subscriptions → Plans → Create plan: billing frequency **Monthly**, every **1**
   month, the price in ₹. Copy its **Plan ID** (`plan_…`). Change the price later by creating a new plan
   and updating `RAZORPAY_PLAN_ID` — existing subscribers stay on their old plan.
4. **API keys** — Account & Settings → API Keys → generate. Copy the **Key ID** (`rzp_live_…`) and
   **Key Secret** (shown once).
5. **Webhook** — Account & Settings → Webhooks → Add:
   - URL: `https://ujrosfflqevkytburevc.supabase.co/functions/v1/razorpay-webhook`
   - Secret: make up a long random string and keep it
   - Events: all `subscription.*` events (authenticated, activated, charged, pending, halted, cancelled,
     completed, paused, resumed, updated)
6. **Secrets in Supabase** — Dashboard → Edge Functions → Secrets (or `supabase secrets set`):
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET`.
7. **Run migration 0086** in the SQL editor (it contains a `SECURITY DEFINER` function, so it has to be
   pasted by hand — see `RULES.md`).
8. **Deploy the functions:**
   ```sh
   supabase functions deploy razorpay-subscription
   supabase functions deploy razorpay-webhook --no-verify-jwt
   ```
   `--no-verify-jwt` is required for the webhook only: Razorpay can't send a Supabase login token, so
   that function checks Razorpay's signature instead.

## Testing

Do steps 3–8 first with Razorpay's **Test mode** keys (`rzp_test_…`) and a test-mode plan and webhook;
test payments use Razorpay's test cards / test UPI ids and charge nothing. Check:

- Subscribe → pay → the page shows "Monthly plan · Renews on …" within a few seconds.
- Table editor → `subscriptions` has a row with status `active`.
- Cancel → the page shows "cancelled" with the access end date.

Then switch the four secrets to the live keys, live plan and live webhook secret.
