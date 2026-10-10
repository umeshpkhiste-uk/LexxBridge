import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Linking, Platform, Share } from "react-native";
import { alertMessage } from "@/shared/lib/alert";
import { formatINR } from "@/shared/lib/format";
import type { Transaction } from "./api";

export type StatementRange = { from: string; to: string };

type StatementInput = {
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  caseTitle?: string | null;
  caseNumber?: string | null;
  caseType?: string | null;
  court?: string | null;
  oppositeParty?: string | null;
  filingDate?: string | null;
  /** The agreed fee for this specific case, when scoped to one. */
  agreedFee?: number | null;
  /** When not scoped to one case, every case this client has with its own
   * agreed fee — so the decided amount per case is still visible. */
  cases?: { title: string; caseNumber: string | null; agreedFee: number | null }[];
  advocateName?: string | null;
  /** Shown under the advocate's name in the sign-off — never the bar
   * registration number, which stays out of a client-facing document. */
  advocatePhone?: string | null;
  advocateAddress?: string | null;
  transactions: (Transaction & { cases?: { title: string } | null })[];
  /** Fee position from the agreed fees; defaults to summing the entries.
   * Always the running, all-time position — a period statement still shows
   * the real outstanding balance, not a balance scoped to that period.
   * `totalFees` includes `expenses` (see feeTotals.ts); `received`/`pending`
   * and the fee ledger below stay fee-only, so "Balance due" always
   * reflects what the client actually still owes for fees, never expenses. */
  totals?: { totalFees: number; received: number; pending: number; expenses?: number };
  /** Restricts the listed entries (and the "received in period" figure) to
   * this inclusive date range (YYYY-MM-DD). Omit for the complete history. */
  range?: StatementRange | null;
  /** Shown on the statement, e.g. "September 2026" or "1 Jan – 31 Mar 2026".
   * Defaults to "Complete transaction history" when `range` is omitted. */
  periodLabel?: string;
};

/** Most recent fee entry's date — "the decided amount as of last
 * transaction" is this running position evaluated as of that date. */
function lastTransactionDate(fees: { transaction_date: string }[]): string | null {
  return fees.reduce<string | null>((latest, t) => (!latest || t.transaction_date > latest ? t.transaction_date : latest), null);
}

function formatDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** "04 Jun" — the ledger table's per-row date cell. */
function formatShortDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** "August 2025" — a month group's header, from its "YYYY-MM" key. */
function formatMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/**
 * Plain-text statement for the client. Only fee (income) entries are
 * included — the advocate's own expenses are internal bookkeeping.
 */
