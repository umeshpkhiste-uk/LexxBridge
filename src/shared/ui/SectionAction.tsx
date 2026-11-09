import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";
import { useGuardedPress } from "@/shared/lib/useGuardedPress";
import { useTheme } from "./theme";

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
};

/** Compact brand pill for the action beside a section heading ("+ New case"). */
export function SectionAction({ label, onPress, icon = "add" }: Props) {
  const { colors, radius, typography } = useTheme();
  const guardedOnPress = useGuardedPress(onPress);
  return (
    <Pressable
      onPress={guardedOnPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 8,
        paddingLeft: 12,
        paddingRight: 16,
        borderRadius: radius.pill,
        backgroundColor: colors.brand,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={colors.textInverse} />
      <Text style={[typography.label, { color: colors.textInverse, fontWeight: "700" }]}>{label}</Text>
    </Pressable>
  );
}
