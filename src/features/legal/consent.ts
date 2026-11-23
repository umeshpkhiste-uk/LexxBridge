import type { User } from "@supabase/supabase-js";
import { supabase } from "@/shared/lib/supabase";

/** The Terms + Privacy Policy version users must accept — their shared
 * "Last updated" date. Bump this whenever either document changes
 * materially: every signed-in user is then asked to accept again (DPDP Act
 * §5(2)), and the acceptance is recorded in `user_consents` (§6(10)). */
export const CURRENT_POLICY_VERSION = "2026-11-24";

/** Stored in the sign-up request's user metadata, since there's no session
 * to write `user_consents` with until the email is confirmed — copied into
 * the table on first sign-in by `ensureConsentRecorded`. */
export const SIGNUP_CONSENT_METADATA_KEY = "consented_policy_version";

/** Whether this user has accepted the current policy version. When they
 * ticked the box at sign-up (stored in their metadata), this records that
 * acceptance now instead of asking a second time.
 *
 * Fails open (returns true) if the check itself errors, so a network blip
 * or a not-yet-applied migration never locks everyone out of the app. */
export async function ensureConsentRecorded(user: User): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_consents")
    .select("id")
    .eq("user_id", user.id)
    .eq("policy_version", CURRENT_POLICY_VERSION)
    .maybeSingle();
  if (error) {
    console.warn("Couldn't check consent status:", error.message);
    return true;
  }
  if (data) return true;

  if (user.user_metadata?.[SIGNUP_CONSENT_METADATA_KEY] === CURRENT_POLICY_VERSION) {
    const { error: insertError } = await recordConsent(user.id, "signup");
    return !insertError;
  }
  return false;
}

export async function recordConsent(userId: string, source: "signup" | "prompt") {
  return supabase
    .from("user_consents")
    .upsert(
      { user_id: userId, policy_version: CURRENT_POLICY_VERSION, age_confirmed: true, source },
      { onConflict: "user_id,policy_version", ignoreDuplicates: true },
    );
}
