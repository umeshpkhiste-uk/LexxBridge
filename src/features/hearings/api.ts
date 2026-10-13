import { supabase } from "@/shared/lib/supabase";

export type HearingStatus = "scheduled" | "completed" | "adjourned" | "cancelled" | "unknown";

export type Hearing = {
  id: string;
  case_id: string;
  court: string | null;
  courtroom: string | null;
  hearing_at: string;
  hearing_type: string | null;
  purpose: string | null;
  status: HearingStatus;
  notes: string | null;
  outcome: string | null;
  arguments: string | null;
  orders: string | null;
  next_action: string | null;
  next_hearing_at: string | null;
};

const COLUMNS =
  "id, case_id, court, courtroom, hearing_at, hearing_type, purpose, status, notes, outcome, arguments, orders, next_action, next_hearing_at";

export async function getHearing(id: string): Promise<Hearing> {
  const { data, error } = await supabase.from("hearings").select(COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Hearing;
}

export async function listHearingsForCase(caseId: string): Promise<Hearing[]> {
  const { data, error } = await supabase
    .from("hearings")
    .select(COLUMNS)
    .eq("case_id", caseId)
    .order("hearing_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Hearing[];
}

export type UpcomingHearing = Hearing & {
  cases: {
    title: string;
    case_type: string | null;
    case_number: string | null;
    court: string | null;
    client_id: string;
    clients: { full_name: string } | null;
  } | null;
};

/** Hearings still to happen in a date range (cancelled, completed and
 * adjourned ones are excluded), soonest first, with case + client details. */
export async function listUpcomingHearings(params: { from: Date; to: Date }): Promise<UpcomingHearing[]> {
  const { data, error } = await supabase
    .from("hearings")
    .select(`${COLUMNS}, cases(title, case_type, case_number, court, client_id, clients(full_name))`)
    .in("status", ["scheduled", "unknown"])
    .gte("hearing_at", params.from.toISOString())
    .lte("hearing_at", params.to.toISOString())
    .order("hearing_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return data as unknown as UpcomingHearing[];
}

export async function createHearing(input: {
  caseId: string;
  hearingAt: Date;
  court?: string;
  courtroom?: string;
  hearingType?: string;
  purpose?: string;
}): Promise<Hearing> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const { data, error } = await supabase
    .from("hearings")
    .insert({
      advocate_id: userData.user.id,
      case_id: input.caseId,
      hearing_at: input.hearingAt.toISOString(),
      court: input.court?.trim() || null,
      courtroom: input.courtroom?.trim() || null,
      hearing_type: input.hearingType?.trim() || null,
      purpose: input.purpose?.trim() || null,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as Hearing;
}

export async function completeHearing(
  id: string,
  input: {
    outcome?: string;
    arguments?: string;
    orders?: string;
    nextAction?: string;
    nextHearingAt?: Date | null;
    status?: HearingStatus;
  }
): Promise<void> {
  const { error } = await supabase
    .from("hearings")
    .update({
      status: input.status ?? "completed",
      outcome: input.outcome?.trim() || null,
      arguments: input.arguments?.trim() || null,
      orders: input.orders?.trim() || null,
      next_action: input.nextAction?.trim() || null,
      next_hearing_at: input.nextHearingAt ? input.nextHearingAt.toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/** Sets a case's next hearing date: moves the soonest upcoming hearing to the
 * new time, or schedules one if the case has none. The database trigger keeps
 * cases.next_hearing_at in sync. */
export async function setNextHearing(caseId: string, hearingAt: Date): Promise<void> {
  const { data: upcoming, error: findError } = await supabase
    .from("hearings")
    .select("id")
    .eq("case_id", caseId)
    .in("status", ["scheduled", "unknown"])
    .gte("hearing_at", new Date().toISOString())
    .order("hearing_at", { ascending: true })
    .limit(1);
  if (findError) throw new Error(findError.message);

  if (upcoming?.[0]) {
    const { error } = await supabase
      .from("hearings")
      .update({ hearing_at: hearingAt.toISOString(), status: "scheduled" })
      .eq("id", upcoming[0].id);
    if (error) throw new Error(error.message);
    return;
  }

  await createHearing({ caseId, hearingAt });
}

/** Edits a hearing's schedule and details. */
export async function updateHearing(
  id: string,
  input: { hearingAt: Date; court?: string; courtroom?: string; hearingType?: string; purpose?: string }
): Promise<void> {
  const { error } = await supabase
    .from("hearings")
    .update({
      hearing_at: input.hearingAt.toISOString(),
      court: input.court?.trim() || null,
      courtroom: input.courtroom?.trim() || null,
      hearing_type: input.hearingType?.trim() || null,
      purpose: input.purpose?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
