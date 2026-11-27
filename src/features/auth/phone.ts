import { onPasswordSignIn } from "@/features/biometric/biometric";
import { authErrorMessage } from "@/shared/lib/errors";
import { supabase } from "@/shared/lib/supabase";
import { normalizeIndianMobile } from "@/shared/lib/validation";
import type { AuthResult } from "./api";

/** "+919876543210" — the form Supabase Auth expects — or null if invalid. */
export function toE164(input: string): string | null {
  return normalizeIndianMobile(input)?.replace(/\s/g, "") ?? null;
}

/**
 * Texts a sign-in code to a number already verified on an account. Never
 * creates an account: someone who signed up by email would otherwise get a
 * second, empty one. An unknown number reports success too, so this can't be
 * used to find out who is registered (same rule as requestPasswordReset).
 */
export async function sendLoginCode(phone: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
  if (error?.code === "otp_disabled" || error?.code === "user_not_found") return { error: null };
  return { error: authErrorMessage(error) };
}

export async function verifyLoginCode(phone: string, token: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (data?.user) await onPasswordSignIn(data.user.id);
  return { error: authErrorMessage(error) };
}

/** Texts a code to a number the signed-in user wants to log in with. It only
 * becomes theirs once verifyPhoneNumber() succeeds. */
export async function sendPhoneVerification(phone: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ phone });
  return { error: authErrorMessage(error) };
}

export async function verifyPhoneNumber(phone: string, token: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
  return { error: authErrorMessage(error) };
}
