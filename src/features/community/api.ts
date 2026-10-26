import { decryptFromParty, encryptForRecipient, getPublicKey } from "@/features/messaging/encryption";
import { supabase } from "@/shared/lib/supabase";

export const MAX_COMMUNITY_MEMBERS = 50;

export type Community = {
  id: string;
  creator_id: string;
  name: string;
  created_at: string;
};

export type CommunityMember = {
  id: string;
  full_name: string;
  profile_photo_url: string | null;
  isCreator: boolean;
};

export type CommunitySummary = {
  community: Community;
  isCreator: boolean;
  memberCount: number;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
  return data.user.id;
}

/** Every community the advocate is part of — the one they created (if any)
 * plus any others they've been added to as a member. */
export async function listMyCommunities(): Promise<CommunitySummary[]> {
  const me = await currentUserId();

  const [ownedResult, memberRowsResult] = await Promise.all([
    supabase.from("communities").select("id, creator_id, name, created_at").eq("creator_id", me),
    supabase.from("community_members").select("community_id").eq("advocate_id", me),
  ]);
  if (ownedResult.error) throw new Error(ownedResult.error.message);
  if (memberRowsResult.error) throw new Error(memberRowsResult.error.message);

  const memberOfIds = memberRowsResult.data.map((r) => r.community_id);
  const [memberCommunitiesResult] = await Promise.all([
    memberOfIds.length
      ? supabase.from("communities").select("id, creator_id, name, created_at").in("id", memberOfIds)
      : Promise.resolve({ data: [] as Community[], error: null }),
  ]);
  if (memberCommunitiesResult.error) throw new Error(memberCommunitiesResult.error.message);

  const all = [...ownedResult.data, ...(memberCommunitiesResult.data ?? [])];
  if (!all.length) return [];

  const counts = await Promise.all(
    all.map((c) => supabase.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", c.id))
  );

  return all.map((community, i) => ({
    community,
    isCreator: community.creator_id === me,
    // +1 for the creator, who isn't a community_members row.
    memberCount: (counts[i].count ?? 0) + 1,
  }));
}

export async function getCommunity(id: string): Promise<Community> {
  const { data, error } = await supabase.from("communities").select("id, creator_id, name, created_at").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

/** Creates the caller's one allowed community — fails (unique constraint)
 * if they already created one. */
export async function createCommunity(name: string): Promise<Community> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from("communities")
    .insert({ creator_id: me, name: name.trim() })
    .select("id, creator_id, name, created_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("You've already created a community — only one per advocate.");
    throw new Error(error.message);
  }
  return data;
}

export async function addCommunityMember(communityId: string, advocateId: string): Promise<void> {
  const { error } = await supabase.rpc("add_community_member", { p_community_id: communityId, p_advocate_id: advocateId });
  if (error) throw new Error(error.message);
}

export async function removeCommunityMember(communityId: string, advocateId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_community_member", { p_community_id: communityId, p_advocate_id: advocateId });
  if (error) throw new Error(error.message);
}

export async function listCommunityMembers(community: Community): Promise<CommunityMember[]> {
  const { data: memberRows, error } = await supabase.from("community_members").select("advocate_id").eq("community_id", community.id);
  if (error) throw new Error(error.message);

  const ids = [community.creator_id, ...memberRows.map((r) => r.advocate_id)];
  const { data: profiles, error: profilesError } = await supabase
    .from("public_advocate_profiles")
    .select("id, full_name, profile_photo_url")
    .in("id", ids);
  if (profilesError) throw new Error(profilesError.message);

  const byId = new Map(profiles.map((p) => [p.id, p]));
  return ids
    .map((id) => {
      const profile = byId.get(id);
      if (!profile) return null;
      return { ...profile, isCreator: id === community.creator_id };
    })
    .filter((m): m is CommunityMember => m !== null);
}

export type CommunityMessage = {
  id: string;
  community_id: string;
  sender_id: string;
  content: string;
  is_undecryptable: boolean;
  created_at: string;
};

async function decryptPayload(content: string, nonce: string, senderPublicKey: string | null): Promise<{ content: string; is_undecryptable: boolean }> {
  if (!senderPublicKey) return { content: "Unable to decrypt — the sender hasn't enabled secure messaging yet.", is_undecryptable: true };
  const plaintext = await decryptFromParty({ content, nonce }, senderPublicKey);
  if (plaintext !== null) return { content: plaintext, is_undecryptable: false };
  return { content: "Unable to decrypt this message on this device.", is_undecryptable: true };
}

export async function listCommunityMessages(communityId: string): Promise<CommunityMessage[]> {
  const me = await currentUserId();

  const { data: messages, error } = await supabase
    .from("community_messages")
    .select("id, community_id, sender_id, created_at")
    .eq("community_id", communityId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  if (!messages.length) return [];

  const messageIds = messages.map((m) => m.id);
  const [payloadsResult, sendersResult] = await Promise.all([
    supabase.from("community_message_payloads").select("message_id, content, nonce").eq("recipient_id", me).in("message_id", messageIds),
    supabase.from("public_advocate_profiles").select("id, messaging_public_key").in(
      "id",
      [...new Set(messages.map((m) => m.sender_id))]
    ),
  ]);
  if (payloadsResult.error) throw new Error(payloadsResult.error.message);
  if (sendersResult.error) throw new Error(sendersResult.error.message);

  const payloadByMessageId = new Map(payloadsResult.data.map((p) => [p.message_id, p]));
  const senderKeyById = new Map(sendersResult.data.map((s) => [s.id, s.messaging_public_key ?? null]));

  return Promise.all(
    messages.map(async (m) => {
      const payload = payloadByMessageId.get(m.id);
      if (!payload) return { ...m, content: "Unable to decrypt this message on this device.", is_undecryptable: true };
      const decrypted = await decryptPayload(payload.content, payload.nonce, senderKeyById.get(m.sender_id) ?? null);
      return { ...m, ...decrypted };
    })
  );
}

/** Sends to every current member, including the sender (so they can decrypt
 * their own message again later, e.g. after reopening the app). */
export async function sendCommunityMessage(community: Community, content: string): Promise<CommunityMessage> {
  const me = await currentUserId();
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Message can't be empty");

  const members = await listCommunityMembers(community);
  const keyPairs = await Promise.all(
    members.map(async (m) => ({ id: m.id, key: m.id === me ? await getPublicKey(me) : await getPublicKey(m.id) }))
  );
  const missing = keyPairs.filter((k) => !k.key);
  if (missing.length) {
    throw new Error("Some members haven't enabled secure messaging yet — ask them to open the app once, then try again.");
  }

  const { data: message, error } = await supabase
    .from("community_messages")
    .insert({ community_id: community.id, sender_id: me })
    .select("id, community_id, sender_id, created_at")
    .single();
  if (error) throw new Error(error.message);

  const payloads = await Promise.all(
    keyPairs.map(async ({ id, key }) => {
      const sealed = await encryptForRecipient(trimmed, key!);
      return { message_id: message.id, recipient_id: id, content: sealed.content, nonce: sealed.nonce };
    })
  );
  const { error: payloadsError } = await supabase.from("community_message_payloads").insert(payloads);
  if (payloadsError) throw new Error(payloadsError.message);

  return { ...message, content: trimmed, is_undecryptable: false };
}

/** Live updates for one community's chat. */
export function subscribeToCommunityMessages(communityId: string, onNewMessage: (message: CommunityMessage) => void) {
  let me: string | null = null;
  currentUserId()
    .then((id) => (me = id))
    .catch(() => {});

  const channel = supabase
    .channel(`community-chat:${communityId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "community_messages", filter: `community_id=eq.${communityId}` },
      async (payload) => {
        const row = payload.new as { id: string; community_id: string; sender_id: string; created_at: string };
        if (!me) return;
        const { data: payloadRow } = await supabase
          .from("community_message_payloads")
          .select("content, nonce")
          .eq("message_id", row.id)
          .eq("recipient_id", me)
          .maybeSingle();
        if (!payloadRow) return;
        const { data: sender } = await supabase
          .from("public_advocate_profiles")
          .select("messaging_public_key")
          .eq("id", row.sender_id)
          .maybeSingle();
        const decrypted = await decryptPayload(payloadRow.content, payloadRow.nonce, sender?.messaging_public_key ?? null);
        onNewMessage({ ...row, ...decrypted });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
