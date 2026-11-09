import { onPasswordSignIn } from "@/features/biometric/biometric";
import { Platform } from "react-native";
import { supabase } from "@/shared/lib/supabase";

export type AuthResult = { error: string | null };

/** Where email links (confirm sign-up, reset password) send people back to:
 * the app on phones, or the site they signed up on in a browser. */
function authRedirect(path: "verify-email" | "reset-password"): string {
  if (Platform.OS === "web" && typeof window !== "undefined") return `${window.location.origin}/${path}`;
  return `lexxbridge://${path}`;
}

export async function signUpWithEmail(params: {
  fullName: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const { fullName, email, password } = params;
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { full_name: fullName.trim() },
      // Without this, Supabase falls back to the project's Site URL, which
      // has nothing to do with this app (see docs/BACKEND_SETUP.md).
      emailRedirectTo: authRedirect("verify-email"),
    },
  });
  return { error: error?.message ?? null };
}

export async function signInWithEmail(params: { email: string; password: string }): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email.trim().toLowerCase(),
    password: params.password,
  });
  if (data.user) await onPasswordSignIn(data.user.id);
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

/** Revokes every session's refresh token except this one — the self-service
 * "I think someone else is signed in" action, and also run automatically
 * after a password change (see updatePassword below). A revoked refresh
 * token can no longer renew a session, but an already-issued access token
 * on another device stays valid until it expires on its own (Supabase's
 * default JWT lifetime is 1 hour) — there's no way to invalidate an
 * already-issued access token from the client. */
export async function signOutOtherSessions(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return { error: error?.message ?? null };
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: authRedirect("reset-password"),
  });
  return { error: error?.message ?? null };
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  // If a hacked password is being changed to lock an intruder out, their
  // existing session shouldn't just sit there — revoke every other
  // session's refresh token so none of them can keep renewing.
  await signOutOtherSessions();
  return { error: null };
}

/** Re-authenticates with the account's current password to confirm "this is
 * really you" before an in-app password change — unlike signInWithEmail,
 * this has none of the biometric-login side effects of a normal sign-in. */
export async function verifyCurrentPassword(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  return { error: error?.message ?? null };
}
