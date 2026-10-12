import { Stack } from "expo-router";
import { HeaderBackButton } from "@/shared/ui/HeaderBackButton";
import { useTheme } from "@/shared/ui/theme";

export default function AuthLayout() {
  const { colors } = useTheme();

  // Every screen past the landing page gets a back arrow to return to the
  // previous step (or the landing page when opened directly).
  const withBack = {
    headerShown: true,
    title: "",
    headerLeft: () => <HeaderBackButton />,
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
  };

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-up" options={withBack} />
      <Stack.Screen name="forgot-password" options={withBack} />
      <Stack.Screen name="verify-email" options={withBack} />
    </Stack>
  );
}
