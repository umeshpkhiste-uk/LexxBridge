import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { getMyProfile } from "@/features/profile/api";
import { HeaderBackButton } from "@/shared/ui/HeaderBackButton";
import { useTheme } from "@/shared/ui/theme";

export default function AppLayout() {
  const { colors } = useTheme();

  // First login after email verification: new profiles haven't completed
  // setup yet, so send them to the Basic information docket once. Saving or
  // skipping there stamps onboarding_completed_at, so this never repeats.
  useEffect(() => {
    getMyProfile()
      .then((profile) => {
        if (!profile.onboarding_completed_at) router.replace("/(app)/basic-info?onboarding=1");
      })
      .catch(() => {});
  }, []);

  return (
    <NotificationsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          // Every non-tab screen gets an explicit back arrow — modal screens
          // have no native one on iOS, so without this they could only be
          // dismissed by swiping down.
          headerLeft: () => <HeaderBackButton />,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="clients/new" options={{ presentation: "modal", headerShown: true, title: "New client" }} />
        <Stack.Screen name="clients/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="cases/new" options={{ presentation: "modal", headerShown: true, title: "New case" }} />
        <Stack.Screen name="cases/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="hearings/new" options={{ presentation: "modal", headerShown: true, title: "Schedule hearing" }} />
        <Stack.Screen name="hearings/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="meetings/new" options={{ presentation: "modal", headerShown: true, title: "New meeting" }} />
        <Stack.Screen name="communications/new" options={{ presentation: "modal", headerShown: true, title: "New communication" }} />
        <Stack.Screen name="tasks/new" options={{ presentation: "modal", headerShown: true, title: "New task" }} />
        <Stack.Screen name="transactions/new" options={{ presentation: "modal", headerShown: true, title: "New transaction" }} />
        <Stack.Screen name="transactions/receive" options={{ presentation: "modal", headerShown: true, title: "Edit payment" }} />
        <Stack.Screen name="transactions/[id]" options={{ headerShown: true, title: "Payment details" }} />
        <Stack.Screen name="network/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="posts/new" options={{ presentation: "modal", headerShown: true, title: "New post" }} />
        <Stack.Screen name="posts/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="messages/[id]" options={{ headerShown: true, title: "Chat" }} />
        <Stack.Screen name="reports/new" options={{ presentation: "modal", headerShown: true, title: "Report" }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications" }} />
        <Stack.Screen name="basic-info" options={{ headerShown: true, title: "Basic information" }} />
        <Stack.Screen name="change-password" options={{ headerShown: true, title: "Change password" }} />
        <Stack.Screen name="manage-profile" options={{ headerShown: true, title: "Manage profile" }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: "Settings" }} />
        <Stack.Screen name="admin" options={{ headerShown: true, title: "Admin" }} />
        <Stack.Screen name="language" options={{ headerShown: true, title: "Language" }} />
        <Stack.Screen name="app-lock" options={{ headerShown: true, title: "App lock" }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: "About LexxBridge" }} />
        <Stack.Screen name="faq" options={{ headerShown: true, title: "FAQ" }} />
        <Stack.Screen name="help-support" options={{ headerShown: true, title: "Help & support" }} />
        {/* Draws its own header (client + case summary) with a back arrow. */}
        <Stack.Screen name="ledger" />
      </Stack>
    </NotificationsProvider>
  );
}
