import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/shared/ui/theme";
import { AgendaItem } from "./api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const AGENDA_DOT_COLORS: Record<AgendaItem["type"], string> = {
  hearing: "#7C5CF5",
  meeting: "#22B07D",
};

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
export function isSameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Day cells for a month grid, with leading nulls so day 1 sits under its weekday. */
function monthCells(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type Props = {
  visibleMonth: Date;
  selectedDate: Date;
  items: AgendaItem[];
  onSelectDate: (date: Date) => void;
  onChangeMonth: (delta: number) => void;
  /** Tapping the date heading jumps back to today. */
  onToday: () => void;
};

/** Month view: selected date heading with month arrows, then the grid with
 * coloured dots for hearings, meetings and tasks on each day. */
export function MonthCalendar({ visibleMonth, selectedDate, items, onSelectDate, onChangeMonth, onToday }: Props) {
  const { colors, spacing, typography } = useTheme();
  const cells = useMemo(() => monthCells(visibleMonth), [visibleMonth]);

  const typesByDay = useMemo(() => {
    const map = new Map<string, Set<AgendaItem["type"]>>();
    for (const item of items) {
      const key = dayKey(new Date(item.at));
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(item.type);
    }
    return map;
  }, [items]);

  const day = selectedDate.getDate();
  const month = selectedDate.toLocaleDateString("en-IN", { month: "short" });
  const year = String(selectedDate.getFullYear()).slice(-2);
  const weekday = selectedDate.toLocaleDateString("en-IN", { weekday: "long" });

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={onToday} accessibilityLabel="Go to today">
          <Text style={[typography.subtitle, { color: colors.textPrimary }]}>
            {`${day} ${month}, ${year} `}
            <Text style={[typography.body, { color: colors.textSecondary, fontSize: 17 }]}>{weekday}</Text>
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Pressable onPress={() => onChangeMonth(-1)} hitSlop={8} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => onChangeMonth(1)} hitSlop={8} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.row, { marginTop: spacing.lg }]}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[typography.body, styles.cell, { color: colors.textSecondary }]}>
            {w}
          </Text>
        ))}
      </View>
      <View style={[styles.grid, { marginTop: spacing.sm }]}>
        {cells.map((date, i) => {
          if (!date) return <View key={`empty-${i}`} style={styles.dayCell} />;
          const selected = isSameDay(date, selectedDate);
          const types = typesByDay.get(dayKey(date));
          return (
            <Pressable
              key={dayKey(date)}
              onPress={() => onSelectDate(date)}
              style={styles.dayCell}
              accessibilityRole="button"
              accessibilityLabel={date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            >
              <View style={[styles.dayCircle, selected && { backgroundColor: colors.textPrimary }]}>
                <Text style={[typography.subtitle, { fontWeight: "500", color: selected ? colors.surface : colors.textPrimary }]}>
                  {date.getDate()}
                </Text>
              </View>
              <View style={styles.dots}>
                {!selected && types
                  ? [...types].map((t) => <View key={t} style={[styles.dot, { backgroundColor: AGENDA_DOT_COLORS[t] }]} />)
                  : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row" },
  cell: { flex: 1, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
