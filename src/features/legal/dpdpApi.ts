import { UserFacingError } from "@/shared/lib/errors";
import { supabase } from "@/shared/lib/supabase";

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
  return data.user.id;
}

// --- Nominee (DPDP Act §14) ------------------------------------------------

export type Nominee = { full_name: string; relationship: string; email: string | null; phone: string | null; updated_at: string };

export async function getMyNominee(): Promise<Nominee | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("data_nominees")
    .select("full_name, relationship, email, phone, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveMyNominee(input: { fullName: string; relationship: string; email: string; phone: string }): Promise<void> {
  const fullName = input.fullName.trim();
  const relationship = input.relationship.trim();
  const email = input.email.trim().toLowerCase() || null;
  const phone = input.phone.trim() || null;
  if (!fullName) throw new UserFacingError("Enter your nominee's full name.");
  if (!relationship) throw new UserFacingError("Enter how they're related to you.");
  if (!email && !phone) throw new UserFacingError("Add an email or phone number so we can verify your nominee.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserFacingError("Enter a valid email address.");

  const userId = await currentUserId();
  const { error } = await supabase
    .from("data_nominees")
    .upsert({ user_id: userId, full_name: fullName, relationship, email, phone, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function removeMyNominee(): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from("data_nominees").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// --- Grievances (DPDP Act §13) ---------------------------------------------

/** Stated in the Privacy Policy too — keep the two in sync. */
export const GRIEVANCE_RESPONSE_DAYS = 90;

export const GRIEVANCE_CATEGORIES = [
  { key: "access", label: "Access my data" },
  { key: "correction", label: "Correct my data" },
  { key: "erasure", label: "Erase my data" },
  { key: "consent", label: "Consent" },
  { key: "nominee", label: "Nominee" },
  { key: "breach", label: "Data breach / misuse" },
  { key: "other", label: "Other" },
] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number]["key"];

export type Grievance = {
  id: string;
  reference: string;
  category: GrievanceCategory;
  description: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  resolved_at: string | null;
};

export async function listMyGrievances(): Promise<Grievance[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("data_grievances")
    .select("id, reference, category, description, status, created_at, resolved_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Grievance[];
}

/** Files the grievance (the record and its reference number are what the
 * response deadline runs from), then emails the team through the existing
 * feedback function so it's noticed straight away. The email is best-effort:
 * the stored row is the authoritative record either way. */
export async function fileGrievance(category: GrievanceCategory, description: string): Promise<Grievance> {
  const text = description.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (text.length < 10) throw new UserFacingError("Please describe the issue in a little more detail.");
  if (text.length > 4000) throw new UserFacingError("Please keep it under 4000 characters.");

  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("data_grievances")
    .insert({ user_id: userId, category, description: text })
    .select("id, reference, category, description, status, created_at, resolved_at")
    .single();
  if (error) throw new Error(error.message);

  const label = GRIEVANCE_CATEGORIES.find((c) => c.key === category)?.label ?? category;
  // send-feedback rejects over 500 words / 4000 chars; the stored row always
  // has the full text, so the email just carries a preview when needed.
  const words = text.split(/\s+/);
  const preview = words.length > 400 || text.length > 3000 ? `${words.slice(0, 400).join(" ").slice(0, 3000)}… (full text in data_grievances)` : text;
  supabase.functions
    .invoke("send-feedback", { body: { comment: `[DPDP GRIEVANCE ${data.reference} · ${label}]\n\n${preview}` } })
    .catch(() => {});
  return data as Grievance;
}

// --- Consent (DPDP Act §6(4)) ----------------------------------------------

export async function getMyLatestConsent(): Promise<{ policy_version: string; accepted_at: string } | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("user_consents")
    .select("policy_version, accepted_at")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}
