import { getCase } from "@/features/cases/api";
import { getClient } from "@/features/clients/api";
import { getMyProfile } from "@/features/profile/api";
import { getPendingByCase } from "@/features/transactions/api";
import { shareViaWhatsApp } from "@/features/transactions/shareStatement";
import { confirmAlert } from "@/shared/lib/alert";
import { formatINR } from "@/shared/lib/format";
import { listUpcomingHearings, markPaymentReminderSent, UpcomingHearing } from "./api";

function buildReminderMessage(opts: {
  clientName: string;
  caseTitle: string;
  caseNumber: string | null;
  pending: number;
  hearingAt: Date | null;
  advocateName: string | null;
}): string {
  const hearingLine = opts.hearingAt
    ? ` The next hearing is on ${opts.hearingAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
    : "";
  const lines = [
    `Hi ${opts.clientName},`,
    "",
    `This is a reminder regarding ${opts.caseTitle}${opts.caseNumber ? ` (${opts.caseNumber})` : ""}.${hearingLine}`,
    `Please pay your pending fees: ${formatINR(opts.pending)}.`,
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
    const [caseDetail, pendingByCase] = await Promise.all([getCase(params.caseId), getPendingByCase()]);
    const pending = pendingByCase[params.caseId] ?? 0;
    if (pending <= 0) return;

    const client = await getClient(caseDetail.client_id);
    if (!client.phone) return;

    const profile = await getMyProfile().catch(() => null);
    const message = buildReminderMessage({
      clientName: client.full_name,
      caseTitle: caseDetail.title,
      caseNumber: caseDetail.case_number,
      pending,
      hearingAt: params.hearingAt ?? null,
      advocateName: profile?.full_name ?? null,
    });

    confirmAlert(
      "Send payment reminder?",
      `${client.full_name} has ${formatINR(pending)} pending for ${caseDetail.title}. Send a WhatsApp reminder now?`,
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
  pending: number;
  advocateName: string | null;
}): string {
  const lines = [
    `Hi ${opts.clientName},`,
    "",
    `This is a reminder regarding ${opts.caseTitle}${opts.caseNumber ? ` (${opts.caseNumber})` : ""}.`,
    `Today is the hearing day — please come to ${opts.court ? `the ${opts.court} court` : "court"}.`,
    `Please pay your pending fees before the hearing if not already paid: ${formatINR(opts.pending)}.`,
  ];
  if (opts.advocateName) lines.push("", "Regards,", opts.advocateName);
  return lines.join("\n");
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** One case's hearing-day prompt, resolved once the advocate has answered
 * (or it was skipped) — used to run several, one at a time, instead of
 * stacking confirm dialogs on top of each other. */
function promptForHearing(hearing: UpcomingHearing, pending: number, advocateName: string | null): Promise<void> {
  return new Promise((resolve) => {
    if (!hearing.cases) return resolve();
    const caseInfo = hearing.cases;
    getClient(caseInfo.client_id)
      .then((client) => {
        if (!client.phone) return resolve();
        const alreadySent = !!hearing.payment_reminder_sent_at;

        if (!alreadySent) {
          if (pending <= 0) return resolve();
          const message = buildReminderMessage({
            clientName: client.full_name,
            caseTitle: caseInfo.title,
            caseNumber: caseInfo.case_number,
            pending,
            hearingAt: new Date(hearing.hearing_at),
            advocateName,
          });
          confirmAlert(
            "Send payment reminder?",
            `${client.full_name} has ${formatINR(pending)} pending for ${caseInfo.title}. Today is the hearing day — send a WhatsApp reminder now?`,
            [
              { text: "Not now", style: "cancel", onPress: resolve },
              {
                text: "Send",
                onPress: () => {
                  shareViaWhatsApp(message, client.phone);
                  markPaymentReminderSent(hearing.id).catch(() => {});
                  resolve();
                },
              },
            ],
          );
        } else {
          const court = hearing.court ?? caseInfo.court ?? null;
          const message = buildHearingDayMessage({
            clientName: client.full_name,
            caseTitle: caseInfo.title,
            caseNumber: caseInfo.case_number,
            court,
            pending,
            advocateName,
          });
          confirmAlert(
            "Payment reminder already sent",
            `A payment reminder was already sent to ${client.full_name} for this hearing. Send it again?`,
            [
              { text: "Not now", style: "cancel", onPress: resolve },
              {
                text: "Send again",
                onPress: () => {
                  shareViaWhatsApp(message, client.phone);
                  markPaymentReminderSent(hearing.id).catch(() => {});
                  resolve();
                },
              },
            ],
          );
        }
      })
      .catch(() => resolve());
  });
}

/** Called when the Cases tab gains focus: re-offers the payment reminder for
 * every case with a hearing today. Runs one confirm dialog at a time (not
 * all at once) so multiple same-day hearings don't stack prompts. */
export async function checkHearingDayReminders(): Promise<void> {
  try {
    const today = new Date();
    const [todaysHearings, pendingByCase, profile] = await Promise.all([
      listUpcomingHearings({ from: startOfDay(today), to: endOfDay(today) }),
      getPendingByCase(),
      getMyProfile().catch(() => null),
    ]);
    for (const hearing of todaysHearings) {
      await promptForHearing(hearing, pendingByCase[hearing.case_id] ?? 0, profile?.full_name ?? null);
    }
  } catch {
    // Best-effort — never surface an error for a background nudge.
  }
}
