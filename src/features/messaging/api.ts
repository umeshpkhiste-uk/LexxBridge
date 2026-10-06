import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/shared/lib/supabase";
import { decryptFromParty, encryptForRecipient, getPublicKey } from "./encryption";

const ATTACHMENT_BUCKET = "message-attachments";

/** A message row exactly as stored: `content` is ciphertext once `nonce` is
 * set (null `nonce` means a legacy plaintext message, sent before
 * encryption existed). Never exposed outside this file. */
type EncryptedMessageRow = Message & { nonce: string | null };

type DecryptResult = { content: string; undecryptable: boolean };

/** Decrypts `content` for display, given the sealed text and its nonce.
 * Encryption stays entirely internal to this module, so the rest of the
 * app only ever sees real text — plus a flag so the UI can tell a genuine
 * message apart from an explanatory placeholder (different device/key,
 * or the other person hasn't enabled secure messaging yet) instead of
 * rendering the placeholder text as if it were normal content. */
async function decryptText(content: string, nonce: string | null, otherPartyPublicKey: string | null): Promise<DecryptResult> {
  if (!nonce || !content) return { content, undecryptable: false };
  if (!otherPartyPublicKey) {
    return { content: "Unable to decrypt — the other person hasn't enabled secure messaging yet.", undecryptable: true };
  }
  const plaintext = await decryptFromParty({ content, nonce }, otherPartyPublicKey);
  if (plaintext !== null) return { content: plaintext, undecryptable: false };
  return { content: "Unable to decrypt this message on this device.", undecryptable: true };
}

/** Decrypts a full message row for display. */
async function decryptRow(row: EncryptedMessageRow, otherPartyPublicKey: string | null): Promise<Message> {
  const { nonce, ...message } = row;
  const { content, undecryptable } = await decryptText(message.content, nonce, otherPartyPublicKey);
  return { ...message, content, is_undecryptable: undecryptable };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
  return data.user.id;
}

export type ConversationSummary = {
  id: string;
  last_message_at: string;
  otherParty: { id: string; full_name: string; profile_photo_url: string | null };
  lastMessage: {
    content: string;
    is_undecryptable: boolean;
    is_deleted: boolean;
    sender_id: string;
    read_at: string | null;
    created_at: string;
    attachment_kind: AttachmentKind | null;
  } | null;
  unreadCount: number;
};

export async function listConversations(): Promise<ConversationSummary[]> {
  const me = await currentUserId();

  const { data: rows, error } = await supabase
    .from("conversations")
    .select("id, participant_one_id, participant_two_id, last_message_at")
    .or(`participant_one_id.eq.${me},participant_two_id.eq.${me}`)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  if (!rows.length) return [];

  const otherIds = rows.map((r) => (r.participant_one_id === me ? r.participant_two_id : r.participant_one_id));
  const conversationIds = rows.map((r) => r.id);

  const [profilesResult, lastMessagesResult, unreadResult] = await Promise.all([
    supabase.from("public_advocate_profiles").select("id, full_name, profile_photo_url, messaging_public_key").in("id", otherIds),
    supabase
      .from("messages")
      .select("conversation_id, content, nonce, is_deleted, sender_id, read_at, created_at, attachment_kind")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .is("read_at", null)
      .neq("sender_id", me),
  ]);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (lastMessagesResult.error) throw new Error(lastMessagesResult.error.message);
  if (unreadResult.error) throw new Error(unreadResult.error.message);

  const profileById = new Map(profilesResult.data.map((p) => [p.id, p]));
  const lastMessageByConversation = new Map<string, (typeof lastMessagesResult.data)[number]>();
  for (const m of lastMessagesResult.data) {
    if (!lastMessageByConversation.has(m.conversation_id)) lastMessageByConversation.set(m.conversation_id, m);
  }
  const unreadCountByConversation = new Map<string, number>();
  for (const m of unreadResult.data) {
    unreadCountByConversation.set(m.conversation_id, (unreadCountByConversation.get(m.conversation_id) ?? 0) + 1);
  }
  // Public keys came back in the same batched profile query above — no
  // per-partner round trip needed.
  const publicKeyByOtherId = new Map(profilesResult.data.map((p) => [p.id, p.messaging_public_key ?? null]));

  return Promise.all(
    rows.map(async (r) => {
      const otherId = r.participant_one_id === me ? r.participant_two_id : r.participant_one_id;
      const profile = profileById.get(otherId);
      if (!profile) return null;
      const { messaging_public_key: _messagingPublicKey, ...otherParty } = profile;
      const lastMessage = lastMessageByConversation.get(r.id) ?? null;
      const decrypted = lastMessage
        ? await decryptText(lastMessage.content, lastMessage.nonce, publicKeyByOtherId.get(otherId) ?? null)
        : null;
      return {
        id: r.id,
        last_message_at: r.last_message_at,
        otherParty,
        lastMessage: lastMessage && decrypted
          ? {
              content: decrypted.content,
              is_undecryptable: decrypted.undecryptable,
              is_deleted: lastMessage.is_deleted,
              sender_id: lastMessage.sender_id,
              read_at: lastMessage.read_at,
              created_at: lastMessage.created_at,
              attachment_kind: lastMessage.attachment_kind as AttachmentKind | null,
            }
          : null,
        unreadCount: unreadCountByConversation.get(r.id) ?? 0,
      };
    })
  ).then((list) => list.filter((c): c is ConversationSummary => c !== null));
}

