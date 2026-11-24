import type { ErrorBoundaryProps } from "expo-router";
import { Platform, View } from "react-native";
import { GENERIC_ERROR_MESSAGE } from "@/shared/lib/errors";
import { ErrorView } from "./LoadState";
import { useTheme } from "./theme";

/** Shown instead of a screen (or the whole app) that crashed while rendering.
 * Deliberately never shows `error` — React already logs it to the console. */
export function CrashScreen({ retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  // On the web a crash can be a page chunk that failed to download, and React
  // caches that failure — only a reload fetches it again.
  const onRetry = () => (Platform.OS === "web" ? window.location.reload() : retry());
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ErrorView message={GENERIC_ERROR_MESSAGE} onRetry={onRetry} />
    </View>
  );
}
