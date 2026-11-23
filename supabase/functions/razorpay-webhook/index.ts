// Receives Razorpay's subscription webhooks and records the payment state in
// public.subscriptions — the only writer of that table.
//
// Deployed WITHOUT JWT verification (Razorpay can't send a Supabase JWT);
// instead every request must carry a valid X-Razorpay-Signature, an
// HMAC-SHA256 of the exact body with the webhook secret. Anything unsigned,
// mis-signed, or not a subscription event is ignored.
//
// Uses the service role (RLS has no write policy on subscriptions, by
// design), and touches nothing but that one table.
//
// Secrets: RAZORPAY_WEBHOOK_SECRET, RAZORPAY_PLAN_ID.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison, so the signature can't be guessed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const toIso = (unixSeconds: unknown) => (typeof unixSeconds === "number" && unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : null);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return new Response("Not configured", { status: 503 });

  const body = await req.text();
  const signature = req.headers.get("X-Razorpay-Signature") ?? "";
  if (!safeEqual(await hmacHex(secret, body), signature)) return new Response("Invalid signature", { status: 401 });

  let event: { event?: string; created_at?: number; payload?: { subscription?: { entity?: Record<string, unknown> } } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const sub = event.payload?.subscription?.entity;
  // Acknowledge (200) everything we don't act on, so Razorpay doesn't retry it.
  if (!event.event?.startsWith("subscription.") || !sub) return new Response("ignored");
  if (sub.plan_id !== Deno.env.get("RAZORPAY_PLAN_ID")) return new Response("ignored: other plan");
  const userId = (sub.notes as Record<string, unknown> | undefined)?.user_id;
  if (typeof userId !== "string" || !UUID.test(userId) || typeof sub.id !== "string" || typeof sub.status !== "string") {
    return new Response("ignored: missing fields");
  }

  const eventAt = toIso(event.created_at) ?? new Date().toISOString();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: existing, error: readError } = await admin
    .from("subscriptions")
    .select("last_event_at, current_period_end")
    .eq("razorpay_subscription_id", sub.id)
    .maybeSingle();
  if (readError) return new Response("Database error", { status: 500 }); // Razorpay retries

  // Webhooks can arrive out of order — never let an older event overwrite a newer one.
  if (existing && new Date(existing.last_event_at) > new Date(eventAt)) return new Response("ignored: stale");

  const { error } = await admin.from("subscriptions").upsert({
    razorpay_subscription_id: sub.id,
    user_id: userId,
    status: sub.status,
    current_period_end: toIso(sub.current_end) ?? existing?.current_period_end ?? null,
    last_event_at: eventAt,
    updated_at: new Date().toISOString(),
  });
  if (error) return new Response("Database error", { status: 500 });

  return new Response("ok");
});
