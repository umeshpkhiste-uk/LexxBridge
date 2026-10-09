import { Stack } from "expo-router";
import { HeaderBackButton } from "@/shared/ui/HeaderBackButton";
import { useTheme } from "@/shared/ui/theme";

/** Public legal pages — reachable at /legal/* without signing in, so the
 * Vercel-hosted URLs work as the Privacy Policy / account-deletion links
 * Google Play requires. */
export default function LegalLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLeft: () => <HeaderBackButton />,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="privacy" options={{ title: "Privacy Policy" }} />
      <Stack.Screen name="terms" options={{ title: "Terms of Service" }} />
      <Stack.Screen name="delete-account" options={{ title: "Delete Account" }} />
    </Stack>
  );
}
