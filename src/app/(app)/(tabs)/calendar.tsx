import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AgendaItem, listAgendaItems } from "@/features/calendar/api";
import { DayAgenda } from "@/features/calendar/DayAgenda";
import { MonthCalendar, startOfDay } from "@/features/calendar/MonthCalendar";
import { fromDateParam } from "@/shared/lib/format";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { useTheme } from "@/shared/ui/theme";


export default function CalendarScreen() {
  const { colors, spacing, typography } = useTheme();
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [monthItems, setMonthItems] = useState<AgendaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Other screens link here as /calendar?date=YYYY-MM-DD to jump to a day
  // (e.g. a case's next hearing). Sync during render when the param changes.
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const [appliedDateParam, setAppliedDateParam] = useState<string | undefined>(undefined);
  if (dateParam !== appliedDateParam) {
    setAppliedDateParam(dateParam);
    const linked = fromDateParam(dateParam);
    if (linked) {
      setSelectedDate(linked);
      setVisibleMonth(new Date(linked.getFullYear(), linked.getMonth(), 1));
    }
  }

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const from = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const to = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    listAgendaItems({ from, to })
      .then(setMonthItems)
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, [visibleMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const changeMonth = (delta: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1);
    setVisibleMonth(next);
    const today = new Date();
    setSelectedDate(
      next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? startOfDay(today) : next
    );
  };

  const today = new Date();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        {/* Calendar isn't in the bottom bar, so give an obvious way back. */}
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(app)/(tabs)"))}
          hitSlop={10}
          accessibilityLabel="Go back"
          style={[styles.backRow, { marginBottom: spacing.md }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={[typography.title, { color: colors.textPrimary }]}>Calendar</Text>
        </Pressable>

        <MonthCalendar
          visibleMonth={visibleMonth}
          selectedDate={selectedDate}
          items={monthItems}
          onSelectDate={setSelectedDate}
          onChangeMonth={changeMonth}
          onToday={() => {
            setSelectedDate(startOfDay(today));
            setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
          }}
        />

        <DayAgenda selectedDate={selectedDate} items={monthItems} isLoading={isLoading} error={error} onRetry={load} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
});
