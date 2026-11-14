/** Formatting and list-building helpers for the chat screens. */

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", a weekday within the last week, else "12 Sep 2026". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString("en-IN", { weekday: "long" });
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Time inside a bubble, e.g. "4:05 pm". */
export function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** Chat-list timestamp: time today, "Yesterday", weekday, or short date. */
export function listTime(iso: string, now: Date = new Date()): string {
  const label = dayLabel(iso, now);
  if (label === "Today") return bubbleTime(iso);
  if (label === "Yesterday") return label;
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days < 7) return label;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function fileSizeLabel(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type ChatListItem<M> = { type: "message"; key: string; message: M } | { type: "day"; key: string; label: string };

/**
 * Newest-first rows for an inverted FlatList, with a day separator after the
 * last (oldest) message of each day so it renders above that day's messages.
 */
export function buildChatItems<M extends { id: string; created_at: string }>(
  messagesOldestFirst: M[],
  now: Date = new Date()
): ChatListItem<M>[] {
  const items: ChatListItem<M>[] = [];
  for (let i = messagesOldestFirst.length - 1; i >= 0; i--) {
    const message = messagesOldestFirst[i];
    items.push({ type: "message", key: message.id, message });
    const older = messagesOldestFirst[i - 1];
    if (!older || startOfDay(new Date(older.created_at)) !== startOfDay(new Date(message.created_at))) {
      items.push({ type: "day", key: `day-${message.created_at.slice(0, 10)}-${message.id}`, label: dayLabel(message.created_at, now) });
    }
  }
  return items;
}

/** One-line preview of a message for reply quotes and the chat list. */
export function messagePreview(message: {
  content: string;
  is_deleted: boolean;
  is_undecryptable?: boolean;
  attachment_kind: "image" | "file" | null;
  attachment_name?: string | null;
}): string {
  if (message.is_deleted) return "This message was deleted";
  if (message.is_undecryptable) return "Message is encrypted and can not see on this device";
  if (message.content) return message.content;
  if (message.attachment_kind === "image") return "Photo";
  if (message.attachment_kind === "file") return message.attachment_name ?? "File";
  return "";
}
