import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useGuardedPress } from "@/shared/lib/useGuardedPress";
import { alertMessage } from "@/shared/lib/alert";
import { NETWORK_ERROR_MESSAGE } from "@/shared/lib/errors";
import { useTheme } from "@/shared/ui/theme";
import { getBiometricLoginEmail, getBiometricSupport, loginWithBiometric } from "./biometric";

/**
 * "Log in with Face ID" — rendered only when biometric login was enabled
 * and a saved login is waiting from the last log out. On success the
 * AuthProvider picks up the new session and the root navigator switches to
 * the app automatically.
 */
export function BiometricLoginButton() {
  const { colors, radius, typography } = useTheme();
  const [state, setState] = useState<{ label: string; email: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      Promise.all([getBiometricLoginEmail(), getBiometricSupport()])
        .then(([email, support]) => {
          if (isMounted) setState(email && support.available ? { label: support.label, email } : null);
        })
        .catch(() => isMounted && setState(null));
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const onPress = useGuardedPress(async () => {
    if (!state) return;
    setIsBusy(true);
    const { error } = await loginWithBiometric(state.label);
    setIsBusy(false);
    if (error) {
      // After a network failure the saved login still works, so keep the button.
      if (error !== NETWORK_ERROR_MESSAGE) setState(null);
      alertMessage("Couldn't log in", error);
    }
  });

  if (!state) return null;

  return (
    <Pressable
      onPress={onPress}
      disabled={isBusy}
      accessibilityLabel={`Log in with ${state.label} as ${state.email}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingVertical: 16,
        borderRadius: radius.pill,
        backgroundColor: colors.brand,
        opacity: pressed || isBusy ? 0.85 : 1,
      })}
    >
      {isBusy ? (
        <ActivityIndicator color={colors.textInverse} />
      ) : (
        <>
          <Ionicons name={state.label.includes("Face") ? "scan-outline" : "finger-print-outline"} size={20} color={colors.textInverse} />
          <Text style={[typography.bodyStrong, { color: colors.textInverse }]} numberOfLines={1}>
            Log in with {state.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
