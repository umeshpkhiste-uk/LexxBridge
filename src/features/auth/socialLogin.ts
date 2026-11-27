import type { Provider } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { onPasswordSignIn } from "@/features/biometric/biometric";
import { authErrorMessage, GENERIC_ERROR_MESSAGE } from "@/shared/lib/errors";
import { supabase } from "@/shared/lib/supabase";

// Closes the auth popup on web once the provider redirects back.
WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = "google" | "facebook" | "apple";

export const SOCIAL_LABEL: Record<SocialProvider, string> = { google: "Google", facebook: "Facebook", apple: "Apple" };

/** Which sign-in methods besides email are switched on in the Supabase project. */
export async function getEnabledProviders(): Promise<Record<SocialProvider | "phone", boolean>> {
  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "" },
    });
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return {
      google: !!settings.external?.google,
      facebook: !!settings.external?.facebook,
      apple: !!settings.external?.apple,
      phone: !!settings.external?.phone,
    };
  } catch {
    return { google: false, facebook: false, apple: false, phone: false };
  }
}

export type SocialResult = { status: "signed-in" } | { status: "cancelled" } | { status: "error"; message: string };

/**
 * Sign in (or sign up) with Google / Facebook / Apple through Supabase OAuth
 * (PKCE): the provider's page opens in a secure in-app browser, redirects
 * back to `<scheme>://auth-callback?code=…`, and the code is exchanged here
 * for a session. New users get a profile from the database trigger and then
 * go through onboarding like email sign-ups.
 */
export async function signInWithProvider(provider: SocialProvider): Promise<SocialResult> {
  const redirectTo = Linking.createURL("auth-callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Let people pick which Google account to use every time.
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });
  if (error || !data?.url) return { status: "error", message: authErrorMessage(error) ?? "Couldn't start sign-in" };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { status: "cancelled" };

  const { queryParams } = Linking.parse(result.url);
  const providerError = queryParams?.error_description ?? queryParams?.error;
  if (typeof providerError === "string") return { status: "error", message: "Sign-in didn't go through. Please try again." };

  const code = queryParams?.code;
  if (typeof code !== "string") return { status: "error", message: "Sign-in didn't return a code. Please try again." };

  // The app's deep-link listener may already have exchanged this code.
  const existing = await supabase.auth.getSession();
  if (!existing.data.session) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return { status: "error", message: authErrorMessage(exchangeError) ?? GENERIC_ERROR_MESSAGE };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) await onPasswordSignIn(userData.user.id);
  return { status: "signed-in" };
}
