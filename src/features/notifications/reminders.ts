export type ReminderItemType = "hearing" | "meeting" | "task";

// Deliberately its own type, not AgendaItem from @/features/calendar/api —
// reminders draw on hearings, meetings, AND personal to-dos, while the
// calendar's own agenda stays independent of to-dos entirely.
export type ReminderSourceItem = {
  id: string;
  type: ReminderItemType;
  title: string;
  subtitle: string | null;
  at: string;
  caseId: string | null;
};

export type Reminder = {
  /** Stable id so re-scheduling replaces rather than duplicates. */
  id: string;
  at: Date;
  title: string;
  body: string;
  data: { kind: "agenda"; type: ReminderItemType; itemId: string; caseId: string | null; at: string };
};

/** iOS keeps at most 64 pending local notifications per app. */
export const MAX_REMINDERS = 60;

function timeLabel(date: Date) {
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Reminders for upcoming calendar items:
 *  - hearings: 6 PM the evening before, and 1 hour before;
 *  - meetings: 30 minutes before;
 *  - tasks: 9 AM on the due day (or 1 hour before if due earlier).
 * Only future times are kept, soonest first, capped at MAX_REMINDERS.
 */
export function buildReminders(items: ReminderSourceItem[], now: Date = new Date()): Reminder[] {
  const out: Reminder[] = [];
  for (const item of items) {
    const at = new Date(item.at);
    const data = { kind: "agenda" as const, type: item.type, itemId: item.id, caseId: item.caseId, at: item.at };
    const where = item.subtitle ? ` · ${item.subtitle}` : "";

    if (item.type === "hearing") {
      const eveBefore = new Date(at);
      eveBefore.setDate(eveBefore.getDate() - 1);
      eveBefore.setHours(18, 0, 0, 0);
      out.push({ id: `hearing-${item.id}-eve`, at: eveBefore, title: `Hearing tomorrow${where}`, body: `${cap(item.title)} at ${timeLabel(at)}`, data });
      out.push({
        id: `hearing-${item.id}-1h`,
        at: new Date(at.getTime() - 60 * 60 * 1000),
        title: `Hearing in 1 hour${where}`,
        body: `${cap(item.title)} at ${timeLabel(at)}`,
        data,
      });
    } else if (item.type === "meeting") {
      out.push({
        id: `meeting-${item.id}-30m`,
        at: new Date(at.getTime() - 30 * 60 * 1000),
        title: `Meeting in 30 minutes${where}`,
        body: `${cap(item.title)} at ${timeLabel(at)}`,
        data,
      });
    } else {
      const morning = new Date(at);
      morning.setHours(9, 0, 0, 0);
      const when = morning < at ? morning : new Date(at.getTime() - 60 * 60 * 1000);
      out.push({ id: `task-${item.id}-due`, at: when, title: "Task due today", body: cap(item.title), data });
    }
  }
  const soon = now.getTime() + 60 * 1000;
  return out
    .filter((r) => r.at.getTime() > soon)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_REMINDERS);
}
