import { Ionicons } from "@expo/vector-icons";
import { Href, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/shared/ui/theme";
import { AgendaItem } from "./api";
import { isSameDay } from "./MonthCalendar";

const TYPE_META: Record<AgendaItem["type"], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  hearing: { label: "Hearing", icon: "briefcase-outline" },
  meeting: { label: "Meeting", icon: "calendar-outline" },
};

const EDIT_ROUTE: Record<AgendaItem["type"], (id: string) => Href> = {
  hearing: (id) => `/(app)/hearings/new?id=${id}`,
  meeting: (id) => `/(app)/meetings/new?id=${id}`,
};

const ACCENT = "#6C47F5";
const ITEM_ICON = "#3B82F6";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** "Schedule for <day>" under a month calendar: collapsible list of that
 * day's hearings and meetings, with a + to add a meeting. Personal to-dos
 * are deliberately not shown here — that list stays fully independent. */
export function DayAgenda({ selectedDate, items, isLoading }: { selectedDate: Date; items: AgendaItem[]; isLoading?: boolean }) {
  const { colors, spacing, radius, typography } = useTheme();
  const [isOpen, setIsOpen] = useState(true);
  const dayItems = items.filter((item) => isSameDay(new Date(item.at), selectedDate));
  const title = isSameDay(selectedDate, new Date())
    ? "Today's Schedule"
    : `Schedule for ${selectedDate.getDate()} ${selectedDate.toLocaleDateString("en-IN", { month: "short" })}`;

  const onAdd = () => router.push("/(app)/meetings/new");

  return (
    <View>
      <View style={[styles.header, { marginTop: spacing.lg }]}>
        <Pressable onPress={() => setIsOpen((open) => !open)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Text style={[typography.title, { color: colors.textPrimary }]}>{title}</Text>
          <Ionicons name={isOpen ? "chevron-down" : "chevron-forward"} size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={onAdd}
          accessibilityLabel="Add meeting"
          style={({ pressed }) => [styles.addButton, { backgroundColor: ACCENT, borderRadius: radius.md, opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {isOpen ? (
        <View style={{ marginTop: spacing.md }}>
          {isLoading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: spacing.lg }} />
          ) : dayItems.length === 0 ? (
            <View style={[styles.itemRow, { borderTopColor: colors.border, paddingVertical: spacing.lg }]}>
              <Text style={[typography.body, { color: colors.textSecondary }]}>Nothing scheduled for this day.</Text>
            </View>
          ) : (
            dayItems.map((item) => {
              const meta = TYPE_META[item.type];
              return (
                <Pressable
                  key={`${item.type}-${item.id}`}
                  onPress={() => {
                    if (item.type === "hearing") router.push(`/(app)/hearings/${item.id}`);
                    else if (item.caseId) router.push(`/(app)/cases/${item.caseId}`);
                  }}
                  style={[styles.itemRow, { borderTopColor: colors.border, paddingVertical: spacing.md }]}
                >
                  <Ionicons name={meta.icon} size={22} color={ITEM_ICON} style={{ marginTop: 22 }} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>{meta.label}</Text>
                    <Text style={[typography.bodyStrong, { color: colors.textPrimary, fontSize: 16, textTransform: "capitalize", marginTop: 2 }]}>
                      {item.title}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                      {formatTime(item.at)}
                      {item.subtitle ? ` · ${item.subtitle}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push(EDIT_ROUTE[item.type](item.id))}
                    hitSlop={10}
                    accessibilityLabel={`Edit ${meta.label.toLowerCase()}`}
                    style={({ pressed }) => [styles.editButton, { backgroundColor: pressed ? colors.border : colors.surfaceAlt }]}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.brand} />
                  </Pressable>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  editButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  itemRow: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: StyleSheet.hairlineWidth * 2 },
});
