import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "@/shared/lib/supabase";

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "expired";

export type VerificationRequest = {
  id: string;
  bar_registration_number: string;
  bar_council_state: string;
  status: VerificationStatus;
  admin_notes: string | null;
  created_at: string;
};

const BUCKET = "verification-documents";

export type MyVerification = {
  status: VerificationStatus;
  notes: string | null;
  requests: VerificationRequest[];
};

export async function getMyVerification(): Promise<MyVerification> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const [profileResult, requestsResult] = await Promise.all([
    supabase.from("advocate_profiles").select("verification_status, verification_notes").eq("id", userData.user.id).single(),
    supabase
      .from("verification_requests")
      .select("id, bar_registration_number, bar_council_state, status, admin_notes, created_at")
      .eq("advocate_id", userData.user.id)
      .order("created_at", { ascending: false }),
  ]);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (requestsResult.error) throw new Error(requestsResult.error.message);

  const profile = profileResult.data as { verification_status: VerificationStatus; verification_notes: string | null };
  return {
    status: profile.verification_status,
    notes: profile.verification_notes,
    requests: requestsResult.data as VerificationRequest[],
  };
}

export async function submitVerificationRequest(input: {
  fileUri: string;
  mimeType: string;
  barNumber: string;
  barState: string;
}): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  // First path segment must be the advocate's own auth.uid() — that's what
  // the storage.objects RLS policies (migration 0062) check.
  const extension = input.mimeType === "application/pdf" ? "pdf" : "jpg";
  const storagePath = `${userData.user.id}/${Date.now()}.${extension}`;

  const base64 = await FileSystem.readAsStringAsync(input.fileUri, { encoding: "base64" });
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, decode(base64), { contentType: input.mimeType });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.rpc("submit_verification_request", {
    p_bar_number: input.barNumber,
    p_bar_state: input.barState,
    p_document_path: storagePath,
  });
  if (error) {
    // Metadata insert failed after the file landed in storage — clean up so
    // we don't leak an orphaned, unreferenced object.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }
}
