import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Children, Fragment, PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useTheme } from "./theme";

/** White rounded card grouping settings rows, with dividers between them. */
export function SettingsGroup({ title, children }: PropsWithChildren<{ title?: string }>) {
  const { colors, spacing, radius, typography } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View>
      {title ? (
        <Text
          style={[
            typography.label,
            { color: colors.textSecondary, textTransform: "uppercase", marginLeft: spacing.sm, marginBottom: spacing.sm },
          ]}
        >
          {title}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md }]}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  /** When set, renders this photo in a circle instead of `icon` — the
   * user's own uploaded profile photo, when they have one. `icon` is still
   * required as the fallback for rows with no photo. */
  avatarUri?: string | null;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
  /** Renders a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean };
  /** Custom right-hand content; overrides the chevron. */
  right?: ReactNode;
  showChevron?: boolean;
};

export function SettingsRow({ icon, avatarUri, label, subtitle, onPress, destructive, toggle, right, showChevron = true }: RowProps) {
  const { colors, spacing, typography } = useTheme();
  const tint = destructive ? colors.danger : colors.textSecondary;

  const trailing = toggle ? (
    <Switch
      value={toggle.value}
      onValueChange={toggle.onChange}
      disabled={toggle.disabled}
      trackColor={{ true: colors.brand }}
    />
  ) : (
    (right ?? (showChevron && onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null))
  );

  return (
    <Pressable
      onPress={toggle ? () => !toggle.disabled && toggle.onChange(!toggle.value) : onPress}
      disabled={!onPress && !toggle}
      style={({ pressed }) => [styles.row, { paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 }]}
    >
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }} contentFit="cover" />
      ) : (
        <Ionicons name={icon} size={22} color={tint} style={{ width: 36 }} />
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={[
            typography.body,
            { fontSize: 16, fontWeight: "500", color: destructive ? colors.danger : colors.textPrimary },
          ]}
        >
          {label}
        </Text>
        {subtitle ? <Text style={[typography.caption, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 36 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 56 },
});
