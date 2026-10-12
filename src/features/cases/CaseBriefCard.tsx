import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { NextHearingSheet } from "@/features/hearings/NextHearingSheet";
import { formatHearingDate } from "@/shared/lib/format";
import { useTheme } from "@/shared/ui/theme";
import { CaseSummary } from "./api";

type Props = {
  caseItem: CaseSummary;
  onPress: () => void;
  onEdit: () => void;
  /** Called after the next hearing date is changed from the card. */
  onHearingChanged?: () => void;
};

/** Navy "brief" card for a case: a muted case type/court overline, the
 * title, priority as a single dot + label, and the next hearing as a
 * list-style row underneath. */
export function CaseBriefCard({ caseItem, onPress, onEdit, onHearingChanged }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const [hearingSheetOpen, setHearingSheetOpen] = useState(false);
  const hasUpcoming = !!caseItem.next_hearing_at && new Date(caseItem.next_hearing_at) >= new Date(new Date().setHours(0, 0, 0, 0));
  const priorityColor = caseItem.priority === "high" ? colors.danger : caseItem.priority === "medium" ? colors.warning : colors.success;
  const overline = [caseItem.case_type, caseItem.court].filter(Boolean).join("  ·  ");

  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.md, opacity: pressed ? 0.95 : 1 },
        ]}
      >
        <View style={styles.rowBetween}>
          {overline ? (
            <Text style={[typography.label, styles.overline, { color: colors.accent, flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>
              {overline.toUpperCase()}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable onPress={onEdit} hitSlop={10} style={styles.editButton} accessibilityLabel={`Edit ${caseItem.title}`}>
            <Ionicons name="pencil" size={14} color="#FFFFFF" />
          </Pressable>
        </View>

        <Text style={[typography.title, { color: "#FFFFFF", marginTop: spacing.xs }]} numberOfLines={2}>
          {caseItem.title}
        </Text>

        <View style={[styles.inlineRow, { marginTop: spacing.sm }]}>
          <View style={[styles.dot, { backgroundColor: priorityColor }]} />
          <Text style={[typography.body, { color: "rgba(255,255,255,0.72)" }]}>
            {caseItem.priority.charAt(0).toUpperCase() + caseItem.priority.slice(1)} priority
          </Text>
        </View>

        <View style={[styles.divider, { marginTop: spacing.md }]} />

        <Pressable
          onPress={() => setHearingSheetOpen(true)}
          hitSlop={6}
          style={styles.hearingRow}
          accessibilityLabel={hasUpcoming ? `Next hearing ${formatHearingDate(caseItem.next_hearing_at!)}, change` : "Schedule hearing"}
        >
          <View style={[styles.hearingIcon, { borderRadius: radius.sm }, hasUpcoming ? styles.hearingIconFilled : styles.hearingIconOutline]}>
            <Ionicons name={hasUpcoming ? "calendar-outline" : "add"} size={16} color={hasUpcoming ? "#FFFFFF" : "rgba(255,255,255,0.75)"} />
          </View>
          {hasUpcoming ? (
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: "rgba(255,255,255,0.6)" }]}>Next hearing</Text>
              <Text style={[typography.bodyStrong, { color: "#FFFFFF" }]} numberOfLines={1}>
                {formatHearingDate(caseItem.next_hearing_at!)}
              </Text>
            </View>
          ) : (
            <Text style={[typography.bodyStrong, { color: "rgba(255,255,255,0.85)", flex: 1 }]}>Schedule hearing</Text>
          )}
          {hasUpcoming ? <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" /> : null}
        </Pressable>
      </Pressable>

      {hearingSheetOpen ? (
        <NextHearingSheet
          caseId={caseItem.id}
          caseTitle={caseItem.title}
          current={hasUpcoming ? caseItem.next_hearing_at : null}
          onClose={() => setHearingSheetOpen(false)}
          onSaved={() => onHearingChanged?.()}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  overline: { letterSpacing: 0.4 },
  editButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.14)" },
  hearingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  hearingIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  hearingIconFilled: { backgroundColor: "rgba(255,255,255,0.1)" },
  hearingIconOutline: { borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", borderStyle: "dashed" },
});
