import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { createTask, getTask, TaskPriority, updateTask } from "@/features/tasks/api";
import { Button } from "@/shared/ui/Button";
import { DateField } from "@/shared/ui/DateField";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

/** New task, or — with ?id= — edit an existing one. */
export default function NewTaskScreen() {
  const { caseId, clientId, id, dueDate: dueDateParam } = useLocalSearchParams<{
    caseId?: string;
    clientId?: string;
    id?: string;
    /** Pre-fills the due date, e.g. when adding a task from the To-Do screen's selected day. */
    dueDate?: string;
  }>();
  const isEdit = !!id;
  const [loaded, setLoaded] = useState(!isEdit);
  const { colors, spacing } = useTheme();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(() => (dueDateParam ? new Date(`${dueDateParam}T00:00:00`) : null));
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);

  const titleError = titleTouched && !title.trim() ? "Task title is required" : null;

  useEffect(() => {
    if (!id) return;
    getTask(id)
      .then((t) => {
        setTitle(t.title);
        setDescription(t.description ?? "");
        setDueDate(t.due_at ? new Date(t.due_at) : null);
        setPriority(t.priority);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this task"))
      .finally(() => setLoaded(true));
  }, [id]);

  const handleSave = async () => {
    setTitleTouched(true);
    if (!title.trim()) {
      setError("Task title is required");
      return;
    }
    // A task is due by the end of the chosen day.
    let dueAt: Date | undefined;
    if (dueDate) {
      dueAt = new Date(dueDate);
      dueAt.setHours(23, 59, 0, 0);
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (id) await updateTask(id, { title, description, dueAt: dueAt ?? null, priority });
      else await createTask({ caseId, clientId, title, description, dueAt, priority });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Edit task" }} />
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: isEdit ? "Edit task" : "New task" }} />
      <TextField
        label="Task title *"
        placeholder="e.g. File written statement"
        value={title}
        onChangeText={setTitle}
        onBlur={() => setTitleTouched(true)}
        error={titleError ?? undefined}
      />
      <TextField
        label="Description"
        placeholder="e.g. Draft and file written statement in response to plaint"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />
      <DateField label="Due date" value={dueDate} onChange={setDueDate} placeholder="No due date" optional />

      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: spacing.xs }}>
        Priority
      </Text>
      <SegmentedControl
        segments={PRIORITIES.map((p) => ({ key: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
        value={priority}
        onChange={(key) => setPriority(key as TaskPriority)}
        style={{ marginBottom: spacing.lg }}
      />

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      <Button label={isEdit ? "Save changes" : "Save task"} onPress={handleSave} loading={isSubmitting} />
    </ScreenContainer>
  );
}
