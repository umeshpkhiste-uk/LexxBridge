import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ensureKeyPair, KeyBackupRow, restoreKeyPairFromBackup } from "@/features/messaging/encryption";
import { confirmAlert } from "@/shared/lib/alert";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

type Props = {
  userId: string;
  backup: KeyBackupRow;
  onDone: () => void;
};

/**
 * Shown once at startup when this device has no local messaging key but the
 * account has a passphrase-protected backup — restoring it recovers every
 * past message instead of this device silently starting a fresh, empty key
 * (which would strand them). Mirrors AppLockScreen's role as a full-screen
 * gate rendered in place of the app in _layout.tsx.
 */
export function MessageRestoreScreen({ userId, backup, onDone }: Props) {
  const { colors, spacing, typography } = useTheme();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await restoreKeyPairFromBackup(userId, passphrase, backup);
      if (ok) onDone();
      else setError("That passphrase doesn't match. Try again.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    confirmAlert(
      "Start fresh instead?",
      "Without the right passphrase, messages sent before this device's last reinstall can't be recovered. You can try again later from Settings → Security → Message backup.",
      [
        { text: "Keep trying", style: "cancel" },
        {
          text: "Start fresh",
          style: "destructive",
          onPress: () => {
            ensureKeyPair().catch(() => {});
            onDone();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.flow, { backgroundColor: colors.background, padding: spacing.lg }]}>
      <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
        <Ionicons name="key-outline" size={40} color={colors.brand} />
        <Text style={[typography.title, { color: colors.textPrimary, textAlign: "center", marginTop: spacing.sm }]}>Restore your messages</Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>
          Enter the message backup passphrase for this account to bring back your past conversations on this device.
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <TextField
          label="Backup passphrase"
          value={passphrase}
          onChangeText={(value) => {
            setPassphrase(value);
            setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          error={error ?? undefined}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button label="Restore" onPress={submit} loading={busy} disabled={!passphrase} />
        <Button label="Skip" variant="ghost" onPress={skip} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { flex: 1 },
});
