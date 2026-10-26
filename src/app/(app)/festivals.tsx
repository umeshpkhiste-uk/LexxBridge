import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Festival, FESTIVALS, FESTIVALS_MAX_YEAR, FESTIVALS_MIN_YEAR } from "@/features/festivals/data";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN_MONTH = new Date(FESTIVALS_MIN_YEAR, 0, 1);
const MAX_MONTH = new Date(FESTIVALS_MAX_YEAR, 11, 1);

function monthCells(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Read-only reference calendar of major festivals across India's largest
 * religious communities, month by month for 2026 — nothing here is editable. */
export default function FestivalsScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    const year = now.getFullYear() >= FESTIVALS_MIN_YEAR && now.getFullYear() <= FESTIVALS_MAX_YEAR ? now.getFullYear() : FESTIVALS_MIN_YEAR;
    return new Date(year, year === now.getFullYear() ? now.getMonth() : 0, 1);
  });

  const cells = useMemo(() => monthCells(month), [month]);
  const festivalsByDay = useMemo(() => {
    const map = new Map<string, Festival[]>();
    for (const f of FESTIVALS) {
      if (!map.has(f.date)) map.set(f.date, []);
      map.get(f.date)!.push(f);
    }
    return map;
  }, []);
  const monthFestivals = useMemo(
    () => FESTIVALS.filter((f) => f.date.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`)),
    [month]
  );

  const canGoBack = month.getTime() > MIN_MONTH.getTime();
  const canGoForward = month.getTime() < MAX_MONTH.getTime();
  const changeMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <ScreenContainer scroll>
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        A reference calendar only — not editable. Lunar-calendar festivals can shift by a day depending on region or local
        moon sighting.
      </Text>

      <View style={styles.header}>
        <Pressable onPress={() => canGoBack && changeMonth(-1)} hitSlop={8} disabled={!canGoBack} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={22} color={canGoBack ? colors.textPrimary : colors.border} />
        </Pressable>
        <Text style={[typography.title, { color: colors.textPrimary }]}>
          {month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={() => canGoForward && changeMonth(1)} hitSlop={8} disabled={!canGoForward} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={22} color={canGoForward ? colors.textPrimary : colors.border} />
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
          const hasFestival = festivalsByDay.has(dateKey(date));
          return (
            <View key={dateKey(date)} style={styles.dayCell}>
              <View style={[styles.dayCircle, hasFestival && { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[typography.subtitle, { fontWeight: "500", color: hasFestival ? colors.brand : colors.textPrimary }]}>
                  {date.getDate()}
                </Text>
              </View>
              {hasFestival ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
            </View>
          );
        })}
      </View>

      <Text style={[typography.subtitle, { color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md }]}>
        Festivals in {month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
      </Text>

      {monthFestivals.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSecondary }]}>No major festivals listed this month.</Text>
      ) : (
        monthFestivals.map((f) => (
          <View
            key={`${f.date}-${f.name}`}
            style={[styles.festivalRow, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }]}
          >
            <View style={[styles.dateBadge, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{new Date(f.date).getDate()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[typography.bodyStrong, { color: colors.textPrimary, fontSize: 16 }]}>{f.name}</Text>
              <Text numberOfLines={2} style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                {f.description}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row" },
  cell: { flex: 1, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },
  festivalRow: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth },
  dateBadge: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
