import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { getClient } from "@/features/clients/api";
import { Hearing, listHearingsForCase } from "@/features/hearings/api";
import { getMyProfile } from "@/features/profile/api";
import { alertMessage } from "@/shared/lib/alert";
import { printHtmlOnWeb } from "@/shared/lib/printHtml";
import { getCase } from "./api";

type HandoverInput = {
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  caseTitle: string;
  caseNumber: string | null;
  caseType: string | null;
  court: string | null;
  bench: string | null;
  discontinuedAt?: string | null;
  discontinuationReason?: string | null;
  advocateName?: string | null;
  advocatePhone?: string | null;
  /** Soonest first → reversed to chronological (oldest first) for the handover. */
  hearings: Hearing[];
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDay(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Case-facts summary for handing off to the client or a new advocate —
 * deliberately carries no fee/payment figures (see shareStatement.ts for
 * that, a separate document scoped to the outgoing advocate's own records).
 */
export function buildCaseHandoverHtml({
  clientName,
  clientPhone,
  clientEmail,
  clientAddress,
  caseTitle,
  caseNumber,
  caseType,
  court,
  bench,
  discontinuedAt,
  discontinuationReason,
  advocateName,
  advocatePhone,
  hearings,
}: HandoverInput): string {
  const chronological = [...hearings].sort((a, b) => a.hearing_at.localeCompare(b.hearing_at));

  const clientRows = [
    ["Name", clientName],
    clientPhone ? ["Phone", clientPhone] : null,
    clientEmail ? ["Email", clientEmail] : null,
    clientAddress ? ["Address", clientAddress] : null,
  ].filter((r): r is [string, string] => r !== null);

  const caseRows = [
    caseNumber ? ["Case number", caseNumber] : null,
    caseType ? ["Type", caseType] : null,
    court ? ["Court", court] : null,
    bench ? ["Bench", bench] : null,
  ].filter((r): r is [string, string] => r !== null);

  const detailBox = (title: string, rows: [string, string][]) =>
    rows.length
      ? `<div class="box"><div class="box-title">${escapeHtml(title)}</div><table class="box-rows">${rows
          .map(([label, value]) => `<tr><td class="box-label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
          .join("")}</table></div>`
      : "";

  const hearingRows = chronological.length
    ? chronological
        .map(
          (h) => `<tr>
            <td>${escapeHtml(formatDay(h.hearing_at))}</td>
            <td>${escapeHtml(h.court ?? court ?? "—")}</td>
            <td>${escapeHtml(h.purpose ?? "—")}</td>
            <td>${escapeHtml(h.status)}</td>
            <td>${escapeHtml(h.outcome ?? "—")}</td>
            <td>${escapeHtml(h.orders ?? "—")}</td>
            <td>${escapeHtml(h.next_action ?? "—")}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No hearings recorded.</td></tr>`;

  const discontinuedNote = discontinuedAt
    ? `<p class="period">Handed over as of ${escapeHtml(formatDay(discontinuedAt))}${discontinuationReason ? ` — ${escapeHtml(discontinuationReason)}` : ""}</p>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; text-align: center; }
  .doc-type { color: #64748B; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 10px; text-align: center; }
  .period { color: #64748B; font-size: 12px; margin: 0 0 24px; text-align: center; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .empty { color: #64748B; padding: 16px; text-align: center; }
  .signoff { margin-top: 32px; font-size: 13px; }
  .boxes-table { width: 100%; border-collapse: separate; border-spacing: 16px 0; margin: 0 0 24px; }
  .boxes-table td { width: 50%; vertical-align: top; padding: 0; border: none; }
  .box { background: #F8FAFC; border-radius: 8px; padding: 14px 16px; }
  .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; margin-bottom: 8px; }
  table.box-rows { width: 100%; border-collapse: collapse; }
  table.box-rows td { padding: 3px 0; font-size: 13px; border: none; }
  td.box-label { color: #64748B; width: 32%; }
  table.hearings th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; padding: 8px 4px; border-bottom: 1px solid #CBD5E1; }
  table.hearings td { padding: 9px 4px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
  .disclaimer { color: #94A3B8; font-size: 11px; margin-top: 12px; font-style: italic; }
</style>
</head>
<body>
  <h1>${escapeHtml(caseTitle)}</h1>
  <p class="doc-type">Case handover summary</p>
  ${discontinuedNote}

  <table class="boxes-table"><tr>
    <td>${detailBox("Client details", clientRows)}</td>
    <td>${detailBox("Case details", caseRows)}</td>
  </tr></table>

  <table class="hearings">
    <thead><tr><th>Date</th><th>Court</th><th>Purpose</th><th>Status</th><th>Outcome</th><th>Orders</th><th>Next action</th></tr></thead>
    <tbody>${hearingRows}</tbody>
  </table>

  ${
    advocateName
      ? `<p class="signoff">Prepared by,<br />${escapeHtml(advocateName)}${advocatePhone ? `<br /><span class="box-label">${escapeHtml(advocatePhone)}</span>` : ""}</p>`
      : ""
  }
  <p class="disclaimer">This is an electronically generated case summary — no signature required.</p>
</body>
</html>`;
}

/** One-tap "Download case handover" — fetches everything it needs itself
 * (case, client, hearing history, advocate profile) so any entry point can
 * call this directly. Carries no fee/payment figures. */
export async function downloadCaseHandoverPdf(caseId: string): Promise<void> {
  const [caseDetail, hearings, profile] = await Promise.all([
    getCase(caseId),
    listHearingsForCase(caseId),
    getMyProfile().catch(() => null),
  ]);
  const client = await getClient(caseDetail.client_id);

  const html = buildCaseHandoverHtml({
    clientName: client.full_name,
    clientPhone: client.phone,
    clientEmail: client.email,
    clientAddress: client.address,
    caseTitle: caseDetail.title,
    caseNumber: caseDetail.case_number,
    caseType: caseDetail.case_type,
    court: caseDetail.court,
    bench: caseDetail.bench,
    discontinuedAt: caseDetail.discontinued_at,
    discontinuationReason: caseDetail.discontinuation_reason,
    advocateName: profile?.full_name ?? null,
    advocatePhone: profile?.phone ?? null,
    hearings,
  });

  try {
    if (Platform.OS === "web") {
      printHtmlOnWeb(html);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Case summary — ${caseDetail.title}`, UTI: "com.adobe.pdf" });
    }
  } catch (err) {
    alertMessage("Couldn't create PDF", err instanceof Error ? err.message : "Something went wrong");
  }
}
