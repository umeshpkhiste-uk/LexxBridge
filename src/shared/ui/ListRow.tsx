import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useGuardedPress } from "@/shared/lib/useGuardedPress";
import { useTheme } from "./theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
};

export function ListRow({ icon, label, subtitle, onPress, destructive, showChevron = true }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const labelColor = destructive ? colors.danger : colors.textPrimary;
  const guardedOnPress = useGuardedPress(onPress ?? (() => {}));

  return (
    <Pressable
      onPress={onPress ? guardedOnPress : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginBottom: spacing.sm,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.left}>
        <Ionicons name={icon} size={20} color={labelColor} style={{ marginRight: spacing.md }} />
        <View>
          <Text style={[typography.bodyStrong, { color: labelColor }]}>{label}</Text>
          {subtitle ? (
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth,
  },
  left: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
});
