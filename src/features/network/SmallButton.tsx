import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "@/shared/ui/theme";

/** Compact icon+label pill used for secondary actions across the Network
 * tab's segments (e.g. "Find colleagues", "Start chat", "Create a community"). */
export function SmallButton({
  icon,
  label,
  onPress,
  filled,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  filled?: boolean;
  /** Required when label is empty (icon-only), since there's no text for screen readers to fall back on. */
  accessibilityLabel?: string;
}) {
  const { colors, radius, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.smallButton,
        { borderRadius: radius.sm, backgroundColor: filled ? colors.brand : colors.surfaceAlt, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={16} color={filled ? colors.textInverse : colors.brand} />
      {label ? <Text style={[typography.label, { color: filled ? colors.textInverse : colors.brand }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  smallButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 34 },
});
