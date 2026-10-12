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

/** Navy "brief" card for a case: number, title, parties, court/priority/type
 * pills, and the next hearing as a badge underneath. */
export function CaseBriefCard({ caseItem, onPress, onEdit, onHearingChanged }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const [hearingSheetOpen, setHearingSheetOpen] = useState(false);
  const hasUpcoming = !!caseItem.next_hearing_at && new Date(caseItem.next_hearing_at) >= new Date(new Date().setHours(0, 0, 0, 0));
  const priorityColor = caseItem.priority === "high" ? colors.danger : caseItem.priority === "medium" ? colors.warning : colors.success;
  const pillBg = { backgroundColor: "rgba(255,255,255,0.15)" };

  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.md, opacity: pressed ? 0.95 : 1 },
        ]}
      >
        <View style={[styles.rowBetween, { justifyContent: "flex-end" }]}>
          <Pressable onPress={onEdit} hitSlop={10} style={styles.inlineRow} accessibilityLabel={`Edit ${caseItem.title}`}>
            <Ionicons name="create-outline" size={18} color="#FFFFFF" />
            <Text style={[typography.label, { color: "#FFFFFF" }]}>Edit</Text>
          </Pressable>
        </View>

        <Text style={[typography.title, { color: "#FFFFFF", marginTop: spacing.sm }]} numberOfLines={2}>
          {caseItem.title}
        </Text>

        <View style={[styles.rowWrap, { marginTop: spacing.md }]}>
          {caseItem.court ? (
            <View style={[styles.pill, pillBg]}>
              <Ionicons name="business-outline" size={12} color="#FFFFFF" />
              <Text style={[styles.pillText, { color: "#FFFFFF" }]}>{caseItem.court.toUpperCase()}</Text>
            </View>
          ) : null}
          <View style={[styles.pill, pillBg]}>
            <View style={[styles.dot, { backgroundColor: priorityColor }]} />
            <Text style={[styles.pillText, { color: "#FFFFFF" }]}>{caseItem.priority.toUpperCase()} PRIORITY</Text>
          </View>
          {caseItem.case_type ? (
            <View style={[styles.pill, pillBg]}>
              <Text style={[styles.pillText, { color: "#FFFFFF" }]}>{caseItem.case_type.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.divided, { marginTop: spacing.md, paddingTop: spacing.sm }]}>
          <Pressable
            onPress={() => setHearingSheetOpen(true)}
            hitSlop={6}
            style={[styles.pill, { backgroundColor: hasUpcoming ? "#FFDEA5" : "rgba(255,255,255,0.15)" }]}
            accessibilityLabel={hasUpcoming ? `Next hearing ${formatHearingDate(caseItem.next_hearing_at!)}, change` : "Schedule hearing"}
          >
            <Ionicons name="calendar-outline" size={12} color={hasUpcoming ? colors.brand : "#FFFFFF"} />
            <Text style={[styles.pillText, { color: hasUpcoming ? colors.brand : "#FFFFFF" }]}>
              {hasUpcoming ? `NEXT: ${formatHearingDate(caseItem.next_hearing_at!).toUpperCase()}` : "SCHEDULE HEARING"}
            </Text>
            <Ionicons name="create-outline" size={12} color={hasUpcoming ? colors.brand : "#FFFFFF"} />
          </Pressable>
        </View>
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
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  divided: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
});
