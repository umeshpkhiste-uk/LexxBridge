import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createTask, deleteTask, listPendingTasks, listTasksForDate, renameTask, Task, updateTaskStatus } from "@/features/tasks/api";
import { TaskMonthCalendar } from "@/features/tasks/TaskMonthCalendar";
import { confirmAlert } from "@/shared/lib/alert";
import { fromDateParam, toDateParam } from "@/shared/lib/format";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

/** A single day's to-do list — the planner-style card from the mockup:
 * a labelled card of checkable, inline-editable lines the advocate can add
 * to, rename, check off, or delete, all scoped to this one date. */
export default function TodoDayScreen() {
  const { date: dateParam } = useLocalSearchParams<{ date: string }>();
  const date = fromDateParam(dateParam) ?? new Date();
  const { colors, spacing, radius, typography } = useTheme();

  const [items, setItems] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const newInputRef = useRef<TextInput>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    listTasksForDate(date)
      .then(setItems)
      .catch((err) => console.warn("To-Do: failed to load this day's items", err))
      .finally(() => setIsLoading(false));
    // Also for the month calendar's dots, across the whole month, not just this day.
    listPendingTasks()
      .then(setPendingTasks)
      .catch((err) => console.warn("To-Do: failed to load month markers", err));
    // Only the date param should re-trigger a load; `date` is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam]);

  // useFocusEffect alone only re-runs on a navigation focus/blur transition —
  // tapping a different day in the month calendar replaces the route's `date`
  // param in place (same screen, no blur/focus cycle), so without this the
  // selection highlight moves but the list below silently keeps showing the
  // previous day's items. This effect re-fires whenever the date itself changes.
  useEffect(() => {
    // load() calls setIsLoading(true) synchronously so the spinner shows
    // immediately on a date switch, not just once the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    // Only the date param should trigger this; `date` is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const markedDates = useMemo(() => pendingTasks.filter((t) => t.due_at).map((t) => new Date(t.due_at!)), [pendingTasks]);

  const toggle = async (task: Task) => {
    const nextStatus = task.status === "completed" ? "todo" : "completed";
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await updateTaskStatus(task.id, nextStatus);
    } catch (err) {
      console.warn("To-Do: failed to update status", err);
      load();
    }
  };

  const renameLocal = (id: string, title: string) => setItems((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));

  // Blanking a line removes it — same affordance as a notes-app checklist.
  const commitRename = async (task: Task) => {
    if (!task.title.trim()) return remove(task.id);
    try {
      await renameTask(task.id, task.title);
    } catch (err) {
      console.warn("To-Do: failed to save title", err);
      load();
    }
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    deleteTask(id).catch((err) => {
      console.warn("To-Do: failed to delete item", err);
      load();
    });
  };

  const confirmRemove = (task: Task) => {
    confirmAlert("Delete this to-do?", task.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove(task.id) },
    ]);
  };

  const addItem = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setIsAdding(true);
    try {
      const created = await createTask({ title, dueAt: date });
      setItems((prev) => [...prev, created]);
      setNewTitle("");
      newInputRef.current?.focus();
    } catch (err) {
      console.warn("To-Do: failed to add item", err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <Stack.Screen
        options={{ title: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) }}
      />

      <TaskMonthCalendar
        visibleMonth={visibleMonth}
        selectedDate={date}
        markedDates={markedDates}
        onSelectDate={(d) => router.replace(`/(app)/todos/${toDateParam(d)}`)}
        onChangeMonth={(delta) => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))}
        onToday={() => router.replace(`/(app)/todos/${toDateParam(new Date())}`)}
      />

      <View style={[styles.labelPill, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
        <Text style={[typography.label, { color: colors.textPrimary, letterSpacing: 1 }]}>TO-DO LIST</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }]}>
        {isLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
        ) : (
          items.map((task) => {
            const done = task.status === "completed";
            return (
              <View
                key={task.id}
                style={[
                  styles.row,
                  { borderBottomColor: focusedId === task.id ? colors.brand : colors.border, paddingVertical: spacing.sm },
                ]}
              >
                <Pressable
                  onPress={() => toggle(task)}
                  hitSlop={10}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={`Mark "${task.title}" ${done ? "not done" : "done"}`}
                  style={styles.rowIcon}
                >
                  <Ionicons name={done ? "checkbox" : "square-outline"} size={22} color={done ? colors.brand : colors.textSecondary} />
                </Pressable>

                <TextInput
                  value={task.title}
                  onChangeText={(text) => renameLocal(task.id, text)}
                  onFocus={() => setFocusedId(task.id)}
                  onBlur={() => {
                    setFocusedId(null);
                    commitRename(task);
                  }}
                  multiline
                  style={[
                    typography.body,
                    styles.rowInput,
                    {
                      color: done ? colors.textSecondary : colors.textPrimary,
                      textDecorationLine: done ? "line-through" : "none",
                      marginLeft: spacing.md,
                    },
                  ]}
                />

                <Pressable
                  onPress={() => confirmRemove(task)}
                  hitSlop={10}
                  accessibilityLabel={`Delete "${task.title}"`}
                  style={styles.rowIcon}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            );
          })
        )}

        <View
          style={[styles.row, { borderBottomColor: focusedId === "new" ? colors.brand : "transparent", paddingVertical: spacing.sm }]}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.brand} style={styles.rowIcon} />
          <TextInput
            ref={newInputRef}
            value={newTitle}
            onChangeText={setNewTitle}
            onFocus={() => setFocusedId("new")}
            onBlur={() => {
              setFocusedId(null);
              addItem();
            }}
            multiline
            placeholder="Add a to-do…"
            placeholderTextColor={colors.textSecondary}
            style={[typography.body, styles.rowInput, { color: colors.textPrimary, marginLeft: spacing.md }]}
          />
          {isAdding ? <ActivityIndicator size="small" color={colors.brand} style={styles.rowIcon} /> : null}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  labelPill: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth * 2 },
  row: { flexDirection: "row", alignItems: "flex-start", borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  rowIcon: { marginTop: 2 },
  rowInput: {
    flex: 1,
    paddingVertical: 2,
    textAlignVertical: "top",
    // Without this, the browser's own focus ring draws a hard rectangle
    // around the input — the only border it has, since rows are
    // underlined, not boxed — clashing with that lined-list look.
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
});
