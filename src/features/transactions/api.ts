import { decode } from "base64-arraybuffer";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/shared/lib/supabase";

const RECEIPT_BUCKET = "documents";

export type TransactionType = "income" | "expense";
export type TransactionStatus = "completed" | "pending";

export const INCOME_CATEGORIES = ["Professional fee", "Consultation fee", "Retainer", "Other income"];
export const EXPENSE_CATEGORIES = ["Court fee", "Filing expense", "Travel", "Documentation", "Clerk expense", "Miscellaneous"];
export const PAYMENT_METHODS = ["Cash", "UPI", "Bank transfer (NEFT/RTGS/IMPS)", "Cheque", "Card", "Demand draft", "Other"];

export type Transaction = {
  id: string;
  case_id: string | null;
  client_id: string | null;
  type: TransactionType;
  category: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  transaction_date: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  /** Private storage path of the receipt / payment screenshot, if any. */
  receipt_path: string | null;
};

const COLUMNS =
  "id, case_id, client_id, type, category, amount, currency, status, transaction_date, payment_method, reference_number, notes, receipt_path";

export async function listTransactionsForCase(caseId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(COLUMNS)
    .eq("case_id", caseId)
    .order("transaction_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Transaction[];
}

export type ClientTransaction = Transaction & { cases: { title: string } | null };

export async function listTransactionsForClient(clientId: string): Promise<ClientTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(`${COLUMNS}, cases(title)`)
    .eq("client_id", clientId)
    .order("transaction_date", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data as unknown as ClientTransaction[];
}

export async function createTransaction(input: {
  caseId?: string;
  clientId?: string;
  type: TransactionType;
  category: string;
  amount: number;
  status?: TransactionStatus;
  transactionDate?: Date;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
  receipt?: { uri: string; mimeType: string } | null;
}): Promise<Transaction> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const receiptPath = input.receipt ? await uploadReceipt(userData.user.id, input.receipt) : null;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      advocate_id: userData.user.id,
      case_id: input.caseId ?? null,
      client_id: input.clientId ?? null,
      type: input.type,
      category: input.category,
      amount: input.amount,
      status: input.status ?? "completed",
      transaction_date: (input.transactionDate ?? new Date()).toISOString().slice(0, 10),
      payment_method: input.paymentMethod?.trim() || null,
      reference_number: input.referenceNumber?.trim() || null,
      notes: input.notes?.trim() || null,
      receipt_path: receiptPath,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    if (receiptPath) await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath]);
    throw new Error(error.message);
  }
  return data as Transaction;
}

/** Uploads a receipt image into the advocate's private folder (the first
 * folder = their id, which the documents bucket policies check). */
