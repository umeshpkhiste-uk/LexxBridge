import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "./theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  /** Fully rounded ends instead of the standard corner radius — used for
   * primary CTAs on the auth screens; left off elsewhere so every other
   * button in the app keeps its existing look. */
  pill?: boolean;
};

export function Button({ label, onPress, variant = "primary", loading, disabled, pill }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor =
    variant === "primary"
      ? colors.brand
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? colors.surface
          : "transparent";
  const borderColor = variant === "secondary" ? colors.border : "transparent";
  const textColor = variant === "primary" || variant === "danger" ? colors.textInverse : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth * 2 : 0,
          borderRadius: pill ? radius.pill : radius.md,
          paddingVertical: spacing.md,
          opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[typography.bodyStrong, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
});
