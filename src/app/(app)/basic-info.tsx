import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { getNetworkStats } from "@/features/network/api";
import { AdvocateProfile, completeOnboarding, countMyCases, getMyProfile } from "@/features/profile/api";
import { ProfileDocket } from "@/features/profile/ProfileDocket";
import { ProfileEditForm } from "@/features/profile/ProfileEditForm";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { ErrorNotice } from "@/shared/ui/ErrorNotice";
import { useTheme } from "@/shared/ui/theme";

/**
 * Profile > Basic Information: the advocate's profile docket. Read-only by
 * default; "Edit" turns the page into a form. With ?onboarding=1 (first login after email verification)
 * it opens straight into the form with Save & continue / Skip for now.
 */
export default function BasicInfoScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = onboarding === "1";
  const { colors, spacing, radius, typography } = useTheme();
  const { session } = useAuth();
  const email = session?.user.email ?? null;

  const [profile, setProfile] = useState<AdvocateProfile | null>(null);
  const [caseCount, setCaseCount] = useState<number | null>(null);
  const [connectionsCount, setConnectionsCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(isOnboarding);

  const load = useCallback(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        getNetworkStats(p.id)
          .then((s) => setConnectionsCount(s.connections_count))
          .catch(() => {});
      })
      .catch((err) => setError(friendlyErrorMessage(err)));
    countMyCases().then(setCaseCount).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const finishOnboarding = () => router.replace("/(app)/(tabs)");

  const skipOnboarding = async () => {
    await completeOnboarding().catch(() => {});
    finishOnboarding();
  };

  const screenOptions = isOnboarding
    ? { title: "Set up your profile", headerLeft: () => null, gestureEnabled: false }
    : { title: "Basic information" };

  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg }}>
        <Stack.Screen options={screenOptions} />
        {error ? <ErrorNotice message={error} /> : <ActivityIndicator color={colors.brand} />}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={screenOptions} />

      {isOnboarding ? (
        <View style={{ backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", gap: spacing.md }}>
          <Ionicons name="sparkles-outline" size={24} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.subtitle, { color: "#FFFFFF" }]}>Welcome to LexxBridge</Text>
            <Text style={[typography.caption, { color: "rgba(255,255,255,0.8)", marginTop: 2 }]}>
              Set up your profile docket so colleagues can find you. You can change any of this later from Profile → Basic information.
            </Text>
          </View>
        </View>
      ) : null}

      {isEditing ? (
        <ProfileEditForm
          profile={profile}
          email={email}
          submitLabel={isOnboarding ? "Save & continue" : "Save changes"}
          secondaryLabel={isOnboarding ? "Skip for now" : "Cancel"}
          extraOnSave={isOnboarding ? { onboarding_completed_at: new Date().toISOString() } : undefined}
          onSaved={(updated) => {
            if (isOnboarding) return finishOnboarding();
            setProfile(updated);
            setIsEditing(false);
          }}
          onSecondary={isOnboarding ? skipOnboarding : () => setIsEditing(false)}
        />
      ) : (
        <ProfileDocket
          profile={profile}
          email={email}
          audience="private"
          caseCount={caseCount}
          connectionsCount={connectionsCount}
          onEdit={() => setIsEditing(true)}
        />
      )}
    </ScrollView>
  );
}
