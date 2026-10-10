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
  email: string;
  city: string | null;
  state: string | null;
  verification_status: "unverified" | "pending" | "verified" | "rejected" | "expired";
  is_blocked: boolean;
  blocked_reason: string | null;
  created_at: string;
};

/** Full user directory, via the admin_list_profiles() function rather than
 * an RLS policy on advocate_profiles — so an ordinary user's own profile
 * read never carries any admin-related check, and this capability lives
 * entirely on its own instead of being woven into the main user table. */
export async function listProfiles(search?: string): Promise<AdminProfileRow[]> {
  const { data, error } = await supabase.rpc("admin_list_profiles", { search: search?.trim() || null });
  if (error) throw new Error(error.message);
  return data;
}

/** Blocking lives in its own `blocked_users` table (see
 * supabase/migrations/0048_decouple_admin.sql), not a flag on
 * advocate_profiles — admin is a separate entity, not mixed into the
 * user's own data. */
export async function blockUser(targetId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("admin_block_user", { target_id: targetId, block_reason: reason?.trim() || null });
  if (error) throw new Error(error.message);
}

export async function unblockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_unblock_user", { target_id: targetId });
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
  const { data, error } = await supabase.rpc("admin_list_reports");
  if (error) throw new Error(error.message);
  return data;
}

export async function setReportStatus(reportId: string, status: AdminReportRow["status"]): Promise<void> {
  const { error } = await supabase.rpc("admin_set_report_status", { report_id: reportId, new_status: status });
  if (error) throw new Error(error.message);
}

export type AdminVerificationRequest = {
  id: string;
  advocate_id: string;
  full_name: string;
  bar_registration_number: string;
  bar_council_state: string;
  document_storage_path: string;
  status: "unverified" | "pending" | "verified" | "rejected" | "expired";
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

/** Review queue lives in its own `verification_requests` table (see
 * supabase/migrations/0062_advocate_verification.sql), reached only
 * through these two functions — same "admin is a separate entity" shape as
 * listProfiles/listReports above; no RLS policy on advocate_profiles. */
export async function listVerificationRequests(): Promise<AdminVerificationRequest[]> {
  const { data, error } = await supabase.rpc("admin_list_verification_requests");
  if (error) throw new Error(error.message);
  return data;
}

export async function setVerificationStatus(
  requestId: string,
  status: "verified" | "rejected",
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_verification_status", {
    request_id: requestId,
    new_status: status,
    notes: notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/** Short-lived signed URL so an admin can view a submitted ID/certificate
 * photo — mirrors getDocumentSignedUrl in features/documents/api.ts. */
export async function getVerificationDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from("verification-documents").createSignedUrl(storagePath, 60 * 5);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
