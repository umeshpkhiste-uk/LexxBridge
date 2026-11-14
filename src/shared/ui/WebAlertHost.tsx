import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertButton, PendingAlert, registerWebAlertListener } from "@/shared/lib/alert";
import { AppModal } from "./AppModal";
import { useTheme } from "./theme";

/** Renders confirmAlert()'s dialogs on web, where Alert.alert is a no-op.
 * Mount once near the app root. Renders nothing on native, where the real
 * Alert.alert already works. */
export function WebAlertHost() {
  const [pending, setPending] = useState<PendingAlert | null>(null);
  const { colors, spacing, radius, typography } = useTheme();

  useEffect(() => {
    if (Platform.OS !== "web") return;
    registerWebAlertListener(setPending);
    return () => registerWebAlertListener(null);
  }, []);

  if (Platform.OS !== "web" || !pending) return null;

  const close = (button?: AlertButton) => {
    setPending(null);
    button?.onPress?.();
  };

  // Two buttons (the common Cancel/Confirm shape) sit side by side, like a
  // native alert; three or more (a choice picker such as Theme) stack as a
  // list instead — a row would get too cramped.
  const sideBySide = pending.buttons.length === 2;

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={() => close()}>
      <Pressable style={styles.backdrop} onPress={() => close()}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
            <Text style={[typography.bodyStrong, { color: colors.textPrimary, fontSize: 17, textAlign: "center" }]}>{pending.title}</Text>
            {pending.message ? (
              <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }]}>
                {pending.message}
              </Text>
            ) : null}
          </View>

          <View style={[styles.buttonRow, { borderTopColor: colors.border, flexDirection: sideBySide ? "row" : "column" }]}>
            {pending.buttons.map((button, i) => (
              <Pressable
                key={i}
                onPress={() => close(button)}
                style={({ pressed }) => [
                  styles.button,
                  sideBySide
                    ? { flex: 1, borderLeftWidth: i ? StyleSheet.hairlineWidth : 0, borderLeftColor: colors.border }
                    : { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border },
                  { backgroundColor: pressed ? colors.surfaceAlt : "transparent" },
                ]}
              >
                <Text
                  style={[
                    typography.body,
                    {
                      textAlign: "center",
                      fontWeight: button.style === "cancel" ? "400" : "600",
                      color: button.style === "destructive" ? colors.danger : colors.brand,
                    },
                  ]}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.4)", padding: 24 },
  card: { width: "100%", maxWidth: 340, overflow: "hidden" },
  buttonRow: { borderTopWidth: StyleSheet.hairlineWidth },
  button: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
});
