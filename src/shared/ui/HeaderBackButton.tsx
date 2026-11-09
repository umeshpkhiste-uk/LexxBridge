import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { useGuardedPress } from "@/shared/lib/useGuardedPress";
import { useTheme } from "./theme";

/**
 * Back arrow for stack headers. Modal screens get no native back button on
 * iOS, and a screen opened directly (e.g. from a deep link) has nothing to
 * go back to — in that case this falls back to the home screen.
 */
export function HeaderBackButton() {
  const { colors } = useTheme();
  const onPress = useGuardedPress(() => (router.canGoBack() ? router.back() : router.replace("/")));
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={{ paddingRight: 8 }}
    >
      <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
    </Pressable>
  );
}
