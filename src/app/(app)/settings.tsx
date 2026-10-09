import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Share } from "react-native";
import { exportMyData } from "@/features/account/api";
import { isCurrentUserAdmin } from "@/features/admin/api";
import { getAppLockMethod } from "@/features/applock/appLock";
import { LockMethod } from "@/features/applock/rules";
import { useAuth } from "@/features/auth/AuthProvider";
import { authenticateBiometric, disableBiometric, enableBiometric, getBiometricSupport, isBiometricEnabledFor } from "@/features/biometric/biometric";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { SettingsGroup, SettingsRow } from "@/shared/ui/SettingsGroup";
import { useTheme } from "@/shared/ui/theme";
import { getThemePreference, setThemePreference, ThemePreference, themePreferenceLabel } from "@/shared/ui/themePreference";

const comingSoon = (what: string) => () => alertMessage("Coming soon", `${what} arrive in a later phase.`);

/** Device / app-level settings. Account settings (profile visibility,
 * password, notifications, language) live on the Profile tab instead — see
 * profile.tsx's "Account" section. */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { session } = useAuth();
  const email = session?.user.email;
  const userId = session?.user.id ?? null;
  const [isExporting, setIsExporting] = useState(false);
  const [themePref, setThemePref] = useState<ThemePreference>("system");
  const [biometric, setBiometric] = useState({ available: false, label: "Biometrics", enabled: false });
  const [lockMethod, setLockMethod] = useState<LockMethod | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getThemePreference().then(setThemePref).catch(() => {});
    isCurrentUserAdmin().then(setIsAdmin).catch(() => {});
  }, []);

  // Security state can change on the App lock screen, so refresh on return.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      Promise.all([getBiometricSupport(), isBiometricEnabledFor(userId), getAppLockMethod(userId)])
        .then(([support, enabled, method]) => {
          setBiometric({ ...support, enabled });
          setLockMethod(method);
        })
        .catch(() => {});
    }, [userId]),
  );

  const handleThemePress = () => {
    const choose = (pref: ThemePreference) => () => {
      setThemePref(pref);
      setThemePreference(pref);
    };
    confirmAlert("Theme", "Choose how LexxBridge looks.", [
      { text: themePreferenceLabel.system, onPress: choose("system") },
      { text: themePreferenceLabel.light, onPress: choose("light") },
      { text: themePreferenceLabel.dark, onPress: choose("dark") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    if (!userId) return;
    if (!enabled) {
      await disableBiometric();
      setBiometric((b) => ({ ...b, enabled: false }));
      return;
    }
    const support = await getBiometricSupport();
    if (!support.available) {
      alertMessage("Biometrics unavailable", "Set up Face ID, Touch ID or a fingerprint in your device settings first.");
      return;
    }
    if (await authenticateBiometric(`Enable ${support.label} login`)) {
      await enableBiometric(userId, email);
      setBiometric((b) => ({ ...b, enabled: true }));
      alertMessage(`${support.label} enabled`, `Next time you open LexxBridge or log back in, use ${support.label} instead of your password.`);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const data = await exportMyData();
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === "web") {
        // react-native-web has no Share implementation — download the export instead.
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "lexxbridge-data-export.json";
        link.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ title: "LexxBridge data export", message: json });
      }
    } catch (err) {
      alertMessage("Export failed", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <SettingsGroup title={t("settings.preferences")}>
        <SettingsRow icon="color-palette-outline" label={t("settings.theme")} subtitle={themePreferenceLabel[themePref]} onPress={handleThemePress} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.security")}>
        <SettingsRow
          icon="finger-print-outline"
          label={`${biometric.label} login`}
          subtitle={biometric.available ? "Unlock and log in without your password" : "Not set up on this device"}
          toggle={{ value: biometric.enabled, onChange: handleBiometricToggle, disabled: !biometric.available }}
        />
        <SettingsRow
          icon="keypad-outline"
          label={t("settings.appLock")}
          subtitle={lockMethod === "pin" ? t("settings.appLockOnPin") : lockMethod === "pattern" ? t("settings.appLockOnPattern") : t("settings.appLockOff")}
          onPress={() => router.push("/(app)/app-lock")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.yourData")}>
        <SettingsRow
          icon="download-outline"
          label={t("settings.exportData")}
          subtitle={isExporting ? t("settings.exportDataPreparing") : t("settings.exportDataSubtitle")}
          onPress={handleExportData}
        />
        <SettingsRow
          icon="cloud-upload-outline"
          label="Import Data"
          subtitle="Bring in clients, cases and records from a file"
          onPress={comingSoon("Importing data")}
        />
        <SettingsRow
          icon="time-outline"
          label="Backup & Restore"
          subtitle="Save a full backup, or restore from one"
          onPress={comingSoon("Backup and restore")}
        />
      </SettingsGroup>

      {isAdmin ? (
        <SettingsGroup title="Admin">
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Admin panel"
            subtitle="User directory, blocking, reports"
            onPress={() => router.push("/(app)/admin")}
          />
        </SettingsGroup>
      ) : null}
    </ScrollView>
  );
}
