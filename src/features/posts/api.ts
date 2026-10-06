import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/shared/lib/supabase";

const BUCKET = "post-images";
const VIDEO_BUCKET = "post-videos";
const ATTACHMENT_BUCKET = "post-attachments";
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type PostAttachment = {
  id: string;
  post_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
};

export type FeedPost = {
  id: string;
  author_id: string;
  content: string;
  image_path: string | null;
  video_path: string | null;
  created_at: string;
  updated_at: string;
  author: {
    full_name: string;
    profile_photo_url: string | null;
    headline?: string | null;
    city?: string | null;
    is_verified?: boolean;
  } | null;
  attachments: PostAttachment[];
  /** Endorsements (the column predates hearts, hence the name). */
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  hearts_count: number;
  hearted_by_me: boolean;
  eyes_count: number;
  eyed_by_me: boolean;
  pray_count: number;
  prayed_by_me: boolean;
  share_count: number;
};

export type ReactionKind = "endorse" | "heart" | "eyes" | "pray";

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
  return data.user.id;
}

export function getPublicImageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function getPublicVideoUrl(path: string): string {
  return supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function getPublicAttachmentUrl(path: string): string {
  return supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Streams a (large) file straight from disk to Storage, instead of loading
 * it into memory as base64 like small images. */
async function uploadFileFromDisk(bucket: string, path: string, uri: string, contentType: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const result = await FileSystem.uploadAsync(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      "Content-Type": contentType,
      "x-upsert": "false",
    },
  });
  if (result.status < 200 || result.status >= 300) {
    const tooLarge = result.status === 413 || /too large|maximum allowed size/i.test(result.body);
    throw new Error(tooLarge ? "This video is larger than the upload limit (50 MB)." : `Upload failed (${result.status})`);
  }
}

export async function listFeed(): Promise<FeedPost[]> {
  const me = await currentUserId();

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, author_id, content, image_path, video_path, created_at, updated_at, share_count")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  if (!posts.length) return [];

  const postIds = posts.map((p) => p.id);
  const authorIds = [...new Set(posts.map((p) => p.author_id))];

  // Author display info, stats, and "did I like this" are each fetched
  // separately and merged client-side rather than embedded — see
  // features/network/api.ts for why: PostgREST embedding through the
  // posts.author_id FK would hit the private advocate_profiles table's
  // owner-only RLS and come back null for every author but me.
  const [authorsResult, statsResult, myReactionsResult, attachmentsResult] = await Promise.all([
    supabase
      .from("public_advocate_profiles")
      .select("id, full_name, profile_photo_url, headline, city, is_verified")
      .in("id", authorIds),
    supabase
      .from("post_stats")
      .select("post_id, likes_count, comments_count, hearts_count, eyes_count, pray_count")
      .in("post_id", postIds),
    supabase.from("reactions").select("post_id, kind").eq("user_id", me).in("post_id", postIds),
    supabase.from("post_attachments").select("id, post_id, file_path, file_name, file_size, mime_type").in("post_id", postIds),
  ]);
  if (authorsResult.error) throw new Error(authorsResult.error.message);
  if (statsResult.error) throw new Error(statsResult.error.message);
  if (myReactionsResult.error) throw new Error(myReactionsResult.error.message);
  if (attachmentsResult.error) throw new Error(attachmentsResult.error.message);

  const authorById = new Map(authorsResult.data.map((a) => [a.id, a]));
  const statsByPostId = new Map(statsResult.data.map((s) => [s.post_id, s]));
  const myKindsByPostId = new Map<string, Set<ReactionKind>>();
  for (const r of myReactionsResult.data) {
    const set = myKindsByPostId.get(r.post_id) ?? new Set<ReactionKind>();
    set.add(r.kind as ReactionKind);
    myKindsByPostId.set(r.post_id, set);
  }
  const attachmentsByPostId = new Map<string, PostAttachment[]>();
  for (const a of attachmentsResult.data) {
    const list = attachmentsByPostId.get(a.post_id) ?? [];
    list.push(a);
    attachmentsByPostId.set(a.post_id, list);
  }

  return posts.map((p) => {
    const stats = statsByPostId.get(p.id);
    const mine = myKindsByPostId.get(p.id);
    return {
      ...p,
      author: authorById.get(p.author_id) ?? null,
      attachments: attachmentsByPostId.get(p.id) ?? [],
      likes_count: stats?.likes_count ?? 0,
      comments_count: stats?.comments_count ?? 0,
      liked_by_me: mine?.has("endorse") ?? false,
      hearts_count: stats?.hearts_count ?? 0,
      hearted_by_me: mine?.has("heart") ?? false,
      eyes_count: stats?.eyes_count ?? 0,
      eyed_by_me: mine?.has("eyes") ?? false,
      pray_count: stats?.pray_count ?? 0,
      prayed_by_me: mine?.has("pray") ?? false,
    };
  });
}

