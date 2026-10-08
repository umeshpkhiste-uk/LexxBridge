import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Text } from "react-native";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

/** Expo Router's catch-all for any URL that doesn't match a real route —
 * most reachable by someone editing the address bar directly, since every
 * in-app navigation already points at a route that exists. Falls back to
 * the home screen rather than a no-op when there's no history to go back
 * to (e.g. this was the very first page loaded, like a bookmarked or
 * shared bad link). */
export default function NotFoundScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="compass-outline" size={40} color={colors.textSecondary} style={{ marginBottom: spacing.md }} />
        <Text style={[typography.subtitle, { color: colors.textPrimary, textAlign: "center" }]}>Page not found</Text>
        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.lg },
          ]}
        >
          This page doesn&apos;t exist, or the link is broken.
        </Text>
        <Button label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </ScreenContainer>
    </>
  );
}
