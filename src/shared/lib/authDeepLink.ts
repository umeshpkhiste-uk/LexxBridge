import * as Linking from "expo-linking";
import { supabase } from "./supabase";

/**
 * Both the email-confirmation link (sign-up) and the password-reset link
 * redirect back into the app as `lexxbridge://<path>?code=...` (PKCE).
 * Clicking the link only verifies the token server-side; it does NOT log the
 * device in by itself — supabase-js needs the `code` exchanged for a real
 * session, which normally happens automatically via detectSessionInUrl on
 * web, but has no native equivalent. This does that exchange manually.
 *
 * Safe to call with any URL, including ones with no `code` param (e.g. a
 * plain cold start) — those are silently ignored (returns null).
 *
 * Returns a user-facing message when the exchange fails (expired/already-
 * used link, wrong browser/profile for a web PKCE code, etc.) so the caller
 * can show it — previously this only logged a console warning, which left
 * the user looking at the sign-in screen with no idea why the link they
 * just clicked "did nothing".
 */
export async function consumeAuthDeepLink(url: string | null): Promise<string | null> {
  if (!url) return null;

  const { queryParams } = Linking.parse(url);
  const code = queryParams?.code;
  if (typeof code !== "string") return null;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("Failed to exchange auth deep link code for a session:", error.message);
    return "That link has expired or already been used. Please request a new one.";
  }
  return null;
}
