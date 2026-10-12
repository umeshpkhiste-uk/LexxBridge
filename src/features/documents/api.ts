import { decode } from "base64-arraybuffer";
import { fileUriToBase64 } from "@/shared/lib/fileBase64";
import { supabase } from "@/shared/lib/supabase";

export type DocumentCategory =
  | "pleadings" | "orders" | "evidence" | "agreements" | "notices" | "identification" | "correspondence" | "other";

export type CaseDocument = {
  id: string;
  case_id: string | null;
  client_id: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  category: DocumentCategory;
  created_at: string;
};

const COLUMNS = "id, case_id, client_id, storage_path, file_name, file_size, mime_type, category, created_at";
const BUCKET = "documents";

export async function listDocumentsForCase(caseId: string): Promise<CaseDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select(COLUMNS)
    .eq("case_id", caseId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as CaseDocument[];
}

export async function uploadDocument(input: {
  caseId?: string;
  clientId?: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  category: DocumentCategory;
}): Promise<CaseDocument> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  // The storage path's first folder segment is the advocate's own auth.uid(),
  // which is exactly what the storage.objects RLS policies (see migration
  // 0010) check — this is what makes cross-advocate access impossible, not
  // just app-level filtering.
  const storagePath = `${userData.user.id}/${Date.now()}-${input.fileName}`;

  const base64 = await fileUriToBase64(input.fileUri);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, decode(base64), { contentType: input.mimeType });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("documents")
    .insert({
      advocate_id: userData.user.id,
      case_id: input.caseId ?? null,
      client_id: input.clientId ?? null,
      storage_path: storagePath,
      file_name: input.fileName,
      file_size: input.fileSize ?? null,
      mime_type: input.mimeType,
      category: input.category,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // Metadata insert failed after the file landed in storage — clean up so
    // we don't leak an orphaned, unreferenced object.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }

  return data as CaseDocument;
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 5);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteDocument(id: string, storagePath: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase.from("documents").update({ is_archived: true }).eq("id", id);
  if (error) throw new Error(error.message);
}
