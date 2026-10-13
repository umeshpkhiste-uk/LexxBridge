import { getCase } from "@/features/cases/api";
import { getClient } from "@/features/clients/api";
import { getMyProfile } from "@/features/profile/api";
import { getPendingByCase } from "@/features/transactions/api";
import { shareViaWhatsApp } from "@/features/transactions/shareStatement";
import { confirmAlert } from "@/shared/lib/alert";
import { formatINR } from "@/shared/lib/format";

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
