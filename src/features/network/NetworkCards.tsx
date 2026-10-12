import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  addComment,
  deleteComment,
  deletePost,
  FeedPost,
  getPublicAttachmentUrl,
  getPublicImageUrl,
  isEdited,
  listComments,
  PostAttachment,
  PostComment,
  ReactionKind,
  subscribeToPostComments,
  toggleCommentReaction,
  updateComment,
  updatePost,
} from "@/features/posts/api";
import { getMyProfile } from "@/features/profile/api";
import { OnlineDot } from "@/features/presence/OnlineDot";
import { ActionSheet, SheetAction } from "@/shared/ui/ActionSheet";
import { PostVideo } from "@/features/posts/PostVideo";
import { useTheme } from "@/shared/ui/theme";
import type { PublicProfile } from "./api";

/** Splits post/comment text on single-token @mentions ("@clivebixby") so
 * they can be rendered in the accent color, chat-app style. */
function renderWithMentions(text: string, mentionColor: string) {
  const parts = text.split(/(@[A-Za-z0-9_]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <Text key={i} style={{ color: mentionColor, fontWeight: "700" }}>
        {part}
      </Text>
    ) : (
      <Text key={i}>{part}</Text>
    )
  );
}

/** Small colored tile + filename for one attached file, keyed off extension. */
function fileKind(name: string, mime: string | null): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return { icon: "image-outline", color: "#2563EB" };
  if (ext === "pdf") return { icon: "document-text-outline", color: "#DC2626" };
  if (["ppt", "pptx"].includes(ext) || mime?.includes("presentation")) return { icon: "easel-outline", color: "#EA580C" };
  if (["xls", "xlsx", "csv"].includes(ext) || mime?.includes("spreadsheet")) return { icon: "grid-outline", color: "#16A34A" };
  if (["doc", "docx"].includes(ext) || mime?.includes("wordprocessing")) return { icon: "document-outline", color: "#2563EB" };
  return { icon: "document-attach-outline", color: "#64748B" };
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files-attached card: "N files" header + a tappable row per file. */
function AttachmentsCard({ files }: { files: PostAttachment[] }) {
  const { colors, spacing, radius, typography } = useTheme();
  if (!files.length) return null;
  return (
    <View style={[styles.filesCard, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm, gap: spacing.xs }]}>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>
        {files.length} file{files.length === 1 ? "" : "s"}
      </Text>
      {files.map((f) => {
        const { icon, color } = fileKind(f.file_name, f.mime_type);
        return (
          <Pressable
            key={f.id}
            onPress={() => Linking.openURL(getPublicAttachmentUrl(f.file_path))}
            style={({ pressed }) => [
              styles.fileRow,
              { backgroundColor: pressed ? colors.surface : "transparent", borderRadius: radius.sm, padding: spacing.xs },
            ]}
          >
            <View style={[styles.fileIcon, { backgroundColor: color + "1A", borderRadius: radius.sm }]}>
              <Ionicons name={icon} size={18} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.label, { color: colors.textPrimary }]} numberOfLines={1}>
                {f.file_name}
              </Text>
              {f.file_size ? <Text style={[typography.caption, { color: colors.textSecondary }]}>{formatFileSize(f.file_size)}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const REACTIONS: { kind: ReactionKind; emoji: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kind: "endorse", emoji: "\u{1F44D}", label: "Endorse", icon: "thumbs-up-outline" },
  { kind: "heart", emoji: "❤️", label: "Love", icon: "heart-outline" },
  { kind: "eyes", emoji: "\u{1F440}", label: "Noted", icon: "eye-outline" },
  { kind: "pray", emoji: "\u{1F64F}", label: "Thanks", icon: "hand-right-outline" },
];

/** Reaction pill row: only ever shows emojis someone has actually used —
 * tapping one removes your own reaction from it. */
function ReactionsRow({
  counts,
  mine,
  onToggle,
  compact,
}: {
  counts: Record<ReactionKind, number>;
  mine: Record<ReactionKind, boolean>;
  onToggle: (kind: ReactionKind) => void;
  /** Smaller reaction pills for a comment row vs. a full post. */
  compact?: boolean;
}) {
  const { colors, radius, typography } = useTheme();

  return (
    <View style={styles.reactionsRow}>
      {REACTIONS.map(({ kind, emoji }) => {
        const count = counts[kind];
        const active = mine[kind];
        if (count === 0) return null;
        return (
          <Pressable
            key={kind}
            onPress={() => onToggle(kind)}
            style={({ pressed }) => [
              compact ? styles.reactionPillCompact : styles.reactionPill,
              {
                borderRadius: radius.pill,
                backgroundColor: active ? colors.brand + "26" : colors.surfaceAlt,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: compact ? 11 : 13 }}>{emoji}</Text>
            <Text style={[compact ? typography.caption : typography.label, { color: active ? colors.brand : colors.textSecondary }]}>{count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "2.1K" style compact count. */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Flat like/comment stat row under a post — a plain icon + count per stat,
 * no pill backgrounds. Tapping the like stat quick-reacts (endorse);
 * long-pressing it opens the full emoji tray. */
function PostStatsRow({
  reactionsTotal,
  myReactionActive,
  commentsCount,
  onLikePress,
  onCommentPress,
}: {
  reactionsTotal: number;
  myReactionActive: boolean;
  commentsCount: number;
  onLikePress: () => void;
  onCommentPress: () => void;
}) {
  const { colors, typography } = useTheme();
  const stats: { key: string; icon: keyof typeof Ionicons.glyphMap; count: number; active?: boolean; onPress: () => void; a11y: string }[] = [
    { key: "like", icon: myReactionActive ? "thumbs-up" : "thumbs-up-outline", count: reactionsTotal, active: myReactionActive, onPress: onLikePress, a11y: "React" },
    { key: "comment", icon: "chatbubble-outline", count: commentsCount, onPress: onCommentPress, a11y: "Comments" },
  ];
  return (
    <View style={styles.statsRow}>
      {stats.map((s) => (
        <Pressable
          key={s.key}
          onPress={s.onPress}
          hitSlop={6}
          accessibilityLabel={s.a11y}
          style={({ pressed }) => [styles.statItem, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name={s.icon} size={18} color={s.active ? colors.brand : colors.textSecondary} />
          {s.count > 0 ? (
            <Text style={[typography.label, { color: s.active ? colors.brand : colors.textSecondary }]}>{formatCount(s.count)}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function initials(name: string) {
  return name
    .replace(/^adv\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

export function Avatar({
  name,
  photoUrl,
  size = 48,
  verified,
  userId,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  verified?: boolean;
  /** When set, a green dot shows while this advocate is online. */
  userId?: string | null;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }]}>
          <Text style={[typography.bodyStrong, { color: colors.brand, fontSize: size * 0.34 }]}>{initials(name)}</Text>
        </View>
      )}
      {verified ? (
        <View style={[styles.verifiedBadge, { backgroundColor: colors.surface }]}>
          <Ionicons name="checkmark-circle" size={size * 0.3} color={colors.accent} />
        </View>
      ) : null}
      <OnlineDot userId={userId} avatarSize={size} />
    </View>
  );
}

/** Feed post styled as a professional note: gold accent rail, author
 * credentials row, body, and Endorse / Comment / Heart actions. Comments
 * open inline under the post rather than on a separate screen. */
export function PostCard({
  post,
  isOwn,
  onToggleEndorse,
  onToggleHeart,
  onToggleEyes,
  onTogglePray,
  onCommentAdded,
  onCommentRemoved,
  onEdited,
  onDeleted,
}: {
  post: FeedPost;
  /** The signed-in advocate wrote this post — enables Edit / Delete. */
  isOwn: boolean;
  onToggleEndorse: () => void;
  onToggleHeart: () => void;
  onToggleEyes: () => void;
  onTogglePray: () => void;
  onCommentAdded: () => void;
  onCommentRemoved: () => void;
  onEdited: (update: { content: string; updated_at: string }) => void;
  onDeleted: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const author = post.author;
  const name = author?.full_name ?? "Advocate";
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const reactWith = (kind: ReactionKind) =>
    kind === "endorse" ? onToggleEndorse() : kind === "heart" ? onToggleHeart() : kind === "eyes" ? onToggleEyes() : onTogglePray();

  const [draft, setDraft] = useState(post.content);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setDraft(post.content);
    setIsEditing(true);
  };

  const saveEdit = async () => {
    const text = draft.trim();
    if (!text || isSaving) return;
    if (text === post.content) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      onEdited(await updatePost(post.id, text));
      setIsEditing(false);
    } catch (err) {
      Alert.alert("Couldn't update post", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert("Delete this post?", "It will be removed from the feed for everyone, along with its comments and reactions. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePost(post);
            onDeleted();
          } catch (err) {
            Alert.alert("Couldn't delete post", err instanceof Error ? err.message : "Something went wrong");
          }
        },
      },
    ]);

  const menuActions: SheetAction[] = isOwn
    ? [
        { label: "Edit post", icon: "create-outline", onPress: startEditing },
        { label: "Delete post", icon: "trash-outline", onPress: confirmDelete },
      ]
    : [
        { label: "View author's profile", icon: "person-outline", onPress: () => router.push(`/(app)/network/${post.author_id}`) },
        {
          label: "Report post",
          icon: "flag-outline",
          onPress: () => router.push(`/(app)/reports/new?targetType=post&targetId=${post.id}&label=post`),
        },
      ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }]}>
      <View style={[styles.accentRail, { backgroundColor: colors.accent }]} />

      <View style={styles.authorRow}>
        <Pressable
          onPress={() => router.push(`/(app)/network/${post.author_id}`)}
          style={[styles.authorRow, { flex: 1, gap: spacing.sm }]}
        >
          <Avatar name={name} photoUrl={author?.profile_photo_url} verified={author?.is_verified} userId={post.author_id} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[typography.bodyStrong, { color: colors.brand, flexShrink: 1 }]} numberOfLines={1}>
                {withAdvPrefix(name)}
              </Text>
              {author?.is_verified ? <Ionicons name="shield-checkmark" size={13} color={colors.accent} /> : null}
            </View>
            {author?.headline ? (
              <Text style={[typography.caption, { color: colors.accent, fontWeight: "600" }]} numberOfLines={1}>
                {author.headline}
              </Text>
            ) : null}
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {timeAgo(post.created_at)}
              {author?.city ? ` • ${author.city}` : ""}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityLabel="Post options">
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {isEditing ? (
        <View style={[styles.editRow, { borderColor: colors.brand, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.background }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            maxLength={3000}
            style={[typography.body, { flex: 1, color: colors.textPrimary, lineHeight: 22, paddingVertical: 8 }]}
          />
          <View style={styles.editButtons}>
            <Pressable onPress={() => setIsEditing(false)} hitSlop={8} accessibilityLabel="Cancel editing">
              <Ionicons name="close-circle-outline" size={26} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={saveEdit}
              disabled={!draft.trim() || isSaving}
              hitSlop={8}
              accessibilityLabel="Post changes"
              style={[styles.postIcon, { backgroundColor: draft.trim() ? colors.brand : colors.border }]}
            >
              {isSaving ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Ionicons name="send" size={16} color={colors.textInverse} />}
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={[typography.body, { color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 22 }]}>
          {renderWithMentions(post.content, colors.brand)}
        </Text>
      )}
      {!isEditing && isEdited(post) ? (
        <View style={[styles.editedTag, { marginTop: 4 }]}>
          <Ionicons name="pencil" size={12} color={colors.textSecondary} />
          <Text style={[typography.caption, { color: colors.textSecondary, fontStyle: "italic" }]}>Edited</Text>
        </View>
      ) : null}
      {post.image_path ? (
        <Image
          source={{ uri: getPublicImageUrl(post.image_path) }}
          style={{ width: "100%", height: 190, borderRadius: radius.sm, marginTop: spacing.sm }}
          resizeMode="cover"
        />
      ) : null}
      {post.video_path ? (
        <View style={{ marginTop: spacing.sm }}>
          <PostVideo path={post.video_path} height={210} borderRadius={radius.sm} />
        </View>
      ) : null}

      <AttachmentsCard files={post.attachments} />

      <View style={[styles.actions, { borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.sm }]}>
        <PostStatsRow
          reactionsTotal={post.likes_count + post.hearts_count + post.eyes_count + post.pray_count}
          myReactionActive={post.liked_by_me || post.hearted_by_me || post.eyed_by_me || post.prayed_by_me}
          commentsCount={post.comments_count}
          onLikePress={() => reactWith("endorse")}
          onCommentPress={() => setCommentsOpen((open) => !open)}
        />
      </View>

      {commentsOpen ? <InlineComments postId={post.id} onAdded={onCommentAdded} onRemoved={onCommentRemoved} /> : null}

      <ActionSheet visible={menuOpen} title={isOwn ? "Your post" : name} actions={menuActions} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

/** "5 replies from Dom, Alice, Matt, and others" — Slack-thread style. */
function repliesSummary(names: string[]): string {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, 2);
  const rest = unique.length - shown.length;
  const who = rest > 0 ? `${shown.join(", ")}, and others` : shown.length === 2 ? shown.join(" and ") : shown[0];
  return `${names.length} ${names.length === 1 ? "reply" : "replies"} from ${who}`;
}

/** Comment thread + reply box, expanded in place under a post. Starts
 * collapsed to an avatar stack + summary (chat-thread style) once there are
 * replies, streams in new ones live, and shows who's currently typing. */
function InlineComments({ postId, onAdded, onRemoved }: { postId: string; onAdded: () => void; onRemoved: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [typingNames, setTypingNames] = useState<Map<string, string>>(new Map());
  const meRef = useRef<{ id: string; name: string } | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof subscribeToPostComments> | null>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const othersTypingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refresh = () => listComments(postId).then(setComments).catch(() => setComments((prev) => prev ?? []));

  useEffect(() => {
    let isMounted = true;
    getMyProfile()
      .then((me) => {
        if (!isMounted) return;
        meRef.current = { id: me.id, name: me.full_name };
        setMyId(me.id);
      })
      .catch(() => {});
    refresh();

    const channel = subscribeToPostComments(postId, {
      onChange: refresh,
      onTyping: (userId, name, isTyping) => {
        if (userId === meRef.current?.id) return;
        setTypingNames((prev) => {
          const next = new Map(prev);
          if (isTyping) next.set(userId, name);
          else next.delete(userId);
          return next;
        });
        const timers = othersTypingTimers.current;
        clearTimeout(timers.get(userId));
        if (isTyping) {
          timers.set(
            userId,
            setTimeout(() => setTypingNames((prev) => { const next = new Map(prev); next.delete(userId); return next; }), 5000)
          );
        }
      },
    });
    channelRef.current = channel;
    const timers = othersTypingTimers.current;

    return () => {
      isMounted = false;
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      timers.forEach(clearTimeout);
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    const me = meRef.current;
    if (!me || !channelRef.current) return;
    channelRef.current.sendTyping(me.id, me.name, !!text.trim());
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (text.trim()) {
      typingStopTimer.current = setTimeout(() => channelRef.current?.sendTyping(me.id, me.name, false), 4000);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setIsSending(true);
    const me = meRef.current;
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (me) channelRef.current?.sendTyping(me.id, me.name, false);
    try {
      await addComment(postId, text);
      setDraft("");
      setExpanded(true);
      await refresh();
      onAdded();
    } catch (err) {
      Alert.alert("Couldn't post comment", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSending(false);
    }
  };

  const typingLine = [...typingNames.values()];

  return (
    <View style={[styles.comments, { borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.sm, gap: spacing.sm }]}>
      {comments === null ? (
        <ActivityIndicator color={colors.brand} />
      ) : comments.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textSecondary }]}>No replies yet. Start the discussion.</Text>
      ) : !expanded ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.threadSummary}>
          <View style={styles.avatarStack}>
            {comments.slice(-4).map((c, i) => (
              <View key={c.id} style={[styles.avatarStackItem, { borderColor: colors.surface, zIndex: i }]}>
                <Avatar name={c.author?.full_name ?? "Advocate"} photoUrl={c.author?.profile_photo_url} size={24} />
              </View>
            ))}
          </View>
          <Text style={[typography.label, { color: colors.brand }]}>{repliesSummary(comments.map((c) => c.author?.full_name ?? "Advocate"))}</Text>
        </Pressable>
      ) : (
        comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            isOwn={c.author_id === myId}
            onReaction={(kind) => {
              const currentlyOn = c[({ endorse: "liked_by_me", heart: "hearted_by_me", eyes: "eyed_by_me", pray: "prayed_by_me" } as const)[kind]];
              const countKey = ({ endorse: "likes_count", heart: "hearts_count", eyes: "eyes_count", pray: "pray_count" } as const)[kind];
              const flagKey = ({ endorse: "liked_by_me", heart: "hearted_by_me", eyes: "eyed_by_me", pray: "prayed_by_me" } as const)[kind];
              setComments((prev) =>
                prev?.map((x) => (x.id === c.id ? { ...x, [countKey]: x[countKey] + (currentlyOn ? -1 : 1), [flagKey]: !currentlyOn } : x)) ?? prev
              );
              toggleCommentReaction(c.id, kind, currentlyOn).catch(refresh);
            }}
            onEdited={(update) => setComments((prev) => prev?.map((x) => (x.id === c.id ? { ...x, ...update } : x)) ?? prev)}
            onDeleted={() => {
              setComments((prev) => prev?.filter((x) => x.id !== c.id) ?? prev);
              onRemoved();
            }}
          />
        ))
      )}

      {typingLine.length ? (
        <Text style={[typography.caption, { color: colors.textSecondary, fontStyle: "italic" }]}>
          {typingLine.join(", ")} {typingLine.length === 1 ? "is" : "are"} typing…
        </Text>
      ) : null}

      <View style={[styles.replyRow, { borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.background }]}>
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder="Write a comment…"
          placeholderTextColor={colors.textSecondary}
          style={[typography.body, { flex: 1, color: colors.textPrimary, paddingVertical: 8 }]}
          multiline
          onSubmitEditing={send}
        />
        <Pressable onPress={send} disabled={!draft.trim() || isSending} hitSlop={8} accessibilityLabel="Post comment">
          {isSending ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Ionicons name="send" size={20} color={draft.trim() ? colors.brand : colors.textSecondary} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** One reply bubble: author, editable content, its own reaction row, and
 * Edit/Delete for the commenter (Report for anyone else) — an improvised
 * take on the familiar social-app comment row, not a copy of any one app's. */
function CommentRow({
  comment,
  isOwn,
  onReaction,
  onEdited,
  onDeleted,
}: {
  comment: PostComment;
  isOwn: boolean;
  onReaction: (kind: ReactionKind) => void;
  onEdited: (update: { content: string; updated_at: string }) => void;
  onDeleted: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const commenter = comment.author?.full_name ?? "Advocate";
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [isSaving, setIsSaving] = useState(false);
  const mine: Record<ReactionKind, boolean> = {
    endorse: comment.liked_by_me,
    heart: comment.hearted_by_me,
    eyes: comment.eyed_by_me,
    pray: comment.prayed_by_me,
  };

  const saveEdit = async () => {
    const text = draft.trim();
    if (!text || isSaving) return;
    if (text === comment.content) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      onEdited(await updateComment(comment.id, text));
      setIsEditing(false);
    } catch (err) {
      Alert.alert("Couldn't update comment", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert("Delete this comment?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteComment(comment.id);
            onDeleted();
          } catch (err) {
            Alert.alert("Couldn't delete comment", err instanceof Error ? err.message : "Something went wrong");
          }
        },
      },
    ]);

  const menuActions: SheetAction[] = isOwn
    ? [
        { label: "Edit comment", icon: "create-outline", onPress: () => { setDraft(comment.content); setIsEditing(true); } },
        { label: "Delete comment", icon: "trash-outline", onPress: confirmDelete },
      ]
    : [
        {
          label: "Report comment",
          icon: "flag-outline",
          onPress: () => router.push(`/(app)/reports/new?targetType=comment&targetId=${comment.id}&label=comment`),
        },
      ];

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <Avatar name={commenter} photoUrl={comment.author?.profile_photo_url} size={30} userId={comment.author_id} />
      <View style={{ flex: 1 }}>
        <View style={[styles.commentBubble, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm }]}>
          <View style={styles.commentHeaderRow}>
            <Text style={[typography.label, { color: colors.brand, flex: 1 }]} numberOfLines={1}>
              {withAdvPrefix(commenter)}
            </Text>
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityLabel="Comment options">
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
          {isEditing ? (
            <View style={{ gap: spacing.xs }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                maxLength={1000}
                style={[typography.body, { color: colors.textPrimary, paddingVertical: 2 }]}
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.md }}>
                <Pressable onPress={() => setIsEditing(false)} accessibilityLabel="Cancel editing">
                  <Text style={[typography.label, { color: colors.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveEdit} disabled={!draft.trim() || isSaving} accessibilityLabel="Save comment">
                  {isSaving ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={[typography.label, { color: colors.brand }]}>Save</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <Text style={[typography.body, { color: colors.textPrimary, marginTop: 2 }]}>{renderWithMentions(comment.content, colors.brand)}</Text>
          )}
        </View>
        <View style={[styles.commentFooterRow, { marginTop: 2 }]}>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            {timeAgo(comment.created_at)}
            {isEdited(comment) ? " · Edited" : ""}
          </Text>
          {!isEditing ? (
            <Pressable onPress={() => onReaction("endorse")} hitSlop={6}>
              <Text style={[typography.label, { color: mine.endorse ? colors.brand : colors.textSecondary, fontWeight: mine.endorse ? "700" : "600" }]}>
                Like
              </Text>
            </Pressable>
          ) : null}
          {!isEditing ? (
            <ReactionsRow
              counts={{ endorse: comment.likes_count, heart: comment.hearts_count, eyes: comment.eyes_count, pray: comment.pray_count }}
              mine={mine}
              onToggle={onReaction}
              compact
            />
          ) : null}
        </View>
      </View>
      <ActionSheet visible={menuOpen} title={isOwn ? "Your comment" : commenter} actions={menuActions} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

export type ConnectStatus = "none" | "pending" | "accepted";

export function withAdvPrefix(name: string) {
  return /^adv\.?\s/i.test(name) ? name : `Adv. ${name}`;
}

/** Rounded-square portrait with a small credential badge in the corner. */
export function PortraitAvatar({
  name,
  photoUrl,
  size,
  verified,
  userId,
}: {
  name: string;
  photoUrl?: string | null;
  size: number;
  verified: boolean;
  userId?: string | null;
}) {
  const { colors, typography } = useTheme();
  const corner = size * 0.22;
  const badge = Math.round(size * 0.34);
  return (
    <View style={{ width: size, height: size }}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: size, height: size, borderRadius: corner }} />
      ) : (
        <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: corner, backgroundColor: colors.surfaceAlt }]}>
          <Text style={[typography.title, { color: colors.brand, fontSize: size * 0.32 }]}>{initials(name)}</Text>
        </View>
      )}
      <View
        style={[
          styles.portraitBadge,
          {
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            right: -badge * 0.2,
            top: -badge * 0.2,
            backgroundColor: verified ? colors.surface : "#F3D9A4",
            borderColor: colors.surface,
          },
        ]}
      >
        <Ionicons
          name={verified ? "shield-checkmark" : "briefcase"}
          size={badge * 0.58}
          color={verified ? colors.brand : "#5D4201"}
        />
      </View>
      <OnlineDot userId={userId} avatarSize={size} inset={size * 0.04} />
    </View>
  );
}

/** Name, speciality, experience/forum and tags — shared by the colleague
 * card and the full advocate profile so both read the same way. */
export function AdvocateIdentity({ profile, large = false }: { profile: PublicProfile; large?: boolean }) {
  const { colors, spacing, radius, typography } = useTheme();
  const specialty = profile.practice_areas[0] ?? profile.headline;
  const experience = [profile.years_of_experience ? `${profile.years_of_experience} yrs exp` : null, profile.city]
    .filter(Boolean)
    .join(" • ");
  const forum = profile.courts[0];
  const tags = [...profile.practice_areas.slice(1), ...profile.courts.slice(1)].slice(0, large ? 6 : 2);

  return (
    <View style={{ alignItems: "center" }}>
      <PortraitAvatar
        name={profile.full_name}
        photoUrl={profile.profile_photo_url}
        size={large ? 112 : 76}
        verified={profile.is_verified}
        userId={profile.id}
      />
      <Text
        style={[
          large ? typography.title : typography.subtitle,
          { color: colors.textPrimary, marginTop: spacing.md, textAlign: "center" },
        ]}
        numberOfLines={large ? 2 : 1}
      >
        {withAdvPrefix(profile.full_name)}
      </Text>
      {specialty ? (
        <Text
          style={[typography.label, { color: colors.accent, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4, textAlign: "center" }]}
          numberOfLines={1}
        >
          {specialty}
        </Text>
      ) : null}
      {experience ? (
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, textAlign: "center" }]} numberOfLines={1}>
          {experience}
        </Text>
      ) : null}
      {forum ? (
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center" }]} numberOfLines={1}>
          {forum}
        </Text>
      ) : null}
      {tags.length ? (
        <View style={[styles.tags, { marginTop: spacing.sm }]}>
          {tags.map((t, i) => (
            <View key={`${t}-${i}`} style={[styles.tag, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
              <Text style={[typography.label, { color: colors.brand }]} numberOfLines={1}>
                {t}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function mutualLabel(count: number | undefined) {
  if (count === undefined) return null;
  return count === 0 ? "No mutual connections yet" : `${count} Mutual Connection${count === 1 ? "" : "s"}`;
}

/** Full-width dark "+ Connect" button (or its pending/connected state). */
export function ConnectButton({ status, onPress, label }: { status: ConnectStatus; onPress: () => void; label?: string }) {
  const { colors, radius, typography } = useTheme();
  const isPrimary = status === "none";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.connectButton,
        {
          borderRadius: radius.sm,
          backgroundColor: isPrimary ? colors.textPrimary : colors.surfaceAlt,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons
        name={status === "accepted" ? "people" : status === "pending" ? "time-outline" : "person-add-outline"}
        size={18}
        color={isPrimary ? colors.background : colors.textSecondary}
      />
      <Text style={[typography.bodyStrong, { color: isPrimary ? colors.background : colors.textSecondary }]}>
        {label ?? (status === "accepted" ? "Connected" : status === "pending" ? "Requested" : "+ Connect")}
      </Text>
    </Pressable>
  );
}

/** Colleague card for the Discover carousel / grid. */
export function ColleagueCard({
  profile,
  status,
  onConnect,
  mutualCount,
  width,
}: {
  profile: PublicProfile;
  status: ConnectStatus;
  onConnect: () => void;
  mutualCount?: number;
  width?: number;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const mutual = mutualLabel(mutualCount);

  return (
    <Pressable
      onPress={() => router.push(`/(app)/network/${profile.id}`)}
      style={[
        styles.card,
        styles.colleague,
        { width, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, paddingTop: spacing.lg },
      ]}
    >
      <AdvocateIdentity profile={profile} />
      <View style={{ marginTop: spacing.md }}>
        {mutual ? (
          <Text style={[typography.label, { color: colors.textSecondary, textAlign: "center", marginBottom: spacing.sm }]}>{mutual}</Text>
        ) : null}
        <ConnectButton status={status} onPress={status === "none" ? onConnect : () => router.push(`/(app)/network/${profile.id}`)} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: "hidden",
  },
  accentRail: { position: "absolute", left: 0, top: 12, bottom: 12, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  authorRow: { flexDirection: "row", alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  verifiedBadge: {
    position: "absolute",
    right: -2,
    top: -2,
    borderRadius: 999,
    padding: 1,
  },
  actions: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  reactionPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5 },
  reactionPillCompact: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3 },
  statsRow: { flexDirection: "row", gap: 22 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentFooterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4 },
  filesCard: {},
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fileIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  comments: { borderTopWidth: StyleSheet.hairlineWidth },
  editRow: { flexDirection: "row", alignItems: "flex-end", borderWidth: 1.5, paddingLeft: 12, paddingRight: 8, paddingVertical: 4, gap: 8 },
  editButtons: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 6 },
  postIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  editedTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  commentBubble: { flex: 1 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  avatarStack: { flexDirection: "row" },
  avatarStackItem: { marginLeft: -10, borderWidth: 2 },
  threadSummary: { flexDirection: "row", alignItems: "center", gap: 8 },
  colleague: { justifyContent: "space-between" },
  tags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, maxWidth: 150 },
  connectButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46 },
  portraitBadge: { position: "absolute", alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
