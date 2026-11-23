// The app's side of the monthly subscription, called by signed-in users:
//   { action: "plan" }    → the monthly price, read live from Razorpay
//   { action: "create" }  → starts a Razorpay subscription for the caller and
//                           returns what Razorpay Checkout needs to open
//   { action: "cancel" }  → cancels the caller's subscription (they keep
//                           access until the period already paid for ends)
//
// Acts only as the caller (their own JWT, never the service role): it can
// read only the caller's own subscription rows, and it never writes payment
// state — only razorpay-webhook does that, after verifying Razorpay's
// signature. The caller's user id is put in the subscription's notes here,
// server-side from the verified JWT, which is how the webhook knows whose
// payment it is.
//
// Secrets (Edge Function environment): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
// RAZORPAY_PLAN_ID.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RAZORPAY_API = "https://api.razorpay.com/v1";
// Monthly charges before the subscription completes on its own (5 years);
// Razorpay requires a fixed count. Someone still subscribed then simply
// subscribes again.
const TOTAL_MONTHS = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function razorpay(path: string, init: RequestInit = {}) {
  const auth = btoa(`${Deno.env.get("RAZORPAY_KEY_ID")}:${Deno.env.get("RAZORPAY_KEY_SECRET")}`);
  return fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const planId = Deno.env.get("RAZORPAY_PLAN_ID");
  if (!keyId || !Deno.env.get("RAZORPAY_KEY_SECRET") || !planId) {
    return json({ error: "Subscriptions aren't set up yet." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
  const user = userData.user;

  let action: unknown;
  try {
    ({ action } = await req.json());
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  if (action === "plan") {
    const res = await razorpay(`/plans/${planId}`);
    if (!res.ok) return json({ error: "Couldn't load the plan." }, 502);
    const plan = await res.json();
    return json({ amount: plan.item.amount / 100, currency: plan.item.currency, period: plan.period, interval: plan.interval });
  }

  if (action === "create") {
    const { data: plan } = await userClient.rpc("my_plan").single<{ plan: string }>();
    if (plan?.plan === "paid") return json({ error: "You already have an active subscription." }, 409);

    const res = await razorpay("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        plan_id: planId,
        total_count: TOTAL_MONTHS,
        customer_notify: 1,
        notes: { user_id: user.id },
      }),
    });
    if (!res.ok) {
      console.error("Razorpay create subscription failed", res.status, await res.text());
      return json({ error: "Couldn't start the subscription. Please try again." }, 502);
    }
    const subscription = await res.json();
    return json({ subscriptionId: subscription.id, keyId, email: user.email ?? null });
  }

  if (action === "cancel") {
    // RLS: only the caller's own rows are visible here.
    const { data: rows } = await userClient
      .from("subscriptions")
      .select("razorpay_subscription_id")
      .in("status", ["active", "pending", "authenticated"])
      .order("last_event_at", { ascending: false })
      .limit(1);
    const id = rows?.[0]?.razorpay_subscription_id;
    if (!id) return json({ error: "No active subscription to cancel." }, 404);

    // Cancel now (no further charges); my_plan() keeps access until the
    // period already paid for ends.
    const res = await razorpay(`/subscriptions/${id}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) });
    if (!res.ok) {
      console.error("Razorpay cancel failed", res.status, await res.text());
      return json({ error: "Couldn't cancel. Please try again." }, 502);
    }
    return json({ ok: true });
  }

  return json({ error: "Bad request" }, 400);
});
