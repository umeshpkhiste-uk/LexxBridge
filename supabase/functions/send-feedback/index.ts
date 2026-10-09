// Sends a user's "Help & support" suggestion straight to the app owner's
// inbox via Resend. Requires a valid caller JWT (the platform verifies it
// before this runs) so every email is traceable to a real signed-in
// advocate, and enforces the same 500-word cap the client already does —
// the client-side check is just for UX; this one is what actually matters.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";
const RECIPIENT = "deepomeshcreation@gmail.com";
const MAX_WORDS = 500;

// The only one of the 3 Edge Functions this app calls directly from the
// client's browser/app, rather than a database trigger — so it's the only
// one that needs CORS headers (a trigger-invoked function never faces a
// browser's preflight check at all).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let comment: unknown;
  try {
    ({ comment } = await req.json());
  } catch {
    return new Response("Bad request", { status: 400, headers: corsHeaders });
  }
  if (typeof comment !== "string" || !comment.trim()) {
    return new Response("Bad request", { status: 400, headers: corsHeaders });
  }
  const trimmed = comment.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_WORDS) {
    return json({ error: `Comment exceeds ${MAX_WORDS} words` }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  // Acts as the caller (their own JWT, not the service role), so this can
  // never read or impersonate anyone else's identity.
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  // Logs this submission and enforces the per-user rate limit in one step —
  // the insert itself raises (via a database trigger) once the sender has
  // logged 5 submissions in the last hour, before any Resend quota is spent.
  const { error: rateLimitError } = await userClient
    .from("feedback_submissions")
    .insert({ user_id: userData.user.id });
  if (rateLimitError) {
    return json({ error: rateLimitError.message }, 429);
  }

  const { data: profile } = await userClient
    .from("advocate_profiles")
    .select("full_name")
    .eq("id", userData.user.id)
    .single();
  const fullName = profile?.full_name ?? "Advocate";

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "Email service not configured" }, 500);

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "LexxBridge Feedback <onboarding@resend.dev>",
      to: [RECIPIENT],
      reply_to: userData.user.email ?? undefined,
      subject: `Lexxbridge - ${fullName} - Comment`,
      text: `${trimmed}\n\n---\nFrom: ${fullName} (${userData.user.email ?? "no email on file"})\nUser ID: ${userData.user.id}`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return json({ error: `Failed to send: ${errText}` }, 502);
  }

  return new Response(JSON.stringify({ sent: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
