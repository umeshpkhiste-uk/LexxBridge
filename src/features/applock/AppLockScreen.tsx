import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  authenticateBiometric,
  forgetSavedLogin,
  getBiometricSupport,
  isBiometricEnabledFor,
  signOutKeepingBiometric,
} from "@/features/biometric/biometric";
import { presentNow } from "@/features/notifications/device";
import { supabase } from "@/shared/lib/supabase";
import { Button } from "@/shared/ui/Button";
import { AppLogo } from "@/shared/ui/AppLogo";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { LoadState } from "@/shared/ui/LoadState";
import { useTheme } from "@/shared/ui/theme";
import { getAppLockInfo, resetAppLockFailures, verifyAppLock } from "./appLock";
import { PatternGrid } from "./PatternGrid";
import { PinPad } from "./PinPad";
import { encodePattern, LockMethod, MAX_ATTEMPTS } from "./rules";

type Props = {
  userId: string;
  /** "unlock": a saved session, just gate it. "login": after log out, the
   * parent signs back in with the stored token once this check passes. */
  mode?: "unlock" | "login";
  onUnlock: () => void | Promise<void>;
  onSignedOut: () => void;
};

/**
 * Shown when the app opens with a saved session and an app lock (PIN or
 * pattern) and/or Face ID login is turned on. Too many wrong PIN/pattern
 * tries signs the user out, so they must log in with their password.
 */
export function AppLockScreen({ userId, mode = "unlock", onUnlock, onSignedOut }: Props) {
  const { colors, spacing, typography } = useTheme();
  const [lock, setLock] = useState<{ method: LockMethod; pinLength?: number } | null | undefined>(undefined);
  const [biometric, setBiometric] = useState<{ enabled: boolean; label: string }>({ enabled: false, label: "Face ID" });
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const prompted = useRef(false);

  // "Forgot? Log in with password".
  const switchToPassword = async () => {
    if (mode === "unlock") await signOutKeepingBiometric();
    onSignedOut();
  };

  // Too many wrong tries: drop the saved login so only the password works.
  const lockOut = async () => {
    await forgetSavedLogin();
    if (mode === "unlock") await supabase.auth.signOut();
    onSignedOut();
  };

  const tryBiometric = async (label: string) => {
    if (await authenticateBiometric(`Unlock LexxBridge with ${label}`)) {
      await resetAppLockFailures(userId);
      onUnlock();
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([getAppLockInfo(userId), isBiometricEnabledFor(userId), getBiometricSupport()]).then(([info, bioEnabled, support]) => {
      if (!active) return;
      const canUseBiometric = bioEnabled && support.available;
      setLock(info);
      setBiometric({ enabled: canUseBiometric, label: support.label });
      // Nothing to unlock with (e.g. Face ID removed from the phone): fall
      // back to the password rather than locking the user out.
      if (!info && !canUseBiometric) {
        switchToPassword();
        return;
      }
      if (canUseBiometric && !prompted.current) {
        prompted.current = true;
        tryBiometric(support.label);
      }
    })
      .catch((err) => active && setLoadError(friendlyErrorMessage(err)));
    return () => {
      active = false;
    };
    // Runs once for this user; the callbacks only matter for that first check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt]);

  const retryLoad = () => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  };

  const check = async (secret: string) => {
    setIsChecking(true);
    const result = await verifyAppLock(userId, secret);
    setIsChecking(false);
    // Cleared either way: a correct PIN can still leave this screen up if
    // logging back in fails on the network.
    setPin("");
    if (result.ok) return onUnlock();
    if (result.attemptsLeft <= 0) {
      const what = lock?.method === "pattern" ? "pattern" : "PIN";
      setMessage(`App locked after ${MAX_ATTEMPTS} wrong attempts.`);
      // Security notice on the phone (where notifications are available).
      presentNow(
        "LexxBridge locked",
        `Someone entered the wrong ${what} ${MAX_ATTEMPTS} times. Log in with your password to continue.`,
        { kind: "security" },
      ).catch(() => {});
      Alert.alert(
        "App locked",
        `The wrong ${what} was entered ${MAX_ATTEMPTS} times, so LexxBridge has been locked for your security. Please log in with your email and password.`,
        [{ text: "Log in with password", onPress: lockOut }],
        { cancelable: false },
      );
      return;
    }
    setMessage(`Wrong ${lock?.method === "pattern" ? "pattern" : "PIN"}. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left.`);
  };

  const onPinChange = (value: string) => {
    setMessage(null);
    setPin(value);
    if (lock?.pinLength && value.length === lock.pinLength) check(value);
  };

  if (lock === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <LoadState error={loadError} onRetry={retryLoad} />
      </View>
    );
  }

  const hint =
    lock?.method === "pin" ? "Enter your 6-digit PIN" : lock?.method === "pattern" ? "Draw your pattern" : `Use ${biometric.label} to continue`;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={{ alignItems: "center", marginTop: spacing.xl }}>
        <View>
          <AppLogo size={76} />
          <View style={[styles.lockDot, { backgroundColor: colors.brand, borderColor: colors.background }]}>
            <Ionicons name="lock-closed" size={13} color="#FFFFFF" />
          </View>
        </View>
        <Text style={[typography.title, { color: colors.textPrimary, marginTop: spacing.md }]}>LexxBridge is locked</Text>
        <Text style={[typography.body, { color: message ? colors.danger : colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }]}>
          {message ?? hint}
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        {isChecking ? <ActivityIndicator color={colors.brand} /> : null}
        {!isChecking && lock?.method === "pin" ? <PinPad value={pin} onChange={onPinChange} length={lock.pinLength} error={!!message} /> : null}
        {!isChecking && lock?.method === "pattern" ? (
          <PatternGrid
            error={!!message}
            onComplete={(dots) => {
              setMessage(null);
              check(encodePattern(dots));
            }}
          />
        ) : null}
        {!lock ? <Button label={`Unlock with ${biometric.label}`} onPress={() => tryBiometric(biometric.label)} pill /> : null}
      </View>

      <View style={{ alignItems: "center", gap: spacing.md, marginBottom: spacing.lg }}>
        {lock && biometric.enabled ? (
          <Pressable onPress={() => tryBiometric(biometric.label)} style={styles.link} accessibilityRole="button">
            <Ionicons name="scan-outline" size={20} color={colors.brand} />
            <Text style={[typography.bodyStrong, { color: colors.brand }]}>Use {biometric.label}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={switchToPassword} accessibilityRole="button">
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            {lock ? "Forgot? Log in with password" : "Use password instead"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  lockDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  link: { flexDirection: "row", alignItems: "center", gap: 6 },
});