/** Finds or creates the 1-to-1 conversation with a connected advocate. */
export async function getOrCreateConversation(otherId: string): Promise<string> {
  const me = await currentUserId();

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(participant_one_id.eq.${me},participant_two_id.eq.${otherId}),and(participant_one_id.eq.${otherId},participant_two_id.eq.${me})`
    )
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({ participant_one_id: me, participant_two_id: otherId })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  return created.id;
}

export async function getConversationOtherParty(conversationId: string): Promise<string> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from("conversations")
    .select("participant_one_id, participant_two_id")
    .eq("id", conversationId)
    .single();
  if (error) throw new Error(error.message);
  return data.participant_one_id === me ? data.participant_two_id : data.participant_one_id;
}

export type AttachmentKind = "image" | "file";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  /** True when `content` is an explanatory placeholder (a different key/
   * device decrypted it, or the other person hasn't enabled secure
   * messaging), not the real message — the UI must never treat this as
   * normal chat content. Always false for a message sent from this device. */
  is_undecryptable: boolean;
  is_deleted: boolean;
  read_at: string | null;
  created_at: string;
  edited_at: string | null;
  reply_to_id: string | null;
  attachment_path: string | null;
  attachment_kind: AttachmentKind | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
};

const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, content, nonce, is_deleted, read_at, created_at, edited_at, reply_to_id, attachment_path, attachment_kind, attachment_name, attachment_size, attachment_mime";

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = data as EncryptedMessageRow[];
  if (!rows.length) return [];
  const otherPartyPublicKey = await getPublicKey(await getConversationOtherParty(conversationId));
  return Promise.all(rows.map((row) => decryptRow(row, otherPartyPublicKey)));
}

export type Attachment = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  kind: AttachmentKind;
};

async function uploadAttachment(conversationId: string, file: Attachment): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  // First folder = conversation id: that's what the storage policies check.
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: "base64" });
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, decode(base64), { contentType: file.mimeType });
  if (error) throw new Error(error.message);
  return path;
}

export async function sendMessage(
  conversationId: string,
  content: string,
  options: { replyToId?: string | null; attachment?: Attachment | null } = {}
): Promise<Message> {
  const me = await currentUserId();
  const attachment = options.attachment ?? null;
  const path = attachment ? await uploadAttachment(conversationId, attachment) : null;
  const trimmed = content.trim();

  let sealedContent = "";
  let nonce: string | null = null;
  if (trimmed) {
    const otherPartyPublicKey = await getPublicKey(await getConversationOtherParty(conversationId));
    if (!otherPartyPublicKey) {
      if (path) await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
      throw new Error("This advocate hasn't enabled secure messaging yet — ask them to open the app once, then try again.");
    }
    const sealed = await encryptForRecipient(trimmed, otherPartyPublicKey);
    sealedContent = sealed.content;
    nonce = sealed.nonce;
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: me,
      content: sealedContent,
      nonce,
      reply_to_id: options.replyToId ?? null,
      attachment_path: path,
      attachment_kind: attachment?.kind ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_mime: attachment?.mimeType ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    if (path) await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  // We already know the plaintext we just sent — no need to decrypt our own message.
  const { nonce: _nonce, ...saved } = data as EncryptedMessageRow;
  return { ...saved, content: trimmed, is_undecryptable: false };
}

/** conversationId is needed to look up the recipient's public key to
 * re-encrypt the edited text. */
export async function editMessage(conversationId: string, id: string, content: string): Promise<void> {
  const trimmed = content.trim();
  const otherPartyPublicKey = await getPublicKey(await getConversationOtherParty(conversationId));
  if (!otherPartyPublicKey) throw new Error("This advocate hasn't enabled secure messaging yet.");
  const sealed = await encryptForRecipient(trimmed, otherPartyPublicKey);
  const { error } = await supabase
    .from("messages")
    .update({ content: sealed.content, nonce: sealed.nonce, edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

const signedUrlCache = new Map<string, { url: string; expires: number }>();

/** Short-lived signed URL for a chat photo/file (the bucket is private). */
export async function getAttachmentUrl(path: string): Promise<string> {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** Live updates for one chat: new/edited/read messages from Postgres, plus
 * the other person's typing state over a broadcast channel. */
export function subscribeToConversation(
  conversationId: string,
  handlers: { onUpsert: (message: Message) => void; onTyping: (userId: string, isTyping: boolean) => void }
) {
  // Resolved once and reused for every incoming row on this channel.
  const otherPartyPublicKey = getConversationOtherParty(conversationId).then(getPublicKey);

  const channel = supabase
    .channel(`chat:${conversationId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      async (payload) => {
        if (payload.new && "id" in payload.new) {
          const decrypted = await decryptRow(payload.new as EncryptedMessageRow, await otherPartyPublicKey);
          handlers.onUpsert(decrypted);
        }
      }
    )
    .on("broadcast", { event: "typing" }, ({ payload }) => handlers.onTyping(payload.userId, payload.isTyping))
    .subscribe();

  return {
    sendTyping: (userId: string, isTyping: boolean) =>
      channel.send({ type: "broadcast", event: "typing", payload: { userId, isTyping } }),
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

/** Fires whenever a message in one of the caller's own conversations is
 * added or changes, so the chat list can refresh previews, ticks and
 * unread counts live. Scoped with an `in.(...)` filter to just the
 * caller's conversation ids — subscribing to the whole `messages` table
 * with no filter at all (the previous version) meant the realtime server
 * had to evaluate every message anyone on the platform sent against every
 * connected client, which doesn't hold up under real traffic. A
 * conversation started after this subscribes won't be covered until the
 * next call — acceptable since the screen re-subscribes on every focus
 * and starting a new conversation is rare next to sending messages in
 * existing ones. */
export function subscribeToMyMessages(onChange: () => void) {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let cancelled = false;

  currentUserId()
    .then((me) =>
      supabase
        .from("conversations")
        .select("id")
        .or(`participant_one_id.eq.${me},participant_two_id.eq.${me}`)
        .limit(100),
    )
    .then(({ data }) => {
      if (cancelled || !data || data.length === 0) return;
      const ids = data.map((c) => c.id).join(",");
      channel = supabase
        .channel(`chat-list:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=in.(${ids})` }, onChange)
        .subscribe();
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    if (channel) supabase.removeChannel(channel);
  };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", me)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

/** Delete for everyone: the bubble stays as "This message was deleted" and
 * any photo/file is removed from storage. */
export async function deleteMessage(message: Pick<Message, "id" | "attachment_path">): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({
      is_deleted: true,
      content: "[deleted]",
      nonce: null,
      attachment_path: null,
      attachment_kind: null,
      attachment_name: null,
      attachment_size: null,
      attachment_mime: null,
    })
    .eq("id", message.id);
  if (error) throw new Error(error.message);
  if (message.attachment_path) await supabase.storage.from(ATTACHMENT_BUCKET).remove([message.attachment_path]);
}

export type ChatPartner = { id: string; full_name: string; profile_photo_url: string | null };

/** The other participant's public name and photo, for the chat header. */
export async function getChatPartner(conversationId: string): Promise<ChatPartner> {
  const otherId = await getConversationOtherParty(conversationId);
  const { data, error } = await supabase
    .from("public_advocate_profiles")
    .select("id, full_name, profile_photo_url")
    .eq("id", otherId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ChatPartner | null) ?? { id: otherId, full_name: "Advocate", profile_photo_url: null };
}
