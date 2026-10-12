import { disableBiometric, forgetSavedLogin } from "@/features/biometric/biometric";
import { clearAppLock } from "@/features/applock/appLock";
import { clearDeviceNotifications } from "@/features/notifications/device";
import { supabase } from "@/shared/lib/supabase";

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
  return data.user.id;
}

/**
 * Everything the advocate owns, as one JSON object — spec §35's "data
 * export". Deliberately excludes other advocates' data even where a table
 * join might reach it (e.g. messages only include ones sent to/by this
 * user) — this is an export of *your* data, not a data-processing loophole.
 */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const me = await currentUserId();

  const [
    profile,
    clients,
    cases,
    hearings,
    meetings,
    communications,
    tasks,
    transactions,
    documents,
    posts,
    connections,
  ] = await Promise.all([
    supabase.from("advocate_profiles").select("*").eq("id", me).single(),
    supabase.from("clients").select("*").eq("advocate_id", me),
    supabase.from("cases").select("*").eq("advocate_id", me),
    supabase.from("hearings").select("*").eq("advocate_id", me),
    supabase.from("meetings").select("*").eq("advocate_id", me),
    supabase.from("communications").select("*").eq("advocate_id", me),
    supabase.from("tasks").select("*").eq("advocate_id", me),
    supabase.from("transactions").select("*").eq("advocate_id", me),
    supabase.from("documents").select("id, file_name, category, case_id, client_id, created_at").eq("advocate_id", me),
    supabase.from("posts").select("*").eq("author_id", me),
    supabase.from("connections").select("*").or(`requester_id.eq.${me},addressee_id.eq.${me}`),
  ]);

  return {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    clients: clients.data,
    cases: cases.data,
    hearings: hearings.data,
    meetings: meetings.data,
    communications: communications.data,
    tasks: tasks.data,
    transactions: transactions.data,
    documents: documents.data,
    posts: posts.data,
    connections: connections.data,
  };
}

/**
 * Deletes every uploaded file (documents + post images) before deleting the
 * account — the DB cascade (see migration 0020) removes every row that
 * references this user, but it can't reach into Storage, so orphaned files
 * would otherwise survive account deletion.
 */
/** Every file path under a folder, including sub-folders (Storage's list()
 * is one level deep; entries without an id are folders). */
async function listAllFiles(bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...(await listAllFiles(bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return paths;
}

async function removeAll(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
}

/** Removes every file the user uploaded: documents, client photos and
 * receipts (documents/<me>/…), post images, profile photos, and the photos /
 * files they sent in chats. Storage files can't be deleted from SQL, so this
 * runs before the account row is removed. */
async function deleteMyStorageFiles(): Promise<void> {
  const me = await currentUserId();

  for (const bucket of ["documents", "post-images", "post-videos", "profile-photos"] as const) {
    await removeAll(bucket, await listAllFiles(bucket, me));
  }

  // Chat attachments live under each conversation's folder; only the files
  // this user uploaded can (and will) be removed.
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id")
    .or(`participant_one_id.eq.${me},participant_two_id.eq.${me}`);
  for (const c of conversations ?? []) {
    await removeAll("message-attachments", await listAllFiles("message-attachments", c.id));
  }
}

export async function deleteMyAccount(): Promise<void> {
  const me = await currentUserId();
  await deleteMyStorageFiles();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(error.message);

  // The account — including its auth.users row — is already gone at this
  // point, so every step below is local-only cleanup and must never surface
  // as a "deletion failed" error. In particular, signOut() must use the
  // "local" scope: its default ("global") calls GoTrue's logout endpoint,
  // which looks the user up by the JWT's sub claim and fails with "User
  // from sub claim in JWT does not exist" now that the row is gone.
  await disableBiometric().catch(() => {});
  await forgetSavedLogin().catch(() => {});
  await clearAppLock(me).catch(() => {});
  await clearDeviceNotifications().catch(() => {});
  await supabase.auth.signOut({ scope: "local" });
}
