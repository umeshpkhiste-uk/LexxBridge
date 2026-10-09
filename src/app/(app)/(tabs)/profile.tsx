import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Image, ImageBackground, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { signOutKeepingBiometric } from "@/features/biometric/biometric";
import { syncCalendarReminders } from "@/features/notifications/device";
import { OnlineDot } from "@/features/presence/OnlineDot";
import { AdvocateProfile, getMyProfile, updateMyProfile } from "@/features/profile/api";
import { nameForLanguageCode } from "@/shared/i18n/languages";
import { SettingsGroup, SettingsRow } from "@/shared/ui/SettingsGroup";
import { HomeButton } from "@/shared/ui/HomeButton";
import { confirmDeleteAccount } from "@/features/account/confirmDeleteAccount";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { useTheme } from "@/shared/ui/theme";

const verificationLabel: Record<AdvocateProfile["verification_status"], string> = {
  unverified: "Not verified",
  pending: "Verification pending",
  verified: "Verified advocate",
  rejected: "Verification rejected",
  expired: "Verification expired",
};

type Visibility = AdvocateProfile["profile_visibility"];

const visibilityLabel: Record<Visibility, string> = {
  public: "Public",
  connections_only: "Connections only",
  private: "Private",
};

const comingSoon = (what: string) => () => alertMessage("Coming soon", `${what} arrive in a later phase.`);

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [profile, setProfile] = useState<AdvocateProfile | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const userId = session?.user.id;
  const email = session?.user.email;

  // Reload on focus so changes made on the edit screens show up on return.
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      getMyProfile()
        .then((profile) => {
          if (!isMounted) return;
          setProfile(profile);
          setNotificationsOn(profile.notifications_enabled !== false);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
      return () => {
        isMounted = false;
      };
    }, []),
  );

  const handleNotificationsToggle = async (enabled: boolean) => {
    setNotificationsOn(enabled);
    try {
      await updateMyProfile({ notifications_enabled: enabled });
      // Turn calendar reminders on this phone on / off straight away.
      await syncCalendarReminders(enabled).catch(() => {});
    } catch (err) {
      setNotificationsOn(!enabled);
      alertMessage("Couldn't update notifications", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleLogout = () => {
    confirmAlert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          const { error } = await signOutKeepingBiometric();
          if (error) alertMessage("Couldn't log out", error);
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const heroContent = (
    <View style={[styles.hero, { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl + spacing.md }]}>
      <View style={[styles.heroActions, { paddingHorizontal: spacing.lg }]}>
        <HomeButton color="#FFFFFF" />
      </View>

      <View>
        {profile?.profile_photo_url ? (
          <Image source={{ uri: profile.profile_photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.brandPressed }]}>
            <Ionicons name="person" size={40} color="#FFFFFF" />
          </View>
        )}
        <OnlineDot userId={userId} avatarSize={96} inset={6} />
      </View>

      <Text style={[typography.title, styles.heroText, { marginTop: spacing.md }]}>{profile?.full_name}</Text>
      <Text style={[typography.body, styles.heroText, { opacity: 0.9, marginTop: spacing.xs, paddingHorizontal: spacing.xl }]}>
        {profile?.headline || email}
      </Text>
      {profile?.verification_status === "verified" ? (
        <View style={[styles.verifiedPill, { borderRadius: radius.pill, marginTop: spacing.sm }]}>
          <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
          <Text style={[typography.caption, styles.heroText]}>Verified advocate</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {profile?.profile_photo_url ? (
        <ImageBackground source={{ uri: profile.profile_photo_url }} blurRadius={25}>
          <View style={styles.heroOverlay}>{heroContent}</View>
        </ImageBackground>
      ) : (
        <View style={{ backgroundColor: colors.brand }}>{heroContent}</View>
      )}

      <View style={{ paddingHorizontal: spacing.md, marginTop: -spacing.xl, gap: spacing.lg }}>
        <SettingsGroup>
          <SettingsRow
            icon="id-card-outline"
            label="Basic information"
            subtitle="Profile docket, practice, credentials, contact"
            onPress={() => router.push("/(app)/basic-info")}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Verification"
            subtitle={profile ? verificationLabel[profile.verification_status] : undefined}
            onPress={comingSoon("The verification workflow and bar registration details")}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="card-outline"
            label="Plan & Subscription"
            subtitle="Free plan"
            onPress={comingSoon("Paid plans and subscription management")}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.account")}>
          <SettingsRow
            icon="eye-outline"
            label={t("settings.manageProfile")}
            subtitle={profile ? visibilityLabel[profile.profile_visibility] : undefined}
            onPress={() => router.push("/(app)/manage-profile")}
          />
          <SettingsRow icon="key-outline" label={t("settings.changePassword")} onPress={() => router.push("/(app)/change-password")} />
          <SettingsRow
            icon="notifications-outline"
            label={t("settings.notifications")}
            subtitle={notificationsOn ? t("settings.notificationsOn") : t("settings.notificationsOff")}
            toggle={{ value: notificationsOn, onChange: handleNotificationsToggle }}
          />
          <SettingsRow
            icon="language-outline"
            label={t("settings.language")}
            subtitle={nameForLanguageCode(i18n.language)}
            onPress={() => router.push("/(app)/language")}
          />
        </SettingsGroup>

        <SettingsGroup title="Legal">
          <SettingsRow icon="document-text-outline" label="Privacy Policy" onPress={() => router.push("/legal/privacy")} />
          <SettingsRow icon="reader-outline" label="Terms of Service" onPress={() => router.push("/legal/terms")} />
          <SettingsRow icon="trash-outline" label="Delete account & data" onPress={() => router.push("/legal/delete-account")} />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <SettingsRow icon="help-circle-outline" label="FAQ" onPress={() => router.push("/(app)/faq")} />
          <SettingsRow icon="information-circle-outline" label="About app" onPress={() => router.push("/(app)/about")} />
          <SettingsRow icon="chatbubble-ellipses-outline" label="Help & support" onPress={() => router.push("/(app)/help-support")} />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="settings-outline"
            label="Settings"
            subtitle="Theme, Face ID, app lock, data export"
            onPress={() => router.push("/(app)/settings")}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow icon="log-out-outline" label="Log out" onPress={handleLogout} destructive showChevron={false} />
          <SettingsRow
            icon="trash-outline"
            label={isDeleting ? "Deleting account…" : "Delete account"}
            subtitle="Permanently erase your account and all data"
            onPress={isDeleting ? undefined : () => confirmDeleteAccount(setIsDeleting)}
            destructive
            showChevron={false}
          />
        </SettingsGroup>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center" },
  heroOverlay: { backgroundColor: "rgba(15, 23, 42, 0.45)" },
  heroActions: { alignSelf: "stretch", flexDirection: "row", justifyContent: "flex-end", gap: 20 },
  unreadDot: { position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: 4 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  heroText: { color: "#FFFFFF", textAlign: "center" },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
});
