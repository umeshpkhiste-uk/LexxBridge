import { buildReminders, ReminderSourceItem } from "./reminders";

const item = (over: Partial<ReminderSourceItem>): ReminderSourceItem => ({
  id: "x",
  type: "hearing",
  title: "argument",
  subtitle: "Divorce Case",
  at: new Date(2026, 8, 30, 11, 0).toISOString(),
  caseId: "c1",
  ...over,
});

const now = new Date(2026, 8, 26, 10, 0);

describe("buildReminders", () => {
  it("reminds about a hearing the evening before and an hour before", () => {
    const r = buildReminders([item({})], now);
    expect(r.map((x) => [x.at.getDate(), x.at.getHours(), x.title])).toEqual([
      [29, 18, "Hearing tomorrow · Divorce Case"],
      [30, 10, "Hearing in 1 hour · Divorce Case"],
    ]);
    expect(r[0].body).toMatch(/^Argument at/);
  });

  it("reminds 30 minutes before a meeting and at 9 AM for a task", () => {
    const r = buildReminders(
      [
        item({ id: "m", type: "meeting", at: new Date(2026, 8, 27, 15, 0).toISOString() }),
        item({ id: "t", type: "task", title: "file reply", subtitle: null, at: new Date(2026, 8, 28, 23, 59).toISOString() }),
      ],
      now,
    );
    expect(r.map((x) => [x.id, x.at.getHours(), x.at.getMinutes()])).toEqual([
      ["meeting-m-30m", 14, 30],
      ["task-t-due", 9, 0],
    ]);
  });

  it("drops reminders that are already in the past", () => {
    const r = buildReminders([item({ at: new Date(2026, 8, 26, 10, 30).toISOString() })], now);
    expect(r).toEqual([]);
  });
});