async function uploadReceipt(userId: string, receipt: { uri: string; mimeType: string }): Promise<string> {
  const path = `${userId}/receipts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const base64 = await FileSystem.readAsStringAsync(receipt.uri, { encoding: "base64" });
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, decode(base64), { contentType: receipt.mimeType });
  if (error) throw new Error(error.message);
  return path;
}

export type TransactionDetail = Transaction & {
  created_at: string;
  cases: { title: string } | null;
  clients: { full_name: string } | null;
};

export async function getTransaction(id: string): Promise<TransactionDetail> {
  const { data, error } = await supabase
    .from("transactions")
    .select(`${COLUMNS}, created_at, cases(title), clients(full_name)`)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as TransactionDetail;
}

/** Edits a still-pending entry's category. */
export async function updateTransactionCategory(id: string, category: string): Promise<void> {
  const { error } = await supabase.from("transactions").update({ category }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Corrects a recorded entry — e.g. a mistyped amount — after the fact.
 * Case/client-wise totals are views over this table, so they pick up the
 * change automatically. */
export async function updateTransaction(
  id: string,
  input: {
    category: string;
    amount: number;
    transactionDate: Date;
    paymentMethod?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
  }
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      category: input.category,
      amount: input.amount,
      transaction_date: input.transactionDate.toISOString().slice(0, 10),
      payment_method: input.paymentMethod?.trim() || null,
      reference_number: input.referenceNumber?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as Transaction;
}

/** Deletes a recorded entry (and its receipt file, if any) — e.g. one added
 * by mistake. Case/client-wise totals recompute automatically since they're
 * views over this table. */
export async function deleteTransaction(transaction: Pick<Transaction, "id" | "receipt_path">): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", transaction.id);
  if (error) throw new Error(error.message);
  if (transaction.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([transaction.receipt_path]);
}

/** Short-lived signed URL for a transaction's receipt image. */
export async function getReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export type CaseFinancialSummary = {
  case_id: string;
  total_received: number;
  total_pending: number;
  total_expenses: number;
  net_amount: number;
};

export async function getCaseFinancialSummary(caseId: string): Promise<CaseFinancialSummary | null> {
  const { data, error } = await supabase
    .from("case_financial_summary")
    .select("case_id, total_received, total_pending, total_expenses, net_amount")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CaseFinancialSummary | null;
}

export type ClientFinancialSummary = {
  client_id: string;
  total_received: number;
  outstanding_amount: number;
  total_expenses: number;
};

export async function getClientFinancialSummary(clientId: string): Promise<ClientFinancialSummary | null> {
  const { data, error } = await supabase
    .from("client_financial_summary")
    .select("client_id, total_received, outstanding_amount, total_expenses")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ClientFinancialSummary | null;
}

/** Pending (unpaid) income per case, keyed by case id — for showing dues on
 * case cards without opening each case. */
export async function getPendingByCase(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("case_financial_summary")
    .select("case_id, total_pending")
    .gt("total_pending", 0);
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    (data as { case_id: string; total_pending: number }[]).map((r) => [r.case_id, Number(r.total_pending)])
  );
}

export type ClientDue = { client_id: string; full_name: string; outstanding: number; received: number };

/** Clients who owe money, largest balance first. */
export async function listClientDues(): Promise<ClientDue[]> {
  const { data, error } = await supabase
    .from("client_financial_summary")
    .select("client_id, total_received, outstanding_amount")
    .gt("outstanding_amount", 0)
    .order("outstanding_amount", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data as { client_id: string; total_received: number; outstanding_amount: number }[];
  if (rows.length === 0) return [];

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, full_name")
    .in("id", rows.map((r) => r.client_id));
  if (clientsError) throw new Error(clientsError.message);
  const names = new Map((clients as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]));

  return rows.map((r) => ({
    client_id: r.client_id,
    full_name: names.get(r.client_id) ?? "Client",
    outstanding: Number(r.outstanding_amount),
    received: Number(r.total_received),
  }));
}

export async function getTotalOutstanding(): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .select("amount")
    .eq("type", "income")
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return (data as { amount: number }[]).reduce((sum, t) => sum + Number(t.amount), 0);
}

export type PendingPayment = Transaction & {
  cases: { title: string } | null;
  clients: { full_name: string } | null;
};

export async function listPendingPayments(): Promise<PendingPayment[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(`${COLUMNS}, cases(title), clients(full_name)`)
    .eq("type", "income")
    .eq("status", "pending")
    .order("transaction_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data as unknown as PendingPayment[];
}

/**
 * Records a payment against a pending income transaction. If amountReceived
 * is less than the pending amount, the difference stays pending (as its own
 * transaction row) rather than being silently dropped — see migration 0012.
 */
/** Marks a pending fee (fully or partly) as received, optionally with how it
 * was paid and a receipt / screenshot.
 *
 * Generates one fresh idempotency key per call (not per retry of that same
 * call — a caller that wants its own retry to be safe should call this once
 * and let its own retry logic re-invoke this same function again, which
 * mints a new key each time it runs). The server uses that key to make a
 * replayed/duplicated request — a resent network call, a double-tap, or a
 * captured-and-resent request — a no-op instead of recording the same
 * payment twice. See migration 0058 for why this mattered: a partial
 * payment leaves the transaction "pending" (just with a reduced amount), so
 * without this a replay could keep crediting the same payment repeatedly. */
export async function recordPartialPayment(
  transactionId: string,
  amountReceived: number,
  options: { paymentMethod?: string | null; receipt?: { uri: string; mimeType: string } | null } = {},
): Promise<void> {
  let receiptPath: string | null = null;
  if (options.receipt) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");
    receiptPath = await uploadReceipt(userData.user.id, options.receipt);
  }
  const { error } = await supabase.rpc("record_partial_payment", {
    p_transaction_id: transactionId,
    p_amount_received: amountReceived,
    p_payment_method: options.paymentMethod ?? null,
    p_receipt_path: receiptPath,
    p_idempotency_key: Crypto.randomUUID(),
  });
  if (error) {
    if (receiptPath) await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath]);
    throw new Error(error.message);
  }
}
