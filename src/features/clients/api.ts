import { decode } from "base64-arraybuffer";
import { fileUriToBase64 } from "@/shared/lib/fileBase64";
import { supabase } from "@/shared/lib/supabase";

const PHOTO_BUCKET = "documents";

export type ClientType = "individual" | "organization";

export type Client = {
  id: string;
  full_name: string;
  client_type: ClientType;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  /** The advocate's own private assessment notes (e.g. reliability
   * concerns) — never shown to the client, never shared with any other
   * advocate. Kept separate from `notes` (general client info/preferences)
   * on purpose, same split as cases.description vs cases.internal_notes. */
  private_notes: string | null;
  is_archived: boolean;
  created_at: string;
  /** Private storage path of the client's photo, if one was added. */
  photo_path: string | null;
  /** Organization clients only. */
  contact_person_name: string | null;
};

const CLIENT_COLUMNS =
  "id, full_name, client_type, phone, email, address, notes, private_notes, is_archived, created_at, photo_path, contact_person_name";

export type ClientCaseBrief = { id: string; title: string; court: string | null; created_at: string; is_archived: boolean };
export type ClientListItem = Client & { cases: ClientCaseBrief[] };

export async function listClients(
  params: { search?: string; includeArchived?: boolean; limit?: number } = {}
): Promise<ClientListItem[]> {
  let query = supabase
    .from("clients")
    .select(`${CLIENT_COLUMNS}, cases(id, title, court, created_at, is_archived)`)
    .order("full_name", { ascending: true })
    .limit(params.limit ?? 200);

  if (!params.includeArchived) query = query.eq("is_archived", false);
  if (params.search?.trim()) query = query.ilike("full_name", `%${params.search.trim()}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as unknown as ClientListItem[];
}

export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase.from("clients").select(CLIENT_COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Client;
}

export async function createClientRecord(input: {
  fullName: string;
  clientType: ClientType;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  privateNotes?: string;
  contactPersonName?: string;
}): Promise<Client> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");
  const isOrg = input.clientType === "organization";

  const { data, error } = await supabase
    .from("clients")
    .insert({
      advocate_id: userData.user.id,
      full_name: input.fullName.trim(),
      client_type: input.clientType,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      private_notes: input.privateNotes?.trim() || null,
      contact_person_name: isOrg ? input.contactPersonName?.trim() || null : null,
    })
    .select(CLIENT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit_event", {
    p_action: "client_created",
    p_resource_type: "client",
    p_resource_id: data.id,
  });

  return data as Client;
}

export async function updateClient(
  id: string,
  patch: Partial<{
    fullName: string;
    clientType: ClientType;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    privateNotes: string | null;
    contactPersonName: string | null;
  }>
): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({
      ...(patch.fullName !== undefined ? { full_name: patch.fullName.trim() } : {}),
      ...(patch.clientType !== undefined ? { client_type: patch.clientType } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.privateNotes !== undefined ? { private_notes: patch.privateNotes } : {}),
      ...(patch.contactPersonName !== undefined ? { contact_person_name: patch.contactPersonName } : {}),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function setClientArchived(id: string, isArchived: boolean): Promise<void> {
  const { error } = await supabase.from("clients").update({ is_archived: isArchived }).eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.rpc("log_audit_event", {
    p_action: isArchived ? "client_archived" : "client_unarchived",
    p_resource_type: "client",
    p_resource_id: id,
  });
}

/** Uploads a client photo into the advocate's private folder and links it,
 * replacing (and deleting) any previous photo. */
export async function uploadClientPhoto(client: Pick<Client, "id" | "photo_path">, fileUri: string, mimeType = "image/jpeg"): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const path = `${userData.user.id}/client-photos/${client.id}-${Date.now()}.jpg`;
  const base64 = await fileUriToBase64(fileUri);
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, decode(base64), { contentType: mimeType });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("clients").update({ photo_path: path }).eq("id", client.id);
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (client.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([client.photo_path]);
  return path;
}

const photoUrlCache = new Map<string, { url: string; expires: number }>();

/** Short-lived signed URL for a client photo (the bucket is private). */
export async function getClientPhotoUrl(path: string): Promise<string> {
  const cached = photoUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  photoUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
