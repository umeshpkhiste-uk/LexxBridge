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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let comment: unknown;
  try {
    ({ comment } = await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (typeof comment !== "string" || !comment.trim()) {
    return new Response("Bad request", { status: 400 });
  }
  const trimmed = comment.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_WORDS) {
    return new Response(JSON.stringify({ error: `Comment exceeds ${MAX_WORDS} words` }), { status: 400 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  // Acts as the caller (their own JWT, not the service role), so this can
  // never read or impersonate anyone else's identity.
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await userClient
    .from("advocate_profiles")
    .select("full_name")
    .eq("id", userData.user.id)
    .single();
  const fullName = profile?.full_name ?? "Advocate";

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500 });

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
    return new Response(JSON.stringify({ error: `Failed to send: ${errText}` }), { status: 502 });
  }

  return Response.json({ sent: true });
});