export function buildStatement({
  clientName,
  clientPhone,
  clientEmail,
  caseTitle,
  caseNumber,
  caseType,
  court,
  oppositeParty,
  filingDate,
  agreedFee,
  cases,
  advocateName,
  advocatePhone,
  advocateAddress,
  transactions,
  totals,
  range,
  periodLabel,
}: StatementInput): string {
  const fees = transactions.filter((t) => t.type === "income");
  const periodFees = range ? fees.filter((t) => t.transaction_date >= range.from && t.transaction_date <= range.to) : fees;
  const expensesList = transactions.filter((t) => t.type === "expense");
  const periodExpenses = range ? expensesList.filter((t) => t.transaction_date >= range.from && t.transaction_date <= range.to) : expensesList;

  const overallReceived = totals?.received ?? fees.filter((t) => t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
  const overallPending = totals?.pending ?? fees.filter((t) => t.status === "pending").reduce((s, t) => s + Number(t.amount), 0);
  const overallExpenses = totals?.expenses ?? expensesList.reduce((s, t) => s + Number(t.amount), 0);
  const overallTotal = totals?.totalFees ?? overallReceived + overallPending + overallExpenses;
  const periodReceived = periodFees.filter((t) => t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
  const asOf = lastTransactionDate(fees);

  const lines = [
    `Payment statement — ${clientName}`,
    clientPhone ? `Phone: ${clientPhone}` : null,
    clientEmail ? `Email: ${clientEmail}` : null,
    caseTitle ? `Case: ${caseTitle}${caseNumber ? ` (${caseNumber})` : ""}` : null,
    caseTitle && caseType ? `Type: ${caseType}` : null,
    caseTitle && court ? `Court: ${court}` : null,
    caseTitle && oppositeParty ? `Opposite party: ${oppositeParty}` : null,
    caseTitle && filingDate ? `Filed: ${formatDay(filingDate)}` : null,
    caseTitle && agreedFee != null ? `Agreed fee: ${formatINR(agreedFee)}` : null,
    !caseTitle && cases?.length ? "Cases:" : null,
    ...(!caseTitle && cases?.length
      ? cases.map((c) => `  • ${c.title}${c.caseNumber ? ` (${c.caseNumber})` : ""} — agreed fee: ${c.agreedFee != null ? formatINR(c.agreedFee) : "not set"}`)
      : []),
    `Period: ${periodLabel ?? "Complete transaction history"}`,
    `Date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
    "",
    `Total (fees${overallExpenses > 0 ? " + expenses" : ""}): ${formatINR(overallTotal)}`,
    ...(overallExpenses > 0
      ? [`  Agreed fees: ${formatINR(overallTotal - overallExpenses)}`, `  Expenses: ${formatINR(overallExpenses)}`]
      : []),
    `Received so far: ${formatINR(overallReceived)}`,
    `Balance due (fees): ${formatINR(overallPending)}`,
    asOf ? `As of last transaction (${formatDay(asOf)})` : null,
    ...(range ? ["", `Received in this period: ${formatINR(periodReceived)}`] : []),
    "",
    "Details:",
    ...(periodFees.length === 0
      ? [range ? "No fee entries in this period." : "No fee entries yet."]
      : [...periodFees]
          .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
          .map(
            (t) =>
              `• ${formatDay(t.transaction_date)} — ${t.category}${!caseTitle && t.cases?.title ? ` (${t.cases.title})` : ""}: ${formatINR(Number(t.amount))} ${t.status === "pending" ? "(due)" : "(received)"}`
          )),
    ...(periodExpenses.length
      ? [
          "",
          "Expenses:",
          ...[...periodExpenses]
            .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
            .map((t) => `• ${formatDay(t.transaction_date)} — ${t.category}: ${formatINR(Number(t.amount))}`),
        ]
      : []),
    "",
    advocateName ? `Regards,` : null,
    advocateName ? advocateName : null,
    advocateName && advocatePhone ? `Phone: ${advocatePhone}` : null,
    advocateName && advocateAddress ? `Address: ${advocateAddress}` : null,
    "",
    "This is an electronically generated statement — no signature required.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Same statement, laid out as a printable HTML document for the PDF. */
export function buildStatementHtml({
  clientName,
  clientPhone,
  clientEmail,
  clientAddress,
  caseTitle,
  caseNumber,
  caseType,
  court,
  oppositeParty,
  filingDate,
  agreedFee,
  cases,
  advocateName,
  advocatePhone,
  advocateAddress,
  transactions,
  totals,
  range,
  periodLabel,
}: StatementInput): string {
  const fees = transactions.filter((t) => t.type === "income");
  const sortedFees = [...fees].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  const periodFees = range ? sortedFees.filter((t) => t.transaction_date >= range.from && t.transaction_date <= range.to) : sortedFees;
  const expensesList = transactions.filter((t) => t.type === "expense");
  const sortedExpenses = [...expensesList].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  const periodExpenses = range ? sortedExpenses.filter((t) => t.transaction_date >= range.from && t.transaction_date <= range.to) : sortedExpenses;

  const overallReceived = totals?.received ?? fees.filter((t) => t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
  const overallPending = totals?.pending ?? fees.filter((t) => t.status === "pending").reduce((s, t) => s + Number(t.amount), 0);
  const overallExpenses = totals?.expenses ?? expensesList.reduce((s, t) => s + Number(t.amount), 0);
  const overallTotal = totals?.totalFees ?? overallReceived + overallPending + overallExpenses;
  const asOf = lastTransactionDate(fees);

  // Ledger-style running balance: starts at the total agreed fee (nothing
  // paid down yet) and is reduced by each payment actually received. A
  // period statement's opening balance already accounts for payments made
  // before that period, so the closing balance still lines up with the
  // real, current balance due. Deliberately fee-only (not overallTotal,
  // which also includes expenses) — "Balance Due" is what the client still
  // owes for fees, never for the advocate's own expenses.
  const feeOnlyTotal = overallReceived + overallPending;
  const priorReceived = range
    ? sortedFees.filter((t) => t.status === "completed" && t.transaction_date < range.from).reduce((s, t) => s + Number(t.amount), 0)
    : 0;
  const openingBalance = feeOnlyTotal - priorReceived;
  const periodReceived = periodFees.filter((t) => t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
  const periodPending = periodFees.filter((t) => t.status === "pending").reduce((s, t) => s + Number(t.amount), 0);
  const closingBalance = openingBalance - periodReceived;

  let runningBalance = openingBalance;
  const ledgerRows = periodFees.map((t) => {
    if (t.status === "completed") runningBalance -= Number(t.amount);
    return { t, balance: runningBalance };
  });

  const monthGroups = new Map<string, { rows: typeof ledgerRows; received: number; pending: number }>();
  for (const row of ledgerRows) {
    const key = row.t.transaction_date.slice(0, 7);
    if (!monthGroups.has(key)) monthGroups.set(key, { rows: [], received: 0, pending: 0 });
    const group = monthGroups.get(key)!;
    group.rows.push(row);
    if (row.t.status === "completed") group.received += Number(row.t.amount);
    else group.pending += Number(row.t.amount);
  }

  const summaryCards: [string, string, string | null][] = [
    ["Opening Balance", formatINR(openingBalance), range ? `on ${formatDay(range.from)}` : null],
    ["Total Pending(-)", formatINR(periodPending), null],
    ["Total Received(+)", formatINR(periodReceived), null],
    ["Balance Due", formatINR(closingBalance), closingBalance > 0 ? "Client owes" : "Fully paid"],
  ];

  const clientDetailRows = [
    clientPhone ? ["Phone", clientPhone] : null,
    clientEmail ? ["Email", clientEmail] : null,
    clientAddress ? ["Address", clientAddress] : null,
  ].filter((r): r is [string, string] => r !== null);

  const caseDetailRows = caseTitle
    ? [
        caseNumber ? ["Case number", caseNumber] : null,
        caseType ? ["Type", caseType] : null,
        court ? ["Court", court] : null,
        oppositeParty ? ["Opposite party", oppositeParty] : null,
        filingDate ? ["Filed", formatDay(filingDate)] : null,
        agreedFee != null ? ["Agreed fee", formatINR(agreedFee)] : null,
      ].filter((r): r is [string, string] => r !== null)
    : [];

  const detailBox = (title: string, rows: [string, string][]) =>
    rows.length
      ? `<div class="box"><div class="box-title">${escapeHtml(title)}</div><table class="box-rows">${rows
          .map(([label, value]) => `<tr><td class="box-label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
          .join("")}</table></div>`
      : "";

  const casesTable =
    !caseTitle && cases?.length
      ? `<div class="box"><div class="box-title">Cases &amp; agreed fees</div><table class="cases">
          <thead><tr><th>Case</th><th class="amount">Agreed fee</th></tr></thead>
          <tbody>${cases
            .map(
              (c) =>
                `<tr><td>${escapeHtml(c.title)}${c.caseNumber ? ` <span class="muted">(${escapeHtml(c.caseNumber)})</span>` : ""}</td><td class="amount">${escapeHtml(c.agreedFee != null ? formatINR(c.agreedFee) : "Not set")}</td></tr>`
            )
            .join("")}</tbody>
        </table></div>`
      : "";

  const expensesTable = periodExpenses.length
    ? `<div class="box"><div class="box-title">Expenses</div><table class="cases">
          <thead><tr><th>Date</th><th>Category</th><th class="amount">Amount</th></tr></thead>
          <tbody>${periodExpenses
            .map(
              (t) =>
                `<tr><td>${escapeHtml(formatShortDay(t.transaction_date))}</td><td>${escapeHtml(t.category)}</td><td class="amount">${escapeHtml(formatINR(Number(t.amount)))}</td></tr>`
            )
            .join("")}</tbody>
        </table></div>`
    : "";

  const ledgerTable =
    ledgerRows.length === 0
      ? `<p class="empty">${range ? "No fee entries in this period." : "No fee entries yet."}</p>`
      : `<table class="ledger">
          <thead><tr><th>Date</th><th>Details</th><th class="amount">Pending(-)</th><th class="amount">Received(+)</th><th class="amount">Balance</th></tr></thead>
          ${[...monthGroups.entries()]
            .map(
              ([key, group]) => `
            <tbody>
              <tr class="month-header"><td colspan="5">${escapeHtml(formatMonth(key))}</td></tr>
              ${group.rows
                .map(
                  ({ t, balance }) => `<tr>
                    <td>${escapeHtml(formatShortDay(t.transaction_date))}</td>
                    <td>${escapeHtml(t.category)}${!caseTitle && t.cases?.title ? ` <span class="muted">(${escapeHtml(t.cases.title)})</span>` : ""}</td>
                    <td class="amount pending">${t.status === "pending" ? escapeHtml(formatINR(Number(t.amount))) : ""}</td>
                    <td class="amount received">${t.status === "completed" ? escapeHtml(formatINR(Number(t.amount))) : ""}</td>
                    <td class="amount">${escapeHtml(formatINR(balance))}</td>
                  </tr>`
                )
                .join("")}
              <tr class="month-total">
                <td colspan="2">${escapeHtml(formatMonth(key))} Total</td>
                <td class="amount">${escapeHtml(formatINR(group.pending))}</td>
                <td class="amount">${escapeHtml(formatINR(group.received))}</td>
                <td></td>
              </tr>
            </tbody>`
            )
            .join("")}
        </table>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; text-align: center; }
  .doc-type { color: #64748B; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 10px; text-align: center; }
  .subtitle { color: #475569; font-size: 13px; margin: 0 0 4px; text-align: center; }
  .period { color: #64748B; font-size: 12px; margin: 0 0 24px; text-align: center; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .muted { color: #94A3B8; font-size: 12px; }
  .empty { color: #64748B; padding: 24px 0; text-align: center; }
  .disclaimer { color: #94A3B8; font-size: 11px; margin-top: 12px; font-style: italic; }
  .signoff { margin-top: 32px; font-size: 13px; }
  .as-of { color: #64748B; font-size: 12px; margin: -18px 0 24px; text-align: center; }
  .cards-table { width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 0 0 24px; }
  .cards-table td { width: 25%; vertical-align: top; padding: 0; border: 1px solid #E2E8F0; border-radius: 8px; }
  .card { padding: 12px 14px; }
  .card-label { display: block; font-size: 11px; color: #64748B; }
  .card-value { display: block; font-size: 17px; font-weight: 700; margin-top: 4px; }
  .card-value.credit { color: #15803D; }
  .card-value.debit { color: #B3261E; }
  .card-note { display: block; font-size: 11px; color: #94A3B8; margin-top: 2px; }
  .entries-count { font-size: 12px; color: #475569; margin: 0 0 8px; }
  table.ledger th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; padding: 8px 4px; border-bottom: 1px solid #CBD5E1; }
  table.ledger td { padding: 9px 4px; border-bottom: 1px solid #F1F5F9; }
  table.ledger td.amount { text-align: right; font-variant-numeric: tabular-nums; }
  table.ledger td.pending { color: #B3261E; }
  table.ledger td.received { color: #15803D; }
  tr.month-header td { background: #F8FAFC; font-weight: 600; font-size: 12px; padding: 8px 4px; border-bottom: 1px solid #E2E8F0; }
  tr.month-total td { font-weight: 600; background: #FAFAFA; border-bottom: 2px solid #E2E8F0; }
  .boxes-table { width: 100%; border-collapse: separate; border-spacing: 16px 0; margin: 0 0 24px; }
  .boxes-table td { width: 50%; vertical-align: top; padding: 0; border: none; }
  .box { background: #F8FAFC; border-radius: 8px; padding: 14px 16px; }
  .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; margin-bottom: 8px; }
  table.box-rows { width: 100%; border-collapse: collapse; }
  table.box-rows td { padding: 3px 0; font-size: 13px; border: none; }
  td.box-label { color: #64748B; width: 42%; }
  table.cases { margin-top: 6px; }
  table.cases td { padding: 6px 4px; border-bottom: 1px solid #F1F5F9; }
  table.cases th { text-align: left; font-size: 11px; text-transform: uppercase; color: #64748B; padding: 6px 4px; }
  table.cases td.amount { text-align: right; }
</style>
</head>
<body>
  <h1>${escapeHtml(clientName)}</h1>
  <p class="doc-type">Statement</p>
  <p class="subtitle">${[clientPhone ? `Phone: ${clientPhone}` : null, caseTitle ? `Case: ${caseTitle}${caseNumber ? ` (${caseNumber})` : ""}` : null]
    .filter((s): s is string => s !== null)
    .map(escapeHtml)
    .join(" · ")}</p>
  <p class="period">
    (${escapeHtml(periodLabel ?? "Complete transaction history")}) ·
    ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </p>
  ${
    overallExpenses > 0
      ? `<p class="as-of">Total (fees + expenses): ${escapeHtml(formatINR(overallTotal))} — Agreed fees ${escapeHtml(formatINR(overallTotal - overallExpenses))}, Expenses ${escapeHtml(formatINR(overallExpenses))}</p>`
      : ""
  }

  <table class="boxes-table"><tr>
    <td>${detailBox("Client details", [["Name", clientName], ...clientDetailRows])}</td>
    <td>${detailBox("Case details", caseDetailRows)}</td>
  </tr></table>
  ${casesTable}

  <table class="cards-table"><tr>
    ${summaryCards
      .map(
        ([label, value, note], i) => `<td><div class="card">
          <span class="card-label">${escapeHtml(label)}</span>
          <span class="card-value ${i === 2 ? "credit" : i === 1 ? "debit" : ""}">${escapeHtml(value)}</span>
          ${note ? `<span class="card-note">${escapeHtml(note)}</span>` : ""}
        </div></td>`
      )
      .join("")}
  </tr></table>
  ${asOf ? `<p class="as-of">Position as of the last transaction, ${escapeHtml(formatDay(asOf))}.</p>` : ""}

  <p class="entries-count">No. of entries: ${ledgerRows.length}${periodLabel ? ` (${escapeHtml(periodLabel)})` : ""}</p>
  ${ledgerTable}
  ${expensesTable}

  ${
    advocateName
      ? `<p class="signoff">Regards,<br />${escapeHtml(advocateName)}${
          advocatePhone || advocateAddress
            ? `<br /><span class="muted">${[advocatePhone, advocateAddress].filter((s): s is string => !!s).map(escapeHtml).join(" · ")}</span>`
            : ""
        }</p>`
      : ""
  }
  <p class="disclaimer">This is an electronically generated statement — no signature required.</p>
</body>
</html>`;
}

/**
 * expo-print's web implementation ignores whatever HTML is passed to
 * printToFileAsync/printAsync entirely — its whole implementation is
 * `async printToFileAsync() { window.print(); }` — so it was printing
 * *this app's own page*, not the statement. There is no web build of
 * expo-print that actually renders arbitrary HTML, so on web we open the
 * statement in its own tab and print that tab instead: the one reliable,
 * dependency-free way to turn arbitrary HTML into a "Save as PDF" prompt
 * in a browser.
 */
function printHtmlOnWeb(html: string) {
  const win = window.open("", "_blank");
  if (!win) {
    alertMessage("Pop-up blocked", "Allow pop-ups for this site, then try again.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Let the new document finish laying out before printing — some
  // browsers ignore print() called synchronously right after write().
  setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
}

/** Generates the statement as a PDF and hands it to the OS to save or
 * share. On web this opens the statement in a new tab and triggers the
 * browser's print dialog, where "Save as PDF" produces the file; on
 * native it saves a real PDF file and opens the share sheet. */
export async function downloadStatementPdf(input: StatementInput, title: string) {
  const html = buildStatementHtml(input);
  try {
    if (Platform.OS === "web") {
      printHtmlOnWeb(html);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
    }
  } catch (err) {
    alertMessage("Couldn't create PDF", err instanceof Error ? err.message : "Something went wrong");
  }
}

/** Indian mobile numbers are stored however the advocate typed them;
 * WhatsApp needs digits with a country code. */
function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 11 ? digits : null;
}

async function open(url: string, appName: string) {
  try {
    await Linking.openURL(url);
  } catch {
    alertMessage(`Couldn't open ${appName}`, `Make sure ${appName} is installed, or use "More options".`);
  }
}

export function shareViaWhatsApp(text: string, phone?: string | null) {
  const number = toWhatsAppNumber(phone);
  // wa.me works whether or not WhatsApp is installed (falls back to the browser).
  return open(`https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`, "WhatsApp");
}

export function shareViaEmail(text: string, subject: string, email?: string | null) {
  return open(
    `mailto:${email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
    "your email app"
  );
}

export function shareViaSms(text: string, phone?: string | null) {
  const separator = Platform.OS === "ios" ? "&" : "?";
  return open(`sms:${phone ?? ""}${separator}body=${encodeURIComponent(text)}`, "Messages");
}

export function shareViaSystem(text: string, title: string) {
  return Share.share({ title, message: text });
}

/**
 * Sends the statement to the client via WhatsApp as a PDF rather than
 * editable plain text. WhatsApp's own deep link (wa.me) only ever supports
 * pre-filled text — there is no link-based way, on any platform, to have a
 * file already attached when the chat opens; that's a WhatsApp limitation,
 * not something an app-level integration can work around. The closest
 * available approximations:
 *  - Native: the PDF is generated and handed to the OS share sheet, where
 *    WhatsApp appears as a destination with the file already attached —
 *    one extra tap (choosing WhatsApp there) versus deep-linking straight
 *    into it, which the platform doesn't allow for files.
 *  - Web: there's no share sheet at all, so this opens the browser's print
 *    dialog to save the PDF, then opens the WhatsApp chat so it's ready —
 *    the file has to be attached by hand from there.
 */
export async function shareStatementViaWhatsApp(input: StatementInput, phone: string | null | undefined, title: string) {
  if (Platform.OS === "web") {
    alertMessage(
      "Save the PDF, then attach it",
      "The print dialog opens next — choose \"Save as PDF\". WhatsApp will then open so you can attach the saved file to the chat."
    );
    printHtmlOnWeb(buildStatementHtml(input));
    await shareViaWhatsApp(`Sending the payment statement PDF for ${input.clientName}.`, phone);
    return;
  }
  try {
    const { uri } = await Print.printToFileAsync({ html: buildStatementHtml(input) });
    if (!(await Sharing.isAvailableAsync())) {
      alertMessage("Sharing unavailable", "This device can't share files.");
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
  } catch (err) {
    alertMessage("Couldn't create PDF", err instanceof Error ? err.message : "Something went wrong");
  }
}
