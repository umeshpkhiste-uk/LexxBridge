import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./theme";

export type SheetAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Renders the icon and label in the danger color — for irreversible
   * actions like "Delete". */
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
};

/** Bottom sheet of actions — Android's Alert caps out at three buttons. */
export function ActionSheet({ visible, title, actions, onClose }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingBottom: insets.bottom + spacing.sm,
              paddingTop: spacing.sm,
            },
          ]}
        >
          {title ? (
            <Text
              numberOfLines={1}
              style={[typography.label, { color: colors.textSecondary, padding: spacing.md, paddingBottom: spacing.sm }]}
            >
              {title}
            </Text>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [
                styles.action,
                { paddingHorizontal: spacing.md, backgroundColor: pressed ? colors.surfaceAlt : "transparent" },
              ]}
            >
              <Ionicons
                name={action.icon}
                size={22}
                color={action.destructive ? colors.danger : colors.textSecondary}
                style={{ width: 36 }}
              />
              <Text style={[typography.body, { color: action.destructive ? colors.danger : colors.textPrimary, fontSize: 16 }]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
          <View style={{ height: spacing.xs }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.4)" },
  sheet: {},
  action: { flexDirection: "row", alignItems: "center", minHeight: 52 },
});
