// Sends one row of public.notifications to the recipient's phones via the
// Expo push service. Called by the notifications_send_push database trigger
// with { notification_id }.
//
// It needs no caller JWT — it only ever sends a notification that already
// exists, was created in the last few minutes and hasn't been pushed yet
// (claimed atomically via pushed_at), so calling it can't forge content or
// resend old notifications. It does need the shared secret the trigger
// sends (kept in Supabase Vault as `internal_function_secret`), checked
// against this function's own INTERNAL_FUNCTION_SECRET env var — without
// that, anyone who found this URL could at least trigger a real push send
// to whatever notification id they guessed, for free, repeatedly.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const providedSecret = req.headers.get("x-internal-secret");
  if (!expectedSecret || !providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let notificationId: unknown;
  try {
    ({ notification_id: notificationId } = await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (typeof notificationId !== "string" || !/^[0-9a-f-]{36}$/i.test(notificationId)) {
    return new Response("Bad request", { status: 400 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Claim it: only a fresh, not-yet-pushed notification gets through.
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: notification, error } = await admin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("pushed_at", null)
    .gte("created_at", since)
    .select("id, recipient_id, type, title, body, data")
    .maybeSingle();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!notification) return Response.json({ skipped: true });

  const { data: tokens } = await admin.from("push_tokens").select("token").eq("user_id", notification.recipient_id);
  if (!tokens?.length) return Response.json({ sent: 0 });

  const channelId = notification.type === "new_message" ? "messages" : "default";
  const messages = tokens.map(({ token }) => ({
    to: token,
    title: notification.title,
    body: notification.body ?? "",
    data: { ...(notification.data ?? {}), type: notification.type, notification_id: notification.id },
    sound: "default",
    channelId,
    priority: "high",
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);

  // Forget devices Expo says are no longer registered (app removed, etc.).
  const tickets: { status: string; details?: { error?: string } }[] = result?.data ?? [];
  const stale = tickets
    .map((t, i) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? tokens[i].token : null))
    .filter((t): t is string => !!t);
  if (stale.length) await admin.from("push_tokens").delete().in("token", stale);

  return Response.json({ sent: messages.length, removed: stale.length });
});
