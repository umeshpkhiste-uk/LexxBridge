import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/shared/ui/theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function isSameDay(a: Date, b: Date) {
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
  /** Dates (any time of day) that have at least one to-do, for the dot under the number. */
  markedDates: Date[];
  onSelectDate: (date: Date) => void;
  onChangeMonth: (delta: number) => void;
  /** Tapping the month heading jumps back to today. */
  onToday: () => void;
};

/** Full month calendar for picking a day to manage its to-do list — the
 * selected day gets a solid brand circle, days with to-dos get a soft dot. */
export function TaskMonthCalendar({ visibleMonth, selectedDate, markedDates, onSelectDate, onChangeMonth, onToday }: Props) {
  const { colors, spacing, typography } = useTheme();
  const cells = useMemo(() => monthCells(visibleMonth), [visibleMonth]);
  const markedKeys = useMemo(() => new Set(markedDates.map(dayKey)), [markedDates]);

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={() => onChangeMonth(-1)} hitSlop={8} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={onToday} accessibilityLabel="Go to today">
          <Text style={[typography.title, { color: colors.textPrimary }]}>
            {visibleMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </Text>
        </Pressable>
        <Pressable onPress={() => onChangeMonth(1)} hitSlop={8} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
        </Pressable>
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
          const hasTasks = markedKeys.has(dayKey(date));
          return (
            <Pressable
              key={dayKey(date)}
              onPress={() => onSelectDate(date)}
              style={styles.dayCell}
              accessibilityRole="button"
              accessibilityLabel={date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            >
              <View
                style={[
                  styles.dayCircle,
                  { backgroundColor: selected ? colors.brand : hasTasks ? colors.surfaceAlt : "transparent" },
                ]}
              >
                <Text
                  style={[
                    typography.subtitle,
                    { fontWeight: "500", color: selected ? colors.textInverse : hasTasks ? colors.brand : colors.textPrimary },
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
              <View style={styles.dot}>
                {!selected && hasTasks ? <View style={[styles.dotShape, { backgroundColor: colors.accent }]} /> : null}
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
  dot: { height: 6, marginTop: 2, alignItems: "center", justifyContent: "center" },
  dotShape: { width: 5, height: 5, borderRadius: 2.5 },
});
