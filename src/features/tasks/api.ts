import { supabase } from "@/shared/lib/supabase";

export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  case_id: string | null;
  client_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
};

const COLUMNS = "id, case_id, client_id, title, description, due_at, priority, status";

export async function listTasksForCase(caseId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(COLUMNS)
    .eq("case_id", caseId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data as Task[];
}

export async function listPendingTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(COLUMNS)
    .neq("status", "completed")
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data as Task[];
}

/** All tasks (including completed ones) due on the given calendar day, for the
 * per-day to-do list page where the advocate manages that day's items directly. */
export async function listTasksForDate(date: Date): Promise<Task[]> {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("tasks")
    .select(COLUMNS)
    .gte("due_at", from.toISOString())
    .lte("due_at", to.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as Task[];
}

export async function createTask(input: {
  caseId?: string;
  clientId?: string;
  title: string;
  description?: string;
  dueAt?: Date;
  priority?: TaskPriority;
}): Promise<Task> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      advocate_id: userData.user.id,
      case_id: input.caseId ?? null,
      client_id: input.clientId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_at: input.dueAt ? input.dueAt.toISOString() : null,
      priority: input.priority ?? "medium",
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as Task;
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Renames a task in place — for the per-day to-do list's inline-editable rows. */
export async function renameTask(id: string, title: string): Promise<void> {
  const { error } = await supabase.from("tasks").update({ title: title.trim() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getTask(id: string): Promise<Task> {
  const { data, error } = await supabase.from("tasks").select(COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Task;
}

/** Edits a task's details. */
export async function updateTask(
  id: string,
  input: { title: string; description?: string; dueAt?: Date | null; priority: TaskPriority }
): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_at: input.dueAt ? input.dueAt.toISOString() : null,
      priority: input.priority,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
