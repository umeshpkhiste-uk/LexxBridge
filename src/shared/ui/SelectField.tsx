import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppModal } from "./AppModal";
import { useTheme } from "./theme";

export type SelectOption<T extends string> = { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap };

type Props<T extends string> = {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Adds a search box to the sheet (for long lists). */
  searchable?: boolean;
  /** Lets the user pick what they typed when it isn't in the list. */
  allowCustom?: boolean;
  /** Keyboard for the search box, e.g. "number-pad" for PIN codes. */
  searchKeyboard?: "default" | "number-pad";
  disabled?: boolean;
  /** Shown instead of the options while they load. */
  loading?: boolean;
  /** Text under the field when there's nothing to choose yet, etc. */
  hint?: string;
  error?: string | null;
};

/** Dropdown field: looks like the app's text/date fields and opens a bottom
 * sheet of options with a check beside the current one. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
  icon,
  searchable,
  allowCustom,
  searchKeyboard = "default",
  disabled,
  loading,
  hint,
  error,
}: Props<T>) {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // A saved value that isn't in the list (e.g. a typed-in town) still shows.
  const selected = options.find((o) => o.value === value) ?? (value ? { value, label: value } : null);
  const needle = query.trim().toLowerCase();
  const visible = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const canUseTyped = allowCustom && !!query.trim() && !options.some((o) => o.label.toLowerCase() === needle);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityLabel={`${label}: ${selected?.label ?? "not selected"}`}
        style={[
          styles.field,
          {
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.lg,
            backgroundColor: disabled ? colors.surfaceAlt : colors.surface,
            paddingHorizontal: spacing.md,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        {selected?.icon || icon ? <Ionicons name={selected?.icon ?? icon!} size={20} color={colors.brand} /> : null}
        <Text style={[typography.body, { flex: 1, color: selected ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: 4 }]}>{error}</Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>{hint}</Text>
      ) : null}

      <AppModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
            <Pressable
              style={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.lg,
                borderTopRightRadius: radius.lg,
                paddingBottom: insets.bottom + spacing.sm,
                maxHeight: "70%",
              }}
            >
              <View style={[styles.sheetHeader, { borderBottomColor: colors.border, padding: spacing.md }]}>
                <Text style={[typography.subtitle, { color: colors.textPrimary }]}>{label}</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>
              {searchable ? (
                <View
                  style={[
                    styles.search,
                    { borderColor: colors.border, backgroundColor: colors.background, margin: spacing.md, marginBottom: spacing.sm },
                  ]}
                >
                  <Ionicons name="search" size={18} color={colors.textSecondary} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={allowCustom ? "Search or type" : "Search"}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType={searchKeyboard}
                    autoCorrect={false}
                    style={[typography.body, { flex: 1, color: colors.textPrimary, paddingVertical: 10 }]}
                  />
                </View>
              ) : null}
              <ScrollView keyboardShouldPersistTaps="handled">
                {loading ? <ActivityIndicator color={colors.brand} style={{ margin: spacing.lg }} /> : null}
                {canUseTyped ? (
                  <Pressable
                    onPress={() => choose(query.trim() as T)}
                    style={({ pressed }) => [
                      styles.option,
                      { paddingHorizontal: spacing.md, backgroundColor: pressed ? colors.surfaceAlt : "transparent" },
                    ]}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
                    <Text style={[typography.body, { flex: 1, color: colors.brand }]}>Use “{query.trim()}”</Text>
                  </Pressable>
                ) : null}
                {!loading && visible.length === 0 && !canUseTyped ? (
                  <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", padding: spacing.lg }]}>
                    No matches
                  </Text>
                ) : null}
                {visible.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => choose(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      style={({ pressed }) => [
                        styles.option,
                        { paddingHorizontal: spacing.md, backgroundColor: pressed || isSelected ? colors.surfaceAlt : "transparent" },
                      ]}
                    >
                      {option.icon ? <Ionicons name={option.icon} size={20} color={colors.textSecondary} /> : null}
                      <Text style={[typography.body, { flex: 1, color: colors.textPrimary, fontWeight: isSelected ? "600" : "400" }]}>
                        {option.label}
                      </Text>
                      {isSelected ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, borderWidth: StyleSheet.hairlineWidth * 2 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.4)" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
