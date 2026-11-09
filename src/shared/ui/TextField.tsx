import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, type TextInputInstance } from "react-native";
import { useTheme } from "./theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, style, secureTextEntry, multiline, ...inputProps },
  ref
) {
  const { colors, radius, spacing, typography } = useTheme();
  const [isRevealed, setIsRevealed] = useState(false);
  const canToggleVisibility = secureTextEntry !== undefined;

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
          {label}
        </Text>
      ) : null}
      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={canToggleVisibility ? secureTextEntry && !isRevealed : secureTextEntry}
          multiline={multiline}
          scrollEnabled={multiline ? false : undefined}
          style={[
            // Multi-line fields grow with their text; a fixed height here
            // fights the native text view and leaves the box uneditable.
            multiline ? [styles.multiline, { paddingVertical: spacing.sm + 4 }] : styles.input,
            typography.body,
            {
              color: colors.textPrimary,
              backgroundColor: colors.surface,
              borderColor: error ? colors.danger : colors.border,
              borderRadius: radius.lg,
              paddingHorizontal: spacing.md,
              paddingRight: canToggleVisibility ? spacing.xl + spacing.md : spacing.md,
            },
            style,
          ]}
          {...inputProps}
        />
        {canToggleVisibility ? (
          <Pressable
            onPress={() => setIsRevealed((v) => !v)}
            hitSlop={8}
            style={{ position: "absolute", right: spacing.md }}
          >
            <Ionicons name={isRevealed ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    height: 52,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
