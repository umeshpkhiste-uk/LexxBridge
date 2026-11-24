import { Ionicons } from "@expo/vector-icons";
import { useNetworkState } from "expo-network";
import { ActivityIndicator, StyleProp, Text, View, ViewStyle } from "react-native";
import { useIsSlow } from "@/shared/hooks/useIsSlow";
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from "@/shared/lib/errors";
import { Button } from "./Button";
import { useTheme } from "./theme";

// flexGrow, not flex: 1, so it fills a screen but still has a height of its
// own inside a card or a scroll view.
const center: ViewStyle = { flexGrow: 1, alignItems: "center", justifyContent: "center" };

function useIsOffline(): boolean {
  const { isConnected, isInternetReachable } = useNetworkState();
  return isConnected === false || isInternetReachable === false;
}

/** Spinner that says so when the device is offline or the network is slow. */
export function LoadingView({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, spacing, typography } = useTheme();
  const isOffline = useIsOffline();
  const isSlow = useIsSlow(true);
  const note = isOffline
    ? { title: "You're offline", text: "Check your internet connection." }
    : isSlow
      ? { title: "Your network is slow", text: "Still loading. Please wait…" }
      : null;

  return (
    <View style={[center, { padding: spacing.md }, style]} accessibilityLabel={note?.title ?? "Loading"} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.brand} />
      {note ? (
        <View style={{ alignItems: "center", marginTop: spacing.md }}>
          <Text style={[typography.bodyStrong, { color: colors.textPrimary, textAlign: "center" }]}>{note.title}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center" }]}>{note.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Couldn't load" screen (or card section) with a Try again button. Pass it
 * the result of friendlyErrorMessage(err), never err.message directly. */
export function ErrorView({ message, onRetry, style }: { message: string; onRetry: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors, spacing, typography } = useTheme();
  const isOffline = useIsOffline();
  const isNetwork = isOffline || message === NETWORK_ERROR_MESSAGE;
  const title = isOffline ? "You're offline" : isNetwork ? "Network problem" : "Something went wrong";
  const text = isNetwork ? NETWORK_ERROR_MESSAGE : message === GENERIC_ERROR_MESSAGE ? "Please try again in a moment." : message;

  return (
    <View style={[center, { padding: spacing.md, gap: spacing.xs }, style]} accessibilityRole="alert">
      <Ionicons name={isNetwork ? "cloud-offline-outline" : "warning-outline"} size={36} color={colors.warning} />
      <Text style={[typography.subtitle, { color: colors.textPrimary, textAlign: "center" }]}>{title}</Text>
      <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginBottom: spacing.sm }]}>{text}</Text>
      <View style={{ minWidth: 160 }}>
        <Button label="Try again" variant="secondary" onPress={onRetry} pill />
      </View>
    </View>
  );
}

/** What to show in place of content that isn't there yet: the error screen if
 * loading failed, otherwise the loading screen. */
export function LoadState({ error, onRetry, style }: { error: string | null; onRetry: () => void; style?: StyleProp<ViewStyle> }) {
  return error ? <ErrorView message={error} onRetry={onRetry} style={style} /> : <LoadingView style={style} />;
}
