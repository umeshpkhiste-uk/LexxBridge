import { getCase } from "@/features/cases/api";
import { getClient } from "@/features/clients/api";
import { Notifications } from "@/features/notifications/notificationsModule";
import { getMyProfile } from "@/features/profile/api";
import { getExpensePendingByCase, getPendingByCase } from "@/features/transactions/api";
import { buildUpiPayLink, shareViaWhatsApp } from "@/features/transactions/shareStatement";
import { confirmAlert } from "@/shared/lib/alert";
import { formatINR } from "@/shared/lib/format";
import { listUpcomingHearings } from "./api";

/** Builds the "Pending <kind>: ₹X" + UPI link lines for one amount — fee
 * and expense are kept as separate pay-now links (not one combined link)
 * so the client can pay either one on its own. */
function payLines(kind: "fees" | "expenses", amount: number, opts: { caseTitle: string; advocateName: string | null; advocateUpiId: string | null }): string[] {
  if (amount <= 0) return [];
  const upiLink = opts.advocateUpiId
    ? buildUpiPayLink({
        upiId: opts.advocateUpiId,
        payeeName: opts.advocateName ?? "Advocate",
        note: `${kind === "fees" ? "Fee payment" : "Expense reimbursement"} for ${opts.caseTitle}`,
      })
    : null;
  const lines = [`Pending ${kind}: ${formatINR(amount)}`];
  if (upiLink) lines.push(`Pay now via UPI: ${upiLink}`);
  return lines;
}