export async function getPost(postId: string): Promise<FeedPost | null> {
  const me = await currentUserId();

  const { data: post, error } = await supabase
    .from("posts")
    .select("id, author_id, content, image_path, video_path, created_at, updated_at, share_count")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) return null;

  const [authorResult, statsResult, myReactionResult, attachmentsResult] = await Promise.all([
    supabase.from("public_advocate_profiles").select("id, full_name, profile_photo_url").eq("id", post.author_id).maybeSingle(),
    supabase.from("post_stats").select("likes_count, comments_count, hearts_count, eyes_count, pray_count").eq("post_id", postId).single(),
    supabase.from("reactions").select("kind").eq("user_id", me).eq("post_id", postId),
    supabase.from("post_attachments").select("id, post_id, file_path, file_name, file_size, mime_type").eq("post_id", postId),
  ]);
  if (authorResult.error) throw new Error(authorResult.error.message);
  if (statsResult.error) throw new Error(statsResult.error.message);
  if (myReactionResult.error) throw new Error(myReactionResult.error.message);
  if (attachmentsResult.error) throw new Error(attachmentsResult.error.message);

  return {
    ...post,
    author: authorResult.data,
    attachments: attachmentsResult.data,
    likes_count: statsResult.data.likes_count,
    comments_count: statsResult.data.comments_count,
    liked_by_me: myReactionResult.data.some((r) => r.kind === "endorse"),
    hearts_count: statsResult.data.hearts_count,
    hearted_by_me: myReactionResult.data.some((r) => r.kind === "heart"),
    eyes_count: statsResult.data.eyes_count,
    eyed_by_me: myReactionResult.data.some((r) => r.kind === "eyes"),
    pray_count: statsResult.data.pray_count,
    prayed_by_me: myReactionResult.data.some((r) => r.kind === "pray"),
  };
}

export type PickedFile = { uri: string; name: string; mimeType?: string; size?: number };

export async function createPost(input: {
  content: string;
  imageUri?: string;
  imageMimeType?: string;
  video?: { uri: string; mimeType?: string; size?: number } | null;
  files?: PickedFile[];
}): Promise<void> {
  const me = await currentUserId();

  let imagePath: string | null = null;
  if (input.imageUri) {
    const ext = input.imageMimeType?.split("/")[1] ?? "jpg";
    imagePath = `${me}/${Date.now()}.${ext}`;
    const base64 = await FileSystem.readAsStringAsync(input.imageUri, { encoding: "base64" });
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(imagePath, decode(base64), { contentType: input.imageMimeType ?? "image/jpeg" });
    if (uploadError) throw new Error(uploadError.message);
  }

  let videoPath: string | null = null;
  if (input.video) {
    if (input.video.size && input.video.size > MAX_VIDEO_BYTES) throw new Error("Videos must be smaller than 50 MB.");
    const mime = input.video.mimeType ?? "video/mp4";
    const ext = mime.split("/")[1]?.replace("quicktime", "mov") ?? "mp4";
    videoPath = `${me}/${Date.now()}.${ext}`;
    await uploadFileFromDisk(VIDEO_BUCKET, videoPath, input.video.uri, mime);
  }

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      author_id: me,
      content: input.content.trim(),
      image_path: imagePath,
      video_path: videoPath,
    })
    .select("id")
    .single();
  if (error) {
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    if (videoPath) await supabase.storage.from(VIDEO_BUCKET).remove([videoPath]);
    throw new Error(error.message);
  }

  const files = input.files ?? [];
  if (files.length) {
    try {
      await Promise.all(files.map((f) => addPostAttachment(post.id, me, f)));
    } catch (err) {
      await deletePost({ id: post.id, image_path: imagePath, video_path: videoPath });
      throw err;
    }
  }
}

async function addPostAttachment(postId: string, authorId: string, file: PickedFile): Promise<void> {
  if (file.size && file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is larger than the 20 MB attachment limit.`);
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const path = `${authorId}/${postId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: "base64" });
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, decode(base64), { contentType: file.mimeType ?? "application/octet-stream" });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase
    .from("post_attachments")
    .insert({ post_id: postId, file_path: path, file_name: file.name, file_size: file.size ?? null, mime_type: file.mimeType ?? null });
  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

/** A post counts as edited when it changed after publishing (a small grace
 * window absorbs the insert-time trigger). */
/** A post or comment counts as edited when it changed after publishing (a
 * small grace window absorbs the insert-time trigger). */
export function isEdited(item: { created_at: string; updated_at: string }): boolean {
  return new Date(item.updated_at).getTime() - new Date(item.created_at).getTime() > 5000;
}

export async function updatePost(id: string, content: string): Promise<{ content: string; updated_at: string }> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Post can't be empty");
  const { data, error } = await supabase
    .from("posts")
    .update({ content: trimmed })
    .eq("id", id)
    .select("content, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Deletes a post and its image / video / attachment files. */
export async function deletePost(post: Pick<FeedPost, "id" | "image_path" | "video_path"> & { attachments?: PostAttachment[] }): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", post.id);
  if (error) throw new Error(error.message);
  if (post.image_path) await supabase.storage.from(BUCKET).remove([post.image_path]);
  if (post.video_path) await supabase.storage.from(VIDEO_BUCKET).remove([post.video_path]);
  if (post.attachments?.length) await supabase.storage.from(ATTACHMENT_BUCKET).remove(post.attachments.map((a) => a.file_path));
}

