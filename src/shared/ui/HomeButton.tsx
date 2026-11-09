import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { useGuardedPress } from "@/shared/lib/useGuardedPress";
import { useTheme } from "./theme";

/** Header shortcut back to the Home tab. */
export function HomeButton({ color, size = 24 }: { color?: string; size?: number }) {
  const { colors } = useTheme();
  const onPress = useGuardedPress(() => router.navigate("/(app)/(tabs)"));
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go to Home">
      <Ionicons name="home-outline" size={size} color={color ?? colors.textPrimary} />
    </Pressable>
  );
}
