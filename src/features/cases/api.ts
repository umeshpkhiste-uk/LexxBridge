import { supabase } from "@/shared/lib/supabase";

export type CasePriority = "low" | "medium" | "high";

export type CaseSummary = {
  id: string;
  title: string;
  case_number: string | null;
  case_type: string | null;
  court: string | null;
  /** Total fees agreed with the client for this case (₹), if set. */
  agreed_fee: number | null;
  priority: CasePriority;
  next_hearing_at: string | null;
  client_id: string;
  clients: { full_name: string } | null;
  created_at: string;
};

export type CaseDetail = CaseSummary & {
  bench: string | null;
  filing_date: string | null;
  registration_date: string | null;
  description: string | null;
  internal_notes: string | null;
  tags: string[];
  is_archived: boolean;
};

const CASE_SUMMARY_COLUMNS =
  "id, title, case_number, case_type, court, agreed_fee, priority, next_hearing_at, client_id, created_at, clients(full_name)";

const CASE_DETAIL_COLUMNS = `
  id, title, case_number, case_type, court, bench, filing_date, registration_date,
  priority, agreed_fee, description, internal_notes, tags,
  next_hearing_at, is_archived, client_id, created_at, clients(full_name)
`;

export async function listCases(
  params: {
    search?: string;
    clientId?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {}
): Promise<CaseSummary[]> {
  let query = supabase
    .from("cases")
    .select(CASE_SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    // Spec §43: never load unbounded record sets. This is a cap, not full
    // pagination — fine for a single advocate's practice today, but a
    // cursor-based "load more" is the follow-up once case counts grow past
    // what one screen should render anyway.
    .limit(params.limit ?? 100);

  if (!params.includeArchived) query = query.eq("is_archived", false);
  if (params.clientId) query = query.eq("client_id", params.clientId);
  if (params.search?.trim()) query = query.ilike("title", `%${params.search.trim()}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as unknown as CaseSummary[];
}

export async function getCase(id: string): Promise<CaseDetail> {
  const { data, error } = await supabase.from("cases").select(CASE_DETAIL_COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as unknown as CaseDetail;
}

export async function createCase(input: {
  clientId: string;
  title: string;
  caseNumber?: string;
  caseType?: string;
  court?: string;
  bench?: string;
  priority?: CasePriority;
  /** Date-only, YYYY-MM-DD. */
  filingDate?: string | null;
  registrationDate?: string | null;
  description?: string;
  internalNotes?: string;
  agreedFee?: number | null;
}): Promise<CaseDetail> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const { data, error } = await supabase
    .from("cases")
    .insert({
      advocate_id: userData.user.id,
      client_id: input.clientId,
      title: input.title.trim(),
      case_number: input.caseNumber?.trim() || null,
      case_type: input.caseType?.trim() || null,
      court: input.court?.trim() || null,
      bench: input.bench?.trim() || null,
      priority: input.priority ?? "medium",
      filing_date: input.filingDate ?? null,
      registration_date: input.registrationDate ?? null,
      description: input.description?.trim() || null,
      internal_notes: input.internalNotes?.trim() || null,
      agreed_fee: input.agreedFee ?? null,
    })
    .select(CASE_DETAIL_COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit_event", {
    p_action: "case_created",
    p_resource_type: "case",
    p_resource_id: data.id,
  });

  return data as unknown as CaseDetail;
}

export async function updateCase(
  id: string,
  patch: Partial<{
    title: string;
    caseNumber: string | null;
    caseType: string | null;
    court: string | null;
    bench: string | null;
    description: string | null;
    internalNotes: string | null;
    priority: CasePriority;
    /** Date-only, YYYY-MM-DD. */
    filingDate: string | null;
    registrationDate: string | null;
    agreedFee: number | null;
  }>
): Promise<void> {
  const { error } = await supabase
    .from("cases")
    .update({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.caseNumber !== undefined ? { case_number: patch.caseNumber } : {}),
      ...(patch.caseType !== undefined ? { case_type: patch.caseType } : {}),
      ...(patch.court !== undefined ? { court: patch.court } : {}),
      ...(patch.bench !== undefined ? { bench: patch.bench } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.internalNotes !== undefined ? { internal_notes: patch.internalNotes } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.filingDate !== undefined ? { filing_date: patch.filingDate } : {}),
      ...(patch.registrationDate !== undefined ? { registration_date: patch.registrationDate } : {}),
      ...(patch.agreedFee !== undefined ? { agreed_fee: patch.agreedFee } : {}),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function setCaseArchived(id: string, isArchived: boolean): Promise<void> {
  const { error } = await supabase.from("cases").update({ is_archived: isArchived }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Permanently deletes a case and everything attached to it: hearings,
 * meetings, tasks, case participants and documents cascade in the
 * database; transactions linked to this case cascade too (case_id's FK
 * was changed to ON DELETE CASCADE for this). Storage files (case
 * documents and any transaction receipts, both in the `documents` bucket)
 * don't get cleaned up by a Postgres cascade, so they're removed
 * explicitly first. Irreversible — callers must confirm with the user
 * before calling this. */
export async function deleteCase(id: string): Promise<void> {
  const [{ data: docs }, { data: txReceipts }] = await Promise.all([
    supabase.from("documents").select("storage_path").eq("case_id", id),
    supabase.from("transactions").select("receipt_path").eq("case_id", id).not("receipt_path", "is", null),
  ]);
  const paths = [...(docs ?? []).map((d) => d.storage_path), ...(txReceipts ?? []).map((t) => t.receipt_path as string)];
  if (paths.length) {
    // Best-effort: a stray orphaned file is recoverable manually later;
    // blocking the actual case deletion on a storage hiccup is worse.
    await supabase.storage.from("documents").remove(paths).catch(() => {});
  }
  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