export async function toggleReaction(postId: string, kind: ReactionKind, currentlyOn: boolean): Promise<void> {
  const me = await currentUserId();
  if (currentlyOn) {
    const { error } = await supabase.from("reactions").delete().eq("post_id", postId).eq("user_id", me).eq("kind", kind);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("reactions").insert({ post_id: postId, user_id: me, kind });
    if (error) throw new Error(error.message);
  }
}

/** Endorse / un-endorse. */
export function toggleLike(postId: string, currentlyLiked: boolean): Promise<void> {
  return toggleReaction(postId, "endorse", currentlyLiked);
}

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: { full_name: string; profile_photo_url: string | null } | null;
  likes_count: number;
  liked_by_me: boolean;
  hearts_count: number;
  hearted_by_me: boolean;
  eyes_count: number;
  eyed_by_me: boolean;
  pray_count: number;
  prayed_by_me: boolean;
};

export async function listComments(postId: string): Promise<PostComment[]> {
  const me = await currentUserId();

  const { data: comments, error } = await supabase
    .from("comments")
    .select("id, post_id, author_id, content, created_at, updated_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!comments.length) return [];

  const commentIds = comments.map((c) => c.id);
  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const [authorsResult, statsResult, myReactionsResult] = await Promise.all([
    supabase.from("public_advocate_profiles").select("id, full_name, profile_photo_url").in("id", authorIds),
    supabase.from("comment_stats").select("comment_id, likes_count, hearts_count, eyes_count, pray_count").in("comment_id", commentIds),
    supabase.from("comment_reactions").select("comment_id, kind").eq("user_id", me).in("comment_id", commentIds),
  ]);
  if (authorsResult.error) throw new Error(authorsResult.error.message);
  if (statsResult.error) throw new Error(statsResult.error.message);
  if (myReactionsResult.error) throw new Error(myReactionsResult.error.message);

  const authorById = new Map(authorsResult.data.map((a) => [a.id, a]));
  const statsByCommentId = new Map(statsResult.data.map((s) => [s.comment_id, s]));
  const myKindsByCommentId = new Map<string, Set<ReactionKind>>();
  for (const r of myReactionsResult.data) {
    const set = myKindsByCommentId.get(r.comment_id) ?? new Set<ReactionKind>();
    set.add(r.kind as ReactionKind);
    myKindsByCommentId.set(r.comment_id, set);
  }

  return comments.map((c) => {
    const stats = statsByCommentId.get(c.id);
    const mine = myKindsByCommentId.get(c.id);
    return {
      ...c,
      author: authorById.get(c.author_id) ?? null,
      likes_count: stats?.likes_count ?? 0,
      liked_by_me: mine?.has("endorse") ?? false,
      hearts_count: stats?.hearts_count ?? 0,
      hearted_by_me: mine?.has("heart") ?? false,
      eyes_count: stats?.eyes_count ?? 0,
      eyed_by_me: mine?.has("eyes") ?? false,
      pray_count: stats?.pray_count ?? 0,
      prayed_by_me: mine?.has("pray") ?? false,
    };
  });
}

export async function addComment(postId: string, content: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: me, content: content.trim() });
  if (error) throw new Error(error.message);
}

export async function updateComment(id: string, content: string): Promise<{ content: string; updated_at: string }> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Comment can't be empty");
  const { data, error } = await supabase.from("comments").update({ content: trimmed }).eq("id", id).select("content, updated_at").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleCommentReaction(commentId: string, kind: ReactionKind, currentlyOn: boolean): Promise<void> {
  const me = await currentUserId();
  if (currentlyOn) {
    const { error } = await supabase.from("comment_reactions").delete().eq("comment_id", commentId).eq("user_id", me).eq("kind", kind);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("comment_reactions").insert({ comment_id: commentId, user_id: me, kind });
    if (error) throw new Error(error.message);
  }
}

/** Live updates for one post's reply thread: new/edited/deleted comments
 * over Postgres changes, plus who's currently drafting a reply over a
 * broadcast channel — the same pattern used for direct-message typing
 * (features/messaging/api). */
export function subscribeToPostComments(
  postId: string,
  handlers: { onChange: () => void; onTyping: (userId: string, name: string, isTyping: boolean) => void }
) {
  const channel = supabase
    .channel(`post-comments:${postId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => handlers.onChange())
    .on("broadcast", { event: "typing" }, ({ payload }) => handlers.onTyping(payload.userId, payload.name, payload.isTyping))
    .subscribe();

  return {
    sendTyping: (userId: string, name: string, isTyping: boolean) =>
      channel.send({ type: "broadcast", event: "typing", payload: { userId, name, isTyping } }),
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