function buildReminderMessage(opts: {
  clientName: string;
  caseTitle: string;
  caseNumber: string | null;
  feePending: number;
  expensePending: number;
  hearingAt: Date | null;
  advocateName: string | null;
  advocateUpiId: string | null;
}): string {
  const hearingLine = opts.hearingAt
    ? ` The next date of your mentioned case appears on ${opts.hearingAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
    : "";
  const lines = [
    `Hi ${opts.clientName},`,
    "",
    `This is a reminder regarding your case ${opts.caseTitle}${opts.caseNumber ? ` (${opts.caseNumber})` : ""}.${hearingLine}`,
    "Please pay the pending amount(s) below on or before the mentioned date.",
    ...payLines("fees", opts.feePending, opts),
    ...payLines("expenses", opts.expensePending, opts),
  ];
  if (opts.advocateName) lines.push("", "Regards,", opts.advocateName);
  return lines.join("\n");
}

/** After a hearing date is set, offers to send the client a WhatsApp
 * reminder of their pending fee for that case — only when there's actually
 * a pending balance and a phone number on file. Tap-to-send only; never
 * sent automatically, and never blocks the hearing save on failure. */
export async function offerPaymentReminder(params: { caseId: string; hearingAt?: Date | null }): Promise<void> {
  try {
    const [caseDetail, pendingByCase, expensePendingByCase] = await Promise.all([
      getCase(params.caseId),
      getPendingByCase(),
      getExpensePendingByCase(),
    ]);
    const feePending = pendingByCase[params.caseId] ?? 0;
    const expensePending = expensePendingByCase[params.caseId] ?? 0;
    if (feePending <= 0 && expensePending <= 0) return;

    const client = await getClient(caseDetail.client_id);
    if (!client.phone) return;

    const profile = await getMyProfile().catch(() => null);
    const message = buildReminderMessage({
      clientName: client.full_name,
      caseTitle: caseDetail.title,
      caseNumber: caseDetail.case_number,
      feePending,
      expensePending,
      hearingAt: params.hearingAt ?? null,
      advocateName: profile?.full_name ?? null,
      advocateUpiId: profile?.upi_id ?? null,
    });

    confirmAlert(
      "Send payment reminder?",
      `${client.full_name} has ${formatINR(feePending + expensePending)} pending for ${caseDetail.title}. Send a WhatsApp reminder now?`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Send", onPress: () => shareViaWhatsApp(message, client.phone) },
      ],
    );
  } catch {
    // Best-effort nudge — a failed fetch here must never block or error out
    // the hearing save it's piggybacking on.
  }
}

function buildHearingDayMessage(opts: {
  clientName: string;
  caseTitle: string;
  caseNumber: string | null;
  court: string | null;
  feePending: number;
  expensePending: number;
  advocateName: string | null;
  advocateUpiId: string | null;
}): string {
  const lines = [
    `Hi ${opts.clientName},`,
    "",
    `This is a reminder regarding ${opts.caseTitle}${opts.caseNumber ? ` (${opts.caseNumber})` : ""}.`,
    `Today is the hearing day — please come to ${opts.court ? `the ${opts.court} court` : "court"}.`,
    "Please pay the pending amount(s) below before the hearing if not already paid.",
    ...payLines("fees", opts.feePending, opts),
    ...payLines("expenses", opts.expensePending, opts),
  ];
  if (opts.advocateName) lines.push("", "Regards,", opts.advocateName);
  return lines.join("\n");
}

const PAYMENT_PREFIX = "payment:";

function eveningBeforeTrigger(hearingAt: Date): Date {
  const d = new Date(hearingAt);
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d;
}
function dayOfTrigger(hearingAt: Date): Date {
  const d = new Date(hearingAt);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Recomputes the two fixed payment-reminder notifications (evening
 * before, morning of) for every upcoming hearing in the next 2 days, based
 * on a live pending-fee check. Idempotent — safe to call on every
 * foreground, same cadence as syncCalendarReminders. Schedules what's
 * missing and still owed, cancels what's no longer owed, leaves alone
 * anything whose window already passed (no retroactive catch-up). */
export async function syncPaymentReminders(enabled: boolean): Promise<void> {
  if (!Notifications) return;
  try {
    if (!enabled) {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled
          .filter((n) => n.identifier.startsWith(PAYMENT_PREFIX))
          .map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier)),
      );
      return;
    }

    const now = new Date();
    const [hearings, pendingByCase, expensePendingByCase, scheduled] = await Promise.all([
      listUpcomingHearings({ from: now, to: new Date(now.getTime() + 2 * 86_400_000) }),
      getPendingByCase(),
      getExpensePendingByCase(),
      Notifications.getAllScheduledNotificationsAsync(),
    ]);
    const scheduledIds = new Set(scheduled.map((n) => n.identifier));

    for (const hearing of hearings) {
      if (!hearing.cases) continue;
      const pending = (pendingByCase[hearing.case_id] ?? 0) + (expensePendingByCase[hearing.case_id] ?? 0);
      const hearingAt = new Date(hearing.hearing_at);
      const occurrences = [
        { suffix: "evening" as const, at: eveningBeforeTrigger(hearingAt), title: "Payment reminder — hearing tomorrow" },
        { suffix: "day" as const, at: dayOfTrigger(hearingAt), title: "Payment reminder — hearing today" },
      ];

      for (const occ of occurrences) {
        if (occ.at.getTime() <= now.getTime()) continue; // window already passed
        const identifier = `${PAYMENT_PREFIX}${hearing.id}:${occ.suffix}`;
        const isScheduled = scheduledIds.has(identifier);

        if (pending <= 0) {
          if (isScheduled) await Notifications.cancelScheduledNotificationAsync(identifier);
          continue;
        }
        if (isScheduled) continue;
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: occ.title,
            body: `${hearing.cases.title}: ${formatINR(pending)} pending.`,
            data: { kind: "payment", caseId: hearing.case_id, occurrence: occ.suffix },
            sound: "default",
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: occ.at, channelId: "default" },
        });
      }
    }
  } catch {
    // Best-effort — never blocks the rest of the notification refresh pass.
  }
}

/** Foreground delivery for a payment-reminder notification: instead of
 * the OS banner (suppressed for these, see device.ts), show the same
 * send-reminder confirm used elsewhere, with a LIVE pending check — so a
 * fee paid since the notification was scheduled correctly skips it. */
export async function handlePaymentReminderReceived(data: Record<string, unknown>): Promise<void> {
  if (typeof data.caseId !== "string") return;
  try {
    const [caseDetail, pendingByCase, expensePendingByCase] = await Promise.all([
      getCase(data.caseId),
      getPendingByCase(),
      getExpensePendingByCase(),
    ]);
    const feePending = pendingByCase[data.caseId] ?? 0;
    const expensePending = expensePendingByCase[data.caseId] ?? 0;
    if (feePending <= 0 && expensePending <= 0) return;

    const client = await getClient(caseDetail.client_id);
    if (!client.phone) return;
    const profile = await getMyProfile().catch(() => null);

    const isDayOf = data.occurrence === "day";
    const message = isDayOf
      ? buildHearingDayMessage({
          clientName: client.full_name,
          caseTitle: caseDetail.title,
          caseNumber: caseDetail.case_number,
          court: caseDetail.court,
          feePending,
          expensePending,
          advocateName: profile?.full_name ?? null,
          advocateUpiId: profile?.upi_id ?? null,
        })
      : buildReminderMessage({
          clientName: client.full_name,
          caseTitle: caseDetail.title,
          caseNumber: caseDetail.case_number,
          feePending,
          expensePending,
          hearingAt: caseDetail.next_hearing_at ? new Date(caseDetail.next_hearing_at) : null,
          advocateName: profile?.full_name ?? null,
          advocateUpiId: profile?.upi_id ?? null,
        });

    confirmAlert(
      isDayOf ? "Today is the hearing day" : "Hearing tomorrow",
      `${client.full_name} has ${formatINR(feePending + expensePending)} pending for ${caseDetail.title}. Send a WhatsApp reminder now?`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Send", onPress: () => shareViaWhatsApp(message, client.phone) },
      ],
    );
  } catch {
    // Best-effort.
  }
}
