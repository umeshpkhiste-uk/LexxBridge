import { decode } from "base64-arraybuffer";
import { fileUriToBase64 } from "@/shared/lib/fileBase64";
import { supabase } from "@/shared/lib/supabase";

const PHOTO_BUCKET = "profile-photos";

export type AdvocateProfile = {
  id: string;
  full_name: string;
  headline: string | null;
  about: string | null;
  city: string | null;
  state: string | null;
  languages: string[];
  practice_areas: string[];
  courts: string[];
  years_of_experience: number | null;
  website: string | null;
  profile_photo_url: string | null;
  verification_status: "unverified" | "pending" | "verified" | "rejected" | "expired";
  profile_visibility: "public" | "connections_only" | "private";
  date_of_birth: string | null;
  gender: Gender | null;
  phone: string | null;
  address_line: string | null;
  pincode: string | null;
  notifications_enabled: boolean;
  education: EducationEntry[];
  bar_memberships: string[];
  chamber_address: string | null;
  bar_registration_number: string | null;
  bar_council_state: string | null;
  onboarding_completed_at: string | null;
};

export type EducationEntry = { degree: string; institution?: string; year?: string; note?: string };

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export async function getMyProfile(): Promise<AdvocateProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const { data, error } = await supabase
    .from("advocate_profiles")
    .select(
      "id, full_name, headline, about, city, state, languages, practice_areas, courts, years_of_experience, website, profile_photo_url, verification_status, profile_visibility, date_of_birth, gender, phone, address_line, pincode, notifications_enabled, education, bar_memberships, chamber_address, bar_registration_number, bar_council_state, onboarding_completed_at"
    )
    .eq("id", userData.user.id)
    .single();

  if (error) throw new Error(error.message);
  return data as AdvocateProfile;
}

export async function updateMyProfile(
  patch: Partial<
    Pick<
      AdvocateProfile,
      | "full_name"
      | "headline"
      | "about"
      | "city"
      | "state"
      | "years_of_experience"
      | "website"
      | "profile_visibility"
      | "date_of_birth"
      | "gender"
      | "phone"
      | "address_line"
      | "pincode"
      | "notifications_enabled"
      | "languages"
      | "practice_areas"
      | "courts"
      | "education"
      | "bar_memberships"
      | "chamber_address"
      | "bar_registration_number"
      | "bar_council_state"
      | "profile_photo_url"
      | "onboarding_completed_at"
    >
  >
): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const { error } = await supabase.from("advocate_profiles").update(patch).eq("id", userData.user.id);
  if (error) throw new Error(error.message);
}

/** Marks the first-login profile setup as done (saved or skipped). */
export function completeOnboarding(): Promise<void> {
  return updateMyProfile({ onboarding_completed_at: new Date().toISOString() });
}

/** Uploads a new profile photo and points the profile at it. Returns the URL. */
export async function uploadProfilePhoto(uri: string, mimeType?: string | null): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");
  const me = userData.user.id;

  const contentType = mimeType ?? "image/jpeg";
  const ext = contentType.split("/")[1] ?? "jpg";
  // A fresh file name per upload so cached copies of the old photo never linger.
  const path = `${me}/${Date.now()}.${ext}`;
  const base64 = await fileUriToBase64(uri);
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, decode(base64), { contentType });
  if (uploadError) throw new Error(uploadError.message);

  const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  await updateMyProfile({ profile_photo_url: url });
  return url;
}

/** Cases on the advocate's own books (private — shown only to them). */
export async function countMyCases(): Promise<number> {
  const { count, error } = await supabase.from("cases").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}
