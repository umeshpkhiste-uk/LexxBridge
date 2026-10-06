import { supabase } from "@/shared/lib/supabase";

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
  return data.user.id;
}

/** Whether the signed-in user has an `admins` row. Resolves `false` (never
 * throws) for a non-admin, since RLS makes "no row" and "not allowed to
 * look" indistinguishable from the client — both are the normal, expected
 * case for every non-admin user. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const me = await currentUserId();
  const { data } = await supabase.from("admins").select("user_id").eq("user_id", me).maybeSingle();
  return data !== null;
}

export type AdminProfileRow = {
  id: string;
  full_name: string;
  city: string | null;
  state: string | null;
  verification_status: "unverified" | "pending" | "verified" | "rejected" | "expired";
  is_blocked: boolean;
  blocked_reason: string | null;
  created_at: string;
};

/** Full user directory. Only returns every row when the caller is an admin
 * — the `admin can read all profiles` RLS policy is what actually makes
 * this different from a normal advocate's own-row-only view; this function
 * doesn't need to (and can't) check admin status itself. */
export async function listProfiles(search?: string): Promise<AdminProfileRow[]> {
  let query = supabase
    .from("advocate_profiles")
    .select("id, full_name, city, state, verification_status, is_blocked, blocked_reason, created_at")
    .order("created_at", { ascending: false });
  if (search?.trim()) query = query.ilike("full_name", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function blockUser(targetId: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from("advocate_profiles")
    .update({ is_blocked: true, blocked_at: new Date().toISOString(), blocked_reason: reason?.trim() || null })
    .eq("id", targetId);
  if (error) throw new Error(error.message);
}

export async function unblockUser(targetId: string): Promise<void> {
  const { error } = await supabase
    .from("advocate_profiles")
    .update({ is_blocked: false, blocked_at: null, blocked_reason: null })
    .eq("id", targetId);
  if (error) throw new Error(error.message);
}

export type AdminReportRow = {
  id: string;
  reporter_id: string;
  target_type: "advocate" | "post" | "comment" | "message" | "conversation";
  target_id: string;
  reason: string;
  status: "open" | "reviewed" | "actioned" | "dismissed";
  created_at: string;
};

export async function listReports(): Promise<AdminReportRow[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("id, reporter_id, target_type, target_id, reason, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}

export async function setReportStatus(reportId: string, status: AdminReportRow["status"]): Promise<void> {
  const { error } = await supabase.from("reports").update({ status }).eq("id", reportId);
  if (error) throw new Error(error.message);
}
