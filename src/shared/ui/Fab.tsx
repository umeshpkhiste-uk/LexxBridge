import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { useGuardedPress } from "@/shared/lib/useGuardedPress";
import { useTheme } from "./theme";

export function Fab({ onPress, icon = "add" }: { onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, spacing } = useTheme();
  const guardedOnPress = useGuardedPress(onPress);

  return (
    <Pressable
      onPress={guardedOnPress}
      style={({ pressed }) => [
        styles.fab,
        {
          right: spacing.lg,
          bottom: spacing.lg,
          backgroundColor: colors.brand,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={26} color={colors.textInverse} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
