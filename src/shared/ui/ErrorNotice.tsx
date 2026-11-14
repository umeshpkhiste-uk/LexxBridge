import { Ionicons } from "@expo/vector-icons";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { useTheme } from "@/shared/ui/theme";

/** A friendly, non-technical "something went wrong" line with a warning
 * icon — the only way an error should ever be shown inline in the UI. Pass
 * it the result of friendlyErrorMessage(err), never err.message directly. */
export function ErrorNotice({ message, style }: { message: string; style?: StyleProp<ViewStyle> }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.md }, style]}>
      <Ionicons name="warning-outline" size={18} color={colors.warning} />
      <Text style={{ color: colors.textPrimary, flex: 1 }}>{message}</Text>
    </View>
  );
}
