import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { enableAppSwitcherProtectionAsync, usePreventScreenCapture } from "expo-screen-capture";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { getSavedLoginUser, isBiometricEnabledFor, loginWithSavedSession } from "@/features/biometric/biometric";
import { getAppLockMethod, rememberLockedAccount } from "@/features/applock/appLock";
import { AppLockScreen } from "@/features/applock/AppLockScreen";
import { ensureKeyPair } from "@/features/messaging/encryption";
import { PresenceProvider } from "@/features/presence/PresenceProvider";
import { restoreLanguagePreference } from "@/shared/i18n/i18n";
import { AppFrame } from "@/shared/ui/appFrame";
import { useTheme } from "@/shared/ui/theme";
import { restoreThemePreference } from "@/shared/ui/themePreference";
import { WebAlertHost } from "@/shared/ui/WebAlertHost";

/** locked: gate a saved session. login: logged out, but a PIN / pattern
 * can sign this user back in with the token kept at log out. */
type LockState = "checking" | "locked" | "login" | "unlocked";

function RootNavigator() {
  const { session, isLoading, isPasswordRecovery } = useAuth();
  const { colors } = useTheme();
  const [lockState, setLockState] = useState<LockState>("checking");
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const hasCheckedLock = useRef(false);

  // Makes sure a device key pair exists (and its public half is uploaded)
  // as soon as this device has a session, so other advocates can message
  // this account securely without waiting for it to open a chat first.
  useEffect(() => {
    if (session) ensureKeyPair().catch(() => {});
  }, [session]);

  // The lock (Face ID and/or PIN / pattern) applies only to a session
  // restored on cold start. A session created during this run (password or
  // biometric login) has already proven who the user is.
  useEffect(() => {
    if (isLoading || hasCheckedLock.current) return;
    hasCheckedLock.current = true;
    const decide = async (): Promise<LockState> => {
      if (isPasswordRecovery) return "unlocked";
      if (session) {
        const [biometricOn, lockMethod] = await Promise.all([isBiometricEnabledFor(session.user.id), getAppLockMethod(session.user.id)]);
        if (lockMethod) await rememberLockedAccount(session.user.id);
        return biometricOn || lockMethod ? "locked" : "unlocked";
      }
      // Logged out earlier with a PIN / pattern set: ask for it instead of
      // the password.
      const userId = await getSavedLoginUser();
      if (userId && (await getAppLockMethod(userId))) {
        setSavedUserId(userId);
        return "login";
      }
      return "unlocked";
    };
    decide()
      .then(setLockState)
      .catch(() => setLockState("unlocked"));
  }, [isLoading, session, isPasswordRecovery]);

  // Logging out during this run: if a PIN / pattern is set, go straight to
  // the lock screen (log back in with it) instead of the login page.
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = session?.user.id ?? null;
    const loggedOut = previousUserId.current !== null && currentUserId === null;
    previousUserId.current = currentUserId;
    if (!loggedOut || isPasswordRecovery) return;
    let active = true;
    getSavedLoginUser()
      .then(async (userId) => {
        if (!active || !userId || !(await getAppLockMethod(userId))) return;
        setSavedUserId(userId);
        setLockState("login");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session, isPasswordRecovery]);

  if (isLoading || lockState === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (lockState === "login" && savedUserId && !session) {
    return (
      <AppLockScreen
        userId={savedUserId}
        mode="login"
        onUnlock={async () => {
          const { error } = await loginWithSavedSession();
          if (error) Alert.alert("Please log in", error);
          setLockState("unlocked");
        }}
        onSignedOut={() => setLockState("unlocked")}
      />
    );
  }

  if (lockState === "locked" && session) {
    return (
      <AppLockScreen userId={session.user.id} onUnlock={() => setLockState("unlocked")} onSignedOut={() => setLockState("unlocked")} />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* A password-recovery deep link establishes a real session (that's how
          updateUser() is allowed to work), so it's checked before the normal
          session guard below — otherwise the user would be dropped straight
          into the authenticated app instead of the "set new password" screen. */}
      <Stack.Protected guard={isPasswordRecovery}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={!isPasswordRecovery && !session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!isPasswordRecovery && !!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* Social sign-in redirect target; just forwards into the app. */}
      <Stack.Screen name="auth-callback" />
      {/* Public legal pages (Privacy Policy, Terms, account deletion) — kept
          outside the (auth)/(app) guards so their Vercel URLs work for
          signed-out visitors and Play Store review. */}
      <Stack.Screen name="legal" />
    </Stack>
  );
}

/**
 * Feeds the app palette to React Navigation. Without this the navigators
 * keep their default light background, which shows through anywhere a
 * screen or the tab bar doesn't paint itself — e.g. a white strip behind the
 * tab bar's rounded corners in dark mode.
 */
function NavigationTheme({ children }: { children: React.ReactNode }) {
  const { colors, scheme } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.brand,
          background: colors.background,
          card: colors.surface,
          text: colors.textPrimary,
          border: colors.border,
          notification: colors.danger,
        },
      }}
    >
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Blocks screenshots and screen recording for the whole app (Android:
  // FLAG_SECURE, shows a black screen to anything that tries; iOS 13+:
  // the OS itself refuses the capture). Case, client and financial data
  // shown here should never end up in a photo library or a recording.
  usePreventScreenCapture();

  useEffect(() => {
    restoreThemePreference();
    restoreLanguagePreference();
    // iOS can't block the app-switcher snapshot the same way, so this blurs
    // it instead of leaving sensitive content visible when the app isn't focused.
    if (Platform.OS === "ios") enableAppSwitcherProtectionAsync().catch(() => {});
  }, []);

  return (
    <NavigationTheme>
      <AppFrame>
        <WebAlertHost />
        <AuthProvider>
          <PresenceProvider>
            <RootNavigator />
          </PresenceProvider>
        </AuthProvider>
      </AppFrame>
    </NavigationTheme>
  );
}
