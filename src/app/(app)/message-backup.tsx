import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { backupKeyPair, deleteKeyBackup, fetchKeyBackup } from "@/features/messaging/encryption";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { Button } from "@/shared/ui/Button";
import { SettingsGroup, SettingsRow } from "@/shared/ui/SettingsGroup";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

type Step = { kind: "menu" } | { kind: "set" };

const MIN_LENGTH = 8;

/** Settings → Message backup: set up, change or turn off the passphrase
 * that protects a backup of this device's messaging key, so a reinstall or
 * new device can recover past messages instead of starting a fresh,
 * unrelated key. */
export default function MessageBackupScreen() {
  const { colors, spacing, typography } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [hasBackup, setHasBackup] = useState<boolean | undefined>(undefined);
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchKeyBackup(userId).then((backup) => setHasBackup(!!backup));
  }, [userId]);

  const go = (next: Step) => {
    setStep(next);
    setPassphrase("");
    setConfirmPassphrase("");
    setError(null);
  };

  const submit = async () => {
    if (!userId) return;
    if (passphrase.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (passphrase !== confirmPassphrase) return setError("Those don't match.");
    setBusy(true);
    try {
      await backupKeyPair(userId, passphrase);
      setHasBackup(true);
      go({ kind: "menu" });
      alertMessage("Backup saved", "Enter this passphrase on any new device or after reinstalling to recover your past messages.");
    } catch {
      setError("Couldn't save the backup. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    if (!userId) return;
    confirmAlert(
      "Turn off message backup?",
      "If you reinstall the app or sign in on a new device after this, past messages on this device can't be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Turn off",
          style: "destructive",
          onPress: async () => {
            await deleteKeyBackup(userId);
            setHasBackup(false);
          },
        },
      ],
    );
  };

  if (hasBackup === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (step.kind === "menu") {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
          <Ionicons name={hasBackup ? "shield-checkmark" : "shield-outline"} size={40} color={colors.brand} />
          <Text style={[typography.subtitle, { color: colors.textPrimary, marginTop: spacing.sm }]}>
            {hasBackup ? "Message backup is on" : "Message backup is off"}
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center", marginTop: 4 }]}>
            Messages are end-to-end encrypted with a key generated on this device. Without a backup, reinstalling the app or signing in on a new
            device permanently loses access to past messages. A backup lets you recover them with a passphrase only you know — it’s never
            sent anywhere.
          </Text>
        </View>

        <SettingsGroup>
          <SettingsRow
            icon="key-outline"
            label={hasBackup ? "Change passphrase" : "Set up a passphrase"}
            onPress={() => go({ kind: "set" })}
          />
        </SettingsGroup>

        {hasBackup ? (
          <SettingsGroup>
            <SettingsRow icon="shield-outline" label="Turn off message backup" onPress={turnOff} destructive showChevron={false} />
          </SettingsGroup>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.flow, { backgroundColor: colors.background, padding: spacing.lg }]}>
      <View style={{ alignItems: "center" }}>
        <Text style={[typography.title, { color: colors.textPrimary, textAlign: "center" }]}>Choose a backup passphrase</Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>
          Remember this — there’s no way to reset it if forgotten.
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <TextField
          label="Passphrase"
          value={passphrase}
          onChangeText={(value) => {
            setPassphrase(value);
            setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Confirm passphrase"
          value={confirmPassphrase}
          onChangeText={(value) => {
            setConfirmPassphrase(value);
            setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          error={error ?? undefined}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button label="Save backup" onPress={submit} loading={busy} disabled={!passphrase || !confirmPassphrase} />
        <Button label="Cancel" variant="ghost" onPress={() => go({ kind: "menu" })} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  flow: { flex: 1 },
});
