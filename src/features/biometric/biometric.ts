import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getAppLockMethod, resetAppLockFailures } from "@/features/applock/appLock";
import { clearDeviceNotifications, unregisterPushToken } from "@/features/notifications/device";
import { supabase } from "@/shared/lib/supabase";

/**
 * Biometric login.
 *
 * Enabling stores the advocate's user id in the keychain. While signed in,
 * the persisted Supabase session is simply gated behind a biometric check on
 * cold start (see BiometricGate). On log out, instead of revoking the
 * session server-side, we sign out locally and keep its refresh token in the
 * keychain; "Log in with Face ID" then proves presence biometrically and
 * exchanges that token for a fresh session — no password needed.
 *
 * Disabling biometrics, a password sign-in, or deleting the account clears
 * the stored token. It also expires on its own after QUICK_LOGIN_TTL_MS: a
 * stolen/lost device can only skip the password this way for a limited
 * window after the last log-out, not indefinitely (the server-side refresh
 * token isn't revoked on log-out by design — see signOutKeepingBiometric —
 * so this local expiry is what actually bounds the exposure).
 */

const ENABLED_USER_KEY = "biometric.userId";
const REFRESH_TOKEN_KEY = "biometric.refreshToken";
const EMAIL_KEY = "biometric.email";
/** Whose stored refresh token it is (for PIN / pattern login after log out). */
const SAVED_USER_KEY = "quicklogin.userId";
/** When the current stored refresh token was saved (epoch ms, as a string). */
const SAVED_AT_KEY = "quicklogin.savedAt";
const QUICK_LOGIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** True once the stored refresh token is past its local expiry window, or if
 * there's no timestamp to check (defensive default: treat as expired). */
async function isQuickLoginExpired(): Promise<boolean> {
  const savedAt = await SecureStore.getItemAsync(SAVED_AT_KEY);
  if (!savedAt) return true;
  return Date.now() - Number(savedAt) > QUICK_LOGIN_TTL_MS;
}

export async function getBiometricSupport(): Promise<{ available: boolean; label: string }> {
  if (Platform.OS === "web") return { available: false, label: "Biometrics" };
  const [hasHardware, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ? Platform.OS === "ios"
      ? "Face ID"
      : "Face unlock"
    : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ? Platform.OS === "ios"
        ? "Touch ID"
        : "Fingerprint"
      : "Biometrics";
  return { available: hasHardware && isEnrolled, label };
}

export async function authenticateBiometric(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return result.success;
}

export async function isBiometricEnabledFor(userId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await SecureStore.getItemAsync(ENABLED_USER_KEY)) === userId;
}

export async function enableBiometric(userId: string, email: string | undefined): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_USER_KEY, userId);
  if (email) await SecureStore.setItemAsync(EMAIL_KEY, email);
}

export async function disableBiometric(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ENABLED_USER_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(EMAIL_KEY),
    SecureStore.deleteItemAsync(SAVED_AT_KEY),
  ]);
}

/** Email of the account a biometric login would restore, if one is available
 * and its local expiry window hasn't passed. */
export async function getBiometricLoginEmail(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const [userId, token, email] = await Promise.all([
    SecureStore.getItemAsync(ENABLED_USER_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(EMAIL_KEY),
  ]);
  if (!userId || !token) return null;
  if (await isQuickLoginExpired()) {
    await forgetSavedLogin();
    return null;
  }
  return email ?? "your account";
}

/**
 * Log out. With Face ID or an app lock (PIN / pattern) set for this user,
 * the session is only cleared on this device and its refresh token kept in
 * the keychain, so opening the app again asks for Face ID / the PIN instead
 * of the password. Otherwise the session is revoked normally.
 */
export async function signOutKeepingBiometric(): Promise<{ error: string | null }> {
  // Stop pushes to this phone and clear its reminders before the session ends.
  await unregisterPushToken().catch(() => {});
  await clearDeviceNotifications().catch(() => {});
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const keepForQuickLogin =
    !!session && ((await isBiometricEnabledFor(session.user.id)) || !!(await getAppLockMethod(session.user.id)));
  if (session && keepForQuickLogin) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refresh_token);
    await SecureStore.setItemAsync(SAVED_USER_KEY, session.user.id);
    await SecureStore.setItemAsync(SAVED_AT_KEY, Date.now().toString());
    await clearSessionOnDeviceOnly();
    return { error: null };
  }
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

export async function loginWithBiometric(label: string): Promise<{ error: string | null }> {
  const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!token) return { error: "Log in with your password first." };
  if (await isQuickLoginExpired()) {
    await forgetSavedLogin();
    return { error: "Your saved login has expired. Please log in with your password." };
  }

  const ok = await authenticateBiometric(`Log in to LexxBridge with ${label}`);
  if (!ok) return { error: null };

  const { error } = await supabase.auth.refreshSession({ refresh_token: token });
  // The stored token is single-use: the new session carries its own.
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  if (error) {
    return { error: "Your saved login has expired. Please log in with your password." };
  }
  return { error: null };
}

/**
 * Signs out on this phone only. supabase.auth.signOut() — even with
 * scope "local" — also revokes the session on the server, which would make
 * the refresh token we just saved useless ("saved login has expired").
 * Removing the stored session locally keeps that token valid for the PIN /
 * Face ID login, and still fires SIGNED_OUT so the app shows the lock screen.
 */
async function clearSessionOnDeviceOnly() {
  const auth = supabase.auth as unknown as { _removeSession?: () => Promise<void> };
  if (typeof auth._removeSession === "function") await auth._removeSession();
  // Fallback if the library internals ever change: a normal local sign-out.
  else await supabase.auth.signOut({ scope: "local" });
}

/** The account a PIN / pattern / Face ID login would restore after log out,
 * if its local expiry window hasn't passed. */
export async function getSavedLoginUser(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const [userId, token] = await Promise.all([SecureStore.getItemAsync(SAVED_USER_KEY), SecureStore.getItemAsync(REFRESH_TOKEN_KEY)]);
  if (!userId || !token) return null;
  if (await isQuickLoginExpired()) {
    await forgetSavedLogin();
    return null;
  }
  return userId;
}

/** Signs back in with the stored token (after the PIN / Face ID check). */
export async function loginWithSavedSession(): Promise<{ error: string | null }> {
  const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!token) return { error: "Please log in with your password." };
  if (await isQuickLoginExpired()) {
    await forgetSavedLogin();
    return { error: "Your saved login has expired. Please log in with your password." };
  }
  const { error } = await supabase.auth.refreshSession({ refresh_token: token });
  // Single-use: the new session carries its own refresh token.
  await forgetSavedLogin();
  return { error: error ? "Your saved login has expired. Please log in with your password." : null };
}

export async function forgetSavedLogin(): Promise<void> {
  if (Platform.OS === "web") return;
  await Promise.all([
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(SAVED_USER_KEY),
    SecureStore.deleteItemAsync(SAVED_AT_KEY),
  ]);
}

/** Called after a password sign-in: drop any stale stored token, and turn
 * biometrics off if it belonged to a different account. */
export async function onPasswordSignIn(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  await forgetSavedLogin();
  // A password login proves identity, so wrong-PIN tries start over.
  await resetAppLockFailures(userId).catch(() => {});
  const enabledUser = await SecureStore.getItemAsync(ENABLED_USER_KEY);
  if (enabledUser && enabledUser !== userId) await disableBiometric();
}
